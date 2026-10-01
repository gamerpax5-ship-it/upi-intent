'use strict';
const {parentPort,workerData}=require('node:worker_threads'),path=require('node:path'),{pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
const {detect}=require('./file-detect'),{parseRows}=require('./parser-core'),money=require('./money'),{csv}=require('./normalize');
const XLSX=require('../../../public/vendor/smart-upi-parser-runtime/xlsx.full.min.js');
let pdfModule;
function formatCell(value){if(value instanceof Date){const p=n=>String(n).padStart(2,'0');return `${p(value.getDate())}/${p(value.getMonth()+1)}/${value.getFullYear()}`;}return value==null?'':String(value).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();}
function readTabular(bytes){let wb;try{wb=XLSX.read(new Uint8Array(bytes),{type:'array',cellDates:true,raw:false});}catch{throw Error('INVALID_WORKBOOK');}if(!wb.SheetNames?.length)throw Error('INVALID_WORKBOOK');const rows=[];let index=0;for(const name of wb.SheetNames){const sheet=wb.Sheets[name];if(!sheet)continue;const grid=XLSX.utils.sheet_to_json(sheet,{header:1,blankrows:false,defval:'',raw:false});for(const raw of grid){const cells=Array.from(raw||[]).map(formatCell);while(cells.length&&cells.at(-1)==='')cells.pop();const text=cells.join(' ').trim();if(text)rows.push({cells,text,source:name,index:index++});}}if(!rows.length)throw Error('EMPTY_STATEMENT');return rows;}
function clusterRows(items){if(!items.length)return[];const sorted=[...items].sort((a,b)=>b.y-a.y||a.x-b.x),lines=[];let current=[sorted[0]],baseline=sorted[0].y;for(let i=1;i<sorted.length;i++){const item=sorted[i];if(Math.abs(item.y-baseline)<=3)current.push(item);else{lines.push(current);current=[item];baseline=item.y;}}lines.push(current);return lines.map(line=>line.sort((a,b)=>a.x-b.x));}
function clusterCells(line){const chunks=[];if(!line.length)return chunks;let buffer=line[0].str,start=line[0].x,end=line[0].x+line[0].w;for(let i=1;i<line.length;i++){const prev=line[i-1],item=line[i],gap=item.x-(prev.x+prev.w);if(gap>6){if(buffer.trim())chunks.push({text:buffer.trim(),x:start,end});buffer=item.str;start=item.x;}else buffer+=(gap>.8?' ':'')+item.str;end=item.x+item.w;}if(buffer.trim())chunks.push({text:buffer.trim(),x:start,end});return chunks;}
function dateish(s){return /(?:\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b|\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[-\s][A-Za-z]{3,9}[-\s,]*\d{2,4}\b)/.test(s);}
function isDataLine(chunks){return chunks.length>=3&&chunks.some(c=>c.text.length<=30&&dateish(c.text));}
function buildBands(lines){const spans=[];for(const line of lines){if(!isDataLine(line))continue;for(const c of line)spans.push({start:c.x,end:Math.max(c.end,c.x+1)});}if(!spans.length)return[];spans.sort((a,b)=>a.start-b.start);const bands=[{...spans[0]}];for(const span of spans.slice(1)){const last=bands.at(-1);if(span.start<=last.end+3)last.end=Math.max(last.end,span.end);else bands.push({...span});}return bands;}
function snap(chunks,bands){const slots=bands.map(()=>'');for(const chunk of chunks){let best=0,overlap=0,distance=Infinity;bands.forEach((band,i)=>{const o=Math.max(0,Math.min(chunk.end,band.end)-Math.max(chunk.x,band.start)),d=o>0?0:Math.min(Math.abs(chunk.x-band.end),Math.abs(band.start-chunk.end));if(o>overlap||(overlap===0&&d<distance)){overlap=Math.max(overlap,o);distance=d;best=i;}});slots[best]=slots[best]?slots[best]+' '+chunk.text:chunk.text;}return slots;}
function installPdfNodeCompat(){
 if(typeof process.getBuiltinModule!=='function')Object.defineProperty(process,'getBuiltinModule',{value:id=>require(id),configurable:true});
 if(typeof globalThis.DOMMatrix==='undefined'){
  class DOMMatrixCompat{
   constructor(init){this.a=1;this.b=0;this.c=0;this.d=1;this.e=0;this.f=0;if(init) this._set(init);}
   _set(v){if(Array.isArray(v)||ArrayBuffer.isView(v)){if(v.length>=6)[this.a,this.b,this.c,this.d,this.e,this.f]=Array.from(v).slice(0,6).map(Number);}else if(typeof v==='object'){for(const k of ['a','b','c','d','e','f'])if(Number.isFinite(Number(v[k])))this[k]=Number(v[k]);}return this;}
   clone(){return new DOMMatrixCompat([this.a,this.b,this.c,this.d,this.e,this.f]);}
   multiply(o){return this.clone().multiplySelf(o);}
   multiplySelf(o){o=new DOMMatrixCompat(o);const {a,b,c,d,e,f}=this;this.a=a*o.a+c*o.b;this.b=b*o.a+d*o.b;this.c=a*o.c+c*o.d;this.d=b*o.c+d*o.d;this.e=a*o.e+c*o.f+e;this.f=b*o.e+d*o.f+f;return this;}
   preMultiplySelf(o){const x=new DOMMatrixCompat(o).multiply(this);return this._set(x);}
   translate(tx=0,ty=0){return this.clone().translateSelf(tx,ty);}
   translateSelf(tx=0,ty=0){return this.multiplySelf([1,0,0,1,Number(tx)||0,Number(ty)||0]);}
   scale(sx=1,sy=sx){return this.clone().scaleSelf(sx,sy);}
   scaleSelf(sx=1,sy=sx){return this.multiplySelf([Number(sx)||0,0,0,Number(sy)||0,0,0]);}
   rotate(angle=0){return this.clone().rotateSelf(angle);}
   rotateSelf(angle=0){const r=(Number(angle)||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r);return this.multiplySelf([c,s,-s,c,0,0]);}
   inverse(){return this.clone().invertSelf();}
   invertSelf(){const det=this.a*this.d-this.b*this.c;if(!det){for(const k of ['a','b','c','d','e','f'])this[k]=NaN;return this;}const {a,b,c,d,e,f}=this;this.a=d/det;this.b=-b/det;this.c=-c/det;this.d=a/det;this.e=(c*f-d*e)/det;this.f=(b*e-a*f)/det;return this;}
   transformPoint(p={}){const x=Number(p.x)||0,y=Number(p.y)||0;return{x:this.a*x+this.c*y+this.e,y:this.b*x+this.d*y+this.f,z:Number(p.z)||0,w:p.w===undefined?1:Number(p.w)};}
   toFloat32Array(){return Float32Array.from([this.a,this.b,this.c,this.d,this.e,this.f]);}
   toFloat64Array(){return Float64Array.from([this.a,this.b,this.c,this.d,this.e,this.f]);}
   get is2D(){return true;}get isIdentity(){return this.a===1&&this.b===0&&this.c===0&&this.d===1&&this.e===0&&this.f===0;}
   static fromMatrix(v){return new DOMMatrixCompat(v);}static fromFloat32Array(v){return new DOMMatrixCompat(v);}static fromFloat64Array(v){return new DOMMatrixCompat(v);}
  }
  globalThis.DOMMatrix=DOMMatrixCompat;
 }
 if(typeof globalThis.ImageData==='undefined')globalThis.ImageData=class ImageDataCompat{constructor(data,width,height){this.data=data;this.width=width||0;this.height=height||0;}};
 if(typeof globalThis.Path2D==='undefined')globalThis.Path2D=class Path2DCompat{constructor(){}addPath(){}closePath(){}moveTo(){}lineTo(){}bezierCurveTo(){}quadraticCurveTo(){}rect(){}roundRect(){}arc(){}arcTo(){}ellipse(){}};
}
async function pdf(){if(!pdfModule){installPdfNodeCompat();pdfModule=await import(pathToFileURL(path.join(__dirname,'../../../public/vendor/smart-upi-parser-runtime/pdf.mjs')).href);}return pdfModule;}
async function openPdf(bytes){const mod=await pdf();let doc;try{doc=await mod.getDocument({data:new Uint8Array(bytes),disableWorker:true}).promise;}catch(e){const m=String(e?.message||'');if(/password/i.test(m))throw Error('PASSWORD_PROTECTED_PDF');throw Error('INVALID_PDF');}if(!doc.numPages||doc.numPages>1000){await doc.destroy().catch(()=>{});throw Error('INVALID_PDF');}return doc;}
async function probePdf(bytes){const doc=await openPdf(bytes);try{const page=await doc.getPage(1),content=await page.getTextContent(),has=content.items.some(x=>String(x.str||'').trim());if(!has)throw Error('PDF_NO_TEXT_LAYER');return true;}finally{await doc.destroy().catch(()=>{});}}
async function readPdf(bytes){const doc=await openPdf(bytes);try{const rows=[];let index=0;for(let p=1;p<=doc.numPages;p++){const page=await doc.getPage(p),content=await page.getTextContent(),items=[];for(const raw of content.items){const str=String(raw.str||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();if(!str||!raw.transform)continue;items.push({str,x:raw.transform[4]||0,y:raw.transform[5]||0,w:raw.width||0});}const lines=clusterRows(items).map(clusterCells).filter(x=>x.length),bands=buildBands(lines);for(const chunks of lines){const cells=bands.length>=3?snap(chunks,bands):chunks.map(c=>c.text),text=cells.join(' ').trim();if(text)rows.push({cells,text,source:`page ${p}`,index:index++});}}if(!rows.length)throw Error('PDF_NO_TEXT_LAYER');return rows;}finally{await doc.destroy().catch(()=>{});}}
async function probeWorkbook(bytes){try{return !!readTabular(bytes).length;}catch{return false;}}
async function parseBuffer(bytes){const format=await detect(bytes,{probePdf,probeWorkbook}),rows=format==='pdf'?await readPdf(bytes):readTabular(bytes),parsed=parseRows(rows);let credit=0n,debit=0n,creditCount=0,debitCount=0;for(const t of parsed.transactions){const n=BigInt(money.fromDecimal(t.amount));if(t.direction==='credit'){credit+=n;creditCount++;}else{debit+=n;debitCount++;}}
 const seen=new Set(),creditUtrs=[];for(const t of parsed.transactions){if(t.direction!=='credit'||!t.isUpi||!/^\d{12}$/.test(t.utr||''))continue;const key=`${t.date}|${t.utr}|${t.amount}`;if(seen.has(key))continue;seen.add(key);creditUtrs.push({date:t.date,utr:t.utr,amountMinor:money.fromDecimal(t.amount)});}const normalized=csv(parsed.transactions);return{format,rowsScanned:parsed.rowsScanned,creditCount,debitCount,totalCreditMinor:credit.toString(),totalDebitMinor:debit.toString(),creditUtrs,normalizedCsvDigest:createHash('sha256').update(normalized).digest('hex'),normalizedCsvBytes:Buffer.byteLength(normalized)};}
async function main(){const bytes=Buffer.from(workerData.bytes);if(workerData.mode==='probe'){const format=await detect(bytes,{probePdf,probeWorkbook});return parentPort.postMessage({ok:true,format});}parentPort.postMessage({ok:true,...await parseBuffer(bytes)});}
if(parentPort)main().catch(e=>parentPort.postMessage({ok:false,error:String(e?.message||'PARSE_FAILED').slice(0,80)}));
module.exports={parseBuffer,probePdf,probeWorkbook,readTabular,readPdf};