'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const {DeviceSetup}=require('../lib/wpay/operations/device-setup'),{Devices}=require('../lib/wpay/operations/devices');
const owner=randomUUID(),other=randomUUID();
const context=id=>({principal:{id,userId:id,type:'user',tenantId:'tenant-a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['user.device_pairing.view','user.transaction_history.view','user.live_otp.view'],eligibility:{approvalStatus:'approved'}});
const row=id=>({id,account_type:'user',database_now:new Date(),mfa_at:new Date(0)});

test('user UTR read is owner filtered and cannot opt into Admin history or choose another owner',async()=>{
 let args,options;const link={owner_id:owner,device_ref:'owned-device-01'},source={transactions:async(links,o)=>{assert.deepEqual(links,[link]);options=o;return {rows:[{device_id:link.device_ref,utr:'123456789012'}]};}};
 const setup=new DeviceSetup({source}),client={query:async(sql,a)=>{args=a;assert.match(sql,/o.owner_id=\$1/);assert.match(sql,/o.device_ref=\$4/);return {rows:[link]};}};
 const result=await setup.utrs(client,row(owner),context(owner),{device:link.device_ref});assert.equal(args[0],owner);assert.equal(args[3],link.device_ref);assert.notEqual(options.includeHistory,true);assert.equal(result.records[0].utr,'123456789012');
 await assert.rejects(setup.utrs(client,row(owner),context(owner),{includeHistory:true}),{code:'FORBIDDEN'});
 await assert.rejects(setup.utrs(client,row(owner),context(owner),{ownerId:other}));
 await assert.rejects(setup.utrs(client,row(owner),{...context(owner),grants:[]},{}),{code:'FORBIDDEN'});
});

test('foreign device details are denied before metadata, OTP or UTR reads',async()=>{
 let reads=0;const setup=new DeviceSetup({source:{devices:async()=>{reads++;return [];}}});
 await assert.rejects(setup.detail({query:async()=>({rows:[{owner_id:other}]})},row(owner),context(owner),{id:randomUUID()}),{code:'FORBIDDEN'});assert.equal(reads,0);
});

test('user device cards expose scoped masked OTP and captured UTR controls without repeated APK downloads',async()=>{
 class Element{constructor(tag,text){this.tagName=tag;this.textContent=text;this.children=[];this.dataset={};}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}}
 const ctx={crypto:{randomUUID},setTimeout,setInterval,clearInterval};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/device-setup.js','utf8'),ctx);
 const el=(tag,text,cls)=>Object.assign(new Element(tag,text),{className:cls}),container=el('main'),calls=[],all=n=>[n,...n.children.flatMap(all)];
 await ctx.WPayDeviceSetupPage.render({destination:'operations.devices',account:{accountType:'user'},el,container,title:el('h1'),action:fn=>fn(),post:async(path,body)=>{calls.push({path,body});if(path==='operations/device-setup')return {devices:[{id:randomUUID(),device:'owned-device-01',model:'My phone',phone:'+910000000000',locationLabel:'0.00000, 77.00000'}]};if(path==='operations/otp')return {masked:false,events:[{otpLength:6,message:'UNSAFE',receivedAt:new Date()}]};return {records:[{utr:'123456789012',amount:'1200.50',capturedAt:new Date()}]};}});
 assert.equal(all(container).some(n=>n.tagName==='a'&&n.href?.includes('/apk/download')),false);
 await all(container).find(n=>n.tagName==='button'&&n.textContent==='Captured UTRs').onclick();assert.equal(calls.at(-1).body.device,'owned-device-01');assert.match(all(container).map(n=>n.textContent).join(' '),/123456789012/);
 await all(container).find(n=>n.tagName==='button'&&n.textContent==='Masked OTP'&&n.onclick).onclick();assert.equal(calls.at(-1).body.device,'owned-device-01');assert.equal(calls.at(-1).body.includeHistory,undefined);const text=all(container).map(n=>n.textContent).join(' ');assert.match(text,/123456 \[Masked\]/);assert.doesNotMatch(text,/UNSAFE/);
});

test('PostgreSQL: two users stay isolated while Admin sees all tenant device UTRs',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));const {Pool}=require('pg'),server=new Pool({connectionString:url.toString()}),name='user_devices_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});
 t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});
 await pool.query(`CREATE SCHEMA wpay_auth;
 CREATE TABLE wpay_auth.accounts(id uuid,name text,tenant_id text,status text,account_type text);
 CREATE TABLE wpay_auth.eligibility(account_id uuid,approval_status text);
 CREATE TABLE wpay_auth.paired_devices(id uuid,owner_id uuid,source_id text,device_ref text,pairing_id text,valid_from timestamptz,valid_until timestamptz,revoked_at timestamptz);
 CREATE TABLE wpay_auth.resource_links(id uuid,account_id uuid,source_id text,resource_id text,resource_kind text,status text,consent_at timestamptz,verified_at timestamptz,valid_from timestamptz,valid_until timestamptz,revoked_at timestamptz);
 CREATE TABLE wpay_auth.operations_audit(id uuid,actor_id uuid,owner_id uuid,resource_id uuid,action text)`);
 const foreign=randomUUID();for(const [id,tenant,device] of [[owner,'tenant-a','owned-device-01'],[other,'tenant-a','other-device-02'],[foreign,'tenant-b','foreign-device-03']]){
  await pool.query("INSERT INTO wpay_auth.accounts VALUES($1,'Synthetic',$2,'active','user');",[id,tenant]);await pool.query("INSERT INTO wpay_auth.eligibility VALUES($1,'approved')",[id]);await pool.query("INSERT INTO wpay_auth.paired_devices VALUES($1,$2,'legacy-primary',$3,'1',CURRENT_TIMESTAMP-interval '1 day',CURRENT_TIMESTAMP+interval '1 year',NULL)",[randomUUID(),id,device]);
 }
 const source={devices:async links=>links.map(l=>({id:l.device_ref,linked:true})),events:async links=>({events:links.map(l=>({device_id:l.device_ref,otp_length:6,code:'876543',message:'private 876543'}))}),transactions:async links=>({rows:links.map(l=>({device_id:l.device_ref,utr:'123456789012'}))})},devices=new Devices({source}),setup=new DeviceSetup(devices);
 for(const id of [owner,other]){const utr=await setup.utrs(pool,row(id),context(id),{}),otp=await devices.events(pool,row(id),context(id),{});assert.equal(utr.records.length,1);assert.equal(utr.records[0].ownerId,id);assert.equal(otp.events.length,1);assert.equal(otp.events[0].ownerId,id);assert.equal(otp.events[0].code,'123456');assert.doesNotMatch(JSON.stringify(otp),/876543/);}
 assert.equal((await setup.utrs(pool,row(owner),context(owner),{device:'other-device-02'})).records.length,0);
 await assert.rejects(devices.events(pool,row(owner),context(owner),{device:'other-device-02'}),{code:'FORBIDDEN'});
 const admin={principal:{id:randomUUID(),type:'admin',tenantId:'tenant-a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['devices.view','utr_center.view','apk_otp_events.view_all'],adminScope:{tenantIds:['tenant-a']}};
 assert.equal((await setup.utrs(pool,{account_type:'admin'},admin,{includeHistory:true})).records.length,2);assert.equal((await devices.events(pool,{id:admin.principal.id,account_type:'admin'},admin,{includeHistory:true})).events.length,2);
 await pool.query('UPDATE wpay_auth.paired_devices SET revoked_at=CURRENT_TIMESTAMP WHERE owner_id=$1',[owner]);assert.equal((await setup.utrs(pool,row(owner),context(owner),{})).records.length,0);
});
