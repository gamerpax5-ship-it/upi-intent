'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const policy=require('../lib/wpay/business/collection-policy');
function client({unlimited=false,free=false,balance='0'}={}){return {query:async(sql,args)=>{assert.equal(args[0],'synthetic-user');if(sql.includes('user_collection_permissions'))return {rows:[{free_setup:free,unlimited_collection:unlimited}]};if(sql.includes('business_entries'))return {rows:[{ledger_type:'capacity_allocated',amount:balance}]};if(sql.includes('business_reservations'))return {rows:[{amount:'0'}]};throw Error('Unexpected query');}};}
test('Admin unlimited grant allows device activation but leaves unrelated setup requirements unchanged',async()=>{
 const c=client({unlimited:true});await policy.deviceSetup(c,'synthetic-user');await assert.rejects(policy.setup(c,'synthetic-user'),{code:'FUNDING_REQUIRED'});
});
test('device activation retains funded/free setup eligibility and denies unfunded users without a grant',async()=>{
 await policy.deviceSetup(client({balance:'100'}),'synthetic-user');await policy.deviceSetup(client({free:true}),'synthetic-user');await assert.rejects(policy.deviceSetup(client(),'synthetic-user'),{code:'FUNDING_REQUIRED'});
});
