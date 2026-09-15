"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {contractFor,projection}=require('../lib/wpay/integrations/contracts');
const {readSourceConfig,openLegacySource}=require('../lib/wpay/integrations/source-config');
test('each legacy observation contract binds role, resource kind and receiving-account scope',()=>{
  for(const [role,kind,view,parent]of [['user','device','otp',undefined],['user','device','transactions','receiving_account'],['user','statement_import','statement','receiving_account'],['merchant','order','order',undefined],['merchant','payment_link','order',undefined]]){
    assert.equal(contractFor(role,kind,view).parent,parent);
    for(const other of ['employee','super_admin',role==='user'?'merchant':'user'])assert.throws(()=>contractFor(other,kind,view),{code:'FORBIDDEN'});
  }
  for(const view of ['__proto__','constructor','create','match','reveal','download'])assert.throws(()=>contractFor('user','device',view),{code:'FORBIDDEN'});
  assert.throws(()=>contractFor('user','receiving_account','otp'),{code:'FORBIDDEN'});
});
test('response boundaries discard unexpected credential fields and cannot inherit settlement authority',()=>{
  const raw={id:'1',otp_length:6,source:'SYNTHETIC SOURCE SECRET',code:'321654',sms_body:'SYNTHETIC MESSAGE',credential_hash:'SYNTHETIC KEY',upi_uri:'SYNTHETIC UPI',message_masked:'SYNTHETIC MESSAGE',device_id:'other-user'};
  for(const view of ['otp','transactions','statement','order']){
    const result=projection(view,{rows:[raw],nextCursor:null,secret:'SYNTHETIC TOP LEVEL',settled:true,evidenceVerified:true,financiallyAccounted:true});
    assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC|321654|other-user|sms_body|credential_hash|upi_uri|message_masked/);
    assert.equal(result.evidenceVerified,false);assert.equal(result.financiallyAccounted,false);assert.equal(result.settled,false);
  }
  const otp=projection('otp',{rows:[raw],nextCursor:null});assert.equal(otp.rows[0].code,'••••••');assert.equal(otp.rows[0].messageAvailable,false);
  assert.throws(()=>projection('otp',{rows:Array(51).fill(raw),nextCursor:null}),{code:'UNAVAILABLE'});
  assert.throws(()=>projection('otp',{rows:[raw],nextCursor:'not-a-cursor'}),{code:'UNAVAILABLE'});
  assert.throws(()=>projection('order',{rows:[{id:'1',amount:{credential:'SYNTHETIC KEY'}}],nextCursor:null}),{code:'UNAVAILABLE'});
  assert.doesNotMatch(JSON.stringify(projection('device',{device:{status:'active',credential_hash:'SYNTHETIC KEY'}})),/credential_hash|SYNTHETIC/);
});
test('source configuration is opt-in, confirmed, private-network-only and restricted to the reader role',async()=>{
  assert.equal(readSourceConfig({DATABASE_URL:'ignored',WPAY_AUTH_DEV_DATABASE_URL:'ignored'}),null);
  const empty=openLegacySource({});assert.equal(empty.reader,null);await empty.close();
  const env={WPAY_LEGACY_READER_DATABASE_URL:'postgresql://wpay_legacy_reader:synthetic@127.0.0.1:54117/wp ay',WPAY_LEGACY_READER_TARGET:'127.0.0.1:54117/wp ay'};
  assert.throws(()=>readSourceConfig(env),{code:'UNAVAILABLE'});
  env.WPAY_LEGACY_READER_DATABASE_URL='postgresql://wpay_legacy_reader:synthetic@127.0.0.1:54117/wpay_adapter_legacy_001';env.WPAY_LEGACY_READER_TARGET='127.0.0.1:54117/wpay_adapter_legacy_001';
  const config=readSourceConfig(env);assert.equal(config.user,'wpay_legacy_reader');assert.equal(config.max,2);assert.match(config.options,/default_transaction_read_only=on/);
  for(const patch of [{WPAY_LEGACY_READER_TARGET:'wrong'},{WPAY_LEGACY_READER_DATABASE_URL:env.WPAY_LEGACY_READER_DATABASE_URL.replace('wpay_legacy_reader','postgres')},{WPAY_LEGACY_READER_DATABASE_URL:env.WPAY_LEGACY_READER_DATABASE_URL+'?sslmode=disable'},{WPAY_LEGACY_READER_DATABASE_URL:env.WPAY_LEGACY_READER_DATABASE_URL.replace('127.0.0.1','public.example.invalid'),WPAY_LEGACY_READER_TARGET:'public.example.invalid:54117/wpay_adapter_legacy_001'}])assert.throws(()=>readSourceConfig({...env,...patch}),{code:'UNAVAILABLE'});
});
