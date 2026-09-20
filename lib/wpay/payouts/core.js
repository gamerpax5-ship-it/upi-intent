"use strict";
const {randomUUID}=require('node:crypto'),ledger=require('../business/ledger'),money=require('../business/money'),v=require('../business/validation'),a=require('./accounting'),input=require('./validation'),uploads=require('./uploads');
const {Withdrawals}=require('./withdrawals');
const {MerchantSettlements}=require('./merchant-settlement');
const claims=require('./claims');
const binding=(kind,id)=>'wpay-payout-'+kind+':'+id;
class Payouts{
 constructor({gateway,crypto,scanner=null}){this.gateway=gateway;this.crypto=crypto;this.scanner=scanner;this.withdrawals=new Withdrawals(crypto);this.merchantSettlements=new MerchantSettlements(crypto);}
 queue(client,userId){return claims.queue(client,userId);}
 expire(client){return claims.expire(client);}
 claim(client,userId,body){return claims.claim(this,client,userId,body);}
 release(client,p,userId){return claims.release(client,p,userId);}
 settle(client,p,actor,reason,admin){return claims.settle(this,client,p,actor,reason,admin);}
 async prepare(operation,body){
  if(operation==='payout/bulk'){
   input.fields(body,['idempotencyKey','file']);v.reference(body.idempotencyKey);const rows=await uploads.bulk(body.file,this.scanner),orders=[],errors=[],refs=new Set();
   for(const {row,values} of rows){
    try{const {amountINR,...rest}=values;if(typeof amountINR!=='string')input.fail();const order=input.order({...rest,amountMinor:money.fromDecimal(amountINR,'INR'),idempotencyKey:body.idempotencyKey+':'+row});if(refs.has(order.reference))input.fail();refs.add(order.reference);orders.push(order);}catch{errors.push({row,error:'Invalid reference, beneficiary, account, IFSC, amount or duplicate reference'});}
   }return {orders,errors};
  }
  if(operation==='payout/submit'){input.fields(body,['id','amountMinor','utr','proof','note']);v.id(body.id);money.minor(body.amountMinor);input.utr(body.utr);input.text(body.note??'',300);return uploads.proof(body.proof,this.scanner);}
  return null;
 }
 project(r){return {id:r.id,reference:r.reference,amountMinor:r.amount_minor,currency:'INR',percentageFeeMinor:r.percentage_fee_minor,fixedFeeMinor:r.fixed_fee_minor,fixedFeeCurrency:'INR',reserveMinor:r.reserve_minor,status:r.state,createdAt:r.created_at,completedAt:r.completed_at,claimedAt:r.claimed_at??null,submittedAt:r.submitted_at??null,claimExpiresAt:r.claim_expires_at??null};}
 async create(client,merchantId,body,batchId=null){
  const value=input.order(body);if(money.minor(value.amountMinor)>money.MAX)input.fail();await ledger.lock(client);await this.gateway.merchant(client,merchantId);
  const fingerprint=ledger.digest(value),prior=(await client.query('SELECT * FROM wpay_auth.payout_orders WHERE merchant_id=$1 AND (reference=$2 OR idempotency_key=$3)',[merchantId,value.reference,value.idempotencyKey])).rows;
  if(prior.length){if(prior.length!==1||prior[0].payload_digest!==fingerprint||(batchId!==null&&prior[0].batch_id!==batchId))input.fail('CONFLICT');return this.project(prior[0]);}
  const terms=await a.terms(client,merchantId);if(terms.settings.fixedFeeCurrency!=='INR')input.fail('PAYOUT_FEE_CURRENCY');
  const percentage=money.fee(value.amountMinor,terms.settings.payoutFee),fixed=money.fromDecimal(terms.settings.fixedPayoutFee,'INR'),total=(BigInt(value.amountMinor)+BigInt(percentage)+BigInt(fixed)).toString();
  if(BigInt((await ledger.summary(client,merchantId)).merchantAvailable)<BigInt(total))input.fail('INSUFFICIENT_BALANCE');
  const id=randomUUID(),snapshot={merchant:terms,rounding:'floor-to-minor-unit',fixedFeeCurrency:'INR'},endpoint=(await client.query('SELECT id FROM wpay_auth.gateway_endpoints WHERE merchant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[merchantId])).rows[0];
  const beneficiary={beneficiaryName:value.beneficiaryName,bankName:value.bankName,accountNumber:value.accountNumber,ifsc:value.ifsc,upiId:value.upiId,note:value.note};
  const row=(await client.query(`INSERT INTO wpay_auth.payout_orders(id,merchant_id,reference,idempotency_key,payload_digest,encrypted_beneficiary,amount_minor,percentage_fee_minor,fixed_fee_minor,reserve_minor,snapshot,endpoint_id,batch_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[id,merchantId,value.reference,value.idempotencyKey,fingerprint,this.crypto.seal(JSON.stringify(beneficiary),binding('beneficiary',id)),value.amountMinor,percentage,fixed,total,snapshot,endpoint?.id||null,batchId])).rows[0];
  await a.journal(client,id,'merchant_payout_reserve',merchantId,ledger.pair(merchantId,'merchant_payout_reserved',total),snapshot);
  await a.event(client,{id,owner:merchantId,actor:merchantId,kind:'payout',state:'open'});await this.gateway.emit(client,row,'payout.created','payout');return this.project(row);
 }
 async bulk(client,merchantId,body,prepared){
  if(prepared.errors.length)return {created:false,errors:prepared.errors,orders:[]};await ledger.lock(client);
  const fingerprint=ledger.digest(prepared.orders),prior=(await client.query('SELECT * FROM wpay_auth.payout_batches WHERE merchant_id=$1 AND idempotency_key=$2',[merchantId,body.idempotencyKey])).rows[0];
  if(prior){if(prior.payload_digest!==fingerprint)input.fail('CONFLICT');return {created:true,errors:[],orders:(await client.query('SELECT * FROM wpay_auth.payout_orders WHERE batch_id=$1 ORDER BY created_at,id',[prior.id])).rows.map(r=>this.project(r))};}
  const id=randomUUID();await client.query('INSERT INTO wpay_auth.payout_batches(id,merchant_id,idempotency_key,payload_digest) VALUES($1,$2,$3,$4)',[id,merchantId,body.idempotencyKey,fingerprint]);
  const orders=[];for(const order of prepared.orders)orders.push(await this.create(client,merchantId,order,id));return {created:true,errors:[],orders};
 }
 async cancel(client,row,actor){
  await ledger.lock(client);row=(await client.query('SELECT * FROM wpay_auth.payout_orders WHERE id=$1 FOR UPDATE',[row.id])).rows[0];if(row.state==='cancelled')return this.project(row);if(row.state!=='open')input.fail('CONFLICT');
  await a.journal(client,row.id,'merchant_payout_release',actor,ledger.pair(row.merchant_id,'merchant_payout_reserved',row.reserve_minor,'INR','debit'),row.snapshot);
  row=(await client.query("UPDATE wpay_auth.payout_orders SET state='cancelled',completed_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",[row.id])).rows[0];
  await a.event(client,{id:row.id,owner:row.merchant_id,actor,kind:'payout',state:'cancelled',reason:'Cancelled while open'});await this.gateway.emit(client,row,'payout.cancelled','payout');return this.project(row);
 }
 async submit(client,row,userId,body,proof){
  await ledger.lock(client);row=(await client.query('SELECT * FROM wpay_auth.payout_orders WHERE id=$1 FOR UPDATE',[row.id])).rows[0];
  const claim=(await client.query("SELECT *,CURRENT_TIMESTAMP AS now FROM wpay_auth.payout_claims WHERE payout_id=$1 AND user_id=$2 AND state IN('active','submitted','consumed') ORDER BY created_at DESC LIMIT 1",[row.id,userId])).rows[0];if(!claim)input.fail('FORBIDDEN');
  if(body.amountMinor!==row.amount_minor)input.fail('PAYOUT_AMOUNT');
  const fingerprint=ledger.digest({amount:body.amountMinor,utr:body.utr,proof:proof.digest,note:body.note??''}),previous=(await client.query('SELECT payload_digest FROM wpay_auth.payout_submissions WHERE payout_id=$1',[row.id])).rows[0];
  if(previous){if(previous.payload_digest!==fingerprint)input.fail('CONFLICT');return {id:row.id,status:row.state,accountingFinal:false};}
  if(row.state!=='claimed'||claim.state!=='active'||+claim.expires_at<=+claim.now)input.fail('CONFLICT');
  const economicDigest=ledger.digest({network:'INR',reference:body.utr});if((await client.query('SELECT 1 FROM wpay_auth.payout_economic_references WHERE digest=$1',[economicDigest])).rowCount)input.fail('DUPLICATE_TRANSFER');
  const proofId=randomUUID(),submissionId=randomUUID();
  await client.query('INSERT INTO wpay_auth.payout_proofs(id,payout_id,owner_id,extension,size,digest,encrypted_bytes,scan_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[proofId,row.id,userId,proof.extension,proof.size,proof.digest,this.crypto.seal(proof.bytes.toString('base64'),binding('proof',proofId)),proof.scanState]);
  await client.query("INSERT INTO wpay_auth.payout_economic_references(digest,kind,resource_id) VALUES($1,'payout',$2)",[economicDigest,row.id]);
  await client.query('INSERT INTO wpay_auth.payout_submissions(id,payout_id,claim_id,proof_id,utr_digest,encrypted_evidence,payload_digest) VALUES($1,$2,$3,$4,$5,$6,$7)',[submissionId,row.id,claim.id,proofId,economicDigest,this.crypto.seal(JSON.stringify({utr:body.utr,note:body.note??''}),binding('evidence',submissionId)),fingerprint]);
  await client.query("UPDATE wpay_auth.payout_claims SET state='submitted' WHERE id=$1",[claim.id]);await client.query("UPDATE wpay_auth.payout_orders SET state='submitted' WHERE id=$1",[row.id]);
  await a.event(client,{id:row.id,owner:row.merchant_id,actor:userId,kind:'payout',state:'submitted',reason:'Payment claim received; no accounting finalized'});return {id:row.id,status:'submitted',accountingFinal:false};
 }
 async reject(client,row,actor,reason){
  v.reason(reason);await ledger.lock(client);row=(await client.query('SELECT * FROM wpay_auth.payout_orders WHERE id=$1 FOR UPDATE',[row.id])).rows[0];if(row.state==='merchant_rejected_review')return this.project(row);if(row.state!=='submitted')input.fail('CONFLICT');
  row=(await client.query("UPDATE wpay_auth.payout_orders SET state='merchant_rejected_review' WHERE id=$1 RETURNING *",[row.id])).rows[0];
  await a.event(client,{id:row.id,owner:row.merchant_id,actor,kind:'payout',state:row.state,reason});await this.gateway.emit(client,row,'payout.rejected_review','payout');return this.project(row);
 }
 async notPaid(client,row,actor,reason){
  v.reason(reason);await ledger.lock(client);row=(await client.query('SELECT * FROM wpay_auth.payout_orders WHERE id=$1 FOR UPDATE',[row.id])).rows[0];if(row.state==='not_paid')return this.project(row);if(row.state!=='merchant_rejected_review')input.fail('CONFLICT');
  const claim=(await client.query("SELECT * FROM wpay_auth.payout_claims WHERE payout_id=$1 AND state='submitted'",[row.id])).rows[0];if(!claim)input.fail('CONFLICT');
  await a.journal(client,row.id,'merchant_payout_release',actor,ledger.pair(row.merchant_id,'merchant_payout_reserved',row.reserve_minor,'INR','debit'),row.snapshot,{reason});
  await client.query("UPDATE wpay_auth.payout_claims SET state='not_paid',closed_at=CURRENT_TIMESTAMP WHERE id=$1",[claim.id]);row=(await client.query("UPDATE wpay_auth.payout_orders SET state='not_paid',completed_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",[row.id])).rows[0];
  await a.event(client,{id:row.id,owner:row.merchant_id,actor,kind:'payout',state:'not_paid',reason});await this.gateway.emit(client,row,'payout.cancelled','payout');return this.project(row);
 }
 async detail(client,row,role){
  const out=this.project(row);const submission=(await client.query('SELECT s.*,p.extension,p.size,p.scan_state,p.created_at AS proof_created_at FROM wpay_auth.payout_submissions s JOIN wpay_auth.payout_proofs p ON p.id=s.proof_id WHERE s.payout_id=$1',[row.id])).rows[0];
  if(role!=='queue'){
   const beneficiary=JSON.parse(this.crypto.open(row.encrypted_beneficiary,binding('beneficiary',row.id)));out.beneficiary={beneficiaryName:beneficiary.beneficiaryName,bankName:beneficiary.bankName||'',accountNumber:beneficiary.accountNumber,ifsc:beneficiary.ifsc,upiId:beneficiary.upiId||''};if(role==='merchant')out.note=beneficiary.note;
   if(submission){const evidence=JSON.parse(this.crypto.open(submission.encrypted_evidence,binding('evidence',submission.id)));out.evidence=role==='merchant'?{utr:evidence.utr}:evidence;out.proof={id:submission.proof_id,name:submission.proof_id+'.'+submission.extension,size:submission.size,scanState:submission.scan_state,createdAt:submission.proof_created_at,downloadAllowed:role!=='merchant'};out.submittedAt=submission.created_at;}
  }
  if(role==='user'){delete out.percentageFeeMinor;delete out.fixedFeeMinor;delete out.fixedFeeCurrency;delete out.reserveMinor;}
  if(role==='admin'){out.merchantId=row.merchant_id;out.claims=(await client.query('SELECT id,user_id,state,created_at,expires_at,closed_at FROM wpay_auth.payout_claims WHERE payout_id=$1 ORDER BY created_at DESC LIMIT 100',[row.id])).rows;out.audit=(await client.query('SELECT actor_id,kind,state,reason,created_at FROM wpay_auth.payout_events WHERE resource_id=$1 ORDER BY created_at DESC,id LIMIT 100',[row.id])).rows;}
  return out;
 }
 async download(client,row,proofId,actor){
  const p=(await client.query('SELECT * FROM wpay_auth.payout_proofs WHERE payout_id=$1 AND id=$2',[row.id,v.id(proofId)])).rows[0];if(!p)input.fail('FORBIDDEN');
  await ledger.audit(client,{actorId:actor,ownerId:row.merchant_id,entityId:p.id,event:'payout_proof_downloaded'});
  return {name:p.id+'.'+p.extension,contentType:'application/octet-stream',data:this.crypto.open(p.encrypted_bytes,binding('proof',p.id)),scanState:p.scan_state};
 }
}
module.exports={Payouts,binding};
