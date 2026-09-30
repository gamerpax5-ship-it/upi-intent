'use strict';
class Telegram{
 constructor({token,fetcher=globalThis.fetch}){if(!token||typeof fetcher!=='function')throw Error('TELEGRAM_CONFIG_INVALID');this.base='https://api.telegram.org/bot'+token+'/';this.fetcher=fetcher;}
 async call(method,body={}){try{const r=await this.fetcher(this.base+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),j=await r.json();if(!r.ok||!j.ok)throw Error();return j.result;}catch{throw Error('TELEGRAM_REQUEST_FAILED');}}
 text(chatId,text){return this.call('sendMessage',{chat_id:chatId,text,disable_web_page_preview:true});}
}
module.exports={Telegram};