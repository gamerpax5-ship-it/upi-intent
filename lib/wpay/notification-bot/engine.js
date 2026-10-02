'use strict';
const {parse}=require('./commands');
const {change,requestReset,confirmReset}=require('./mappings');
const {fail}=require('./policy');
const {text:plain}=require('./format');
// Eight maximum-length name/email pairs stay below Telegram's message limit.
const PAGE=8;
class Bot{
 constructor({store,access,telegram,username,tenants,source,gateway,crypto,fixedCurrency}){Object.assign(this,{store,access,telegram,username,tenants,source,gateway,crypto,fixedCurrency});}
 async command(message,updateId){
  if(message?.from?.is_bot||message?.sender_chat||message?.forward_origin||!await this.access.controller(message?.chat,message?.from?.id))return;
  const command=parse(message.text,this.username);if(!command)return;
  // Membership is checked before and after the locked state transition. SQL
  // predicates still scope every account lookup to the configured tenant(s).
  const scopes=await this.tenants();
  const response=await this.store.group(message.chat,scopes,async(c,current)=>{
   if(await this.store.processed(c,updateId))return null;
   let text,markup;
   if(['setuser','removeuser','resetuser','setmerchant','setadmin'].includes(command.command)){
    const role=command.command==='setmerchant'?'merchant':'user';
    const account=command.command==='setadmin'?(command.email?await this.store.adminAccount(c,command.email,scopes):null):(command.email?await this.store.account(c,command.email,role,scopes):null);
    if(['setuser','resetuser'].includes(command.command)&&command.telegramId&&!await this.access.receiver(message.chat,command.telegramId))fail('USER_MUST_BE_GROUP_MEMBER');
    const result=change(current.state,command,account,message.from.id);
    if(result.changed)await this.store.save(c,current,result.state,message.from.id,command.command);
    if(result.changed&&['setuser','resetuser'].includes(command.command))await c.query('INSERT INTO wpay_auth.notification_bot_watches(bank_id) SELECT id FROM wpay_auth.business_bank_accounts WHERE owner_id=$1 ON CONFLICT(bank_id) DO UPDATE SET next_check_at=CURRENT_TIMESTAMP',[account.id]);
    text=command.command==='setadmin'?(command.email?'Admin notification group configured. Approval actor: '+plain(account.email,254)+'. User/Merchant reviews will stay in this Telegram group.':'Admin notification group configured. To approve User/Merchant registrations inside Telegram, bind a WPay Admin once: /setadmin admin@email.com'):(result.changed?'Mapping updated. Other mappings unchanged.':'Mapping already configured; no changes.');
    if(command.usernames||command.command==='resetuser'&&command.telegramUsername){
     const names=command.usernames||[command.telegramUsername];markup=require('./usernames').buttons(result.state,account.id,names);
     text+='\n'+plain(account.email,254)+' → '+names.map(n=>'@'+n).join(', ');
     text+=markup?'\nEach invited person: tap your Connect button within 24 hours. This links identity only; it does not confirm a payment.':'\nAlready connected. Existing Telegram accounts remain linked.';
    }
   }else if(command.command==='resetgroup'){
    const reset=requestReset(current.state,message.from.id);
    await this.store.save(c,current,reset.state,message.from.id,'reset_requested');
    text='Reset all mappings in this group? Existing Received buttons will no longer work. Confirm within 2 minutes.';
    markup={inline_keyboard:[[{text:'Confirm group reset',callback_data:'nb:reset:'+reset.token}]]};
   }else if(command.command==='mappings'){
    const start=(command.page-1)*PAGE,rows=current.state.mappings.slice(start,start+PAGE);
    const values=[];for(const row of rows){const a=(await c.query('SELECT email FROM wpay_auth.accounts WHERE id=$1 AND tenant_id=ANY($2)',[row.accountId,scopes])).rows[0];if(a)values.push(plain(a.email,254)+(row.telegramUsername?' → @'+row.telegramUsername+(row.telegramId?' · Connected':' · Awaiting connection'):row.telegramId?' → '+row.telegramId:''));}
    text='Group: '+(current.state.role||'unconfigured')+' | Page '+command.page+'\n'+(values.join('\n')||'No mappings on this page.');
   }else if(['users','merchants'].includes(command.command)){
    if(current.state.role!=='admin')fail('ADMIN_GROUP_REQUIRED');
    const type=command.command==='users'?'user':'merchant';
    const rows=(await c.query('SELECT name,email FROM wpay_auth.accounts WHERE account_type=$1 AND tenant_id=ANY($2) ORDER BY email,id LIMIT $3 OFFSET $4',[type,scopes,PAGE,(command.page-1)*PAGE])).rows;
    text='WPay '+command.command+' | Page '+command.page+'\n'+(rows.map(r=>plain(r.name,100)+' — '+plain(r.email,254)).join('\n')||'No accounts on this page.');
   }else if(command.command==='status'){
    if(!this.source)fail('STATUS_NOT_AVAILABLE');text=await this.source.status(c,current,command.upi);
   }
   if(!await this.access.controller(message.chat,message.from.id))fail('GROUP_ACCESS_CHANGED');
   await this.store.mark(c,updateId);return {text,markup};
  });
  if(response&&await this.access.controller(message.chat,message.from.id))await this.telegram.text(message.chat.id,response.text,response.markup);
 }

