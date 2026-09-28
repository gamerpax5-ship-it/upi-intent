'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {metadata,DeviceSetup}=require('../lib/wpay/operations/device-setup');
const {PairingService}=require('../lib/wpay/integrations/pairing-service');

test('missing, blank, invalid and partial metadata never becomes zero coordinates or battery',()=>{
 for(const value of [null,undefined,'',false,'NaN']){
  const d=metadata({}, {latitude:value,longitude:value,battery_level:value},new Date());
  assert.equal(d.latitude,null);assert.equal(d.longitude,null);assert.equal(d.locationLabel,null);assert.equal(d.battery,null);
 }
 assert.equal(metadata({},{latitude:91,longitude:77},new Date()).latitude,null);
 assert.equal(metadata({},{latitude:12,longitude:null},new Date()).latitude,null);
 const zero=metadata({},{latitude:0,longitude:0,battery_level:0,carrier:'Network carrier'},new Date());
 assert.equal(zero.locationLabel,'0.00000, 0.00000');assert.equal(zero.battery,0);assert.equal(zero.carrier,'Network carrier');
});

test('GPS fallback uses newest valid in-scope history and never crosses pairing or ownership',async()=>{
 const now=Date.now(),from=new Date(now-600000),latest=new Date(now-1000).toISOString(),calls=[];
 const service=new PairingService({origin:'https://pairing.example',key:'a'.repeat(43),fetchImpl:async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)});
  return {ok:true,json:async()=>url.endsWith('/devices')?{devices:[{id:'device-test',status:'active',latest_pairing:'7',paired_at:from,latitude:null,longitude:null}]}:{diagnostics:[
   {latitude:1,longitude:2,collected_at:new Date(+from-1)},
   {latitude:3,longitude:4,collected_at:latest},
   {latitude:5,longitude:6,collected_at:new Date(now+600000)},
   {latitude:91,longitude:7,collected_at:new Date(now-100)},
   {latitude:8,longitude:9,collected_at:new Date(now-5000)}]}};
 }});
 const link={device_ref:'device-test',pairing_id:'7',valid_from:from};
 const d=(await service.devices([link]))[0];assert.equal(d.latitude,3);assert.equal(d.longitude,4);assert.equal(d.location_at,latest);assert.equal(d.location_last_known,true);assert.equal(calls.length,2);
 assert.equal(calls[1].body.from,from.toISOString());
 calls.length=0;assert.equal((await service.devices([{...link,pairing_id:'6'}]))[0].linked,false);assert.equal(calls.length,1);
});

test('GPS history failure preserves device/phone and reports location unavailable',async()=>{
 const service=new PairingService({origin:'https://pairing.example',key:'a'.repeat(43),fetchImpl:async(url)=>{
  if(url.endsWith('/diagnostics'))throw Error('private network error');
  return {ok:true,json:async()=>({devices:[{id:'device-test',status:'active',latest_pairing:'1',phone_e164:'+910000000000'}]})};
 }});
 const d=(await service.devices([{device_ref:'device-test',pairing_id:'1',valid_from:new Date(Date.now()-60000)}]))[0];
 assert.equal(d.phone_e164,'+910000000000');assert.equal(d.location_source_unavailable,true);assert.equal(d.location_label,null);
});

const actor='10000000-0000-4000-8000-000000000001';
const context={principal:{id:actor,type:'super_admin',tenantId:'a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['utr_center.view','devices.view'],adminScope:{tenantIds:['a'],platform:true}};
test('UTR read passes exact search and transaction cursor, retains stale-MFA read and missing-source errors',async()=>{
 const row={id:actor,account_type:'super_admin',database_now:new Date(),mfa_at:new Date(0)},links=[{device_ref:'device-test',owner_id:actor}];let observed;
 const setup=new DeviceSetup({source:{transactions:async(l,opts)=>{observed=opts;assert.deepEqual(l,links);return {rows:[],nextCursor:'10'};}}});
 setup.links=async()=>links;
 const result=await setup.utrs({},row,context,{before:'11',utr:'123456789012'});
 assert.deepEqual(observed,{before:'11',utr:'123456789012'});assert.equal(result.nextCursor,'10');assert.equal(result.sourceConnected,true);
 await assert.rejects(setup.utrs({},row,context,{before:'9223372036854775808'}),{code:'INVALID_INPUT'});
 await assert.rejects(setup.utrs({},row,{...context,grants:['devices.view']},{}),{code:'FORBIDDEN'});
 setup.devices.source=null;await assert.rejects(setup.utrs({},row,context,{}),{code:'OTP_SOURCE_UNAVAILABLE'});
});

class Element{
 constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.dataset={};this.style={};}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.children=[...children];}setAttribute(k,v){this[k]=v;}
}
const descendants=n=>[n,...n.children.flatMap(descendants)];
function ui(post){
 const document={getElementById:()=>null,createElement:t=>new Element(t),createTextNode:t=>new Element('#text',t)},ctx={document,Node:Element};
 vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/admin-v5-pages.js','utf8'),ctx);
 const container=new Element('main'),el=(tag,text,cls)=>Object.assign(new Element(tag,text),{className:cls});
 return {container,render:(destination,state)=>ctx.WPayAdminV5Pages.render(destination,{container,title:el('h1'),el,post,action:fn=>fn(),state})};
}
test('UTR UI reads all transaction pages before next device group and surfaces source failures',async()=>{
 const calls=[];let page=0;
 const f=ui(async(path,body)=>{
  if(path==='operations/device-setup/utrs'){calls.push(body);return ++page===1?{records:[],nextCursor:'20',nextDeviceCursor:'next-device'}:page===2?{records:[],nextDeviceCursor:'next-device'}:{records:[]};}
  if(path==='operations/statement-credits')throw Error('SOURCE_UNAVAILABLE');
  return {links:[],records:[]};
 });
 await f.render('v5.utr',{utr:'123456789012'});
 assert.equal(calls.length,3);assert.equal(calls[1].before,'20');assert.equal(calls[1].afterDevice,undefined);assert.equal(calls[2].afterDevice,'next-device');assert.equal(calls[2].before,undefined);assert.ok(calls.every(c=>c.utr==='123456789012'));
 assert.ok(descendants(f.container).some(n=>n.textContent.includes('Statement credits could not be fully loaded')));
});
test('device card renders phone, timestamped last known GPS and honest missing-fix state',async()=>{
 const f=ui(async()=>({devices:[{phone:'+910000000000',latitude:12,longitude:77,locationLastKnown:true,locationAt:'2026-09-28T18:00:00Z'},{latitude:null,longitude:null,locationEnabled:true}],sourceConnected:true}));
 await f.render('v5.devices');const text=descendants(f.container).map(n=>n.textContent).join(' ');
 assert.match(text,/\+910000000000/);assert.match(text,/12.00000, 77.00000 · Last known/);assert.match(text,/Waiting for GPS coordinates/);assert.doesNotMatch(text,/0.00000, 0.00000/);
});
