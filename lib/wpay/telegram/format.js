'use strict';
const clean=v=>v===null||v===undefined||v===''?'Unavailable':String(v).replace(/[\x00-\x1f\x7f]/g,' ').slice(0,180);
function time(v){const d=new Date(v);return v&&Number.isFinite(+d)?d.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})+' IST':'Unavailable';}
function numeric(v,min,max){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null;}
function status(d){return [`Number: ${clean(d.phone)}`,`Status: ${clean(d.status)}`,`Device: ${clean(d.model)}`,`Battery: ${d.battery===null||d.battery===undefined?'Unavailable':clean(d.battery)+'%'}`,`Charging: ${typeof d.charging==='boolean'?(d.charging?'Yes':'No'):'Unavailable'}`,`Network: ${clean(d.network)}`,`Carrier: ${clean(d.carrier)}`,`SIM: ${clean(d.simName)}`,`APK: ${clean(d.apkVersion)}`,`Last seen: ${time(d.lastSeenAt)}`].join('\n');}
// Only the source's redacted projection is displayable. Ignore raw message/code.
function maskedEvent(e){
 const length=Number.isInteger(e.otpLength)&&e.otpLength>=4&&e.otpLength<=8?e.otpLength:null;
 const mask=length?'12345678'.slice(0,length)+' [MASKED]':'[MASKED]';
 const content=e.contentMasked===true?e.maskedMessage:null;
 // Re-redact at the outbound boundary; unknown/unverifiable text stays hidden.
 const safe=content?require('../operations/masked-content').maskedContent({otp_length:length,code:length?'12345678'.slice(0,length):'',message:content}).message:null;
 const message=typeof safe==='string'?safe.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,2000):'Unavailable';
 return `Number: ${clean(e.phone)}\nSender: ${e.contentMasked===true?clean(e.sender):'Unavailable'}\nOTP received: ${mask}\nMessage (masked): ${message}\nDate/time: ${time(e.receivedAt)}`;
}
function utr(e){const d=new Date(e.at),valid=e.at&&Number.isFinite(+d);return `UTR: ${clean(e.utr)}\nUPI: ${clean(e.upi)}\nAmount: INR ${clean(e.amount)}\nAPK number: ${clean(e.apkNumber)}\nDate: ${valid?d.toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}):'Unavailable'}\nTime: ${valid?d.toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})+' IST':'Unavailable'}`;}
function detail(e){
 const d=new Date(e.detail_at||e.paid_at||e.claim_at||e.created_at),valid=Number.isFinite(+d);
 return [
  `UTR: ${clean(e.utr)}`,
  `Date: ${valid?d.toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}):'Unavailable'}`,
  `Time: ${valid?d.toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour12:false})+' IST':'Unavailable'}`,
  `Amount: INR ${clean(e.amount)}`,
  `Merchant: ${clean(e.merchant_name)}`,
  `User: ${clean(e.user_name)}`,
  `UPI ID: ${clean(e.upi)}`,
  `Status: ${e.callbackStatus==='success'?'success':'failed'}`,
  `Payment status: ${clean(e.payment_status)}`,
  `APK number: ${clean(e.apkNumber)}`
 ].join('\n');
}
function location(d){const latitude=numeric(d.latitude,-90,90),longitude=numeric(d.longitude,-180,180);if(latitude===null||longitude===null)return null;const historical=d.locationLastKnown===true;if(!historical&&(d.locationPermission!==true||d.locationEnabled!==true))return null;const at=Date.parse(d.locationAt);if(!Number.isFinite(at)||at>Date.now())return null;return {latitude,longitude,at:new Date(at).toISOString(),lastKnown:historical};}
module.exports={clean,time,numeric,status,maskedEvent,utr,detail,location};
