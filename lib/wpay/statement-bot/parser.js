'use strict';
const {Worker}=require('node:worker_threads'),path=require('node:path');
const MAX_BYTES=10*1024*1024;let active=0;
async function run(bytes,mode='parse'){
 const b=Buffer.from(bytes);if(!b.length||b.length>MAX_BYTES)throw Error('FILE_SIZE_INVALID');if(active>=2)throw Error('RATE_LIMITED');active++;
 try{return await new Promise((resolve,reject)=>{let done=false;const worker=new Worker(path.join(__dirname,'parser-worker.js'),{workerData:{bytes:b,mode},resourceLimits:{maxOldGenerationSizeMb:160,maxYoungGenerationSizeMb:24}}),finish=(e,r)=>{if(done)return;done=true;clearTimeout(timer);worker.terminate().catch(()=>{});e?reject(e):resolve(r);},timer=setTimeout(()=>finish(Error('PARSER_TIMEOUT')),mode==='probe'?12000:30000);worker.once('message',m=>m?.ok?finish(null,m):finish(Error(m?.error||'PARSE_FAILED')));worker.once('error',e=>finish(e));worker.once('exit',code=>{if(code&&!done)finish(Error('PARSER_EXIT'));});});
 }finally{active--;}
}
module.exports={run,MAX_BYTES};