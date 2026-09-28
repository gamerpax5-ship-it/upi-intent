'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Pool}=require('pg');
const {migrate}=require('../lib/wpay/db/migrations'),{Source}=require('../lib/wpay/telegram/source');
test('device ownership and UPI mapping queries execute against actual WPay schema',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const admin=new Pool({connectionString:url.toString()}),name='telegram_source_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 await migrate(pool);
 const source=new Source({pool,tenantIds:[randomUUID()],legacy:{read:async()=>{throw Error('Unexpected read');}}});
 assert.deepEqual(await source.links(),[]);assert.deepEqual(await source.links(true),[]);
 await assert.rejects(source.utrs('shop@bank').next(),/VERIFIED_UPI_SOURCE_MAPPING_REQUIRED/);
});
