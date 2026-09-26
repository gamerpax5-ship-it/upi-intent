'use strict';
const {randomUUID}=require('node:crypto'),ledger=require('../business/ledger'),v=require('../business/validation'),{AuthError}=require('../auth/runtime/errors');
const fail=(code='CONFLICT')=>{throw new AuthError(code);},binding=(type,id)=>'wpay-late-'+type+':'+id;
const pendingSql="NOT EXISTS(SELECT 1 FROM wpay_auth.late_payment_resolutions z WHERE z.review_id=l.id)";
async function held(c,kind,id){return BigInt((await c.query(`SELECT COALESCE(sum(held_minor),0)::text n FROM wpay_auth.late_payment_reviews l WHERE kind=$1 AND resource_id=$2 AND ${pendingSql}`,[kind,id])).rows[0].n);}
function validate(body){v.exactFields(body,['id','utr','reason','proof']);v.id(body.id);v.reason(body.reason);if(typeof body.utr!=='string'||!/^\d{12}$/.test(body.utr))fail('INVALID_INPUT');}
async function open(core,c,userId,kind,body,proof){
 validate(body);if(!proof)fail('INVALID_INPUT');await ledger.lock(c);if(kind==='parking')await core.expire(c);else await require('../payouts/claims').expire(c);
 let claim,order;
 if(kind==='parking'){
  claim=(await c.query('SELECT * FROM wpay_auth.parking_locks WHERE id=$1 AND user_id=$2',[body.id,userId])).rows[0];if(claim)order=(await c.query('SELECT * FROM wpay_auth.parking_orders WHERE id=$1',[claim.order_id])).rows[0];
 }else{
  order=(await c.query('SELECT p.*,a.tenant_id FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts a ON a.id=p.merchant_id WHERE p.id=$1',[body.id])).rows[0];
  claim=(await c.query("SELECT * FROM wpay_auth.payout_claims WHERE payout_id=$1 AND user_id=$2 AND state='expired' ORDER BY created_at DESC,id DESC LIMIT 1",[body.id,userId])).rows[0];
 }
 if(!order||!claim)fail('FORBIDDEN');const digest=ledger.digest({utr:body.utr,reason:body.reason,proof:proof.digest}),old=(await c.query('SELECT * FROM wpay_auth.late_payment_reviews WHERE kind=$1 AND claim_id=$2',[kind,claim.id])).rows[0];
 if(old){if(old.payload_digest!==digest)fail();return {id:old.id,status:'review_requested',heldMinor:old.held_minor,conflict:old.conflict};}
 const now=(await c.query('SELECT CURRENT_TIMESTAMP now')).rows[0].now;
 if(kind==='parking'&&(!['released','expired'].includes(claim.state)||+now<+claim.expires_at+300000)||kind==='payout'&&claim.state!=='expired')fail();
 const id=randomUUID(),amount=BigInt(kind==='parking'?claim.amount_minor:order.amount_minor);let hold=0n,mode='none',conflict='';
 if(kind==='parking'){
  const available=BigInt(order.total_minor)-BigInt(await core.lockedMinor(c,order.id));hold=order.state==='open'&&available>0n?(available<amount?available:amount):0n;
  if(hold<amount)conflict='Some or all of this amount is already claimed or completed. Other Users keep their tasks.';
 }else if(order.state==='open'&&await held(c,kind,order.id)===0n){hold=amount;mode='existing';}
 else if(order.state==='failed'&&await held(c,kind,order.id)===0n){
  const balance=await ledger.summary(c,order.merchant_id);
  if(BigInt(balance.merchantAvailable)>=BigInt(order.reserve_minor)){hold=amount;mode='extra';await ledger.post(c,{key:'late-reserve:'+id,referenceType:'payout',referenceId:order.id,actorId:userId,entries:ledger.pair(order.merchant_id,'merchant_payout_reserved',order.reserve_minor),metadata:{lateReview:id,reason:'Hold released funds for late payment review'}});}
  else conflict='Merchant available balance cannot cover this payout and fees. No funds were credited.';
 }else conflict='The payout is assigned, submitted, settled, cancelled or already under late review. Existing tasks are unchanged.';
 await c.query('INSERT INTO wpay_auth.late_payment_reviews(id,kind,resource_id,claim_id,user_id,tenant_id,amount_minor,held_minor,reserve_mode,reason,conflict,payload_digest,encrypted_evidence,encrypted_proof,extension,size,scan_state,proof_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)',[id,kind,order.id,claim.id,userId,order.tenant_id,amount.toString(),hold.toString(),mode,body.reason,conflict,digest,core.crypto.seal(JSON.stringify({utr:body.utr}),binding('evidence',id)),core.crypto.seal(proof.bytes.toString('base64'),binding('proof',id)),proof.extension,proof.size,proof.scanState,proof.digest]);
 await ledger.audit(c,{actorId:userId,ownerId:userId,entityId:id,event:'late_payment_requested',reason:body.reason,metadata:{kind,resourceId:order.id,heldMinor:hold.toString(),conflict}});return {id,status:'review_requested',heldMinor:hold.toString(),conflict};
}
async function list(c,kind,{userId=null,tenantIds=null,offset=0}={}){
 if(!Number.isInteger(offset)||offset<0||offset>100000)fail('INVALID_INPUT');const rows=(await c.query(`SELECT l.id,l.resource_id,l.claim_id,l.user_id,a.name AS user_name,l.tenant_id,l.amount_minor::text,l.held_minor::text,l.reason,l.conflict,l.scan_state,l.created_at,COALESCE(r.outcome,'pending') AS status,r.reason AS resolution_reason FROM wpay_auth.late_payment_reviews l JOIN wpay_auth.accounts a ON a.id=l.user_id LEFT JOIN wpay_auth.late_payment_resolutions r ON r.review_id=l.id WHERE l.kind=$1 AND ($2::uuid IS NULL OR l.user_id=$2) AND ($3::text[] IS NULL OR l.tenant_id=ANY($3)) ORDER BY l.created_at DESC,l.id LIMIT 51 OFFSET $4`,[kind,userId,tenantIds,offset])).rows;return {requests:rows.slice(0,50),offset,hasMore:rows.length>50};
}
async function record(c,kind,id){v.id(id);const r=(await c.query('SELECT * FROM wpay_auth.late_payment_reviews WHERE id=$1 AND kind=$2',[id,kind])).rows[0];if(!r)fail('FORBIDDEN');return r;}
async function proof(core,r){return {name:r.id+'.'+r.extension,data:core.crypto.open(r.encrypted_proof,binding('proof',r.id)),utr:JSON.parse(core.crypto.open(r.encrypted_evidence,binding('evidence',r.id))).utr,scanState:r.scan_state};}
async function decide(core,c,kind,actor,body){
 v.exactFields(body,['id','action','reason']);v.reason(body.reason);if(!['approve','reject'].includes(body.action))fail('INVALID_INPUT');await ledger.lock(c);const r=await record(c,kind,body.id),previous=(await c.query('SELECT * FROM wpay_auth.late_payment_resolutions WHERE review_id=$1',[r.id])).rows[0];
 const outcome=body.action==='approve'?'approved':'rejected';if(previous){if(previous.outcome!==outcome)fail();return {id:r.id,status:previous.outcome};}
 let order;if(kind==='parking'){await core.expire(c);order=(await c.query('SELECT * FROM wpay_auth.parking_orders WHERE id=$1 FOR UPDATE',[r.resource_id])).rows[0];}else order=(await c.query('SELECT * FROM wpay_auth.payout_orders WHERE id=$1 FOR UPDATE',[r.resource_id])).rows[0];
 if(body.action==='approve'){
  if(kind==='parking'){
   if(order.state!=='open'||BigInt(order.total_minor)-BigInt(await core.lockedMinor(c,order.id))+BigInt(r.held_minor)<BigInt(r.amount_minor))fail('INSUFFICIENT_CAPACITY');
  }else if(!['open','failed'].includes(order.state)||BigInt(r.held_minor)!==BigInt(r.amount_minor)||(await c.query("SELECT 1 FROM wpay_auth.payout_claims WHERE payout_id=$1 AND state IN('active','submitted','consumed')",[order.id])).rowCount)fail();
 }
 // Resolving removes the queue hold atomically with settlement/release.
 await c.query('INSERT INTO wpay_auth.late_payment_resolutions(review_id,outcome,actor_id,reason) VALUES($1,$2,$3,$4)',[r.id,outcome,actor,body.reason]);
 if(body.action==='approve'){
  const p=await proof(core,r),uploaded={bytes:Buffer.from(p.data,'base64'),digest:r.proof_digest,extension:r.extension,size:r.size,scanState:r.scan_state};
  if(kind==='parking'){
   const b=require('../parking/core').binding;
   await c.query('INSERT INTO wpay_auth.parking_submissions(parking_id,proof_digest,extension,size,scan_state,encrypted_proof,encrypted_evidence) VALUES($1,$2,$3,$4,$5,$6,$7)',[r.claim_id,r.proof_digest,r.extension,r.size,r.scan_state,core.crypto.seal(p.data,b('proof',r.claim_id)),core.crypto.seal(JSON.stringify({utr:p.utr,note:r.reason}),b('evidence',r.claim_id))]);
   await c.query("UPDATE wpay_auth.parking_locks SET state='review' WHERE id=$1",[r.claim_id]);await core.review(c,actor,r.claim_id,'approve',body.reason);
  }else{
   const old=(await c.query('SELECT * FROM wpay_auth.payout_claims WHERE id=$1',[r.claim_id])).rows[0],newId=randomUUID();
   await c.query("INSERT INTO wpay_auth.payout_claims(id,payout_id,user_id,bank_id,bank_version,account_key,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,'active',CURRENT_TIMESTAMP+interval '1 minute')",[newId,order.id,r.user_id,old.bank_id,old.bank_version,old.account_key]);
   await c.query("UPDATE wpay_auth.payout_orders SET state='claimed',completed_at=NULL WHERE id=$1",[order.id]);
   await core.submit(c,order,r.user_id,{amountMinor:r.amount_minor,utr:p.utr,note:r.reason},uploaded);await core.reject(c,order,actor,'Late evidence requires explicit Admin review');await core.settle(c,order,actor,body.reason,true);
  }
 }else if(kind==='payout'&&r.reserve_mode==='extra')await ledger.post(c,{key:'late-release:'+r.id,referenceType:'payout',referenceId:order.id,actorId:actor,entries:ledger.pair(order.merchant_id,'merchant_payout_reserved',order.reserve_minor,'INR','debit'),metadata:{lateReview:r.id,reason:body.reason}});
 await ledger.audit(c,{actorId:actor,ownerId:r.user_id,entityId:r.id,event:'late_payment_'+outcome,reason:body.reason});return {id:r.id,status:outcome};
}
module.exports={open,list,record,proof,decide,held,validate,pendingSql};
