'use strict';
// This module has no dependency on the existing Telegram bot or OTP modules.
const CONTROLLERS=Object.freeze(['8248339578','8431990409','7925279541','8403294379','7668086423','6749918659']);
const fail=code=>{throw Error(code);};
function id(value){const text=String(value??'');if(!/^[1-9][0-9]{0,15}$/.test(text)||!Number.isSafeInteger(Number(text)))fail('INVALID_TELEGRAM_ID');return text;}
function group(chat){return ['group','supergroup'].includes(chat?.type)&&/^-[1-9][0-9]{0,15}$/.test(String(chat.id))&&Number.isSafeInteger(Number(chat.id));}
function member(value,expected){return String(value?.user?.id)===String(expected)&&(['creator','administrator','member'].includes(value.status)||(value.status==='restricted'&&value.is_member===true));}
function email(value){if(typeof value!=='string'||value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))fail('INVALID_EMAIL');return value.toLowerCase();}
function config(env={}){
 const integer=(key,fallback,min,max)=>{const raw=env[key];if(raw===undefined||raw==='')return fallback;if(!/^\d+$/.test(String(raw)))fail('INVALID_NOTIFICATION_CONFIG');const n=Number(raw);if(!Number.isSafeInteger(n)||n<min||n>max)fail('INVALID_NOTIFICATION_CONFIG');return n;};
 return Object.freeze({threshold:integer('WPAY_PENDING_UTR_DISABLE_THRESHOLD',3,3,7),offlineStopMs:integer('WPAY_DEVICE_OFFLINE_STOP_MINUTES',5,5,60)*60000,offlineReminderMs:integer('WPAY_DEVICE_OFFLINE_REMINDER_MINUTES',1,1,60)*60000,statementReminderMs:integer('WPAY_STATEMENT_REMINDER_MINUTES',5,1,60)*60000,pendingAgeMs:300000});
}
class Access{
 constructor({telegram,botId,allowMemberBot=false}){this.telegram=telegram;this.botId=id(botId);this.allowMemberBot=allowMemberBot;}
 async present(chat,actor){
  if(!group(chat))return false;
  try{const bot=await this.telegram.call('getChatMember',{chat_id:chat.id,user_id:this.botId});if(!member(bot,this.botId)||(!this.allowMemberBot&&bot.status!=='administrator')||(bot.status==='restricted'&&bot.can_send_messages!==true))return false;
   const person=await this.telegram.call('getChatMember',{chat_id:chat.id,user_id:id(actor)});return member(person,actor)&&person.user.is_bot!==true;
  }catch{return false;}
 }
 async controller(chat,actor){return CONTROLLERS.includes(String(actor))&&await this.present(chat,actor);}
 async receiver(chat,actor){return !CONTROLLERS.includes(String(actor))&&await this.present(chat,actor);}
}
module.exports={CONTROLLERS,fail,id,group,member,email,config,Access};
