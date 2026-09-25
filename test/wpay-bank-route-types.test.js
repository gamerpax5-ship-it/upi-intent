'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {bank}=require('../lib/wpay/business/validation'),{accountDigest,PaymentEvidence}=require('../lib/wpay/onboarding/evidence');
const business={routeType:'business_upi',upiId:'TEST@upi',bankName:'Test Bank',holderName:'Test User',accountNumber:'1234',ifsc:'',mobile:'9876543210',bankLimitMinor:'100000',accountType:'business',providerName:'Business provider',notes:''};
test('Business UPI accepts last four digits while retaining strict identity and non-secret notes',()=>{
 const result=bank(business);assert.equal(result.upiId,'test@upi');assert.equal(result.accountNumber,'1234');
 for(const change of [{accountNumber:'123'},{accountNumber:'123456789'},{ifsc:'ABCD0123456'},{mobile:''},{bankName:''},{providerName:''},{accountType:'personal'},{routeType:'unknown'},{notes:'bank password here'},{password:'secret'}])assert.throws(()=>bank({...business,...change}),{code:'INVALID_INPUT'});
});
test('Merchant QR needs full bank identity and legacy bank hashes are preserved',()=>{
 const details={...business,routeType:'merchant_qr_bank',accountNumber:'123456789',ifsc:'ABCD0123456'};assert.equal(bank(details).routeType,'merchant_qr_bank');assert.throws(()=>bank({...details,accountNumber:'1234'}),{code:'INVALID_INPUT'});
 const legacy={...details};delete legacy.routeType;assert.equal(bank(legacy).routeType,undefined);assert.equal(accountDigest(legacy),createHash('sha256').update('ABCD0123456:123456789').digest('hex'));
});
test('last-four identities bind UPI and bank; a proof for another route never verifies',()=>{
 const details=bank(business),digest=accountDigest(details);assert.notEqual(digest,accountDigest({...details,upiId:'other@upi'}));assert.notEqual(digest,accountDigest({...details,bankName:'Another Bank'}));
 const now=Date.now(),challenge={id:'challenge',owner_id:'owner',bank_id:'bank',bank_version:1,expected_upi:details.upiId,account_digest:digest,amount_minor:'110',created_at:new Date(now-10000),expires_at:new Date(now+10000)},proof={verified:true,status:'credited',currency:'INR',challengeId:'challenge',ownerId:'owner',bankId:'bank',bankVersion:1,receivingUpi:details.upiId,accountDigest:digest,amountMinor:'110',paymentId:'trusted-payment',source:'bank-provider',receivedAt:new Date(now-1000)};
 const evidence=new PaymentEvidence();assert.ok(evidence.validate(challenge,proof));assert.equal(evidence.validate(challenge,{...proof,accountDigest:accountDigest({...details,upiId:'other@upi'})}),null);assert.equal(evidence.validate(challenge,{...proof,source:'sms'}),null);
});
