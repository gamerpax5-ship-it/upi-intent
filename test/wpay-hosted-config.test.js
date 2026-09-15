"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {readHostedConfig}=require('../lib/wpay/db/hosted-config');
const base={WPAY_HOSTED_DATABASE_URL:'postgresql://wpay_runtime:synthetic@wpay-db.railway.internal:5432/wpay',
 WPAY_HOSTED_TARGET:'wpay-db.railway.internal:5432/wpay',WPAY_HOSTED_NETWORK:'railway-private-network'};
test('hosted DB targets only the confirmed private endpoint and least-privilege runtime identity',()=>{
 const config=readHostedConfig(base);assert.equal(config.user,'wpay_runtime');assert.equal(config.database,'wpay');assert.equal(config.max,4);assert.equal(config.options,'-c search_path=pg_catalog');
 for(const change of [{WPAY_HOSTED_TARGET:'different'}, {WPAY_HOSTED_NETWORK:undefined}, {WPAY_HOSTED_DATABASE_URL:undefined},
  {WPAY_HOSTED_DATABASE_URL:base.WPAY_HOSTED_DATABASE_URL+'?sslmode=disable'},
  {WPAY_HOSTED_DATABASE_URL:base.WPAY_HOSTED_DATABASE_URL.replace('wpay_runtime','postgres')},
  {WPAY_HOSTED_DATABASE_URL:base.WPAY_HOSTED_DATABASE_URL.replace('wpay-db.railway.internal','db.somewhere.invalid')},
  {WPAY_HOSTED_MIGRATION_DATABASE_URL:'must-not-reach-runtime'}])assert.throws(()=>readHostedConfig({...base,...change}),{code:'UNAVAILABLE'});
 assert.throws(()=>readHostedConfig({DATABASE_URL:base.WPAY_HOSTED_DATABASE_URL,WPAY_AUTH_DEV_DATABASE_URL:base.WPAY_HOSTED_DATABASE_URL}));
});
test('hosted migration connection is separately named and does not accept runtime credentials',()=>{
 const env={...base,WPAY_HOSTED_MIGRATION_DATABASE_URL:base.WPAY_HOSTED_DATABASE_URL.replace('wpay_runtime','wpay_migrator')};
 assert.equal(readHostedConfig(env,'migration').user,'wpay_migrator');assert.equal(readHostedConfig(env,'migration').max,1);
 assert.throws(()=>readHostedConfig({...env,WPAY_HOSTED_MIGRATION_DATABASE_URL:base.WPAY_HOSTED_DATABASE_URL},'migration'));
});
test('actual hosted entry process fails closed before listening on missing origin/key/database',()=>{
 const env={...process.env};for(const key of Object.keys(env))if(/DATABASE|RAILWAY|SUPABASE|WPAY_|^PG[A-Z_]*$/.test(key))delete env[key];
 for(const changes of [{},{WPAY_HOSTED_ORIGIN:'https://wpay.example.invalid'}]){
  const result=spawnSync(process.execPath,['scripts/serve-wpay-hosted.js'],{env:{...env,NODE_ENV:'production',PORT:'4179',...changes},encoding:'utf8',windowsHide:true,timeout:5000});
  assert.equal(result.status,1);assert.equal(result.stderr.trim(),'WPAY_HOSTED_UNAVAILABLE');assert.equal(result.stdout,'');
 }
 const bootstrap=spawnSync(process.execPath,['scripts/bootstrap-wpay-hosted.js'],{env:{...env,NODE_ENV:'production'},encoding:'utf8',windowsHide:true,timeout:5000});
 assert.equal(bootstrap.status,1);assert.equal(bootstrap.stderr.trim(),'WPAY_HOSTED_BOOTSTRAP_UNAVAILABLE');assert.equal(bootstrap.stdout,'');
});
