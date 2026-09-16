"use strict";
const {AuthError}=require('../auth/runtime/errors'),v=require('../business/validation'),money=require('../business/money'),{fields,text}=require('../gateway/validation');
const fail=(code='INVALID_INPUT')=>{throw new AuthError(code);};
function order(body){
 fields(body,['reference','idempotencyKey','beneficiaryName','accountNumber','ifsc','amountMinor','note']);
 v.reference(body.reference);v.reference(body.idempotencyKey);if(money.minor(body.amountMinor)>money.MAX)fail();
 if(typeof body.accountNumber!=='string'||typeof body.ifsc!=='string'||! /^[0-9]{6,24}$/.test(body.accountNumber)||! /^[A-Z]{4}0[A-Z0-9]{6}$/.test(body.ifsc))fail();
 return {reference:body.reference,idempotencyKey:body.idempotencyKey,beneficiaryName:v.text(body.beneficiaryName,120),accountNumber:body.accountNumber,ifsc:body.ifsc,amountMinor:body.amountMinor,note:text(body.note??'',300)};
}
function page(body={}){
 fields(body,['offset','limit','state','reference','currency']);const offset=body.offset??0,limit=body.limit??25;
 if(!Number.isInteger(offset)||offset<0||offset>100000||!Number.isInteger(limit)||limit<1||limit>100)fail();
 if(body.state!==undefined&&!/^[a-z_]{2,40}$/.test(body.state))fail();if(body.reference!==undefined)v.reference(body.reference);
 if(body.currency!==undefined&&!['INR','USDT'].includes(body.currency))fail();return {...body,offset,limit};
}
function utr(value){if(typeof value!=='string'||! /^[A-Z0-9][A-Z0-9-]{7,39}$/.test(value))fail();return value;}
function recent(row){if(!row.mfa_at||!row.database_now||+new Date(row.database_now)-+new Date(row.mfa_at)>300000)fail('RECENT_MFA_REQUIRED');}
module.exports={order,page,utr,recent,fail,fields,text};
