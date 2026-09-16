"use strict";
const v=require('../business/validation'),{permit,recent,fail,audit}=require('./access'),{binding}=require('../gateway/core');
class Reconciliation {
 constructor({crypto,onboarding}){this.crypto=crypto;this.onboarding=onboarding;}
 async observations(client,row,context,body){
  require('../gateway/validation').fields(body,['orderId','offset']);const user=row.account_type==='user';
  if(!user&&!['admin','super_admin'].includes(row.account_type))fail();
  const scope=permit(context,user?'user.transaction_history.view':'utr_center.view');if(!user)recent(row);
  const offset=body.offset??0;if(!Number.isInteger(offset)||offset<0||offset>100000)fail('INVALID_INPUT');if(body.orderId)v.id(body.orderId);
  const rows=(await client.query(`SELECT o.id,o.reference,o.merchant_id,o.amount_minor,o.state,o.evidence_state,o.created_at,o.paid_at,r.user_id,r.bank_id,r.bank_version,
   f.source,f.utr_digest AS verified_digest,f.journal_id,
   (SELECT state FROM wpay_auth.gateway_outbox x WHERE x.order_id=o.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) AS callback_state,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'value',c.encrypted_utr,'digest',c.utr_digest,'at',c.created_at) ORDER BY c.created_at,c.id) FROM wpay_auth.gateway_claims c WHERE c.order_id=o.id),'[]'::jsonb) AS claims
   FROM wpay_auth.gateway_orders o JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id
   JOIN wpay_auth.accounts u ON u.id=r.user_id JOIN wpay_auth.accounts m ON m.id=o.merchant_id
   LEFT JOIN wpay_auth.business_financial_events f ON f.reservation_id=r.id
   WHERE ($1::uuid IS NULL OR r.user_id=$1) AND ($2::text[] IS NULL OR (u.tenant_id=ANY($2) AND m.tenant_id=ANY($2)))
   AND ($3::uuid IS NULL OR o.id=$3) ORDER BY o.created_at DESC,o.id LIMIT 51 OFFSET $4`,[user?row.id:null,user?null:scope.tenantIds,body.orderId??null,offset])).rows;
  if(body.orderId&&!rows.length)fail();
  const records=rows.slice(0,50).map(o=>({orderId:o.id,reference:o.reference,amountMinor:o.amount_minor,currency:'INR',status:o.state,evidenceState:o.evidence_state,
   accountingState:o.journal_id?'posted':'not_posted',recovered:o.source==='statement_recovered',bankId:o.bank_id,bankVersion:o.bank_version,
   ...(user?{}:{merchantId:o.merchant_id,userId:o.user_id,callbackState:o.callback_state||'none'}),
   observations:o.claims.map(c=>({utr:this.crypto.open(c.value,binding('claim',c.id)),capturedAt:c.at,source:c.digest===o.verified_digest?o.source:'checkout_claim',verified:c.digest===o.verified_digest}))}));
  await audit(client,row.id,user?row.id:null,body.orderId??'scoped-list',user?'read_payin_history':'read_utr_center');
  return {records,hasMore:rows.length>50,offset,note:'Submitted UTRs are observations. Only independently verified evidence can post accounting.'};
 }
 async statements(client,row,context,body,upload=false){
  const user=row.account_type==='user';if(!user&&!['admin','super_admin'].includes(row.account_type))fail();
  if(upload)v.exactFields(body,['ownerId','bankId','version','requestId','format','base64']);else require('../gateway/validation').fields(body,['ownerId','bankId']);
  const scope=permit(context,user?'user.bank_upi.view':'statement_reconciliation.view');
  if(!user||upload)recent(row);
  if(body.ownerId)v.id(body.ownerId);if(body.bankId)v.id(body.bankId);
  if(user&&body.ownerId&&body.ownerId!==row.id)fail();
  const banks=(await client.query(`SELECT b.id,b.owner_id,b.version,b.approved_version,b.status,a.name,a.user_id,a.tenant_id
   FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.accounts a ON a.id=b.owner_id
   WHERE ($1::uuid IS NULL OR b.owner_id=$1) AND ($2::text[] IS NULL OR a.tenant_id=ANY($2)) AND ($3::uuid IS NULL OR b.id=$3)
   ORDER BY b.created_at DESC,b.id LIMIT 100`,[user?row.id:body.ownerId??null,user?null:scope.tenantIds,body.bankId??null])).rows;
  if(body.bankId&&!banks.length)fail();
  if(upload){
   if(!body.ownerId||!body.bankId||banks.length!==1||banks[0].owner_id!==body.ownerId)fail();const bank=banks[0];
   permit(context,user?'user.bank_upi.update':'statement_reconciliation.upload',{kind:'record',id:bank.id,tenantId:bank.tenant_id,ownerType:'user',ownerId:bank.user_id,accountId:bank.id,accountOwnerId:bank.user_id,accountTenantId:bank.tenant_id});
   const {ownerId,...input}=body,result=await this.onboarding.upload(client,bank.owner_id,input);
   await audit(client,row.id,bank.owner_id,result.id,'targeted_statement_upload');return {...result,reconciliationState:'trusted_source_required'};
  }
  const imports=banks.length?(await client.query(`SELECT id,owner_id,bank_id,bank_version,status,reason,created_at,rows_scanned,credit_count FROM wpay_auth.bank_statement_imports WHERE bank_id=ANY($1::uuid[]) ORDER BY created_at DESC,id LIMIT 100`,[banks.map(b=>b.id)])).rows:[];
  await audit(client,row.id,user?row.id:body.ownerId??null,body.bankId??'scoped-list','read_statement_imports');
  return {banks:banks.map(b=>({id:b.id,ownerId:b.owner_id,ownerName:b.name,version:b.version,status:b.status})),imports,financialEvidence:false,
   reconciliationState:'trusted_source_required',message:'Uploads use the existing statement parser. An uploaded file or global matcher result alone cannot establish account ownership or authorize financial credit.'};
 }
}
module.exports={Reconciliation};
