'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {CONTROLLERS,Access,config}=require('../lib/wpay/notification-bot/policy');
const {parse,MENU}=require('../lib/wpay/notification-bot/commands');
const {empty,change,requestReset,confirmReset,receiver}=require('../lib/wpay/notification-bot/mappings');
const {decide}=require('../lib/wpay/notification-bot/monitor-policy');
const {Telegram,webhookSecret,verifySecret}=require('../lib/wpay/notification-bot/transport');
const actor=CONTROLLERS[0],chat={id:-10012345,type:'supergroup'},account={id:'a',email:'a@example.com',account_type:'user',status:'active'};
const set=(mail='a@example.com',telegramId='1234567')=>({command:'setuser',email:mail,telegramId});
const add=(state=empty(),command=set(),a=account)=>change(state,command,a,actor).state;
test('new bot has exactly the six approved command controllers',()=>{assert.deepEqual(CONTROLLERS,['8248339578','8431990409','7925279541','8403294379','7668086423','6749918659']);assert.equal(MENU.length,10);});
test('commands validate email, IDs, argument count, paging and bot mentions',()=>{
 assert.deepEqual(parse('/setuser@TestBot A@example.com 1234567','testbot'),set());
 assert.equal(parse('/setuser@oldbot a@example.com 1234567','testbot'),null);
 for(const text of ['/setuser a@example.com','/setuser bad 1234','/setuser a@example.com -123','/resetuser a@example.com 123','/resetgroup extra','/users 0','/merchants 1.2','/mappings 10000','/status x'])assert.throws(()=>parse(text,'testbot'));
 assert.deepEqual(parse('/resetuser a@example.com 1234567 7654321','testbot'),{command:'resetuser',email:'a@example.com',oldId:'1234567',telegramId:'7654321'});
 assert.deepEqual(parse('/setadmin','testbot'),{command:'setadmin'});
 assert.deepEqual(parse('/setadmin Admin@example.com','testbot'),{command:'setadmin',email:'admin@example.com'});
});
test('multiple users and multiple IDs coexist without overwriting',()=>{
 const first=add(),second=add(first,set('b@example.com','7654321'),{...account,id:'b',email:'b@example.com'}),third=add(second,set('a@example.com','2345678'));
 assert.equal(first.mappings.length,1);assert.equal(third.mappings.length,3);assert.equal(third.mappings[0].id,first.mappings[0].id);
 assert.equal(change(third,set(),account,actor).changed,false);
});
test('Received is bound to exact mapping generation, account and Telegram actor',()=>{
 const state=add(),m=state.mappings[0];assert.equal(receiver(state,{mappingId:m.id,accountId:'a',telegramId:'1234567'}),true);
 for(const diff of [{accountId:'b'},{telegramId:'7654321'},{mappingId:'old'},...CONTROLLERS.map(telegramId=>({telegramId}))])assert.equal(receiver(state,{mappingId:m.id,accountId:'a',telegramId:'1234567',...diff}),false);
});
test('remove, reset and re-add invalidate old Received buttons',()=>{
 const state=add(),old=state.mappings[0];
 const reset=change(state,{command:'resetuser',email:account.email,oldId:'1234567',telegramId:'7654321'},account,actor).state;
 assert.equal(receiver(reset,{mappingId:old.id,accountId:'a',telegramId:'1234567'}),false);
 const removed=change(state,{command:'removeuser',email:account.email,telegramId:'1234567'},account,actor).state;
 assert.equal(removed.mappings.length,0);assert.notEqual(add(removed).mappings[0].id,old.id);
});
test('disabled account can be removed but cannot gain a new mapping',()=>{
 const state=add(),disabled={...account,status:'disabled'};
 assert.equal(change(state,{command:'removeuser',email:account.email,telegramId:'1234567'},disabled,actor).state.mappings.length,0);
 assert.throws(()=>change(empty(),set(),disabled,actor));
});
test('group role conflicts and non-controller changes fail closed',()=>{
 const admin={...account,id:'admin-account',email:'admin@example.com',account_type:'super_admin'};
 const adminState=change(empty(),{command:'setadmin',email:admin.email},admin,actor).state;assert.equal(adminState.role,'admin');assert.equal(adminState.adminAccountId,admin.id);
 assert.throws(()=>change(add(),{command:'setadmin'},null,actor),/RESET_GROUP_FIRST/);
 assert.throws(()=>change(empty(),set(),account,'999999'),/CONTROLLER_REQUIRED/);
 for(const id of CONTROLLERS)assert.throws(()=>add(empty(),set(account.email,id)),/CONTROLLER_CANNOT_RECEIVE/);
 const merchant={...account,account_type:'merchant'};
 const mapped=change(empty(),{command:'setmerchant',email:account.email},merchant,actor).state;
 assert.throws(()=>change(mapped,{command:'setmerchant',email:'b@example.com'},{...merchant,id:'b',email:'b@example.com'},actor),/RESET_GROUP_FIRST/);
});
test('group reset requires an expiring token bound to requesting controller',()=>{
 const pending=requestReset(add(),actor,1000);assert.deepEqual(confirmReset(pending.state,actor,pending.token,1001),empty());
 assert.throws(()=>confirmReset(pending.state,CONTROLLERS[1],pending.token,1001));
 assert.throws(()=>confirmReset(pending.state,actor,pending.token,121000));
 assert.throws(()=>confirmReset(empty(),actor,pending.token,1001));
 const changed=add(pending.state,set(account.email,'2345678'));assert.throws(()=>confirmReset(changed,actor,pending.token,1001));
});
function access(status='member',botStatus='administrator',throws=false){return new Access({botId:'100',telegram:{call:async(_,body)=>{if(throws)throw Error('unavailable');return {user:{id:Number(body.user_id),is_bot:body.user_id==='100'},status:body.user_id==='100'?botStatus:status};}}});}
test('access rejects anonymous/private/unapproved controllers and membership lookup failures',async()=>{
 assert.equal(await access().controller(chat,actor),true);assert.equal(await access().controller(chat,'1234567'),false);
 assert.equal(await access().receiver(chat,'1234567'),true);assert.equal(await access().receiver(chat,actor),false);
 for(const a of [access('left'),access('member','member'),access('member','administrator',true)])assert.equal(await a.controller(chat,actor),false);
 assert.equal(await access().controller({...chat,type:'private'},actor),false);
});
const now=Date.parse('2026-09-30T10:00:00Z'),settings=config(),bank={version:1,approvedVersion:1,status:'running',updatedAt:'v1'},device={sourceConnected:true,status:'offline',lastSeenAt:new Date(now-300000).toISOString()};
test('only verified continuous offline age causes auto-stop; source outage is unknown',()=>{
 assert.equal(decide({bank,device,now,settings}).stop,true);
 assert.equal(decide({bank,device:{...device,lastSeenAt:new Date(now-299999).toISOString()},now,settings}).stop,false);
 assert.equal(decide({bank,device:{...device,sourceConnected:false},now,settings}).stop,false);
 assert.equal(decide({bank,device:{...device,lastSeenAt:null},now,settings}).unknown,true);
});
test('pending threshold counts distinct aged UTR/order claims, not callbacks or duplicates',()=>{
 const rows=[1,2,3].map(i=>({orderId:String(i),utrDigest:'utr'+i,createdAt:new Date(now-300000).toISOString()}));
 const online={sourceConnected:true,status:'online',lastSeenAt:new Date(now).toISOString()};
 assert.equal(decide({bank,device:online,pendingClaims:rows,now,settings}).stop,true);
 assert.equal(decide({bank,device:online,pendingClaims:[rows[0],rows[0],rows[0]],now,settings}).stop,false);
 assert.equal(decide({bank,device:online,pendingClaims:rows.map(x=>({...x,createdAt:new Date(now).toISOString()})),now,settings}).stop,false);
});
test('auto-resume never overrides Admin edits or independent restrictions',()=>{
 const stopped={...bank,status:'stopped',reason:'notification:1'},stop={bankVersion:1,bankUpdatedAt:'v1',reason:'notification:1',reasons:['device_offline']},online={sourceConnected:true,status:'online',lastSeenAt:new Date(now).toISOString()};
 const input={bank:stopped,stop,device:online,now,settings};assert.equal(decide(input).restart,true);
 for(const patch of [{frozen:true},{deactivated:true},{version:2},{reason:'admin stop'},{updatedAt:'v2'},{approvedVersion:null}])assert.equal(decide({...input,bank:{...stopped,...patch}}).restart,false);
 assert.equal(decide({...input,stop:{...stop,reasons:['pending_utr']},pendingClaims:[{orderId:'new',utrDigest:'x',createdAt:new Date(now).toISOString()}]}).restart,false);
});
test('notification timing config validates integer bounds',()=>{assert.equal(config().threshold,3);assert.equal(config({WPAY_PENDING_UTR_DISABLE_THRESHOLD:'7'}).threshold,7);for(const n of ['0','8','3.5','x'])assert.throws(()=>config({WPAY_PENDING_UTR_DISABLE_THRESHOLD:n}));});
test('explicit Admin start overrides the current incident until it fully recovers',()=>{
 const stop={adminOverride:true,bankVersion:1,reasons:['device_offline']};
 assert.equal(decide({bank,device,stop,now,settings}).stop,false);
 assert.equal(decide({bank,device,stop,now,settings}).overrideActive,true);
 assert.equal(decide({bank,device:{sourceConnected:true,status:'online',lastSeenAt:new Date(now).toISOString()},stop,now,settings}).overrideActive,false);
 assert.equal(decide({bank:{...bank,version:2,approvedVersion:2},device,stop,now,settings}).overrideActive,false);
});
test('new token secret and errors are isolated and do not reveal credentials',async()=>{
 const token='123456:abcdefghijklmnopqrstuvwxyz',secret=webhookSecret(token);assert.equal(verifySecret(secret,secret),true);assert.equal(verifySecret('wrong',secret),false);
 const t=new Telegram({token,fetcher:async url=>{throw Error(url);}});await assert.rejects(t.call('getMe'),e=>e.message==='NOTIFICATION_TELEGRAM_UNAVAILABLE'&&!e.message.includes(token));
});
test('notification projections never include arbitrary bank notes or secret fields',()=>{
 const f=require('../lib/wpay/notification-bot/format'),secret='synthetic-do-not-send';
 const output=f.bankSubmission({account:{name:'User',email:'a@example.com',password:secret},bank:{version:1,status:'submitted'},details:{holderName:'Holder',accountNumber:'123456781234',upiId:'a@bank',notes:secret,password:secret,otp:secret,bankName:'Bank'}});
 assert.ok(output.includes('•••• 1234'));assert.ok(!output.includes('123456781234'));assert.ok(!output.includes(secret));
 assert.equal(f.amount('10001'),'INR 100.01');assert.throws(()=>f.amount('100.1'));
});
test('only successful endpoint delivery can render Callback Sent',()=>{
 const {callbackResult}=require('../lib/wpay/notification-bot/format'),input={utr:'123456789012',amountMinor:'10000',paymentStatus:'successful'};
 assert.match(callbackResult({...input,callbackStatus:'delivered'}),/Callback Sent/);
 for(const state of ['pending','leased','failed','unconfigured',undefined])assert.doesNotMatch(callbackResult({...input,callbackStatus:state}),/Callback Sent/);
 assert.doesNotMatch(callbackResult({...input,paymentStatus:'verification_pending',callbackStatus:'delivered'}),/Callback Sent/);
});

