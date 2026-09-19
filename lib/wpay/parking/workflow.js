"use strict";
const {randomUUID}=require('node:crypto'),ledger=require('../business/ledger'),v=require('../business/validation'),money=require('../business/money');
const {fail,recent,permit,accountResource}=require('../operations/access');
const {providerRead}=require('../integrations/provider-read');
const transitions={requested:['submitted','approved','cancelled','expired','failed','disputed'],submitted:['approved','cancelled','expired','failed','disputed'],approved:['cancelled','expired','failed','disputed'],completed:['disputed'],review:['disputed'],failed:[],expired:[],cancelled:[],disputed:[]};
class Parking {
 constructor({verify=null,allowSynthetic=false}={}){this.verify=verify;this.allowSynthetic=allowSynthetic;}
 async request(c,row,context,b){
  v.exactFields(b,['requestId','bankId','bankVersion','amountMinor']);v.id(b.requestId);v.id(b.bankId);const amount=money.minor(b.amountMinor);if(amount<=0n||amount>money.MAX)fail('INVALID_INPUT');
  if(row.account_type!=='user')fail();permit(context,'user.parking_payments.create',accountResource(row,'create'));recent(row);await ledger.lock(c);
  const fingerprint=ledger.digest(b),prior=(await c.query('SELECT * FROM wpay_auth.parking_requests WHERE owner_id=$1 AND request_id=$2',[row.id,b.requestId])).rows[0];
  if(prior){if(prior.payload_digest!==fingerprint)fail('CONFLICT');return this.result(c,prior);}
  const bank=(await c.query('SELECT * FROM wpay_auth.business_bank_accounts WHERE id=$1 FOR SHARE',[b.bankId])).rows[0];if(!bank||bank.owner_id!==row.id||bank.version!==b.bankVersion||bank.frozen||bank.deactivated)fail();
  const terms=(await c.query('SELECT id,version,settings FROM wpay_auth.commercial_versions WHERE account_id=$1 AND effective_at<=CURRENT_TIMESTAMP ORDER BY version DESC LIMIT 1',[row.id])).rows[0];if(!terms)fail('UNAVAILABLE');
  const snapshot={user:terms,tenantId:row.tenant_id,ownerId:row.id,bankId:bank.id,bankVersion:bank.version,amountMinor:b.amountMinor,currency:'INR'},id=randomUUID();
  const request=(await c.query("INSERT INTO wpay_auth.parking_requests(id,owner_id,actor_id,request_id,amount_minor,currency,snapshot,payload_digest) VALUES($1,$2,$2,$3,$4,'INR',$5,$6) RETURNING *",[id,row.id,b.requestId,b.amountMinor,snapshot,fingerprint])).rows[0];
  await this.event(c,request,row.id,b.requestId,1,null,'requested','Parking return requested; no capacity restored',null,fingerprint);return this.result(c,request);
 }
 async result(c,request){const latest=(await c.query('SELECT version,state FROM wpay_auth.parking_transitions WHERE parking_id=$1 ORDER BY version DESC LIMIT 1',[request.id])).rows[0];return {id:request.id,amountMinor:request.amount_minor,currency:'INR',...latest,executionConnected:false};}
 async event(c,r,actor,requestId,version,previous,state,reason,evidenceDigest,payloadDigest){await c.query('INSERT INTO wpay_auth.parking_transitions(id,parking_id,actor_id,request_id,version,previous_state,state,reason,evidence_digest,payload_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),r.id,actor,requestId,version,previous,state,reason,evidenceDigest,payloadDigest]);}
 async transition(c,row,context,b){
  v.exactFields(b,['id','requestId','expectedVersion','action','reason','evidenceReference']);v.id(b.id);v.id(b.requestId);v.reason(b.reason);
  if(!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<1||!['submitted','approved','failed','expired','cancelled','disputed','complete','reconcile_complete'].includes(b.action)||b.evidenceReference!==null&&(typeof b.evidenceReference!=='string'||b.evidenceReference.length>160))fail('INVALID_INPUT');
  if(!['admin','super_admin'].includes(row.account_type))fail();recent(row);
  await ledger.lock(c);
  // Requests are immutable; lock only the mutable owner row. Row-locking the
  // immutable table would require an UPDATE privilege we deliberately withhold.
  const r=(await c.query('SELECT p.*,a.tenant_id FROM wpay_auth.parking_requests p JOIN wpay_auth.accounts a ON a.id=p.owner_id WHERE p.id=$1 FOR SHARE OF a',[b.id])).rows[0];if(!r)fail();
  const resource={kind:'record',id:r.id,tenantId:r.tenant_id};permit(context,['approved','complete','reconcile_complete'].includes(b.action)?'parking.approve':b.action==='cancelled'||b.action==='failed'?'parking.reject':'parking.review',resource);
  if(b.action==='reconcile_complete')permit(context,'parking.review',resource);
  const fingerprint=ledger.digest(b),prior=(await c.query('SELECT * FROM wpay_auth.parking_transitions WHERE actor_id=$1 AND request_id=$2',[row.id,b.requestId])).rows[0];
  if(prior){if(prior.parking_id!==r.id||prior.payload_digest!==fingerprint)fail('CONFLICT');return this.result(c,r);}
  const current=await this.result(c,r);if(current.version!==b.expectedVersion)fail('CONFLICT');
  const posting=(await c.query('SELECT * FROM wpay_auth.parking_postings WHERE parking_id=$1',[r.id])).rows[0];let next=b.action,evidenceDigest=null;
  if(['complete','reconcile_complete'].includes(b.action)){
   if(!b.evidenceReference)fail('INVALID_INPUT');
   if(b.action==='complete'&&!['approved','failed','expired','completed'].includes(current.state)||b.action==='reconcile_complete'&&!['review','disputed'].includes(current.state))fail('CONFLICT');
   // A server-configured verifier must authenticate the source. No body can
   // supply a proof, completion flag, economic ID or commercial snapshot.
   const wanted={parkingId:r.id,ownerId:r.owner_id,tenantId:r.tenant_id,amountMinor:r.amount_minor,currency:'INR',snapshotDigest:ledger.digest(r.snapshot),evidenceReference:b.evidenceReference};
   const response=await providerRead(this.verify,wanted,{timeoutMs:2000,attempts:1});if(response.state!=='response'||!response.value)fail('UNAVAILABLE');const proof=response.value;
   if(Object.keys(wanted).some(k=>proof[k]!==wanted[k])||proof.independentlyVerified!==true||proof.final!==true||proof.status!=='completed'||proof.revoked!==false||proof.synthetic===true&&!this.allowSynthetic||typeof proof.economicId!=='string'||typeof proof.sourceId!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(proof.economicId)||! /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(proof.sourceId)||!Number.isFinite(proof.validUntil)||proof.validUntil<=+new Date(row.database_now))fail();
   evidenceDigest=ledger.digest(proof);const economicDigest=ledger.digest({sourceId:proof.sourceId,economicId:proof.economicId});
   if(posting&&posting.economic_digest!==economicDigest)fail('DUPLICATE_TRANSFER');
   if(['failed','expired'].includes(current.state))next='review';
   else{
    next='completed';
    if(!posting){
     if((await c.query('SELECT 1 FROM wpay_auth.parking_postings WHERE economic_digest=$1',[economicDigest])).rowCount)fail('DUPLICATE_TRANSFER');
     const provenance={sourceId:proof.sourceId,economicDigest,evidenceDigest,actorId:row.id};
     const journal=await ledger.post(c,{key:'parking-return:'+r.id,referenceType:'parking_return',referenceId:r.id,actorId:row.id,source:'authoritative-parking-evidence',snapshot:r.snapshot,metadata:provenance,entries:ledger.pair(r.owner_id,'capacity_allocated',r.amount_minor)});
     await c.query('INSERT INTO wpay_auth.parking_postings(parking_id,economic_digest,evidence_digest,journal_id,actor_id,provenance) VALUES($1,$2,$3,$4,$5,$6)',[r.id,economicDigest,evidenceDigest,journal,row.id,provenance]);
    }else if(current.state==='disputed')await ledger.post(c,{key:'parking-dispute-release:'+r.id+':'+current.version,referenceType:'parking_dispute_release',referenceId:r.id,actorId:row.id,snapshot:r.snapshot,metadata:{evidenceDigest},entries:ledger.pair(r.owner_id,'capacity_hold',r.amount_minor,'INR','debit')});
   }
  }else{
   if(b.evidenceReference!==null||!transitions[current.state]?.includes(b.action))fail('CONFLICT');
   if(next==='disputed'&&posting)await ledger.post(c,{key:'parking-dispute:'+r.id+':'+(current.version+1),referenceType:'parking_dispute',referenceId:r.id,actorId:row.id,snapshot:r.snapshot,metadata:{reason:b.reason},entries:ledger.pair(r.owner_id,'capacity_hold',r.amount_minor)});
  }
  await this.event(c,r,row.id,b.requestId,current.version+1,current.state,next,b.reason,evidenceDigest,fingerprint);return this.result(c,r);
 }
}
module.exports={Parking};
