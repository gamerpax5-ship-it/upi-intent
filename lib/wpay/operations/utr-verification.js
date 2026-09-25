"use strict";
const {randomUUID}=require('node:crypto');
const {permit,recent,fail}=require('./access');
const v=require('../business/validation'),ledger=require('../business/ledger');
const {hash,binding}=require('../gateway/core');

// Admin supplies a claim, never a trusted financial receipt. The existing
// evidence worker remains the only authority that can confirm this payment.
async function queue(client,row,context,body,crypto){
 v.exactFields(body,['orderId','utr','reason']);v.id(body.orderId);v.reason(body.reason);
 if(typeof body.utr!=='string'||!/^\d{12}$/.test(body.utr))fail('INVALID_INPUT');
 if(!['admin','super_admin'].includes(row.account_type))fail();recent(row);
 const scope=permit(context,'utr_center.view');
 await ledger.lock(client);
 const order=(await client.query(`SELECT o.*,r.bank_id,r.user_id,u.user_id AS owner_subject,u.tenant_id AS user_tenant,m.tenant_id AS merchant_tenant
  FROM wpay_auth.gateway_orders o JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id
  JOIN wpay_auth.accounts u ON u.id=r.user_id JOIN wpay_auth.accounts m ON m.id=o.merchant_id
  WHERE o.id=$1 AND u.tenant_id=ANY($2) AND m.tenant_id=ANY($2) FOR UPDATE OF o`,[body.orderId,scope.tenantIds])).rows[0];
 if(!order)fail();
 permit(context,'statement_reconciliation.upload',{kind:'record',id:order.bank_id,tenantId:order.user_tenant,ownerType:'user',ownerId:order.owner_subject,accountId:order.bank_id,accountOwnerId:order.owner_subject,accountTenantId:order.user_tenant});
 if(['successful','cancelled'].includes(order.state))fail('CONFLICT');
 const digest=hash(body.utr),id=randomUUID();
 const prior=(await client.query('SELECT 1 FROM wpay_auth.gateway_claims WHERE order_id=$1 AND utr_digest=$2',[order.id,digest])).rowCount;
 if(!prior&&(await client.query('SELECT count(*)::int AS n FROM wpay_auth.gateway_claims WHERE order_id=$1',[order.id])).rows[0].n>=10)fail('RATE_LIMITED');
 await client.query('INSERT INTO wpay_auth.gateway_claims(id,order_id,encrypted_utr,utr_digest) VALUES($1,$2,$3,$4) ON CONFLICT(order_id,utr_digest) DO NOTHING',[id,order.id,crypto.seal(body.utr,binding('claim',id)),digest]);
 await client.query("UPDATE wpay_auth.gateway_orders SET next_verify_at=CURRENT_TIMESTAMP,evidence_state='claim_submitted',state=CASE WHEN state='pending_payment' THEN 'verification_pending' ELSE state END WHERE id=$1",[order.id]);
 await ledger.audit(client,{actorId:row.id,ownerId:order.merchant_id,entityId:order.id,event:'admin_utr_verification_requested',metadata:{reason:body.reason,utrDigest:digest}});
 return {queued:true,orderId:order.id,message:'UTR verification requested. Success requires matching bank evidence. Refresh to see the result.'};
}
module.exports={queue};
