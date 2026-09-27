'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {POLICY,FEE,calculate,allocation}=require('../lib/wpay/funding/setup-policy');
const {FundingWorkflow}=require('../lib/wpay/funding/workflow');
const collection=require('../lib/wpay/business/collection-policy');
const request=extra=>({id:'deposit',owner_id:'user',accounting_version:0,snapshot:{initialPolicy:POLICY,rate:'107',freeSetup:false},...extra});
function db({prior=false,free=false,event=null,legacy=false}={}){
 return {query:async(sql)=>{
  if(sql.includes('FROM wpay_auth.business_entries'))return {rows:legacy?[{}]:[],rowCount:legacy?1:0};
  if(sql.includes('FROM wpay_auth.funding_events'))return {rows:event?[{provenance:event}]:[],rowCount:event?1:0};
  if(sql.includes('FROM wpay_auth.user_collection_permissions'))return {rows:[{free_setup:free,unlimited_collection:false}],rowCount:1};
  if(sql.includes('FROM wpay_auth.funding_requests'))return {rows:prior?[{}]:[],rowCount:prior?1:0};
  throw Error('Unexpected SQL '+sql);
 }};
}
test('first 2000 USDT allocates exactly 1900 at the account rate',async()=>{
 assert.deepEqual(await allocation(db(),request(),'2000000000'),{receivedMinor:'2000000000',setupFeeMinor:FEE,netUsdtMinor:'1900000000',creditMinor:'20330000'});
 assert.equal(calculate('2000000000','85.75',FEE).creditMinor,'16292500');
});
test('larger initial deposit deducts exactly 100 USDT, not a percentage',async()=>{
 const result=await allocation(db(),request(),'3500000000');
 assert.equal(result.netUsdtMinor,'3400000000');assert.equal(result.setupFeeMinor,FEE);
});
test('previously funded accounts, including reversed deposits, incur no second fee',async()=>{
 const result=await allocation(db({prior:true}),request(),'2000000000');
 assert.equal(result.setupFeeMinor,'0');assert.equal(result.creditMinor,'21400000');
});
test('Free Setup waives the fee both at request time and when enabled before confirmation',async()=>{
 for(const [r,c] of [[request({snapshot:{initialPolicy:POLICY,rate:'107',freeSetup:true}}),db()],[request(),db({free:true})]]){
  const result=await allocation(c,r,'1000000');assert.equal(result.setupFeeMinor,'0');assert.equal(result.creditMinor,'10700');
 }
});
test('requests created under the old policy keep their original full conversion',async()=>{
 const r=request({snapshot:{rate:'107',initialPolicy:'first-confirmed-transfer-2000-usdt'}});
 assert.equal((await allocation(db(),r,'2000000000')).creditMinor,'21400000');
});
test('confirmation replay and restoration retain the original non-refundable fee',async()=>{
 const original=calculate('2000000000','107',FEE);
 for(const state of ['confirmed','reversed']){
  const r=request({state,accounting_version:state==='confirmed'?1:2,credit_minor:original.creditMinor});
  assert.deepEqual(await allocation(db({event:original,free:true}),r,'2000000000'),original);
  await assert.rejects(allocation(db({event:original}),r,'2100000000'),{code:'EVIDENCE_REVIEW'});
 }
});
test('legacy replay remains idempotent without a fee provenance field',async()=>{
 const r=request({accounting_version:1,credit_minor:'21400000'});
 assert.equal((await allocation(db(),r,'2000000000')).setupFeeMinor,'0');
});
test('sub-fee and unrepresentable capacity amounts fail instead of rounding',()=>{
 assert.throws(()=>calculate('100000000','107',FEE),{code:'BELOW_MINIMUM'});
 assert.throws(()=>calculate('2000000001','85.75',FEE),{code:'UNREPRESENTABLE_AMOUNT'});
});
test('Free Setup has no first-deposit minimum and implies unlimited collection on old rows',async()=>{
 assert.equal(await new FundingWorkflow().minimum(db({free:true}),'user'),'1');
 assert.deepEqual(await collection.access(db({free:true}),'user'),{free_setup:true,unlimited_collection:true});
 assert.deepEqual(await collection.access(db(),'user'),{free_setup:false,unlimited_collection:false});
});
test('standard unfunded users retain the 2000 USDT minimum',async()=>{
 assert.equal(await new FundingWorkflow().minimum(db(),'user'),'2000000000');
 assert.equal(await new FundingWorkflow().minimum(db({prior:true}),'user'),'1');
});

test('historical collateral ledger credit also exempts existing funded users',async()=>{
 assert.equal((await allocation(db({legacy:true}),request(),'2000000000')).setupFeeMinor,'0');
});
test('saving Free Setup persists unlimited access and records the effective policy',async()=>{
 const {randomUUID}=require('node:crypto'),writes=[];
 const c={query:async(sql,args)=>{writes.push({sql,args});return {rows:[],rowCount:1};}};
 const result=await collection.setAccess(c,randomUUID(),{userId:randomUUID(),freeSetup:true,unlimitedCollection:false,reason:'Synthetic policy confirmation'});
 assert.deepEqual(result,{freeSetup:true,unlimitedCollection:true});
 assert.equal(writes.find(w=>w.sql.startsWith('INSERT INTO wpay_auth.user_collection_permissions')).args[2],true);
 assert.equal(writes.find(w=>w.sql.startsWith('INSERT INTO wpay_auth.business_audit')).args[6].unlimitedCollection,true);
});
