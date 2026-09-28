'use strict';
const clean=v=>v===null||v===undefined||v===''?'Unavailable':String(v).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,180);
function time(v){const d=new Date(v);return v&&Number.isFinite(+d)?d.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})+' IST':'Unavailable';}
function numeric(v,min,max){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null;}
function status(d){return [`Number: ${clean(d.phone)}`,`Status: ${clean(d.status)}`,`Device: ${clean(d.model)}`,`Battery: ${d.battery===null||d.battery===undefined?'Unavailable':clean(d.battery)+'%'}`,`Charging: ${typeof d.charging==='boolean'?(d.charging?'Yes':'No'):'Unavailable'}`,`Network: ${clean(d.network)}`,`Carrier: ${clean(d.carrier)}`,`SIM: ${clean(d.simName)}`,`APK: ${clean(d.apkVersion)}`,`Last seen: ${time(d.lastSeenAt)}`].join('\n');}
// Deliberately accept no SMS body or authentication-code projection.
function maskedEvent(e){return `Number: ${clean(e.phone)}\nOTP received: 1234 [MASKED]\nDate/time: ${time(e.receivedAt)}`;}
function utr(e){return `UTR: ${clean(e.utr)}\nUPI: ${clean(e.upi)}\nAmount: INR ${clean(e.amount)}\nDate/time: ${time(e.at)}\nSource: ${clean(e.source)}\nCaptured credit observation; payment approval is separate.`;}
function location(d){const latitude=numeric(d.latitude,-90,90),longitude=numeric(d.longitude,-180,180);if(d.locationPermission!==true||d.locationEnabled!==true||latitude===null||longitude===null)return null;return {latitude,longitude,at:d.lastSeenAt};}
module.exports={clean,time,numeric,status,maskedEvent,utr,location};
