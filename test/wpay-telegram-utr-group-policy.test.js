'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {GroupAccess,CONTROLLER_IDS}=require('../lib/wpay/telegram/access'),{Bot}=require('../lib/wpay/telegram/engine'),{parse}=require('../lib/wpay/telegram/commands');
const [one,two,three]=CONTROLLER_IDS,chat={id:-12345,type:'supergroup'};
function fixture(){
 const members=new Set([one,two]);const access=new GroupAccess({botId:'123',requireAdmin:false,ids:[...CONTROLLER_IDS,'999'],telegram:{call:async(method,args)=>args.user_id==='123'?{status:'member'}:{status:members.has(args.user_id)?'member':'left',user:{id:Number(args.user_id)}}}});
 return {members,access};
}
test('UTR requires two of the exact five current members and a present listed command sender',async()=>{
 const {access,members}=fixture();assert.equal(await access.allowedUtr(chat,one),true);assert.equal(await access.allowedUtr(chat,three),false);
 members.add('999');assert.equal(await access.allowedUtr(chat,'999'),false);
 members.delete(two);assert.equal(await access.allowedUtr(chat,one),false);assert.equal(await access.allowed(chat,one),true);
 for(const type of ['private','channel'])assert.equal(await access.allowedUtr({...chat,type},one),false);
});
test('UTR membership API failure cannot supply the missing second controller',async()=>{
 const access=new GroupAccess({botId:'123',requireAdmin:false,telegram:{call:async(m,a)=>{if(a.user_id==='123')return {status:'member'};if(a.user_id===one)return {status:'member',user:{id:Number(one)}};throw Error('unavailable');}}});
 assert.equal(await access.allowedUtr(chat,one),false);
});
function engineFixture(){
 const {members,access}=fixture(),sent=[],reads=[],delivered=new Set();let state;
 const source={utrs:async function*(filter,since){reads.push({filter,since});for(const [id,upi] of [['1','shopa@bank'],['2','shopb@bank']])if(!filter||filter===upi)yield {id,upi,utr:'12345678901'+id,amount:'10.00',at:'2026-01-01'};}};
 const bot=new Bot({access,source,username:'testbot',telegram:{text:async(id,text)=>sent.push({id,text})},onError:()=>{},store:{
  exclusive:async(id,fn)=>fn(state),processed:async()=>false,markProcessed:async()=>{},save:async(c,s)=>{state=s;},
  groups:async()=>state?[{chat}]:[],delivered:async(c,k,id)=>delivered.has(id),markDelivered:async(c,k,id)=>delivered.add(id)}});
 return {bot,members,sent,reads,source,get:()=>state,set:s=>{state=s;},command:(text,id=1,actor=one)=>bot.command({chat,from:{id:Number(actor)},text},id)};
}
test('blocked UTR commands and aliases never read source or create a subscription',async()=>{
 const f=engineFixture();f.members.delete(two);
 for(const cmd of ['/creditutrall','/ceditutrall','/creditutr','/creditutr shopa@bank'])await f.command(cmd);
 assert.equal(f.reads.length,0);assert.equal(f.get(),undefined);assert.equal(f.sent.length,0);
});
test('All UTR takes historical scope, persists actor and delivers only to the invoking group once',async()=>{
 const f=engineFixture();await f.command('/creditutrall');assert.equal(f.get().utrActor,one);assert.equal(f.get().utrSince,null);
 await f.bot.tick();await f.bot.tick();const results=f.sent.filter(x=>x.text.startsWith('UTR:'));assert.equal(results.length,2);assert.ok(results.every(x=>x.id===chat.id));
 assert.ok(f.reads.every(r=>r.since===undefined));
 await f.command('/creditutrall',2);await f.bot.tick();assert.equal(f.sent.filter(x=>x.text.startsWith('UTR:')).length,4);
});
test('UPI history switches off all-stream and only requests that UPI',async()=>{
 const f=engineFixture();await f.command('/creditutrall');await f.command('/creditutr shopa@bank',2);assert.equal(f.get().utrAll,false);
 f.reads.length=0;await f.bot.tick();assert.ok(f.reads.every(x=>x.filter==='shopa@bank'));
 assert.equal(f.sent.filter(x=>x.text.startsWith('UTR:')).length,1);
 assert.deepEqual(parse('/creditutrall shopa@bank','testbot'),{command:'creditutrall',upi:'shopa@bank'});
 assert.deepEqual(parse('/creditutr','testbot'),{command:'creditutrall'});
});
test('UTR delivery pauses before source reads when membership or initiating actor disappears',async()=>{
 const f=engineFixture();await f.command('/creditutrall');f.members.delete(two);f.reads.length=0;await f.bot.tick();assert.equal(f.reads.length,0);
 f.members.add(two);f.members.add(three);f.members.delete(one);await f.bot.tick();assert.equal(f.reads.length,0);
});
test('membership is rechecked between individual UTR messages',async()=>{
 const f=engineFixture();await f.command('/creditutrall');let count=0;
 f.bot.telegram.text=async()=>{count++;f.members.delete(two);};await f.bot.tick();assert.equal(count,1);
});
test('legacy UTR subscriptions without a recorded initiating actor cannot deliver',async()=>{
 const f=engineFixture();f.set({utrAll:true,since:'2026-01-01'});await f.bot.tick();assert.equal(f.reads.length,0);assert.equal(f.sent.length,0);
});
