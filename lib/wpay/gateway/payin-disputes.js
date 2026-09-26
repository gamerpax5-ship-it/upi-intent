"use strict";
const {randomUUID}=require("node:crypto");
const ledger=require("../business/ledger"),v=require("../business/validation"),uploads=require("../payouts/uploads");
const {AuthError}=require("../auth/runtime/errors");
const fail=(code="INVALID_INPUT")=>{throw new AuthError(code);};
const binding=id=>"wpay-payin-dispute-proof:"+id;
const withinWindow=(paid,now)=>Number.isFinite(+new Date(paid))&&Number.isFinite(+new Date(now))&&+new Date(now)>=+new Date(paid)&&+new Date(now)-+new Date(paid)<48*3600000;
function coverage(body,paidAt,now){
 const from=Date.parse(body.coverageFrom),through=Date.parse(body.coverageThrough);
 if(!Number.isFinite(from)||!Number.isFinite(through)||from>+new Date(paidAt)||through<+new Date(now)-300000||through>+new Date(now)+60000||through<from)fail();
 return {from:new Date(from).toISOString(),through:new Date(through).toISOString()};
}
class PayinDisputes{
 constructor({crypto,scanner=null}){this.crypto=crypto;this.scanner=scanner;}
 async prepare(operation,body){
  if(operation==="payin-dispute/open"){
   v.exactFields(body,["id","reason","statement","coverageFrom","coverageThrough"]);v.id(body.id);v.reason(body.reason);
   return uploads.proof(body.statement,this.scanner);
  }
  if(operation==="payin-dispute/respond"){
   v.exactFields(body,["id","reason","proof"]);v.id(body.id);v.reason(body.reason);
   return body.proof?uploads.proof(body.proof,this.scanner):null;
  }
  return null;
 }
 async saveProof(c,orderId,ownerId,proof){
  if(!proof?.digest||!proof.bytes)fail();const id=randomUUID();
  await c.query("INSERT INTO wpay_auth.payin_dispute_proofs(id,order_id,owner_id,extension,size,digest,encrypted_bytes,scan_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,orderId,ownerId,proof.extension,proof.size,proof.digest,this.crypto.seal(proof.bytes.toString("base64"),binding(id)),proof.scanState]);
  return id;
 }
 async target(c,id,lock=false){
  const q=`SELECT o.*,r.user_id,r.bank_id,r.bank_version,f.journal_id AS original_journal_id,f.source AS financial_source,
   CURRENT_TIMESTAMP AS database_now,u.tenant_id AS user_tenant,m.tenant_id AS merchant_tenant,u.name AS user_name,m.name AS merchant_name
   FROM wpay_auth.gateway_orders o JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id
   JOIN wpay_auth.business_financial_events f ON f.reservation_id=r.id
   JOIN wpay_auth.accounts u ON u.id=r.user_id JOIN wpay_auth.accounts m ON m.id=o.merchant_id
   WHERE o.id=$1 ${lock?"FOR UPDATE OF o":""}`;
  return (await c.query(q,[v.id(id)])).rows[0]||null;
 }
 async open(c,merchantId,body,proof){
  await ledger.lock(c);const order=await this.target(c,body.id,true);if(!order||order.merchant_id!==merchantId)fail("FORBIDDEN");
  if(order.state!=="successful"||!withinWindow(order.paid_at,order.database_now))fail("CONFLICT");
  const dates=coverage(body,order.paid_at,order.database_now),fingerprint=ledger.digest({reason:body.reason,proof:proof?.digest,from:dates.from,through:dates.through});
  const prior=(await c.query("SELECT payload_digest FROM wpay_auth.payin_disputes WHERE order_id=$1",[order.id])).rows[0];
  if(prior){if(prior.payload_digest!==fingerprint)fail("CONFLICT");return this.detail(c,order.id);}
  const original=(await c.query("SELECT * FROM wpay_auth.business_entries WHERE journal_id=$1 AND owner_id IS NOT NULL",[order.original_journal_id])).rows;
  const sum=type=>original.filter(e=>e.ledger_type===type&&e.direction==="credit").reduce((n,e)=>n+BigInt(e.amount_minor),0n);
  const commission=sum("user_commission"),fee=sum("merchant_platform_fee"),amount=BigInt(order.amount_minor),merchantNet=amount>fee?amount-fee:0n;
  if(!original.some(e=>e.owner_id===order.user_id&&e.ledger_type==="capacity_consumed")||!original.some(e=>e.owner_id===order.merchant_id&&e.ledger_type==="merchant_gross"))fail("CONFLICT");
  const statementId=await this.saveProof(c,order.id,merchantId,proof),id=randomUUID();
  await c.query(`INSERT INTO wpay_auth.payin_disputes(id,order_id,merchant_id,user_id,reason,statement_id,coverage_from,coverage_through,amount_minor,commission_minor,merchant_net_minor,original_journal_id,payload_digest)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,order.id,merchantId,order.user_id,body.reason,statementId,dates.from,dates.through,order.amount_minor,commission.toString(),merchantNet.toString(),order.original_journal_id,fingerprint]);
  const entries=[...ledger.pair(order.user_id,"capacity_hold",order.amount_minor)];
  if(commission>0n)entries.push(...ledger.pair(order.user_id,"user_commission_hold",commission.toString()));
  if(merchantNet>0n)entries.push(...ledger.pair(order.merchant_id,"merchant_hold",merchantNet.toString()));
  await ledger.post(c,{key:"payin-dispute-hold:"+id,referenceType:"payin_dispute",referenceId:id,actorId:merchantId,snapshot:{orderId:order.id,originalJournalId:order.original_journal_id},metadata:{reason:body.reason},entries});
  await ledger.audit(c,{actorId:merchantId,ownerId:order.user_id,entityId:id,event:"payin_dispute_opened",reason:body.reason,metadata:{orderId:order.id,merchantId}});
  return this.detail(c,order.id);
 }
 async respond(c,userId,body,proof){
  await ledger.lock(c);const d=(await c.query("SELECT * FROM wpay_auth.payin_disputes WHERE order_id=$1",[v.id(body.id)])).rows[0];if(!d||d.user_id!==userId)fail("FORBIDDEN");
  if((await c.query("SELECT 1 FROM wpay_auth.payin_dispute_resolutions WHERE dispute_id=$1",[d.id])).rowCount)fail("CONFLICT");
  const fingerprint=ledger.digest({reason:body.reason,proof:proof?.digest||null});
  if((await c.query("SELECT 1 FROM wpay_auth.payin_dispute_responses WHERE dispute_id=$1 AND payload_digest=$2",[d.id,fingerprint])).rowCount)return this.detail(c,d.order_id);
  const proofId=proof?await this.saveProof(c,d.order_id,userId,proof):null;
  await c.query("INSERT INTO wpay_auth.payin_dispute_responses(id,dispute_id,actor_id,reason,proof_id,payload_digest) VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),d.id,userId,body.reason,proofId,fingerprint]);
  await ledger.audit(c,{actorId:userId,ownerId:userId,entityId:d.id,event:"payin_dispute_response",reason:body.reason,metadata:{orderId:d.order_id}});
  return this.detail(c,d.order_id);
 }
 async resolve(c,actorId,body){
  await ledger.lock(c);const d=(await c.query("SELECT * FROM wpay_auth.payin_disputes WHERE order_id=$1",[v.id(body.id)])).rows[0];if(!d)fail("CONFLICT");
  if(!["payment_valid","payment_invalid"].includes(body.action))fail();v.reason(body.reason);
  const prior=(await c.query("SELECT * FROM wpay_auth.payin_dispute_resolutions WHERE dispute_id=$1",[d.id])).rows[0];
  if(prior){if(prior.outcome!==body.action||prior.reason!==body.reason)fail("CONFLICT");return this.detail(c,d.order_id);}
  const entries=[...ledger.pair(d.user_id,"capacity_hold",d.amount_minor,"INR","debit")];
  if(BigInt(d.commission_minor)>0n)entries.push(...ledger.pair(d.user_id,"user_commission_hold",d.commission_minor,"INR","debit"));
  if(BigInt(d.merchant_net_minor)>0n)entries.push(...ledger.pair(d.merchant_id,"merchant_hold",d.merchant_net_minor,"INR","debit"));
  if(body.action==="payment_invalid"){
   const original=(await c.query("SELECT * FROM wpay_auth.business_entries WHERE journal_id=$1 AND owner_id IS NOT NULL",[d.original_journal_id])).rows,reversible=new Set(["capacity_consumed","merchant_gross","merchant_platform_fee","user_commission"]);
   if(!original.some(e=>e.owner_id===d.user_id&&e.ledger_type==="capacity_consumed")||!original.some(e=>e.owner_id===d.merchant_id&&e.ledger_type==="merchant_gross"))fail("CONFLICT");
   for(const e of original)if(reversible.has(e.ledger_type))entries.push(...ledger.pair(e.owner_id,e.ledger_type,e.amount_minor,e.currency,e.direction==="credit"?"debit":"credit"));
  }
  const journal=await ledger.post(c,{key:"payin-dispute-resolution:"+d.id,referenceType:"payin_dispute_resolution",referenceId:d.id,actorId,snapshot:{orderId:d.order_id,originalJournalId:d.original_journal_id},metadata:{outcome:body.action,reason:body.reason},entries});
  await c.query("INSERT INTO wpay_auth.payin_dispute_resolutions(dispute_id,outcome,reason,actor_id,journal_id) VALUES($1,$2,$3,$4,$5)",[d.id,body.action,body.reason,actorId,journal]);
  await ledger.audit(c,{actorId,ownerId:d.user_id,entityId:d.id,event:"payin_dispute_"+body.action,reason:body.reason,metadata:{orderId:d.order_id,merchantId:d.merchant_id}});
  return this.detail(c,d.order_id);
 }
 async detail(c,orderId){
  const r=(await c.query(`SELECT d.*,o.reference,o.paid_at,m.name AS merchant_name,u.name AS user_name,z.outcome,z.reason AS resolution_reason,z.created_at AS resolved_at
   FROM wpay_auth.payin_disputes d JOIN wpay_auth.gateway_orders o ON o.id=d.order_id
   JOIN wpay_auth.accounts m ON m.id=d.merchant_id JOIN wpay_auth.accounts u ON u.id=d.user_id
   LEFT JOIN wpay_auth.payin_dispute_resolutions z ON z.dispute_id=d.id WHERE d.order_id=$1`,[v.id(orderId)])).rows[0];
  if(!r)return null;
  return {id:r.id,orderId:r.order_id,reference:r.reference,merchantId:r.merchant_id,merchantName:r.merchant_name,userId:r.user_id,userName:r.user_name,status:r.outcome||"pending",reason:r.reason,statementId:r.statement_id,coverageFrom:r.coverage_from,coverageThrough:r.coverage_through,amountMinor:r.amount_minor,commissionMinor:r.commission_minor,merchantNetMinor:r.merchant_net_minor,createdAt:r.created_at,paidAt:r.paid_at,resolvedAt:r.resolved_at,resolutionReason:r.resolution_reason,responses:(await c.query('SELECT id,actor_id AS "actorId",reason,proof_id AS "proofId",created_at AS "createdAt" FROM wpay_auth.payin_dispute_responses WHERE dispute_id=$1 ORDER BY created_at,id',[r.id])).rows};
 }
 async download(c,orderId,proofId,actorId){
  const p=(await c.query("SELECT * FROM wpay_auth.payin_dispute_proofs WHERE order_id=$1 AND id=$2",[v.id(orderId),v.id(proofId)])).rows[0];if(!p)fail("FORBIDDEN");
  await ledger.audit(c,{actorId,ownerId:p.owner_id,entityId:p.id,event:"payin_dispute_proof_downloaded",metadata:{orderId:p.order_id}});
  return {name:p.id+"."+p.extension,contentType:"application/octet-stream",data:this.crypto.open(p.encrypted_bytes,binding(p.id)),scanState:p.scan_state};
 }
}
module.exports={PayinDisputes,withinWindow,coverage,binding};
