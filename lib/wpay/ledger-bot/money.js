'use strict';
function minor(value){try{return BigInt(value??0);}catch{return 0n;}}
function decimal(value,scale=2){const n=minor(value),neg=n<0n,a=neg?-n:n,s=a.toString().padStart(scale+1,'0');return (neg?'-':'')+s.slice(0,-scale)+'.'+s.slice(-scale);}
function inr(value){return '₹'+decimal(value,2);}
function usdt(value){return decimal(value,6)+' USDT';}
function fromDecimal(value,scale=2){const s=String(value??'');if(!new RegExp('^(0|[1-9][0-9]*)(\\.[0-9]{1,'+scale+'})?$').test(s))throw Error('INVALID_DECIMAL');const [a,b='']=s.split('.');return BigInt(a)*10n**BigInt(scale)+BigInt(b.padEnd(scale,'0'));}
function pct(value){return value===null||value===undefined||value===''?'Unavailable':String(value)+'%';}
function ratioPercent(success,failed){const s=Number(success||0),f=Number(failed||0),d=s+f;return d?(s*100/d).toFixed(1)+'%':'Unavailable';}
module.exports={minor,decimal,fromDecimal,inr,usdt,pct,ratioPercent};