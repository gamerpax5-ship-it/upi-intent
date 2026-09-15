"use strict";
const {createHash}=require('node:crypto');
const accountDigest=details=>createHash('sha256').update(details.ifsc+':'+details.accountNumber).digest('hex');
class PaymentEvidence {
 constructor({verify=null,allowSynthetic=false}={}){this.verify=verify;this.allowSynthetic=allowSynthetic;}
 async lookup(challenge){
  if(typeof this.verify!=='function')return null;
  // A scoped legacy UTR/status observation is only a candidate. A separately
  // trusted verifier must establish credited recipient, amount and occurrence.
  let timer;let proof;
  try{proof=await Promise.race([this.verify(Object.freeze({...challenge})),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),2000);})]);}finally{clearTimeout(timer);}
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
