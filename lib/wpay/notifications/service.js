"use strict";
const {randomUUID,createHash}=require('node:crypto');
const {token,digest}=require('../auth/runtime/tokens'),{transaction}=require('../db/migrations');
const {fail,recent,permit}=require('../operations/access'),v=require('../business/validation');
const {providerRead}=require('../integrations/provider-read');
const emailDigest=email=>createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
const binding=id=>'wpay-notification:'+id;
class Notifications {
 constructor({pool,crypto,provider=null}){Object.assign(this,{pool,crypto,provider});}
 configured(){return this.provider?.approved===true&&typeof this.provider.send==='function'&&typeof this.provider.id==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(this.provider.id);}
 async identity(c,id){const row=(await c.query('SELECT id,email,status,session_epoch FROM wpay_auth.accounts WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row||row.status!=='active')fail();return row;}
 async status(c,row){
  const account=await this.identity(c,row.id),hash=emailDigest(account.email);
  // A pre-016 authenticated session may be inspected during a controlled
  // upgrade. Missing notification storage cannot prove email ownership.
  // Hosted readiness still requires the complete current schema fingerprint.
  const storage=(await c.query("SELECT to_regclass('wpay_auth.email_verifications') IS NOT NULL AND to_regclass('wpay_auth.notification_deliveries') IS NOT NULL AS ready")).rows[0];
  if(!storage.ready)return {providerConfigured:false,emailOwnershipVerified:false,verifiedAt:null,deliveryState:'unavailable',delivered:false};
  const verified=(await c.query('SELECT verified_at FROM wpay_auth.email_verifications WHERE account_id=$1 AND email_digest=$2 ORDER BY verified_at DESC LIMIT 1',[row.id,hash])).rows[0];
  const latest=(await c.query("SELECT d.state,d.delivered_at FROM wpay_auth.notification_deliveries d WHERE account_id=$1 AND email_digest=$2 AND kind='email_verification' ORDER BY created_at DESC LIMIT 1",[row.id,hash])).rows[0];
  return {providerConfigured:this.configured(),emailOwnershipVerified:!!verified,verifiedAt:verified?.verified_at||null,deliveryState:latest?.state||(this.configured()?'not_requested':'unavailable'),delivered:latest?.state==='delivered'};
 }
 async request(c,row,context,b){
  v.exactFields(b,['requestId']);v.id(b.requestId);permit(context,'account_security.update',{kind:'record',id:row.id,tenantId:row.tenant_id,ownerType:'principal',ownerId:row.id});recent(row);
  if(!this.configured())return {requested:false,deliveryState:'unavailable',emailOwnershipVerified:false};
  const account=await this.identity(c,row.id),hash=emailDigest(account.email);
  const previous=(await c.query('SELECT id,email_digest FROM wpay_auth.email_verification_requests WHERE account_id=$1 AND request_id=$2',[row.id,b.requestId])).rows[0];if(previous){if(previous.email_digest!==hash)fail('CONFLICT');return {requested:true,requestId:previous.id,...await this.status(c,row)};}
  const rate=(await c.query("SELECT count(*)::int n,max(created_at) AS last FROM wpay_auth.email_verification_requests WHERE account_id=$1 AND created_at>CURRENT_TIMESTAMP-interval '1 hour'",[row.id])).rows[0];if(rate.n>=3||rate.last&&+new Date(row.database_now)-+rate.last<60000)fail('RATE_LIMITED');
  const id=randomUUID(),raw=token(),delivery=randomUUID();
  const request=(await c.query("INSERT INTO wpay_auth.email_verification_requests(id,account_id,request_id,token_digest,email_digest,session_epoch,expires_at) VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP+interval '15 minutes') RETURNING expires_at",[id,row.id,b.requestId,digest(raw),hash,account.session_epoch])).rows[0];
  await c.query("INSERT INTO wpay_auth.notification_deliveries(id,account_id,kind,source_id,encrypted_payload,email_digest) VALUES($1,$2,'email_verification',$3,$4,$5)",[delivery,row.id,id,this.crypto.seal(JSON.stringify({recipient:account.email,kind:'email_verification',requestId:id,token:raw,expiresAt:request.expires_at}),binding(delivery)),hash]);
  return {requested:true,requestId:id,deliveryState:'pending',delivered:false,emailOwnershipVerified:false,expiresAt:request.expires_at};
 }
 async verify(c,row,context,b){
  v.exactFields(b,['token']);permit(context,'account_security.update',{kind:'record',id:row.id,tenantId:row.tenant_id,ownerType:'principal',ownerId:row.id});recent(row);
  if(!this.configured())fail('UNAVAILABLE');
  const rate=(await c.query("INSERT INTO wpay_auth.throttles(bucket,window_start,attempts) VALUES($1,CURRENT_TIMESTAMP,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN wpay_auth.throttles.window_start<=CURRENT_TIMESTAMP-interval '15 minutes' THEN 1 ELSE LEAST(wpay_auth.throttles.attempts+1,11) END,window_start=CASE WHEN wpay_auth.throttles.window_start<=CURRENT_TIMESTAMP-interval '15 minutes' THEN CURRENT_TIMESTAMP ELSE wpay_auth.throttles.window_start END RETURNING attempts",['email-verification:'+row.id])).rows[0];
  if(rate.attempts>10)return {failure:'RATE_LIMITED'};
  const key=digest(b.token);if(!key)return {failure:'INVALID_INPUT'};const account=await this.identity(c,row.id);
  const r=(await c.query(`SELECT r.*,d.state AS delivery_state FROM wpay_auth.email_verification_requests r JOIN wpay_auth.notification_deliveries d ON d.source_id=r.id AND d.kind='email_verification'
   WHERE r.token_digest=$1 AND r.account_id=$2`,[key,row.id])).rows[0];
  if(!r||r.email_digest!==emailDigest(account.email)||r.session_epoch!==account.session_epoch||+r.expires_at<=+new Date(row.database_now)||!['accepted','delivered'].includes(r.delivery_state))return {failure:'FORBIDDEN'};
  const inserted=await c.query('INSERT INTO wpay_auth.email_verifications(request_id,account_id,email_digest) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING request_id',[r.id,row.id,r.email_digest]);if(!inserted.rowCount)return {failure:'CONFLICT'};
  await c.query("INSERT INTO wpay_auth.panel_audit(id,actor_id,target_id,action,details) VALUES($1,$2,$2,'email_ownership_verified',$3)",[randomUUID(),row.id,{requestId:r.id}]);
  // Possession of the privately delivered token proves ownership; an outbox
  // acceptance alone never does. No token or email is placed in audit metadata.
  return {emailOwnershipVerified:true};
 }
 async enqueueFunding(){
  if(!this.configured())return;
  await transaction(this.pool,async c=>{
   const rows=(await c.query(`SELECT n.*,a.email FROM wpay_auth.funding_notifications n JOIN wpay_auth.accounts a ON a.id=n.owner_id WHERE a.status='active'
    AND EXISTS(SELECT 1 FROM wpay_auth.email_verifications v WHERE v.account_id=a.id)
    AND NOT EXISTS(SELECT 1 FROM wpay_auth.notification_deliveries d WHERE d.kind='funding_status' AND d.source_id=n.id) ORDER BY n.created_at,n.id LIMIT 25`)).rows;
   for(const r of rows){const hash=emailDigest(r.email);if(!(await c.query('SELECT 1 FROM wpay_auth.email_verifications WHERE account_id=$1 AND email_digest=$2 LIMIT 1',[r.owner_id,hash])).rowCount)continue;
    const id=randomUUID();await c.query("INSERT INTO wpay_auth.notification_deliveries(id,account_id,kind,source_id,encrypted_payload,email_digest) VALUES($1,$2,'funding_status',$3,$4,$5) ON CONFLICT(kind,source_id) DO NOTHING",[id,r.owner_id,r.id,this.crypto.seal(JSON.stringify({recipient:r.email,kind:'funding_status',requestId:r.request_id,status:r.kind}),binding(id)),hash]);}
  });
 }
 async dispatch(){
  if(!this.configured())return {state:'unavailable',attempted:0};
  await this.enqueueFunding();let attempted=0;
  for(let i=0;i<5;i++){
   const delivery=await transaction(this.pool,async c=>{
    const r=(await c.query("SELECT * FROM wpay_auth.notification_deliveries WHERE state IN('pending','sending') AND next_attempt_at<=CURRENT_TIMESTAMP AND (lease_until IS NULL OR lease_until<CURRENT_TIMESTAMP) ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED")).rows[0];if(!r)return null;
    if(r.attempts>=3){await c.query("UPDATE wpay_auth.notification_deliveries SET state='unavailable',lease_until=NULL WHERE id=$1",[r.id]);return {skip:true};}
    const account=(await c.query('SELECT email,status,session_epoch FROM wpay_auth.accounts WHERE id=$1',[r.account_id])).rows[0];
    const challenge=r.kind==='email_verification'?(await c.query('SELECT session_epoch,expires_at FROM wpay_auth.email_verification_requests WHERE id=$1',[r.source_id])).rows[0]:null;
    if(!account||account.status!=='active'||emailDigest(account.email)!==r.email_digest||r.kind==='email_verification'&&(!challenge||+challenge.expires_at<=Date.now()||challenge.session_epoch!==account.session_epoch)){await c.query("UPDATE wpay_auth.notification_deliveries SET state='expired',lease_until=NULL WHERE id=$1",[r.id]);return {skip:true};}
    await c.query("UPDATE wpay_auth.notification_deliveries SET state='sending',attempts=attempts+1,lease_until=CURRENT_TIMESTAMP+interval '30 seconds' WHERE id=$1",[r.id]);return {...r,attempts:r.attempts+1};
   });
   if(!delivery)break;if(delivery.skip)continue;attempted++;
   let response;try{const message=JSON.parse(this.crypto.open(delivery.encrypted_payload,binding(delivery.id)));response=await providerRead((payload,{signal})=>this.provider.send(payload,{idempotencyKey:delivery.id,signal}),message,{timeoutMs:5000,attempts:1});}catch{response={state:'unavailable'};}
   const value=response.state==='response'?response.value:null;
   const state=value?.status==='delivered'&&value.providerId===this.provider.id?'delivered':value?.status==='accepted'&&value.providerId===this.provider.id?'accepted':delivery.attempts>=3?'unavailable':value?.status==='rejected'?'failed':'pending';
   await this.pool.query("UPDATE wpay_auth.notification_deliveries SET state=$2,lease_until=NULL,next_attempt_at=CURRENT_TIMESTAMP+interval '1 minute',delivered_at=CASE WHEN $2='delivered' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=$1 AND attempts=$3 AND state='sending'",[delivery.id,state,delivery.attempts]);
  }
  return {state:'processed',attempted};
 }
 async run(c,row,context,operation,b){
  if(operation==='email/status'){v.exactFields(b,[]);permit(context,'account_security.view');return this.status(c,row);}
  if(operation==='email/request')return this.request(c,row,context,b);
  if(operation==='email/verify')return this.verify(c,row,context,b);
  fail('NOT_FOUND');
 }
}
module.exports={Notifications,emailDigest};
