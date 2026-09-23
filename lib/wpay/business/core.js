"use strict";
const {randomUUID,createHash}=require('node:crypto');
const {AuthError}=require('../auth/runtime/errors');
const ledger=require('./ledger'),money=require('./money'),v=require('./validation'),routing=require('./routing');
const onboarding=require('../onboarding/state');
const fail=()=>{throw new AuthError('CONFLICT');};
class BusinessCore {
 constructor({verifyEvidence=null}={}){this.verifyEvidence=verifyEvidence;}
 async evidence(kind,input){if(typeof this.verifyEvidence!=='function')throw new AuthError('UNAVAILABLE');const proof=await this.verifyEvidence(kind,input);if(!proof||proof.verified!==true||proof.kind!==kind||typeof proof.evidenceId!=='string')throw new AuthError('FORBIDDEN');return proof;}
 async account(client,id,type){const row=(await client.query('SELECT a.*,e.approval_status,e.initial_deposit_satisfied,e.operations_enabled FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.id=$1',[v.id(id)])).rows[0];if(!row||row.account_type!==type||row.status!=='active'||row.approval_status!=='approved')throw new AuthError('FORBIDDEN');return row;}
 async terms(client,userId,merchantId){
  const rows=(await client.query('SELECT DISTINCT ON(account_id) id,account_id,version,settings,effective_at FROM wpay_auth.commercial_versions WHERE account_id=ANY($1::uuid[]) AND effective_at<=CURRENT_TIMESTAMP ORDER BY account_id,version DESC',[[userId,merchantId]])).rows;
  const user=rows.find(r=>r.account_id===userId),merchant=rows.find(r=>r.account_id===merchantId);if(!user||!merchant)throw new AuthError('UNAVAILABLE');
  return {user:{id:user.id,version:user.version,effectiveAt:user.effective_at,settings:user.settings},merchant:{id:merchant.id,version:merchant.version,effectiveAt:merchant.effective_at,settings:merchant.settings},rounding:'floor-to-minor-unit',currency:'INR'};
 }
 async bankRecord(client,id){return (await client.query('SELECT b.*,v.details,v.limit_minor::text FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version WHERE b.id=$1',[v.id(id)])).rows[0];}
 async saveBank(client,ownerId,{bankId=null,version=null,details},actorId=ownerId){
  await ledger.lock(client);await this.account(client,ownerId,'user');const fields=v.bank(details);let row;
  if(bankId){row=await this.bankRecord(client,bankId);if(!row||row.owner_id!==ownerId)throw new AuthError('FORBIDDEN');if(row.deactivated||row.version!==version)fail();}
  else if(actorId===ownerId&&(await client.query('SELECT count(*)::integer AS n FROM wpay_auth.business_bank_accounts WHERE owner_id=$1 AND NOT deactivated',[ownerId])).rows[0].n>=20)throw new AuthError('RATE_LIMITED');
  const id=bankId||randomUUID(),next=row?row.version+1:1,status=row&&row.status!=='draft'?'submitted':'draft';
  if(row)await client.query('UPDATE wpay_auth.business_bank_accounts SET version=$2,status=$3,approved_version=NULL,verified_version=NULL,reason=$4,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[id,next,status,'Bank identity changed; review required']);
  else await client.query("INSERT INTO wpay_auth.business_bank_accounts(id,owner_id,version,status) VALUES($1,$2,1,'draft')",[id,ownerId]);
  await client.query('INSERT INTO wpay_auth.business_bank_versions(bank_id,version,details,limit_minor,actor_id) VALUES($1,$2,$3,$4,$5)',[id,next,fields,fields.bankLimitMinor,actorId]);
  await client.query('INSERT INTO wpay_auth.business_bank_identities(bank_id,version,account_key) VALUES($1,$2,$3)',[id,next,createHash('sha256').update(fields.ifsc+':'+fields.accountNumber).digest('hex')]);
  await onboarding.invalidate(client,id);await onboarding.refresh(client,ownerId);
  await ledger.audit(client,{actorId,ownerId,entityId:id,event:'bank_version_saved',metadata:{version:next,status,reviewRequired:!!row}});return {id,version:next,status};
 }
 async transitionBank(client,bankId,version,action,actorId,{ownerId=null,reason=''}={}){
  await ledger.lock(client);const bank=await this.bankRecord(client,bankId);if(!bank||ownerId&&bank.owner_id!==ownerId)throw new AuthError('FORBIDDEN');if(bank.version!==version||bank.deactivated)fail();
  let state,approved=bank.approved_version,verified=bank.verified_version,frozen=bank.frozen,deactivated=false;
  switch(action){
   case 'submit':if(!['draft','rejected'].includes(bank.status))fail();state='submitted';break;
   case 'review':if(bank.status!=='submitted')fail();state='review';break;
   case 'approve':if(!['submitted','review'].includes(bank.status)||frozen)fail();state='approved';approved=version;break;
   case 'reject':if(!['submitted','review','approved','verification_pending'].includes(bank.status))fail();state='rejected';approved=verified=null;break;
   case 'request_verification':if(bank.status!=='approved'||approved!==version||frozen)fail();state='verification_pending';break;
   case 'enable':if(!['verified','stopped'].includes(bank.status)||approved!==version||verified!==version||frozen)fail();state='enabled';break;
   case 'run':if(!['enabled','stopped'].includes(bank.status)||frozen||approved!==version||verified!==version)fail();await onboarding.canStart(client,bank);state='running';break;
   case 'stop':if(!['enabled','running'].includes(bank.status))fail();state='stopped';break;
   case 'freeze':state='frozen';frozen=true;break;
   case 'release_freeze':if(!frozen)fail();state='submitted';frozen=false;approved=verified=null;break;
   case 'deactivate':state='stopped';deactivated=true;break;
   default:throw new AuthError('INVALID_INPUT');
  }
  await client.query('UPDATE wpay_auth.business_bank_accounts SET status=$2,approved_version=$3,verified_version=$4,frozen=$5,deactivated=$6,reason=$7,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[bankId,state,approved,verified,frozen,deactivated,reason]);
  if(['reject','freeze','deactivate','release_freeze'].includes(action))await onboarding.invalidate(client,bankId);
  await onboarding.refresh(client,bank.owner_id);
  await ledger.audit(client,{actorId,ownerId:bank.owner_id,entityId:bankId,event:'bank_'+action,reason,metadata:{from:bank.status,to:state,version}});return {id:bankId,status:state,version};
 }
 async verifyBank(client,bankId,version,evidenceReference){
  const proof=await this.evidence('bank_verification',{bankId,version,evidenceReference});await ledger.lock(client);
  const bank=await this.bankRecord(client,bankId);if(!bank||bank.version!==version||bank.approved_version!==version||bank.status!=='verification_pending'||bank.frozen||bank.deactivated||proof.bankId!==bankId||proof.version!==version)fail();
  await client.query("UPDATE wpay_auth.business_bank_accounts SET verified_version=$2,status='verified',updated_at=CURRENT_TIMESTAMP WHERE id=$1",[bankId,version]);
  await ledger.audit(client,{ownerId:bank.owner_id,entityId:bankId,event:'bank_verified',metadata:{version,evidenceDigest:ledger.digest(proof.evidenceId)}});return {id:bankId,status:'verified'};
 }
 async assignment(client,actorId,input){
  await ledger.lock(client);v.exactFields(input,['id','merchantId','userId','priority','weight','minMinor','maxMinor','enabled']);
  await this.account(client,input.merchantId,'merchant');await this.account(client,input.userId,'user');
  if(!Number.isInteger(input.priority)||input.priority<0||input.priority>100000||!Number.isInteger(input.weight)||input.weight<1||input.weight>10000||typeof input.enabled!=='boolean'||money.minor(input.minMinor)>money.minor(input.maxMinor))throw new AuthError('INVALID_INPUT');
  let prior;if(input.id){prior=(await client.query('SELECT * FROM wpay_auth.business_assignments WHERE id=$1',[v.id(input.id)])).rows[0];if(!prior||prior.merchant_id!==input.merchantId||prior.user_id!==input.userId)throw new AuthError('FORBIDDEN');if(prior.status==='disabled'&&input.enabled)fail();}
  if(!prior&&input.enabled&&(await client.query("SELECT 1 FROM wpay_auth.business_assignments WHERE merchant_id=$1 AND user_id=$2 AND bank_id IS NOT NULL AND status='active'",[input.merchantId,input.userId])).rowCount)fail();
  const id=input.id||randomUUID(),status=input.enabled?'active':'disabled';
  if(prior)await client.query("UPDATE wpay_auth.business_assignments SET status=$2,priority=$3,weight=$4,min_minor=$5,max_minor=$6,disabled_at=CASE WHEN $2='disabled' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=$1",[id,status,input.priority,input.weight,input.minMinor,input.maxMinor]);
  else await client.query("INSERT INTO wpay_auth.business_assignments(id,merchant_id,user_id,status,priority,weight,min_minor,max_minor,created_by,disabled_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $4='disabled' THEN CURRENT_TIMESTAMP ELSE NULL END)",[id,input.merchantId,input.userId,status,input.priority,input.weight,input.minMinor,input.maxMinor,actorId]);
  await ledger.audit(client,{actorId,ownerId:input.userId,entityId:id,event:'assignment_'+status,metadata:{merchantId:input.merchantId,priority:input.priority,weight:input.weight,minMinor:input.minMinor,maxMinor:input.maxMinor}});return {id,status};
 }
 async candidates(client,merchantId){
  const rows=(await client.query(`SELECT x.id AS assignment_id,x.user_id,x.priority,x.min_minor::text,x.max_minor::text,x.status AS assignment_status,x.effective_from,
   a.status,e.approval_status,e.operations_enabled,e.initial_deposit_satisfied,
   (NOT (SELECT statement_required FROM wpay_auth.bank_onboarding_policy) OR EXISTS(SELECT 1 FROM wpay_auth.bank_statement_imports s WHERE s.owner_id=a.id AND s.bank_id=b.id AND s.bank_version=b.version AND s.status='accepted')) AS statement_satisfied,z.enabled,
   (z.enabled AND z.factor_version>0 AND z.encrypted_secret IS NOT NULL) AS security_ready,
   COALESCE(req.device_required,false) AS device_required,COALESCE(req.device_eligible,false) AS device_eligible,
   EXISTS(SELECT 1 FROM wpay_auth.admin_bank_approvals ap WHERE ap.bank_id=b.id AND ap.bank_version=b.version) AS admin_approved,
   b.id AS bank_id,b.version,b.status AS bank_status,b.frozen,b.deactivated,b.approved_version,b.verified_version,v.limit_minor::text,
   CURRENT_TIMESTAMP AS database_now FROM wpay_auth.business_assignments x JOIN wpay_auth.accounts a ON a.id=x.user_id
   JOIN wpay_auth.eligibility e ON e.account_id=a.id JOIN wpay_auth.account_security z ON z.account_id=a.id
   LEFT JOIN wpay_auth.business_routing_requirements req ON req.owner_id=a.id
   LEFT JOIN wpay_auth.business_bank_accounts b ON b.owner_id=a.id AND (x.bank_id IS NULL OR x.bank_id=b.id)
   LEFT JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version WHERE x.merchant_id=$1 ORDER BY x.id,b.id`,[merchantId])).rows;
  const summaries=new Map(),result=[];
  for(const row of rows){if(!summaries.has(row.user_id))summaries.set(row.user_id,await ledger.summary(client,row.user_id));const summary=summaries.get(row.user_id);
   const volume=row.bank_id?await require('./bank-volume').volume(client,row.bank_id,row.version):{used:'0',shared_limit:'0'};
   const remaining=BigInt(volume.shared_limit||row.limit_minor||'0')-BigInt(volume.used);
   result.push({routeId:row.bank_id||row.assignment_id,userId:row.user_id,assignmentId:row.assignment_id,bankId:row.bank_id,bankVersion:row.version,
    priority:row.priority,minMinor:row.min_minor,maxMinor:row.max_minor,userStatus:row.status,approval:row.approval_status,mfaEnabled:row.enabled,securityReady:row.security_ready,deviceRequired:row.device_required,deviceEligible:row.device_eligible,
    operationsEnabled:row.operations_enabled&&row.statement_satisfied,funded:row.initial_deposit_satisfied&&BigInt(summary.allocated)>0n,
    assignmentActive:row.assignment_status==='active',effectiveFrom:row.effective_from,bankStatus:row.bank_status,bankApproved:!!row.bank_id&&row.approved_version===row.version,
    bankAdminApproved:row.admin_approved===true,bankVerified:!!row.bank_id&&row.verified_version===row.version,bankFrozen:row.frozen,bankDeactivated:row.deactivated,bankRemainingMinor:(remaining>0n?remaining:0n).toString(),
    availableMinor:BigInt(summary.available)>0n?summary.available:'0',databaseNow:+row.database_now,summary});
  }
  return result;
 }
 async reservationEvent(client,reservation,state,actorId,reason){await client.query('INSERT INTO wpay_auth.business_reservation_events(id,reservation_id,state,actor_id,reason) VALUES($1,$2,$3,$4,$5)',[randomUUID(),reservation.id,state,actorId,reason]);}
 async release(client,reservationId,actorId,state='released'){
  await ledger.lock(client);const row=(await client.query('SELECT * FROM wpay_auth.business_reservations WHERE id=$1',[v.id(reservationId)])).rows[0];if(!row)throw new AuthError('FORBIDDEN');
  if(['released','expired','cancelled'].includes(row.state))return {id:row.id,state:row.state};if(row.state!=='active')fail();
  if(!['released','expired','cancelled'].includes(state))throw new AuthError('INVALID_INPUT');
  if(state==='expired'&&+row.expires_at>+(await client.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now)fail();
  await client.query('UPDATE wpay_auth.business_reservations SET state=$2 WHERE id=$1',[row.id,state]);
  await ledger.post(client,{key:'reservation-release:'+row.id,referenceType:'reservation',referenceId:row.id,actorId,metadata:{state},snapshot:row.snapshot,entries:ledger.pair(row.user_id,'capacity_reserved',row.amount_minor,'INR','debit')});
  await this.reservationEvent(client,row,state,actorId,state);return {id:row.id,state};
 }
 async expire(client){await ledger.lock(client);for(const row of (await client.query("SELECT id FROM wpay_auth.business_reservations WHERE state='active' AND expires_at<=CURRENT_TIMESTAMP ORDER BY id LIMIT 200")).rows)await this.release(client,row.id,null,'expired');}
 async reserve(client,merchantId,{orderReference,idempotencyKey,amountMinor,ttlSeconds=300},actorId=merchantId){
  v.reference(orderReference);v.reference(idempotencyKey);money.minor(amountMinor);if(!Number.isInteger(ttlSeconds)||ttlSeconds<30||ttlSeconds>900)throw new AuthError('INVALID_INPUT');
  await ledger.lock(client);await this.account(client,merchantId,'merchant');
  const fingerprint=ledger.digest({orderReference,amountMinor,ttlSeconds});
  const prior=(await client.query('SELECT * FROM wpay_auth.business_reservations WHERE merchant_id=$1 AND (idempotency_key=$2 OR order_reference=$3)',[merchantId,idempotencyKey,orderReference])).rows;
  if(prior.length){if(prior.length!==1||prior[0].idempotency_key!==idempotencyKey||prior[0].payload_digest!==fingerprint)fail();return this.publicReservation(prior[0]);}
  await this.expire(client);const candidates=await this.candidates(client,merchantId),route=routing.select(candidates,amountMinor,candidates[0]?.databaseNow);
  if(!route)throw new AuthError('NO_ROUTE');const snapshot=await this.terms(client,route.userId,merchantId),id=randomUUID();
  snapshot.route={assignmentId:route.assignmentId,bankId:route.bankId,bankVersion:route.bankVersion,priority:route.priority};
  const row=(await client.query(`INSERT INTO wpay_auth.business_reservations(id,merchant_id,user_id,bank_id,bank_version,assignment_id,order_reference,idempotency_key,payload_digest,amount_minor,currency,state,snapshot,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'INR','active',$11,CURRENT_TIMESTAMP+($12*interval '1 second')) RETURNING *`,[id,merchantId,route.userId,route.bankId,route.bankVersion,route.assignmentId,orderReference,idempotencyKey,fingerprint,amountMinor,snapshot,ttlSeconds])).rows[0];
  await ledger.post(client,{key:'reservation:'+id,referenceType:'reservation',referenceId:id,actorId,snapshot,entries:ledger.pair(route.userId,'capacity_reserved',amountMinor)});
  await this.reservationEvent(client,row,'pending',actorId,'Eligibility evaluation');await this.reservationEvent(client,row,'active',actorId,'Capacity reserved; no payment created');return this.publicReservation(row);
 }
 publicReservation(row){return {id:row.id,orderReference:row.order_reference,amountMinor:row.amount_minor,currency:row.currency,state:row.state,expiresAt:row.expires_at,paymentCreated:false};}
 async allocateConfirmed(client,input){
  v.exactFields(input,['ownerId','amountMinor','reference','kind']);v.id(input.ownerId);money.minor(input.amountMinor);v.reference(input.reference);
  if(!['collateral','payout_return','parking_return'].includes(input.kind))throw new AuthError('INVALID_INPUT');
  const proof=await this.evidence('capacity_credit',input);if(proof.ownerId!==input.ownerId||proof.amountMinor!==input.amountMinor||proof.reference!==input.reference||proof.creditKind!==input.kind)throw new AuthError('FORBIDDEN');
  if(input.kind==='collateral'?proof.status!=='confirmed':proof.status!=='completed'||proof.approved!==true)throw new AuthError('FORBIDDEN');
  await ledger.lock(client);await this.account(client,input.ownerId,'user');
  const terms=(await client.query('SELECT id,version,settings FROM wpay_auth.commercial_versions WHERE account_id=$1 AND effective_at<=CURRENT_TIMESTAMP ORDER BY version DESC LIMIT 1',[input.ownerId])).rows[0];if(!terms)throw new AuthError('UNAVAILABLE');
  const prior=(await client.query('SELECT id,payload_digest,metadata FROM wpay_auth.business_journals WHERE idempotency_key=$1',['capacity-credit:'+proof.evidenceId])).rows[0];
  if(prior){if(prior.metadata.binding!==ledger.digest(input))fail();return {journalId:prior.id};}
  const journalId=await ledger.post(client,{key:'capacity-credit:'+proof.evidenceId,referenceType:input.kind,referenceId:input.reference,source:'verified-business-evidence',snapshot:{user:terms},metadata:{binding:ledger.digest(input),evidenceDigest:ledger.digest(proof.evidenceId)},entries:ledger.pair(input.ownerId,'capacity_allocated',input.amountMinor)});
  if(input.kind==='collateral')await client.query('UPDATE wpay_auth.eligibility SET initial_deposit_satisfied=true WHERE account_id=$1',[input.ownerId]);
  return {journalId};
 }
 async confirmedPayin(client,input){
  v.exactFields(input,['reservationId','evidenceReference']);v.id(input.reservationId);v.reference(input.evidenceReference);
  const proof=await this.evidence('payin',input);if(!['normal','statement_recovered'].includes(proof.source)||! /^[0-9]{12}$/.test(proof.utr)||!proof.economicId)throw new AuthError('FORBIDDEN');
  await ledger.lock(client);const r=(await client.query('SELECT * FROM wpay_auth.business_reservations WHERE id=$1',[input.reservationId])).rows[0];
  if(!r||proof.reservationId!==r.id||proof.bankId!==r.bank_id||proof.bankVersion!==r.bank_version||proof.merchantId!==r.merchant_id||proof.userId!==r.user_id||proof.amountMinor!==r.amount_minor||proof.currency!=='INR')throw new AuthError('FORBIDDEN');
  const utrDigest=createHash('sha256').update(proof.utr).digest('hex');const prior=(await client.query('SELECT * FROM wpay_auth.business_financial_events WHERE economic_id=$1 OR (bank_id=$2 AND utr_digest=$3) OR reservation_id=$4',[proof.economicId,r.bank_id,utrDigest,r.id])).rows;
  if(prior.length){if(prior.length!==1||prior[0].reservation_id!==r.id||prior[0].amount_minor!==r.amount_minor||prior[0].bank_id!==r.bank_id||prior[0].utr_digest!==utrDigest)fail();return {journalId:prior[0].journal_id,source:prior[0].source,alreadyAccounted:true};}
  const now=+(await client.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now;
  if(r.state==='active'&&+r.expires_at<=now){await this.release(client,r.id,null,'expired');r.state='expired';}
  if(r.state!=='active'){
   if(!['expired','released','cancelled'].includes(r.state))fail();
  }
  const fee=money.fee(r.amount_minor,r.snapshot.merchant.settings.payinFee),commission=proof.source==='statement_recovered'?'0':money.fee(r.amount_minor,r.snapshot.user.settings.payinCommission);
  const entries=[...ledger.pair(r.user_id,'capacity_consumed',r.amount_minor),...ledger.pair(r.merchant_id,'merchant_gross',r.amount_minor)];
  if(r.state==='active')entries.push(...ledger.pair(r.user_id,'capacity_reserved',r.amount_minor,'INR','debit'));
  if(fee!=='0')entries.push(...ledger.pair(r.merchant_id,'merchant_platform_fee',fee));if(commission!=='0')entries.push(...ledger.pair(r.user_id,'user_commission',commission));
  const journalId=await ledger.post(client,{key:'payin:'+proof.economicId,referenceType:'payin',referenceId:r.order_reference,source:'verified-business-evidence',snapshot:r.snapshot,metadata:{source:proof.source,evidenceDigest:ledger.digest(proof.evidenceId),utrDigest,commissionMinor:commission,feeMinor:fee},entries});
  await client.query('INSERT INTO wpay_auth.business_financial_events(economic_id,bank_id,utr_digest,reservation_id,journal_id,source,amount_minor) VALUES($1,$2,$3,$4,$5,$6,$7)',[proof.economicId,r.bank_id,utrDigest,r.id,journalId,proof.source,r.amount_minor]);
  await client.query("UPDATE wpay_auth.business_reservations SET state='consumed' WHERE id=$1",[r.id]);await this.reservationEvent(client,r,'consumed',null,proof.source);
  const after=await ledger.summary(client,r.user_id);
  if(r.state!=='active'||BigInt(after.deficit)>0n)await client.query('INSERT INTO wpay_auth.business_reconciliation(id,owner_id,journal_id,reference,reason,signed_remaining,deficit_minor) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),r.user_id,journalId,r.order_reference,'Verified late receipt after '+r.state+'; source '+proof.source,after.signedAvailable,after.deficit]);
  return {journalId,source:proof.source,commissionMinor:commission,feeMinor:fee,alreadyAccounted:false,capacity:after};
 }
 async hold(client,actorId,input){
  const allowed=['id','ownerId','amountMinor','reference','reason','release','category'];
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).some(k=>!allowed.includes(k))||['id','ownerId','amountMinor','reference','reason','release'].some(k=>!Object.hasOwn(input,k)))throw new AuthError('INVALID_INPUT');
  const {id,ownerId,amountMinor,reference,reason,release}=input,category=input.category??'hold';if(!['hold','frozen'].includes(category))throw new AuthError('INVALID_INPUT');
  await ledger.lock(client);v.id(id);v.id(ownerId);v.reason(reason);v.reference(reference);money.minor(amountMinor);
  const owner=(await client.query('SELECT account_type FROM wpay_auth.accounts WHERE id=$1',[ownerId])).rows[0];if(!owner||!['user','merchant'].includes(owner.account_type))throw new AuthError('FORBIDDEN');
  const domain=owner.account_type==='user'?'capacity':'merchant',type=domain==='capacity'?'capacity_hold':'merchant_hold';
  const prior=(await client.query('SELECT * FROM wpay_auth.business_holds WHERE id=$1',[id])).rows[0];
  if(prior&&(prior.owner_id!==ownerId||prior.amount_minor!==amountMinor||prior.reference!==reference||(input.category!==undefined&&prior.category!==category)))fail();
  if(release){if(!prior)fail();if(prior.state==='released')return {id,state:'released'};await client.query("UPDATE wpay_auth.business_holds SET state='released',released_at=CURRENT_TIMESTAMP WHERE id=$1",[id]);}
  else {if(prior){if(prior.reason!==reason)fail();return {id,state:prior.state};}const b=await ledger.summary(client,ownerId);if(BigInt(domain==='capacity'?b.available:b.merchantAvailable)<money.minor(amountMinor))throw new AuthError('INSUFFICIENT_CAPACITY');
   await client.query("INSERT INTO wpay_auth.business_holds(id,owner_id,domain,amount_minor,currency,state,reason,reference,actor_id,category) VALUES($1,$2,$3,$4,'INR','active',$5,$6,$7,$8)",[id,ownerId,domain,amountMinor,reason,reference,actorId,category]);}
  await ledger.post(client,{key:(release?'hold-release:':'hold:')+id,referenceType:'hold',referenceId:reference,actorId,metadata:{reason,category},entries:ledger.pair(ownerId,type,amountMinor,'INR',release?'debit':'credit')});
  await ledger.audit(client,{actorId,ownerId,entityId:id,event:release?'hold_released':'hold_created',reason,metadata:{category}});return {id,state:release?'released':'active',category};
 }
 async adjustment(client,actorId,input){
  const {ownerId,amountMinor,direction,idempotencyKey,reference,reason}=input;
  v.exactFields(input,['ownerId','amountMinor','direction','idempotencyKey','reference','reason']);v.id(ownerId);money.minor(amountMinor);v.reference(idempotencyKey);v.reference(reference);v.reason(reason);
  if(!['credit','debit'].includes(direction))throw new AuthError('INVALID_INPUT');await ledger.lock(client);
  const owner=(await client.query('SELECT account_type FROM wpay_auth.accounts WHERE id=$1',[ownerId])).rows[0];if(!owner||!['user','merchant'].includes(owner.account_type))throw new AuthError('FORBIDDEN');
  const prior=(await client.query('SELECT id,metadata FROM wpay_auth.business_journals WHERE idempotency_key=$1',['adjustment:'+actorId+':'+idempotencyKey])).rows[0];
  if(prior){if(prior.metadata.binding!==ledger.digest(input))fail();return {journalId:prior.id};}
  const b=await ledger.summary(client,ownerId);if(direction==='debit'&&BigInt(owner.account_type==='user'?b.available:b.merchantAvailable)<money.minor(amountMinor))throw new AuthError('INSUFFICIENT_CAPACITY');
  const journalId=await ledger.post(client,{key:'adjustment:'+actorId+':'+idempotencyKey,referenceType:'administrative_adjustment',referenceId:reference,actorId,metadata:{reason,binding:ledger.digest(input)},entries:ledger.pair(ownerId,owner.account_type==='user'?'capacity_allocated':'merchant_adjustment',amountMinor,'INR',direction)});
  await ledger.audit(client,{actorId,ownerId,entityId:journalId,event:'administrative_adjustment',reason});return {journalId};
 }
}
module.exports={BusinessCore};
