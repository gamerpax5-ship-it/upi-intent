'use strict';
const {timingSafeEqual}=require('node:crypto');
const {Telegram}=require('./transport'),{Store}=require('./store'),{Source}=require('./source'),{Bot}=require('./engine'),{parse}=require('./commands'),{parseControllers,isController}=require('./access'),{processJob}=require('./jobs'),{MENU}=require('./catalog');
const PATH='/integrations/wpay-ledger-bot/webhook';
function secretOk(provided,expected){if(typeof expected!=='string'||expected.length<16||typeof provided!=='string')return false;const a=Buffer.from(provided),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
function create({pool,crypto=null,env=process.env,fetcher,onError=()=>{}}){
 const token=env.WPAY_LADGER_BOT_TOKEN,secret=env.WPAY_LADGER_BOT_WEBHOOK_SECRET||env.TELEGRAM_WEBHOOK_SECRET,origin=env.WPAY_HOSTED_ORIGIN;if(!token)return null;if(!secretOk(secret,secret))throw Error('BALANCE_BOT_SECRET_INVALID');
 const u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin)throw Error('BALANCE_BOT_ORIGIN_INVALID');const controllerIds=parseControllers(env.WPAY_LADGER_BOT_CONTROLLER_IDS);
 const telegram=new Telegram({token,fetcher}),store=new Store(pool),source=new Source({pool,crypto});let bot,timer,inflight,running=false,stopped=false,wakePending=false,starting=false;
 const schedule=delay=>{clearTimeout(timer);timer=setTimeout(()=>{inflight=cycle();},delay);timer.unref?.();};
 const wake=()=>{if(stopped||!bot)return;wakePending=true;if(!running)schedule(0);};
 async function cycle(){if(stopped||running)return;running=true;wakePending=false;try{for(const job of await store.pending()){if(stopped)break;await processJob({job,bot,store,onError});}}catch{onError('BALANCE_BOT_WORKER_FAILED');}running=false;if(!stopped&&bot)schedule(wakePending?0:3000);}
 async function initialize(){const me=await telegram.call('getMe');if(!me?.is_bot||!me.username)throw Error('BALANCE_BOT_IDENTITY_INVALID');const ready=new Bot({telegram,store,source,username:me.username,controllerIds});await telegram.call('setWebhook',{url:origin+PATH,secret_token:secret,allowed_updates:['message'],max_connections:1});await telegram.call('setMyCommands',{commands:MENU});bot=ready;inflight=cycle();}
 async function start(){if(stopped||starting||bot)return;starting=true;try{await initialize();}catch{onError('BALANCE_BOT_START_FAILED');if(!stopped){clearTimeout(timer);timer=setTimeout(()=>{start().catch(()=>{});},30000);timer.unref?.();}}finally{starting=false;}}
 async function webhook(req,res,{readBody,send}){
  if(req.url===PATH+'/health'&&req.method==='GET'){send(res,bot?200:503,{ready:!!bot});return true;}if(req.url!==PATH)return false;if(req.method!=='POST'){send(res,405,{ok:false});return true;}if(!secretOk(req.headers['x-telegram-bot-api-secret-token'],secret)){send(res,403,{ok:false});return true;}if(!bot){send(res,503,{ok:false});return true;}
  const update=await readBody(req,65536),m=update.message;if(!Number.isSafeInteger(update.update_id)||update.update_id<0){send(res,400,{ok:false});return true;}
  if(m?.from&&!m.from.is_bot&&!m.sender_chat&&!m.forward_origin&&['group','supergroup'].includes(m.chat?.type)&&Number.isSafeInteger(m.chat.id)&&m.chat.id<0&&Number.isSafeInteger(m.from.id)&&isController(controllerIds,m.from.id)&&typeof m.text==='string'&&m.text.length<=300){let recognized=false;try{recognized=!!parse(m.text,bot.username);}catch{recognized=true;}if(recognized){await store.accept(update.update_id,{text:m.text,from:{id:m.from.id,is_bot:false},chat:{id:m.chat.id,type:m.chat.type}});wake();}}
  send(res,200,{ok:true});return true;
 }
 return {PATH,start,webhook,async stop(){stopped=true;clearTimeout(timer);await inflight;},controllerIds};
}
module.exports={create,PATH,secretOk};