'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{readFile}=require('node:fs/promises'),path=require('node:path'),{Pool}=require('pg');
const {migrate}=require('../lib/wpay/db/migrations');
const {Store}=require('../lib/wpay/notification-bot/store');
const {Bot}=require('../lib/wpay/notification-bot/engine');
const {CONTROLLERS}=require('../lib/wpay/notification-bot/policy');
test('Notification Bot persistence, duplicate commands, tenant isolation and group reset on real PostgreSQL',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const server=new Pool({connectionString:url.toString()}),name='notification_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});
 await migrate(pool);
 const user=randomUUID(),other=randomUUID();
 for(const [id,email,tenant] of [[user,'user@example.com','one'],[other,'other@example.com','two']])await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,user_id) VALUES($1,$2,$3,'Fixture User',$4,'user',$5)",[id,randomUUID(),tenant,email,randomUUID()]);
 const store=new Store(pool),sent=[],access={controller:async()=>true,receiver:async()=>true},telegram={text:async(chat,text,markup)=>sent.push({chat,text,markup}),call:async()=>({})};
 const bot=new Bot({store,access,telegram,username:'notification_test_bot',tenants:async()=>['one']});
 const chat={id:-100123456,type:'supergroup'},message={chat,from:{id:CONTROLLERS[0],is_bot:false},text:'/setuser user@example.com 1234567'};
 await store.accept(1,message);await store.accept(1,message);assert.equal((await store.pending()).length,1);
 await Promise.all([bot.command(message,1),bot.command(message,1)]);
 assert.equal(sent.length,1);
 const restored=new Store(pool);
 await restored.group(chat,['one'],async(c,row)=>{assert.equal(row.state.mappings.length,1);assert.equal(row.state.mappings[0].accountId,user);assert.equal(await restored.account(c,'other@example.com','user',['one']),undefined);});
 await assert.rejects(restored.group(chat,['two'],async()=>{}),/GROUP_SCOPE_CHANGED/);
 const reset={...message,text:'/resetgroup'};await store.accept(2,reset);await bot.command(reset,2);
 const data=sent.at(-1).markup.inline_keyboard[0][0].callback_data;
 const query={id:'test-callback',data,from:message.from,message:{chat}};await store.accept(3,query);assert.equal(await bot.reset(query,3),true);
 await restored.group(chat,['one'],async(c,row)=>{assert.equal(row.state.role,null);assert.deepEqual(row.state.mappings,[]);});
 await assert.rejects(bot.reset(query,4),/RESET_DENIED/);
 assert.equal((await pool.query('SELECT count(*)::int n FROM wpay_auth.notification_bot_audit')).rows[0].n,3);
 await assert.rejects(pool.query("UPDATE wpay_auth.notification_bot_audit SET operation='changed'"),e=>e.code==='42501');
 const tables=(await pool.query("SELECT relname,relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='wpay_auth' AND relname=ANY($1)",[['notification_bot_groups','notification_bot_audit','notification_bot_updates']])).rows;
 assert.equal(tables.length,3);assert.ok(tables.every(r=>r.relrowsecurity));
 // A distinct browser-like role must not read new mappings even when it can
 // connect to the schema. Role name is unique; cleaned up after this assertion.
 const reader='notification_reader_'+randomUUID().replaceAll('-','');await pool.query('CREATE ROLE '+reader);await pool.query('GRANT USAGE ON SCHEMA wpay_auth TO '+reader);
 const c=await pool.connect();try{await c.query('SET ROLE '+reader);await assert.rejects(c.query('SELECT * FROM wpay_auth.notification_bot_groups'),e=>e.code==='42501');}finally{await c.query('RESET ROLE');c.release();await pool.query('REVOKE USAGE ON SCHEMA wpay_auth FROM '+reader);await pool.query('DROP ROLE '+reader);}
});
