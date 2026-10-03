'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {detect}=require('./file-detect'),{parseRows}=require('./parser-core'),money=require('./money'),{csv}=require('./normalize');
let XLSX;
function xlsx(){return XLSX||(XLSX=require('../../../public/vendor/smart-upi-parser-runtime/xlsx.full.min.js'));}
function formatCell(value){if(value instanceof Date){const p=n=>String(n).padStart(2,'0');return `${p(value.getDate())}/${p(value.getMonth()+1)}/${value.getFullYear()}`;}return value==null?'':String(value).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();}
function readTabular(bytes){const lib=xlsx();let wb;try{wb=lib.read(new Uint8Array(bytes),{type:'array',cellDates:true,raw:false});}catch{throw Error('INVALID_WORKBOOK');}if(!wb.SheetNames?.length)throw Error('INVALID_WORKBOOK');const rows=[];let index=0;for(const name of wb.SheetNames){const sheet=wb.Sheets[name];if(!sheet)continue;const grid=lib.utils.sheet_to_json(sheet,{header:1,blankrows:false,defval:'',raw:false});for(const raw of grid){const cells=Array.from(raw||[]).map(formatCell);while(cells.length&&cells.at(-1)==='')cells.pop();const text=cells.join(' ').trim();if(text)rows.push({cells,text,source:name,index:index++});}}if(!rows.length)throw Error('EMPTY_STATEMENT');return rows;}
function classifyPdfFailure(result){const stderr=String(result?.stderr||'').slice(0,4000);if(result?.error?.code==='ENOENT')return'PDF_CONVERTER_UNAVAILABLE';if(result?.error?.code==='ETIMEDOUT'||result?.signal==='SIGTERM')return'PDF_CONVERSION_TIMEOUT';if(/password|encrypted|incorrect password/i.test(stderr))return'PASSWORD_PROTECTED_PDF';if(/syntax error|damaged|couldn.t find trailer|xref|not a pdf/i.test(stderr))return'INVALID_PDF';return'PDF_CONVERSION_FAILED';}
function convertPdfToText(bytes){const opts={input:Buffer.from(bytes),encoding:'utf8',timeout:45000,maxBuffer:24*1024*1024,windowsHide:true};let result=spawnSync('/usr/bin/pdftotext',['-layout','-enc','UTF-8','-','-'],opts);if(result?.error?.code==='ENOENT')result=spawnSync('pdftotext',['-layout','-enc','UTF-8','-','-'],opts);if(result.error||result.status!==0)throw Error(classifyPdfFailure(result));const text=String(result.stdout||'').replace(/\u0000/g,'').replace(/\r\n?/g,'\n');if(!text.trim())throw Error('PDF_NO_TEXT_LAYER');return text;}
function splitColumns(line){const trimmed=line.replace(/\t/g,'    ').trimEnd();if(!trimmed.trim())return[];let cells=trimmed.trim().split(/\s{2,}/).map(x=>x.trim()).filter(Boolean);if(cells.length<2)cells=trimmed.trim().split(/\s+/).filter(Boolean);return cells;}
const PDF_HEADER_PATTERNS=[
 ['drcr',[/debit\s*\/\s*credit/i,/credit\s*\/\s*debit/i,/cr\s*\/\s*dr/i,/dr\s*\/\s*cr/i]],
 ['valueDate',[/value\s*date/i]],
 ['narration',[/particulars?/i,/description/i,/narration/i,/remarks?/i]],
 ['reference',[/cheque\s*(?:no|number|details)?/i,/\bchq\b/i,/reference/i]],
 ['debit',[/\bdebit\b/i,/withdrawals?/i]],
 ['credit',[/\bcredit\b/i,/deposits?/i]],
 ['balance',[/\bbalance\b/i]],
 ['amount',[/\bamount(?:\s*\([^)]*\))?/i]],
 ['date',[/transaction\s*date/i,/txn\s*date/i,/^\s*date\b/i]]
];
function headerAnchors(lines){
 const anchors={};
 for(const line of lines){
  const combined=[];
  for(const p of PDF_HEADER_PATTERNS[0][1]){const m=p.exec(line);if(m)combined.push([m.index,m.index+m[0].length]);}
  for(const [role,patterns] of PDF_HEADER_PATTERNS){for(const p of patterns){const m=p.exec(line);if(!m)continue;if((role==='debit'||role==='credit')&&combined.some(([a,b])=>m.index>=a&&m.index<b))continue;if(anchors[role]===undefined||m.index<anchors[role])anchors[role]=m.index;break;}}
 }
 if(anchors.drcr!==undefined){if(anchors.debit!==undefined&&Math.abs(anchors.debit-anchors.drcr)<18)delete anchors.debit;if(anchors.credit!==undefined&&Math.abs(anchors.credit-anchors.drcr)<18)delete anchors.credit;}
 return anchors;
}
function detectPageLayout(lines){
 let best=null;
 for(let i=0;i<Math.min(lines.length,220);i++)for(const size of [1,2,3]){
  const anchors=headerAnchors(lines.slice(i,i+size)),roles=Object.keys(anchors),moneyRoles=roles.filter(x=>['debit','credit','balance','amount','drcr'].includes(x));
  if(!(anchors.date!==undefined||anchors.valueDate!==undefined)||moneyRoles.length<2||!(anchors.narration!==undefined||anchors.reference!==undefined))continue;
  const score=roles.length*10-size;if(!best||score>best.score)best={score,start:i,size,anchors};
 }
 return best;
}
function pdfLayoutValues(line,layout){
 if(!layout?.anchors)return null;const anchors=layout.anchors,out={},moneyRoles=['debit','credit','amount','balance'].filter(r=>anchors[r]!==undefined);
 if(moneyRoles.length){
  const min=Math.min(...moneyRoles.map(r=>anchors[r])),max=Math.max(...moneyRoles.map(r=>anchors[r])),re=/-?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,4})?/g;let m;
  while((m=re.exec(line))){const pos=m.index;if(pos<min-8||pos>max+38)continue;const role=moneyRoles.map(r=>({r,d:Math.abs(pos-anchors[r]),p:anchors[r]})).sort((a,b)=>a.d-b.d||a.p-b.p)[0].r;out[role]=out[role]?`${out[role]} ${m[0]}`:m[0];}
 }
 if(anchors.drcr!==undefined){const candidates=[];for(const m of line.matchAll(/\b(?:CR|DR|C|D)\b/gi)){const d=Math.abs(m.index-anchors.drcr);if(d<=24)candidates.push({v:m[0],d});}if(candidates.length){candidates.sort((a,b)=>a.d-b.d);out.drcr=candidates[0].v;}}
 return Object.keys(out).length?out:null;
}
function textToRows(text){
 const rows=[];let index=0,lastLayout=null,pageNo=0;
 for(const pageText of String(text).split('\f')){pageNo++;const lines=pageText.split('\n').map(x=>x.replace(/\t/g,'    ').trimEnd()),found=detectPageLayout(lines);if(found)lastLayout=found;const active=found||lastLayout;
  for(let i=0;i<lines.length;i++){const clean=lines[i];if(!clean.trim())continue;const cells=splitColumns(clean),joined=cells.join(' ').trim();if(!joined)continue;const useLayout=active&&(found?i>=found.start:i>=0),layout=useLayout?pdfLayoutValues(clean,active):null;rows.push({cells,text:joined,source:`page ${pageNo}`,index:index++,...(layout?{layout}:{}),raw:clean});}
 }
 if(!rows.length)throw Error('PDF_NO_TEXT_LAYER');return rows;
}
function readPdf(bytes){return textToRows(convertPdfToText(bytes));}
async function probePdf(bytes){const text=convertPdfToText(bytes);return /\S/.test(text);}
async function probeWorkbook(bytes){try{return !!readTabular(bytes).length;}catch{return false;}}
function summarizeTransactions(transactions){
 let credit=0n,debit=0n,upiCredit=0n,otherCredit=0n,creditCount=0,debitCount=0,upiCreditCount=0,otherCreditCount=0,upiCreditWithoutUtrCount=0;
 const seen=new Set(),creditUtrs=[];
 for(const t of transactions){
  const minor=money.fromDecimal(t.amount),n=BigInt(minor);
  if(t.direction==='credit'){
   credit+=n;creditCount++;
   if(t.isUpi){upiCredit+=n;upiCreditCount++;if(/^[0-9]{12}$/.test(t.utr||'')){if(!seen.has(t.utr)){seen.add(t.utr);creditUtrs.push({date:t.date,utr:t.utr,amountMinor:minor});}}else upiCreditWithoutUtrCount++;}
   else{otherCredit+=n;otherCreditCount++;}
  }else if(t.direction==='debit'){debit+=n;debitCount++;}
 }
 return{creditCount,debitCount,totalCreditMinor:credit.toString(),totalDebitMinor:debit.toString(),upiCreditCount,otherCreditCount,totalUpiCreditMinor:upiCredit.toString(),totalOtherCreditMinor:otherCredit.toString(),upiCreditWithoutUtrCount,creditUtrs};
}
async function parseBuffer(bytes){const format=await detect(bytes,{probePdf,probeWorkbook}),convertedText=format==='pdf'?convertPdfToText(bytes):null,rows=format==='pdf'?textToRows(convertedText):readTabular(bytes),parsed=parseRows(rows),summary=summarizeTransactions(parsed.transactions);const normalized=csv(parsed.transactions);return{format,rowsScanned:parsed.rowsScanned,...summary,convertedTextDigest:convertedText?createHash('sha256').update(convertedText).digest('hex'):null,convertedTextBytes:convertedText?Buffer.byteLength(convertedText):0,normalizedCsvDigest:createHash('sha256').update(normalized).digest('hex'),normalizedCsvBytes:Buffer.byteLength(normalized)};}
async function main(){const bytes=Buffer.from(workerData.bytes);if(workerData.mode==='probe'){const format=await detect(bytes,{probePdf,probeWorkbook});return parentPort.postMessage({ok:true,format});}parentPort.postMessage({ok:true,...await parseBuffer(bytes)});}
if(parentPort)main().catch(e=>parentPort.postMessage({ok:false,error:String(e?.message||'PARSE_FAILED').slice(0,80)}));
module.exports={parseBuffer,summarizeTransactions,probePdf,probeWorkbook,readTabular,readPdf,convertPdfToText,textToRows,detectPageLayout,pdfLayoutValues,classifyPdfFailure};