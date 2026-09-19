"use strict";
const {digest}=require('../business/ledger');
function immutable(value){if(value&&typeof value==='object'){Object.values(value).forEach(immutable);Object.freeze(value);}return value;}
// Read-only provider boundary. This is deliberately not a transfer executor.
// The same immutable request has the same idempotency key across bounded retries.
async function providerRead(read,input,{timeoutMs=2000,attempts=2}={}){
 if(typeof read!=='function')return {state:'unavailable',reason:'not_configured'};
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||!Number.isInteger(attempts)||attempts<1||attempts>3)throw Error('Invalid provider read policy');
 // Normalize Dates to their wire representation before hashing/freezing; a
 // frozen Date still permits setTime(), and is not a stable JSON scope value.
 const request=immutable(JSON.parse(JSON.stringify(input))),idempotencyKey=digest(request);
 for(let attempt=1;attempt<=attempts;attempt++){
  const controller=new AbortController();let timer;
  const result=await Promise.race([
   Promise.resolve().then(()=>read(request,{idempotencyKey,signal:controller.signal,attempt})).then(value=>({state:'response',value}),error=>({state:'error',retryable:error?.retryable===true})),
   new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve({state:'unavailable',reason:'timeout'});},timeoutMs);})
  ]).finally(()=>clearTimeout(timer));
  // A timed-out operation might still be in flight. Never retry it concurrently.
  if(result.state==='unavailable')return result;
  if(result.state==='response')return result;
  if(!result.retryable||attempt===attempts)return {state:'unavailable',reason:'provider_error'};
 }
}
module.exports={providerRead,immutable};
