'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Onboarding}=require('../lib/wpay/onboarding/workflow');
test('UPI analytics uses checkout final states instead of expired underlying reservations',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));const {Pool}=require('pg'),server=new Pool({connectionString:url.toString()}),name='analytics_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});
 // Minimal real SQL fixture isolates state precedence and owner filtering.
 await pool.query(`CREATE SCHEMA wpay_auth;
 CREATE TABLE wpay_auth.business_bank_accounts(id text PRIMARY KEY,owner_id text,version int,status text,created_at timestamptz DEFAULT now());
 CREATE TABLE wpay_auth.business_bank_versions(bank_id text,version int,details jsonb);
 CREATE TABLE wpay_auth.business_reservations(id text,bank_id text,user_id text,state text,expires_at timestamptz);
 CREATE TABLE wpay_auth.gateway_orders(id text,reservation_id text,state text,amount_minor numeric);
 CREATE TABLE wpay_auth.business_financial_events(reservation_id text,amount_minor numeric);
 CREATE TABLE wpay_auth.upi_order_outcomes(reservation_id text);
 INSERT INTO wpay_auth.business_bank_accounts VALUES('bank','owner',1,'running',now()),('other','other',1,'running',now());
 INSERT INTO wpay_auth.business_bank_versions VALUES('bank',1,'{"upiId":"test@upi"}'),('other',1,'{"upiId":"other@upi"}');`);
 for(const [index,state]of ['successful','failed','failed','expired','pending_payment','verification_pending','cancelled'].entries()){
  await pool.query("INSERT INTO wpay_auth.business_reservations VALUES($1,'bank','owner','expired',now()-interval '1 hour')",[String(index)]);
  await pool.query('INSERT INTO wpay_auth.gateway_orders VALUES($1,$1,$2,10000)',[String(index),state]);
 }
 await pool.query("INSERT INTO wpay_auth.business_financial_events VALUES('0',10000)");
 const result=await new Onboarding().analytics(pool,'owner');assert.equal(result.banks.length,1);const b=result.banks[0];assert.equal(b.total,7);assert.equal(b.successful,1);assert.equal(b.failed,2);assert.equal(b.expired,1);assert.equal(b.pending,2);assert.equal(b.cancelled,1);assert.equal(b.successful_volume_minor,'10000');assert.equal(b.successRate,33.33);
});
