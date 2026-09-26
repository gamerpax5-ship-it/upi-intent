"use strict";
const {createHash}=require('node:crypto');
// A last-four-only Business UPI identity is bound to its UPI and bank name.
// Never treat matching last four digits as evidence of a shared bank account.
const accountDigest=details=>createHash('sha256').update(details.routeType==='business_upi'?JSON.stringify(['business_upi',details.upiId,details.bankName.trim().toLowerCase(),details.accountNumber]):details.ifsc+':'+details.accountNumber).digest('hex');
class PaymentEvidence {
 constructor({verify=null,allowSynthetic=false}={}){this.verify=verify;this.allowSynthetic=allowSynthetic;}
 async inspect(challenge){
  const response=await require('../integrations/provider-read').providerRead(this.verify,challenge);
  if(response.state!=='response')return {state:'unavailable',reason:response.reason,proof:null};
  if(response.value==null)return {state:'pending',proof:null};
  const proof=this.validate(challenge,response.value);return {state:proof?'verified':'invalid_evidence',proof};
 }
 async lookup(challenge){return (await this.inspect(challenge)).proof;}
 validate(challenge,proof){
  // A scoped legacy UTR/status observation is only a candidate. A separately
  // trusted verifier must establish credited recipient, amount and occurrence.
  if(!proof||proof.verified!==true||proof.status!=='credited'||proof.currency!=='INR'||
   proof.challengeId!==challenge.id||proof.ownerId!==challenge.owner_id||proof.bankId!==challenge.bank_id||proof.bankVersion!==challenge.bank_version||
   proof.receivingUpi!==challenge.expected_upi||proof.accountDigest!==challenge.account_digest||String(proof.amountMinor)!==String(challenge.amount_minor)||
   typeof proof.paymentId!=='string'||proof.paymentId.length<8||proof.paymentId.length>200||
   !['bank-provider','bank-attestation',...(this.allowSynthetic?['synthetic-test']:[])].includes(proof.source))return null;
  const time=+new Date(proof.receivedAt);if(!Number.isFinite(time)||time<+new Date(challenge.created_at)||time>=+new Date(challenge.expires_at)||time>Date.now())return null;
  return {digest:createHash('sha256').update(proof.paymentId).digest('hex'),source:proof.source,receivedAt:new Date(time),synthetic:proof.source==='synthetic-test'};
 }
}
module.exports={PaymentEvidence,accountDigest};
