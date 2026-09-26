'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PairingService}=require('../lib/wpay/integrations/pairing-service');
const {DeviceSetup}=require('../lib/wpay/operations/device-setup');
test('24-hour pairing adapter requires matching source expiry and keeps legacy default',async()=>{
 const calls=[];let response={pairingCode:'ABCDEFG2',expiresInSeconds:86400};
 const service=new PairingService({origin:'https://pairing.example.invalid',key:'a'.repeat(43),fetchImpl:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>response};}});
 assert.equal(await service.issue({ttlSeconds:86400}),'ABCDEFG2');assert.deepEqual(calls[0].body,{ttlSeconds:86400});
 response.expiresInSeconds=600;await assert.rejects(service.issue({ttlSeconds:86400}),/Invalid pairing service response/);
 assert.equal(await service.issue(),'ABCDEFG2');assert.deepEqual(calls.at(-1).body,{});
 await assert.rejects(service.issue({ttlSeconds:60}),/Invalid pairing expiry/);
 response={revoked:true};assert.equal((await service.revoke('a'.repeat(64))).revoked,true);assert.ok(calls.at(-1).url.endsWith('/revoke'));
 await assert.rejects(service.revoke('invalid'),/Invalid pairing digest/);
});
test('device details enforce ownership before calling source and project only bounded metadata',async()=>{
 const owner='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001',now=new Date(),valid=new Date(+now-3600000);
 const link={id,owner_id:owner,device_ref:'synthetic-device',pairing_id:'1',tenant_id:'a',account_type:'user',user_id:owner,valid_from:valid};
 const c={query:async()=>({rows:[link]})};let reads=0;
 const setup=new DeviceSetup({pairingSource:{devices:async()=>{reads++;return [{id:link.device_ref,linked:true,last_seen_at:now}];},diagnostics:async(device,from)=>{assert.equal(+from,+valid);return [{collected_at:new Date(+now-1000),battery_level:72,latitude:12,longitude:77,raw:{otp:'do-not-project'},code:'do-not-project'},{collected_at:new Date(+valid-1),battery_level:50},{collected_at:new Date(+now+1000)}];}}});
 const row={id:owner,account_type:'user',database_now:now},context={principal:{id:owner,userId:owner,type:'user',tenantId:'a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['user.device_pairing.view'],eligibility:{approvalStatus:'approved'}};
 await assert.rejects(setup.detail(c,{...row,id:'30000000-0000-4000-8000-000000000001'},context,{id}),{code:'FORBIDDEN'});assert.equal(reads,0);
 const result=await setup.detail(c,row,context,{id});assert.equal(result.history.length,1);assert.equal(result.history[0].battery,72);assert.doesNotMatch(JSON.stringify(result),/do-not-project|raw|otp/);
});
