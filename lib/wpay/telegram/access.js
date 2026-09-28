'use strict';
const {timingSafeEqual}=require('node:crypto');
const CONTROLLER_IDS=Object.freeze(['8248339578','8431990409','7925279541','8403294379','7668086423']);
function userId(value){const s=String(value??'');if(!/^[1-9][0-9]{0,15}$/.test(s)||!Number.isSafeInteger(Number(s)))throw Error('INVALID_TELEGRAM_USER');return s;}
function controllers(value){const ids=value?value.split(',').map(x=>userId(x.trim())):[...CONTROLLER_IDS];if(!ids.length||new Set(ids).size!==ids.length)throw Error('INVALID_TELEGRAM_CONTROLLERS');return ids;}
function verifySecret(provided,expected){if(typeof expected!=='string'||!/^[A-Za-z0-9_-]{16,256}$/.test(expected)||typeof provided!=='string')return false;const a=Buffer.from(provided),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
const present=member=>['creator','administrator','member'].includes(member?.status)||(member?.status==='restricted'&&member.is_member===true);
class GroupAccess{
 constructor({telegram,ids=CONTROLLER_IDS,botId}){this.telegram=telegram;this.ids=ids.map(userId);this.botId=userId(botId);}
 async allowed(chat,actorId){
  if(actorId!==undefined&&!this.ids.includes(String(actorId)))return false;
  if(!['group','supergroup'].includes(chat?.type)||!/^-[1-9][0-9]{0,15}$/.test(String(chat.id)))return false;
  // Telegram only guarantees membership lookups when this bot is an Admin.
  let bot;try{bot=await this.telegram.call('getChatMember',{chat_id:chat.id,user_id:this.botId});}catch{return false;}
  if(bot?.status!=='administrator')return false;
  const members=await Promise.allSettled(this.ids.map(id=>this.telegram.call('getChatMember',{chat_id:chat.id,user_id:id})));
  return members.some((r,i)=>(actorId===undefined||this.ids[i]===String(actorId))&&r.status==='fulfilled'&&String(r.value?.user?.id)===this.ids[i]&&present(r.value));
 }
}
module.exports={CONTROLLER_IDS,userId,controllers,verifySecret,present,GroupAccess};
