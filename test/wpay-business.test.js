"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const money=require('../lib/wpay/business/money'),routing=require('../lib/wpay/business/routing'),{bank}=require('../lib/wpay/business/validation');
const businessLocales=require('../dev/wpay-auth/web/business-locales');
test('money preserves large exact values, sub-paisa rounding and negative display without Number conversion',()=>{
 assert.equal(money.fromDecimal('1234567890123456789012.34'),'123456789012345678901234');
 assert.equal(money.fee('101','1.25'),'1');assert.equal(money.fee('79','1.25'),'0');assert.equal(money.format('-1'),'−0.01'.replace('−','-'));
 for(const amount of [1,0.1,'1e5','1.001','-1','01.00','NaN'])assert.throws(()=>money.fromDecimal(amount));
 assert.throws(()=>money.fee('100','100.000001'));assert.equal(money.fromDecimal('0.000001','USDT'),'1');
});
const now=Date.now(),candidate={routeId:'route-b',userId:'user-b',priority:10,userStatus:'active',approval:'approved',mfaEnabled:true,sessionReady:true,operationsEnabled:true,funded:true,assignmentActive:true,effectiveFrom:new Date(now-1000),bankApproved:true,bankVerified:true,bankStatus:'running',bankFrozen:false,bankDeactivated:false,minMinor:'100',maxMinor:'10000',bankRemainingMinor:'9000',availableMinor:'8000'};
test('routing deterministically chooses priority, remaining capacity, then stable identifiers',()=>{
 const low={...candidate,routeId:'low',priority:20,availableMinor:'9000'},high={...candidate,routeId:'high',priority:5,availableMinor:'2000'};
 assert.equal(routing.select([low,candidate,high],'1000',now).routeId,'high');
 assert.equal(routing.select([low,candidate,{...candidate,userId:'user-a',routeId:'route-a'}],'1000',now).routeId,'route-a');
 assert.equal(routing.select([{...candidate,availableMinor:'2000'},candidate],'3000',now).availableMinor,'8000');
});
test('eligibility rejects missing MFA/funding, nonoperational accounts, frozen/stopped banks and ticket breaches',()=>{
 for(const patch of [{sessionReady:false},{mfaEnabled:false},{funded:false},{operationsEnabled:false},{approval:'pending'},{userStatus:'suspended'},{assignmentActive:false},{effectiveFrom:new Date(now+1000)},{bankApproved:false},{bankVerified:false},{bankStatus:'stopped'},{bankFrozen:true},{bankDeactivated:true},{availableMinor:'999'},{bankRemainingMinor:'999'},{minMinor:'1001'},{maxMinor:'999'}])assert.equal(routing.select([{...candidate,...patch}],'1000',now),null);
});
test('bank identity accepts explicit business notes but rejects credential fields and unsafe free text',()=>{
 const input={upiId:'synthetic.user@bank',bankName:'Synthetic Bank',holderName:'Synthetic Holder',accountNumber:'123456780001',ifsc:'TEST0000001',mobile:'+919000000001',bankLimitMinor:'100000',accountType:'business',providerName:'Synthetic Provider',notes:'Business integration contact'};
 assert.equal(bank(input).notes,input.notes);for(const extra of [{password:'x'},{otp:'123456'},{privateKey:'x'}])assert.throws(()=>bank({...input,...extra}));
 for(const notes of ['Bank password example','PIN 1234','OTP 123456','private key: example'])assert.throws(()=>bank({...input,notes}));
});
test('every new business label has nonempty English, Russian and Simplified Chinese translations',()=>{
 for(const [key,values] of Object.entries(businessLocales.labels)){assert.equal(values.length,3,key);for(const value of values)assert.ok(typeof value==='string'&&value.trim().length>0,key);}
 for(const [locale,title] of [['en','Available'],['ru','Доступно'],['zh-CN','可用']])assert.equal(businessLocales.translate(locale,'available'),title);
});
