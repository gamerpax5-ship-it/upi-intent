'use strict';
class Telegram{
 constructor({token,fetcher=fetch}){if(typeof token!=='string'||!/^\d+:[A-Za-z0-9_-]+$/.test(token))throw Error('TELEGRAM_NOT_CONFIGURED');this.token=token;this.fetcher=fetcher;this.sentAt=new Map();}
 async call(method,body={}){
  if(!['getMe','getChatMember','setWebhook','getWebhookInfo','sendMessage','sendLocation','setMyCommands'].includes(method))throw Error('TELEGRAM_METHOD_DENIED');
  if(['sendMessage','sendLocation'].includes(method)){const last=this.sentAt.get(String(body.chat_id))||0,wait=last+3100-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));this.sentAt.set(String(body.chat_id),Date.now());}
  try{
   const response=await this.fetcher('https://api.telegram.org/bot'+this.token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(8000)});
   const result=await response.json();if(!response.ok||result.ok!==true)throw Error();return result.result;
  }catch{throw Error('TELEGRAM_REQUEST_FAILED');} // Never log token-bearing URLs or responses.
 }
 async text(chatId,text){if(typeof text!=='string'||!text||text.length>4000)throw Error('TELEGRAM_MESSAGE_SIZE');return this.call('sendMessage',{chat_id:chatId,text,link_preview_options:{is_disabled:true}});}
}
module.exports={Telegram};
