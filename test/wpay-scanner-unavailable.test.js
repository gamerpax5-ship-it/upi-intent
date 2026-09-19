"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {proof}=require('../lib/wpay/payouts/uploads'),{publicError}=require('../lib/wpay/auth/runtime/errors');
const file={name:'synthetic.pdf',data:Buffer.from('%PDF-1.4\nSynthetic scanner-boundary fixture\n%%EOF').toString('base64')};
test('scanner outage and malformed verdict never turn a proof into clean evidence',async()=>{
 for(const hook of [async()=>{throw Error('private scanner diagnostic must not escape');},async()=>undefined,async()=>({clean:true}),async()=> 'unavailable']){
  let failure;try{await proof(file,hook);}catch(error){failure=error;}
  assert.ok(failure);const response=publicError(failure);assert.ok([400,503].includes(response.status));assert.equal(JSON.stringify(response).includes('private scanner diagnostic'),false);
 }
 assert.equal((await proof(file)).scanState,'unscanned');
});
test('unresponsive scanner times out without returning a clean or downloadable result',async()=>{
 let returned=false,failure;try{await proof(file,()=>new Promise(()=>{}));returned=true;}catch(error){failure=error;}
 assert.equal(returned,false);assert.ok(failure);assert.equal(publicError(failure).status,503);
});
