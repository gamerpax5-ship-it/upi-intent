"use strict";
const {Worker}=require('node:worker_threads'),path=require('node:path'),{createHash}=require('node:crypto');
const {fields,fail}=require('./validation');
const MAX=1048576;let active=0;
function decode(input,extensions){
 fields(input,['name','data']);if(typeof input.name!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_. -]{0,79}$/.test(input.name))fail();
 const extension=input.name.split('.').at(-1).toLowerCase();if(!extensions.includes(extension))fail();
 if(typeof input.data!=='string'||!input.data.length||input.data.length>Math.ceil(MAX/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data))fail();
 const bytes=Buffer.from(input.data,'base64');if(!bytes.length||bytes.length>MAX||bytes.toString('base64')!==input.data)fail();return {bytes,extension};
}
async function scan(bytes,hook){
 if(typeof hook!=='function')return 'unscanned';let timer;
 try{const result=await Promise.race([hook(Buffer.from(bytes)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),5000);})]);if(result!=='clean')fail('UPLOAD_REJECTED');return 'clean';}
 finally{clearTimeout(timer);}
}
async function proof(input,hook){
 const {bytes,extension:ext}=decode(input,['pdf','png','jpg','jpeg']),extension=ext==='jpeg'?'jpg':ext;
 const valid=extension==='pdf'?bytes.subarray(0,5).toString()==='%PDF-':extension==='png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!valid)fail();return {bytes,extension,size:bytes.length,digest:createHash('sha256').update(bytes).digest('hex'),scanState:await scan(bytes,hook)};
}
function template(){
 const XLSX=require('../../../public/vendor/smart-upi-parser-runtime/xlsx.full.min.js');
 const headers=['reference','beneficiaryName','bankName','accountNumber','ifsc','upiId','amountINR','note'];
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([headers]);
 sheet['!cols']=[{wch:22},{wch:24},{wch:24},{wch:22},{wch:18},{wch:26},{wch:16},{wch:34}];
 XLSX.utils.book_append_sheet(book,sheet,'Bulk Payouts');
 const data=XLSX.write(book,{type:'base64',bookType:'xlsx',compression:true}),bytes=Buffer.from(data,'base64');
 if(!bytes.length||bytes.subarray(0,2).toString()!=='PK')fail('UNAVAILABLE');
 return {name:'WPay-Merchant-Bulk-Payout-Template.xlsx',contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',data};
}
async function bulk(input,hook){
 const {bytes,extension}=decode(input,['csv','xls','xlsx']);await scan(bytes,hook);if(active>=2)fail('RATE_LIMITED');active++;
 try{return await new Promise((resolve,reject)=>{
  const worker=new Worker(path.join(__dirname,'upload-worker.js'),{workerData:{data:bytes.toString('base64'),extension},resourceLimits:{maxOldGenerationSizeMb:96,maxYoungGenerationSizeMb:16}});
  let finished=false;const timer=setTimeout(()=>done(null),5000);
  function done(value){if(finished)return;finished=true;clearTimeout(timer);worker.terminate().catch(()=>{});if(!value?.ok)reject(Object.assign(new Error('Invalid bulk file'),{code:'INVALID_INPUT'}));else resolve(value.rows);}
  worker.once('message',done);worker.once('error',()=>done(null));worker.once('exit',()=>done(null));
 });}catch{fail('INVALID_INPUT');}finally{active--;}
}
module.exports={MAX,proof,bulk,template};
