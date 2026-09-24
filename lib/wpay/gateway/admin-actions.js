'use strict';
const {randomUUID}=require('node:crypto');
const {AuthError}=require('../auth/runtime/errors'),{authorize}=require('../authorization-policy');
const {recentAuthenticationAt}=require('../auth/runtime/session-assurance');
const v=require('../business/validation'),ledger=require('../business/ledger'),money=require('../business/money');
const fail=(code='FORBIDDEN')=>{throw new AuthError(code);};
async function run(gateway,c,row,context,operation,b){
 if(!['admin','super_admin'].includes(row.account_type))fail();
 const kind=operation==='gateway/admin/approve'?'approve':operation==='gateway/admin/callback'?'callback':null;if(!kind)fail('NOT_FOUND');
 v.exactFields(b,kind==='approve'?['orderId','amountMinor','reason','requestId']:['orderId','reason','requestId']);v.id(b.orderId);v.id(b.requestId);v.reason(b.reason);
 const at=recentAuthenticationAt(row),age=+new Date(row.database_now)-+new Date(at);if(!at||!Number.isFinite(age)||age<0||age>300000)fail('RECENT_MFA_REQUIRED');
 await ledger.lock(c);
 const order=(await c.query('SELECT o.*,a.tenant_id,a.name AS merchant_name FROM wpay_auth.gateway_orders o JOIN wpay_auth.accounts a ON a.id=o.merchant_id WHERE o.id=$1 FOR UPDATE OF o',[b.orderId])).rows[0];if(!order)fail();
 for(const permissionId of ['transactions.view','payment_admin.'+kind,...(kind==='callback'?['webhooks.view']:[])]){
  if(!authorize({...context,permissionId,context:{kind:'record',id:order.id,tenantId:order.tenant_id,ownerType:'merchant',ownerId:order.merchant_id,accountId:order.merchant_id,accountOwnerId:order.merchant_id,accountTenantId:order.tenant_id}}).allowed)fail();
 }
 const digest=ledger.digest(b),prior=(await c.query('SELECT * FROM wpay_auth.admin_payment_actions WHERE actor_id=$1 AND request_id=$2',[row.id,b.requestId])).rows[0];
 if(prior){if(prior.payload_digest!==digest||prior.kind!==kind||prior.order_id!==order.id)fail('CONFLICT');return prior.result;}
 let result;
 if(kind==='approve'){
  if(money.minor(b.amountMinor).toString()!==order.amount_minor)fail('CONFLICT');
  if(order.state==='successful')return {status:'successful',alreadyAccounted:true};
  if(!['pending_payment','verification_pending','expired','recovery_review','failed','cancelled'].includes(order.state))fail('CONFLICT');
  const r=(await c.query('SELECT * FROM wpay_auth.business_reservations WHERE id=$1 FOR UPDATE',[order.reservation_id])).rows[0];
  if(!r||r.merchant_id!==order.merchant_id||r.amount_minor!==order.amount_minor||!['active','expired','released','cancelled'].includes(r.state))fail('CONFLICT');
  if((await c.query('SELECT 1 FROM wpay_auth.business_financial_events WHERE reservation_id=$1',[r.id])).rowCount)fail('CONFLICT');
  const recovered=r.state!=='active'||+r.expires_at<=+row.database_now;
  if(r.state==='active'&&recovered){await gateway.core.release(c,r.id,row.id,'expired');r.state='expired';}
  const fee=money.fee(r.amount_minor,r.snapshot.merchant.settings.payinFee),commission=recovered?'0':money.fee(r.amount_minor,r.snapshot.user.settings.payinCommission);
  const entries=[...ledger.pair(r.user_id,'capacity_consumed',r.amount_minor),...ledger.pair(r.merchant_id,'merchant_gross',r.amount_minor)];
  if(r.state==='active')entries.push(...ledger.pair(r.user_id,'capacity_reserved',r.amount_minor,'INR','debit'));
  if(fee!=='0')entries.push(...ledger.pair(r.merchant_id,'merchant_platform_fee',fee));if(commission!=='0')entries.push(...ledger.pair(r.user_id,'user_commission',commission));
  const journalId=await ledger.post(c,{key:'admin-payin:'+order.id,referenceType:'payin',referenceId:r.order_reference,actorId:row.id,source:'admin-manual-approval',snapshot:r.snapshot,metadata:{source:'admin_manual',reason:b.reason,verified:false,orderId:order.id,commissionMinor:commission,feeMinor:fee},entries});
  await c.query("INSERT INTO wpay_auth.business_financial_events(economic_id,bank_id,utr_digest,reservation_id,journal_id,source,amount_minor) VALUES($1,$2,NULL,$3,$4,'admin_manual',$5)",['admin:'+order.id,r.bank_id,r.id,journalId,r.amount_minor]);
  await c.query("UPDATE wpay_auth.business_reservations SET state='consumed' WHERE id=$1",[r.id]);await gateway.core.reservationEvent(c,r,'consumed',row.id,'Admin manual approval: '+b.reason);
  const capacity=await ledger.summary(c,r.user_id);
  if(recovered||BigInt(capacity.deficit)>0n)await c.query('INSERT INTO wpay_auth.business_reconciliation(id,owner_id,journal_id,reference,reason,signed_remaining,deficit_minor) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),r.user_id,journalId,r.order_reference,'Admin manual approval; '+b.reason,capacity.signedAvailable,capacity.deficit]);
  const updated=(await c.query("UPDATE wpay_auth.gateway_orders SET state='successful',evidence_state='admin_approved',paid_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",[order.id])).rows[0];
  await gateway.emit(c,updated,recovered?'payment.recovered':'payment.success');
  result={status:'successful',evidenceStatus:'admin_approved',journalId,alreadyAccounted:false};
 }else{
  // Retry only the existing success event. No statement or UTR is needed, and no money is posted.
  if(order.state!=='successful')fail('CONFLICT');
  const event=(await c.query("SELECT * FROM wpay_auth.gateway_outbox WHERE order_id=$1 AND event_type IN('payment.success','payment.recovered') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[order.id])).rows[0];if(!event)fail('CONFLICT');
  if(event.state==='leased'&&+event.lease_until>+row.database_now)fail('CONFLICT');
  if((await c.query("SELECT 1 FROM wpay_auth.admin_payment_actions WHERE order_id=$1 AND kind='callback' AND created_at>CURRENT_TIMESTAMP-interval '1 minute'",[order.id])).rowCount)fail('RATE_LIMITED');
  const endpoint=event.endpoint_id?(await c.query('SELECT id FROM wpay_auth.gateway_endpoints WHERE id=$1 AND merchant_id=$2',[event.endpoint_id,order.merchant_id])).rows[0]:(await c.query('SELECT id FROM wpay_auth.gateway_endpoints WHERE merchant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[order.merchant_id])).rows[0];if(!endpoint)fail('UNAVAILABLE');
  await c.query("UPDATE wpay_auth.gateway_outbox SET state='pending',endpoint_id=$2,delivery_budget=GREATEST(delivery_budget,attempts+8),next_attempt_at=CURRENT_TIMESTAMP,lease_id=NULL,lease_until=NULL WHERE id=$1",[event.id,endpoint.id]);
  result={queued:true,eventId:event.id};
 }
 await c.query('INSERT INTO wpay_auth.admin_payment_actions(id,order_id,actor_id,request_id,kind,reason,payload_digest,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),order.id,row.id,b.requestId,kind,b.reason,digest,result]);
 await ledger.audit(c,{actorId:row.id,ownerId:order.merchant_id,entityId:order.id,event:'admin_payment_'+kind,reason:b.reason,metadata:result});return result;
}
module.exports={run};
