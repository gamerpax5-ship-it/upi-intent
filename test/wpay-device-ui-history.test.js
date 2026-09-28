'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {Devices}=require('../lib/wpay/operations/devices'),{DeviceSetup}=require('../lib/wpay/operations/device-setup');
class Element{
 constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.dataset={};this.style={};}
 append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this[k]=v;}showModal(){this.open=true;}close(){this.open=false;this.onclose?.();}remove(){this.removed=true;}
}
const all=n=>[n,...n.children.flatMap(all)];
function fixture(post){const context={Node:Element,document:{getElementById:()=>null,createElement:t=>new Element(t),createTextNode:t=>new Element('#text',t)}};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/admin-v5-pages.js','utf8'),context);const el=(t,s,c)=>Object.assign(new Element(t,s),{className:c}),container=el('main');return {container,render:destination=>context.WPayAdminV5Pages.render(destination,{el,container,title:el('h1'),post,account:{accountType:'super_admin'},action:fn=>fn()})};}
test('location button opens only the selected device history; missing fixes do not become zero',async()=>{
 const reads=[],f=fixture(async(path,body)=>{reads.push({path,body});return path.endsWith('/detail')?{device:{model:'Second phone'},history:[{at:'2026-09-28T12:00:00Z',latitude:null,longitude:null},{at:'2026-09-28T13:00:00Z',latitude:0,longitude:77,accuracy:15}]}:{devices:[{id:'one',model:'First phone'},{id:'two',model:'Second phone'}]};});
 await f.render('v5.devices');const button=all(f.container).find(e=>e['aria-label']==='Location history for Second phone');await button.onclick();
 assert.equal(reads.at(-1).body.id,'two');const modal=all(f.container).find(e=>e.tagName==='dialog');assert.equal(modal.open,true);const text=all(modal).map(e=>e.textContent).join(' ');assert.match(text,/0.00000/);assert.match(text,/77.00000/);assert.match(text,/48 hours/);assert.doesNotMatch(text,/NaN|Masked OTP events/);
});
test('UTR renderer keeps full reference, formatted amount and historical evidence readable',async()=>{
 const f=fixture(async path=>path==='operations/device-setup/utrs'?{records:[{utr:'123456789012',amount:'1234.5',device:'synthetic-device',ownerName:'Synthetic owner',capturedAt:'2026-09-28T12:00:00Z',historical:true}]}:{links:[],records:[]});await f.render('v5.utr');const text=all(f.container).map(e=>e.textContent).join(' ');assert.match(text,/123456789012/);assert.match(text,/₹ 1,234.50/);assert.match(text,/historical device observation/);assert.match(text,/Synthetic owner/);
});
test('Admin captures show successful manual and verified UTRs with actual UPI for all scoped users',async()=>{
 const records=[{utr:'123456789012',amountMinor:'1000000',status:'approved',paymentStatus:'successful',upiId:'admin@bank',user:'User one',submittedAt:'2026-01-01'},
 {utr:'123456789013',amountMinor:'50000',status:'verified',paymentStatus:'successful',upiId:'user@bank',user:'User two',submittedAt:'2026-01-01'}];
 const f=fixture(async path=>path==='operations/utr/pending'?{records}:{links:[],records:[]});await f.render('v5.utr');const text=all(f.container).map(e=>e.textContent).join(' ');
 for(const value of ['123456789012','123456789013','admin@bank','user@bank','User one','User two','10,000.00','Verified payment'])assert.ok(text.includes(value),value);
});
test('newly linked devices are fetched on the next OTP and UTR read without hardcoded IDs',async()=>{
 const id='10000000-0000-4000-8000-000000000001',context={principal:{id,type:'super_admin',tenantId:'a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['devices.view','utr_center.view','apk_otp_events.view_all'],adminScope:{tenantIds:['a'],platform:true}},row={id,account_type:'super_admin'};
 const links=[{id:'link-one',owner_id:id,device_ref:'synthetic-first',pairing_id:'1'}];const calls=[];
 const source={devices:async scoped=>scoped.map(l=>({id:l.device_ref,linked:true})),events:async(scoped,options)=>{calls.push({kind:'otp',ids:scoped.map(l=>l.device_ref),options});return {events:scoped.map((l,i)=>({id:String(i),device_id:l.device_ref,otp_length:6,code:'PRIVATE',message:'private'}))};},transactions:async(scoped,options)=>{calls.push({kind:'utr',ids:scoped.map(l=>l.device_ref),options});return {rows:scoped.map((l,i)=>({id:String(i),device_id:l.device_ref,utr:'123456789012'}))};}};
 const devices=new Devices({source}),setup=new DeviceSetup(devices),c={query:async sql=>({rows:sql.startsWith('SELECT d.id,d.owner_id')||sql.startsWith('WITH owned')?[...links]:[]})};
 assert.equal((await devices.events(c,row,context,{includeHistory:true})).events.length,1);assert.equal((await setup.utrs(c,row,context,{includeHistory:true})).records.length,1);
 links.push({id:'link-two',owner_id:id,device_ref:'synthetic-new-phone',pairing_id:'2'});
 const otp=await devices.events(c,row,context,{includeHistory:true}),utr=await setup.utrs(c,row,context,{includeHistory:true});assert.equal(otp.events.length,2);assert.equal(utr.records.length,2);assert.ok(otp.events.every(e=>e.code==='123456'&&e.masked));assert.ok(calls.slice(-2).every(c=>c.ids.includes('synthetic-new-phone')&&c.options.includeHistory));assert.doesNotMatch(JSON.stringify(otp),/PRIVATE/);
});
