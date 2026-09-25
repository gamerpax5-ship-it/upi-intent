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
test('PostgreSQL: both route types persist full review details and identity edits require new approval',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));const {Pool}=require('pg'),{randomUUID}=require('node:crypto'),{migrate,transaction}=require('../lib/wpay/db/migrations'),{BusinessCore}=require('../lib/wpay/business/core');
 const server=new Pool({connectionString:url.toString()}),name='bank_routes_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});await migrate(pool);
 const owner=randomUUID(),other=randomUUID();for(const id of [owner,other]){await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id) VALUES($1,$2,'synthetic','Test User',$3,'user','active',$1)",[id,randomUUID(),id+'@example.invalid']);await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[id]);}
 const core=new BusinessCore(),call=fn=>transaction(pool,fn),saved=await call(c=>core.saveBank(c,owner,{details:business}));assert.equal(saved.status,'draft');
 await call(c=>core.transitionBank(c,saved.id,1,'submit',owner,{ownerId:owner}));await call(c=>core.transitionBank(c,saved.id,1,'approve',owner));const review=await core.bankRecord(pool,saved.id);assert.deepEqual(review.details,bank(business));assert.equal(review.approved_version,1);assert.equal(review.verified_version,null);
 const key=(await pool.query('SELECT account_key FROM wpay_auth.business_bank_identities WHERE bank_id=$1 AND version=1',[saved.id])).rows[0].account_key;assert.equal(key,accountDigest(review.details));
 await assert.rejects(call(c=>core.saveBank(c,other,{bankId:saved.id,version:1,details:business})),{code:'FORBIDDEN'});
 const edited=await call(c=>core.saveBank(c,owner,{bankId:saved.id,version:1,details:{...business,upiId:'new@upi'}}));assert.equal(edited.version,2);const changed=await core.bankRecord(pool,saved.id);assert.equal(changed.status,'submitted');assert.equal(changed.approved_version,null);assert.equal(changed.verified_version,null);
 assert.equal((await pool.query('SELECT details FROM wpay_auth.business_bank_versions WHERE bank_id=$1 AND version=1',[saved.id])).rows[0].details.upiId,'test@upi');
 const qr=await call(c=>core.saveBank(c,owner,{details:{...business,routeType:'merchant_qr_bank',accountNumber:'123456789',ifsc:'ABCD0123456'}}));assert.equal((await core.bankRecord(pool,qr.id)).details.accountNumber,'123456789');
});
