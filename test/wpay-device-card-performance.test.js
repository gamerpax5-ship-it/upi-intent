'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PairingService}=require('../lib/wpay/integrations/pairing-service'),{DeviceSetup}=require('../lib/wpay/operations/device-setup');
test('batched last-known metadata needs one request and stays inside ownership interval',async()=>{
 let calls=0;const now=Date.now(),fix=new Date(now-3*86400000).toISOString(),link={device_ref:'device-test',pairing_id:'7',valid_from:new Date(now-4*86400000)};
 const service=new PairingService({origin:'https://pairing.example',key:'a'.repeat(43),fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({devices:[{id:'device-test',status:'active',latest_pairing:'7',paired_at:link.valid_from,latitude:12,longitude:77,location_at:fix,location_last_known:true,location_history_checked:true}]})};}});
 let d=(await service.devices([link]))[0];assert.equal(calls,1);assert.equal(d.latitude,12);assert.equal(d.location_at,fix);
 d=(await service.devices([{...link,valid_from:new Date(now-1000)}]))[0];assert.equal(calls,2);assert.equal(d.latitude,null);assert.equal(d.location_at,null);
 d=(await service.devices([{...link,pairing_id:'8'}]))[0];assert.equal(d.linked,false);assert.equal(d.latitude,null);
});
test('metadata-capable source avoids serial ready preflight without caching authorization',async()=>{
 let calls=0;const source={devicesIncludesReadiness:true,ready:async()=>{throw Error('redundant ready');},devices:async()=>{calls++;return [];}};
 const setup=new DeviceSetup({source}),owner='10000000-0000-4000-8000-000000000001',row={id:owner,account_type:'admin',database_now:new Date()},context={principal:{id:owner,type:'super_admin',tenantId:'a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['devices.view'],adminScope:{tenantIds:['a'],platform:true}};
 const client={query:async()=>({rows:[{device_ref:'device-test',owner_id:owner}]})};
 assert.equal((await setup.list(client,row,context,{})).sourceConnected,true);assert.equal(calls,1);
 await assert.rejects(setup.list(client,row,{...context,grants:[]},{}),{code:'FORBIDDEN'});assert.equal(calls,1);
 source.devices=async()=>{throw Error('outage');};assert.equal((await setup.list(client,row,context,{})).sourceConnected,false);
});
test('user device card uses two-column dedicated fields rather than generic transformed facts',async()=>{
 class E{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.dataset={};}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}}
 const el=(tag,text,cls)=>Object.assign(new E(tag,text),{className:cls}),all=n=>[n,...n.children.flatMap(all)],c={crypto:{randomUUID:()=>''}};
 vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/device-setup.js','utf8'),c);const container=el('main');
 await c.WPayDeviceSetupPage.render({destination:'operations.devices',account:{accountType:'user'},el,container,title:el('h1'),action:f=>f(),post:async()=>({devices:[{id:'one',device:'synthetic-device',model:'Test phone',phone:'9000000001',apkVersion:'0.10.5+build.22',status:'offline',locationLabel:'12.00000, 77.00000',locationLastKnown:true,locationAt:new Date().toISOString()}]})});
 const stats=all(container).find(n=>n.className==='owned-device-stats');assert.equal(stats.children.length,5);assert.ok(all(stats).some(n=>n.textContent==='9000000001'));assert.ok(all(stats).some(n=>n.textContent==='Last known · 12.00000, 77.00000'));assert.ok(!all(stats).some(n=>n.className==='facts'));
 const css=fs.readFileSync('dev/wpay-auth/web/user-burgundy-live.css','utf8');assert.match(css,/\.owned-device-stats\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
