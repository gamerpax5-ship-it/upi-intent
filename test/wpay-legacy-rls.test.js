'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
test('legacy RLS denies public clients and preserves column-scoped server reads',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Isolated PostgreSQL required');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),server=new Pool({connectionString:url.toString()}),name='rls_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString(),max:1}),db=await pool.connect();
 t.after(async()=>{db.release();await pool.end();await server.query('DROP DATABASE '+name);await server.end();});
 const tables=['payment_orders','device_pairings','device_transactions','devices','device_diagnostics','payment_links','device_location_history','payment_claims','device_credit_events','device_credit_candidates','device_otp_events','statement_imports','statement_credit_events'];
 const readable=['devices','device_pairings','device_otp_events','device_transactions','statement_credit_events'];
 for(const role of ['anon','authenticated','wpay_operational_reader'])await db.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role}; END IF; END $$`);
 for(const table of tables){await db.query(`CREATE TABLE public.${table}(id bigint,credential_hash text); INSERT INTO public.${table} VALUES(1,'synthetic'); GRANT ALL ON public.${table} TO anon,authenticated`);}
 for(const table of readable)await db.query(`GRANT SELECT(id) ON public.${table} TO wpay_operational_reader`);
 await db.query('GRANT USAGE ON SCHEMA public TO wpay_operational_reader,anon,authenticated');
 await db.query('CREATE FUNCTION public.wpay_capture_location_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$');
 const sql=fs.readFileSync('docs/supabase-server-only-rls.sql','utf8');await db.query(sql);await db.query(sql); // idempotent
 for(const role of ['anon','authenticated']){await db.query('SET ROLE '+role);try{for(const table of tables){await assert.rejects(db.query(`SELECT id FROM public.${table}`),{code:'42501'});await assert.rejects(db.query(`INSERT INTO public.${table}(id) VALUES(2)`),{code:'42501'});await assert.rejects(db.query(`TRUNCATE public.${table}`),{code:'42501'});}}finally{await db.query('RESET ROLE');}}
 await db.query('SET ROLE wpay_operational_reader');try{for(const table of readable){assert.equal((await db.query(`SELECT id FROM public.${table}`)).rowCount,1);await assert.rejects(db.query(`SELECT credential_hash FROM public.${table}`),{code:'42501'});await assert.rejects(db.query(`UPDATE public.${table} SET id=2`),{code:'42501'});}}finally{await db.query('RESET ROLE');}
 for(const table of tables)assert.equal((await db.query(`SELECT * FROM public.${table}`)).rowCount,1);
 assert.equal((await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity")).rows[0].n,13);
 assert.match((await db.query("SELECT proconfig::text config FROM pg_proc WHERE proname='wpay_capture_location_history'")).rows[0].config,/search_path/);
});
