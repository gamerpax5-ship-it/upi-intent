'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const v=require('../lib/wpay/auth/runtime/validation'),{hashPassword,verifyPassword}=require('../lib/wpay/auth/runtime/passwords');
const browser=require('../dev/wpay-auth/web/password-policy');
test('User/Merchant establishment requires all four character classes and eight exact code points',()=>{
 for(const role of ['user','merchant']){
  for(const p of ['Ab1!xyz','abcdefgh','ABCDEFGH','Abcdefg!','Abcdef12','Ab12    ','12345678','Ａb12345!','Abcdefg\u200b','Ab1!\ud800abcd'])assert.throws(()=>v.password(p,role),{code:'INVALID_INPUT'});
  for(const p of ['Ab1!xyza','Longer compliant password 9!',' Ab1!xyz ','Ab12345😀','Ab1!e\u0301xy'])assert.equal(v.password(p,role),p);
 }
});
test('browser/server policy agrees on unicode, whitespace, exact bytes and boundaries',()=>{
 const samples=['Ab1!xyza','Ab1!xyz','Ab12345 ','Ab12345😀','Ab1!e\u0301xy','Ab1!éxyz','Ab1!'+ '😀'.repeat(124),'Ab1!'+ '😀'.repeat(125),'\ud800'.repeat(15),'😀'.repeat(128),'old password without digits',null];
 for(const value of samples)for(const kind of ['establish','privileged','login']){let expected=true;try{kind==='login'?v.passwordInput(value):v.password(value,kind==='establish'?'user':undefined);}catch{expected=false;}assert.equal(browser.valid(value,kind),expected,kind);}
 assert.equal(v.password('😀'.repeat(128)),'😀'.repeat(128));assert.throws(()=>v.password('a'.repeat(129)));
 for(const locale of ['en','ru','zh-CN'])for(const key of ['establish','login','privileged','change','changeHelp'])assert.ok(browser.text(locale,key).length>0);
});
test('privileged establishment stays at 15 and public role forgery fails closed',async()=>{
 for(const role of ['admin','super_admin','employee',undefined,'USER','unknown']){assert.throws(()=>v.password('Ab1!xyza',role));await assert.rejects(hashPassword('Ab1!xyza',role));assert.equal(v.password('old password without digits',role),'old password without digits');}
 for(const accountType of ['admin','super_admin','employee','User'])assert.throws(()=>v.registration({name:'Synthetic User',email:'person@example.invalid',password:'Ab1!xyza',accountType}));
 assert.throws(()=>v.login({email:'person@example.invalid',password:'Ab1!xyza',accountType:'user'}));
});
test('actual scrypt accepts new shorter passwords and preserves old-policy verification without normalization',async()=>{
 for(const role of ['user','merchant']){const p='Ab1!xyza',record=await hashPassword(p,role);assert.equal(await verifyPassword(p,record),true);assert.equal(await verifyPassword('Ab1!xyzb',record),false);assert.equal(await verifyPassword(p+' ',record),false);}
 const old='old password without digits',record=await hashPassword(old);assert.equal(await verifyPassword(old,record),true);assert.throws(()=>v.password(old,'user'));
 const exact=' Ab1!e\u0301xy ',unicode=await hashPassword(exact,'user');assert.equal(await verifyPassword(exact,unicode),true);assert.equal(await verifyPassword(exact.normalize('NFC'),unicode),false);assert.equal(await verifyPassword(exact.trim(),unicode),false);
});
