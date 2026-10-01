'use strict';
function fromDecimal(value){const s=String(value??'').trim();if(!/^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.test(s))throw Error('INVALID_AMOUNT');const [a,b='']=s.split('.');return (BigInt(a)*100n+BigInt(b.padEnd(2,'0'))).toString();}
function formatMinor(value){const n=BigInt(value||0),neg=n<0n,x=(neg?-n:n).toString().padStart(3,'0');return (neg?'-':'')+'₹'+x.slice(0,-2)+'.'+x.slice(-2);}
module.exports={fromDecimal,formatMinor};