"use strict";
const {randomUUID,randomInt,createHash}=require('node:crypto');
const {AuthError}=require('../auth/runtime/errors'),{BusinessCore}=require('../business/core');
const ledger=require('../business/ledger'),v=require('../business/validation'),state=require('./state');
const {PaymentEvidence,accountDigest}=require('./evidence'),{verificationQr}=require('./deeplink'),statements=require('./statements');
class Onboarding {
 constructor(options={}){this.core=new BusinessCore();this.evidence=new PaymentEvidence(options);}
 async bank(client,owner,id,version){
  const bank=await this.core.bankRecord(client,v.id(id));
  if(!bank||bank.owner_id!==owner)throw new AuthError('FORBIDDEN');
  await this.core.account(client,owner,'user');
  if(bank.version!==version||bank.approved_version!==version||bank.frozen||bank.deactivated)throw new AuthError('CONFLICT');
  return bank;
 }
 async close(client,challenge,status){
  await client.query('UPDATE wpay_auth.upi_verification_challenges SET status=$2,completed_at=clock_timestamp() WHERE id=$1 AND status=\'waiting\'',[challenge.id,status]);
  await client.query("UPDATE wpay_auth.business_bank_accounts SET status='approved' WHERE id=$1 AND version=$2 AND status='verification_pending'",[challenge.bank_id,challenge.bank_version]);
  challenge.status=status;
 }
 async result(challenge,bank){
  return {id:challenge.id,bankId:challenge.bank_id,version:challenge.bank_version,status:challenge.status,amountMinor:String(challenge.amount_minor),currency:'INR',expiresAt:challenge.expires_at,
   attempts:challenge.attempts,synthetic:challenge.synthetic||this.evidence.allowSynthetic,message:challenge.status==='waiting'?'Waiting for verified payment evidence':challenge.status,
   ...(challenge.status==='waiting'?await verificationQr(challenge,bank):{})};
 }
 async create(client,owner,input){
  v.exactFields(input,['bankId','version','requestId']);v.id(input.requestId);await ledger.lock(client);
  const bank=await this.bank(client,owner,input.bankId,input.version);
  const previous=(await client.query('SELECT * FROM wpay_auth.upi_verification_challenges WHERE owner_id=$1 AND request_id=$2',[owner,input.requestId])).rows[0];
  if(previous){if(previous.bank_id!==bank.id||previous.bank_version!==bank.version)throw new AuthError('CONFLICT');if(previous.status==='waiting'&&+previous.expires_at<=Date.now())await this.close(client,previous,'expired');return this.result(previous,bank);}
  if(!['approved','verification_pending'].includes(bank.status))throw new AuthError('CONFLICT');
  const active=(await client.query("SELECT * FROM wpay_auth.upi_verification_challenges WHERE bank_id=$1 AND status='waiting'",[bank.id])).rows[0];
  if(active){if(+active.expires_at>Date.now())return this.result(active,bank);await this.close(client,active,'expired');}
  if((await client.query("SELECT count(*)::integer n FROM wpay_auth.upi_verification_challenges WHERE owner_id=$1 AND created_at>clock_timestamp()-interval '1 hour'",[owner])).rows[0].n>=20)throw new AuthError('RATE_LIMITED');
  const policy=(await client.query('SELECT * FROM wpay_auth.bank_onboarding_policy')).rows[0];
  const challenge=(await client.query(`INSERT INTO wpay_auth.upi_verification_challenges(id,request_id,owner_id,bank_id,bank_version,expected_upi,account_digest,amount_minor,currency,status,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,'INR','waiting',CURRENT_TIMESTAMP+($9*interval '1 second')) RETURNING *`,[randomUUID(),input.requestId,owner,bank.id,bank.version,bank.details.upiId,accountDigest(bank.details),randomInt(policy.challenge_min_minor,policy.challenge_max_minor+1),policy.challenge_ttl_seconds])).rows[0];
  await client.query("UPDATE wpay_auth.business_bank_accounts SET status='verification_pending' WHERE id=$1",[bank.id]);
  await ledger.audit(client,{actorId:owner,ownerId:owner,entityId:challenge.id,event:'upi_challenge_created',metadata:{bankId:bank.id,version:bank.version}});
  return this.result(challenge,bank);
 }
 async challenge(client,owner,input,cancel=false){
  v.exactFields(input,['challengeId']);v.id(input.challengeId);await ledger.lock(client);
  const challenge=(await client.query('SELECT * FROM wpay_auth.upi_verification_challenges WHERE id=$1 AND owner_id=$2',[input.challengeId,owner])).rows[0];
  if(!challenge)throw new AuthError('FORBIDDEN');
  const bank=await this.bank(client,owner,challenge.bank_id,challenge.bank_version);
  if(challenge.status!=='waiting')return this.result(challenge,bank);
  if(cancel){await this.close(client,challenge,'cancelled');await ledger.audit(client,{actorId:owner,ownerId:owner,entityId:challenge.id,event:'upi_challenge_cancelled'});return this.result(challenge,bank);}
  if(+challenge.expires_at<=Date.now()){await this.close(client,challenge,'expired');return this.result(challenge,bank);}
  if(challenge.attempts>=60||challenge.last_attempt_at&&Date.now()-+challenge.last_attempt_at<3000)return this.result(challenge,bank);
  await client.query('UPDATE wpay_auth.upi_verification_challenges SET attempts=attempts+1,last_attempt_at=clock_timestamp() WHERE id=$1',[challenge.id]);challenge.attempts++;
  let proof;try{proof=await this.evidence.lookup(challenge);}catch{proof=null;}
  if(+challenge.expires_at<=Date.now()){await this.close(client,challenge,'expired');return this.result(challenge,bank);}
  if(proof){
   const used=await client.query('INSERT INTO wpay_auth.upi_consumed_evidence(payment_digest,challenge_id,source,received_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING payment_digest',[proof.digest,challenge.id,proof.source,proof.receivedAt]);
   if(used.rowCount){
    await client.query("UPDATE wpay_auth.upi_verification_challenges SET status='verified',evidence_digest=$2,evidence_source=$3,synthetic=$4,completed_at=clock_timestamp() WHERE id=$1",[challenge.id,proof.digest,proof.source,proof.synthetic]);
    await client.query("UPDATE wpay_auth.business_bank_accounts SET verified_version=$2,status='verified',updated_at=clock_timestamp() WHERE id=$1",[bank.id,bank.version]);
    await ledger.audit(client,{actorId:owner,ownerId:owner,entityId:bank.id,event:'upi_verified',metadata:{version:bank.version,challengeId:challenge.id,evidenceDigest:proof.digest,source:proof.source,synthetic:proof.synthetic}});
    await state.refresh(client,owner);challenge.status='verified';challenge.synthetic=proof.synthetic;
   }
  }
  return this.result(challenge,bank);
 }
 async upload(client,owner,input){
  v.exactFields(input,['bankId','version','requestId','format','base64']);v.id(input.requestId);await ledger.lock(client);
  const bank=await this.bank(client,owner,input.bankId,input.version),bytes=statements.fileInput(input.format,input.base64),digest=createHash('sha256').update(bytes).digest('hex');
  const prior=(await client.query('SELECT * FROM wpay_auth.bank_statement_imports WHERE owner_id=$1 AND request_id=$2',[owner,input.requestId])).rows[0];
  if(prior){if(prior.bank_id!==bank.id||prior.bank_version!==bank.version||prior.file_digest!==digest||prior.format!==input.format)throw new AuthError('CONFLICT');return this.importResult(prior);}
  if((await client.query("SELECT count(*)::integer n FROM wpay_auth.bank_statement_imports WHERE owner_id=$1 AND created_at>clock_timestamp()-interval '1 hour'",[owner])).rows[0].n>=20)throw new AuthError('RATE_LIMITED');
  const parsed=await statements.parseStatement(bytes,input.format),accepted=parsed.ok&&parsed.credits>0;
  const row=(await client.query(`INSERT INTO wpay_auth.bank_statement_imports(id,request_id,owner_id,bank_id,bank_version,file_digest,format,bytes,status,reason,rows_scanned,credit_count,parser_digest,result_digest)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,[randomUUID(),input.requestId,owner,bank.id,bank.version,digest,input.format,bytes.length,accepted?'accepted':'rejected',accepted?'Parser accepted; onboarding only, not financial evidence':'No supported credit rows could be validated',parsed.rows||0,parsed.credits||0,statements.parserDigest,accepted?parsed.resultDigest:null])).rows[0];
  await state.refresh(client,owner);
  await ledger.audit(client,{actorId:owner,ownerId:owner,entityId:row.id,event:'bank_statement_'+row.status,metadata:{bankId:bank.id,version:bank.version,fileDigest:digest,parserDigest:statements.parserDigest,financialEvidence:false}});
  return this.importResult(row);
 }
 importResult(row){return {id:row.id,bankId:row.bank_id,version:row.bank_version,status:row.status,reason:row.reason,rowsScanned:row.rows_scanned,creditCount:row.credit_count,format:row.format,createdAt:row.created_at,fileDigest:row.file_digest,parserDigest:row.parser_digest,financialEvidence:false};}
 async import(client,owner,input){v.exactFields(input,['importId']);const row=(await client.query('SELECT * FROM wpay_auth.bank_statement_imports WHERE id=$1 AND owner_id=$2',[v.id(input.importId),owner])).rows[0];if(!row)throw new AuthError('FORBIDDEN');return this.importResult(row);}
 async analytics(client,owner){
  const rows=(await client.query(`SELECT b.id,b.version,b.status,v.details->>'upiId' AS upi_id,
   count(r.id)::integer AS total,count(r.id) FILTER(WHERE f.reservation_id IS NOT NULL)::integer AS successful,
   count(r.id) FILTER(WHERE f.reservation_id IS NULL AND o.reservation_id IS NOT NULL)::integer AS failed,
   count(r.id) FILTER(WHERE f.reservation_id IS NULL AND o.reservation_id IS NULL AND r.state='active' AND r.expires_at>clock_timestamp())::integer AS pending,
   count(r.id) FILTER(WHERE f.reservation_id IS NULL AND o.reservation_id IS NULL AND (r.state='expired' OR r.state='active' AND r.expires_at<=clock_timestamp()))::integer AS expired,
   count(r.id) FILTER(WHERE f.reservation_id IS NULL AND o.reservation_id IS NULL AND r.state IN('cancelled','released'))::integer AS cancelled,
   COALESCE(sum(f.amount_minor),0)::text AS successful_volume_minor
   FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version
   LEFT JOIN wpay_auth.business_reservations r ON r.bank_id=b.id AND r.user_id=b.owner_id
   LEFT JOIN wpay_auth.business_financial_events f ON f.reservation_id=r.id LEFT JOIN wpay_auth.upi_order_outcomes o ON o.reservation_id=r.id
   WHERE b.owner_id=$1 GROUP BY b.id,v.details ORDER BY b.created_at,b.id`,[owner])).rows;
  return {currency:'INR',denominator:'successful + failed; pending, expired and cancelled/released excluded',banks:rows.map(r=>({...r,eligibleCompleted:r.successful+r.failed,successRate:r.successful+r.failed?Math.round(r.successful*10000/(r.successful+r.failed))/100:null})),livePaymentsConnected:false};
 }
}
module.exports={Onboarding};
