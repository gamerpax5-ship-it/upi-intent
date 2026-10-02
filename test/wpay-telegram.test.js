'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CONTROLLER_IDS,GroupAccess,verifySecret}=require('../lib/wpay/telegram/access');
const {parse,subscription,watchesPhone}=require('../lib/wpay/telegram/commands');
const chat={id:-1001234567890,type:'supergroup'};
function access(members={},botStatus='administrator'){return new GroupAccess({botId:'123456789',telegram:{call:async(method,b)=>{if(b.user_id==='123456789')return {status:botStatus};if(members[b.user_id] instanceof Error)throw members[b.user_id];return {user:{id:Number(b.user_id)},status:members[b.user_id]||'left'};}}});}
test('any one of the five exact controllers enables a group',async()=>{for(const id of CONTROLLER_IDS)assert.equal(await access({[id]:'member'}).allowed(chat),true);});
test('controller leaving stops subsequent delivery authorization',async()=>{const m={[CONTROLLER_IDS[0]]:'member'},a=access(m);assert.equal(await a.allowed(chat),true);m[CONTROLLER_IDS[0]]='left';assert.equal(await a.allowed(chat),false);});
test('API failure, no controller and missing bot Admin rights fail closed',async()=>{assert.equal(await access().allowed(chat),false);assert.equal(await access({[CONTROLLER_IDS[0]]:Error()}).allowed(chat),false);assert.equal(await access({[CONTROLLER_IDS[0]]:'member'},'member').allowed(chat),false);});
test('private chats and channels never gain workspace data access',async()=>{for(const type of ['private','channel'])assert.equal(await access({[CONTROLLER_IDS[0]]:'member'}).allowed({...chat,type}),false);});
test('command variants and mention routing are unambiguous',()=>{assert.deepEqual(parse('/device history +919876543210','testbot'),{command:'devicehistory',phone:'919876543210'});assert.deepEqual(parse('/ceditutrall','testbot'),{command:'creditutrall'});assert.equal(parse('/status@otherbot 919876543210','testbot'),null);assert.deepEqual(parse('/creditutr@TestBot shop@bank','testbot'),{command:'creditutr',upi:'shop@bank'});});
test('invalid selectors and excess arguments are rejected',()=>{for(const text of ['/status','/status all','/connect 123','/creditutr nope','/connectall extra'])assert.throws(()=>parse(text,'testbot'));});
test('disconnect number overrides connectall; reconnect restores it',()=>{let s=subscription(null,{command:'connectall'});assert.equal(watchesPhone(s,'919876543210'),true);s=subscription(s,{command:'disconnect',phone:'919876543210'});assert.equal(watchesPhone(s,'919876543210'),false);assert.equal(watchesPhone(s,'919876543211'),true);s=subscription(s,{command:'connect',phone:'919876543210'});assert.equal(watchesPhone(s,'919876543210'),true);s=subscription(s,{command:'disconnect',all:true});assert.equal(watchesPhone(s,'919876543210'),false);});
test('webhook requires exact strong secret and refuses malformed input',()=>{const secret='a'.repeat(32);assert.equal(verifySecret(secret,secret),true);assert.equal(verifySecret('b'.repeat(32),secret),false);assert.equal(verifySecret(undefined,secret),false);assert.equal(verifySecret('short','short'),false);});
test('outbound OTP notification cannot forward raw message or code fields',()=>{
 const {maskedEvent}=require('../lib/wpay/telegram/format');const s=maskedEvent({phone:'919876543210',receivedAt:'2026-09-28T00:00:00Z',code:'872194',message:'Authentication code 872194'});
 assert.ok(s.includes('[MASKED]'));assert.ok(!s.includes('872194'));assert.ok(!s.includes('Authentication code'));
});
test('missing GPS values are not converted to the real coordinate zero',()=>{
 const {location}=require('../lib/wpay/telegram/format');assert.equal(location({latitude:null,longitude:null,locationPermission:true,locationEnabled:true}),null);assert.equal(location({latitude:12,longitude:77,locationPermission:false,locationEnabled:true}),null);
});
test('engine rechecks membership at outbound delivery, not just command receipt',async()=>{
 const {Bot}=require('../lib/wpay/telegram/engine');let reads=0,sent=0;
 const bot=new Bot({username:'testbot',access:{allowed:async()=>++reads===1},telegram:{text:async()=>sent++},source:{device:async()=>({phone:'919876543210'})},store:{exclusive:async(id,fn)=>fn({}),processed:async()=>false,markProcessed:async()=>{}}});
 await assert.rejects(bot.command({chat,from:{id:99},text:'/status 919876543210'},1),/GROUP_ACCESS_DENIED/);assert.equal(sent,0);
});
test('a group without a controller cannot invoke a data source',async()=>{
 const {Bot}=require('../lib/wpay/telegram/engine');let read=false;const bot=new Bot({access:{allowed:async()=>false},source:{device:async()=>{read=true;}}});
 await bot.command({chat,from:{id:99},text:'/status 919876543210'},1);assert.equal(read,false);
});
test('transport errors cannot expose bot tokens',async()=>{
 const {Telegram}=require('../lib/wpay/telegram/transport'),token='123456:synthetic_test_token';
 const t=new Telegram({token,fetcher:async url=>{throw Error(url);}});await assert.rejects(t.call('getMe'),e=>e.message==='TELEGRAM_REQUEST_FAILED'&&!e.message.includes(token));
});


test('status lookup keeps previously bound device resolvable instead of number not found',async()=>{
 const {Source}=require('../lib/wpay/telegram/source');
 const number='919876543210';
 const source=new Source({
  pool:{query:async()=>({rows:[]})},
  pairing:{devices:async()=>[
   {id:'dev-old',linked:false,status:'active',phone_e164:number,last_seen_at:'2026-10-01T10:00:00Z'}
  ]},
  tenantIds:['tenant-test']
 });
 source.links=async includeRevoked=>{
  assert.equal(includeRevoked,true);
  return [{id:'link-old',owner_id:'owner',owner_name:'Owner',device_ref:'dev-old',pairing_id:'pair-old',valid_from:'2026-09-01T00:00:00Z',valid_until:'2027-09-01T00:00:00Z',revoked_at:'2026-10-02T00:00:00Z'}];
 };
 const d=await source.device(number);
 assert.equal(d.phone,number);
 assert.equal(d.status,'deleted');
});
