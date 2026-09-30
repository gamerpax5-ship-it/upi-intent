'use strict';
const {timingSafeEqual}=require('node:crypto');
const CONTROLLER_IDS=Object.freeze(['8248339578','8431990409','7925279541','8403294379','7668086423','6749918659']);
const UTR_CONTROLLER_IDS=Object.freeze([...CONTROLLER_IDS]);
function userId(value){const s=String(value??'');if(!/^[1-9][0-9]{0,15}$/.test(s)||!Number.isSafeInteger(Number(s)))throw Error('INVALID_TELEGRAM_USER');return s;}
function controllers(value){const ids=value?value.split(',').map(x=>userId(x.trim())):[...CONTROLLER_IDS];if(!ids.length||new Set(ids).size!==ids.length)throw Error('INVALID_TELEGRAM_CONTROLLERS');return ids;}
function verifySecret(provided,expected){if(typeof expected!=='string'||!/^[A-Za-z0-9_-]{16,256}$/.test(expected)||typeof provided!=='string')return false;const a=Buffer.from(provided),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
const present=member=>['creator','administrator','member'].includes(member?.status)||(member?.status==='restricted'&&member.is_member===true);
class GroupAccess{
 constructor({telegram,ids=CONTROLLER_IDS,botId,requireAdmin=true}){this.telegram=telegram;this.ids=ids.map(userId);this.botId=userId(botId);this.requireAdmin=requireAdmin;}
 async allowed(chat,actorId){
  if(actorId!==undefined&&!this.ids.includes(String(actorId)))return false;
  if(!['group','supergroup'].includes(chat?.type)||!/^-[1-9][0-9]{0,15}$/.test(String(chat.id)))return false;
  // Non-admin mode still requires a successful controller membership lookup.
  // Telegram does not guarantee this lookup for non-admin bots: deny on error.
  let bot;try{bot=await this.telegram.call('getChatMember',{chat_id:chat.id,user_id:this.botId});}catch{return false;}
  if(this.requireAdmin?bot?.status!=='administrator':!present(bot))return false;
  const members=await Promise.allSettled(this.ids.map(id=>this.telegram.call('getChatMember',{chat_id:chat.id,user_id:id})));
  return members.some((r,i)=>(actorId===undefined||this.ids[i]===String(actorId))&&r.status==='fulfilled'&&String(r.value?.user?.id)===this.ids[i]&&present(r.value));
 }
 async allowedUtr(chat,actorId){
  // UTR audience is explicitly fixed, independently of other bot controllers.
  if(actorId!==undefined&&!UTR_CONTROLLER_IDS.includes(String(actorId)))return false;
  if(!['group','supergroup'].includes(chat?.type)||!/^-[1-9][0-9]{0,15}$/.test(String(chat.id)))return false;
  let bot;try{bot=await this.telegram.call('getChatMember',{chat_id:chat.id,user_id:this.botId});}catch{return false;}
  if(this.requireAdmin?bot?.status!=='administrator':!present(bot))return false;
  const results=await Promise.allSettled(UTR_CONTROLLER_IDS.map(id=>this.telegram.call('getChatMember',{chat_id:chat.id,user_id:id})));
  const members=UTR_CONTROLLER_IDS.filter((id,i)=>results[i].status==='fulfilled'&&String(results[i].value?.user?.id)===id&&present(results[i].value));
  return members.length>=2&&(actorId===undefined||members.includes(String(actorId)));
 }
  async allowedActivation(chat,actorId){
  if(actorId===undefined||!UTR_CONTROLLER_IDS.includes(String(actorId)))return false;
  if(!['group','supergroup'].includes(chat?.type)||!/^-[1-9][0-9]{0,15}$/.test(String(chat.id)))return false;
  let bot;try{bot=await this.telegram.call('getChatMember',{chat_id:chat.id,user_id:this.botId});}catch{return false;}
  if(this.requireAdmin?bot?.status!=='administrator':!present(bot))return false;
  try{const member=await this.telegram.call('getChatMember',{chat_id:chat.id,user_id:String(actorId)});return String(member?.user?.id)===String(actorId)&&present(member);}catch{return false;}
 }

 async allowedDetail(chat,actorId){
  if(actorId===undefined||!UTR_CONTROLLER_IDS.includes(String(actorId)))return false;
  if(!['group','supergroup'].includes(chat?.type)||!/^-[1-9][0-9]{0,15}$/.test(String(chat.id)))return false;
  let bot;try{bot=await this.telegram.call('getChatMember',{chat_id:chat.id,user_id:this.botId});}catch{return false;}
  if(this.requireAdmin?bot?.status!=='administrator':!present(bot))return false;
  try{const member=await this.telegram.call('getChatMember',{chat_id:chat.id,user_id:String(actorId)});return String(member?.user?.id)===String(actorId)&&present(member);}catch{return false;}
 }

}
module.exports={CONTROLLER_IDS,UTR_CONTROLLER_IDS,userId,controllers,verifySecret,present,GroupAccess};
