'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {GroupAccess,CONTROLLER_IDS,UTR_CONTROLLER_IDS}=require('../lib/wpay/telegram/access');
const {redact,readMessages}=require('../lib/wpay/telegram/transaction-message'),{Source}=require('../lib/wpay/telegram/source'),{utr}=require('../lib/wpay/telegram/format');
test('sixth ID is UTR-only and still needs another listed current group member',async()=>{
 assert.equal(CONTROLLER_IDS.length,5);assert.equal(UTR_CONTROLLER_IDS.length,6);assert.ok(UTR_CONTROLLER_IDS.includes('6749918659'));
 const members=new Set(['6749918659',CONTROLLER_IDS[0]]),chat={id:-123,type:'supergroup'};
 const access=new GroupAccess({botId:'123',requireAdmin:false,telegram:{call:async(m,a)=>a.user_id==='123'?{status:'member'}:{user:{id:Number(a.user_id)},status:members.has(a.user_id)?'member':'left'}}});
 assert.equal(await access.allowedUtr(chat,'6749918659'),true);assert.equal(await access.allowed(chat,'6749918659'),false);
 members.delete(CONTROLLER_IDS[0]);assert.equal(await access.allowedUtr(chat,'6749918659'),false);
});
test('transaction messages require exact UTR, mask numeric tokens/links and hide credential text',()=>{
 const text=redact('Credited INR 1250 to a/c XX1234 UTR 123456789012. https://bank.invalid/private','123456789012');
 assert.match(text,/Credited INR \[MASKED\]/);assert.doesNotMatch(text,/1250|XX1234|123456789012|bank.invalid|private/);
 for(const text of ['OTP AB12CD UTR 123456789012','password secret UTR 123456789012','Other transaction 999999999999'])assert.equal(redact(text,'123456789012'),'[Masked message]');
 assert.equal(redact(null,'123456789012'),null);
});
test('message lookup binds device, exact row IDs, UTR and authorized dates; source failure stays unavailable',async()=>{
 const link={resource_id:'owned',valid_from:'2026-01-01',valid_until:'2027-01-01'},rows=[{id:'1',utr:'123456789012'}];let query;
 const op={withRead:fn=>fn({query:async(sql,args)=>{query={sql,args};return {rows:[{id:'1',utr:'123456789012',sender:'BANK',sms_body:'Credit UTR 123456789012'},{id:'2',utr:'999999999999',sms_body:'OTHER'}]};}})};
 const result=await readMessages(op,link,rows);assert.equal(result.size,1);assert.equal(result.get('1').maskedMessage,'Credit UTR [MASKED]');
 assert.deepEqual(query.args,['owned',['1'],'2026-01-01','2027-01-01']);assert.doesNotMatch(query.sql,/raw_result|SELECT \*/i);
 assert.equal((await readMessages({withRead:async()=>{throw Error('private failure');}},link,rows)).size,0);
});
test('UTR enrichment uses phone only from matching device owner, never another owner or statement',async()=>{
 const link={id:'link',resource_kind:'device',resource_id:'device',account_id:'owner',upi:'shop@bank',read_from:'2026-01-01',read_until:'2027-01-01'};
 const source=new Source({pool:{query:async()=>({rows:[link]})},tenantIds:['tenant'],legacy:{read:async()=>({rows:[{id:'1',utr:'123456789012',amount:'50.00',created_at:'2026-02-01'}],nextCursor:null})}});
 source.devices=async()=>[{device:'device',phones:['919876543210'],link:{owner_id:'owner'}}];
 let result=(await source.utrs(null).next()).value;assert.equal(result.apkNumber,'919876543210');assert.match(utr(result),/APK number \(current\): 919876543210/);assert.match(utr(result),/Message \(masked\): Unavailable/);
 source.devices=async()=>[{device:'device',phones:['919876543211'],link:{owner_id:'other'}}];result=(await source.utrs(null).next()).value;assert.equal(result.apkNumber,null);
 link.resource_kind='statement_import';result=(await source.utrs(null).next()).value;assert.match(utr(result),/Not applicable — statement record/);
});
test('PostgreSQL transaction enrichment excludes foreign and out-of-window rows',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const {Pool}=require('pg'),{randomUUID}=require('node:crypto'),url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
 const admin=new Pool({connectionString:url.toString()}),name='utr_message_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 await pool.query('CREATE TABLE device_transactions(id bigint,device_id text,utr text,sender text,sms_body text,created_at timestamptz)');
 await pool.query("INSERT INTO device_transactions VALUES (1,'owned','123456789012','BANK','Credited UTR 123456789012','2026-02-01'),(2,'foreign','123456789013','OTHER','UTR 123456789013','2026-02-01'),(3,'owned','123456789014','OLD','UTR 123456789014','2025-01-01')");
 const result=await readMessages({withRead:fn=>fn(pool)},{resource_id:'owned',valid_from:'2026-01-01',valid_until:'2027-01-01'},[1,2,3].map((id)=>({id:String(id),utr:'12345678901'+(id+1)})));
 assert.equal(result.size,1);assert.equal(result.get('1').sender,'BANK');assert.equal(result.get('1').maskedMessage,'Credited UTR [MASKED]');
});
