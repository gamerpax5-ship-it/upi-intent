'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create,PATH}=require('../lib/wpay/telegram/runtime');
test('readiness becomes true only after Telegram accepts registration',async()=>{
 const calls=[],runtime=create({pool:{query:async()=>({rows:[]})},env:{TELEGRAM_BOT_TOKEN:'123:test_token',TELEGRAM_WEBHOOK_SECRET:'strong_test_secret_1234567890',WPAY_HOSTED_ORIGIN:'https://example.test'},fetcher:async url=>{
  calls.push(url.split('/').at(-1));return {ok:true,json:async()=>({ok:true,result:url.endsWith('/getMe')?{id:123,is_bot:true,username:'testbot'}:true})};
 }});
 let status,body;const io={send:(res,s,b)=>{status=s;body=b;}},req={url:PATH+'/health',method:'GET'};
 try{await runtime.webhook(req,{},io);assert.equal(status,503);assert.deepEqual(body,{ready:false});
 await runtime.start();await runtime.webhook(req,{},io);assert.equal(status,200);assert.deepEqual(body,{ready:true});assert.deepEqual(calls,['getMe','setWebhook','setMyCommands']);
 }finally{await runtime.stop();}
});
