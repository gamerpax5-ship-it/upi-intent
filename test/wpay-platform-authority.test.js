'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildPrincipalContext}=require('../lib/wpay/auth/principal-context'),{authorize}=require('../lib/wpay/authorization-policy');
const permissions=['api_credentials.view','api_credentials.create'];
function input(type='super_admin',grants=permissions,scope={tenantIds:['tenant-a'],platform:true}){
 const binding={accountId:'account-a',subjectId:'subject-a',tenantId:'tenant-a'};
 return {identity:{...binding,permissionVersion:1},account:{id:'account-a',subjectId:'subject-a',tenantId:'tenant-a',type,status:'active',currentPermissionVersion:1,userId:'user-a',merchantId:'merchant-a'},grantRecord:{...binding,permissionVersion:1,grants,adminScope:scope},eligibilityRecord:{...binding,facts:{approvalStatus:'approved'}}};
}
test('platform grants fail closed without explicit true platform scope',()=>{for(const scope of [{tenantIds:['tenant-a']},{tenantIds:['tenant-a'],platform:false}])assert.equal(buildPrincipalContext(input('super_admin',permissions,scope)).reason,'PLATFORM_SCOPE_REQUIRED');});
test('platform scope alone does not confer an absent platform grant',()=>{const built=buildPrincipalContext(input('super_admin',['api_credentials.view']));assert.equal(built.ok,true);assert.equal(authorize({...built.context,permissionId:'api_credentials.create',context:{kind:'create',platform:true}}).allowed,false);});
for(const type of ['admin','employee','user','merchant'])test(type+' cannot acquire platform authority from scope or grants',()=>{assert.equal(buildPrincipalContext(input(type)).ok,false);assert.equal(buildPrincipalContext(input(type,['profile.view'])).ok,false);});
test('authorised SuperAdmin platform scope does not bypass tenant record constraints',()=>{const built=buildPrincipalContext(input());assert.equal(built.ok,true);assert.equal(authorize({...built.context,permissionId:'api_credentials.create',context:{kind:'create',platform:true}}).allowed,true);assert.equal(authorize({...built.context,permissionId:'api_credentials.view',context:{kind:'record',id:'foreign',tenantId:'tenant-b'}}).allowed,false);});
test('revoked grant version invalidates stale identity snapshots',()=>{const value=input();value.account.currentPermissionVersion=2;value.grantRecord.permissionVersion=2;value.grantRecord.grants=['profile.view'];assert.equal(buildPrincipalContext(value).reason,'STALE_PERMISSION_VERSION');});
