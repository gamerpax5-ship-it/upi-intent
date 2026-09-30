'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {parse}=require('../lib/wpay/notification-bot/commands'),aliases=require('../lib/wpay/notification-bot/usernames');
const {change,empty,receiver}=require('../lib/wpay/notification-bot/mappings'),{CONTROLLERS,Access}=require('../lib/wpay/notification-bot/policy');
const {clean}=require('../lib/wpay/notification-bot/runtime');
const controller=CONTROLLERS[0],account={id:randomUUID(),email:'user@fixture.invalid',account_type:'user',status:'active'},chat={id:-100987123,type:'supergroup'};
const command=(text)=>parse(text,'notifier_wpaybot');
const invitation=(names='@First_User @Second_User',now=Date.now())=>change(empty(),command('/setuser '+account.email+' '+names),account,controller,now).state;
test('username commands accept batches and commas, normalize case, retain numerical compatibility',()=>{
 assert.deepEqual(command('/setuser@notifier_wpaybot '+account.email+' @First_User, @Second_User @FIRST_USER'),{command:'setuser',email:account.email,usernames:['first_user','second_user']});
 assert.equal(command('/setuser '+account.email+' 1234567').telegramId,'1234567');
 assert.equal(command('/removeuser '+account.email+' @First_User').telegramUsername,'first_user');
 assert.equal(command('/resetuser '+account.email+' @First_User @New_User').oldTarget,'@first_user');
 for(const text of ['/setuser '+account.email+' @abc-name','/setuser '+account.email+' @valid 1234567','/setuser '+account.email+' '+Array.from({length:11},(_,i)=>'@user'+i).join(' ')])assert.throws(()=>command(text));
});
test('batch mapping preserves previous users and requires explicit identity connection',()=>{
 const initial=invitation(),next=change(initial,command('/setuser '+account.email+' @Third_User'),account,controller).state;
 assert.equal(initial.mappings.length,2);assert.equal(next.mappings.length,3);assert.equal(next.mappings[0].id,initial.mappings[0].id);
 assert.equal(receiver(next,{mappingId:next.mappings[0].id,accountId:account.id,telegramId:'1234567'}),false);
 const markup=aliases.buttons(initial,account.id,['first_user','second_user']);assert.equal(markup.inline_keyboard.length,2);
 assert.ok(markup.inline_keyboard.every(row=>Buffer.byteLength(row[0].callback_data)<=64));
});
test('binding uses trusted Telegram identity, rejects controllers and locks the numerical identity',()=>{
 const state=invitation(),m=state.mappings[0],person={id:1234567,username:'First_User',is_bot:false};
 for(const patch of [{username:'wrong'},{username:undefined},{is_bot:true},...CONTROLLERS.map(id=>({id}))])assert.throws(()=>aliases.bind(state,m.id,{...person,...patch}));
 const bound=aliases.bind(state,m.id,person).state;
 assert.equal(receiver(bound,{mappingId:m.id,accountId:account.id,telegramId:'1234567'}),true);
 assert.equal(receiver(bound,{mappingId:m.id,accountId:account.id,telegramId:'7654321'}),false);
 assert.throws(()=>aliases.bind(bound,m.id,{...person,id:7654321}),/DENIED/);
 assert.equal(aliases.bind(bound,m.id,person).changed,false);
 assert.equal(aliases.buttons(bound,account.id,['first_user']),undefined);
});
test('expired, removed and replaced username invitations cannot authorize old buttons',()=>{
 const state=invitation('@First_User',1000),m=state.mappings[0],person={id:1234567,username:'First_User'};
 assert.throws(()=>aliases.bind(state,m.id,person,1000+aliases.TTL),/EXPIRED/);
 const refreshed=change(state,command('/setuser '+account.email+' @First_User'),account,controller,1000+aliases.TTL).state;
 assert.notEqual(refreshed.mappings[0].id,m.id);assert.throws(()=>aliases.bind(refreshed,m.id,person));
 const removed=change(state,command('/removeuser '+account.email+' @First_User'),account,controller).state;
 assert.equal(removed.mappings.length,0);assert.throws(()=>aliases.bind(removed,m.id,person));
 const reset=change(state,command('/resetuser '+account.email+' @First_User @Second_User'),account,controller).state;
 assert.equal(reset.mappings[0].telegramUsername,'second_user');assert.throws(()=>aliases.bind(reset,m.id,person));
});
test('non-admin bot membership is allowed while leave, ban, muted bot and lookup failure stay blocked',async()=>{
 const make=(botStatus='member',actorStatus='member',error=false,canSend=true)=>new Access({botId:'100',allowMemberBot:true,telegram:{call:async(_,body)=>{if(error)throw Error('unavailable');return {user:{id:Number(body.user_id),is_bot:body.user_id==='100'},status:body.user_id==='100'?botStatus:actorStatus,is_member:true,can_send_messages:canSend};}}});
 assert.equal(await make().controller(chat,controller),true);assert.equal(await make().receiver(chat,'1234567'),true);
 for(const a of [make('left'),make('member','left'),make('member','kicked'),make('restricted','member',false,false),make('member','member',true)])assert.equal(await a.receiver(chat,'1234567'),false);
 assert.equal(await make().receiver(chat,controller),false);
});
test('callback projection keeps only actual sender username, not text or forwarded identity',()=>{
 const mappingId=randomUUID(),update={update_id:8,callback_query:{id:'query',data:'nb:bind:'+mappingId,from:{id:1234567,username:'First_User',first_name:'Ignored'},message:{chat,message_id:4,text:'@someone_else'}}};
 const result=clean(update);assert.equal(result.callback_query.from.username,'first_user');assert.equal(result.callback_query.message.text,undefined);
 assert.equal(clean({...update,callback_query:{...update.callback_query,data:'nb:bind:bad'}}),null);
});
test('PostgreSQL username batch and connection persist without weakening group or account scope',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),server=new Pool({connectionString:url.toString()}),name='notification_alias_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});
 await require('../lib/wpay/db/migrations').migrate(pool);
 await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,user_id) VALUES($1,$2,'scope-a','Fixture',$3,'user',$4)",[account.id,randomUUID(),account.email,randomUUID()]);
 const {Store}=require('../lib/wpay/notification-bot/store'),{Bot}=require('../lib/wpay/notification-bot/engine'),store=new Store(pool),sent=[];
 const bot=new Bot({store,username:'notifier_wpaybot',tenants:async()=>['scope-a'],access:{controller:async()=>true,receiver:async(_,id)=>!CONTROLLERS.includes(String(id))},telegram:{text:async(_,text,markup)=>sent.push({text,markup}),call:async()=>({})}});
 const message={chat,from:{id:controller},text:'/setuser '+account.email+' @First_User @Second_User'};
 await store.accept(100,{message});await Promise.all([bot.command(message,100),bot.command(message,100)]);assert.equal(sent.length,1);
 assert.equal(sent[0].markup.inline_keyboard.length,2);
 const query={id:'q',data:sent[0].markup.inline_keyboard[0][0].callback_data,from:{id:1234567,username:'first_user'},message:{chat,message_id:50}};
 await store.accept(101,{callback_query:query});assert.equal(await bot.bindUsername(query,101),true);
 const persisted=(await pool.query('SELECT state FROM wpay_auth.notification_bot_groups WHERE chat_id=$1',[chat.id])).rows[0].state;
 assert.equal(persisted.mappings[0].telegramId,'1234567');assert.equal(persisted.mappings[1].telegramId,null);
 await store.accept(102,{callback_query:query});await assert.rejects(bot.bindUsername({...query,from:{id:7654321,username:'first_user'}},102),/DENIED/);
 await assert.rejects(store.group(chat,['different-tenant'],async()=>{}),/GROUP_SCOPE_CHANGED/);
 const remove={...message,text:'/removeuser '+account.email+' @First_User'};await store.accept(103,{message:remove});await bot.command(remove,103);
 await store.accept(104,{callback_query:query});await assert.rejects(bot.bindUsername(query,104),/DENIED/);
 assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.business_financial_events')).rows[0].n,0);
});
