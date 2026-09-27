'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const collection=require('../lib/wpay/business/collection-policy');
test('existing Free Setup grants include unlimited collection without rewriting stored rows',async()=>{
 const c={query:async()=>({rows:[{free_setup:true,unlimited_collection:false}]})};
 assert.deepEqual(await collection.access(c,randomUUID()),{free_setup:true,unlimited_collection:true});
 await collection.setup(c,randomUUID());
});
test('standard accounts retain their explicit capacity policy',async()=>{
 for(const unlimited of [false,true]){
  const c={query:async()=>({rows:[{free_setup:false,unlimited_collection:unlimited}]})};
  assert.deepEqual(await collection.access(c,randomUUID()),{free_setup:false,unlimited_collection:unlimited});
 }
});
test('saving Free Setup persists unlimited access and audits the effective policy',async()=>{
 const writes=[],c={query:async(sql,args)=>{writes.push({sql,args});return {rows:[],rowCount:1};}};
 const result=await collection.setAccess(c,randomUUID(),{userId:randomUUID(),freeSetup:true,unlimitedCollection:false,reason:'Synthetic policy confirmation'});
 assert.deepEqual(result,{freeSetup:true,unlimitedCollection:true});
 assert.equal(writes.find(w=>w.sql.startsWith('INSERT INTO wpay_auth.user_collection_permissions')).args[2],true);
 assert.equal(writes.find(w=>w.sql.startsWith('INSERT INTO wpay_auth.business_audit')).args[6].unlimitedCollection,true);
});
