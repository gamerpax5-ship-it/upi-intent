'use strict';
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const {commercial}=require('../auth/runtime/commercial');
const {buildPrincipalContext}=require('../auth/principal-context');
const {authorize}=require('../authorization-policy');
const {securityAudit}=require('../db/security-repository');
const ledger=require('../business/ledger');
const {fail}=require('./policy');
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const token=()=>randomBytes(24).toString('base64url');
const clean=v=>String(v??'').trim();
function actorContext(row){
 const built=buildPrincipalContext({
  identity:{accountId:row.id,subjectId:row.subject_id,tenantId:row.tenant_id,permissionVersion:row.permission_version},
  account:{id:row.id,subjectId:row.subject_id,tenantId:row.tenant_id,type:row.account_type,status:row.status,permissionVersion:row.permission_version},
  grantRecord:{accountId:row.id,subjectId:row.subject_id,tenantId:row.tenant_id,permissionVersion:row.grant_version,grants:row.permissions,adminScope:row.admin_scope},
  eligibilityRecord:{accountId:row.id,subjectId:row.subject_id,tenantId:row.tenant_id,facts:{approvalStatus:row.approval_status}}
 });
 if(!built.ok)fail('ADMIN_BINDING_NOT_AUTHORIZED');return built.context;
}
async function admin(c,id,tenants){
 if(!id)return null;
 const row=(await c.query(`SELECT a.id,a.subject_id,a.tenant_id,a.account_type,a.status,a.permission_version,
  g.permission_version AS grant_version,g.permissions,g.admin_scope,e.approval_status
  FROM wpay_auth.accounts a JOIN wpay_auth.grants g ON g.account_id=a.id JOIN wpay_auth.eligibility e ON e.account_id=a.id
  WHERE a.id=$1 AND a.account_type IN('admin','super_admin') AND a.status='active' AND a.tenant_id=ANY($2)`,[id,tenants])).rows[0];
 return row||null;
}
async function target(c,id,tenants){return (await c.query(`SELECT a.id,a.name,a.email,a.account_type,a.status,a.tenant_id,a.created_at,e.approval_status
 FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id
 WHERE a.id=$1 AND a.account_type IN('user','merchant') AND a.tenant_id=ANY($2)`,[id,tenants])).rows[0]||null;}
async function defaults(c,account,fixedCurrency){
 if(account.account_type==='user')return {payinCommission:'0.45',payoutCommission:'0.30',inrPerUsdt:'107',depositNetwork:'TRON-TRC20',depositAddress:''};
 const d=(await c.query(`SELECT merchant_inr_per_usdt,merchant_fixed_payout_fee,merchant_payin_fee,merchant_payout_fee,merchant_payment_link_ttl_seconds
  FROM wpay_auth.admin_commercial_defaults WHERE tenant_id=$1`,[account.tenant_id])).rows[0]||{};
 return {payinFee:String(d.merchant_payin_fee??'1.2'),payoutFee:String(d.merchant_payout_fee??'0.8'),fixedPayoutFee:String(d.merchant_fixed_payout_fee??'6'),fixedFeeCurrency:fixedCurrency||'INR',paymentLinkTtlSeconds:String(d.merchant_payment_link_ttl_seconds??300),inrPerUsdt:String(d.merchant_inr_per_usdt??'107')};
}
async function create(c,{eventId,chatId,accountId}){
 const raw=token(),digest=hash(raw),id=randomUUID();
 const row=(await c.query(`INSERT INTO wpay_auth.notification_bot_account_reviews(id,event_id,chat_id,account_id,token_digest,state,expires_at)
  VALUES($1,$2,$3,$4,$5,'pending',CURRENT_TIMESTAMP+interval '24 hours')
  ON CONFLICT(event_id,chat_id) DO UPDATE SET token_digest=EXCLUDED.token_digest,state=CASE WHEN notification_bot_account_reviews.state IN('approved','rejected') THEN notification_bot_account_reviews.state ELSE 'pending' END,telegram_actor_id=NULL,draft='{}',prompt_message_id=NULL,expires_at=EXCLUDED.expires_at,updated_at=CURRENT_TIMESTAMP
  RETURNING *`,[id,eventId,String(chatId),accountId,digest])).rows[0];
 return {...row,token:raw};
}
async function attachMessage(c,id,messageId){await c.query('UPDATE wpay_auth.notification_bot_account_reviews SET notification_message_id=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[id,messageId]);}
async function byToken(c,raw,chatId,forUpdate=false){if(typeof raw!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(raw))return null;return (await c.query(`SELECT r.*,a.name,a.email,a.account_type,a.status AS account_status,a.tenant_id,a.created_at,e.approval_status
 FROM wpay_auth.notification_bot_account_reviews r JOIN wpay_auth.accounts a ON a.id=r.account_id JOIN wpay_auth.eligibility e ON e.account_id=a.id
 WHERE r.token_digest=$1 AND r.chat_id=$2 AND r.expires_at>CURRENT_TIMESTAMP ${forUpdate?'FOR UPDATE OF r':''}`,[hash(raw),String(chatId)])).rows[0]||null;}

async function byId(c,id,chatId,forUpdate=false){if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))return null;return (await c.query(`SELECT r.*,a.name,a.email,a.account_type,a.status AS account_status,a.tenant_id,a.created_at,e.approval_status
 FROM wpay_auth.notification_bot_account_reviews r JOIN wpay_auth.accounts a ON a.id=r.account_id JOIN wpay_auth.eligibility e ON e.account_id=a.id
 WHERE r.id=$1 AND r.chat_id=$2 AND r.expires_at>CURRENT_TIMESTAMP ${forUpdate?'FOR UPDATE OF r':''}`,[id,String(chatId)])).rows[0]||null;}