test('Telegram approval forms expose only four role-specific values',()=>{
 const review=require('../lib/wpay/notification-bot/account-review'),merchant={state:'editing_approve',account_type:'merchant',draft:{fixedFeeCurrency:'INR',paymentLinkTtlSeconds:'300'}};
 const parsed=review.parseReply(merchant,'1.2% | 0.8% | 6 | 107','INR');assert.equal(parsed.mode,'approve');assert.equal(parsed.draft.payinFee,'1.2');assert.equal(parsed.draft.payoutFee,'0.8');assert.equal(parsed.draft.paymentLinkTtlSeconds,'300');assert.equal(parsed.draft.inrPerUsdt,'107');
 const legacy=review.parseReply(merchant,'1.2 | 0.8 | 6 | 107','INR');assert.equal(legacy.draft.payinFee,'1.2');
 assert.throws(()=>review.parseReply(merchant,'1.2%% | 0.8% | 6 | 107','INR'),/REVIEW_FORM_INVALID/);
 assert.throws(()=>review.parseReply(merchant,'1.2% | 0.8% | 6 | 300 | 107','INR'),/REVIEW_FORM_INVALID/);
 const fmt=require('../lib/wpay/notification-bot/format');assert.match(fmt.approvalPrompt({account_type:'user'}),/4% \| 3% \| 107/);
 const user={state:'editing_approve',account_type:'user',draft:{depositNetwork:'TRON-TRC20'}};
 const exact=review.parseReply(user,'4% | 3% | 107 | TVvSJ9TubYsFucUqDCmZKHJnPRf3XGvEDA','INR');assert.equal(exact.draft.payinCommission,'4');assert.equal(exact.draft.payoutCommission,'3');assert.equal(exact.draft.inrPerUsdt,'107');assert.equal(exact.draft.depositAddress,'TVvSJ9TubYsFucUqDCmZKHJnPRf3XGvEDA');
 assert.throws(()=>review.parseReply(user,'0.45 | 0.30 | 107 | invalid','INR'),/REVIEW_FORM_INVALID/);
 assert.throws(()=>review.parseReply(user,'0.45 | 0.30 | nope | T111111111111111111111111111111111','INR'),/REVIEW_FORM_INVALID/);
});
test('non-controller command never reads mappings, account data or sends a reply',async()=>{
 const {Bot}=require('../lib/wpay/notification-bot/engine');let touched=false;
 const bot=new Bot({access:{controller:async()=>false},store:{group:async()=>{touched=true;}},tenants:async()=>{touched=true;},telegram:{text:async()=>{touched=true;}}});
 await bot.command({chat,from:{id:1234567},text:'/users'},1);assert.equal(touched,false);
});
test('webhook isolation rejects old tokens, unrelated chat content and forged callbacks',async()=>{
 const {create,clean,PATH}=require('../lib/wpay/notification-bot/runtime');
 assert.throws(()=>create({env:{WPAY_NOTIFICATION_BOT_TOKEN:'same',TELEGRAM_BOT_TOKEN:'same'}}),/SEPARATE/);
 assert.equal(clean({update_id:1,message:{chat,from:{id:1234567},text:'private message'}}),null);
 assert.equal(clean({update_id:2,message:{chat,from:{id:Number(actor)},text:'0.45 | 0.30 | 107',reply_to_message:{message_id:77}}}).message.reply_to_message.message_id,77);
 assert.equal(clean({update_id:3,message:{chat,from:{id:Number(actor)},text:'ordinary group chatter'}}),null);
 assert.ok(clean({update_id:4,callback_query:{id:'review',data:'nb:review:'+'a'.repeat(32)+':approve',from:{id:Number(actor)},message:{chat,message_id:9}}}));
 assert.equal(clean({update_id:1,callback_query:{id:'query',data:'nb:received:bad',from:{id:1234567},message:{chat,message_id:1}}}),null);
 const service=create({pool:{},env:{WPAY_NOTIFICATION_BOT_TOKEN:'123456:abcdefghijklmnopqrstuvwxyz',WPAY_HOSTED_ORIGIN:'https://fixture.invalid'}}),sent=[];
 const helpers={send:(_,status,body)=>sent.push({status,body}),readBody:async()=>{throw Error('must not read');}};
 assert.equal(await service.webhook({url:'/old-bot',method:'POST',headers:{}},{},helpers),false);
 assert.equal(await service.webhook({url:PATH,method:'POST',headers:{}},{},helpers),true);assert.equal(sent.at(-1).status,403);
 await service.webhook({url:PATH+'/health',method:'GET',headers:{}},{},helpers);assert.equal(sent.at(-1).status,503);await service.stop();
});
