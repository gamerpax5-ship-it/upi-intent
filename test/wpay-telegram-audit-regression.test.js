'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {phones}=require('../lib/wpay/telegram/commands'),{Source}=require('../lib/wpay/telegram/source');
const fmt=require('../lib/wpay/telegram/format'),{Bot}=require('../lib/wpay/telegram/engine');
function fixture(){
 const now=Date.now(),from=new Date(now-3600000).toISOString(),until=new Date(now+3600000).toISOString();
 const link={id:'link',device_ref:'device-one',owner_id:'owner',valid_from:from,valid_until:until};
 const raw={id:link.device_ref,linked:true,phone_e164:'+919876543210, +919876543211',paired_at:from,last_seen_at:new Date(now).toISOString()};
 const pairing={devices:async()=>[raw]},source=new Source({pool:{query:async()=>({rows:[link]})},tenantIds:['tenant'],pairing});
 return {now,from,until,link,raw,pairing,source};
}
test('explicit dual-SIM phone lists normalize and both selectors find the same device',async()=>{
 assert.deepEqual(phones('+91 (98765) 43210; 9876543211 / +919876543210'),['919876543210','919876543211']);
 assert.deepEqual(phones('9876543210 9876543211'),[]);
 const {source}=fixture();for(const number of ['919876543210','919876543211']){
  const d=await source.device(number);assert.equal(d.phone,number);assert.equal(d.device,'device-one');
 }
 await assert.rejects(source.device('919876543212'),/DEVICE_NUMBER_NOT_FOUND/);
});
test('a phone present on distinct devices still fails ambiguous rather than guessing ownership',async()=>{
 const {source,pairing,raw,link}=fixture();source.links=async()=>[link,{...link,id:'other-link',device_ref:'device-two'}];
 pairing.devices=async()=>[raw,{...raw,id:'device-two'}];await assert.rejects(source.device('919876543210'),/AMBIGUOUS_DEVICE_NUMBER/);
});
test('history query and returned diagnostics stay within current pairing and ownership interval',async()=>{
 const {source,pairing,now,link}=fixture();let start;
 pairing.diagnostics=async(id,from)=>{start=from;return [
  {collected_at:new Date(now-7200000).toISOString(),network_type:'OLD_OWNER'},
  {collected_at:new Date(now-1000).toISOString(),network_type:'CURRENT'},
  {collected_at:new Date(now+1000).toISOString(),network_type:'FUTURE'},
  {collected_at:'bad',network_type:'INVALID'}];};
 const pages=await source.history('919876543210');assert.equal(+start,Date.parse(link.valid_from));
 assert.match(pages.join('\n'),/CURRENT/);assert.doesNotMatch(pages.join('\n'),/OLD_OWNER|FUTURE|INVALID/);
 link.valid_from='bad';await assert.rejects(source.history('919876543210'),/DEVICE_SOURCE_UNAVAILABLE/);
});
test('history messages stay within Telegram transport size with maximum-length network labels',async()=>{
 const {source,pairing,now}=fixture();pairing.diagnostics=async()=>Array.from({length:31},()=>({collected_at:new Date(now-1000).toISOString(),network_type:'x'.repeat(500),battery_level:100}));
 const pages=await source.history('919876543210');assert.equal(pages.length,5);for(const page of pages)assert.ok(page.length<=4000);
});
test('location keeps fix timestamp and never substitutes heartbeat or future time',()=>{
 const d={latitude:12,longitude:77,locationPermission:true,locationEnabled:true,locationAt:'2026-01-01T00:00:00Z',lastSeenAt:'2026-02-01T00:00:00Z'};
 assert.equal(fmt.location(d).at,'2026-01-01T00:00:00.000Z');
 for(const locationAt of [null,undefined,'bad','2999-01-01'])assert.equal(fmt.location({...d,locationAt}).at,null);
});
test('masked placeholders reflect validated length only; missing metadata never invents a length',()=>{
 for(let n=4;n<=8;n++)assert.ok(fmt.maskedEvent({otpLength:n}).includes('12345678'.slice(0,n)+' [MASKED]'));
 for(const n of [null,undefined,0,9,'6'])assert.match(fmt.maskedEvent({otpLength:n}),/OTP received: \[MASKED\]/);
 assert.doesNotMatch(fmt.maskedEvent({otpLength:6,code:'987654',message:'private body'}),/987654|private body/);
});
test('event projection reads length metadata and excludes raw codes and messages',async()=>{
 const {source}=fixture();let sql;
 source.operational={withRead:fn=>fn({query:async text=>{sql=text;return {rows:[{id:'1',otp_length:6,sms_received_at:'2026-01-01'}]};}})};
 const events=[];for await(const e of source.events('2026-01-01'))events.push(e);
 assert.equal(events.length,1);assert.equal(events[0].otpLength,6);assert.equal(events[0].phones.length,2);
 assert.match(sql,/e\.otp_length/);assert.doesNotMatch(sql,/code_mask|message_masked|sms_body|SELECT \*/i);
});
test('dual-number subscription sends one device event and never displays an excluded selector',async()=>{
 const sent=[],delivered=new Set(),chat={id:-123,type:'supergroup'};
 let state={otpAll:true,phones:[],excluded:['919876543210'],since:'2026-01-01'};
 const bot=new Bot({access:{allowed:async()=>true},telegram:{text:async(id,text)=>sent.push(text)},
  source:{events:async function*(){yield {id:'device:1',phone:'919876543210',phones:['919876543210','919876543211'],otpLength:6,receivedAt:'2026-02-01'};}},
  store:{groups:async()=>[{chat}],exclusive:async(id,fn)=>fn(state),delivered:async(c,k,id)=>delivered.has(id),markDelivered:async(c,k,id)=>delivered.add(id)}});
 await bot.tick();assert.equal(sent.length,1);assert.match(sent[0],/919876543211/);assert.doesNotMatch(sent[0],/919876543210/);
 state={...state,excluded:[]};await bot.tick();assert.equal(sent.length,1);
});
