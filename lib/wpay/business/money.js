"use strict";
const {AuthError}=require('../auth/runtime/errors');
const MAX=10n**24n,scales={INR:2,USD:2,USDT:6};
function minor(value,{zero=false}={}){if(typeof value!=='string'||! /^(0|[1-9][0-9]*)$/.test(value))throw new AuthError('INVALID_INPUT');const n=BigInt(value);if(!zero&&n===0n)throw new AuthError('INVALID_INPUT');return n;}
function fromDecimal(value,currency='INR'){if(!Object.hasOwn(scales,currency))throw new AuthError('INVALID_INPUT');const [whole,fraction='']=String(value).split('.');if(typeof value!=='string'||! /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)||fraction.length>scales[currency])throw new AuthError('INVALID_INPUT');return minor((BigInt(whole)*10n**BigInt(scales[currency])+BigInt(fraction.padEnd(scales[currency],'0'))).toString(),{zero:true}).toString();}
function fee(amount,percent){const scaled=BigInt(fromDecimal(percent,'USDT'));if(scaled>100000000n)throw new AuthError('INVALID_INPUT');return (minor(amount)*scaled/100000000n).toString();}
function format(value,currency='INR'){const n=BigInt(value),negative=n<0n,absolute=negative?-n:n,scale=scales[currency];if(scale===undefined)throw new AuthError('INVALID_INPUT');const padded=absolute.toString().padStart(scale+1,'0');return (negative?'-':'')+padded.slice(0,-scale)+'.'+padded.slice(-scale);}
module.exports={minor,fromDecimal,fee,format,MAX};
