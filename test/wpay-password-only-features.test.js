'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {requireTransactionPassword}=require('../lib/wpay/auth/runtime/transaction-password'),{sessionAssurance}=require('../lib/wpay/auth/runtime/session-assurance'),{liveSession,ABSOLUTE_MS}=require('../lib/wpay/auth/runtime/tokens');
const {DeviceSetup}=require('../lib/wpay/operations/device-setup');
function session(type,enabled){const now=Date.now();return {id:randomUUID(),account_type:type,status:'active',approval_status:'approved',mfa_enabled:enabled,auth_method:enabled?'mfa':'password',mfa_at:enabled?new Date(now-600000):null,password_at:enabled?null:new Date(now-600000),created_at:new Date(now-600000),last_seen_at:new Date(now-1000),expires_at:new Date(now-600000+ABSOLUTE_MS),database_now:new Date(now),revoked_at:null,session_epoch:1,current_session_epoch:1,security_version:1,session_security_version:1,factor_version:1,session_factor_version:1};}
test('MFA ON/OFF sessions stay valid but sensitive actions require recent password, never repeated OTP',()=>{
 for(const type of ['user','merchant','admin','super_admin','employee'])for(const enabled of [false,true]){const row=session(type,enabled);assert.equal(sessionAssurance(row),true);assert.equal(liveSession(row,+row.database_now),true);assert.throws(()=>requireTransactionPassword(row),{code:'RECENT_PASSWORD_REQUIRED'});row.transaction_password_at=row.database_now;assert.doesNotThrow(()=>requireTransactionPassword(row));assert.equal(row.mfa_enabled,enabled);}
 const employee=session('employee',true);assert.throws(()=>requireTransactionPassword(employee),{code:'RECENT_PASSWORD_REQUIRED'});
});
test('password-only sessions never bypass enabled MFA, revoked sessions or expiry',()=>{
 for(const type of ['user','merchant','admin','super_admin','employee']){const row=session(type,false);assert.equal(sessionAssurance({...row,mfa_enabled:true}),false);assert.equal(liveSession({...row,revoked_at:row.database_now},+row.database_now),false);assert.equal(liveSession(row,+row.expires_at),false);assert.equal(sessionAssurance({...row,session_security_version:2}),false);}
});
test('Admin MFA enabled login issues a challenge, not a password session',async()=>{
 let writes=0,challenges=0;const service={mfa:{newChallenge:async(c,r,p)=>{challenges++;assert.equal(p,'login');return {stage:'challenge'};}}};const result=await require('../lib/wpay/auth/runtime/admin-account').issue(service,{query:()=>{writes++;}},session('admin',true));assert.equal(result.stage,'challenge');assert.equal(writes,0);assert.equal(challenges,1);
});
test('approved unlimited user can generate activation after five minutes without extra password or MFA',async()=>{
 const row=session('user',false),id=row.id;row.tenant_id='tenant-a';row.user_id=id;const context={principal:{id,userId:id,type:'user',tenantId:'tenant-a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['user.device_pairing.view','user.device_pairing.create'],eligibility:{approvalStatus:'approved'}};
 let inserted=false;const c={query:async(sql,args)=>{if(sql.includes('user_collection_permissions'))return {rows:[{free_setup:false,unlimited_collection:true}]};if(sql.startsWith('SELECT count'))return {rows:[{n:0}]};if(sql.startsWith('INSERT INTO wpay_auth.legacy_pairing_requests')){inserted=true;assert.equal(args[1],id);}return {rows:[],rowCount:0};}};
 const setup=new DeviceSetup({crypto:{seal:()=>({encrypted:true})},source:{pairing:async()=>({id:'1',status:'pending',expires_at:new Date(Date.now()+60000)})},bridge:{issue:async()=> 'ABCDEFG2'}});
 const result=await setup.create(c,row,context,{requestId:randomUUID()});assert.equal(result.pairingCode,'ABCDEFG2');assert.equal(inserted,true);
 await assert.rejects(setup.create(c,row,{...context,grants:[]},{requestId:randomUUID()}),{code:'FORBIDDEN'});
});
test('password stepup with MFA ON verifies password only and updates only the current session timestamp',async()=>{
 const {hashPassword}=require('../lib/wpay/auth/runtime/passwords'),password='Synthetic-password-only-!2026',record=await hashPassword(password,'user');
 for(const type of ['user','merchant','admin','super_admin','employee']){const row={...session(type,true),password_record:record},queries=[];const c={query:async(sql,args)=>{queries.push({sql,args});return {rowCount:1,rows:[]};}},service={repository:{lockedAccount:async()=>row,attempt:async()=>true},crypto:{verify:()=>{throw Error('Authenticator must not be requested');}}};
  const result=await require('../lib/wpay/auth/runtime/optional-mfa').change(service,c,row,{password},'stepup','current-session-digest');assert.equal(result.ok,true);assert.ok(queries.some(q=>q.sql==='UPDATE wpay_auth.sessions SET transaction_password_at=CURRENT_TIMESTAMP WHERE token_digest=$1'&&q.args[0]==='current-session-digest'));assert.ok(!queries.some(q=>q.sql.includes('SET enabled=')||q.sql.includes('SET mfa_at=')));queries.length=0;
  const failed=await require('../lib/wpay/auth/runtime/optional-mfa').change(service,c,row,{password:'Wrong synthetic password'},'stepup','current-session-digest');assert.equal(failed.failure,'AUTH_FAILED');assert.equal(queries.length,0);
 }
});
