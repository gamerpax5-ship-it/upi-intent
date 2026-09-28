'use strict';
const {Telegram}=require('./transport'),{GroupAccess,controllers,verifySecret,UTR_CONTROLLER_IDS}=require('./access'),{Store}=require('./store'),{Source}=require('./source'),{Bot}=require('./engine'),{parse}=require('./commands');
const PATH='/integrations/telegram/webhook';
const {MENU}=require('./catalog');
const {processJob}=require('./jobs');
function create({pool,pairing,operational,legacy,crypto,env=process.env,onError=()=>{},fetcher}){
 if(!env.TELEGRAM_BOT_TOKEN)return null;
 const token=env.TELEGRAM_BOT_TOKEN,secret=env.TELEGRAM_WEBHOOK_SECRET,origin=env.WPAY_HOSTED_ORIGIN;
 if(!verifySecret(secret,secret))throw Error('TELEGRAM_WEBHOOK_SECRET_INVALID');
 const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw Error('TELEGRAM_ORIGIN_INVALID');
 const ids=controllers(env.TELEGRAM_CONTROLLER_IDS),tenantIds=(env.TELEGRAM_TENANT_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 const telegram=new Telegram({token,fetcher}),store=new Store(pool),source=new Source({pool,pairing,operational,legacy:legacy||(operational?new (require('./credit-reader').CreditReader)(operational):null),crypto,tenantIds});
 let bot,stopped=false,timer,inflight,running=false,wakePending=false;
 function schedule(delay){clearTimeout(timer);timer=setTimeout(()=>{inflight=cycle();},delay);timer.unref();}
 function wake(){if(stopped||!bot)return;wakePending=true;if(!running)schedule(0);}
 async function cycle(){
  if(stopped||running)return;running=true;wakePending=false;
  try{
   for(const job of await store.pending()){
    if(stopped)break;await processJob({job,bot,store,onError});
   }
   if(!stopped)await bot.tick();
  }catch{onError('TELEGRAM_WORKER_FAILED');}
  running=false;if(!stopped)schedule(wakePending?0:5000);
 }
 async function initialize(){
  const me=await telegram.call('getMe');if(!me?.is_bot||!me.username)throw Error('TELEGRAM_IDENTITY_INVALID');
  const readyBot=new Bot({telegram,access:new GroupAccess({telegram,ids,botId:me.id,requireAdmin:false}),store,source,username:me.username,onError});
  await telegram.call('setWebhook',{url:origin+PATH,secret_token:secret,allowed_updates:['message'],max_connections:1});
  await telegram.call('setMyCommands',{commands:MENU});
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
   let recognized=false,utrCommand=false;try{const parsed=parse(m.text,bot.username);recognized=!!parsed;utrCommand=['creditutr','creditutrall'].includes(parsed?.command);}catch{recognized=true;}
   if(recognized&&(utrCommand?UTR_CONTROLLER_IDS:ids).includes(String(m.from.id))){
    // Queue only command metadata, never the surrounding chat or attachments.
    const clean={text:m.text,from:{id:m.from.id,is_bot:false},chat:{id:m.chat.id,type:m.chat.type}};
    await store.accept(update.update_id,clean);
    wake();
   }
  }
  send(res,200,{ok:true});return true;
 }
 return {webhook,start,async stop(){stopped=true;clearTimeout(timer);await inflight;}};
}
module.exports={create,PATH};
