'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {maskedContent}=require('../lib/wpay/operations/masked-content'),{Devices}=require('../lib/wpay/operations/devices');
test('legacy raw codes are redacted and a missing token never forwards a raw message',()=>{
 assert.deepEqual(maskedContent({otp_length:6,code:'872194',message:'Synthetic banking OTP 872194'}),{code:'123456',message:'Synthetic banking OTP 123456',masked:true});
 for(const code of [undefined,'','123456']){const result=maskedContent({code,message:'Your code is 872194',otp_length:6});assert.equal(result.message,'[Masked message]');assert.doesNotMatch(JSON.stringify(result),/872194/);}
 const repeated=maskedContent({code:'872194',message:'OTP 872194 backup 639582. https://example.invalid/token/secret',otp_length:1e9});
 assert.equal(repeated.code,'123456');assert.doesNotMatch(repeated.message,/872194|639582|example|secret/);
 assert.equal(maskedContent({code:'AB12CD',message:'Code AB12CD',otp_length:6}).message,'Code 123456');
});
test('Admin, Employee and User APIs return only masked content even when reveal is requested',async()=>{
 for(const role of ['admin','employee','user']){
  const calls=[],source={devices:async()=>[{id:'device-owned',linked:true}],events:async(links,options)=>{assert.equal(options.reveal,false);return {events:[{id:'1',device_id:'device-owned',code:'872194',message:'Synthetic banking OTP 872194',otp_length:6}],nextCursor:null};}};
  const devices=new Devices({source,crypto:{}});devices.links=async()=>[{id:'link',device_ref:'device-owned',owner_id:'owner',owner_name:'Owner'}];
  const now=new Date(),result=await devices.events({query:async(sql,args)=>{calls.push(args);return {rows:[]};}},{id:'actor',account_type:role,database_now:now,mfa_at:now},{},{reveal:true});
  assert.equal(result.masked,true);assert.equal(result.events[0].masked,true);assert.equal(result.events[0].message,'Synthetic banking OTP 123456');assert.doesNotMatch(JSON.stringify({result,calls}),/872194/);
 }
});
