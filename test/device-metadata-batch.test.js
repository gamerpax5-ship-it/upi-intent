'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const sql=require('../lib/device-metadata-query');
test('batched metadata keeps the last valid location past 48h, ignores future/pre-pairing fixes and scopes IDs',async t=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='metadata_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});
 t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 await pool.query(`CREATE TABLE devices(id text,status text,app_version text,last_seen_at timestamptz,phone_e164 text,sim_carrier text,sim_subscription_label text,manufacturer text,model text,android_version text);
 CREATE TABLE device_pairings(id bigserial,device_id text,status text,claimed_at timestamptz);
 CREATE TABLE device_diagnostics(id bigserial,device_id text,battery_level numeric,charging boolean,network_type text,carrier text,latitude numeric,longitude numeric,location_accuracy numeric,raw jsonb,collected_at timestamptz);
 CREATE INDEX device_diagnostics_device_time_idx ON device_diagnostics(device_id,collected_at DESC);
 INSERT INTO devices(id,status,last_seen_at) VALUES('device-test','active',now()-interval '1 hour'),('other-device','active',now());
 INSERT INTO device_pairings(device_id,status,claimed_at) VALUES('device-test','claimed',now()-interval '4 days');
 INSERT INTO device_diagnostics(device_id,latitude,longitude,collected_at,raw) VALUES
 ('device-test',11,77,now()-interval '5 days','{}'),
 ('device-test',12,78,now()-interval '3 days','{}'),
 ('device-test',null,null,now()-interval '1 hour','{"locationEnabled":false}'),
 ('device-test',91,1,now()-interval '30 minutes','{}'),
 ('device-test',13,79,now()+interval '1 hour','{}');`);
 let r=(await pool.query(sql,[['device-test']])).rows;assert.equal(r.length,1);assert.equal(r[0].id,'device-test');assert.equal(Number(r[0].latitude),12);assert.equal(r[0].location_last_known,true);assert.equal(r[0].location_history_checked,true);assert.ok(+r[0].location_at<Date.now()-48*3600000);
 assert.equal((await pool.query(sql,[['not-owned']])).rowCount,0);
 await pool.query("INSERT INTO device_diagnostics(device_id,latitude,longitude,collected_at,raw) VALUES('device-test',0,0,now()-interval '1 minute',$1)",[JSON.stringify({location:{capturedAt:Date.now()-5*86400000}})]);
 assert.equal(Number((await pool.query(sql,[['device-test']])).rows[0].latitude),12);
 await pool.query("INSERT INTO device_pairings(device_id,status,claimed_at) VALUES('device-test','claimed',now()-interval '10 minutes')");
 r=(await pool.query(sql,[['device-test']])).rows;assert.equal(r[0].latitude,null);assert.equal(r[0].location_at,null);
 await pool.query("INSERT INTO device_diagnostics(device_id,latitude,longitude,collected_at,raw) VALUES('device-test',0,0,now(),$1)",[JSON.stringify({location:{capturedAt:Date.now()-1000}})]);
 r=(await pool.query(sql,[['device-test']])).rows;assert.equal(Number(r[0].latitude),0);assert.equal(Number(r[0].longitude),0);
});
