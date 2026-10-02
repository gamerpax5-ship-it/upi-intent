'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Onboarding}=require('../lib/wpay/onboarding/workflow');
test('User analytics includes owned Admin-added routes and verified owner starts, excludes other owners and stale versions',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));const {Pool}=require('pg'),server=new Pool({connectionString:url.toString()}),name='user_routes_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});
 await pool.query(`CREATE SCHEMA wpay_auth;
 CREATE TABLE wpay_auth.business_bank_accounts(id text PRIMARY KEY,owner_id text,version int,status text,verified_version int,frozen boolean DEFAULT false,deactivated boolean DEFAULT false,created_at timestamptz DEFAULT now());
 CREATE TABLE wpay_auth.business_bank_versions(bank_id text,version int,details jsonb);
 CREATE TABLE wpay_auth.admin_bank_approvals(bank_id text,bank_version int);
 CREATE TABLE wpay_auth.business_audit(id text,entity_id text,owner_id text,actor_id text,event text,metadata jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE wpay_auth.business_reservations(id text,bank_id text,user_id text,state text,expires_at timestamptz);
 CREATE TABLE wpay_auth.gateway_orders(id text,reservation_id text,state text,amount_minor numeric);
 CREATE TABLE wpay_auth.business_financial_events(reservation_id text,amount_minor numeric);
 CREATE TABLE wpay_auth.upi_order_outcomes(reservation_id text);`);
 for(const [id,owner,version,status,verified,started]of [['running','owner',1,'running',1,true],['stopped','owner',1,'stopped',1,true],['notstarted','owner',1,'verified',1,false],['adminonly','owner',1,'running',null,false],['oldversion','owner',2,'approved',null,true],['other','other',1,'running',1,true]]){
  await pool.query('INSERT INTO wpay_auth.business_bank_accounts(id,owner_id,version,status,verified_version) VALUES($1,$2,$3,$4,$5)',[id,owner,version,status,verified]);await pool.query('INSERT INTO wpay_auth.business_bank_versions VALUES($1,$2,$3)',[id,version,{upiId:id+'@test'}]);
  if(started)await pool.query("INSERT INTO wpay_auth.business_audit(id,entity_id,owner_id,actor_id,event,metadata) VALUES($1,$2,$3,$3,'bank_run',$4)",[id,id,owner,{version:1}]);
 }
 await pool.query("INSERT INTO wpay_auth.business_audit(id,entity_id,owner_id,actor_id,event,metadata) VALUES('stop','stopped','owner','admin','bank_stop','{}')");
 await pool.query("INSERT INTO wpay_auth.admin_bank_approvals VALUES('adminonly',1),('other',1),('oldversion',1)");
 const workflow=new Onboarding(),result=await workflow.userAnalytics(pool,'owner');assert.deepEqual(result.banks.map(b=>b.id).sort(),['adminonly','running','stopped']);assert.equal(result.banks.find(b=>b.id==='running').routingStatus,'Running');assert.equal(result.banks.find(b=>b.id==='stopped').routingStatus,'Stopped by Admin');
 assert.equal(result.banks.find(b=>b.id==='adminonly').adminManaged,true);assert.equal(result.banks.find(b=>b.id==='adminonly').canStop,true);assert.equal(result.banks.find(b=>b.id==='stopped').canStop,false);assert.equal(result.banks.find(b=>b.id==='stopped').canStart,false);
 await pool.query("UPDATE wpay_auth.business_bank_accounts SET status='frozen',frozen=true WHERE id='adminonly'");const frozen=(await workflow.userAnalytics(pool,'owner')).banks.find(b=>b.id==='adminonly');assert.equal(frozen.routingStatus,'Frozen');assert.equal(frozen.canStop,false);
 assert.equal((await workflow.analytics(pool,'owner')).banks.length,5,'unfiltered analytics contract is unchanged');
 await pool.query("UPDATE wpay_auth.business_audit SET actor_id='owner' WHERE id='stop'");const selfStopped=(await workflow.userAnalytics(pool,'owner')).banks.find(b=>b.id==='stopped');assert.equal(selfStopped.routingStatus,'Stopped by you');assert.equal(selfStopped.canStart,true);
});
