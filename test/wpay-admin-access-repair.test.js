'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {BusinessApi}=require('../lib/wpay/business/api');
const admin=randomUUID(),user=randomUUID(),now=new Date();
const ctx={principal:{id:admin,tenantId:'tenant-a',type:'super_admin',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['users.view','users.commercial.update'],adminScope:{tenantIds:['tenant-a'],platform:true}};
const row={id:admin,account_type:'super_admin',auth_method:'password',password_at:now,created_at:now,database_now:now,status:'active',approval_status:'approved',security_version:1,session_security_version:1,factor_version:0,session_factor_version:0};
test('collection access list uses permitted tenant read scope; missing commercial permission fails closed',async()=>{
 let queried=0;const c={query:async(sql,args)=>{queried++;assert.match(sql,/tenant_id=ANY\(\$1\)/);assert.deepEqual(args,[['tenant-a']]);return {rows:[{id:user}]};}};
 assert.deepEqual((await new BusinessApi().run(c,row,ctx,'business/user-access',{})).users,[{id:user}]);
 await assert.rejects(new BusinessApi().run(c,row,{...ctx,grants:['users.view']},'business/user-access',{}),e=>e.code==='FORBIDDEN');assert.equal(queried,1);
});
test('collection access update authorizes the target record and rejects foreign tenant without a write',async()=>{
 const body={userId:user,freeSetup:true,unlimitedCollection:false,reason:'Reviewed setup access'};let writes=0;
 const c={query:async(sql)=>{if(sql.startsWith('SELECT id,tenant_id'))return {rows:[{id:user,tenant_id:'tenant-b',account_type:'user',user_id:user}]};writes++;throw Error('Unexpected write');}};
 await assert.rejects(new BusinessApi().run(c,row,ctx,'business/user-access/update',body),e=>e.code==='FORBIDDEN');assert.equal(writes,0);
});
test('parking selector metadata contains only allowed workspaces and no implicit create grant',async()=>{
 const parking=require('../lib/wpay/parking/api'),context={...ctx,grants:['parking.view']};
 const core={admin:async(c,tenants)=>{assert.deepEqual(tenants,['tenant-a']);return {beneficiaries:[],orders:[],reviews:[]};}};
 const result=await parking.run(core,{},row,context,'parking/admin',{});assert.deepEqual(result.tenants,['tenant-a']);assert.equal(result.canCreate,false);
});
