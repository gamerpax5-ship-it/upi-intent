"use strict";
const {Worker}=require('node:worker_threads'),path=require('node:path'),fs=require('node:fs'),{createHash}=require('node:crypto');
const {AuthError}=require('../auth/runtime/errors');
const MAX_BYTES=1048576;let active=0;
const parserDigest=createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../../../public/statement-parser.js'))).digest('hex');
function fileInput(format,base64){
 if(!['csv','xls','xlsx'].includes(format)||typeof base64!=='string'||base64.length>Math.ceil(MAX_BYTES/3)*4||! /^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw new AuthError('INVALID_INPUT');
 const bytes=Buffer.from(base64,'base64');if(!bytes.length||bytes.length>MAX_BYTES||bytes.toString('base64')!==base64)throw new AuthError('INVALID_INPUT');
 return bytes;
}
async function parseStatement(bytes,format){
 if(active>=2)throw new AuthError('RATE_LIMITED');active++;
 try{return await new Promise(resolve=>{let done=false;const worker=new Worker(path.join(__dirname,'statement-worker.js'),{workerData:{bytes,format},resourceLimits:{maxOldGenerationSizeMb:96,maxYoungGenerationSizeMb:16}});
  const finish=result=>{if(done)return;done=true;clearTimeout(timer);worker.terminate().catch(()=>{});resolve(result);};
  const timer=setTimeout(()=>finish({ok:false}),5000);worker.once('message',finish);worker.once('error',()=>finish({ok:false}));worker.once('exit',()=>finish({ok:false}));
 });}finally{active--;}
}
module.exports={fileInput,parseStatement,parserDigest,MAX_BYTES};
