'use strict';
const {randomUUID}=require('node:crypto');
const ledger=require('../business/ledger'),money=require('../business/money'),{fail}=require('./access');
// Called only after role, recent authentication, tenant and explicit approval
// permission checks, inside the session transaction holding the ledger mutex.
// This is an administrator decision, never manufactured bank evidence.
async function approve(c,actor,o,reason,gateway){
 const r=(await c.query('SELECT * FROM wpay_auth.business_reservations WHERE id=$1 FOR UPDATE',[o.reservation_id])).rows[0];
 if(!r||r.merchant_id!==o.merchant_id||r.amount_minor!==o.amount_minor||!['active','expired','released','cancelled'].includes(r.state))fail('CONFLICT');
 if((await c.query('SELECT 1 FROM wpay_auth.business_financial_events WHERE reservation_id=$1 OR (bank_id=$2 AND utr_digest=$3)',[r.id,r.bank_id,o.utr_digest])).rowCount)fail('CONFLICT');
 const recovered=r.state!=='active'||+r.expires_at<=+actor.database_now;
 if(r.state==='active'&&recovered){await gateway.core.release(c,r.id,actor.id,'expired');r.state='expired';}
 const fee=money.fee(r.amount_minor,r.snapshot.merchant.settings.payinFee),commission=recovered?'0':money.fee(r.amount_minor,r.snapshot.user.settings.payinCommission);
 const entries=[...ledger.pair(r.user_id,'capacity_consumed',r.amount_minor),...ledger.pair(r.merchant_id,'merchant_gross',r.amount_minor)];
 if(r.state==='active')entries.push(...ledger.pair(r.user_id,'capacity_reserved',r.amount_minor,'INR','debit'));
 if(fee!=='0')entries.push(...ledger.pair(r.merchant_id,'merchant_platform_fee',fee));
 if(commission!=='0')entries.push(...ledger.pair(r.user_id,'user_commission',commission));
 const metadata={source:'admin_manual',bankVerified:false,claimId:o.claim_id,utrDigest:o.utr_digest,orderId:o.id,reason,feeMinor:fee,commissionMinor:commission};
 const journalId=await ledger.post(c,{key:'admin-claim-payin:'+o.id,referenceType:'payin',referenceId:r.order_reference,actorId:actor.id,source:'admin-manual-approval',snapshot:r.snapshot,metadata,entries});
 // Reserve the submitted UTR identity as well as the order: the same claim
 // cannot later credit another order through manual or automatic matching.
 await c.query("INSERT INTO wpay_auth.business_financial_events(economic_id,bank_id,utr_digest,reservation_id,journal_id,source,amount_minor) VALUES($1,$2,$3,$4,$5,'admin_manual',$6)",['admin-claim:'+o.id,r.bank_id,o.utr_digest,r.id,journalId,r.amount_minor]);
 await c.query("UPDATE wpay_auth.business_reservations SET state='consumed' WHERE id=$1",[r.id]);
 await gateway.core.reservationEvent(c,r,'consumed',actor.id,'Admin manual approval: '+reason);
 const capacity=await ledger.summary(c,r.user_id);
 if(recovered||BigInt(capacity.deficit)>0n)await c.query('INSERT INTO wpay_auth.business_reconciliation(id,owner_id,journal_id,reference,reason,signed_remaining,deficit_minor) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),r.user_id,journalId,r.order_reference,'Admin manual approval: '+reason,capacity.signedAvailable,capacity.deficit]);
 const updated=(await c.query("UPDATE wpay_auth.gateway_orders SET state='successful',evidence_state='admin_approved',paid_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",[o.id])).rows[0];
 await ledger.audit(c,{actorId:actor.id,ownerId:o.merchant_id,entityId:o.id,event:'admin_utr_approved',reason,metadata:{...metadata,journalId}});
 await gateway.emit(c,updated,recovered?'payment.recovered':'payment.success');
 return {status:'successful',reviewStatus:'approved',approvalMethod:'admin_manual',bankVerified:false,final:true,message:'Admin approved — payment Successful.'};
}
module.exports={approve};
