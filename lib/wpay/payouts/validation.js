"use strict";
const {recentAuthenticationAt}=require('../auth/runtime/session-assurance');
const {AuthError}=require('../auth/runtime/errors'),v=require('../business/validation'),money=require('../business/money'),{fields,text}=require('../gateway/validation');
const fail=(code='INVALID_INPUT')=>{throw new AuthError(code);};
function order(body){
 fields(body,['reference','idempotencyKey','beneficiaryName','bankName','accountNumber','ifsc','upiId','amountMinor','note','transferMode','durationMinutes']);
 v.reference(body.reference);v.reference(body.idempotencyKey);if(money.minor(body.amountMinor)>money.MAX)fail();
 const transferMode=body.transferMode??'bank',durationMinutes=body.durationMinutes??30;
 if(!['bank','upi'].includes(transferMode)||!Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>10080)fail();
 if(transferMode==='bank'&&(typeof body.accountNumber!=='string'||typeof body.ifsc!=='string'||! /^[0-9]{6,24}$/.test(body.accountNumber)||! /^[A-Z]{4}0[A-Z0-9]{6}$/.test(body.ifsc)))fail();
 if(transferMode==='upi'&&(!body.upiId||body.accountNumber||body.ifsc||body.bankName))fail();
 if(body.transferMode==='bank'&&body.upiId)fail();
 const bankName=body.bankName===undefined||body.bankName===''?'':v.text(body.bankName,120),upiId=body.upiId===undefined||body.upiId===''?'':String(body.upiId).toLowerCase();
 if(upiId&&!/^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,40}$/.test(upiId))fail();
 return {transferMode,durationMinutes,reference:body.reference,idempotencyKey:body.idempotencyKey,beneficiaryName:v.text(body.beneficiaryName,120),bankName,accountNumber:body.accountNumber??'',ifsc:body.ifsc??'',upiId,amountMinor:body.amountMinor,note:text(body.note??'',300)};
}
function page(body={}){
 fields(body,['offset','limit','state','reference','currency']);const offset=body.offset??0,limit=body.limit??25;
 if(!Number.isInteger(offset)||offset<0||offset>100000||!Number.isInteger(limit)||limit<1||limit>100)fail();
 if(body.state!==undefined&&!/^[a-z_]{2,40}$/.test(body.state))fail();if(body.reference!==undefined)v.reference(body.reference);
 if(body.currency!==undefined&&!['INR','USDT'].includes(body.currency))fail();return {...body,offset,limit};
}
function utr(value){if(typeof value!=='string'||! /^[A-Z0-9][A-Z0-9-]{7,39}$/.test(value))fail();return value;}
function recent(row){if(!recentAuthenticationAt(row)||!row.database_now||+new Date(row.database_now)-+new Date(recentAuthenticationAt(row))>300000)fail('RECENT_MFA_REQUIRED');}
module.exports={order,page,utr,recent,fail,fields,text};
