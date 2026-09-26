'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {payoutTerms}=require('../lib/wpay/payouts/accounting');

test('PostgreSQL: old payout uses historical rate or first effective rate of a new User',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),server=new Pool({connectionString:url.toString()}),name='rate_history_'+randomUUID().replaceAll('-','');
 await server.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const db=new Pool({connectionString:url.toString()});
 t.after(async()=>{await db.end();await server.query('DROP DATABASE '+name);await server.end();});
 await db.query('CREATE SCHEMA wpay_auth');
 await db.query('CREATE TABLE wpay_auth.commercial_versions(id uuid PRIMARY KEY,account_id uuid,version integer,settings jsonb,effective_at timestamptz)');
 const user=randomUUID(),unset=randomUUID(),scheduled=randomUUID();
 const add=(owner,version,days,rate)=>db.query("INSERT INTO wpay_auth.commercial_versions VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP+($5*interval '1 day'))",[randomUUID(),owner,version,{payoutCommission:rate},days]);
 await add(user,1,-10,'1');await add(user,2,-5,'2');await add(user,3,1,'9');
 const at=async days=>(await db.query("SELECT CURRENT_TIMESTAMP+($1*interval '1 day') AS at",[days])).rows[0].at;
 assert.equal((await payoutTerms(db,user,await at(-20))).settings.payoutCommission,'1');
 assert.equal((await payoutTerms(db,user,await at(-7))).settings.payoutCommission,'1');
 assert.equal((await payoutTerms(db,user,await at(-2))).settings.payoutCommission,'2');
 await add(user,4,-1,'4');
 assert.equal((await payoutTerms(db,user,await at(-20))).settings.payoutCommission,'1');
 assert.equal((await payoutTerms(db,user,await at(-2))).settings.payoutCommission,'2');
 await assert.rejects(payoutTerms(db,unset,await at(-20)),{code:'UNAVAILABLE'});
 await add(scheduled,1,1,'7');
 await assert.rejects(payoutTerms(db,scheduled,await at(-20)),{code:'UNAVAILABLE'});
});
