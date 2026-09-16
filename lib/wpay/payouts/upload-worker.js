"use strict";
const {parentPort,workerData}=require('node:worker_threads');
try{
 const XLSX=require('../../../public/vendor/smart-upi-parser-runtime/xlsx.full.min.js');
 const bytes=Buffer.from(workerData.data,'base64'),ext=workerData.extension;
 if(ext==='xlsx'&&bytes.subarray(0,2).toString()!=='PK'||ext==='xls'&&!bytes.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')))throw new Error();
 const input=ext==='csv'?new TextDecoder('utf-8',{fatal:true}).decode(bytes):bytes;
 const book=XLSX.read(input,{type:ext==='csv'?'string':'buffer',raw:true,cellFormula:true,bookVBA:true,sheetRows:102});
 if(book.SheetNames.length!==1||book.vbaraw||book.Workbook?.Sheets?.some(s=>s.Hidden))throw new Error();
 const sheet=book.Sheets[book.SheetNames[0]],range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
 if(range.e.r>100||range.e.c>5||range.s.r!==0||range.s.c!==0)throw new Error();
 for(const [key,cell] of Object.entries(sheet))if(!key.startsWith('!')&&(cell.f||cell.l))throw new Error();
 const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:'',blankrows:true}),headers=['reference','beneficiaryName','accountNumber','ifsc','amountINR','note'];
 if(JSON.stringify(rows.shift())!==JSON.stringify(headers)||!rows.length||rows.length>100)throw new Error();
 const records=rows.map((r,i)=>({row:i+2,values:Object.fromEntries(headers.map((h,j)=>[h,r[j]??'']))})).filter(r=>Object.values(r.values).some(v=>v!==''));if(!records.length)throw new Error();
 parentPort.postMessage({ok:true,rows:records});
}catch{parentPort.postMessage({ok:false});}
