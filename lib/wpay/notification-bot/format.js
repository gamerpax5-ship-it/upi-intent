'use strict';
// Explicit projections only. Never stringify bank details, notes, credentials,
// SMS bodies, OTP content, webhook secrets or arbitrary event metadata.
function text(value,max=160){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').slice(0,max):'Not reported';}
function amount(minor){if(typeof minor!=='string'||!/^\d{1,30}$/.test(minor))throw Error('INVALID_NOTIFICATION_AMOUNT');const value=BigInt(minor);return 'INR '+(value/100n)+'.'+String(value%100n).padStart(2,'0');}
function date(value){const parsed=new Date(value);return value&&Number.isFinite(+parsed)?parsed.toISOString():'Not reported';}
function registration(account){
 if(!['user','merchant'].includes(account.account_type))throw Error('INVALID_NOTIFICATION_ROLE');
 return ['New '+(account.account_type==='user'?'User':'Merchant')+' Registration','Name: '+text(account.name,100),'Email: '+text(account.email,254),'Registered: '+date(account.created_at),'Review this account in the existing Admin approval page.'].join('\n');
}
function bankSubmission({account,bank,details,approved=false}){
 const digits=typeof details.accountNumber==='string'?details.accountNumber.replace(/\D/g,''):'';
 return [approved?'UPI Approved':'UPI Details Submitted','User: '+text(account.name,100),'Email: '+text(account.email,254),
  'UPI: '+text(details.upiId,320),'Bank: '+text(details.bankName,100),'Account holder: '+text(details.holderName,100),
  'Account: '+(digits?'•••• '+digits.slice(-4):'Not reported'),'IFSC: '+text(details.ifsc,20),'Linked mobile: '+text(details.mobile,20),
  'Version: '+text(String(bank.version),10),'Status: '+text(bank.status,40)].join('\n');
}
function pendingPayment({upi,amountMinor,utr}){
 if(typeof utr!=='string'||!/^\d{12}$/.test(utr))throw Error('INVALID_NOTIFICATION_UTR');
 return ['Payment confirmation pending','UPI: '+text(upi,320),'Amount: '+amount(amountMinor),'UTR: '+utr,
  'No matching SMS/statement evidence has confirmed this payment.','Only the mapped receiving User can press Received. Confirm only after checking that the funds arrived; this will mark the payment Successful.'].join('\n');
}
function callbackResult({utr,amountMinor,paymentStatus,callbackStatus}){
 if(typeof utr!=='string'||!/^\d{12}$/.test(utr))throw Error('INVALID_NOTIFICATION_UTR');
 if(paymentStatus!=='successful')return 'Payment is not Successful. No callback success is claimed.';
 const sent=callbackStatus==='delivered';
 return ['Payment Successful',sent?'Callback Sent':'Callback '+({pending:'pending',leased:'in progress',failed:'failed',unconfigured:'not configured'}[callbackStatus]||'not confirmed'),
  'UTR: '+utr,'Amount: '+amount(amountMinor),sent?'Merchant endpoint accepted the callback.':'Payment and callback delivery are separate; funds will not be credited again.'].join('\n');
}
module.exports={text,amount,date,registration,bankSubmission,pendingPayment,callbackResult};
