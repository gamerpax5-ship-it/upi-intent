"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {config}=require('../lib/wpay/integrations/operational-source'),{PairingBridge}=require('../lib/wpay/integrations/pairing-bridge'),{recent}=require('../lib/wpay/operations/access'),{validate}=require('../scripts/seed-wpay-manual');
test('operational read source requires an exact independent low-privilege target and never falls back to legacy DATABASE_URL',()=>{
 assert.equal(config({DATABASE_URL:'postgres://unrelated'}),null);
 const env={WPAY_OPERATIONAL_READER_DATABASE_URL:'postgresql://wpay_operational_reader:synthetic@127.0.0.1:54117/wp_test',WPAY_OPERATIONAL_READER_TARGET:'127.0.0.1:54117/wp_test'};
 assert.equal(config(env).user,'wpay_operational_reader');assert.match(config(env).options,/default_transaction_read_only=on/);
 for(const changes of [{WPAY_OPERATIONAL_READER_TARGET:'wrong'},{WPAY_OPERATIONAL_READER_DATABASE_URL:env.WPAY_OPERATIONAL_READER_DATABASE_URL.replace('wpay_operational_reader','postgres')},{WPAY_OPERATIONAL_READER_DATABASE_URL:env.WPAY_OPERATIONAL_READER_DATABASE_URL+'?sslmode=disable'},{WPAY_OPERATIONAL_READER_DATABASE_URL:env.WPAY_OPERATIONAL_READER_DATABASE_URL.replace('127.0.0.1','external.invalid')}])assert.throws(()=>config({...env,...changes}));
 assert.throws(()=>new PairingBridge({origin:'http://external.invalid',username:'synthetic',password:'synthetic'}));assert.throws(()=>new PairingBridge({origin:'http://127.0.0.1:1234/path',username:'synthetic',password:'synthetic',local:true}));
});
test('OTP recent MFA rejects missing, malformed, future and expired timestamps',()=>{
 const database_now=new Date();for(const mfa_at of [null,'invalid',new Date(+database_now+1),new Date(+database_now-300001)])assert.throws(()=>recent({database_now,mfa_at}),e=>e.code==='RECENT_MFA_REQUIRED');assert.doesNotThrow(()=>recent({database_now,mfa_at:new Date(+database_now-300000)}));
});
test('generic User device/statement projections omit UTR; Merchant own claim projection stays intact',()=>{
 const {forPanel}=require('../lib/wpay/operations/observation-privacy'),source={rows:[{id:'1',utr:'synthetic-utr',submitted_utr:'synthetic-claim',amount:'20.50',legacy_status:'SUCCESS'}],financiallyAccounted:false};
 const user=forPanel('user',source);assert.equal(Object.hasOwn(user.rows[0],'utr'),false);assert.equal(Object.hasOwn(user.rows[0],'submitted_utr'),false);assert.equal(user.rows[0].amount,'20.50');assert.equal(user.financiallyAccounted,false);assert.equal(source.rows[0].utr,'synthetic-utr');assert.equal(forPanel('merchant',source),source);
});
test('manual seed refuses production, remote databases, existing outputs and every Git checkout',t=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'wpay-seed-validation-')),prior=process.env.WPAY_MANUAL_CONFIRM,priorNode=process.env.NODE_ENV;t.after(()=>{if(prior===undefined)delete process.env.WPAY_MANUAL_CONFIRM;else process.env.WPAY_MANUAL_CONFIRM=prior;if(priorNode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=priorNode;fs.rmSync(parent,{recursive:true,force:true});});
 const cfg={migration:{host:'127.0.0.1',port:54117,database:'wpay_12_manual_999',user:'wpay_migrator',password:'synthetic'},runtime:{host:'127.0.0.1',port:54117,database:'wpay_12_manual_999',user:'wpay_runtime',password:'synthetic'},mfaKey:Buffer.alloc(32,1).toString('base64')},output=path.join(parent,'private'),origin='http://127.0.0.1:4185';
 delete process.env.WPAY_MANUAL_CONFIRM;assert.throws(()=>validate(cfg,output,origin));process.env.WPAY_MANUAL_CONFIRM='empty-local-development-only';delete process.env.NODE_ENV;assert.equal(validate(cfg,output,origin),output);
 assert.throws(()=>validate({...cfg,runtime:{...cfg.runtime,host:'external.invalid'}},output,origin));assert.throws(()=>validate(cfg,output,'https://production.invalid'));process.env.NODE_ENV='production';assert.throws(()=>validate(cfg,output,origin));delete process.env.NODE_ENV;
 fs.mkdirSync(output);assert.throws(()=>validate(cfg,output,origin));fs.mkdirSync(path.join(parent,'.git'));assert.throws(()=>validate(cfg,path.join(parent,'other'),origin));assert.throws(()=>validate(cfg,path.join(__dirname,'untracked-private'),origin));
});