async function begin(c,review,actor,mode,defaults={}){if(!['approve','reject'].includes(mode)||review.approval_status!=='pending'||!['pending','editing_approve','editing_reject','confirm_approve','confirm_reject'].includes(review.state))fail('REVIEW_UNAVAILABLE');if(review.telegram_actor_id&&String(review.telegram_actor_id)!==String(actor)&&Date.now()-+new Date(review.updated_at)<600000)fail('REVIEW_IN_PROGRESS');const state=mode==='approve'?'editing_approve':'editing_reject',draft=mode!=='approve'?{}:review.account_type==='user'?{depositNetwork:'TRON-TRC20'}:{fixedFeeCurrency:defaults.fixedFeeCurrency||'INR',paymentLinkTtlSeconds:String(defaults.paymentLinkTtlSeconds||300)};return (await c.query('UPDATE wpay_auth.notification_bot_account_reviews SET state=$2,telegram_actor_id=$3,draft=$4,prompt_message_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *',[review.id,state,String(actor),draft])).rows[0];}
async function setPrompt(c,id,messageId){await c.query('UPDATE wpay_auth.notification_bot_account_reviews SET prompt_message_id=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[id,messageId]);}
function parseReply(review,text,fixedCurrency){
 if(review.state==='editing_reject'){const reason=clean(text);if(reason.length<3||reason.length>500)throw Error('REVIEW_FORM_INVALID');return {mode:'reject',draft:{reason}};}
 if(review.state!=='editing_approve')throw Error('REVIEW_UNAVAILABLE');const parts=String(text||'').split('|').map(clean);
 let draft;
 try{
  if(review.account_type==='user'){
   if(parts.length!==4)throw Error('REVIEW_FORM_INVALID');draft={...(review.draft||{}),payinCommission:parts[0],payoutCommission:parts[1],inrPerUsdt:parts[2],depositNetwork:'TRON-TRC20',depositAddress:parts[3]};
   commercial('user',{payinCommission:draft.payinCommission,payoutCommission:draft.payoutCommission,inrPerUsdt:draft.inrPerUsdt,depositNetwork:'TRON-TRC20',depositAddress:draft.depositAddress},fixedCurrency);
  }else{
   if(parts.length!==4)throw Error('REVIEW_FORM_INVALID');draft={...(review.draft||{}),payinFee:parts[0],payoutFee:parts[1],fixedPayoutFee:parts[2],fixedFeeCurrency:review.draft?.fixedFeeCurrency||fixedCurrency||'INR',paymentLinkTtlSeconds:String(review.draft?.paymentLinkTtlSeconds||300),inrPerUsdt:parts[3]};commercial('merchant',draft,fixedCurrency||draft.fixedFeeCurrency);
  }
 }catch(error){if(error?.message==='REVIEW_FORM_INVALID'||error?.code==='INVALID_INPUT')throw Error('REVIEW_FORM_INVALID');throw error;}
 return {mode:'approve',draft};
}
async function acceptReply(c,{chatId,actor,replyTo,text,fixedCurrency}){
 const review=(await c.query(`SELECT r.*,a.account_type,a.name,a.email,a.tenant_id,e.approval_status FROM wpay_auth.notification_bot_account_reviews r
  JOIN wpay_auth.accounts a ON a.id=r.account_id JOIN wpay_auth.eligibility e ON e.account_id=a.id
  WHERE r.chat_id=$1 AND r.telegram_actor_id=$2 AND r.prompt_message_id=$3 AND r.state IN('editing_approve','editing_reject') AND r.expires_at>CURRENT_TIMESTAMP FOR UPDATE OF r`,[String(chatId),String(actor),replyTo])).rows[0];
 if(!review)return null;const parsed=parseReply(review,text,fixedCurrency),next=parsed.mode==='approve'?'confirm_approve':'confirm_reject';return (await c.query('UPDATE wpay_auth.notification_bot_account_reviews SET state=$2,draft=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *',[review.id,next,parsed.draft])).rows[0];
}
async function cancel(c,review,actor){if(review.telegram_actor_id&&String(review.telegram_actor_id)!==String(actor))fail('REVIEW_IN_PROGRESS');return (await c.query("UPDATE wpay_auth.notification_bot_account_reviews SET state='pending',telegram_actor_id=NULL,draft='{}',prompt_message_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND state NOT IN('approved','rejected') RETURNING *",[review.id])).rows[0];}
async function apply(c,{review,actor,current,tenants,fixedCurrency}){
 if(String(review.telegram_actor_id)!==String(actor)||!['confirm_approve','confirm_reject'].includes(review.state))fail('REVIEW_UNAVAILABLE');
 const bound=await admin(c,current.state.adminAccountId,tenants);if(!bound)fail('ADMIN_BINDING_REQUIRED');const context=actorContext(bound),t=await target(c,review.account_id,tenants);if(!t||t.status!=='active'||t.approval_status!=='pending')fail('REVIEW_UNAVAILABLE');
 const decision=review.state==='confirm_approve'?'approve':'reject',permissionId=`${t.account_type==='user'?'users':'merchants'}.${decision}`,permit=authorize({...context,permissionId,context:{kind:'record',id:t.id,tenantId:t.tenant_id}});if(!permit.allowed)fail('ADMIN_BINDING_NOT_AUTHORIZED');
 const draft=review.draft||{},settings=decision==='approve'?(t.account_type==='user'?commercial('user',{payinCommission:draft.payinCommission,payoutCommission:draft.payoutCommission,inrPerUsdt:draft.inrPerUsdt,depositNetwork:draft.depositNetwork,depositAddress:draft.depositAddress},fixedCurrency):commercial('merchant',draft,fixedCurrency||draft.fixedFeeCurrency||'INR')):null,reason=decision==='reject'?clean(draft.reason):'';
 const payload=hash(JSON.stringify({accountId:t.id,decision,settings,reason,telegramActor:String(actor),chat:String(current.chat_id)})),requestId=review.id;
 const prior=(await c.query('SELECT payload_digest,result FROM wpay_auth.approval_requests WHERE actor_id=$1 AND request_id=$2',[bound.id,requestId])).rows[0];if(prior){if(prior.payload_digest!==payload)fail('REVIEW_CONFLICT');return {status:prior.result.approvalStatus||decision,account:t,already:true};}
 await ledger.lock(c);
 if(settings)await c.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),t.id,JSON.stringify(settings),bound.id]);
 const status=decision==='approve'?'approved':'rejected',where=permit.constraints.where,changed=await c.query("UPDATE wpay_auth.eligibility e SET approval_status=$3 FROM wpay_auth.accounts a WHERE e.account_id=a.id AND a.id=$1 AND a.tenant_id=$2 AND e.approval_status='pending'",[where.id,where.tenantId,status]);if(changed.rowCount!==1)fail('REVIEW_CONFLICT');
 await c.query('UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1 WHERE id=$1 AND tenant_id=$2',[where.id,where.tenantId]);await c.query('UPDATE wpay_auth.grants SET permission_version=permission_version+1 WHERE account_id=$1',[t.id]);await securityAudit(c,bound.id,t.id,status,reason||null);
 await c.query('INSERT INTO wpay_auth.approval_requests(actor_id,request_id,payload_digest,account_id,result) VALUES($1,$2,$3,$4,$5)',[bound.id,requestId,payload,t.id,{approvalStatus:status}]);
 await c.query("UPDATE wpay_auth.notification_bot_account_reviews SET state=$2,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[review.id,status]);
 await c.query('INSERT INTO wpay_auth.notification_bot_account_review_audit(id,review_id,chat_id,telegram_actor_id,wpay_admin_id,action,details) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),review.id,String(current.chat_id),String(actor),bound.id,status,{accountId:t.id,accountType:t.account_type}]);
 return {status,account:t,admin:bound};
}
module.exports={hash,create,attachMessage,byToken,byId,begin,setPrompt,acceptReply,cancel,apply,defaults,admin,target,parseReply};