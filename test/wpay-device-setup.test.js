'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const {DeviceSetup,metadata}=require('../lib/wpay/operations/device-setup'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa');
const {migrate,transaction}=require('../lib/wpay/db/migrations');
test('device metadata never projects credentials or OTP and reports stale heartbeats honestly',()=>{
 const now=new Date(),link={id:'link',owner_id:'owner',device_ref:'device'},source={id:'device',linked:true,app_version:'1',last_seen_at:now,code:'sensitive-code',message:'sensitive-message',credential_hash:'credential'};
 assert.equal(metadata(link,source,now).status,'online');assert.equal(metadata(link,{...source,last_seen_at:new Date(+now-120001)},now).status,'offline');assert.equal(metadata(link,{...source,linked:false},now).status,'unpaired');assert.equal(metadata(link,null,now).status,'unavailable');
 assert.doesNotMatch(JSON.stringify(metadata(link,source,now)),/sensitive|credential|message/);
});
test('PostgreSQL: independent pairing permissions, ownership, tenant scope, history and unlink',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));const {Pool}=require('pg'),server=new Pool({connectionString:url.toString()}),name='device_setup_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});
 t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});await migrate(pool);
 const user=randomUUID(),other=randomUUID(),admin=randomUUID(),employee=randomUUID();
 const actors=new Map();for(const [id,type,tenant]of [[user,'user','a'],[other,'user','b'],[admin,'super_admin','a'],[employee,'employee','a']]){
  await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id) VALUES($1,$2,$3,'Synthetic Device Owner',$4,$5,'active',$6)",[id,randomUUID(),tenant,id+'@example.invalid',type,type==='user'?id:null]);await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[id]);
  const grants=type==='user'?['user.device_pairing.view','user.device_pairing.create','user.device_pairing.revoke']:['devices.view','devices.pairing.create','devices.revoke'];
  actors.set(id,{row:{id,account_type:type,tenant_id:tenant,user_id:type==='user'?id:null},context:{principal:{id,type,tenantId:tenant,status:'active',permissionVersion:1,...(type==='user'?{userId:id}:{})},currentPermissionVersion:1,grants,eligibility:{approvalStatus:'approved'},...(type==='user'?{}:{adminScope:{tenantIds:['a'],platform:type==='super_admin'}})}});
 }
 const proofs=new Map(),codes=new Map();let issued=0;const source={ready:async()=>true,pairing:async digest=>proofs.get(digest)||null,devices:async links=>links.map(l=>({id:l.device_ref,linked:true,app_version:'synthetic',last_seen_at:new Date(),code:'MUST_NOT_PROJECT'})),events:()=>{throw Error('OTP MUST NOT BE CALLED');}};
 const setup=new DeviceSetup({crypto:new MfaCrypto(randomBytes(32)),pairingSource:source,source:null,bridge:{issue:async()=>{const code='ABCDEFG'+String(++issued+1),digest=createHash('sha256').update(code).digest('hex');proofs.set(digest,{id:String(issued),status:'pending',created_at:new Date(),expires_at:new Date(Date.now()+600000)});codes.set(code,digest);return code;}}});
 const call=(id,method,body={},override)=>transaction(pool,async c=>{const actor=actors.get(id),now=(await c.query('SELECT CURRENT_TIMESTAMP now')).rows[0].now;return setup[method](c,{...actor.row,database_now:now,mfa_at:now},override||actor.context,body);});
 await assert.rejects(call(user,'create',{requestId:randomUUID()}),{code:'FUNDING_REQUIRED'});
 for(const id of [user,other])await transaction(pool,c=>require('../lib/wpay/business/collection-policy').setAccess(c,admin,{userId:id,freeSetup:true,unlimitedCollection:false,reason:'Synthetic setup access'}));
 const requestId=randomUUID(),first=await call(user,'create',{requestId}),retry=await call(user,'create',{requestId});assert.equal(first.pairingCode,retry.pairingCode);assert.equal(issued,1);
 await assert.rejects(call(other,'create',{requestId}),{code:'CONFLICT'});
 const adminCode=await call(admin,'create',{requestId:randomUUID()}),foreignCode=await call(other,'create',{requestId:randomUUID()}),staffCode=await call(employee,'create',{requestId:randomUUID()});
 async function pair(owner,result,device){const proof=proofs.get(codes.get(result.pairingCode));Object.assign(proof,{status:'claimed',device_id:device,device_status:'active',latest_pairing:proof.id,claimed_at:new Date()});return call(owner,'poll',{requestId:result.id});}
 const linked=await pair(user,first,'synthetic-user-device');assert.equal(linked.state,'linked');assert.equal((await call(user,'poll',{requestId:first.id})).id,linked.id);
 await pair(admin,adminCode,'synthetic-admin-device');await pair(other,foreignCode,'synthetic-foreign-device');await pair(employee,staffCode,'synthetic-employee-device');
 const own=await call(user,'list');assert.deepEqual(own.devices.map(d=>d.device),['synthetic-user-device']);assert.doesNotMatch(JSON.stringify(own),/MUST_NOT_PROJECT/);assert.equal(own.sourceConnected,true);
 const adminList=await call(admin,'list');assert.equal(adminList.devices.length,3);assert.ok(!adminList.devices.some(d=>d.device==='synthetic-foreign-device'));assert.equal((await call(employee,'list')).devices.length,3);
 const history=await call(user,'history');assert.equal(history.requests.length,1);assert.equal(history.requests[0].state,'used');assert.doesNotMatch(JSON.stringify(history),/encrypted_code|token_digest|ABCDEFG/);assert.equal((await call(admin,'history')).requests.length,3);
 const noCreate={...actors.get(employee).context,grants:['devices.view']};await assert.rejects(call(employee,'create',{requestId:randomUUID()},noCreate),{code:'FORBIDDEN'});
 await assert.rejects(call(other,'revoke',{id:linked.id}),{code:'FORBIDDEN'});
 await assert.rejects(call(employee,'revoke',{id:linked.id},{...actors.get(employee).context,adminScope:{tenantIds:['b'],platform:false}}),{code:'FORBIDDEN'});
 await Promise.all([call(admin,'revoke',{id:linked.id}),call(admin,'revoke',{id:linked.id})]);assert.equal((await call(user,'list')).devices.length,0);assert.ok((await call(user,'history')).requests[0].revoked_at);
 await assert.rejects(call(user,'poll',{requestId:first.id}),{code:'CONFLICT'});
 await assert.rejects(call(user,'create',{requestId:first.id}),{code:'CONFLICT'});
});
