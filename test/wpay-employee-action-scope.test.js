'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {authorize,validateGrants}=require('../lib/wpay/authorization-policy'),{getPermission,getEmployeePermissionGroups}=require('../lib/wpay/permission-catalog');
test('explicit Employee financial/API actions require dependencies, current grants and matching tenant',()=>{
 for(const id of ['ledger.adjust','api_credentials.create','api_credentials.revoke','utr_center.approve','finance_expenses.manage']){
  const p=getPermission(id),grants=[...(p.dependencies||[]),id];assert.equal(validateGrants(grants,'employee').allowed,true);if(p.dependencies.length)assert.equal(validateGrants([id],'employee').reason,'MISSING_DEPENDENCY');
  const context={principal:{id:'staff',type:'employee',tenantId:'a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants,adminScope:{tenantIds:['a']},permissionId:id};
  const resource={kind:id==='api_credentials.create'?'create':'record',id:'target',tenantId:'a',ownerType:'user',ownerId:'user',accountId:'target',accountOwnerId:'user',accountTenantId:'a'};
  assert.equal(authorize({...context,context:resource}).allowed,true,id);
  assert.equal(authorize({...context,grants:[],context:resource}).allowed,false,id);
  assert.equal(authorize({...context,currentPermissionVersion:2,context:resource}).allowed,false,id);
  assert.equal(authorize({...context,context:{...resource,tenantId:'outside',accountTenantId:'outside'}}).allowed,false,id);
 }
 for(const id of ['employees.create','employees.permissions.update','employee_management.update','security.configure','admin_authority.manage'])assert.equal(validateGrants([id],'employee').allowed,false,id);
});
test('high risk financial and API choices remain explicitly marked and platform controls remain unavailable',()=>{
 const choices=getEmployeePermissionGroups().flatMap(g=>g.permissions);
 for(const id of ['ledger.adjust','api_credentials.create','api_credentials.revoke']){const p=choices.find(x=>x.id===id);assert.equal(p.selectable,true);assert.ok(p.highRisk);}
 assert.equal(choices.find(x=>x.id==='security.configure').selectable,false);
});
