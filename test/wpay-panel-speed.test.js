"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {startAuthServer}=require('../lib/wpay/auth/runtime/http');
const code=fs.readFileSync('dev/wpay-auth/web/app.js','utf8');
test('parallel authenticated reads share one CSRF exchange; authentication changes invalidate it',async()=>{
 const calls=[],context={request:async(route,method,body,csrf)=>{calls.push({route,csrf});if(route==='csrf')return {csrfToken:'fixture-'+calls.length};return {ok:true};}};
 vm.runInNewContext(code.slice(code.indexOf('async function post('),code.indexOf('async function action(')),context);
 await Promise.all([context.post('panel/support'),context.post('panel/notifications')]);assert.equal(calls.filter(c=>c.route==='csrf').length,1);
 assert.equal(calls[1].csrf,calls[2].csrf);await context.post('logout');await context.post('panel/support');assert.equal(calls.filter(c=>c.route==='csrf').length,2);
});
test('CSRF rotation retries only a rejected pre-action request, never a network failure',async()=>{
 let issued=0,attempts=0,context={request:async route=>{if(route==='csrf')return {csrfToken:String(++issued)};if(++attempts===1)throw Error('error.CSRF_FAILED');return 'ok';}};
 vm.runInNewContext(code.slice(code.indexOf('async function post('),code.indexOf('async function action(')),context);
 assert.equal(await context.post('panel/support'),'ok');assert.equal(issued,2);
 context.request=async route=>{if(route==='csrf')return {csrfToken:'next'};throw Error('error.UNAVAILABLE');};await assert.rejects(context.post('payout/create'),/UNAVAILABLE/);
});
test('section navigation reuses short-lived shell metadata without caching financial responses',async()=>{
 const calls=[],nodes=new Map(),element=()=>({textContent:'',children:[],append(...n){this.children.push(...n);},replaceChildren(){this.children=[];}});
 const context={destination:null,account:null,explicitLocale:null,navigator:{language:'en'},L:{choose:()=> 'en',supported:['en']},applyLocale(){},tr:k=>k,profile(){},request:async route=>{calls.push(route);return route==='me'?{accountType:'user',approvalStatus:'approved',status:'active'}:{groups:[]};},$:id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);}};
 vm.runInNewContext(code.slice(code.indexOf('async function load('),code.indexOf('async function changeLocale(')),context);
 await context.load();await context.load('user.profile',true);assert.deepEqual(calls,['me','navigation']);context.load.session.until=0;await context.load('user.profile',true);assert.deepEqual(calls,['me','navigation','me','navigation']);
});
test('static assets revalidate by content hash and compress; role HTML remains no-store',async t=>{
 const server=await startAuthServer({service:{},port:0});t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));const base='http://127.0.0.1:'+server.address().port;
 const asset=await fetch(base+'/wpay-auth/reference-layouts.js',{headers:{'accept-encoding':'gzip'}});assert.equal(asset.status,200);assert.equal(asset.headers.get('content-encoding'),'gzip');assert.match(asset.headers.get('cache-control'),/must-revalidate/);assert.equal(await asset.text(),fs.readFileSync('dev/wpay-auth/web/reference-layouts.js','utf8'));
 assert.equal((await fetch(base+'/wpay-auth/reference-layouts.js',{headers:{'if-none-match':asset.headers.get('etag')}})).status,304);
 const html=await fetch(base+'/merchant');assert.equal(html.headers.get('cache-control'),'no-store');assert.equal(html.headers.get('etag'),null);
 const raw=await fetch(base+'/wpay-auth/reference-layouts.js',{headers:{'accept-encoding':'gzip;q=0'}});assert.equal(raw.headers.get('content-encoding'),null);
});
test('Merchant fee history is limited to the authenticated Merchant and rejects other roles',async()=>{
 const {run}=require('../lib/wpay/panels/api');let queries=0;
 const context={principal:{id:'merchant-a',type:'merchant',status:'active',tenantId:'tenant-a',merchantId:'merchant-a',permissionVersion:1},grants:['merchant.fees.view'],currentPermissionVersion:1,eligibility:{approvalStatus:'approved'}};
 const row={id:'merchant-a',account_type:'merchant',tenant_id:'tenant-a'};
 const client={query:async(sql,values)=>{queries++;assert.match(sql,/WHERE account_id=\$1/);assert.equal(values[0],row.id);return {rows:[{version:1,settings:{payinFee:'1',payoutFee:'0.5',fixedPayoutFee:'2',fixedFeeCurrency:'INR',depositAddress:'must-not-leak'},effective_at:'2026-09-20T00:00:00Z'}]};}};
 const result=await run(client,row,context,'panel/fees',{});assert.equal(result.rows[0].payinFee,'1');assert.equal(JSON.stringify(result).includes('must-not-leak'),false);
 await assert.rejects(run(client,{...row,account_type:'user'},context,'panel/fees',{}),{code:'FORBIDDEN'});await assert.rejects(run(client,row,{...context,grants:[]},'panel/fees',{}),{code:'FORBIDDEN'});assert.equal(queries,1);
});
