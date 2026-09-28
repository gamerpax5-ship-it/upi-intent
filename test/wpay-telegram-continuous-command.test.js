'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parse}=require('../lib/wpay/telegram/commands'),{MENU,HELP}=require('../lib/wpay/telegram/catalog'),{Bot}=require('../lib/wpay/telegram/engine');
test('requested continuous spelling maps to existing secure stream and handles mentions',()=>{
 assert.deepEqual(parse('/creditutrcountinue all','testbot'),{command:'creditutrall'});
 assert.deepEqual(parse('/creditutrcountinue@TestBot ALL','testbot'),{command:'creditutrall'});
 assert.deepEqual(parse('/creditutrcountinue Shop@Bank','testbot'),{command:'creditutrall',upi:'shop@bank'});
 assert.equal(parse('/creditutrcountinue@other all','testbot'),null);
 for(const s of ['/creditutrcountinue','/creditutrcountinue upi','/creditutrcountinue all extra'])assert.throws(()=>parse(s,'testbot'));
 assert.ok(MENU.some(m=>m.command==='creditutrcountinue'));assert.ok(HELP.includes('/creditutrcountinue all'));assert.ok(HELP.length<4000);
});
function setup(){
 const chat={id:-123,type:'supergroup'},sent=[],delivered=new Set();let state,allowed=true;
 const events=[{id:'1',upi:'shop@bank',utr:'123456789012',amount:'10.00',at:'2026-01-01'}];
 const bot=new Bot({username:'testbot',access:{allowed:async()=>true,allowedUtr:async()=>allowed},telegram:{text:async(id,text)=>sent.push(text)},
 source:{utrs:async function*(filter){for(const e of events)if(!filter||e.upi===filter)yield e;}},
 store:{exclusive:async(id,fn)=>fn(state),processed:async()=>false,markProcessed:async()=>{},save:async(c,s)=>{state=s;},groups:async()=>state?[{chat}]:[],delivered:async(c,k,id)=>delivered.has(id),markDelivered:async(c,k,id)=>delivered.add(id)}});
 return {bot,events,sent,state:()=>state,deny:()=>{allowed=false;},command:(text,id)=>bot.command({chat,from:{id:8248339578},text},id)};
}
test('continuous all sends later arrivals once; changing to UPI excludes other UPI arrivals',async()=>{
 const f=setup();await f.command('/creditutrcountinue all',1);assert.equal(f.state().utrAll,true);
 await f.bot.tick();await f.bot.tick();assert.equal(f.sent.filter(s=>s.startsWith('UTR:')).length,1);
 f.events.push({id:'2',upi:'other@bank',utr:'123456789013',amount:'20.00'});await f.bot.tick();assert.equal(f.sent.filter(s=>s.startsWith('UTR:')).length,2);
 await f.command('/creditutrcountinue shop@bank',2);assert.equal(f.state().utrFilter,'shop@bank');await f.bot.tick();
 const n=f.sent.length;f.events.push({id:'3',upi:'other@bank',utr:'123456789014',amount:'30.00'});await f.bot.tick();assert.equal(f.sent.length,n);
 f.events.push({id:'4',upi:'shop@bank',utr:'123456789015',amount:'40.00'});await f.bot.tick();assert.equal(f.sent.length,n+1);
 f.deny();f.events.push({id:'5',upi:'shop@bank',utr:'123456789016',amount:'50.00'});await f.bot.tick();assert.equal(f.sent.length,n+1);
});
test('continuous alias cannot bypass group authorization or missing source mappings',async()=>{
 const denied=setup();denied.deny();await denied.command('/creditutrcountinue all',1);assert.equal(denied.state(),undefined);assert.equal(denied.sent.length,0);
 const missing=setup();missing.bot.source.utrs=async function*(){throw Error('VERIFIED_UPI_SOURCE_MAPPING_REQUIRED');};
 await assert.rejects(missing.command('/creditutrcountinue all',1),/VERIFIED_UPI_SOURCE_MAPPING_REQUIRED/);assert.equal(missing.state(),undefined);assert.equal(missing.sent.length,0);
});
