"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/wpay-9a-fixture');

test('Employee creation accepts an Admin-set permanent password while legacy omission stays compatible',async t=>{
 const f=await fixture(t),{service,call}=f;
 const permissions=['profile.view','account_security.view','account_security.update'];
 const password='Synthetic direct Employee password 2026!';
 const direct=await call('admin','operations/employee/create',{name:'Direct Employee',email:'direct-employee@example.invalid',password,permissions,tenantIds:['wpay-auth-development']});
 assert.equal(direct.passwordConfigured,true);assert.equal(direct.passwordResetRequired,false);assert.equal(direct.mfaRequired,true);assert.equal(Object.hasOwn(direct,'oneTimePassword'),false);
 const login=await service.login({email:direct.email,password},'127.0.0.1','employee');
 assert.equal(login.stage,'enroll');

 const legacy=await call('admin','operations/employee/create',{name:'Legacy Employee',email:'legacy-employee@example.invalid',permissions,tenantIds:['wpay-auth-development']});
 assert.equal(legacy.passwordConfigured,false);assert.equal(legacy.passwordResetRequired,true);assert.equal(typeof legacy.oneTimePassword,'string');
 const legacyLogin=await service.login({email:legacy.email,password:legacy.oneTimePassword},'127.0.0.1','employee');
 assert.equal(legacyLogin.stage,'password-reset');
});
