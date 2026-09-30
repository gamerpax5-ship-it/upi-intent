'use strict';
const {createHash,randomUUID}=require('node:crypto');
const ledger=require('../business/ledger'),money=require('../business/money');
const {receiver}=require('./mappings'),{fail}=require('./policy');
const hash=value=>createHash('sha256').update(value).digest('hex');
// Called only by this bot, within the group transaction. No OTP, verification
// source, Admin impersonation or password/session policy is used or changed.
async function confirm({c,current,query,access,gateway,crypto,tenants}){
 const actor=String(query.from.id),chat=query.message?.chat;
 if(typeof query.data!=='string'||!/^nb:received:[A-Za-z0-9_-]{32}$/.test(query.data)||String(chat?.id)!==String(current.chat_id)||!await access.receiver(chat,actor))fail('RECEIVED_DENIED');
 await ledger.lock(c);
 const token=hash(query.data.slice(12));
 const receipt=(await c.query('SELECT *,CURRENT_TIMESTAMP AS now FROM wpay_auth.notification_bot_receipts WHERE token_digest=$1 AND chat_id=$2 FOR UPDATE',[token,String(chat.id)])).rows[0];
 if(!receipt||+receipt.expires_at<=+receipt.now||String(receipt.message_id)!==String(query.message.message_id)||!receipt.mapping_ids.some(mappingId=>receiver(current.state,{mappingId,accountId:receipt.account_id,telegramId:actor})))fail('RECEIVED_DENIED');
 const o=(await c.query(`SELECT o.*,cl.id AS claim_id,cl.utr_digest,cl.encrypted_utr,r.user_id,r.bank_id,
 u.status AS user_status,u.account_type AS user_type,e.approval_status,u.tenant_id AS user_tenant,
 m.status AS merchant_status,m.tenant_id AS merchant_tenant,me.approval_status AS merchant_approval
 FROM wpay_auth.gateway_claims cl JOIN wpay_auth.gateway_orders o ON o.id=cl.order_id
 JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id
 JOIN wpay_auth.accounts u ON u.id=r.user_id JOIN wpay_auth.eligibility e ON e.account_id=u.id
 JOIN wpay_auth.accounts m ON m.id=o.merchant_id JOIN wpay_auth.eligibility me ON me.account_id=m.id
 WHERE cl.id=$1 FOR UPDATE OF o,u,e,m,me`,[receipt.claim_id])).rows[0];
 if(!o||o.user_id!==receipt.account_id||o.user_type!=='user'||o.user_status!=='active'||o.approval_status!=='approved'||o.merchant_status!=='active'||o.merchant_approval!=='approved'||!tenants.includes(o.user_tenant)||!tenants.includes(o.merchant_tenant)||o.amount_minor!==receipt.amount_minor)fail('RECEIVED_DENIED');
 const utr=crypto.open(o.encrypted_utr,'wpay-gateway-claim:'+o.claim_id);
 if(!/^\d{12}$/.test(utr)||hash(utr)!==o.utr_digest)fail('CLAIM_INVALID');
 const financial=(await c.query('SELECT utr_digest FROM wpay_auth.business_financial_events WHERE reservation_id=$1',[o.reservation_id])).rows[0];
 if(o.state==='successful'){
  if(!financial||financial.utr_digest!==o.utr_digest)fail('PAYMENT_CONFIRMED_WITH_DIFFERENT_UTR');
  return {status:'successful',alreadyAccounted:true,orderId:o.id,utr,amountMinor:o.amount_minor};
 }
 if(o.state==='cancelled'||['rejected','verified'].includes(o.evidence_state))fail('PAYMENT_REJECTED');
 const r=(await c.query('SELECT * FROM wpay_auth.business_reservations WHERE id=$1 FOR UPDATE',[o.reservation_id])).rows[0];
 if(!r||r.user_id!==receipt.account_id||r.merchant_id!==o.merchant_id||r.amount_minor!==o.amount_minor||!['active','expired','released'].includes(r.state))fail('PAYMENT_CONFLICT');
 if(financial||(await c.query('SELECT 1 FROM wpay_auth.business_financial_events WHERE bank_id=$1 AND utr_digest=$2',[r.bank_id,o.utr_digest])).rowCount)fail('UTR_ALREADY_USED');
 // The same existing late-recovery rule applies: no User commission after the
 // reservation expired. Merchant fee and capacity come from the order snapshot.
 const recovered=r.state!=='active'||+r.expires_at<=+receipt.now;
 if(r.state==='active'&&recovered){await gateway.core.release(c,r.id,receipt.account_id,'expired');r.state='expired';}
 const fee=money.fee(r.amount_minor,r.snapshot.merchant.settings.payinFee),commission=recovered?'0':money.fee(r.amount_minor,r.snapshot.user.settings.payinCommission);
 const entries=[...ledger.pair(r.user_id,'capacity_consumed',r.amount_minor),...ledger.pair(r.merchant_id,'merchant_gross',r.amount_minor)];
 if(r.state==='active')entries.push(...ledger.pair(r.user_id,'capacity_reserved',r.amount_minor,'INR','debit'));
 if(fee!=='0')entries.push(...ledger.pair(r.merchant_id,'merchant_platform_fee',fee));
 if(commission!=='0')entries.push(...ledger.pair(r.user_id,'user_commission',commission));
 const metadata={source:'user_manual',bankVerified:false,claimId:o.claim_id,utrDigest:o.utr_digest,orderId:o.id,telegramActor:actor,telegramChat:String(chat.id),feeMinor:fee,commissionMinor:commission};
 if(!await access.receiver(chat,actor))fail('RECEIVED_DENIED');
 const journalId=await ledger.post(c,{key:'notification-user-received:'+o.id,referenceType:'payin',referenceId:r.order_reference,actorId:r.user_id,source:'user-manual-confirmation',snapshot:r.snapshot,metadata,entries});
 await c.query("INSERT INTO wpay_auth.business_financial_events(economic_id,bank_id,utr_digest,reservation_id,journal_id,source,amount_minor) VALUES($1,$2,$3,$4,$5,'user_manual',$6)",['user-claim:'+o.id,r.bank_id,o.utr_digest,r.id,journalId,r.amount_minor]);
 await c.query("UPDATE wpay_auth.business_reservations SET state='consumed' WHERE id=$1",[r.id]);
 await gateway.core.reservationEvent(c,r,'consumed',r.user_id,'User confirmed receipt through Notification Bot');
 const capacity=await ledger.summary(c,r.user_id);
 if(recovered||BigInt(capacity.deficit)>0n)await c.query('INSERT INTO wpay_auth.business_reconciliation(id,owner_id,journal_id,reference,reason,signed_remaining,deficit_minor) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),r.user_id,journalId,r.order_reference,'User manual receipt confirmation',capacity.signedAvailable,capacity.deficit]);
 const updated=(await c.query("UPDATE wpay_auth.gateway_orders SET state='successful',evidence_state='user_confirmed',paid_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",[o.id])).rows[0];
 await ledger.audit(c,{actorId:r.user_id,ownerId:r.user_id,entityId:o.id,event:'user_utr_received',metadata:{...metadata,journalId}});
 await c.query('UPDATE wpay_auth.notification_bot_receipts SET confirmed_at=CURRENT_TIMESTAMP,telegram_actor_id=$2 WHERE token_digest=$1',[token,actor]);
 await gateway.emit(c,updated,recovered?'payment.recovered':'payment.success');
 return {status:'successful',alreadyAccounted:false,bankVerified:false,approvalMethod:'user_manual',orderId:o.id,utr,amountMinor:o.amount_minor};
}
module.exports={confirm};
