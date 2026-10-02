'use strict';
const {Telegram,webhookSecret,verifySecret}=require('./transport'),{Access,CONTROLLERS,group,config}=require('./policy'),{Store}=require('./store'),{Bot}=require('./engine'),{MENU}=require('./commands');
const PATH='/integrations/notification-bot/webhook';
function clean(update){
 if(!Number.isSafeInteger(update?.update_id)||update.update_id<0)return null;
 const query=update.callback_query,message=update.message,person=query?.from||message?.from,chat=query?.message?.chat||message?.chat;
 if(!group(chat)||!Number.isSafeInteger(person?.id)||person.id<=0||person.is_bot||message?.sender_chat||message?.forward_origin)return null;
 const identity={id:person.id,is_bot:false,...(typeof person.username==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(person.username)?{username:person.username.toLowerCase()}:{})},room={id:chat.id,type:chat.type};
 if(query){if(typeof query.id!=='string'||query.id.length>160||typeof query.data!=='string'||!/^nb:(?:(reset|received):[A-Za-z0-9_-]{32}|bind:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|review:[A-Za-z0-9_-]{32}:(?:approve|reject)|reviewid:[0-9a-f-]{36}:(?:confirm|cancel))$/.test(query.data)||!Number.isSafeInteger(query.message?.message_id))return null;
  return {callback_query:{id:query.id,data:query.data,from:identity,message:{chat:room,message_id:query.message.message_id}}};
 }
 if(!CONTROLLERS.includes(String(person.id))||typeof message?.text!=='string'||message.text.length>1200)return null;
 const replyId=message.reply_to_message?.message_id;
 if(!message.text.startsWith('/')&&!Number.isSafeInteger(replyId))return null;
 return {message:{text:message.text,from:identity,chat:room,...(Number.isSafeInteger(replyId)?{reply_to_message:{message_id:replyId}}:{})}};
}
function create({pool,gateway,crypto,source,worker,env=process.env,fetcher,onError=()=>{}}){
 const token=env.WPAY_NOTIFICATION_BOT_TOKEN;if(!token)return null;
 if(token===env.TELEGRAM_BOT_TOKEN)throw Error('NOTIFICATION_TOKEN_MUST_BE_SEPARATE');
 const origin=env.WPAY_HOSTED_ORIGIN,url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw Error('NOTIFICATION_ORIGIN_INVALID');
 const settings=config(env),telegram=new Telegram({token,fetcher}),secret=webhookSecret(token),store=new Store(pool);
 let bot,stopped=false,timer,inflight,running=false;
 const tenantConfig=(env.WPAY_NOTIFICATION_TENANT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
 async function tenants(){
  if(tenantConfig.length){if(tenantConfig.some(t=>!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(t)))throw Error('NOTIFICATION_SCOPE_INVALID');return [...new Set(tenantConfig)];}
  const rows=(await pool.query("SELECT DISTINCT tenant_id FROM wpay_auth.accounts WHERE status='active' ORDER BY tenant_id LIMIT 2")).rows;
  if(rows.length!==1)throw Error('NOTIFICATION_TENANT_SCOPE_REQUIRED');return [rows[0].tenant_id];
 }
 function schedule(ms){clearTimeout(timer);if(!stopped){timer=setTimeout(()=>{inflight=cycle();},ms);timer.unref();}}
 async function cycle(){
  if(stopped||running||!bot)return;running=true;
  try{
   for(const job of await store.pending()){
    if(stopped)break;
    await pool.query('UPDATE wpay_auth.notification_bot_updates SET attempts=attempts+1 WHERE update_id=$1',[job.update_id]);
    try{
     const q=job.payload.callback_query;
     if(q){const accepted=await(q.data.startsWith('nb:reset:')?bot.reset(q,job.update_id):q.data.startsWith('nb:bind:')?bot.bindUsername(q,job.update_id):q.data.startsWith('nb:review:')||q.data.startsWith('nb:reviewid:')?bot.review(q,job.update_id):bot.received(q,job.update_id));if(!accepted)await telegram.call('answerCallbackQuery',{callback_query_id:q.id,text:'This action is not available to this account or membership could not be verified.'});}
     else if(job.payload.message.text.startsWith('/'))await bot.command(job.payload.message,job.update_id);else await bot.reviewReply(job.payload.message,job.update_id);
     await pool.query('UPDATE wpay_auth.notification_bot_updates SET processed=true WHERE update_id=$1',[job.update_id]);
    }catch(error){
     onError('NOTIFICATION_UPDATE_FAILED');
     const messages={INVALID_COMMAND_ARGUMENTS:'Check command arguments. /setuser email Telegram-ID',INVALID_EMAIL:'Enter a valid WPay account email.',INVALID_TELEGRAM_ID:'Enter a valid numerical Telegram ID.',INVALID_PAGE:'Enter a valid page number.',INVALID_UPI:'Enter a valid UPI ID.',ACCOUNT_NOT_FOUND:'Account not found in the permitted scope.',RESET_GROUP_FIRST:'Group role conflict. Use /resetgroup and confirm before changing its role.',MAPPING_NOT_FOUND:'That mapping does not exist.',MAPPING_ALREADY_EXISTS:'That Telegram ID is already mapped.',GROUP_MAPPING_LIMIT:'Group mapping limit reached.',USER_MUST_BE_GROUP_MEMBER:'The target User must be a member of this group; the bot must be an administrator.',CONTROLLER_CANNOT_RECEIVE:'Controller IDs cannot be mapped as payment receivers.',ADMIN_GROUP_REQUIRED:'This command requires an Admin notification group.',UPI_NOT_FOUND_OR_AMBIGUOUS:'UPI not found or ambiguous within this group.',RECEIVED_DENIED:'Only the current mapped receiving User can confirm this payment.',RESET_DENIED:'Reset expired or is not authorized. Request /resetgroup again.',UTR_ALREADY_USED:'This UTR was already used. No money was credited again.',PAYMENT_CONFLICT:'Payment state changed. No confirmation was applied.',PAYMENT_REJECTED:'This payment is rejected or cancelled. No confirmation was applied.',PAYMENT_CONFIRMED_WITH_DIFFERENT_UTR:'Payment already confirmed with a different UTR.',ADMIN_BINDING_REQUIRED:'Bind a real WPay Admin to this notification group first: /setadmin admin@email.com',ADMIN_BINDING_NOT_AUTHORIZED:'The bound WPay Admin does not have permission for this approval.',REVIEW_UNAVAILABLE:'This registration review is no longer pending or has expired.',REVIEW_IN_PROGRESS:'Another authorized controller is already editing this review.',REVIEW_FORM_INVALID:'The form reply is invalid. Reply to the bot prompt using the exact requested format.',REVIEW_CONFLICT:'The account state changed before approval could be applied.',REVIEW_PROMPT_FAILED:'Could not open the Telegram review form. Try the registration button again.'};
     const notice=({INVALID_COMMAND_ARGUMENTS:'Use /setuser email @username1 @username2 (up to 10 usernames).',INVALID_TELEGRAM_USERNAME:'Use a Telegram @username, not a display name.',INVALID_TELEGRAM_ID:'Use /setuser email @username1 @username2.',USER_MUST_BE_GROUP_MEMBER:'The target User and bot must be group members with messaging allowed. Membership could not be verified.',USERNAME_BIND_DENIED:'Only the invited Telegram account can connect this username. Existing connections cannot be transferred.',USERNAME_BIND_EXPIRED:'Connection invitation expired. Ask a controller to repeat /setuser.',UPI_UNAVAILABLE:'This account is not currently eligible for UPI status.'})[error.message]||messages[error.message];if(notice){
      await pool.query('UPDATE wpay_auth.notification_bot_updates SET processed=true WHERE update_id=$1',[job.update_id]);
      try{if(job.payload.callback_query)await telegram.call('answerCallbackQuery',{callback_query_id:job.payload.callback_query.id,text:notice.slice(0,200),show_alert:true});
       else if(await bot.access.controller(job.payload.message.chat,job.payload.message.from.id))await telegram.text(job.payload.message.chat.id,notice);
      }catch{onError('NOTIFICATION_REPLY_FAILED');}
     }
    }
   }
   if(!stopped&&worker)await worker.tick({pool,store,telegram,access:bot.access,tenants:await tenants(),settings,crypto,gateway,fixedCurrency:env.WPAY_HOSTED_FIXED_FEE_CURRENCY,isStopped:()=>stopped});
  }catch{onError('NOTIFICATION_WORKER_FAILED');}finally{running=false;schedule(5000);}
 }
 async function start(){
  if(stopped)return;
  try{
   await pool.query('SELECT 1 FROM wpay_auth.notification_bot_groups LIMIT 1');await tenants();
   const me=await telegram.call('getMe');if(!me?.is_bot||!me.username)throw Error('NOTIFICATION_IDENTITY_INVALID');
   const next=new Bot({store,access:new Access({telegram,botId:me.id,allowMemberBot:true}),telegram,username:me.username,tenants,source,gateway,crypto,fixedCurrency:env.WPAY_HOSTED_FIXED_FEE_CURRENCY});
   await telegram.call('setWebhook',{url:origin+PATH,secret_token:secret,allowed_updates:['message','callback_query'],max_connections:1});
   await telegram.call('setMyCommands',{commands:MENU});if(stopped)return;bot=next;inflight=cycle();
  }catch{onError('NOTIFICATION_START_FAILED');if(!stopped){timer=setTimeout(()=>{inflight=start();},30000);timer.unref();}}
 }
 async function webhook(req,res,{readBody,send}){
  if(req.url===PATH+'/health'&&req.method==='GET'){send(res,bot?200:503,{ready:!!bot});return true;}
  if(req.url!==PATH)return false;
  if(req.method!=='POST'){send(res,405,{ok:false});return true;}
  if(!verifySecret(req.headers['x-telegram-bot-api-secret-token'],secret)){send(res,403,{ok:false});return true;}
  if(!bot){send(res,503,{ok:false});return true;}
  const update=await readBody(req,32768),payload=clean(update);
  if(payload)await store.accept(update.update_id,payload);
  send(res,200,{ok:true});if(payload&&!running)schedule(0);return true;
 }
 return {webhook,start,async stop(){stopped=true;clearTimeout(timer);await inflight;}};
}
module.exports={create,clean,PATH};