 async review(query,updateId){
  const chat=query?.message?.chat,actor=query?.from?.id,data=query?.data||'';
  if(query?.from?.is_bot||!await this.access.controller(chat,actor))return false;
  let initial=/^nb:review:([A-Za-z0-9_-]{32}):(approve|reject)$/.exec(data),final=/^nb:reviewid:([0-9a-f-]{36}):(confirm|cancel)$/.exec(data);
  if(!initial&&!final)return false;
  const scopes=await this.tenants(),fmt=require('./format'),reviewer=require('./account-review');
  const result=await this.store.group(chat,scopes,async(c,current)=>{
   if(await this.store.processed(c,updateId))return null;if(current.state.role!=='admin')fail('ADMIN_GROUP_REQUIRED');
   if(initial){
    const review=await reviewer.byToken(c,initial[1],chat.id,true);if(!review||review.approval_status!=='pending')fail('REVIEW_UNAVAILABLE');
    const bound=await reviewer.admin(c,current.state.adminAccountId,scopes);if(!bound)fail('ADMIN_BINDING_REQUIRED');
    const account=await reviewer.target(c,review.account_id,scopes);if(!account)fail('REVIEW_UNAVAILABLE');const defaults=await reviewer.defaults(c,account,this.fixedCurrency),started=await reviewer.begin(c,review,actor,initial[2],defaults);
    const prompt=initial[2]==='approve'?fmt.approvalPrompt(account,defaults):fmt.rejectPrompt(account),sent=await this.telegram.text(chat.id,prompt,{force_reply:true,input_field_placeholder:initial[2]==='approve'?'Reply with the requested | separated values':'Reply with rejection reason'});
    if(!Number.isSafeInteger(sent?.message_id))fail('REVIEW_PROMPT_FAILED');await reviewer.setPrompt(c,started.id,sent.message_id);await this.store.mark(c,updateId);
    return {kind:'prompt',mode:initial[2]};
   }
   const review=await reviewer.byId(c,final[1],chat.id,true);if(!review)fail('REVIEW_UNAVAILABLE');
   if(final[2]==='cancel'){await reviewer.cancel(c,review,actor);await this.store.mark(c,updateId);return {kind:'cancel',review};}
   const applied=await reviewer.apply(c,{review,actor,current,tenants:scopes,fixedCurrency:this.fixedCurrency});await this.store.mark(c,updateId);return {kind:'done',review,applied};
  });
  if(!result)return true;
  if(result.kind==='prompt')await this.telegram.call('answerCallbackQuery',{callback_query_id:query.id,text:'Reply to the form message in this group.',show_alert:true});
  else if(result.kind==='cancel'){await this.telegram.call('answerCallbackQuery',{callback_query_id:query.id,text:'Review cancelled.'});await this.telegram.call('editMessageText',{chat_id:chat.id,message_id:query.message.message_id,text:'Review cancelled. Use the original registration Approve / Reject buttons to restart.',reply_markup:{inline_keyboard:[]}});}
  else {await this.telegram.call('answerCallbackQuery',{callback_query_id:query.id,text:result.applied.status==='approved'?'Account approved.':'Account rejected.',show_alert:true});const m=result.review.notification_message_id;if(m)await this.telegram.call('editMessageText',{chat_id:chat.id,message_id:Number(m),text:fmt.approvalDone(result.applied.account,result.applied.status),reply_markup:{inline_keyboard:[]}});}
  return true;
 }
 async reviewReply(message,updateId){
  if(message?.from?.is_bot||!Number.isSafeInteger(message?.reply_to_message?.message_id)||!await this.access.controller(message?.chat,message?.from?.id))return false;
  const scopes=await this.tenants(),fmt=require('./format'),reviewer=require('./account-review');
  const result=await this.store.group(message.chat,scopes,async(c,current)=>{
   if(await this.store.processed(c,updateId))return null;if(current.state.role!=='admin')fail('ADMIN_GROUP_REQUIRED');
   const row=await reviewer.acceptReply(c,{chatId:message.chat.id,actor:message.from.id,replyTo:message.reply_to_message.message_id,text:message.text,fixedCurrency:this.fixedCurrency});if(!row)return null;
   const account=await reviewer.target(c,row.account_id,scopes);if(!account)fail('REVIEW_UNAVAILABLE');await this.store.mark(c,updateId);
   return {row,account};
  });
  if(!result)return false;const mode=result.row.state==='confirm_reject'?'reject':'approve';
  await this.telegram.text(message.chat.id,fmt.approvalDraft(result.account,result.row.draft,mode),{inline_keyboard:[[{text:mode==='approve'?'Confirm Approve':'Confirm Reject',callback_data:'nb:reviewid:'+result.row.id+':confirm'},{text:'Cancel',callback_data:'nb:reviewid:'+result.row.id+':cancel'}]]});return true;
 }
 async bindUsername(query,updateId){
  const chat=query?.message?.chat;
  if(!/^nb:bind:[0-9a-f-]{36}$/.test(query?.data||'')||query?.from?.is_bot||!await this.access.receiver(chat,query?.from?.id))return false;
  const tenants=await this.tenants();
  const connected=await this.store.group(chat,tenants,async(c,current)=>{
   if(await this.store.processed(c,updateId))return false;
   const result=require('./usernames').bind(current.state,query.data.slice(8),query.from);
   if(!(await c.query("SELECT 1 FROM wpay_auth.accounts WHERE id=$1 AND tenant_id=ANY($2) AND account_type='user' AND status='active'",[result.accountId,tenants])).rowCount)fail('USERNAME_BIND_DENIED');
   if(!await this.access.receiver(chat,query.from.id))fail('USERNAME_BIND_DENIED');
   if(result.changed){await this.store.save(c,current,result.state,query.from.id,'username_connected');await c.query('INSERT INTO wpay_auth.notification_bot_watches(bank_id) SELECT id FROM wpay_auth.business_bank_accounts WHERE owner_id=$1 ON CONFLICT(bank_id) DO UPDATE SET next_check_at=CURRENT_TIMESTAMP,last_pending_at=NULL',[result.accountId]);}
   await this.store.mark(c,updateId);return true;
  });
  if(connected)await this.telegram.call('answerCallbackQuery',{callback_query_id:query.id,text:'Connected. Your Telegram account is linked; no payment was confirmed.',show_alert:true});
  return connected;
 }
 async reset(query,updateId){
  const chat=query?.message?.chat,actor=query?.from?.id;
  if(query?.from?.is_bot||!await this.access.controller(chat,actor))return false;
  if(typeof query.data!=='string'||!/^nb:reset:[A-Za-z0-9_-]{32}$/.test(query.data))return false;
  const result=await this.store.group(chat,await this.tenants(),async(c,current)=>{
   if(await this.store.processed(c,updateId))return false;
   const state=confirmReset(current.state,actor,query.data.slice(9));
   if(!await this.access.controller(chat,actor))fail('GROUP_ACCESS_CHANGED');
   await this.store.save(c,current,state,actor,'reset_confirmed');await this.store.mark(c,updateId);return true;
  });
  if(result)await this.telegram.call('answerCallbackQuery',{callback_query_id:query.id,text:'Group mappings reset.'});
  return result;
 }
 async received(query,updateId){
  if(query?.from?.is_bot||!await this.access.receiver(query?.message?.chat,query?.from?.id))return false;
  const tenants=await this.tenants(),chat=query.message.chat;
  const result=await this.store.group(chat,tenants,async(c,current)=>{
   if(await this.store.processed(c,updateId))return null;
   const value=await require('./received').confirm({c,current,query,access:this.access,gateway:this.gateway,crypto:this.crypto,tenants});
   await this.store.mark(c,updateId);return value;
  });
  if(!result)return false;
  const callback=(await this.store.pool.query("SELECT state FROM wpay_auth.gateway_outbox WHERE order_id=$1 AND event_type IN('payment.success','payment.recovered') ORDER BY created_at DESC LIMIT 1",[result.orderId])).rows[0];
  if(await this.access.receiver(chat,query.from.id)){
   await this.telegram.call('answerCallbackQuery',{callback_query_id:query.id,text:'Payment Successful. Callback '+(callback?.state==='delivered'?'sent.':'pending delivery.')});
   await this.telegram.call('editMessageText',{chat_id:chat.id,message_id:query.message.message_id,text:require('./format').callbackResult({utr:result.utr,amountMinor:result.amountMinor,paymentStatus:'successful',callbackStatus:callback?.state}),reply_markup:{inline_keyboard:[]}});
  }
  return true;
 }
}
module.exports={Bot};
