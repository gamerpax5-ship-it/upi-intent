'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create,PATH}=require('../lib/wpay/telegram/runtime');
const {CreditReader}=require('../lib/wpay/telegram/credit-reader');
test('webhook queues only allowlisted command metadata and checks secret before parsing',async()=>{
 const queries=[],secret='test_secret_12345678901234567890';
 const pool={query:async(sql,args)=>{queries.push({sql,args});return {rows:[]};}};
 const runtime=create({pool,env:{TELEGRAM_BOT_TOKEN:'123:test_token',TELEGRAM_WEBHOOK_SECRET:secret,WPAY_HOSTED_ORIGIN:'https://example.test'},fetcher:async url=>({ok:true,json:async()=>({ok:true,result:url.endsWith('/getMe')?{id:123,is_bot:true,username:'testbot'}:true})})});
 await runtime.start();
 let status,parsed=0;const update={update_id:1,message:{chat:{id:-100123,type:'supergroup'},from:{id:8248339578},text:'/connectall',caption:'private chat text'}};
 const io={readBody:async()=>{parsed++;return update;},send:(res,code)=>{status=code;}};
 const req={url:PATH,method:'POST',headers:{'x-telegram-bot-api-secret-token':'wrong'}};
 try{
  await runtime.webhook(req,{},io);assert.equal(status,403);assert.equal(parsed,0);
  req.headers['x-telegram-bot-api-secret-token']=secret;
  await runtime.webhook(req,{},io);assert.equal(status,200);
  const inserts=queries.filter(q=>q.sql.startsWith('INSERT'));assert.equal(inserts.length,1);
  assert.deepEqual(Object.keys(inserts[0].args[1]).sort(),['chat','from','text']);
  update.message.from.id=999;await runtime.webhook(req,{},io);assert.equal(queries.filter(q=>q.sql.startsWith('INSERT')).length,1);
 }finally{await runtime.stop();}
});
test('credit readers bind resource and time scope without SMS bodies or credentials',async()=>{
 const seen=[],reader=new CreditReader({withRead:fn=>fn({query:async(sql,args)=>{seen.push({sql,args});return {rows:[]};}})});
 const link={resource_id:'device_1',valid_from:'2026-01-01',valid_until:'2027-01-01'};
 for(const view of ['transactions','statement'])await reader.read(link,view,'99');
 for(const q of seen){assert.deepEqual(q.args,['device_1','99','2026-01-01','2027-01-01']);assert.doesNotMatch(q.sql,/sms_body|raw_result|credential|otp_code|SELECT \*/i);}
});
test('webhook wakes the serial worker immediately without overlapping an in-flight cycle',async()=>{
 const secret='test_secret_12345678901234567890';let polls=0,active=0,maxActive=0,release;
 const blocked=new Promise(resolve=>{release=resolve;});
 const pool={query:async sql=>{if(sql.startsWith('SELECT update_id')){polls++;active++;maxActive=Math.max(maxActive,active);if(polls===1)await blocked;active--;}return {rows:[]};}};
 const runtime=create({pool,env:{TELEGRAM_BOT_TOKEN:'123:test_token',TELEGRAM_WEBHOOK_SECRET:secret,WPAY_HOSTED_ORIGIN:'https://example.test'},fetcher:async url=>({ok:true,json:async()=>({ok:true,result:url.endsWith('/getMe')?{id:123,is_bot:true,username:'testbot'}:true})})});
 try{
  await runtime.start();assert.equal(polls,1);
  const req={url:PATH,method:'POST',headers:{'x-telegram-bot-api-secret-token':secret}},io={readBody:async()=>({update_id:12,message:{from:{id:8248339578},chat:{id:-123,type:'supergroup'},text:'/creditutrcountinue all'}}),send:()=>{}};
  await runtime.webhook(req,{},io);assert.equal(polls,1);release();
  const until=Date.now()+1000;while(polls<2&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
  assert.equal(polls,2);assert.equal(maxActive,1);
  await runtime.webhook(req,{},io);const until2=Date.now()+1000;while(polls<3&&Date.now()<until2)await new Promise(r=>setTimeout(r,10));assert.equal(polls,3);
 }finally{release();await runtime.stop();}
});
