"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {startAuthServer}=require('../lib/wpay/auth/runtime/http'),{requireRole,registrationRole}=require('../lib/wpay/auth/runtime/role-entry');
test('public site is the byte-identical supplied HTML/assets, with no filesystem or application leakage',async t=>{
 const server=await startAuthServer({service:{},port:0});t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const origin='http://127.0.0.1:'+server.address().port,root=path.join(__dirname,'../dev/wpay-public-site'),manifest=JSON.parse(await fs.readFile(path.join(root,'source-manifest.json'),'utf8'));
 for(const item of manifest.files){const response=await fetch(origin+(item.path==='index.html'?'/':'/'+item.path));assert.equal(response.status,200);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),item.sha256);}
 const landing=await fetch(origin+'/');assert.equal(landing.headers.get('set-cookie'),null);assert.match(landing.headers.get('content-security-policy'),/script-src 'sha256-/);assert.doesNotMatch(landing.headers.get('content-security-policy'),/script-src[^;]*unsafe-inline/);
 for(const target of ['/server.mjs','/package.json','/source-manifest.json','/assets/../source-manifest.json','/%2e%2e/.env','/assets/missing.svg','/api/devices/admin/list'])assert.equal((await fetch(origin+target)).status,404);
 for(const role of ['admin','merchant','user','employee']){const r=await fetch(origin+'/'+role);assert.equal(r.status,200);assert.match(await r.text(),new RegExp('<meta name="wpay-entry-role" content="'+role+'">'));}
});
test('role entry is a server-side account constraint, never a role grant',()=>{
 for(const role of ['admin','merchant','user','employee'])for(const type of ['admin','super_admin','merchant','user','employee']){
  if(role===type||role==='admin'&&type==='super_admin')assert.doesNotThrow(()=>requireRole({account_type:type},role));else assert.throws(()=>requireRole({account_type:type},role),{code:'AUTH_FAILED'});
 }
 for(const role of ['__proto__','constructor','super_admin','owner',''])assert.throws(()=>requireRole({account_type:'super_admin'},role));
 for(const role of ['admin','employee'])assert.throws(()=>registrationRole({accountType:role},role),{code:'FORBIDDEN'});
 assert.throws(()=>registrationRole({accountType:'merchant'},'user'),{code:'FORBIDDEN'});assert.doesNotThrow(()=>registrationRole({accountType:'user'},'user'));
});
