'use strict';
const {parse}=require('./commands');
const {change,requestReset,confirmReset}=require('./mappings');
const {fail}=require('./policy');
const {text:plain}=require('./format');
// Eight maximum-length name/email pairs stay below Telegram's message limit.
const PAGE=8;
class Bot{
 constructor({store,access,telegram,username,tenants,source,gateway,crypto}){Object.assign(this,{store,access,telegram,username,tenants,source,gateway,crypto});}
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
    const account=command.email?await this.store.account(c,command.email,role,scopes):null;
    if(['setuser','resetuser'].includes(command.command)&&!await this.access.receiver(message.chat,command.telegramId))fail('USER_MUST_BE_GROUP_MEMBER');
    const result=change(current.state,command,account,message.from.id);
    if(result.changed)await this.store.save(c,current,result.state,message.from.id,command.command);
    if(result.changed&&['setuser','resetuser'].includes(command.command))await c.query('INSERT INTO wpay_auth.notification_bot_watches(bank_id) SELECT id FROM wpay_auth.business_bank_accounts WHERE owner_id=$1 ON CONFLICT(bank_id) DO UPDATE SET next_check_at=CURRENT_TIMESTAMP',[account.id]);
    text=result.changed?'Mapping updated. Other mappings unchanged.':'Mapping already configured; no changes.';
   }else if(command.command==='resetgroup'){
    const reset=requestReset(current.state,message.from.id);
    await this.store.save(c,current,reset.state,message.from.id,'reset_requested');
    text='Reset all mappings in this group? Existing Received buttons will no longer work. Confirm within 2 minutes.';
    markup={inline_keyboard:[[{text:'Confirm group reset',callback_data:'nb:reset:'+reset.token}]]};
   }else if(command.command==='mappings'){
    const start=(command.page-1)*PAGE,rows=current.state.mappings.slice(start,start+PAGE);
    const values=[];for(const row of rows){const a=(await c.query('SELECT email FROM wpay_auth.accounts WHERE id=$1 AND tenant_id=ANY($2)',[row.accountId,scopes])).rows[0];if(a)values.push(plain(a.email,254)+(row.telegramId?' → '+row.telegramId:''));}
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
