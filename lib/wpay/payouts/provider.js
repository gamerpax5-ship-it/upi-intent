"use strict";
const {providerRead}=require('../integrations/provider-read');
const {digest}=require('../business/ledger');
const {AuthError}=require('../auth/runtime/errors');
// Provider-neutral status reads only. No signing, submission or custody method.
// A status result is an input to an authorized reconciliation transition, not a
// completed WPay payout and never an instruction to credit a ledger directly.
class PayoutProvider {
 constructor({read=null,allowSynthetic=false}={}){this.read=read;this.allowSynthetic=allowSynthetic;}
 async inspect(request){
  if(!request||!['INR','USDT'].includes(request.currency)||typeof request.operationId!=='string'||typeof request.ownerId!=='string'||typeof request.tenantId!=='string'||typeof request.amountMinor!=='string'||! /^[1-9][0-9]{0,29}$/.test(request.amountMinor)||! /^[0-9a-f]{64}$/.test(request.snapshotDigest))throw new AuthError('INVALID_INPUT');
  const response=await providerRead(this.read,request,{timeoutMs:5000,attempts:2});
  if(response.state!=='response')return {state:'unavailable',reason:response.reason,accountingFinal:false};
  const r=response.value;
  if(!r||!['pending','submitted','failed','expired','cancelled','disputed','confirmed'].includes(r.state)||['operationId','ownerId','tenantId','amountMinor','currency','snapshotDigest'].some(k=>r[k]!==request[k])||r.synthetic===true&&!this.allowSynthetic)return {state:'review',reason:'invalid_provider_evidence',accountingFinal:false};
  if(r.state!=='confirmed')return {state:r.state,accountingFinal:false};
  if(r.independentlyVerified!==true||r.final!==true||typeof r.economicId!=='string'||typeof r.evidenceId!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(r.economicId)||! /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(r.evidenceId))return {state:'review',reason:'unverified_completion',accountingFinal:false};
  return {state:'evidence_ready',accountingFinal:false,economicId:r.economicId,evidenceId:r.evidenceId,requestDigest:digest(request)};
 }
}
module.exports={PayoutProvider};
