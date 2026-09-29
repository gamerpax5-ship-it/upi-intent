'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parse}=require('../lib/wpay/telegram/commands');
const {GroupAccess,UTR_CONTROLLER_IDS}=require('../lib/wpay/telegram/access');
const {Source}=require('../lib/wpay/telegram/source');
const format=require('../lib/wpay/telegram/format');
const {Bot}=require('../lib/wpay/telegram/engine');

test('detail command accepts exactly one 12-digit UTR and handles bot mentions',()=>{
 assert.deepEqual(parse('/detail 123456789012','testbot'),{command:'detail',utr:'123456789012'});
 assert.deepEqual(parse('/detail@TestBot 123456789012','testbot'),{command:'detail',utr:'123456789012'});
 assert.equal(parse('/detail@other 123456789012','testbot'),null);
 for(const text of ['/detail','/detail 123','/detail 123456789012 extra'])assert.throws(()=>parse(text,'testbot'));
});

test('detail access is limited to the six IDs but does not require a second controller',async()=>{
 const chat={id:-1001234567890,type:'supergroup'},member=UTR_CONTROLLER_IDS[5];
 const access=new GroupAccess({botId:'123',requireAdmin:false,telegram:{call:async(method,args)=>{
  if(args.user_id==='123')return {status:'member'};
  return {user:{id:Number(args.user_id)},status:String(args.user_id)===member?'member':'left'};
 }}});
 assert.equal(await access.allowedDetail(chat,member),true);
 assert.equal(await access.allowedDetail(chat,'9999999999'),false);
 assert.equal(await access.allowedUtr(chat,member),false);
});

test('detail source returns party, UPI, callback result and one-month scope without changing streams',async()=>{
 let sql,args;
 const source=new Source({
  tenantIds:['tenant-a'],
  pool:{query:async(q,a)=>{sql=q;args=a;return {rows:[{
   order_id:'order-1',payment_status:'successful',amount_minor:'12345',created_at:new Date('2026-09-20T00:00:00Z'),
   paid_at:new Date('2026-09-20T00:01:00Z'),claim_at:new Date('2026-09-20T00:00:30Z'),
   merchant_name:'Merchant A',user_name:'User A',user_id:'user-1',bank_id:'bank-1',bank_version:1,upi:'shop@bank',
   callback_state:'delivered',callback_event:'payment.success',detail_at:new Date('2026-09-20T00:01:00Z')
  }]};}},
  operational:null,pairing:null
 });
 const rows=await source.detail('123456789012');
 assert.equal(rows.length,1);
 assert.equal(rows[0].amount,'123.45');
 assert.equal(rows[0].callbackStatus,'success');
 assert.equal(rows[0].merchant_name,'Merchant A');
 assert.equal(rows[0].user_name,'User A');
 assert.equal(rows[0].upi,'shop@bank');
 assert.equal(rows[0].apkNumber,null);
 assert.match(sql,/interval '31 days'/);
 assert.equal(args[1][0],'tenant-a');
});

test('detail formatter exposes requested complaint fields and callback success/failure',()=>{
 const success=format.detail({utr:'123456789012',detail_at:'2026-09-20T00:01:00Z',amount:'123.45',merchant_name:'Merchant A',user_name:'User A',upi:'shop@bank',callbackStatus:'success',payment_status:'successful',apkNumber:'919876543210'});
 assert.match(success,/UTR: 123456789012/);
 assert.match(success,/Merchant: Merchant A/);
 assert.match(success,/User: User A/);
 assert.match(success,/UPI ID: shop@bank/);
 assert.match(success,/Status: success/);
 assert.match(success,/Payment status: successful/);
 assert.match(success,/APK number: 919876543210/);
 const failed=format.detail({utr:'123456789012',amount:'1.00',callbackStatus:'failed'});
 assert.match(failed,/Status: failed/);
});

test('engine runs detail as a one-time read-only command through detail authorization',async()=>{
 const sent=[],chat={id:-123,type:'supergroup'},state={otpAll:true,phones:['919999999999'],since:'2026-09-01'};
 let saved=false,processed=false;
 const bot=new Bot({
  username:'testbot',
  access:{allowed:async()=>false,allowedUtr:async()=>false,allowedDetail:async()=>true},
  telegram:{text:async(id,text)=>sent.push(text)},
  source:{detail:async()=>[{utr:'123456789012',detail_at:'2026-09-20',amount:'10.00',merchant_name:'Merchant',user_name:'User',upi:'shop@bank',callbackStatus:'success',payment_status:'successful',apkNumber:null}]},
  store:{exclusive:async(id,fn)=>fn(state),processed:async()=>false,markProcessed:async()=>{processed=true;},save:async()=>{saved=true;}}
 });
 await bot.command({chat,from:{id:Number(UTR_CONTROLLER_IDS[0])},text:'/detail 123456789012'},1);
 assert.equal(sent.length,1);
 assert.match(sent[0],/Status: success/);
 assert.equal(saved,false);
 assert.equal(processed,true);
});
