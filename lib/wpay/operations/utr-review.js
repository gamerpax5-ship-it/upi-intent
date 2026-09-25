"use strict";
const {permit,recent,fail}=require('./access'),v=require('../business/validation'),ledger=require('../business/ledger');
const {binding}=require('../gateway/core');
const resource=o=>({kind:'record',id:o.bank_id,tenantId:o.user_tenant,ownerType:'user',ownerId:o.owner_subject,accountId:o.bank_id,accountOwnerId:o.owner_subject,accountTenantId:o.user_tenant});
function scope(row,context){if(!['admin','super_admin'].includes(row.account_type))fail();recent(row);return permit(context,'utr_center.view');}
async function target(c,row,context,body,crypto){
 const allowed=scope(row,context);
 const o=(await c.query(`SELECT o.*,r.bank_id,u.user_id AS owner_subject,u.tenant_id AS user_tenant,cl.id AS claim_id,cl.encrypted_utr
 FROM wpay_auth.gateway_claims cl JOIN wpay_auth.gateway_orders o ON o.id=cl.order_id
 JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id JOIN wpay_auth.accounts u ON u.id=r.user_id JOIN wpay_auth.accounts m ON m.id=o.merchant_id
 WHERE cl.id=$1 AND u.tenant_id=ANY($2) AND m.tenant_id=ANY($2)`,[v.id(body.claimId),allowed.tenantIds])).rows[0];
 if(!o)fail();permit(context,'statement_reconciliation.upload',resource(o));
 return {...o,utr:crypto.open(o.encrypted_utr,binding('claim',o.claim_id))};
}
async function list(c,row,context,body,crypto){
 require('../gateway/validation').fields(body,['offset','status']);const allowed=scope(row,context),offset=body.offset??0,status=body.status??'pending';
 if(!Number.isInteger(offset)||offset<0||offset>100000||!['pending','verified','rejected','all'].includes(status))fail('INVALID_INPUT');
 const rows=(await c.query(`SELECT * FROM (SELECT cl.id,cl.encrypted_utr,cl.created_at,o.id AS order_id,o.reference,o.amount_minor,o.state AS payment_status,r.bank_id,u.user_id AS owner_subject,u.tenant_id AS user_tenant,m.name AS merchant_name,u.name AS user_name,
 CASE WHEN o.state='successful' AND cl.utr_digest=f.utr_digest THEN 'verified' WHEN o.evidence_state='rejected' OR (o.state='failed' AND o.evidence_state='verified') OR o.state IN('cancelled','successful') THEN 'rejected' ELSE 'pending' END AS review_status
 FROM wpay_auth.gateway_claims cl JOIN wpay_auth.gateway_orders o ON o.id=cl.order_id JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id
 JOIN wpay_auth.accounts u ON u.id=r.user_id JOIN wpay_auth.accounts m ON m.id=o.merchant_id LEFT JOIN wpay_auth.business_financial_events f ON f.reservation_id=r.id
 WHERE u.tenant_id=ANY($1) AND m.tenant_id=ANY($1)) q WHERE ($2='all' OR review_status=$2) ORDER BY created_at DESC,id LIMIT 51 OFFSET $3`,[allowed.tenantIds,status,offset])).rows;
 return {offset,hasMore:rows.length>50,records:rows.slice(0,50).map(o=>{
  let canReview=false;try{permit(context,'statement_reconciliation.upload',resource(o));canReview=o.review_status==='pending';}catch{}
  return {claimId:o.id,orderId:o.order_id,utr:crypto.open(o.encrypted_utr,binding('claim',o.id)),reference:o.reference,amountMinor:o.amount_minor,merchant:o.merchant_name,user:o.user_name,submittedAt:o.created_at,status:o.review_status,paymentStatus:o.payment_status,canReview};
 })};
}
async function prepare(c,row,context,body,crypto,gateway){
 v.exactFields(body,['claimId','action','reason']);v.reason(body.reason);if(!['verify','reject'].includes(body.action))fail('INVALID_INPUT');
 await ledger.lock(c);const o=await target(c,row,context,body,crypto);
 if(o.state==='successful')return {status:'successful',final:true};
 if(o.evidence_state==='rejected'||o.state==='cancelled'){if(body.action==='verify')fail('CONFLICT');return {status:'failed',final:true};}
 if(body.action==='reject'){
  await gateway.core.release(c,o.reservation_id,row.id,'released');
  await c.query("UPDATE wpay_auth.gateway_orders SET state='failed',evidence_state='rejected' WHERE id=$1",[o.id]);
  await ledger.audit(c,{actorId:row.id,ownerId:o.merchant_id,entityId:o.id,event:'admin_utr_rejected',metadata:{claimId:o.claim_id,reason:body.reason}});
  await gateway.emit(c,{...o,state:'failed'},'payment.failed');return {status:'failed',reviewStatus:'rejected',final:true};
 }
 await ledger.audit(c,{actorId:row.id,ownerId:o.merchant_id,entityId:o.id,event:'admin_utr_check_started',metadata:{claimId:o.claim_id,reason:body.reason}});
 return {orderId:o.id,utr:o.utr};
}
async function finish(c,row,context,body,crypto,result){
 const o=await target(c,row,context,body,crypto);
 const success=o.state==='successful'&&o.evidence_state==='verified',rejected=o.evidence_state==='rejected'||(o.state==='failed'&&o.evidence_state==='verified');
 await ledger.audit(c,{actorId:row.id,ownerId:o.merchant_id,entityId:o.id,event:'admin_utr_check_finished',metadata:{claimId:o.claim_id,status:o.state,result:result.status}});
 return {status:o.state,reviewStatus:success?'verified':rejected?'rejected':'not_verified',final:success||rejected,message:success?'Verified — payment Successful.':rejected?'Rejected — payment Failed.':'Not verified: matching bank evidence is not available. No payment was approved.'};
}
module.exports={list,prepare,finish};
