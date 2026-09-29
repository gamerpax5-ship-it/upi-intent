'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {inspect,paymentDigest}=require('../lib/wpay/onboarding/setup-evidence'),{accountDigest}=require('../lib/wpay/onboarding/evidence');
test('selected UTR narrows trusted candidates and cannot manufacture evidence or bypass replay checks',async()=>{
 const id=randomUUID(),bank={id:randomUUID(),owner_id:id,version:1,details:{upiId:'test@bank',mobile:'9000000001',accountNumber:'123456789',ifsc:'TEST0000001'}};
 const c={id:randomUUID(),owner_id:id,bank_id:bank.id,bank_version:1,expected_upi:'test@bank',account_digest:accountDigest(bank.details),amount_minor:100,created_at:new Date(Date.now()-10000),expires_at:new Date(Date.now()+590000)};
 let used=[];const records=['123456789012','123456789013'].map(utr=>({utr,amount:'1.00',status:'CREDIT_RECEIVED',ownerId:id,device:'own',capturedAt:new Date()}));
 const setup={list:async()=>({sourceConnected:true,devices:[{device:'own',ownerId:id,phone:'9000000001',linked:true,status:'online'}]}),utrs:async()=>({records})};
 const db={query:async sql=>({rows:sql.includes('business_audit')?[{device:'own'}]:sql.includes('upi_consumed_evidence')?used:[]})};
 const run=utr=>inspect(setup,db,{id},{},c,bank,utr);
 assert.equal((await run()).state,'ambiguous_evidence');
 assert.equal((await run('123456789012')).proof.digest,paymentDigest('123456789012'));
 assert.equal((await run('999999999999')).proof,null);
 used=[{payment_digest:paymentDigest('123456789012')}];assert.equal((await run('123456789012')).state,'duplicate_evidence');
 for(const invalid of ['1234',123456789012,'<script>'])assert.equal((await run(invalid)).proof,null);
 records[1].amount='2.00';assert.equal((await run('123456789013')).proof,null);
});
