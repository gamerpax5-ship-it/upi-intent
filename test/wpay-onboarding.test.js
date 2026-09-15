"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {verificationQr}=require('../lib/wpay/onboarding/deeplink'),{PaymentEvidence,accountDigest}=require('../lib/wpay/onboarding/evidence'),statements=require('../lib/wpay/onboarding/statements');
const {csv}=require('./helpers/wpay-onboarding-setup');
test('onboarding executes the protected UPI builder and real QR library with exact paisa',async()=>{
 const bank={id:randomUUID(),owner_id:randomUUID(),version:1,details:{upiId:'synthetic.test@bank',holderName:'Synthetic & Test'}};
 for(const amount of [100,180,930,999]){const c={id:randomUUID(),owner_id:bank.owner_id,bank_id:bank.id,bank_version:1,expected_upi:bank.details.upiId,amount_minor:amount};const result=await verificationQr(c,bank);assert.match(result.qr,/^data:image\/png;base64,iVBOR/);assert.equal(new URL(result.uri).searchParams.get('am'),(amount/100).toFixed(2));await assert.rejects(verificationQr({...c,owner_id:randomUUID()},bank),{code:'FORBIDDEN'});}
});
test('onboarding bounded parser preserves CSV/XLS/XLSX extraction without financial output',async()=>{
 const XLSX=require('../public/vendor/smart-upi-parser-runtime/xlsx.full.min.js'),book=XLSX.read(csv,{type:'string'});
 for(const format of ['csv','xls','xlsx']){const bytes=Buffer.from(XLSX.write(book,{type:'buffer',bookType:format==='xls'?'biff8':format})),result=await statements.parseStatement(statements.fileInput(format,bytes.toString('base64')),format);assert.equal(result.ok,true);assert.equal(result.credits,1);assert.deepEqual(Object.keys(result).sort(),['credits','ok','resultDigest','rows']);}
 for(const [format,base64]of [['pdf','YQ=='],['csv',''],['csv','###'],['csv',Buffer.alloc(1048577).toString('base64')]])assert.throws(()=>statements.fileInput(format,base64),{code:'INVALID_INPUT'});
 assert.equal((await statements.parseStatement(Buffer.from('not a statement'),'csv')).ok,false);
 assert.equal(statements.fileInput('csv',Buffer.alloc(1048576).toString('base64')).length,1048576);
});
test('trusted evidence contract rejects unbound, non-final, wrong-source and replay-window candidates',async()=>{
 const c={id:randomUUID(),owner_id:randomUUID(),bank_id:randomUUID(),bank_version:1,expected_upi:'synthetic@bank',account_digest:accountDigest({ifsc:'TEST0000001',accountNumber:'1234567890'}),amount_minor:180,created_at:new Date(Date.now()-10000),expires_at:new Date(Date.now()+10000)};
 const good={verified:true,status:'credited',currency:'INR',challengeId:c.id,ownerId:c.owner_id,bankId:c.bank_id,bankVersion:1,receivingUpi:c.expected_upi,accountDigest:c.account_digest,amountMinor:'180',paymentId:'synthetic-payment-0001',source:'synthetic-test',receivedAt:new Date()};
 assert.equal(await new PaymentEvidence({verify:async()=>good}).lookup(c),null);
 assert.ok(await new PaymentEvidence({verify:async()=>good,allowSynthetic:true}).lookup(c));
 for(const changed of [{verified:false},{status:'pending'},{source:'legacy-success'},{currency:'USD'},{challengeId:randomUUID()},{ownerId:randomUUID()},{bankId:randomUUID()},{bankVersion:2},{receivingUpi:'other@bank'},{accountDigest:'0'.repeat(64)},{amountMinor:'181'},{receivedAt:new Date(+c.created_at-1)},{receivedAt:c.expires_at}])assert.equal(await new PaymentEvidence({verify:async()=>({...good,...changed}),allowSynthetic:true}).lookup(c),null);
});
