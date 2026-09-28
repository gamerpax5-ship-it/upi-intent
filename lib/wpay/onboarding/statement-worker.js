"use strict";
const {parentPort,workerData}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createHash}=require('node:crypto');
async function main(){
 const source=fs.readFileSync(path.join(__dirname,'../../../public/statement-parser.js'));
 const XLSX=require('../../../public/vendor/smart-upi-parser-runtime/xlsx.full.min.js');
 const context={window:{XLSX},document:{readyState:'complete',getElementById:()=>null}};
 vm.runInNewContext(source.toString(),context,{timeout:1000});
 // The unchanged parser's parseStatement entry point only; never bind its UI
 // or invoke sendForMatch/global matching. No fetch or filesystem exposed to it.
 const bytes=Buffer.from(workerData.bytes),parsed=await context.window.WPAYStatementParser.parseStatement({name:'statement.'+workerData.format,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
 if(!Array.isArray(parsed.transactions)||parsed.transactions.length<1||parsed.transactions.length>10000||!Number.isInteger(parsed.rowsScanned)||parsed.rowsScanned>20000)throw Error();
 const transactions=parsed.transactions.map(t=>({date:String(t.date||'').slice(0,20),utr:String(t.utr||''),amount:String(t.amount||''),mode:String(t.mode||'UPI')}));
 parentPort.postMessage({ok:true,rows:parsed.rowsScanned,credits:transactions.length,transactions,resultDigest:createHash('sha256').update(JSON.stringify(transactions)).digest('hex')});
}
main().catch(()=>parentPort.postMessage({ok:false}));
