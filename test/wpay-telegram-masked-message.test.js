'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Source}=require('../lib/wpay/telegram/source'),{maskedEvent}=require('../lib/wpay/telegram/format'),{Bot}=require('../lib/wpay/telegram/engine');
function fixture(row){
 let captured;const source=new Source({operational:{withRead:fn=>fn({query:async(sql,args)=>{captured={sql,args};return {rows:[row]};}})}});
 source.devices=async()=>[{device:'owned-device',phone:'919876543210',phones:['919876543210'],link:{valid_from:'2026-01-01',valid_until:'2027-01-01'}}];
 return {source,query:()=>captured};
}
test('connected notifications include sender and redacted message without yielding legacy raw fields',async()=>{
 const {source,query}=fixture({id:'1',sender:'VM-BANK',otp_length:6,sms_received_at:'2026-02-01',code:'872194',message:'Your OTP 872194. Backup 639582. https://example.invalid/token/secret'});
 const event=(await source.events('2026-01-01',{includeMaskedContent:true}).next()).value;
 assert.equal(event.sender,'VM-BANK');assert.match(event.maskedMessage,/Your OTP 123456/);
 const text=maskedEvent(event);assert.match(text,/Sender: VM-BANK/);assert.match(text,/Message \(masked\): Your OTP 123456/);
 assert.doesNotMatch(JSON.stringify(event)+text,/872194|639582|example.invalid|token\/secret/);assert.equal(event.code,undefined);assert.equal(event.message,undefined);
 assert.match(query().sql,/e\.sender,e\.code_mask AS code,e\.message_masked AS message/);assert.doesNotMatch(query().sql,/sms_body|raw_result|SELECT \*/i);
 assert.deepEqual(query().args,['owned-device','9223372036854775807','2026-01-01','2026-01-01','2027-01-01']);
});
test('missing or mismatched mask proof never forwards uncertain stored SMS',async()=>{
 for(const code of [undefined,'','123456']){
  const {source}=fixture({id:'1',sender:'BANK',otp_length:6,code,message:'Secret OTP 872194',sms_received_at:'2026-02-01'});
  const event=(await source.events('2026-01-01',{includeMaskedContent:true}).next()).value;
  assert.match(maskedEvent(event),/Message \(masked\): \[Masked message\]/);assert.doesNotMatch(JSON.stringify(event),/872194/);
 }
 assert.doesNotMatch(maskedEvent({message:'raw 872194',code:'872194',maskedMessage:'raw 872194'}),/872194/);
});
test('missing sender/message and maximum-length content remain bounded and explicit',()=>{
 assert.match(maskedEvent({contentMasked:true}),/Sender: Unavailable/);assert.match(maskedEvent({contentMasked:true}),/Message \(masked\): Unavailable/);
 const text=maskedEvent({phone:'1'.repeat(500),sender:'BANK\n'.repeat(100),otpLength:6,contentMasked:true,maskedMessage:'OTP 123456 '+('safe '.repeat(2000))});
 assert.ok(text.length<4000);assert.match(text,/OTP received: 123456 \[MASKED\]/);
});
test('connect subscription opts in to safe content and routes only its selected device',async()=>{
 let options;const sent=[],chat={id:-123,type:'supergroup'};
 const bot=new Bot({access:{allowed:async()=>true},telegram:{text:async(id,text)=>sent.push(text)},
  source:{events:async function*(since,opts){options=opts;yield {id:'owned:1',phone:'919876543210',phones:['919876543210'],receivedAt:'2026-02-01',otpLength:6,sender:'VM-BANK',contentMasked:true,maskedMessage:'OTP 123456'};
   yield {id:'other:1',phone:'919876543211',receivedAt:'2026-02-01',sender:'OTHER'};}},
  store:{groups:async()=>[{chat}],exclusive:async(id,fn)=>fn({phones:['919876543210'],since:'2026-01-01'}),delivered:async()=>false,markDelivered:async()=>{}}});
 await bot.tick();assert.deepEqual(options,{includeMaskedContent:true});assert.equal(sent.length,1);assert.match(sent[0],/Sender: VM-BANK/);assert.match(sent[0],/Message \(masked\): OTP 123456/);
});

test('masked message projection executes with PostgreSQL and preserves device/time filters',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const {Pool}=require('pg'),{randomUUID}=require('node:crypto');const url=new URL(process.env.TEST_DATABASE_URL);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const admin=new Pool({connectionString:url.toString()}),name='telegram_message_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 await pool.query('CREATE TABLE public.device_otp_events(id bigint,device_id text,sms_received_at timestamptz,created_at timestamptz,otp_length int,sender text,code_mask text,message_masked text)');
 await pool.query("INSERT INTO public.device_otp_events VALUES (1,'owned-device','2026-02-01','2026-02-01',6,'VM-BANK','872194','Your OTP 872194'),(2,'other-device','2026-02-01','2026-02-01',6,'FOREIGN','456789','OTP 456789'),(3,'owned-device','2025-12-01','2025-12-01',6,'OLD','456789','OTP 456789')");
 const {source}=fixture({});source.operational={withRead:fn=>fn(pool)};const rows=[];
 for await(const event of source.events('2026-01-01',{includeMaskedContent:true}))rows.push(event);
 assert.equal(rows.length,1);assert.equal(rows[0].sender,'VM-BANK');assert.equal(rows[0].maskedMessage,'Your OTP 123456');assert.doesNotMatch(JSON.stringify(rows),/872194|456789|FOREIGN|OLD/);
});
