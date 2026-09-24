"use strict";
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {AuthError}=require('../auth/runtime/errors'),{BusinessCore}=require('../business/core'),ledger=require('../business/ledger'),v=require('../business/validation'),input=require('./validation');
const {transaction}=require('../db/migrations'),webhooks=require('./webhooks');
const hash=value=>createHash('sha256').update(value).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const fail=code=>{throw new AuthError(code);};
const binding=(kind,id)=>`wpay-gateway-${kind}:${id}`;
class Gateway {
 constructor({pool,crypto,verifier=null,allowSynthetic=false,testCallback=null}={}){
  this.pool=pool;this.crypto=crypto;this.verifier=verifier;this.allowSynthetic=allowSynthetic;this.testCallback=allowSynthetic?testCallback:null;this.core=new BusinessCore();
 }
 async merchant(client,id){
  const row=(await client.query(`SELECT a.*,e.approval_status,z.enabled,z.security_version,z.factor_version,z.encrypted_secret,g.permissions,g.permission_version AS grant_version FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id JOIN wpay_auth.account_security z ON z.account_id=a.id JOIN wpay_auth.grants g ON g.account_id=a.id WHERE a.id=$1 FOR UPDATE OF a,e,z,g`,[id])).rows[0];
  if(!row||row.account_type!=='merchant'||row.status!=='active'||row.approval_status!=='approved'||(row.enabled&&row.factor_version<1)||row.permission_version!==row.grant_version)fail('FORBIDDEN');
  if(row.enabled)this.crypto.open(row.encrypted_secret,`wpay-factor:${row.id}:${row.factor_version}`);
  if(!(await client.query('SELECT 1 FROM wpay_auth.commercial_versions WHERE account_id=$1 AND effective_at<=CURRENT_TIMESTAMP',[id])).rowCount)fail('UNAVAILABLE');return row;
 }
 project(row,origin){return {id:row.id,reference:row.reference,amountMinor:row.amount_minor,currency:row.currency,description:row.description,status:row.state,evidenceStatus:row.evidence_state,origin:row.origin,createdAt:row.created_at,expiresAt:row.expires_at,paidAt:row.paid_at,callbackStatus:row.callback_status??'none',paymentUrl:origin?origin+'/wpay-pay/'+this.crypto.open(row.encrypted_token,binding('link',row.id)):undefined};}
 async create(client,merchantId,body,origin='manual',base){
  const value=input.order(body);await this.merchant(client,merchantId);await this.expire(client);
  const digest=hash(JSON.stringify(value)),prior=(await client.query('SELECT * FROM wpay_auth.gateway_orders WHERE merchant_id=$1 AND (reference=$2 OR idempotency_key=$3)',[merchantId,value.reference,value.idempotencyKey])).rows;
  if(prior.length){if(prior.length!==1||prior[0].payload_digest!==digest)fail('CONFLICT');return this.project(prior[0],base);}
  const commercial=(await client.query('SELECT version,settings FROM wpay_auth.commercial_versions WHERE account_id=$1 AND effective_at<=CURRENT_TIMESTAMP ORDER BY version DESC LIMIT 1',[merchantId])).rows[0];
  const ttlSeconds=Number(commercial?.settings?.paymentLinkTtlSeconds??300);
  if(!Number.isInteger(ttlSeconds)||ttlSeconds<30||ttlSeconds>900)fail('UNAVAILABLE');
  const id=randomUUID(),reserved=await this.core.reserve(client,merchantId,{orderReference:'gw:'+id,idempotencyKey:'gw:'+id,amountMinor:value.amountMinor,ttlSeconds});
  const endpoint=(await client.query('SELECT id FROM wpay_auth.gateway_endpoints WHERE merchant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[merchantId])).rows[0];
  const secret=token(),row=(await client.query(`INSERT INTO wpay_auth.gateway_orders(id,merchant_id,reservation_id,reference,idempotency_key,payload_digest,amount_minor,currency,description,metadata,origin,token_digest,encrypted_token,endpoint_id,state,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,'INR',$8,$9,$10,$11,$12,$13,'pending_payment',$14) RETURNING *`,[id,merchantId,reserved.id,value.reference,value.idempotencyKey,digest,value.amountMinor,value.description,value.metadata,origin,hash(secret),this.crypto.seal(secret,binding('link',id)),endpoint?.id||null,reserved.expiresAt])).rows[0];
  await ledger.audit(client,{actorId:merchantId,ownerId:merchantId,entityId:id,event:'gateway_order_created',metadata:{origin}});return this.project(row,base);
 }
 async get(client,merchantId,id,base){const row=(await client.query(`SELECT o.*,(SELECT state FROM wpay_auth.gateway_outbox WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) AS callback_status FROM wpay_auth.gateway_orders o WHERE o.id=$1 AND o.merchant_id=$2`,[v.id(id),merchantId])).rows[0];if(!row)fail('FORBIDDEN');return this.project(row,base);}
 async list(client,merchantId,body={},tenants=null){
  input.fields(body,['search','status','offset']);const search=input.text(body.search??'',80),status=body.status??'',offset=body.offset??0;
  if(!Number.isInteger(offset)||offset<0||offset>100000||!['','pending_payment','verification_pending','successful','failed','expired','cancelled','recovery_review'].includes(status))fail('INVALID_INPUT');
  const rows=(await client.query(`SELECT o.*,(SELECT state FROM wpay_auth.gateway_outbox WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) AS callback_status FROM wpay_auth.gateway_orders o JOIN wpay_auth.accounts a ON a.id=o.merchant_id WHERE ($1::uuid IS NULL OR o.merchant_id=$1) AND ($2::text[] IS NULL OR a.tenant_id=ANY($2)) AND ($3='' OR position(lower($3) in lower(o.reference||' '||o.id::text))>0) AND ($4='' OR o.state=$4) ORDER BY o.created_at DESC,o.id LIMIT 51 OFFSET $5`,[merchantId,tenants,search,status,offset])).rows;
  return {orders:rows.slice(0,50).map(r=>this.project(r)),hasMore:rows.length>50,offset};
 }
 async summary(client,id){
  const rows=(await client.query('SELECT state,count(*)::integer AS count,COALESCE(sum(amount_minor),0)::text AS volume FROM wpay_auth.gateway_orders WHERE merchant_id=$1 GROUP BY state',[id])).rows;
  const counts=Object.fromEntries(rows.map(r=>[r.state,r.count])),success=counts.successful||0,failed=counts.failed||0;
  const balance=await ledger.summary(client,id),terms=(await client.query('SELECT version,settings FROM wpay_auth.commercial_versions WHERE account_id=$1 AND effective_at<=CURRENT_TIMESTAMP ORDER BY version DESC LIMIT 1',[id])).rows[0],ttl=Number(terms?.settings?.paymentLinkTtlSeconds??300);
  return {counts,total:rows.reduce((s,r)=>s+r.count,0),successRate:success+failed?success/(success+failed):null,successfulVolumeMinor:rows.find(r=>r.state==='successful')?.volume||'0',currency:'INR',gross:balance.gross,fees:balance.fees,held:balance.merchantHeld,available:balance.merchantAvailable,linkTtlSeconds:Number.isInteger(ttl)?ttl:300,commercialVersion:terms?.version??null,verificationConnected:typeof this.verifier==='function',synthetic:this.allowSynthetic};
 }
 async emit(client,row,type,resource='order',eventKey=row.id){
  if(!['order','payout'].includes(resource))fail('INVALID_INPUT');
  const id=randomUUID(),payout=resource==='payout',body=JSON.stringify({eventId:id,eventType:type,version:1,...(row.evidence_state==='admin_approved'?{approvalMethod:'admin_manual',bankVerified:false}:{}),...(payout?{payoutId:row.id}:{orderId:row.id}),merchantReference:row.reference,amountMinor:row.amount_minor,currency:'INR',status:row.state,createdAt:row.created_at,...(payout?{completedAt:row.completed_at}:{paidAt:row.paid_at,expiresAt:row.expires_at})});
  await client.query(`INSERT INTO wpay_auth.gateway_outbox(id,order_id,merchant_id,endpoint_id,event_type,body,state,payout_id,event_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,[id,payout?null:row.id,row.merchant_id,row.endpoint_id,type,body,row.endpoint_id?'pending':'unconfigured',payout?row.id:null,payout?eventKey:null]);
 }
 async expire(client){await ledger.lock(client);const rows=(await client.query("SELECT * FROM wpay_auth.gateway_orders WHERE state IN('pending_payment','verification_pending') AND expires_at<=CURRENT_TIMESTAMP ORDER BY expires_at,id LIMIT 200 FOR UPDATE")).rows;
  for(const row of rows){await this.core.release(client,row.reservation_id,null,'expired');row.state='expired';await client.query("UPDATE wpay_auth.gateway_orders SET state='expired' WHERE id=$1",[row.id]);await this.emit(client,row,'payment.expired');}return rows.length;
 }
 async customer(client,secret,utr){
  if(typeof secret!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(secret))fail('NOT_FOUND');await ledger.lock(client);
  const row=(await client.query('SELECT * FROM wpay_auth.gateway_orders WHERE token_digest=$1 FOR UPDATE',[hash(secret)])).rows[0];if(!row)fail('NOT_FOUND');
  if(['pending_payment','verification_pending'].includes(row.state)&&+row.expires_at<=Date.now()){await this.core.release(client,row.reservation_id,null,'expired');row.state='expired';await client.query("UPDATE wpay_auth.gateway_orders SET state='expired' WHERE id=$1",[row.id]);await this.emit(client,row,'payment.expired');}
  if(utr!==undefined){
   if(typeof utr!=='string'||! /^[0-9]{12}$/.test(utr))fail('INVALID_INPUT');if(['successful','failed','cancelled'].includes(row.state))fail('CONFLICT');
   if(row.claim_attempts>=5)fail('RATE_LIMITED');await client.query('UPDATE wpay_auth.gateway_orders SET claim_attempts=claim_attempts+1 WHERE id=$1',[row.id]);
   const id=randomUUID();await client.query('INSERT INTO wpay_auth.gateway_claims(id,order_id,encrypted_utr,utr_digest) VALUES($1,$2,$3,$4) ON CONFLICT(order_id,utr_digest) DO NOTHING',[id,row.id,this.crypto.seal(utr,binding('claim',id)),hash(utr)]);
   row.evidence_state='claim_submitted';row.state=row.state==='expired'?'recovery_review':'verification_pending';await client.query('UPDATE wpay_auth.gateway_orders SET state=$2,evidence_state=$3 WHERE id=$1',[row.id,row.state,row.evidence_state]);
  }
  const result={id:row.id,reference:row.reference,amountMinor:row.amount_minor,currency:'INR',status:row.state,evidenceStatus:row.evidence_state,expiresAt:row.expires_at,synthetic:this.allowSynthetic,verificationConnected:typeof this.verifier==='function'};
  if(['pending_payment','verification_pending'].includes(row.state)){
   const r=(await client.query('SELECT * FROM wpay_auth.business_reservations WHERE id=$1 AND merchant_id=$2',[row.reservation_id,row.merchant_id])).rows[0];
   const bank=(await client.query('SELECT details FROM wpay_auth.business_bank_versions WHERE bank_id=$1 AND version=$2',[r.bank_id,r.bank_version])).rows[0];
   const Upi=require('../../../public/upi'),amount=require('../business/money').format(row.amount_minor),uri=Upi.manual(bank.details.upiId,bank.details.holderName,amount,'WPay '+row.id);
   const parsed=Upi.parse(uri);if(parsed.fields.pa[0]!==bank.details.upiId||parsed.fields.am[0]!==amount||parsed.fields.cu[0]!=='INR')fail('UNAVAILABLE');
   result.uri=uri;result.qr=await this.crypto.libraries().qr.toDataURL(uri,{width:256,margin:2});
  }return result;
 }
 async createKey(client,row,body,actorId=row.id){input.fields(body,['label','scopes','rotateId']);const label=input.text(body.label,60);if(!label||!Array.isArray(body.scopes)||!body.scopes.length||body.scopes.length>2||body.scopes.some(s=>!['orders:read','orders:write'].includes(s)))fail('INVALID_INPUT');
  if(body.rotateId)await this.revokeKey(client,row.id,body.rotateId);const id=randomUUID(),secret='wpay_mk_'+id+'.'+token(),prefix='wpay_mk_'+id.slice(0,8);
  if((await client.query('SELECT count(*)::integer AS n FROM wpay_auth.gateway_keys WHERE merchant_id=$1 AND revoked_at IS NULL',[row.id])).rows[0].n>=10)fail('RATE_LIMITED');
  await client.query('INSERT INTO wpay_auth.gateway_keys(id,merchant_id,prefix,digest,label,scopes,security_version,factor_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,row.id,prefix,hash(secret),label,[...new Set(body.scopes)],row.security_version,row.factor_version]);await ledger.audit(client,{actorId,ownerId:row.id,entityId:id,event:'gateway_key_created'});return {id,prefix,secret,displayOnce:true};
 }
 async revokeKey(client,merchantId,id){const result=await client.query('UPDATE wpay_auth.gateway_keys SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE id=$1 AND merchant_id=$2 RETURNING id',[v.id(id),merchantId]);if(!result.rowCount)fail('FORBIDDEN');await ledger.audit(client,{actorId:merchantId,ownerId:merchantId,entityId:id,event:'gateway_key_revoked'});return {revoked:true};}
 async apiKey(client,secret,scope){
  if(typeof secret!=='string'||! /^wpay_mk_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(secret))fail('AUTH_FAILED');
  const key=(await client.query('SELECT * FROM wpay_auth.gateway_keys WHERE digest=$1',[hash(secret)])).rows[0];if(!key)fail('AUTH_FAILED');
  const row=await this.merchant(client,key.merchant_id),fresh=(await client.query('SELECT * FROM wpay_auth.gateway_keys WHERE id=$1 FOR UPDATE',[key.id])).rows[0];
  if(fresh.revoked_at||!fresh.scopes.includes(scope)||fresh.security_version!==row.security_version||fresh.factor_version!==row.factor_version||!row.permissions.includes('merchant.gateway.'+(scope==='orders:write'?'create':'view')))fail('FORBIDDEN');return {row,key:fresh};
 }
 async api(secret,scope,fn){
  // Count attempts in a committed transaction, including invalid business requests.
  const allowed=await transaction(this.pool,async client=>{const {key,row}=await this.apiKey(client,secret,scope);await client.query('INSERT INTO wpay_auth.api_access_audit(id,merchant_id,key_id,operation) VALUES($1,$2,$3,$4)',[randomUUID(),row.id,key.id,scope]);return (await client.query(`INSERT INTO wpay_auth.gateway_rate(key_id,hits) VALUES($1,1) ON CONFLICT(key_id) DO UPDATE SET hits=CASE WHEN gateway_rate.window_at<CURRENT_TIMESTAMP-interval '1 minute' THEN 1 ELSE gateway_rate.hits+1 END,window_at=CASE WHEN gateway_rate.window_at<CURRENT_TIMESTAMP-interval '1 minute' THEN CURRENT_TIMESTAMP ELSE gateway_rate.window_at END RETURNING hits`,[key.id])).rows[0].hits<=60;});if(!allowed)fail('RATE_LIMITED');
  return transaction(this.pool,async client=>{const {row,key}=await this.apiKey(client,secret,scope);await client.query('UPDATE wpay_auth.gateway_keys SET last_used_at=CURRENT_TIMESTAMP WHERE id=$1',[key.id]);return fn(client,row.id);});
 }
 async configure(client,merchantId,body){v.exactFields(body,['url']);webhooks.endpoint(body.url,{testCallback:this.testCallback});const id=randomUUID(),secret=token();
  await client.query('INSERT INTO wpay_auth.gateway_endpoints(id,merchant_id,url,encrypted_secret) VALUES($1,$2,$3,$4)',[id,merchantId,body.url,this.crypto.seal(secret,binding('webhook',id))]);await ledger.audit(client,{actorId:merchantId,ownerId:merchantId,entityId:id,event:'gateway_webhook_rotated'});return {id,url:body.url,secret,displayOnce:true};
 }
 async dispatch(){
  await this.pool.query("UPDATE wpay_auth.gateway_outbox SET state='failed',lease_id=NULL,lease_until=NULL WHERE state='leased' AND attempts>=delivery_budget AND lease_until<=CURRENT_TIMESTAMP");
  const event=await transaction(this.pool,async c=>(await c.query(`WITH due AS(SELECT id FROM wpay_auth.gateway_outbox WHERE attempts<delivery_budget AND ((state='pending' AND next_attempt_at<=CURRENT_TIMESTAMP) OR (state='leased' AND lease_until<=CURRENT_TIMESTAMP)) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE wpay_auth.gateway_outbox o SET state='leased',attempts=attempts+1,lease_id=$1,lease_until=CURRENT_TIMESTAMP+interval '30 seconds' FROM due WHERE o.id=due.id RETURNING o.*`,[randomUUID()])).rows[0]);if(!event)return false;
  let code=0;try{const endpoint=(await this.pool.query('SELECT * FROM wpay_auth.gateway_endpoints WHERE id=$1 AND merchant_id=$2',[event.endpoint_id,event.merchant_id])).rows[0];if(endpoint){const secret=this.crypto.open(endpoint.encrypted_secret,binding('webhook',endpoint.id)),timestamp=String(Math.floor(Date.now()/1000));code=await webhooks.deliver(endpoint.url,event.body,{'x-wpay-event-id':event.id,'x-wpay-timestamp':timestamp,'x-wpay-signature':'v1='+webhooks.signature(secret,timestamp,event.id,event.body),'x-wpay-secret-version':endpoint.id},{testCallback:this.testCallback});}}catch{code=0;}
  await transaction(this.pool,async c=>{const current=(await c.query('SELECT lease_id FROM wpay_auth.gateway_outbox WHERE id=$1 FOR UPDATE',[event.id])).rows[0];if(current.lease_id!==event.lease_id)return;
   await c.query('INSERT INTO wpay_auth.gateway_attempts(id,event_id,attempt,code) VALUES($1,$2,$3,$4)',[randomUUID(),event.id,event.attempts,code]);const ok=code>=200&&code<300;
   await c.query(`UPDATE wpay_auth.gateway_outbox SET state=$2,last_code=$3,next_attempt_at=CURRENT_TIMESTAMP+($4*interval '1 second'),lease_id=NULL,lease_until=NULL,delivered_at=CASE WHEN $2='delivered' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=$1`,[event.id,ok?'delivered':event.attempts>=event.delivery_budget?'failed':'pending',code,Math.min(3600,5*2**event.attempts)]);
  });return true;
 }
 async verifyOrder(id){
  if(typeof this.verifier!=='function')return {status:'unavailable'};
  // External evidence lookup happens before acquiring any financial locks.
  const snapshot=await transaction(this.pool,async c=>{const o=(await c.query('SELECT * FROM wpay_auth.gateway_orders WHERE id=$1',[v.id(id)])).rows[0];if(!o)fail('NOT_FOUND');const r=(await c.query('SELECT * FROM wpay_auth.business_reservations WHERE id=$1',[o.reservation_id])).rows[0],bank=(await c.query('SELECT details FROM wpay_auth.business_bank_versions WHERE bank_id=$1 AND version=$2',[r.bank_id,r.bank_version])).rows[0];
   const claims=(await c.query('SELECT * FROM wpay_auth.gateway_claims WHERE order_id=$1 ORDER BY created_at',[o.id])).rows.map(cl=>this.crypto.open(cl.encrypted_utr,binding('claim',cl.id)));
   return {orderId:o.id,reservationId:r.id,merchantId:r.merchant_id,userId:r.user_id,bankId:r.bank_id,bankVersion:r.bank_version,upi:bank.details.upiId,accountDigest:hash(bank.details.ifsc+':'+bank.details.accountNumber),amountMinor:r.amount_minor,currency:'INR',createdAt:o.created_at.toISOString(),expiresAt:o.expires_at.toISOString(),claims};});
  let deadline;const proof=await Promise.race([this.verifier(Object.freeze({...snapshot,claims:Object.freeze([...snapshot.claims])})),new Promise(resolve=>{deadline=setTimeout(()=>resolve(null),10000);})]).finally(()=>clearTimeout(deadline));if(!proof)return {status:'unavailable'};
  if(proof.status==='pending'&&proof.verified!==true){require('./evidence').validateObservation(snapshot,proof,this.allowSynthetic);await this.pool.query("UPDATE wpay_auth.gateway_orders SET evidence_state='observed' WHERE id=$1 AND state IN('pending_payment','verification_pending','expired','recovery_review')",[id]);return {status:'verification_pending',evidenceStatus:'observed'};}
  const {validateEvidence}=require('./evidence');validateEvidence(snapshot,proof,this.allowSynthetic);
  return transaction(this.pool,async c=>{await ledger.lock(c);const row=(await c.query('SELECT * FROM wpay_auth.gateway_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(row.state==='successful')return {status:'successful',alreadyAccounted:true};
   if(this.beforeEvidencePosting){const provenance=await this.beforeEvidencePosting(c,proof);if(provenance)await ledger.audit(c,{ownerId:row.merchant_id,entityId:id,event:'authoritative_statement_accepted',metadata:provenance});}
   if(proof.status==='failed'){
    if(!['pending_payment','verification_pending'].includes(row.state))return {status:row.state};await this.core.release(c,row.reservation_id,null,'released');
    await c.query("INSERT INTO wpay_auth.upi_order_outcomes(reservation_id,outcome,evidence_digest) VALUES($1,'failed',$2) ON CONFLICT DO NOTHING",[row.reservation_id,hash(proof.evidenceId)]);
    row.state='failed';await c.query("UPDATE wpay_auth.gateway_orders SET state='failed',evidence_state='verified' WHERE id=$1",[id]);await this.emit(c,row,'payment.failed');return {status:'failed'};
   }
   let recovered=proof.source!=='normal'||!['pending_payment','verification_pending'].includes(row.state)||+row.expires_at<=Date.now();
   const financial={...proof,kind:'payin',source:proof.source==='normal'?'normal':'statement_recovered'};
   const core=new BusinessCore({verifyEvidence:async()=>financial}),accounted=await core.confirmedPayin(c,{reservationId:row.reservation_id,evidenceReference:proof.evidenceId});recovered=recovered||accounted.source==='statement_recovered';
   // Preserve the verified UTR encrypted for scoped transaction views, including
   // recovery with no checkout claim. Its digest must match the financial event
   // before any view labels this observation verified. Same accounting transaction.
   const observationId=randomUUID();await c.query('INSERT INTO wpay_auth.gateway_claims(id,order_id,encrypted_utr,utr_digest) VALUES($1,$2,$3,$4) ON CONFLICT(order_id,utr_digest) DO NOTHING',[observationId,row.id,this.crypto.seal(proof.utr,binding('claim',observationId)),hash(proof.utr)]);
   const updated=(await c.query("UPDATE wpay_auth.gateway_orders SET state='successful',evidence_state='verified',paid_at=$2 WHERE id=$1 RETURNING *",[id,proof.receivedAt])).rows[0];await this.emit(c,updated,recovered?'payment.recovered':'payment.success');return {status:'successful',recovered};
  });
 }
 async tick(){await transaction(this.pool,c=>this.expire(c));await this.dispatch();if(this.verifier){const rows=(await this.pool.query("WITH due AS(SELECT id FROM wpay_auth.gateway_orders WHERE state<>'successful' AND next_verify_at<=CURRENT_TIMESTAMP ORDER BY next_verify_at,id LIMIT 5 FOR UPDATE SKIP LOCKED) UPDATE wpay_auth.gateway_orders o SET next_verify_at=CURRENT_TIMESTAMP+interval '1 minute' FROM due WHERE o.id=due.id RETURNING o.id")).rows;await Promise.allSettled(rows.map(row=>this.verifyOrder(row.id)));}}
}
module.exports={Gateway,hash,binding};
