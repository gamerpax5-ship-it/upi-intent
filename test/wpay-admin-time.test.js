"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validIst,requiresIst}=require('../lib/wpay/auth/runtime/admin-time-check');
const {MfaService}=require('../lib/wpay/auth/runtime/mfa-service');
test('IST exact minute handles 24-hour conversion, leading zeroes and date rollover',()=>{
 for(const [utc,code]of [['2026-09-22T13:31:59Z','1901'],['2026-09-22T18:30:00Z','0000'],['2026-09-22T18:35:00Z','0005'],['2026-09-22T06:30:00Z','1200']])assert.equal(validIst(code,utc),true);
 for(const value of ['1900','1902','701',1901,'１９０１','1901 ',null])assert.equal(validIst(value,'2026-09-22T13:31:00Z'),false);
 assert.equal(validIst('1901','bad date'),false);assert.equal(validIst('1901',null),false);
});
function setup(type='admin'){
 let attempts=0,promoted=0,verified=0;const row={id:'test-admin',account_type:type,database_now:new Date('2026-09-22T13:31:15Z'),factor_version:1,encrypted_secret:{},mfa_enabled:true};
 const repo={withChallenge:async(_,fn)=>fn({query:async()=>({rows:[],rowCount:0})},row,{purpose:'login'}),attempt:async()=>{attempts++;return true;},consume:async()=>{},acceptStep:async()=>{},promote:async()=>{promoted++;}};
 const crypto={libraries(){},open(){return 'synthetic-secret';},verify:async(_,code)=>{verified++;return code==='123456'?123:null;}};
 return {mfa:new MfaService(repo,crypto,()=>{}),stats:()=>({attempts,promoted,verified})};
}
test('admin cannot bypass time check through generic entry, and wrong clock consumes an attempt',async()=>{
 const f=setup();await assert.rejects(f.mfa.challenge('A'.repeat(43),'verify',{code:'123456',istCode:'1900'}),e=>e.code==='MFA_FAILED');assert.deepEqual(f.stats(),{attempts:1,promoted:0,verified:0});
 await assert.rejects(f.mfa.challenge('A'.repeat(43),'verify',{code:'123456'}),e=>e.code==='INVALID_INPUT');assert.equal(f.stats().promoted,0);
});
test('correct clock never replaces authenticator, and both are required for admin session',async()=>{
 const f=setup('super_admin');await assert.rejects(f.mfa.challenge('A'.repeat(43),'verify',{code:'000000',istCode:'1901'},'admin'),e=>e.code==='MFA_FAILED');assert.equal(f.stats().promoted,0);
 assert.equal((await f.mfa.challenge('A'.repeat(43),'verify',{code:'123456',istCode:'1901'},'admin')).stage,'authenticated');assert.equal(f.stats().promoted,1);
});
test('user and merchant MFA contracts remain unchanged',async()=>{
 for(const role of ['user','merchant','employee']){assert.equal(requiresIst({account_type:role}),false);const f=setup(role);assert.equal((await f.mfa.challenge('A'.repeat(43),'verify',{code:'123456'},role)).stage,'authenticated');}
});
test('recovery cannot bypass the admin time check',async()=>{const f=setup();await assert.rejects(f.mfa.challenge('A'.repeat(43),'recover',{recoveryCode:'synthetic',istCode:'1900'}),e=>e.code==='MFA_FAILED');assert.equal(f.stats().promoted,0);});
