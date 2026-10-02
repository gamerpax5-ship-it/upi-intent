'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('real PostgreSQL API keys enforce scopes, revocation, invalidation and merchant ownership',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires disposable local PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname));
 const {randomUUID,randomBytes}=require('node:crypto'),{Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='merchant_keys_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 const {migrate,transaction}=require('../lib/wpay/db/migrations');await migrate(pool);
 const {AuthService}=require('../lib/wpay/auth/runtime/service'),{SecurityRepository}=require('../lib/wpay/db/security-repository'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa'),{Gateway}=require('../lib/wpay/gateway/core');
 const crypto=new MfaCrypto(randomBytes(32)),service=new AuthService(new SecurityRepository(pool),{mfaCrypto:crypto}),gateway=new Gateway({pool,crypto}),password='Synthetic-API-keys-2026!';
 await service.bootstrap({name:'Synthetic Admin',email:'admin@keys.invalid',password});
 const actor=(await pool.query("SELECT id FROM wpay_auth.accounts WHERE account_type='super_admin'")).rows[0].id,ids=[];
 for(const email of ['one@keys.invalid','two@keys.invalid']){await service.register({name:'Synthetic Merchant',accountType:'merchant',email,password},'127.0.0.1','merchant');const id=(await pool.query('SELECT id FROM wpay_auth.accounts WHERE email=$1',[email])).rows[0].id;ids.push(id);await pool.query("UPDATE wpay_auth.eligibility SET approval_status='approved',operations_enabled=true WHERE account_id=$1",[id]);await pool.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),id,{payinFee:'1',payoutFee:'1',fixedPayoutFee:'1',fixedFeeCurrency:'INR'},actor]);}
 const key=await transaction(pool,async c=>gateway.createKey(c,await gateway.merchant(c,ids[0]),{label:'Synthetic read only',scopes:['orders:read']}));
 const stored=(await pool.query('SELECT * FROM wpay_auth.gateway_keys WHERE id=$1',[key.id])).rows[0];assert.ok(!JSON.stringify(stored).includes(key.secret));
 await transaction(pool,async c=>assert.equal((await gateway.apiKey(c,key.secret,'orders:read')).row.id,ids[0]));
 await assert.rejects(transaction(pool,c=>gateway.apiKey(c,key.secret,'orders:write')),{code:'FORBIDDEN'});
 await assert.rejects(transaction(pool,c=>gateway.revokeKey(c,ids[1],key.id)),{code:'FORBIDDEN'});
 await pool.query('UPDATE wpay_auth.account_security SET security_version=security_version+1 WHERE account_id=$1',[ids[0]]);
 await assert.rejects(transaction(pool,c=>gateway.apiKey(c,key.secret,'orders:read')),{code:'FORBIDDEN'});
 const replacement=await transaction(pool,async c=>gateway.createKey(c,await gateway.merchant(c,ids[0]),{label:'Replacement',scopes:['orders:read','orders:write']}));
 await transaction(pool,c=>gateway.revokeKey(c,ids[0],replacement.id));
 await assert.rejects(transaction(pool,c=>gateway.apiKey(c,replacement.secret,'orders:read')),{code:'FORBIDDEN'});
 const login=await service.login({email:'one@keys.invalid',password},'127.0.0.1','merchant');service.gateway=gateway;
 const list=await service.authenticated(login.sessionToken,'gateway/keys');assert.equal(list.keys.find(k=>k.id===key.id).status,'invalidated');assert.equal(list.keys.find(k=>k.id===replacement.id).status,'revoked');
 assert.ok(!JSON.stringify(list).includes(key.secret));assert.ok(!JSON.stringify(list).includes(replacement.secret));
});
test('Merchant key list reports invalidation without exposing credentials',async()=>{
 const api=require('../lib/wpay/gateway/api'),{DEFAULT_GRANTS}=require('../lib/wpay/auth/runtime/service');
 const id='10000000-0000-4000-8000-000000000001',context={principal:{id,merchantId:id,type:'merchant',tenantId:'a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:DEFAULT_GRANTS.merchant,eligibility:{approvalStatus:'approved',operationsEnabled:true}};
 let called=false;const c={query:async(sql,args)=>{called=true;assert.deepEqual(args,[id,4,2]);assert.match(sql,/security_version<>\$2 OR factor_version<>\$3/);assert.match(sql,/THEN 'invalidated'/);assert.doesNotMatch(sql,/SELECT \*|digest|encrypted_secret/);return {rows:[{status:'invalidated'}]};}};
 const result=await api.run({merchant:async()=>({security_version:4,factor_version:2})},c,{id,account_type:'merchant',merchant_id:id,tenant_id:'a'},context,'gateway/keys',{});
 assert.equal(called,true);assert.equal(result.keys[0].status,'invalidated');
 await assert.rejects(api.run({},c,{id,account_type:'merchant',merchant_id:id,tenant_id:'a'},{...context,grants:[]},'gateway/keys',{}),{code:'FORBIDDEN'});
});
test('API docs describe actual wire contract and never confuse webhook secret with API key',()=>{
 const html=fs.readFileSync('dev/wpay-auth/web/merchant.html','utf8'),docs=html.slice(html.indexOf('id="page-docs"'),html.indexOf('id="page-fees"'));
 for(const expected of ['POST /wpay-api/v1/orders','GET /wpay-api/v1/orders/ORDER_UUID','orders:write','orders:read','Cookie or Origin','Idempotency-Key','HTTP 201','HTTP 200','60 authenticated','x-wpay-secret-version','exact raw UTF-8','eight attempts','eventId deduplication','bankVerified: false','"evidenceStatus": "unavailable"'])assert.ok(docs.includes(expected),expected);
 assert.ok(docs.includes('signing secret is separate from the API key'));
 const js=fs.readFileSync('dev/wpay-auth/web/merchant-premium.js','utf8');assert.ok(js.includes("pill(r.status||(r.revoked_at?'revoked':'active'))"));
});


test('Merchant Developer API pages use dedicated permissions with legacy compatibility kept outside the grant',async()=>{
 const api=require('../lib/wpay/gateway/api'),{DEFAULT_GRANTS}=require('../lib/wpay/auth/runtime/service');
 const id='10000000-0000-4000-8000-000000000001',now=new Date();
 const base={principal:{id,merchantId:id,type:'merchant',tenantId:'a',status:'active',permissionVersion:1},currentPermissionVersion:1,eligibility:{approvalStatus:'approved',operationsEnabled:true}};
 const row={id,account_type:'merchant',merchant_id:id,tenant_id:'a',database_now:now,transaction_password_at:now};
 const principal={id,security_version:1,factor_version:0};
 const gateway={merchant:async()=>principal,createKey:async(_c,_p,body)=>({id:'k',prefix:'wpay_mk_test',secret:'secret',scopes:body.scopes}),revokeKey:async()=>({revoked:true})};
 const c={query:async sql=>({rows:sql.includes('gateway_keys')?[]:[]})};
 const createContext={...base,grants:['merchant.api_credentials.view','merchant.api_credentials.create']};
 const created=await api.run(gateway,c,row,createContext,'gateway/keys/create',{label:'Read only',scopes:['orders:read']});
 assert.deepEqual(created.scopes,['orders:read']);
 await assert.rejects(api.run(gateway,c,row,{...base,grants:['merchant.api_credentials.view']},'gateway/keys/create',{label:'Denied',scopes:['orders:read']}),{code:'FORBIDDEN'});
 assert.ok(DEFAULT_GRANTS.merchant.includes('merchant.api_credentials.create'));
 assert.ok(DEFAULT_GRANTS.merchant.includes('merchant.webhooks.update'));
 assert.ok(DEFAULT_GRANTS.merchant.includes('merchant.api_logs.view'));
});

test('current Merchant gateway UI exposes least-privilege keys, truthful status and complete API contract',()=>{
 const js=fs.readFileSync('dev/wpay-auth/web/gateway.js','utf8');
 for(const expected of [
  "read.type='checkbox'","write.type='checkbox'","orders:read","orders:write","status!=='revoked'",
  "Copy secret","setTimeout(close,60000)","visibilitychange",
  "Server-to-server only","Cookie or Origin","Rate limit: 60 authenticated requests per API key per minute",
  "Maximum active API keys: 10","HTTP 201","HTTP 200","400 INVALID_INPUT","429 RATE_LIMITED",
  "exact raw UTF-8 body bytes","eventId for deduplication","up to eight attempts"
 ])assert.ok(js.includes(expected),expected);
 const navigation=fs.readFileSync('dev/wpay-auth/web/reference-navigation.js','utf8');
 for(const destination of ['merchant.api-credentials','merchant.webhooks','merchant.api-logs'])assert.ok(navigation.includes(destination),destination);
});
