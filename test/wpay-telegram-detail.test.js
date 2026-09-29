'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parse}=require('../lib/wpay/telegram/commands');
const {GroupAccess,UTR_CONTROLLER_IDS}=require('../lib/wpay/telegram/access');
const {Bot}=require('../lib/wpay/telegram/engine');
const {Source}=require('../lib/wpay/telegram/source');
const format=require('../lib/wpay/telegram/format');

test('/detail accepts exactly one 12-digit UTR and handles bot mentions',()=>{
 assert.deepEqual(parse('/detail 123456789012','testbot'),{command:'detail',utr:'123456789012'});
 assert.deepEqual(parse('/detail@TestBot 123456789012','testbot'),{command:'detail',utr:'123456789012'});
 for(const value of ['/detail','/detail 123','/detail 123456789012 extra'])assert.throws(()=>parse(value,'testbot'));
 assert.equal(parse('/detail@other 123456789012','testbot'),null);
});

test('/detail access is isolated to any one of the six listed current members',async()=>{
 const chat={id:-1001234567890,type:'supergroup'},members=new Set([UTR_CONTROLLER_IDS[5]]);
 const access=new GroupAccess({botId:'123',requireAdmin:false,telegram:{call:async(method,args)=>{
  if(args.user_id==='123')return {user:{id:123},status:'member'};
  return {user:{id:Number(args.user_id)},status:members.has(String(args.user_id))?'member':'left'};
 }}});
 assert.equal(UTR_CONTROLLER_IDS.length,6);
 assert.equal(await access.allowedDetail(chat,UTR_CONTROLLER_IDS[5]),true);
 assert.equal(await access.allowedDetail(chat,UTR_CONTROLLER_IDS[0]),false);
 assert.equal(await access.allowedDetail(chat,'999'),false);
});

test('detail command is one-time and does not mutate subscription state',async()=>{
 const chat={id:-123,type:'supergroup'},sent=[];let saves=0;
 const bot=new Bot({username:'testbot',
  access:{allowed:async()=>false,allowedUtr:async()=>false,allowedDetail:async(c,id)=>String(id)===UTR_CONTROLLER_IDS[0]},
  telegram:{text:async(id,text)=>sent.push(text)},
  source:{detail:async utr=>[{utr,at:'2026-09-20T10:00:00Z',amount_minor:'125000',merchant_name:'Merchant A',user_name:'User A',upi:'shop@bank',payment_state:'successful',callbackStatus:'success',apkNumber:'919876543210'}]},
  store:{exclusive:async(id,fn)=>fn({otpAll:true}),processed:async()=>false,markProcessed:async()=>{},save:async()=>{saves++;}}
 });
 await bot.command({chat,from:{id:Number(UTR_CONTROLLER_IDS[0])},text:'/detail 123456789012'},1);
 assert.equal(saves,0);assert.equal(sent.length,1);
 assert.match(sent[0],/UTR: 123456789012/);assert.match(sent[0],/Merchant: Merchant A/);
 assert.match(sent[0],/User: User A/);assert.match(sent[0],/UPI ID: shop@bank/);
 assert.match(sent[0],/Payment status: successful/);assert.match(sent[0],/Callback status: Success/);
 assert.match(sent[0],/APK number: 919876543210/);
});

test('source detail scopes by UTR digest, tenant and one month, with failed callback fallback',async()=>{
 const queries=[],utr='123456789012';
 const pool={query:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.includes('FROM wpay_auth.gateway_claims'))return {rows:[{claim_id:'c',claim_at:'2026-09-20T10:00:00Z',order_id:'o',payment_state:'successful',paid_at:'2026-09-20T10:01:00Z',amount_minor:'10000',merchant_name:'M',user_name:'U',user_id:'u',bank_id:'b',bank_version:1,upi:'u@bank',financial_at:'2026-09-20T10:02:00Z',callback_state:'failed'}]};
  if(sql.includes('FROM wpay_auth.resource_links'))return {rows:[]};
  if(sql.includes('SELECT DISTINCT tenant_id'))return {rows:[{tenant_id:'tenant'}]};
  throw Error('unexpected query');
 }};
 const source=new Source({pool,tenantIds:['tenant']});
 const rows=await source.detail(utr);
 assert.equal(rows.length,1);assert.equal(rows[0].callbackStatus,'failed');assert.equal(rows[0].apkNumber,null);
 const q=queries.find(x=>x.sql.includes('FROM wpay_auth.gateway_claims'));
 assert.ok(q);assert.match(q.sql,/interval '1 month'/);assert.match(q.sql,/c\.utr_digest=\$1/);
 assert.equal(q.args[0],require('node:crypto').createHash('sha256').update(utr).digest('hex'));
 assert.deepEqual(q.args[1],['tenant']);
});

test('detail formatter uses only requested operational fields',()=>{
 const text=format.detail({utr:'123456789012',at:'2026-09-29T00:00:00Z',amount_minor:'12345',merchant_name:null,user_name:'User',upi:'shop@bank',payment_state:'successful',callbackStatus:'failed',apkNumber:null});
 assert.match(text,/Amount: INR 123\.45/);assert.match(text,/Merchant: Unavailable/);
 assert.match(text,/Callback status: Failed/);assert.match(text,/APK number: Unavailable/);
});
