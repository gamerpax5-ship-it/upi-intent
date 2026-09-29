'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {PERMISSION_CATALOG,getEmployeePermissionGroups} = require('../lib/wpay/permission-catalog');
const {validateGrants} = require('../lib/wpay/authorization-policy');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dev/wpay-auth/web/admin-v5-pages.js'),'utf8'),context);
const access = context.WPayAdminV5Pages.employeePageAccess;
const requiredPermissions = ['profile.view','account_security.view','account_security.update'];
function data() {
  return {permissions:PERMISSION_CATALOG.filter(p=>p.employeeDelegable&&!p.restricted),permissionGroups:getEmployeePermissionGroups(),requiredPermissions};
}
function toggle(model,id,checked) {
  const page=model.pages.find(p=>p.id===id);
  assert.ok(page, id);
  assert.equal(page.unavailable,false);
  page.checked=checked;page.changed=true;
}

test('ledger and API pages never implicitly grant their explicit high-risk actions',()=>{
 const model=access(data());toggle(model,'ledger',true);toggle(model,'api_credentials',true);
 for(const id of ['ledger.adjust','api_credentials.create','api_credentials.revoke'])assert.ok(!model.selection().includes(id));
 toggle(model,'ledger.adjust',true);toggle(model,'api_credentials.create',true);
 assert.ok(model.selection().includes('ledger.adjust'));assert.ok(model.selection().includes('api_credentials.create'));assert.ok(!model.selection().includes('api_credentials.revoke'));
 assert.equal(validateGrants(Array.from(model.selection()),'employee').allowed,true);
});
test('one Users selection grants all delegable actions including commercial settings',()=>{
  const d=data(),model=access(d);
  toggle(model,'users',true);
  const selected=Array.from(model.selection());
  for(const p of d.permissions.filter(p=>p.module==='users')) assert.ok(selected.includes(p.id),p.id);
  assert.ok(selected.includes('users.commercial.update'));
  assert.equal(validateGrants(selected,'employee').allowed,true);
  assert.equal(model.pages.filter(p=>p.id==='users').length,1);
});
test('editing unrelated fields preserves limited page access; toggling replaces the entire page',()=>{
  const existing=[...requiredPermissions,'users.view'],model=access(data(),existing);
  assert.equal(model.pages.find(p=>p.id==='users').partial,true);
  assert.deepEqual(Array.from(model.selection()),existing.sort());
  toggle(model,'users',true);
  assert.ok(model.selection().includes('users.commercial.update'));
  toggle(model,'users',false);
  assert.deepEqual(Array.from(model.selection()),[...requiredPermissions].sort());
});
test('all selectable pages still satisfy server authorization and exclude restricted actions',()=>{
  const d=data(),model=access(d);
  for(const page of model.pages) if(!page.unavailable) toggle(model,page.id,true);
  const selected=Array.from(model.selection());
  assert.equal(validateGrants(selected,'employee').allowed,true);
  for(const p of PERMISSION_CATALOG.filter(p=>p.restricted||!p.employeeDelegable)) assert.ok(!selected.includes(p.id),p.id);
});
test('partial catalogs preserve existing delegable access instead of silently deleting it',()=>{
  const d=data();d.permissionGroups=[];
  const existing=[...requiredPermissions,'users.view'];
  assert.deepEqual(Array.from(access(d,existing).selection()),existing.sort());
  d.permissionGroups=getEmployeePermissionGroups().filter(g=>g.id!=='users');
  assert.deepEqual(Array.from(access(d,existing).selection()),existing.sort());
});
test('missing required access and existing grants outside Admin scope fail closed',()=>{
  const d=data();d.permissions=d.permissions.filter(p=>p.id!=='profile.view');
  assert.throws(()=>access(d),/Required account access/);
  assert.throws(()=>access(data(),[...requiredPermissions,'unknown.permission']),/outside your delegable scope/);
});
test('missing dependencies cannot be expanded beyond the Admin scope',()=>{
  const d=data();d.permissions=d.permissions.filter(p=>p.id!=='users.view');
  const model=access(d);
  assert.equal(model.pages.find(p=>p.id==='users').unavailable,true);
  assert.deepEqual(Array.from(model.selection()),[...requiredPermissions].sort());
});
