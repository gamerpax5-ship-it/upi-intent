'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Pool}=require('pg');
const {migrate,validateMigrations}=require('../lib/wpay/db/migrations'),{Store}=require('../lib/wpay/telegram/store');
test('Telegram PostgreSQL subscriptions survive store restart and duplicate commands are serialized',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const server=new Pool({connectionString:url.toString()}),name='telegram_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()}),s=new Store(pool);t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});
 await migrate(pool);await validateMigrations(pool);const chat={id:-1001234567890,type:'supergroup'},message={chat,from:{id:8248339578},text:'/connectall'};
 await s.accept(10,message);await s.accept(10,message);assert.equal((await s.pending()).length,1);
 let applied=0;await Promise.all([1,2].map(()=>s.exclusive(chat.id,async()=>{if(await s.processed(10))return;applied++;await s.save(chat,{otpAll:true,phones:[],excluded:[],since:'2026-09-28T00:00:00Z'});await s.markProcessed(10);})));assert.equal(applied,1);
 const restored=new Store(pool);assert.equal((await restored.groups()).length,1);await restored.exclusive(chat.id,state=>assert.equal(state.otpAll,true));assert.equal((await restored.pending()).length,0);
 await restored.markDelivered(chat.id,'otp','device:1');assert.equal(await new Store(pool).delivered(chat.id,'otp','device:1'),true);assert.equal(await restored.delivered(-100999,'otp','device:1'),false);
});
