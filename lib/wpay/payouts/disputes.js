'use strict';
const {randomUUID}=require('node:crypto'),ledger=require('../business/ledger'),v=require('../business/validation'),a=require('./accounting'),{fail,fields}=require('./validation');
const binding=id=>'wpay-payout-proof:'+id;
const withinWindow=(approved,now)=>Number.isFinite(+new Date(approved))&&Number.isFinite(+new Date(now))&&+new Date(now)>=+new Date(approved)&&+new Date(now)-+new Date(approved)<48*3600000;
function coverage(body,paymentAt,now){
 const from=Date.parse(body.coverageFrom),through=Date.parse(body.coverageThrough);
 // Browser declares the statement's coverage. A reviewer must check its contents;
 // an uploaded document or its dates are never proof of a payment by themselves.
 if(!Number.isFinite(from)||!Number.isFinite(through)||from>+new Date(paymentAt)||through<+new Date(now)-300000||through>+new Date(now)+60000||through<from)fail('INVALID_INPUT');
 return {from:new Date(from).toISOString(),through:new Date(through).toISOString()};
}
async function saveProof(core,c,payout,owner,proof){
 if(!proof?.digest||!proof.bytes)fail('INVALID_INPUT');const id=randomUUID();
 await c.query('INSERT INTO wpay_auth.payout_proofs(id,payout_id,owner_id,extension,size,digest,encrypted_bytes,scan_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,payout,owner,proof.extension,proof.size,proof.digest,core.crypto.seal(proof.bytes.toString('base64'),binding(id)),proof.scanState]);return id;
}
async function open(core,c,p,actor,body,proof){
 fields(body,['id','reason','statement','coverageFrom','coverageThrough']);v.reason(body.reason);
 await ledger.lock(c);
 const r=(await c.query(`SELECT p.*,s.commission_minor,c.user_id,s.created_at approved_at,
 c.created_at paid_at,CURRENT_TIMESTAMP database_now FROM wpay_auth.payout_orders p
 JOIN wpay_auth.payout_settlements s ON s.payout_id=p.id JOIN wpay_auth.payout_claims c ON c.id=s.claim_id
 JOIN wpay_auth.payout_submissions sub ON sub.claim_id=c.id WHERE p.id=$1 FOR UPDATE OF p`,[p.id])).rows[0];
 if(!r||r.merchant_id!==actor)fail('FORBIDDEN');
 const fingerprint=ledger.digest({reason:body.reason,proof:proof?.digest,from:body.coverageFrom,through:body.coverageThrough});
 const prior=(await c.query('SELECT * FROM wpay_auth.payout_disputes WHERE payout_id=$1',[p.id])).rows[0];
 if(prior){if(prior.payload_digest!==fingerprint)fail('CONFLICT');return detail(c,p.id);}
 if(r.state!=='successful'||!withinWindow(r.approved_at,r.database_now))fail('CONFLICT');
 const dates=coverage(body,r.paid_at,r.database_now);
 if((await c.query('SELECT 1 FROM wpay_auth.payout_proofs WHERE payout_id=$1 AND digest=$2',[p.id,proof.digest])).rowCount)fail('INVALID_INPUT');
 const id=randomUUID(),statement=await saveProof(core,c,p.id,actor,proof);
 await c.query('INSERT INTO wpay_auth.payout_disputes(id,payout_id,merchant_id,user_id,reason,statement_id,coverage_from,coverage_through,amount_minor,commission_minor,payload_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,p.id,actor,r.user_id,body.reason,statement,dates.from,dates.through,r.amount_minor,r.commission_minor,fingerprint]);
 const entries=ledger.pair(r.user_id,'capacity_hold',r.amount_minor);
 if(BigInt(r.commission_minor)>0n)entries.push(...ledger.pair(r.user_id,'user_commission_hold',r.commission_minor));
 await a.journal(c,id,'payout_dispute_hold',actor,entries,{payoutId:p.id},{reason:body.reason});
 await a.event(c,{id:p.id,owner:r.user_id,actor,kind:'postapproval_dispute',state:'pending',reason:body.reason});
 await c.query('INSERT INTO wpay_auth.security_audit(id,actor_id,account_id,event,reason) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,r.user_id,'Payout dispute opened: '+r.reference,body.reason]);
 return detail(c,p.id);
}
async function detail(c,payout){
 const r=(await c.query(`SELECT d.*,r.outcome,r.reason resolution_reason,r.created_at resolved_at FROM wpay_auth.payout_disputes d LEFT JOIN wpay_auth.payout_dispute_resolutions r ON r.dispute_id=d.id WHERE d.payout_id=$1`,[payout])).rows[0];
 if(!r)return null;
 return {id:r.id,status:r.outcome||'pending',reason:r.reason,statementId:r.statement_id,coverageFrom:r.coverage_from,coverageThrough:r.coverage_through,amountMinor:r.amount_minor,commissionMinor:r.commission_minor,createdAt:r.created_at,resolvedAt:r.resolved_at,resolutionReason:r.resolution_reason,
 responses:(await c.query('SELECT id,reason,proof_id AS "proofId",created_at AS "createdAt" FROM wpay_auth.payout_dispute_responses WHERE dispute_id=$1 ORDER BY created_at,id',[r.id])).rows};
}
async function respond(core,c,p,user,body,proof){
 fields(body,['id','reason','proof']);v.reason(body.reason);await ledger.lock(c);
 const d=(await c.query('SELECT * FROM wpay_auth.payout_disputes WHERE payout_id=$1',[p.id])).rows[0];if(!d||d.user_id!==user)fail('FORBIDDEN');
 const fingerprint=ledger.digest({reason:body.reason,proof:proof?.digest||null});
 if((await c.query('SELECT 1 FROM wpay_auth.payout_dispute_responses WHERE dispute_id=$1 AND payload_digest=$2',[d.id,fingerprint])).rowCount)return detail(c,p.id);
 if((await c.query('SELECT 1 FROM wpay_auth.payout_dispute_resolutions WHERE dispute_id=$1',[d.id])).rowCount)fail('CONFLICT');
 const proofId=proof?await saveProof(core,c,p.id,user,proof):null;
 await c.query('INSERT INTO wpay_auth.payout_dispute_responses(id,dispute_id,actor_id,reason,proof_id,payload_digest) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),d.id,user,body.reason,proofId,fingerprint]);
 await a.event(c,{id:p.id,owner:d.merchant_id,actor:user,kind:'postapproval_dispute',state:'response',reason:body.reason});return detail(c,p.id);
}
async function resolve(core,c,p,actor,body){
 fields(body,['id','action','reason']);v.reason(body.reason);if(!['payment_valid','payment_invalid'].includes(body.action))fail();await ledger.lock(c);
 const d=(await c.query('SELECT * FROM wpay_auth.payout_disputes WHERE payout_id=$1',[p.id])).rows[0];if(!d)fail('CONFLICT');
 const prior=(await c.query('SELECT * FROM wpay_auth.payout_dispute_resolutions WHERE dispute_id=$1',[d.id])).rows[0];
 if(prior){if(prior.outcome!==body.action||prior.reason!==body.reason)fail('CONFLICT');return detail(c,p.id);}
 const entries=ledger.pair(d.user_id,'capacity_hold',d.amount_minor,'INR','debit');
 if(BigInt(d.commission_minor)>0n)entries.push(...ledger.pair(d.user_id,'user_commission_hold',d.commission_minor,'INR','debit'));
 if(body.action==='payment_invalid'){
  const original=(await c.query(`SELECT e.* FROM wpay_auth.business_entries e JOIN wpay_auth.payout_settlements s ON s.journal_id=e.journal_id WHERE s.payout_id=$1 AND e.owner_id IS NOT NULL`,[p.id])).rows;
  // Reverse the exact original capacity path (allocated credit or consumed debit).
  // Reservation was already released on success, so it must not be restored.
  const reversible=new Set(['capacity_allocated','capacity_consumed','user_payout_commission','merchant_payout_principal','merchant_payout_fee']);
  for(const e of original)if(reversible.has(e.ledger_type))entries.push(...ledger.pair(e.owner_id,e.ledger_type,e.amount_minor,e.currency,e.direction==='credit'?'debit':'credit'));
  if(!original.some(e=>e.owner_id===d.user_id&&['capacity_allocated','capacity_consumed'].includes(e.ledger_type))||!original.some(e=>e.ledger_type==='merchant_payout_principal'))fail('CONFLICT');
 }
 const journal=await a.journal(c,d.id,'payout_dispute_resolution',actor,entries,{payoutId:p.id},{outcome:body.action,reason:body.reason});
 await c.query('INSERT INTO wpay_auth.payout_dispute_resolutions(dispute_id,outcome,reason,actor_id,journal_id) VALUES($1,$2,$3,$4,$5)',[d.id,body.action,body.reason,actor,journal]);
 await a.event(c,{id:p.id,owner:d.user_id,actor,kind:'postapproval_dispute',state:body.action,reason:body.reason});
 await a.event(c,{id:p.id,owner:d.merchant_id,actor,kind:'postapproval_dispute',state:body.action,reason:body.reason});
 for(const owner of [d.user_id,d.merchant_id])await c.query('INSERT INTO wpay_auth.security_audit(id,actor_id,account_id,event,reason) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,owner,'Payout dispute '+body.action+': '+p.reference,body.reason]);
 return detail(c,p.id);
}
module.exports={open,respond,resolve,detail,coverage,withinWindow};
