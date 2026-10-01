'use strict';
function cell(v){const s=String(v??'');return '"'+s.replaceAll('"','""')+'"';}
function csv(transactions){const head=['date','direction','amount','utr','upi','description'];return [head,...transactions.map(t=>[t.date,t.direction,t.amount,t.utr||'',t.isUpi?'yes':'no',t.text||''])].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';}
module.exports={csv};