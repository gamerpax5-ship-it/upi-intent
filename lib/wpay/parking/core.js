"use strict";
const {randomUUID}=require('node:crypto');
const ledger=require('../business/ledger');
const money=require('../business/money');
const v=require('../business/validation');
const uploads=require('../payouts/uploads');
const policy=require('../business/user-workflow-policy');
const {AuthError}=require('../auth/runtime/errors');
const fail=(code='INVALID_INPUT')=>{throw new AuthError(code);};
const binding=(kind,id)=>'wpay-parking-'+kind+':'+id;
const LEASE_SECONDS=600,COOLDOWN_SECONDS=300;
const uuid=value=>v.id(value);
const tenant=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value))fail();return value;};
const utr=value=>{if(typeof value!=='string'||!/^[0-9]{12}$/.test(value))fail();return value;};

class Parking{
 constructor({crypto,scanner=null}){this.crypto=crypto;this.scanner=scanner;}
 details(input){
  if(!input||Object.getPrototypeOf(input)!==Object.prototype)fail();
  const allowed=['beneficiaryName','bankName','accountNumber','ifsc','upiId'];if(Object.keys(input).some(k=>!allowed.includes(k))||allowed.slice(0,4).some(k=>!Object.hasOwn(input,k)))fail();
  if(!/^[0-9]{6,24}$/.test(input.accountNumber)||!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(input.ifsc))fail();
  const upi=input.upiId??'';if(upi!==''&&!/^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,40}$/.test(upi))fail();
  return {beneficiaryName:v.text(input.beneficiaryName,120),bankName:v.text(input.bankName,120),accountNumber:input.accountNumber,ifsc:input.ifsc,upiId:upi.toLowerCase()};
 }
 async prepare(operation,body){if(operation!=='parking/submit')return null;if(!body||Object.getPrototypeOf(body)!==Object.prototype||!body.proof)fail();return uploads.proof(body.proof,this.scanner);}
 async createBeneficiary(client,actorId,input){
  const allowed=['requestId','tenantId','beneficiaryName','bankName','accountNumber','ifsc','upiId'];if(!input||Object.keys(input).some(k=>!allowed.includes(k))||allowed.some(k=>!Object.hasOwn(input,k)))fail();
  uuid(input.requestId);const tenantId=tenant(input.tenantId),details=this.details({beneficiaryName:input.beneficiaryName,bankName:input.bankName,accountNumber:input.accountNumber,ifsc:input.ifsc,upiId:input.upiId}),digest=ledger.digest(details);
  const prior=(await client.query('SELECT * FROM wpay_auth.parking_beneficiaries WHERE actor_id=$1 AND request_id=$2',[actorId,input.requestId])).rows[0];
  if(prior){if(prior.details_digest!==digest||prior.tenant_id!==tenantId)fail('CONFLICT');return this.projectBeneficiary(prior);}
  const id=randomUUID(),row=(await client.query('INSERT INTO wpay_auth.parking_beneficiaries(id,tenant_id,actor_id,request_id,encrypted_details,details_digest) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
   [id,tenantId,actorId,input.requestId,this.crypto.seal(JSON.stringify(details),binding('beneficiary',id)),digest])).rows[0];
  await ledger.audit(client,{actorId,entityId:id,event:'parking_beneficiary_created',metadata:{tenantId,detailsDigest:digest}});return this.projectBeneficiary(row,true);
 }
 projectBeneficiary(row,detail=false){const out={id:row.id,tenantId:row.tenant_id,createdAt:row.created_at,revoked:!!row.revoked_at};if(detail)out.details=JSON.parse(this.crypto.open(row.encrypted_details,binding('beneficiary',row.id)));return out;}
 async beneficiaries(client,{tenantId,userId=null}){
  const rows=(await client.query(`SELECT b.*,actor.account_type AS actor_type,actor.name AS actor_name,EXISTS(SELECT 1 FROM wpay_auth.parking_beneficiary_confirmations c WHERE c.beneficiary_id=b.id AND c.user_id=$2) AS confirmed
   FROM wpay_auth.parking_beneficiaries b JOIN wpay_auth.accounts actor ON actor.id=b.actor_id WHERE b.tenant_id=$1 AND b.revoked_at IS NULL ORDER BY b.created_at DESC,b.id`,[tenantId,userId])).rows;
  return rows.map(r=>({...this.projectBeneficiary(r,true),confirmed:r.confirmed,sourceType:r.actor_type,sourceName:r.actor_name}));
 }
 async confirm(client,userId,tenantId,beneficiaryId){
  const b=(await client.query('SELECT * FROM wpay_auth.parking_beneficiaries WHERE id=$1 AND tenant_id=$2 AND revoked_at IS NULL',[uuid(beneficiaryId),tenantId])).rows[0];if(!b)fail('FORBIDDEN');
  await client.query('INSERT INTO wpay_auth.parking_beneficiary_confirmations(beneficiary_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[b.id,userId]);
  await ledger.audit(client,{actorId:userId,ownerId:userId,entityId:b.id,event:'parking_beneficiary_confirmed'});return {id:b.id,confirmed:true};
 }
 async createOrder(client,actorId,input){
  const required=['requestId','tenantId','beneficiaryId','reference','totalMinor','minMinor'],allowed=[...required,'maxMinor'];if(!input||Object.keys(input).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(input,k)))fail();
  uuid(input.requestId);const tenantId=tenant(input.tenantId);uuid(input.beneficiaryId);v.reference(input.reference);const total=money.minor(input.totalMinor),min=money.minor(input.minMinor);if(min<=0n||total<=0n||min>total)fail();const maximum=input.maxMinor??input.totalMinor;if(money.minor(maximum)<min||money.minor(maximum)>total)fail();
  const b=(await client.query('SELECT * FROM wpay_auth.parking_beneficiaries WHERE id=$1 AND tenant_id=$2 AND revoked_at IS NULL',[input.beneficiaryId,tenantId])).rows[0];if(!b)fail('FORBIDDEN');
  const fingerprint=ledger.digest({tenantId,beneficiaryId:b.id,reference:input.reference,totalMinor:input.totalMinor,minMinor:input.minMinor,maxMinor:maximum,detailsDigest:b.details_digest});
  const prior=(await client.query('SELECT * FROM wpay_auth.parking_orders WHERE actor_id=$1 AND request_id=$2',[actorId,input.requestId])).rows[0];
  if(prior){if(ledger.digest({...prior.snapshot,maxMinor:prior.snapshot.maxMinor||prior.total_minor})!==fingerprint)fail('CONFLICT');return this.projectOrder(prior,await this.lockedMinor(client,prior.id));}
  const id=randomUUID(),snapshot={tenantId,beneficiaryId:b.id,reference:input.reference,totalMinor:input.totalMinor,minMinor:input.minMinor,maxMinor:maximum,detailsDigest:b.details_digest},row=(await client.query(
   "INSERT INTO wpay_auth.parking_orders(id,tenant_id,beneficiary_id,actor_id,request_id,reference,total_minor,min_minor,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
   [id,tenantId,b.id,actorId,input.requestId,input.reference,input.totalMinor,input.minMinor,snapshot])).rows[0];
  await ledger.audit(client,{actorId,entityId:id,event:'parking_order_created',metadata:{tenantId,totalMinor:input.totalMinor,minMinor:input.minMinor}});return this.projectOrder(row,'0');
 }
 projectOrder(row,locked){const remaining=BigInt(row.total_minor)-BigInt(locked||0);return {id:row.id,tenantId:row.tenant_id,beneficiaryId:row.beneficiary_id,reference:row.reference,totalMinor:row.total_minor,minMinor:row.min_minor,maxMinor:row.snapshot.maxMinor||row.total_minor,remainingMinor:(remaining>0n?remaining:0n).toString(),state:row.state,createdAt:row.created_at};}
 async expire(client,orderId=null){
  await ledger.lock(client);
  const active=(await client.query("SELECT * FROM wpay_auth.parking_locks WHERE state='active' AND expires_at<=CURRENT_TIMESTAMP AND ($1::uuid IS NULL OR order_id=$1) ORDER BY expires_at,id FOR UPDATE",[orderId])).rows;
  for(const l of active){await client.query("UPDATE wpay_auth.parking_locks SET state='cooldown',cooldown_until=expires_at+($2*interval '1 second') WHERE id=$1",[l.id,COOLDOWN_SECONDS]);await this.transition(client,l.id,l.user_id,'expired','Payment window expired');}
  await client.query("UPDATE wpay_auth.parking_locks SET state='released',closed_at=CURRENT_TIMESTAMP WHERE state='cooldown' AND cooldown_until<=CURRENT_TIMESTAMP AND ($1::uuid IS NULL OR order_id=$1)",[orderId]);
 }
 async lockedMinor(client,orderId){return (await client.query("SELECT COALESCE(sum(amount_minor),0)::text AS n FROM wpay_auth.parking_locks WHERE order_id=$1 AND state=ANY($2)",[orderId,['active','cooldown','submitted','review','completed','disputed']])).rows[0].n;}
 async orders(client,{tenantId,userId=null}){
  await this.expire(client);const params=[tenantId,userId],rows=(await client.query(`SELECT o.*,b.encrypted_details,actor.account_type AS actor_type,actor.name AS actor_name,
   COALESCE((SELECT sum(l.amount_minor) FROM wpay_auth.parking_locks l WHERE l.order_id=o.id AND l.state=ANY($3)),0)::text AS locked
   FROM wpay_auth.parking_orders o JOIN wpay_auth.parking_beneficiaries b ON b.id=o.beneficiary_id JOIN wpay_auth.accounts actor ON actor.id=o.actor_id
   WHERE o.tenant_id=$1 AND o.state='open' AND b.revoked_at IS NULL
   AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM wpay_auth.parking_beneficiary_confirmations c WHERE c.beneficiary_id=o.beneficiary_id AND c.user_id=$2))
   ORDER BY o.created_at,o.id`,[...params,['active','cooldown','submitted','review','completed','disputed']])).rows;
  return rows.map(r=>({...this.projectOrder(r,r.locked),sourceType:r.actor_type,sourceName:r.actor_name,beneficiary:JSON.parse(this.crypto.open(r.encrypted_details,binding('beneficiary',r.beneficiary_id)))})).filter(r=>BigInt(r.remainingMinor)>0n);
 }
 async transition(client,parkingId,actorId,state,reason,evidenceDigest=null){
  const version=(await client.query('SELECT COALESCE(max(version),0)+1 AS v FROM wpay_auth.parking_transitions WHERE parking_id=$1',[parkingId])).rows[0].v;
  const previous=(await client.query('SELECT state FROM wpay_auth.parking_transitions WHERE parking_id=$1 ORDER BY version DESC LIMIT 1',[parkingId])).rows[0]?.state??null;
  const requestId=randomUUID(),payload=ledger.digest({parkingId,actorId,state,reason,evidenceDigest,version,previous});
  await client.query('INSERT INTO wpay_auth.parking_transitions(id,parking_id,actor_id,request_id,version,state,previous_state,reason,evidence_digest,payload_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
   [randomUUID(),parkingId,actorId,requestId,version,state,previous,reason,evidenceDigest,payload]);return version;
 }
 async lock(client,userId,tenantId,input){
  const allowed=['requestId','orderId','amountMinor'];if(!input||Object.keys(input).some(k=>!allowed.includes(k))||allowed.some(k=>!Object.hasOwn(input,k)))fail();uuid(input.requestId);uuid(input.orderId);const amount=money.minor(input.amountMinor);if(amount<=0n)fail();
  await ledger.lock(client);await this.expire(client);
  const order=(await client.query('SELECT * FROM wpay_auth.parking_orders WHERE id=$1 AND tenant_id=$2 AND state=$3 FOR UPDATE',[input.orderId,tenantId,'open'])).rows[0];if(!order)fail('FORBIDDEN');
  if(!(await client.query('SELECT 1 FROM wpay_auth.parking_beneficiary_confirmations WHERE beneficiary_id=$1 AND user_id=$2',[order.beneficiary_id,userId])).rowCount)fail('FORBIDDEN');
  const prior=(await client.query('SELECT r.*,l.order_id,l.amount_minor,l.state,l.expires_at,l.cooldown_until FROM wpay_auth.parking_requests r JOIN wpay_auth.parking_locks l ON l.id=r.id WHERE r.owner_id=$1 AND r.request_id=$2',[userId,input.requestId])).rows[0];
  const digest=ledger.digest({orderId:order.id,amountMinor:input.amountMinor});
  if(prior){if(prior.payload_digest!==digest)fail('CONFLICT');return {id:prior.id,orderId:prior.order_id,amountMinor:prior.amount_minor,state:prior.state,expiresAt:prior.expires_at,cooldownUntil:prior.cooldown_until};}
  if((await client.query("SELECT 1 FROM wpay_auth.parking_locks WHERE user_id=$1 AND state IN('active','cooldown') LIMIT 1",[userId])).rowCount)fail('CONFLICT');
  const locked=BigInt(await this.lockedMinor(client,order.id)),remaining=BigInt(order.total_minor)-locked;if(remaining<=0n||!policy.parkingPortionAllowed({amountMinor:input.amountMinor,remainingMinor:remaining.toString(),minMinor:order.min_minor,maxMinor:order.snapshot.maxMinor||order.total_minor}))fail('INSUFFICIENT_CAPACITY');
  const beneficiary=(await client.query('SELECT details_digest FROM wpay_auth.parking_beneficiaries WHERE id=$1',[order.beneficiary_id])).rows[0],id=randomUUID(),snapshot={orderId:order.id,beneficiaryId:order.beneficiary_id,beneficiaryDigest:beneficiary.details_digest,totalMinor:order.total_minor,minMinor:order.min_minor,reference:order.reference};
  await client.query("INSERT INTO wpay_auth.parking_requests(id,owner_id,actor_id,request_id,amount_minor,currency,snapshot,payload_digest) VALUES($1,$2,$2,$3,$4,'INR',$5,$6)",[id,userId,input.requestId,input.amountMinor,snapshot,digest]);
  const lock=(await client.query("INSERT INTO wpay_auth.parking_locks(id,order_id,user_id,amount_minor,state,expires_at) VALUES($1,$2,$3,$4,'active',CURRENT_TIMESTAMP+($5*interval '1 second')) RETURNING *",[id,order.id,userId,input.amountMinor,LEASE_SECONDS])).rows[0];
  await this.transition(client,id,userId,'requested','User locked Parking amount');return {id,orderId:order.id,amountMinor:lock.amount_minor,state:lock.state,expiresAt:lock.expires_at,cooldownSeconds:COOLDOWN_SECONDS};
 }
 async release(client,userId,id){
  await ledger.lock(client);const row=(await client.query('SELECT * FROM wpay_auth.parking_locks WHERE id=$1 AND user_id=$2 FOR UPDATE',[uuid(id),userId])).rows[0];if(!row)fail('FORBIDDEN');
  if(row.state==='cooldown')return {id:row.id,state:row.state,cooldownUntil:row.cooldown_until};if(row.state!=='active')fail('CONFLICT');
  const next=(await client.query("UPDATE wpay_auth.parking_locks SET state='cooldown',cooldown_until=CURRENT_TIMESTAMP+($2*interval '1 second') WHERE id=$1 RETURNING *",[row.id,COOLDOWN_SECONDS])).rows[0];
  await this.transition(client,row.id,userId,'cancelled','User released unpaid Parking lock');return {id:row.id,state:next.state,cooldownUntil:next.cooldown_until};
 }
 async submit(client,userId,body,proof){
  const allowed=['id','utr','proof','note'];if(!body||Object.keys(body).some(k=>!allowed.includes(k))||allowed.some(k=>!Object.hasOwn(body,k)))fail();uuid(body.id);utr(body.utr);const note=body.note===''?'':v.reason(body.note);
  await ledger.lock(client);await this.expire(client);
  const row=(await client.query('SELECT *,CURRENT_TIMESTAMP AS database_now FROM wpay_auth.parking_locks WHERE id=$1 AND user_id=$2 FOR UPDATE',[body.id,userId])).rows[0];if(!row)fail('FORBIDDEN');
  const previous=(await client.query('SELECT proof_digest,encrypted_evidence FROM wpay_auth.parking_submissions WHERE parking_id=$1',[row.id])).rows[0];if(previous){const old=JSON.parse(this.crypto.open(previous.encrypted_evidence,binding('evidence',row.id)));if(previous.proof_digest!==proof.digest||old.utr!==body.utr||old.note!==note)fail('CONFLICT');return {id:row.id,state:row.state};}
  const automaticGrace=row.state==='cooldown'&&+row.cooldown_until===+row.expires_at+COOLDOWN_SECONDS*1000;
  if(!(row.state==='active'||automaticGrace)||!policy.claimWindow(row.created_at,row.database_now).canSubmit)fail('CONFLICT');
  const evidence={utr:body.utr,note},evidenceDigest=ledger.digest({utr:body.utr,proof:proof.digest});
  await client.query('INSERT INTO wpay_auth.parking_submissions(parking_id,proof_digest,extension,size,scan_state,encrypted_proof,encrypted_evidence) VALUES($1,$2,$3,$4,$5,$6,$7)',
   [row.id,proof.digest,proof.extension,proof.size,proof.scanState,this.crypto.seal(proof.bytes.toString('base64'),binding('proof',row.id)),this.crypto.seal(JSON.stringify(evidence),binding('evidence',row.id))]);
  await client.query("UPDATE wpay_auth.parking_locks SET state='submitted' WHERE id=$1",[row.id]);await this.transition(client,row.id,userId,'submitted','User submitted Parking payment evidence',evidenceDigest);return {id:row.id,state:'submitted',scanState:proof.scanState};
 }
 async userHistory(client,userId){
  await this.expire(client);const rows=(await client.query(`SELECT l.*,CURRENT_TIMESTAMP AS database_now,(SELECT reason FROM wpay_auth.parking_transitions t WHERE t.parking_id=l.id ORDER BY version DESC LIMIT 1) AS last_reason,o.reference,o.beneficiary_id,b.encrypted_details,s.scan_state FROM wpay_auth.parking_locks l JOIN wpay_auth.parking_orders o ON o.id=l.order_id JOIN wpay_auth.parking_beneficiaries b ON b.id=o.beneficiary_id LEFT JOIN wpay_auth.parking_submissions s ON s.parking_id=l.id WHERE l.user_id=$1 ORDER BY l.created_at DESC,l.id LIMIT 100`,[userId])).rows;
  return rows.map(r=>({id:r.id,orderId:r.order_id,reference:r.reference,amountMinor:r.amount_minor,state:r.state,expiresAt:r.expires_at,cooldownUntil:r.cooldown_until,scanState:r.scan_state??null,reason:r.last_reason??null,canSubmit:(r.state==='active'||r.state==='cooldown'&&+r.cooldown_until===+r.expires_at+COOLDOWN_SECONDS*1000)&&policy.claimWindow(r.created_at,r.database_now).canSubmit,beneficiary:JSON.parse(this.crypto.open(r.encrypted_details,binding('beneficiary',r.beneficiary_id)))}));
 }
 async admin(client,tenants){
  await this.expire(client);const beneficiaries=(await client.query('SELECT * FROM wpay_auth.parking_beneficiaries WHERE tenant_id=ANY($1) ORDER BY created_at DESC,id LIMIT 100',[tenants])).rows.map(r=>this.projectBeneficiary(r,true));
  const orders=(await client.query("SELECT o.*,COALESCE((SELECT sum(l.amount_minor) FROM wpay_auth.parking_locks l WHERE l.order_id=o.id AND l.state=ANY($2)),0)::text AS locked FROM wpay_auth.parking_orders o WHERE tenant_id=ANY($1) ORDER BY created_at DESC,id LIMIT 100",[tenants,['active','cooldown','submitted','review','completed','disputed']])).rows.map(r=>this.projectOrder(r,r.locked));
  const reviews=(await client.query(`SELECT l.*,o.reference,o.tenant_id,s.scan_state,s.created_at AS submitted_at,a.name AS user_name FROM wpay_auth.parking_locks l JOIN wpay_auth.parking_orders o ON o.id=l.order_id JOIN wpay_auth.accounts a ON a.id=l.user_id LEFT JOIN wpay_auth.parking_submissions s ON s.parking_id=l.id WHERE o.tenant_id=ANY($1) AND l.state=ANY($2) ORDER BY COALESCE(s.created_at,l.created_at),l.id LIMIT 100`,[tenants,['submitted','review','disputed']])).rows.map(r=>({id:r.id,orderId:r.order_id,reference:r.reference,tenantId:r.tenant_id,userName:r.user_name,amountMinor:r.amount_minor,state:r.state,scanState:r.scan_state,submittedAt:r.submitted_at}));
  return {beneficiaries,orders,reviews};
 }
 async review(client,actorId,id,action,reason){
  v.reason(reason);await ledger.lock(client);const lock=(await client.query('SELECT l.*,o.tenant_id,o.reference FROM wpay_auth.parking_locks l JOIN wpay_auth.parking_orders o ON o.id=l.order_id WHERE l.id=$1 FOR UPDATE OF l',[uuid(id)])).rows[0];if(!lock)fail('FORBIDDEN');
  if(!['review','approve','dispute','not_paid'].includes(action))fail();
  const allowed={review:['submitted'],approve:['submitted','review','disputed'],dispute:['submitted','review'],not_paid:['submitted','review','disputed']}[action];if(!allowed.includes(lock.state))fail('CONFLICT');
  const submission=(await client.query('SELECT * FROM wpay_auth.parking_submissions WHERE parking_id=$1',[lock.id])).rows[0];if(!submission)fail('CONFLICT');
  const evidence=JSON.parse(this.crypto.open(submission.encrypted_evidence,binding('evidence',lock.id))),evidenceDigest=ledger.digest({utr:evidence.utr,proof:submission.proof_digest});
  if(action==='review'){await client.query("UPDATE wpay_auth.parking_locks SET state='review' WHERE id=$1",[lock.id]);await this.transition(client,lock.id,actorId,'review',reason,evidenceDigest);return {id:lock.id,state:'review'};}
  if(action==='dispute'){await client.query("UPDATE wpay_auth.parking_locks SET state='disputed' WHERE id=$1",[lock.id]);await this.transition(client,lock.id,actorId,'disputed',reason,evidenceDigest);return {id:lock.id,state:'disputed'};}
  if(action==='not_paid'){await client.query("UPDATE wpay_auth.parking_locks SET state='not_paid',closed_at=CURRENT_TIMESTAMP WHERE id=$1",[lock.id]);await this.transition(client,lock.id,actorId,'failed',reason,evidenceDigest);return {id:lock.id,state:'not_paid'};}
  const economicDigest=ledger.digest({network:'INR',reference:evidence.utr}),used=(await client.query('SELECT resource_id FROM wpay_auth.payout_economic_references WHERE digest=$1',[economicDigest])).rows[0];if(used)fail('DUPLICATE_TRANSFER');
  const request=(await client.query('SELECT * FROM wpay_auth.parking_requests WHERE id=$1',[lock.id])).rows[0],terms=(await client.query('SELECT id,version,settings FROM wpay_auth.commercial_versions WHERE account_id=$1 AND effective_at<=CURRENT_TIMESTAMP ORDER BY version DESC LIMIT 1',[lock.user_id])).rows[0];if(!request||!terms)fail('UNAVAILABLE');
  const snapshot={parking:request.snapshot,user:terms},journalId=await ledger.post(client,{key:'parking-completion:'+lock.id,referenceType:'parking',referenceId:lock.id,actorId,snapshot,metadata:{reason,evidenceDigest},entries:ledger.pair(lock.user_id,'capacity_allocated',lock.amount_minor)});
  await client.query("INSERT INTO wpay_auth.payout_economic_references(digest,kind,resource_id) VALUES($1,'parking',$2)",[economicDigest,lock.id]);
  await client.query('INSERT INTO wpay_auth.parking_postings(parking_id,economic_digest,evidence_digest,journal_id,actor_id,provenance) VALUES($1,$2,$3,$4,$5,$6)',[lock.id,economicDigest,evidenceDigest,journalId,actorId,{reviewer:actorId,reason}]);
  await client.query("UPDATE wpay_auth.parking_locks SET state='completed',closed_at=CURRENT_TIMESTAMP WHERE id=$1",[lock.id]);await this.transition(client,lock.id,actorId,'completed',reason,evidenceDigest);
  return {id:lock.id,state:'completed',journalId,capacityRestored:true};
 }
 async proof(client,id){
  const row=(await client.query('SELECT * FROM wpay_auth.parking_submissions WHERE parking_id=$1',[uuid(id)])).rows[0];if(!row)fail('FORBIDDEN');
  return {name:row.parking_id+'.'+row.extension,contentType:'application/octet-stream',data:this.crypto.open(row.encrypted_proof,binding('proof',row.parking_id)),scanState:row.scan_state};
 }
}
module.exports={Parking,LEASE_SECONDS,COOLDOWN_SECONDS,binding};
