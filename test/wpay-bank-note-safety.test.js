'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {bank,reason}=require('../lib/wpay/business/validation');
test('bank-specific credential guard preserves user general-reason wording policy',()=>{
 const base={upiId:'test@bank',bankName:'Test Bank',holderName:'Test User',accountNumber:'123456789',ifsc:'TEST0000001',mobile:'9000000001',bankLimitMinor:'10000',accountType:'business',providerName:'Test provider',notes:''};
 for(const route of [base,{...base,routeType:'merchant_qr_bank'},{...base,routeType:'business_upi',accountNumber:'1234',ifsc:''}]){
  for(const notes of ['bank password example','secret example','Bearer example','OTP 123456','PIN 1234'])assert.throws(()=>bank({...route,notes}),{code:'INVALID_INPUT'});
  assert.equal(bank({...route,notes:'Business integration contact'}).notes,'Business integration contact');
 }
 assert.equal(reason('Password help requested'),'Password help requested');
});
