"use strict";
const {AuthError}=require('../auth/runtime/errors');
const {exactFields}=require('../auth/runtime/validation');
const {uuid}=require('../auth/runtime/commercial');
const {minor}=require('./money');
function id(value){if(!uuid(value))throw new AuthError('INVALID_INPUT');return value;}
function reference(value){if(typeof value!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(value))throw new AuthError('INVALID_INPUT');return value;}
function text(value,max=120){if(typeof value!=='string'||value.trim().length<2||value.length>max||/[\p{Cc}\p{Cf}]/u.test(value))throw new AuthError('INVALID_INPUT');return value.trim();}
function reason(value){const r=text(value,300);if(/password|\bpin\b|\botp\b|private.?key|seed phrase|recovery code|bearer\s|secret/i.test(r))throw new AuthError('INVALID_INPUT');return r;}
function bank(input){
 exactFields(input,['upiId','bankName','holderName','accountNumber','ifsc','mobile','bankLimitMinor','accountType','providerName','notes',...(input&&Object.hasOwn(input,'routeType')?['routeType']:[])]);
 if(input.routeType!==undefined&&!['business_upi','merchant_qr_bank'].includes(input.routeType))throw new AuthError('INVALID_INPUT');
 if(input.routeType==='business_upi'){
  if(typeof input.upiId!=='string'||!/^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,40}$/.test(input.upiId)||typeof input.accountNumber!=='string'||!/^\d{4}$/.test(input.accountNumber)||input.ifsc!==''||typeof input.mobile!=='string'||!/^\+?[0-9]{10,15}$/.test(input.mobile)||input.accountType!=='business')throw new AuthError('INVALID_INPUT');
  return {routeType:input.routeType,upiId:input.upiId.toLowerCase(),bankName:text(input.bankName),holderName:text(input.holderName),accountNumber:input.accountNumber,ifsc:'',mobile:input.mobile,bankLimitMinor:minor(input.bankLimitMinor).toString(),accountType:'business',providerName:text(input.providerName),notes:input.notes===''?'':reason(input.notes)};
 }
 if(!/^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,40}$/.test(input.upiId)||! /^[0-9]{6,24}$/.test(input.accountNumber)||! /^[A-Z]{4}0[A-Z0-9]{6}$/.test(input.ifsc)||! /^\+?[0-9]{10,15}$/.test(input.mobile)||!['personal','business'].includes(input.accountType))throw new AuthError('INVALID_INPUT');
 return {upiId:input.upiId.toLowerCase(),bankName:text(input.bankName),holderName:text(input.holderName),accountNumber:input.accountNumber,ifsc:input.ifsc,mobile:input.mobile,
  bankLimitMinor:minor(input.bankLimitMinor).toString(),accountType:input.accountType,providerName:input.providerName===''?'':text(input.providerName),notes:input.notes===''?'':reason(input.notes),...(input.routeType?{routeType:input.routeType}:{})};
}
module.exports={id,reference,text,reason,bank,exactFields};
