'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {GroupAccess,CONTROLLER_IDS}=require('../lib/wpay/telegram/access');
const {Bot}=require('../lib/wpay/telegram/engine');
const chat={id:-1001234567890,type:'supergroup'};
function fixture(){
 const members=new Set([CONTROLLER_IDS[0]]);let calls=0;
 const access=new GroupAccess({botId:'123',telegram:{call:async(method,args)=>{
  calls++;return args.user_id==='123'?{status:'administrator'}:{user:{id:Number(args.user_id)},status:members.has(args.user_id)?'member':'left'};
 }}});
 return {access,members,calls:()=>calls};
}
test('ordinary group members cannot command even when a controller is present',async()=>{
 const f=fixture();assert.equal(await f.access.allowed(chat,999),false);assert.equal(f.calls(),0);
});
test('command sender must personally be an allowlisted current group member',async()=>{
 const f=fixture();assert.equal(await f.access.allowed(chat,Number(CONTROLLER_IDS[0])),true);
 assert.equal(await f.access.allowed(chat,Number(CONTROLLER_IDS[1])),false);
 f.members.delete(CONTROLLER_IDS[0]);assert.equal(await f.access.allowed(chat,Number(CONTROLLER_IDS[0])),false);
});
test('engine denies unauthorized commands before reading or subscribing',async()=>{
 const f=fixture();let touched=false;
 const bot=new Bot({access:f.access,source:{device:async()=>{touched=true;}},store:{exclusive:async()=>{touched=true;}}});
 await bot.command({chat,from:{id:999},text:'/connectall'},1);assert.equal(touched,false);
});
