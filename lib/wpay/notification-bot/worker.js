'use strict';
const {randomBytes,createHash,randomUUID}=require('node:crypto');
const {CONTROLLERS}=require('./policy'),fmt=require('./format'),{decide}=require('./monitor-policy');
const ledger=require('../business/ledger');
const audience=kind=>['user_registered','merchant_registered','bank_submitted','bank_approved'].includes(kind)?'admin':kind==='merchant_assigned'?'merchant':'user';
function applies(state,event){return state.role===audience(event.kind)&&(state.role==='admin'||state.mappings.some(m=>m.accountId===event.account_id));}
class Worker{
 constructor(source){this.source=source;}
 async member(access,chat,state,event){
  const ids=state.role==='user'?state.mappings.filter(m=>m.accountId===event.account_id&&m.telegramId).map(m=>m.telegramId):CONTROLLERS;
  for(let n=0;n<ids.length;n+=5){const results=await Promise.all(ids.slice(n,n+5).map(id=>state.role==='user'?access.receiver(chat,id):access.controller(chat,id)));if(results.some(Boolean))return true;}return false;
 }
 async enqueue(c,{key,kind,accountId,entityId,tenant,metadata={}}){await c.query('INSERT INTO wpay_auth.notification_bot_events(event_key,kind,account_id,entity_id,tenant_id,metadata) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[key,kind,accountId,entityId,tenant,metadata]);}
 async fanout({store,tenants}){
  return store.transaction(async c=>{
   const events=(await c.query('SELECT * FROM wpay_auth.notification_bot_events WHERE NOT processed AND tenant_id=ANY($1) ORDER BY created_at,id LIMIT 20 FOR UPDATE SKIP LOCKED',[tenants])).rows;
   for(const event of events){
    const groups=(await c.query("SELECT * FROM wpay_auth.notification_bot_groups WHERE $1=ANY(tenant_ids) AND state->>'role'=$2 AND ($2='admin' OR state @> $3::jsonb)",[event.tenant_id,audience(event.kind),JSON.stringify({mappings:[{accountId:event.account_id}]})])).rows;
    for(const group of groups)await c.query('INSERT INTO wpay_auth.notification_bot_deliveries(event_id,chat_id,group_revision) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[event.id,group.chat_id,group.revision]);
    await c.query('UPDATE wpay_auth.notification_bot_events SET processed=true WHERE id=$1',[event.id]);
   }
  });
 }
 async render(c,event,current,context){
  const {tenants,crypto}=context,source=this.source;
  const account=(await c.query(`SELECT a.id,a.name,a.email,a.account_type,a.status,a.created_at,e.approval_status FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.id=$1 AND a.tenant_id=ANY($2)`,[event.account_id,tenants])).rows[0];
  if(!account||account.status!=='active')return null;
  const review=(page,target)=>({inline_keyboard:[[{text:'Review / Approve',url:source.origin+'/admin#notification='+page+'&target='+target}]]});
  if(['user_registered','merchant_registered'].includes(event.kind)){
   if(account.approval_status!=='pending')return null;const ar=require('./account-review'),defaults=await ar.defaults(c,account,context.fixedCurrency),pending=await ar.create(c,{eventId:event.id,chatId:current.chat_id,accountId:account.id});
   const warning=current.state.adminAccountId?'':'\n\nTelegram approval needs a bound WPay Admin actor. Run /setadmin admin@email.com once in this group.';
   return {text:fmt.registration(account)+'\n\n'+fmt.reviewCard(account,defaults)+warning,reviewId:pending.id,markup:{inline_keyboard:[[{text:'Approve '+(account.account_type==='user'?'User':'Merchant'),callback_data:'nb:review:'+pending.token+':approve'},{text:'Reject',callback_data:'nb:review:'+pending.token+':reject'}]]}};
  }
  if(['callback_delivered','callback_failed'].includes(event.kind)){
   const row=(await c.query(`SELECT o.state,o.amount_minor,cl.id,cl.encrypted_utr,
    (SELECT state FROM wpay_auth.gateway_outbox WHERE order_id=o.id AND event_type IN('payment.success','payment.recovered') ORDER BY created_at DESC LIMIT 1) AS callback_state
    FROM wpay_auth.gateway_orders o JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id
    JOIN wpay_auth.business_financial_events f ON f.reservation_id=r.id JOIN wpay_auth.gateway_claims cl ON cl.order_id=o.id AND cl.utr_digest=f.utr_digest
    WHERE o.id=$1 AND r.user_id=$2`,[event.entity_id,account.id])).rows[0];
   if(!row||row.state!=='successful'||event.kind==='callback_delivered'&&row.callback_state!=='delivered')return null;
   return {text:fmt.callbackResult({utr:crypto.open(row.encrypted_utr,'wpay-gateway-claim:'+row.id),amountMinor:row.amount_minor,paymentStatus:row.state,callbackStatus:row.callback_state})};
  }
  if(event.kind==='claim_pending'){
   const claim=await source.claim(c,event.entity_id,tenants);
   if(!claim||claim.user_id!==event.account_id||['successful','cancelled'].includes(claim.state)||['verified','rejected'].includes(claim.evidence_state))return null;
   const mappings=current.state.mappings.filter(m=>m.accountId===claim.user_id&&m.telegramId);
   if(!mappings.length)return null;
   // A current, delivered button already covers this claim for these actors.
   const existing=(await c.query('SELECT mapping_ids FROM wpay_auth.notification_bot_receipts WHERE chat_id=$1 AND claim_id=$2 AND message_id IS NOT NULL AND expires_at>CURRENT_TIMESTAMP AND confirmed_at IS NULL',[current.chat_id,claim.id])).rows;
   if(existing.some(r=>mappings.every(m=>r.mapping_ids.includes(m.id))))return null;
   const utr=crypto.open(claim.encrypted_utr,'wpay-gateway-claim:'+claim.id),token=randomBytes(24).toString('base64url'),digest=createHash('sha256').update(token).digest('hex');
   if(createHash('sha256').update(utr).digest('hex')!==claim.utr_digest)throw Error('CLAIM_INVALID');
   await c.query("INSERT INTO wpay_auth.notification_bot_receipts(token_digest,chat_id,account_id,claim_id,mapping_ids,amount_minor,expires_at) VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP+interval '24 hours')",[digest,current.chat_id,claim.user_id,claim.id,mappings.map(m=>m.id),claim.amount_minor]);
   return {text:fmt.pendingPayment({upi:claim.upi,amountMinor:claim.amount_minor,utr}),receipt:digest,markup:{inline_keyboard:[[{text:'Received',callback_data:'nb:received:'+token}]]}};
  }
  if(event.kind==='merchant_assigned'){
   if(!(await c.query("SELECT 1 FROM wpay_auth.eligibility WHERE account_id=$1 AND approval_status='approved'",[account.id])).rowCount)return null;
   const rows=(await c.query(`SELECT v.details->>'upiId' AS upi FROM wpay_auth.business_assignments x JOIN wpay_auth.business_bank_accounts b ON b.owner_id=x.user_id AND (x.bank_id IS NULL OR b.id=x.bank_id) JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version JOIN wpay_auth.accounts a ON a.id=b.owner_id WHERE x.id=$1 AND x.merchant_id=$2 AND x.status='active' AND a.tenant_id=ANY($3) AND a.status='active' AND NOT b.deactivated ORDER BY b.id LIMIT 8`,[event.entity_id,account.id,tenants])).rows;
   return rows.length?{text:'New UPI assigned\n'+rows.map(r=>'UPI: '+fmt.text(r.upi,320)).join('\n')}:null;
  }
  const bank=await source.bank(c,event.entity_id,tenants);if(!bank||bank.owner_id!==event.account_id||bank.account_status!=='active')return null;
  if(['bank_submitted','bank_approved'].includes(event.kind)){
   if(event.kind==='bank_approved'&&bank.approved_version!==bank.version)return null;
   return {text:fmt.bankSubmission({account,bank,details:bank.details,approved:event.kind==='bank_approved'}),markup:review('bank-upi',bank.id)};
  }
  const labels={upi_started:'UPI Started',device_online:'Device Reconnected',device_offline:'Device Offline — please reconnect your APK',upi_auto_stopped:'UPI Stopped',upi_auto_restarted:'UPI Started Again',statement_required:'Statement Required',upi_start_blocked:'UPI Start Waiting',upi_requirement_notice:'UPI Setup Notice'};
  if(!labels[event.kind])return null;
  if(['upi_started','upi_auto_restarted'].includes(event.kind)&&bank.status!=='running')return null;
  if(event.kind==='upi_auto_stopped'&&bank.status!=='stopped')return null;
  if(event.kind==='device_offline'&&(!['running','stopped'].includes(bank.status)||(await source.device(bank)).status!=='offline'))return null;
  if(event.kind==='device_online'&&(await source.device(bank)).status!=='online')return null;
  const pending=event.kind==='statement_required'?await source.claims(c,bank.id):[];
  if(event.kind==='statement_required'&&!pending.length)return null;
  const blocked={STATEMENT_REQUIRED:'Required statement is not accepted yet. UPI has not auto-started.',DEVICE_REQUIRED:'APK/device is not ready. UPI has not auto-started.',FUNDING_REQUIRED:'Collection funding/capacity is not ready. UPI has not auto-started.',VERIFICATION_REQUIRED:'UPI verification is incomplete. UPI has not auto-started.'};
  const notice={APK_NOT_READY:'APK/device is not ready. Admin-added UPI remains usable; this is a warning only.',STATEMENT_MISSING:'Statement is not accepted. Admin-added UPI remains usable; this is a warning only.'};
  return {text:[labels[event.kind],'UPI: '+fmt.text(bank.details.upiId,320),
   ...(event.kind==='statement_required'?['Pending payment orders: '+new Set(pending.map(r=>r.order_id)).size+(pending.length>500?'+':''),'Upload the latest statement to resolve pending payment claims.']:[]),
   ...(event.kind==='upi_start_blocked'?[blocked[event.metadata.reason]||'UPI has not auto-started because an eligibility check is still pending.']:[]),
   ...(event.kind==='upi_requirement_notice'?[notice[event.metadata.reason]||'A setup item needs attention.']:[]),
   ...(event.kind==='upi_auto_stopped'?['Reason: '+(event.metadata.reason==='pending_utr'?'Unresolved UTR claims':'APK offline for 5 minutes'),'Automatic restart only after recovery and existing eligibility checks.']:[])].join('\n')};
 }
 async deliver(context){
  const {store,telegram,access,tenants}=context;let jobId;
  try{return await store.transaction(async c=>{
   const job=(await c.query(`SELECT d.* FROM wpay_auth.notification_bot_deliveries d JOIN wpay_auth.notification_bot_events e ON e.id=d.event_id WHERE d.state='pending' AND d.attempts<5 AND d.next_attempt_at<=CURRENT_TIMESTAMP AND e.tenant_id=ANY($1) ORDER BY d.next_attempt_at,d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED`,[tenants])).rows[0];if(!job)return false;jobId=job.id;
   const event=(await c.query('SELECT * FROM wpay_auth.notification_bot_events WHERE id=$1',[job.event_id])).rows[0],current=(await c.query('SELECT * FROM wpay_auth.notification_bot_groups WHERE chat_id=$1 FOR UPDATE',[job.chat_id])).rows[0];
   const chat={id:Number(current.chat_id),type:current.chat_type};
   if(current.revision!==job.group_revision||!current.tenant_ids.includes(event.tenant_id)||!applies(current.state,event)||!await this.member(access,chat,current.state,event)){
    await c.query("UPDATE wpay_auth.notification_bot_deliveries SET state='cancelled' WHERE id=$1",[job.id]);return true;
   }
   const output=await this.render(c,event,current,context);
   if(!output){await c.query("UPDATE wpay_auth.notification_bot_deliveries SET state='cancelled' WHERE id=$1",[job.id]);return true;}
   const sent=await telegram.text(current.chat_id,output.text,output.markup);if(!Number.isSafeInteger(sent?.message_id))throw Error('NOTIFICATION_SEND_UNCONFIRMED');
   if(output.receipt)await c.query('UPDATE wpay_auth.notification_bot_receipts SET message_id=$2 WHERE token_digest=$1',[output.receipt,sent.message_id]);
   if(output.reviewId)await require('./account-review').attachMessage(c,output.reviewId,sent.message_id);
   await c.query("UPDATE wpay_auth.notification_bot_deliveries SET state='delivered',attempts=attempts+1,message_id=$2 WHERE id=$1",[job.id,sent.message_id]);return true;
  });}catch{if(jobId)await store.pool.query("UPDATE wpay_auth.notification_bot_deliveries SET attempts=attempts+1,state=CASE WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,next_attempt_at=CURRENT_TIMESTAMP+interval '1 minute' WHERE id=$1 AND state='pending'",[jobId]);return false;}
 }

 async upgradeRegistrationButtons(context){
  const {store,telegram,access,tenants}=context,rows=(await store.pool.query(`SELECT d.id,d.chat_id,d.message_id,e.id AS event_id,e.account_id,e.kind,e.tenant_id
   FROM wpay_auth.notification_bot_deliveries d JOIN wpay_auth.notification_bot_events e ON e.id=d.event_id
   JOIN wpay_auth.notification_bot_groups g ON g.chat_id=d.chat_id JOIN wpay_auth.accounts a ON a.id=e.account_id JOIN wpay_auth.eligibility el ON el.account_id=a.id
   LEFT JOIN wpay_auth.notification_bot_account_reviews r ON r.event_id=e.id AND r.chat_id=d.chat_id
   WHERE d.state='delivered' AND d.message_id IS NOT NULL AND e.kind IN('user_registered','merchant_registered') AND e.tenant_id=ANY($1)
   AND g.state->>'role'='admin' AND a.status='active' AND el.approval_status='pending' AND r.id IS NULL
   ORDER BY e.created_at DESC,d.id LIMIT 10`,[tenants])).rows;
  for(const row of rows){if(context.isStopped?.())break;try{await store.transaction(async c=>{
    const current=(await c.query('SELECT * FROM wpay_auth.notification_bot_groups WHERE chat_id=$1 FOR UPDATE',[row.chat_id])).rows[0];if(!current||current.state.role!=='admin'||!current.tenant_ids.includes(row.tenant_id))return;
    const chat={id:Number(current.chat_id),type:current.chat_type},event=(await c.query('SELECT * FROM wpay_auth.notification_bot_events WHERE id=$1',[row.event_id])).rows[0];if(!event||!await this.member(access,chat,current.state,event))return;
    const output=await this.render(c,event,current,context);if(!output?.reviewId)return;
    await telegram.call('editMessageText',{chat_id:chat.id,message_id:Number(row.message_id),text:output.text,reply_markup:output.markup});await require('./account-review').attachMessage(c,output.reviewId,row.message_id);
   });}catch{}}
 }
 async monitor(context){
  const {store,tenants,settings}=context;
  const watches=(await store.pool.query(`WITH due AS(SELECT w.bank_id FROM wpay_auth.notification_bot_watches w JOIN wpay_auth.business_bank_accounts b ON b.id=w.bank_id JOIN wpay_auth.accounts a ON a.id=b.owner_id WHERE w.next_check_at<=CURRENT_TIMESTAMP AND a.tenant_id=ANY($1) ORDER BY w.next_check_at,w.bank_id LIMIT 10 FOR UPDATE OF w SKIP LOCKED) UPDATE wpay_auth.notification_bot_watches w SET next_check_at=CURRENT_TIMESTAMP+interval '1 minute' FROM due WHERE w.bank_id=due.bank_id RETURNING w.*`,[tenants])).rows;
  for(const watch of watches){
   if(context.isStopped?.())break;
   const before=await this.source.bank(store.pool,watch.bank_id,tenants);if(!before)continue;
   const groups=(await store.pool.query("SELECT 1 FROM wpay_auth.notification_bot_groups WHERE state @> $1::jsonb AND $2=ANY(tenant_ids) AND EXISTS(SELECT 1 FROM jsonb_array_elements(state->'mappings') m WHERE m->>'accountId'=$3 AND m->>'telegramId' IS NOT NULL) LIMIT 1",[JSON.stringify({role:'user',mappings:[{accountId:before.owner_id}]}),before.tenant_id,before.owner_id])).rowCount;
   if(!groups&&!watch.auto_stop){await store.pool.query("UPDATE wpay_auth.notification_bot_watches SET next_check_at=CURRENT_TIMESTAMP+interval '1 hour' WHERE bank_id=$1",[before.id]);continue;}
   const device=await this.source.device(before);
   await store.transaction(async c=>{
    await ledger.lock(c);const bank=await this.source.bank(c,before.id,tenants),state=(await c.query('SELECT *,CURRENT_TIMESTAMP AS now FROM wpay_auth.notification_bot_watches WHERE bank_id=$1 FOR UPDATE',[before.id])).rows[0];
    if(!bank||bank.account_status!=='active'||bank.approval_status!=='approved'||bank.version!==before.version||JSON.stringify(bank.details)!==JSON.stringify(before.details))return;
    const claims=await this.source.claims(c,bank.id),now=+state.now,decision=decide({bank:{version:bank.version,approvedVersion:bank.approved_version,status:bank.status,frozen:bank.frozen,deactivated:bank.deactivated,reason:bank.reason,updatedAt:bank.updated_at.toISOString(),adminManaged:bank.admin_managed===true},device,pendingClaims:claims.map(r=>({orderId:r.order_id,utrDigest:r.utr_digest,createdAt:r.created_at})),stop:state.auto_stop,now,settings});
    const event=(kind,key,metadata={})=>this.enqueue(c,{key,kind,accountId:bank.owner_id,entityId:bank.id,tenant:bank.tenant_id,metadata});
    const noticeBucket=Math.floor(now/settings.statementReminderMs);
    const blocked=code=>event('upi_start_blocked','start-blocked:'+bank.id+':'+code+':'+noticeBucket,{reason:code});
    if(bank.admin_managed){
     if(device.status!=='online')await event('upi_requirement_notice','setup-notice:'+bank.id+':apk:'+noticeBucket,{reason:'APK_NOT_READY'});
     if(bank.statement_required&&!bank.statement_ready)await event('upi_requirement_notice','setup-notice:'+bank.id+':statement:'+noticeBucket,{reason:'STATEMENT_MISSING'});
    }
    if(device.sourceConnected&&device.status==='online'&&!decision.unknown&&state.last_offline_at){
     await event('device_online','online:'+bank.id+':'+state.last_offline_at.toISOString());
     await c.query('UPDATE wpay_auth.notification_bot_watches SET last_offline_at=NULL WHERE bank_id=$1',[bank.id]);
    }
    if(decision.offlineReminder&&(!state.last_offline_at||now-+state.last_offline_at>=settings.offlineReminderMs)){
     await event('device_offline','offline:'+bank.id+':'+Math.floor(now/settings.offlineReminderMs));await c.query('UPDATE wpay_auth.notification_bot_watches SET last_offline_at=CURRENT_TIMESTAMP WHERE bank_id=$1',[bank.id]);
    }
    if(decision.statementReminder&&(!state.last_pending_at||now-+state.last_pending_at>=settings.statementReminderMs)){
     const bucket=Math.floor(now/settings.statementReminderMs);await event('statement_required','statement:'+bank.id+':'+bucket);
     for(const claim of claims.slice(0,20))await this.enqueue(c,{key:'claim-reminder:'+claim.id+':'+bucket,kind:'claim_pending',accountId:bank.owner_id,entityId:claim.id,tenant:bank.tenant_id});
     await c.query('UPDATE wpay_auth.notification_bot_watches SET last_pending_at=CURRENT_TIMESTAMP WHERE bank_id=$1',[bank.id]);
    }
    if(state.auto_stop?.adminOverride){
     if(!decision.overrideActive){
      let recovered=true;
      if(!bank.admin_managed){
       if(bank.verified_version!==bank.version){recovered=false;await blocked('VERIFICATION_REQUIRED');}
       else try{await require('../onboarding/state').canStart(c,bank);}catch(error){recovered=false;await blocked(error.code||'START_BLOCKED');}
      }
      if(recovered)await c.query('UPDATE wpay_auth.notification_bot_watches SET auto_stop=NULL WHERE bank_id=$1',[bank.id]);
     }
     return;
    }
    if(state.auto_stop&&decision.reasons.includes('pending_utr')&&!state.auto_stop.reasons.includes('pending_utr')){
     state.auto_stop.reasons.push('pending_utr');await c.query('UPDATE wpay_auth.notification_bot_watches SET auto_stop=$2 WHERE bank_id=$1',[bank.id,state.auto_stop]);
    }
    if(decision.stop){
     const reason='notification:'+randomUUID();
     const updated=(await c.query("UPDATE wpay_auth.business_bank_accounts SET status='stopped',reason=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING updated_at",[bank.id,reason])).rows[0];
     await c.query('UPDATE wpay_auth.notification_bot_watches SET auto_stop=$2 WHERE bank_id=$1',[bank.id,{reason,reasons:decision.reasons,bankVersion:bank.version,bankUpdatedAt:updated.updated_at.toISOString()}]);
     await require('../onboarding/state').refresh(c,bank.owner_id);await ledger.audit(c,{ownerId:bank.owner_id,entityId:bank.id,event:'notification_upi_stopped',metadata:{reasons:decision.reasons}});
     await event('upi_auto_stopped',reason,{reason:decision.reasons.includes('pending_utr')?'pending_utr':'device_offline'});
    }else if(decision.restart){
     // Reuse existing start eligibility. Admin-managed exemptions remain intact.
     if(!bank.admin_managed){
      if(bank.verified_version!==bank.version){await blocked('VERIFICATION_REQUIRED');return;}
      try{await require('../onboarding/state').canStart(c,bank);}catch(error){await blocked(error.code||'START_BLOCKED');return;}
     }
     await c.query("UPDATE wpay_auth.business_bank_accounts SET status='running',reason='',updated_at=CURRENT_TIMESTAMP WHERE id=$1",[bank.id]);
     await c.query('UPDATE wpay_auth.notification_bot_watches SET auto_stop=NULL,last_offline_at=NULL,last_pending_at=NULL WHERE bank_id=$1',[bank.id]);
     await require('../onboarding/state').refresh(c,bank.owner_id);await ledger.audit(c,{ownerId:bank.owner_id,entityId:bank.id,event:'notification_upi_restarted'});
     await event('upi_auto_restarted','restart:'+state.auto_stop.reason);
    }else if(state.auto_stop&&(bank.reason!==state.auto_stop.reason||bank.version!==state.auto_stop.bankVersion||bank.updated_at.toISOString()!==state.auto_stop.bankUpdatedAt)){
     // A subsequent Admin/User decision owns the route now. Never override it.
     await c.query('UPDATE wpay_auth.notification_bot_watches SET auto_stop=NULL WHERE bank_id=$1',[bank.id]);
    }
   });
  }
 }
 async tick(context){await this.upgradeRegistrationButtons(context);if(context.isStopped?.())return;await this.monitor(context);if(context.isStopped?.())return;await this.fanout(context);for(let i=0;i<5;i++){if(context.isStopped?.()||!await this.deliver(context))break;}}
}
module.exports={Worker,applies,audience};
