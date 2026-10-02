'use strict';
// Explicit projections only. Never stringify bank details, notes, credentials,
// SMS bodies, OTP content, webhook secrets or arbitrary event metadata.
function text(value,max=160){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').slice(0,max):'Not reported';}
function amount(minor){if(typeof minor!=='string'||!/^\d{1,30}$/.test(minor))throw Error('INVALID_NOTIFICATION_AMOUNT');const value=BigInt(minor);return 'INR '+(value/100n)+'.'+String(value%100n).padStart(2,'0');}
function date(value){const parsed=new Date(value);return value&&Number.isFinite(+parsed)?parsed.toISOString():'Not reported';}
function registration(account){
 if(!['user','merchant'].includes(account.account_type))throw Error('INVALID_NOTIFICATION_ROLE');
 return ['New '+(account.account_type==='user'?'User':'Merchant')+' Registration','Name: '+text(account.name,100),'Email: '+text(account.email,254),'Registered: '+date(account.created_at),'Review and approve/reject this account directly in this Telegram group.'].join('\n');
}

function reviewCard(account,d={}){
 const user=account.account_type==='user';return [user?'User Approval':'Merchant Approval','Name: '+text(account.name,100),'Email: '+text(account.email,254),'Status: '+text(account.approval_status||'pending',30),'',...(user?['Pay-in commission: '+text(d.payinCommission||'0.45',20)+'%','Payout commission: '+text(d.payoutCommission||'0.30',20)+'%','INR/USDT: '+text(d.inrPerUsdt||'107',20),'USDT network/address: set during approval','Free setup: '+(d.freeSetup?'Yes':'No'),'Unlimited collection: '+(d.unlimitedCollection?'Yes':'No')]:['Pay-in fee: '+text(d.payinFee||'1.2',20)+'%','Payout fee: '+text(d.payoutFee||'0.8',20)+'%','Fixed payout fee: INR '+text(d.fixedPayoutFee||'6',20),'Payment link TTL: '+text(String(d.paymentLinkTtlSeconds||300),20)+' sec','INR/USDT: '+text(d.inrPerUsdt||'107',20)]),'Choose an action below. No Admin browser login is required.'].join('\n');
}
function approvalPrompt(account,d={}){
 if(account.account_type==='user')return ['Reply to THIS message with 7 values separated by |','payinCommission | payoutCommission | INRperUSDT | network | USDTaddress | freeSetup yes/no | unlimitedCollection yes/no','Example: 0.45 | 0.30 | 107 | TRON-TRC20 | T... | no | no','The address must pass the same WPay validation as the Admin panel.'].join('\n');
 return ['Reply to THIS message with 5 values separated by |','payinFee | payoutFee | fixedPayoutFeeINR | paymentLinkTTLseconds | INRperUSDT','Example: '+(d.payinFee||'1.2')+' | '+(d.payoutFee||'0.8')+' | '+(d.fixedPayoutFee||'6')+' | '+(d.paymentLinkTtlSeconds||300)+' | '+(d.inrPerUsdt||'107')].join('\n');
}
function rejectPrompt(account){return 'Reply to THIS message with the rejection reason for '+text(account.name,100)+' (minimum 3 characters).';}
function approvalDraft(account,d,mode){if(mode==='reject')return ['Confirm rejection','Account: '+text(account.name,100)+' · '+text(account.email,254),'Reason: '+text(d.reason,500)].join('\n');const user=account.account_type==='user';return ['Confirm '+(user?'User':'Merchant')+' approval','Account: '+text(account.name,100)+' · '+text(account.email,254),...(user?['Pay-in commission: '+text(d.payinCommission,20)+'%','Payout commission: '+text(d.payoutCommission,20)+'%','INR/USDT: '+text(d.inrPerUsdt,20),'Network: '+text(d.depositNetwork,30),'USDT address: '+(d.depositAddress?'••••'+text(d.depositAddress.slice(-8),8):'Not set'),'Free setup: '+(d.freeSetup?'Yes':'No'),'Unlimited collection: '+(d.unlimitedCollection?'Yes':'No')]:['Pay-in fee: '+text(d.payinFee,20)+'%','Payout fee: '+text(d.payoutFee,20)+'%','Fixed payout fee: INR '+text(d.fixedPayoutFee,20),'TTL: '+text(String(d.paymentLinkTtlSeconds),20)+' sec','INR/USDT: '+text(d.inrPerUsdt,20)]),'Tap Confirm only after reviewing these values.'].join('\n');}
function approvalDone(account,status){return [(status==='approved'?'Approved':'Rejected')+' in Telegram','Account: '+text(account.name,100),'Email: '+text(account.email,254),'Type: '+(account.account_type==='user'?'User':'Merchant'),'Status: '+status].join('\n');}
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
module.exports={text,amount,date,registration,reviewCard,approvalPrompt,rejectPrompt,approvalDraft,approvalDone,bankSubmission,pendingPayment,callbackResult};
