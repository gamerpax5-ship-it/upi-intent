'use strict';
const {createHmac,timingSafeEqual}=require('node:crypto');
const METHODS=new Set(['getMe','getChatMember','setWebhook','setMyCommands','sendMessage','editMessageText','answerCallbackQuery']);
function webhookSecret(token){return createHmac('sha256',token).update('wpay-notification-bot-webhook-v1').digest('hex');}
function verifySecret(provided,expected){if(typeof provided!=='string'||typeof expected!=='string'||expected.length<32)return false;const a=Buffer.from(provided),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
class Telegram{
 constructor({token,fetcher=fetch}){if(typeof token!=='string'||!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token))throw Error('NOTIFICATION_TOKEN_INVALID');this.token=token;this.fetcher=fetcher;}
 async call(method,body={}){
  if(!METHODS.has(method))throw Error('NOTIFICATION_METHOD_INVALID');
  try{const response=await this.fetcher('https://api.telegram.org/bot'+this.token+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000),redirect:'error'});
   if(!response.ok)throw Error();const data=await response.json();if(data.ok!==true)throw Error();return data.result;
  }catch{throw Error('NOTIFICATION_TELEGRAM_UNAVAILABLE');}
 }
 text(chat,text,replyMarkup){if(typeof text!=='string'||text.length>4000)throw Error('NOTIFICATION_TEXT_INVALID');return this.call('sendMessage',{chat_id:chat,text,link_preview_options:{is_disabled:true},...(replyMarkup?{reply_markup:replyMarkup}:{})});}
}
module.exports={Telegram,webhookSecret,verifySecret};
