"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {startAuthServer}=require('../lib/wpay/auth/runtime/http');
const {routes,resolve}=require('../dev/wpay-auth/web/reference-navigation');

test('reference navigation never manufactures authorization from a prototype menu',()=>{
 const groups=[{children:[{destinationId:'user.profile',permissionId:'profile.view',routeStatus:'implemented'}]}];
 assert.equal(resolve('user','bank-upi',groups),null);
 assert.equal(resolve('user','payouts',groups),null);
 assert.equal(resolve('merchant','profile',groups),null);
 assert.equal(resolve('user','profile',groups).permissionId,'profile.view');
 assert.equal(resolve('user','unknown',groups),null);
});

test('live reference pages load real authentication and no prototype execution assets',async t=>{
 const server=await startAuthServer({service:{},port:0});t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const base='http://127.0.0.1:'+server.address().port;
 for(const role of ['user','merchant']){
  const response=await fetch(base+'/'+role),html=await response.text();assert.equal(response.status,200);
  assert.match(html,/id="workspace"/);assert.match(html,/hidden="" id="workspace"/);
  assert.match(html,/src="\/wpay-auth\/app.js"/);
  assert.doesNotMatch(html,/@wpay\.demo|WPay@1234|Merchant@123|src="[^\"]*prototype\.js|UI preview|Rahul Singh|Nova Merchant/);
  const policy=response.headers.get('content-security-policy');assert.match(policy,/connect-src 'self'/);assert.match(policy,/script-src 'self';/);assert.match(policy,/form-action 'none'/);
  for(const match of html.matchAll(/(?:src|href)="(\/wpay-auth\/[^\"]+)"/g)){
   const asset=await fetch(base+match[1]);assert.equal(asset.status,200,match[1]);assert.ok((await asset.text()).length);
  }
  for(const key of Object.keys(routes[role]))assert.ok(html.includes('data-page="'+key+'"'),role+': '+key);
 }
 for(const name of ['user-prototype.js','merchant-prototype.js','user-prototype.html','merchant-prototype.html'])assert.notEqual((await fetch(base+'/wpay-auth/'+name)).status,200,name+' must not execute on live server');
});

test('reference assets preserve existing auth and isolate frontend-only additions from legacy files',async()=>{
 const code=await fs.readFile('dev/wpay-auth/web/app.js','utf8');
 assert.match(code,/credentials:"same-origin"/);assert.match(code,/X-WPay-CSRF-Token/);
 assert.match(code,/post\("mfa\/verify"|"mfa\/recover" : "mfa\/verify"/);
 assert.doesNotMatch(code,/node\.disabled = false/);
});
