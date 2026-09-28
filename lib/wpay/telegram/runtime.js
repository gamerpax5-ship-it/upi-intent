'use strict';
const {Telegram}=require('./transport'),{GroupAccess,controllers,verifySecret}=require('./access'),{Store}=require('./store'),{Source}=require('./source'),{Bot}=require('./engine'),{parse}=require('./commands');
const PATH='/integrations/telegram/webhook';
function create({pool,pairing,operational,legacy,env=process.env,onError=()=>{},fetcher}){
 if(!env.TELEGRAM_BOT_TOKEN)return null;
 const token=env.TELEGRAM_BOT_TOKEN,secret=env.TELEGRAM_WEBHOOK_SECRET,origin=env.WPAY_HOSTED_ORIGIN;
 if(!verifySecret(secret,secret))throw Error('TELEGRAM_WEBHOOK_SECRET_INVALID');
 const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw Error('TELEGRAM_ORIGIN_INVALID');
 const ids=controllers(env.TELEGRAM_CONTROLLER_IDS),tenantIds=(env.TELEGRAM_TENANT_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 const telegram=new Telegram({token,fetcher}),store=new Store(pool),source=new Source({pool,pairing,operational,legacy:legacy||(operational?new (require('./credit-reader').CreditReader)(operational):null),tenantIds});
 let bot,stopped=false,timer,inflight;
 async function cycle(){
  if(stopped)return;
  try{
   for(const job of await store.pending()){
    if(stopped)break;await store.attempt(job.update_id);
    try{await bot.command(job.message,job.update_id);await store.markProcessed(job.update_id);}catch(e){
     const known=['DEVICE_NUMBER_NOT_FOUND','AMBIGUOUS_DEVICE_NUMBER','DEVICE_SOURCE_UNAVAILABLE','MASKED_EVENT_SOURCE_UNAVAILABLE','UTR_SOURCE_UNAVAILABLE','VERIFIED_UPI_SOURCE_MAPPING_REQUIRED','TELEGRAM_TENANT_SCOPE_REQUIRED'];
     if(known.includes(e.message)){await bot.send(job.message.chat,e.message.replaceAll('_',' ')).catch(()=>{});await store.markProcessed(job.update_id);}else onError('TELEGRAM_COMMAND_FAILED');
    }
   }
   if(!stopped)await bot.tick();
  }catch{onError('TELEGRAM_WORKER_FAILED');}
  if(!stopped){timer=setTimeout(()=>{inflight=cycle();},15000);timer.unref();}
 }
 async function initialize(){
  const me=await telegram.call('getMe');if(!me?.is_bot||!me.username)throw Error('TELEGRAM_IDENTITY_INVALID');
  const readyBot=new Bot({telegram,access:new GroupAccess({telegram,ids,botId:me.id}),store,source,username:me.username,onError});
  await telegram.call('setWebhook',{url:origin+PATH,secret_token:secret,allowed_updates:['message'],max_connections:1});
  await telegram.call('setMyCommands',{commands:[['status','Device status'],['location','Last reported location'],['connect','Masked event notifications for number'],['disconnect','Stop masked notifications for number or all'],['device','Use /device history number'],['devicehistoryall','Device history updates'],['connectall','Masked events for all authorized devices'],['creditutr','Captured credits for UPI'],['creditutrall','Continuous captured credit notifications'],['ceditutrall','Alias for creditutrall'],['stopall','Stop every stream in this group'],['help','Command list']].map(([command,description])=>({command,description}))});
  bot=readyBot;inflight=cycle();
 }
 async function start(){
  if(stopped)return;
  try{await initialize();}catch{onError('TELEGRAM_START_FAILED');if(!stopped){timer=setTimeout(()=>{inflight=start();},30000);timer.unref();}}
 }
 async function webhook(req,res,{readBody,send}){
  if(req.url===PATH+'/health'&&req.method==='GET'){send(res,bot?200:503,{ready:!!bot});return true;}
  if(req.url!==PATH)return false;
  if(req.method!=='POST'){send(res,405,{ok:false});return true;}
  if(!verifySecret(req.headers['x-telegram-bot-api-secret-token'],secret)){send(res,403,{ok:false});return true;}
  if(!bot){send(res,503,{ok:false});return true;}
  const update=await readBody(req,65536),m=update.message;
  if(!Number.isSafeInteger(update.update_id)||update.update_id<0){send(res,400,{ok:false});return true;}
  if(m?.from&&!m.from.is_bot&&!m.sender_chat&&!m.forward_origin&&['group','supergroup'].includes(m.chat?.type)&&Number.isSafeInteger(m.chat.id)&&m.chat.id<0&&Number.isSafeInteger(m.from.id)&&typeof m.text==='string'&&m.text.length<=300){
   let recognized=false;try{recognized=!!parse(m.text,bot.username);}catch{recognized=true;}
   if(recognized&&ids.includes(String(m.from.id))){
    // Queue only command metadata, never the surrounding chat or attachments.
    const clean={text:m.text,from:{id:m.from.id,is_bot:false},chat:{id:m.chat.id,type:m.chat.type}};
    await store.accept(update.update_id,clean);
   }
  }
  send(res,200,{ok:true});return true;
 }
 return {webhook,start,async stop(){stopped=true;clearTimeout(timer);await inflight;}};
}
module.exports={create,PATH};
