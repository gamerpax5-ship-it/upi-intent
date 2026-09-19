'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {providerRead}=require('../lib/wpay/integrations/provider-read');
test('provider reads: unavailable and private errors do not become successful evidence',async()=>{
 assert.deepEqual(await providerRead(null,{}),{state:'unavailable',reason:'not_configured'});
 assert.deepEqual(await providerRead(()=>{throw Error('private provider credential');},{}),{state:'unavailable',reason:'provider_error'});
});
test('bounded transient retry keeps idempotency and immutable nested scope',async()=>{
 const seen=[];const result=await providerRead((request,context)=>{seen.push(context.idempotencyKey);assert.throws(()=>{request.scope.owner='other';},TypeError);if(seen.length<2)throw Object.assign(Error('transient'),{retryable:true});return {state:'pending'};},{scope:{owner:'synthetic-user'}});
 assert.equal(seen.length,2);assert.equal(new Set(seen).size,1);assert.deepEqual(result,{state:'response',value:{state:'pending'}});
 let attempts=0;await providerRead(()=>{attempts++;throw Object.assign(Error('outage'),{retryable:true});},{},{attempts:3});assert.equal(attempts,3);
});
test('timeout aborts without starting an overlapping retry or accepting late success',async()=>{
 let signal,calls=0,finish;const result=await providerRead((_,c)=>{signal=c.signal;calls++;return new Promise(resolve=>{finish=resolve;});},{},{timeoutMs:10});
 assert.deepEqual(result,{state:'unavailable',reason:'timeout'});assert.equal(signal.aborted,true);assert.equal(calls,1);finish({verified:true});
});
