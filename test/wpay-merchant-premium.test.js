'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {startAuthServer}=require('../lib/wpay/auth/runtime/http');
const {analytics}=require('../lib/wpay/gateway/merchant-analytics');
test('all Merchant entry URLs serve the supplied premium shell with real executable assets',async t=>{
 const server=await startAuthServer({service:{},port:0});t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const base='http://127.0.0.1:'+server.address().port;
 for(const url of ['/merchant','/merchant/','/wpay-auth/merchant.html','/wpay-auth/merchant-live.html']){const r=await fetch(base+url),html=await r.text();assert.equal(r.status,200);assert.match(html,/merchant-premium\.js/);assert.match(html,/real-dashboard-earth/);assert.match(html,/loginForm/);assert.doesNotMatch(html,/merchant@wpay\.demo|Merchant@123|Nova Merchant|const store=|verifyCheckoutPayment|reference-ui.js/);assert.equal((html.match(/<html\b/g)||[]).length,1);assert.match(r.headers.get('content-security-policy'),/script-src 'self';/);assert.match(r.headers.get('content-security-policy'),/form-action 'none'/);for(const [,asset]of html.matchAll(/(?:src|href)="(\/wpay-auth\/[^\"]+)"/g)){assert.equal((await fetch(base+asset)).status,200,asset);}}
});
test('optional MFA enable and disable bodies reach the authenticated role-bound handler',async t=>{
 const calls=[],service={repository:{throttle:async()=>{}},checkCsrf:async()=>{},authenticated:async(session,route,offset,body,role)=>{calls.push({route,body,role});return {ok:true};}};
 const server=await startAuthServer({service,port:0});t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const base='http://127.0.0.1:'+server.address().port;
 for(const [action,body]of [['enable',{password:'Synthetic-test-password'}],['disable',{password:'Synthetic-test-password',code:'123456'}]]){const r=await fetch(base+'/wpay-auth/roles/merchant/security/'+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(body)});assert.equal(r.status,200);assert.deepEqual(calls.at(-1),{route:'security/'+action,body,role:'merchant'});}
});
test('analytics validates the window and never accepts browser ownership fields',async()=>{
 for(const body of [{},{days:0},{days:31},{days:'7'},{days:7,merchantId:'other'}])await assert.rejects(analytics({query(){throw Error('must not query');}},'self',body),{code:'INVALID_INPUT'});
 const queries=[];const data=await analytics({query:async(sql,args)=>{queries.push([sql,args]);return {rows:[]};}},'self',{days:7});assert.equal(data.windowDays,7);assert.equal(queries.length,2);for(const [sql,args]of queries){assert.match(sql,/merchant_id=\$1/);assert.deepEqual(args,['self',7]);}
});
test('merchant-only analytics rejects other roles and missing permissions before querying',async()=>{
 const {run}=require('../lib/wpay/gateway/api');const c={query(){throw Error('must not query');}};
 const context={principal:{id:'m',type:'merchant',status:'active',tenantId:'t',merchantId:'m',permissionVersion:1},grants:['merchant.gateway.view'],currentPermissionVersion:1,eligibility:{approvalStatus:'approved'}};
 await assert.rejects(run({},c,{id:'m',account_type:'merchant',merchant_id:'m',tenant_id:'t'},{...context,grants:[]},'gateway/analytics',{days:7}),{code:'FORBIDDEN'});
 await assert.rejects(run({},c,{id:'a',account_type:'admin',tenant_id:'t'},{...context,principal:{...context.principal,id:'a',type:'admin'},grants:['transactions.view']},'gateway/analytics',{days:7}),{code:'FORBIDDEN'});
});
test('USDT detail cannot expose another Merchant destination',async()=>{
 const {run}=require('../lib/wpay/payouts/api'),id=randomUUID();let decrypted=false;const row={id,account_type:'merchant',merchant_id:id,tenant_id:'t'},ctx={principal:{id,type:'merchant',status:'active',tenantId:'t',merchantId:id,permissionVersion:1},grants:['merchant.settlement.view'],currentPermissionVersion:1,eligibility:{approvalStatus:'approved'}};
 const client={query:async()=>({rows:[row]})},core={merchantSettlements:{get:async()=>({merchant_id:randomUUID()}),project(){decrypted=true;return {};}}};
 await assert.rejects(run(core,client,row,ctx,'payout/merchant-usdt/get',{id:randomUUID()}),{code:'FORBIDDEN'});assert.equal(decrypted,false);
 core.merchantSettlements.get=async()=>({merchant_id:id});assert.deepEqual(await run(core,client,row,ctx,'payout/merchant-usdt/get',{id:randomUUID()}),{});assert.equal(decrypted,true);
});
test('analytics SQL aggregates confirmed value and isolates Merchants on disposable PostgreSQL',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires disposable local PostgreSQL');return;}
 const u=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(u.hostname));const {Pool}=require('pg'),admin=new Pool({connectionString:u.toString()}),name='merchant_ui_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);u.pathname='/'+name;const pool=new Pool({connectionString:u.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 await pool.query('CREATE SCHEMA wpay_auth; CREATE TABLE wpay_auth.gateway_orders(merchant_id text,origin text,state text,amount_minor bigint,created_at timestamptz)');
 await pool.query("INSERT INTO wpay_auth.gateway_orders VALUES ('self','manual','successful',125050,CURRENT_TIMESTAMP),('self','api','pending_payment',999999,CURRENT_TIMESTAMP),('other','manual','successful',9999999,CURRENT_TIMESTAMP),('self','manual','successful',44444,CURRENT_TIMESTAMP-interval '40 days')");
 const data=await analytics(pool,'self',{days:7});assert.equal(data.channels.find(r=>r.origin==='manual').volume,'125050');assert.equal(data.channels.find(r=>r.origin==='api').volume,'0');assert.equal(data.days.reduce((sum,r)=>sum+BigInt(r.volume),0n),125050n);
});
