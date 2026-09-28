'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {GroupAccess,CONTROLLER_IDS}=require('../lib/wpay/telegram/access');
const {parse}=require('../lib/wpay/telegram/commands'),{MENU,HELP}=require('../lib/wpay/telegram/catalog');
const chat={id:-100123,type:'supergroup'};
function fixture({botStatus='member',controllerStatus='member',lookupFails=false}={}){
 return new GroupAccess({botId:'123',requireAdmin:false,telegram:{call:async(method,args)=>{
  if(args.user_id==='123')return {status:botStatus};
  if(lookupFails)throw Error('unavailable');
  return {user:{id:Number(args.user_id)},status:args.user_id===CONTROLLER_IDS[0]?controllerStatus:'left'};
 }}});
}
test('normal group member bot can serve a verified controller without Admin',async()=>{
 assert.equal(await fixture().allowed(chat,Number(CONTROLLER_IDS[0])),true);
 assert.equal(await fixture().allowed(chat),true);
});
test('non-admin mode never bypasses controller verification or accepts strangers',async()=>{
 assert.equal(await fixture().allowed(chat,999),false);
 assert.equal(await fixture({lookupFails:true}).allowed(chat),false);
 assert.equal(await fixture({controllerStatus:'left'}).allowed(chat),false);
 assert.equal(await fixture({botStatus:'left'}).allowed(chat),false);
});
test('all requested command forms and menu aliases parse',()=>{
 for(const text of ['/status 9876543210','/location 9876543210','/connect 9876543210','/disconnect 9876543210','/disconnect all','/device history 9876543210','/devicehistoryall','/connectall','/creditutr shop@bank','/ceditutrall','/creditutrall','/disconnectall','/devicehistory 9876543210'])assert.ok(parse(text,'testbot'),text);
 assert.deepEqual(parse('/disconnectall@TestBot','testbot'),{command:'disconnect',all:true});
 assert.throws(()=>parse('/disconnectall extra','testbot'));
 for(const name of ['status','location','connect','disconnect','connectall','device','devicehistory','devicehistoryall','creditutr','creditutrall','ceditutrall'])assert.ok(MENU.some(x=>x.command===name),name);
 assert.equal(new Set(MENU.map(x=>x.command)).size,MENU.length);assert.ok(HELP.length<4000);
});
