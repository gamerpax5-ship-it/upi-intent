'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {BusinessCore}=require('../lib/wpay/business/core');
test('bank save blocks credential notes on User and Admin create/edit paths before details can persist',async()=>{
 const core=new BusinessCore();core.account=async()=>({});const writes=[];const client={query:async(sql,args)=>{writes.push({sql,args});return {rows:[],rowCount:1};}};
 for(const actor of ['owner','admin'])for(const bankId of [null,'existing-bank'])for(const notes of ['password: example','Bearer example','secret example','OTP 123456','PIN 1234','private key example']){
  writes.length=0;await assert.rejects(core.saveBank(client,'owner',{bankId,version:1,details:{notes}},actor),{code:'INVALID_INPUT'});
  assert.equal(writes.some(w=>/business_bank_versions|business_audit|business_bank_accounts/.test(w.sql)),false,'rejected data cannot reach bank persistence or audit');
 }
});
test('all production bank input calls pass the dedicated safety boundary, including Admin retries',()=>{
 for(const file of ['core.js','admin-upi.js']){const source=fs.readFileSync('lib/wpay/business/'+file,'utf8');assert.ok(source.includes("require('./bank-input').bank("));assert.doesNotMatch(source,/\bv\.bank\(/);}
});
