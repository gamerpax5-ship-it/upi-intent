'use strict';
// Adapted from the existing public/statement-parser.js rules. This isolated core
// keeps the production parser untouched while exposing BOTH debit and credit rows.
const CREDIT_TOKENS=/\b(cr|credit|credited|credit\s*amount|credit\s*value|deposit|deposits|deposited|received|receive|recd|incoming|inward|by\s+transfer)\b/i;
const DEBIT_TOKENS=/\b(dr|debit|debited|debit\s*amount|withdraw(al|l|als|n)?|sent|paid|payment\s+to|outgoing|outward|to\s+transfer|wdr|charges?|chrgs|fee)\b/i;
const CREDIT_NARRATION=/(?:^|[\s/_:-])(upi[\s/_:-]*(?:cr|rev)|neft[\s/_:-]*in|imps[\s/_:-]*in|cashrc|cash\s*deposit|refund|reversal|reversed|received|credited)(?:$|[\s/_:.-])/i;
const DEBIT_NARRATION=/(?:^|[\s/_:-])(upi[\s/_:-]*(?:dr|wdr)|neft[\s/_:-]*out|atm\s*wdr|cash\s*withdraw|sent\s+using|pay\s+to|payment\s+to|charges?|chrgs)(?:$|[\s/_:.-])/i;
const UPI_KEYWORDS=[/upi/i,/\bmpay\b[\s/:\-|]*upi/i,/upi[\s/:\-|]*(cr|dr|trtr|coll|collect|p2a|p2m|qr|pay|paymt|payment|transfer|receive[d]?|credit|refund)/i,/(collect|payment|received)[\s/:\-|]*(via|through)?[\s/:\-|]*upi/i,/\bvpa\b/i];
const NOISE_PATTERNS=[/opening\s*balance/i,/closing\s*balance/i,/available\s*balance/i,/balance\s*(b\/?f|c\/?f|brought|carried)/i,/^\s*(b\/?f|c\/?f)\s*$/i,/total\s*(debit|credit|amount)?/i,/grand\s*total/i,/summary/i,/statement\s*(of|period|from)/i,/account\s*(number|no|holder|type|description|branch)/i,/customer\s*(id|name|no)/i,/nominee/i,/\bifsc\b/i,/\bmicr\b/i,/branch\s*(name|code|address)/i,/page\s*\d+\s*(of|\/)\s*\d+/i,/this\s+is\s+a\s+(computer|system)\s+generated/i,/registered\s+office/i,/generated\s+on/i];
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
const DATE_PATTERNS=[/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/,/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/,/\b(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]*(\d{2,4})\b/,/\b([A-Za-z]{3,9})[-\s](\d{1,2})[-\s,]*(\d{4})\b/];
const AMOUNT_RE=/^-?(?:\d{1,3}(?:,\d{2,3})*|\d+)(?:\.\d{1,4})?$/;
const RULES=[['valueDate',[/value\s*date/i,/val\s*dt/i,/post(ing)?\s*date/i]],['date',[/(txn|tran|transaction|book(ing)?)?\s*date/i,/^date$/i,/^dt\.?$/i]],['narration',[/narration/i,/description/i,/particular/i,/remark/i,/details/i,/transaction\s*(info|remarks|details)/i,/^text$/i]],['reference',[/(ref|cheque|chq|utr|rrn)\s*(no|number|id)?/i,/reference/i]],['debit',[/debit/i,/withdraw/i,/paid\s*out/i,/dr\s*am(oun)?t/i,/^dr\.?$/i,/outgoing/i]],['credit',[/credit/i,/deposit/i,/paid\s*in/i,/cr\s*am(oun)?t/i,/^cr\.?$/i,/received/i,/incoming/i]],['drcr',[/(dr|debit)\s*[/|-]\s*(cr|credit)/i,/(cr|credit)\s*[/|-]\s*(dr|debit)/i,/txn\s*type/i,/type/i,/indicator/i]],['balance',[/balance/i,/bal\.?$/i]],['amount',[/amount/i,/^amt\.?$/i,/value/i]]];
function clean(v){return v==null?'':String(v).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();}
function pad(n){return String(n).padStart(2,'0');}function fullYear(y){return y>=1000?y:y>=70?1900+y:2000+y;}
function parseDate(v){const text=clean(v);for(let i=0;i<DATE_PATTERNS.length;i++){const m=DATE_PATTERNS[i].exec(text);if(!m)continue;let d,mo,y;if(i===0){d=+m[1];mo=+m[2];y=fullYear(+m[3]);if(mo>12&&d<=12)[d,mo]=[mo,d];}else if(i===1){y=fullYear(+m[1]);mo=+m[2];d=+m[3];}else if(i===2){d=+m[1];mo=MONTHS[m[2].slice(0,3).toLowerCase()]||0;y=fullYear(+m[3]);}else{mo=MONTHS[m[1].slice(0,3).toLowerCase()]||0;d=+m[2];y=fullYear(+m[3]);}if(mo>=1&&mo<=12&&d>=1&&d<=31&&y>=1900&&y<=2200)return `${pad(d)}/${pad(mo)}/${y}`;}return null;}
function parseAmount(v){let text=clean(v);if(!text)return null;text=text.replace(/(inr|rs\.?|₹)/gi,'').trim();let negative=false;if(/^\(.*\)$/.test(text)){negative=true;text=text.slice(1,-1).trim();}const suffix=/\b(cr|dr)\b\.?$/i.exec(text);if(suffix)text=text.slice(0,suffix.index).trim();if(/^[+-]/.test(text)){negative=negative||text.startsWith('-');text=text.slice(1).trim();}if(!AMOUNT_RE.test(text))return null;const n=Number(text.replace(/,/g,''));return Number.isFinite(n)?(negative?-n:n):null;}
function moneyList(v){
 let text=clean(v);if(!text||parseDate(text))return[];
 text=text.replace(/₹|\bINR\b|\bRs\.?\b/gi,' ').replace(/\b(CR|DR)\.?\b/gi,' ').trim();
 if(!text)return[];
 const parts=text.split(/\s+/).filter(Boolean),out=[];
 for(const part of parts){const n=parseAmount(part);if(n===null)return[];out.push(n);}
 return out;
}
function isNoiseRow(text){return !text||NOISE_PATTERNS.some(p=>p.test(text));}function matchesMode(text){return UPI_KEYWORDS.some(k=>k.test(text));}
function headerScore(row){const map={};let score=0;row.cells.forEach((c,i)=>{const v=clean(c);if(!v||v.length>40||parseAmount(v)!==null)return;for(const [role,patterns] of RULES)if(patterns.some(p=>p.test(v))){if(map[role]===undefined){map[role]=i;score++;}break;}});const hasMoney=map.credit!==undefined||map.debit!==undefined||map.amount!==undefined||map.balance!==undefined;if(map.date===undefined&&map.valueDate===undefined||!hasMoney)return{score:0,map:{}};return{score,map};}
function detectColumns(rows){let best={map:{},headerIndex:-1,score:0};for(let i=0;i<Math.min(rows.length,400);i++){const x=headerScore(rows[i]);if(x.score>best.score)best={map:x.map,headerIndex:i,score:x.score};}return best;}
function numericCells(row){const out=[];row.cells.forEach((c,i)=>{const value=parseAmount(c);if(value!==null)out.push({index:i,value,raw:clean(c)});});return out;}function looksLikeMoney(raw){return /[.,]/.test(raw)||/\b(cr|dr)\b/i.test(raw);}
function resolveDate(row,map){if(map.date!==undefined){const d=parseDate(row.cells[map.date]||'');if(d)return d;}if(map.valueDate!==undefined){const d=parseDate(row.cells[map.valueDate]||'');if(d)return d;}for(const c of row.cells){const d=parseDate(c);if(d)return d;}return null;}
function resolveReference(row){const primary=[],fallback=[];row.cells.forEach(cell=>{const text=clean(cell),tokens=text.split(/[^0-9]+/).filter(Boolean),mode=matchesMode(text);for(const token of tokens){const p=/^\d{12}$/.test(token),f=!p&&/^\d{10,22}$/.test(token);if(!p&&!f||/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/.test(token))continue;let score=1;if(mode)score+=3;if(new RegExp(`upi[^0-9a-z]{0,12}(?:[a-z0-9@.\\-]*[^0-9a-z]){0,6}${token}`,'i').test(text))score+=2;(p?primary:fallback).push({value:token,score});}});const pool=primary.length?primary:fallback;if(!pool.length)return null;pool.sort((a,b)=>b.score-a.score);return pool[0].value;}
function resolveBalance(row,map,nums){if(map.balance!==undefined){const d=nums.find(n=>n.index===map.balance);if(d)return d;const near=nums.find(n=>Math.abs(n.index-map.balance)<=1&&looksLikeMoney(n.raw));if(near)return near;}const money=nums.filter(n=>looksLikeMoney(n.raw));return money.length>1?money[money.length-1]:null;}
function reservedIndices(map,own){const set=new Set();for(const role of Object.keys(map)){const i=map[role];if(i!==undefined&&!own.includes(role))set.add(i);}return set;}
function readMoneyColumn(index,nums,balanceIndex,reserved){if(index===undefined)return null;const any=nums.some(n=>looksLikeMoney(n.raw));const exact=nums.find(n=>n.index===index&&Math.abs(n.value)>0&&(looksLikeMoney(n.raw)||!any));if(exact)return exact;const drift=nums.filter(n=>Math.abs(n.index-index)<=1&&n.index!==balanceIndex&&!reserved.has(n.index)&&Math.abs(n.value)>0&&looksLikeMoney(n.raw));return drift.length===1?drift[0]:null;}
function detectMarker(row,map){
 if(map.drcr!==undefined){const v=clean(row.cells[map.drcr]||'');if(/^c(r|redit)?$/i.test(v)||CREDIT_TOKENS.test(v))return'credit';if(/^d(r|ebit)?$/i.test(v)||DEBIT_TOKENS.test(v))return'debit';}
 const moneyColumns=new Set([map.balance,map.amount,map.debit,map.credit].filter(i=>i!==undefined));
 for(let i=0;i<row.cells.length;i++){if(moneyColumns.has(i))continue;const v=clean(row.cells[i]);if(/^c(r|redit)?\.?$/i.test(v))return'credit';if(/^d(r|ebit)?\.?$/i.test(v))return'debit';}
 const text=clean(row.cells.filter((_,i)=>!moneyColumns.has(i)).join(' '));if(CREDIT_NARRATION.test(text)&&!DEBIT_NARRATION.test(text))return'credit';if(DEBIT_NARRATION.test(text)&&!CREDIT_NARRATION.test(text))return'debit';
 const d=DEBIT_TOKENS.test(text),cr=CREDIT_TOKENS.test(text);return cr&&!d?'credit':d&&!cr?'debit':'unknown';
}
function withBalance(ctx,balanceCell,amount,fallback){
 if(!balanceCell)return fallback;const current=Math.abs(balanceCell.value),votes=[];
 if(ctx.prevBalance!=null){const d=current-ctx.prevBalance;if(Math.abs(d-amount)<=.01)votes.push('credit');if(Math.abs(d+amount)<=.01)votes.push('debit');}
 if(ctx.nextBalance!=null){const d=current-ctx.nextBalance;if(Math.abs(d-amount)<=.01)votes.push('credit');if(Math.abs(d+amount)<=.01)votes.push('debit');}
 const unique=[...new Set(votes)];return unique.length===1?unique[0]:fallback;
}
function resolveDirectionAndAmount(row,map,nums,ctx){
 const balanceCell=resolveBalance(row,map,nums),balanceIndex=balanceCell?balanceCell.index:null,marker=detectMarker(row,map);
 if(map.credit!==undefined||map.debit!==undefined){
  const debitValues=map.debit===undefined?[]:moneyList(row.cells[map.debit]||''),creditValues=map.credit===undefined?[]:moneyList(row.cells[map.credit]||'');
  let dr=debitValues.find(v=>Math.abs(v)>0),cr=creditValues.find(v=>Math.abs(v)>0);
  const balanceMissing=map.balance!==undefined&&!moneyList(row.cells[map.balance]||'').length;
  if(balanceMissing&&map.credit!==undefined&&map.balance===map.credit+1){
   if(creditValues.length>1)cr=creditValues[0];
   else if(dr!==undefined&&creditValues.length===1)cr=undefined;
  }
  if(marker==='credit'&&cr!==undefined)return{direction:'credit',amount:Math.abs(cr)};
  if(marker==='debit'&&dr!==undefined)return{direction:'debit',amount:Math.abs(dr)};
  if(cr!==undefined&&dr===undefined)return{direction:'credit',amount:Math.abs(cr)};
  if(dr!==undefined&&cr===undefined)return{direction:'debit',amount:Math.abs(dr)};
  const crCell=readMoneyColumn(map.credit,nums,balanceIndex,reservedIndices(map,['credit'])),drCell=readMoneyColumn(map.debit,nums,balanceIndex,reservedIndices(map,['debit']));
  if(crCell&&(!drCell||crCell.index!==drCell.index))return{direction:'credit',amount:Math.abs(crCell.value)};
  if(drCell&&(!crCell||drCell.index!==crCell.index))return{direction:'debit',amount:Math.abs(drCell.value)};
 }
 if(map.amount!==undefined&&map.amount!==balanceIndex){const values=moneyList(row.cells[map.amount]||''),a=values[0]??parseAmount(row.cells[map.amount]||'');if(a!==null&&a!==undefined&&a!==0){if(marker!=='unknown')return{direction:marker,amount:Math.abs(a)};if(a<0)return{direction:'debit',amount:Math.abs(a)};return{direction:withBalance(ctx,balanceCell,Math.abs(a),'credit'),amount:Math.abs(a)};}}
 const money=nums.filter(n=>n.index!==balanceIndex&&looksLikeMoney(n.raw)&&Math.abs(n.value)>0);if(!money.length)return{direction:marker,amount:null};const chosen=money[money.length-1],amount=Math.abs(chosen.value);return{direction:marker!=='unknown'?marker:withBalance(ctx,balanceCell,amount,'unknown'),amount};
}
function balanceOfRow(row,map){
 if(map.balance!==undefined){const direct=moneyList(row.cells[map.balance]||'');if(direct.length)return Math.abs(direct.at(-1));
  if(map.credit!==undefined&&map.balance===map.credit+1){const cv=moneyList(row.cells[map.credit]||''),dv=map.debit===undefined?[]:moneyList(row.cells[map.debit]||'');if(cv.length>1)return Math.abs(cv.at(-1));if(dv.length&&cv.length===1)return Math.abs(cv[0]);}
  if(map.amount!==undefined&&map.balance===map.amount+1){const av=moneyList(row.cells[map.amount]||'');if(av.length>1)return Math.abs(av.at(-1));}
 }
 const found=resolveBalance(row,map,numericCells(row));return found?Math.abs(found.value):null;
}
function stitchWrappedRows(rows){const out=[];let pending=[];const flush=t=>{for(const h of pending){t.cells.push(...h.cells);t.text=`${t.text} ${h.text}`.trim();}pending=[];};for(const row of rows){const starts=row.cells.some(c=>parseDate(c)!==null);if(starts||headerScore(row).score>=3){const copy={...row,cells:[...row.cells]};if(starts)flush(copy);else pending=[];out.push(copy);continue;}const prev=out[out.length-1];if(prev&&prev.cells.some(c=>parseDate(c)!==null)){prev.cells.push(...row.cells);prev.text=`${prev.text} ${row.text}`.trim();continue;}if(!isNoiseRow(row.text)&&pending.length<3)pending.push(row);}return out;}
function parseRows(inputRows){const rows=stitchWrappedRows(inputRows),detected=detectColumns(rows),transactions=[],balances=rows.map(r=>balanceOfRow(r,detected.map));let prevBalance=null;for(let i=0;i<rows.length;i++){const row=rows[i];if(row.index===detected.headerIndex)continue;if(!isNoiseRow(row.text)){const date=resolveDate(row,detected.map),nums=numericCells(row),nextBalance=balances.slice(i+1).find(v=>v!==null),r=resolveDirectionAndAmount(row,detected.map,nums,{prevBalance,nextBalance});if(date&&r.amount!==null&&r.amount>0&&['credit','debit'].includes(r.direction)&&r.amount<1e8){const utr=resolveReference(row);transactions.push({date,direction:r.direction,amount:r.amount.toFixed(2),utr:/^\d{12}$/.test(utr||'')?utr:null,isUpi:matchesMode(row.text),text:clean(row.text).slice(0,500)});}}const bal=balances[i];if(bal!==null)prevBalance=bal;}
 const seen=new Set(),dedup=[];for(const t of transactions){const key=[t.date,t.direction,t.amount,t.utr||'',t.text].join('|');if(seen.has(key))continue;seen.add(key);dedup.push(t);}return{rowsScanned:rows.length,transactions:dedup,headerScore:detected.score};}
module.exports={parseRows,clean,parseDate,parseAmount,detectColumns,resolveReference,matchesMode};