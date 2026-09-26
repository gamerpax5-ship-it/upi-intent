"use strict";
const {randomUUID}=require('node:crypto'),{AuthError}=require('../auth/runtime/errors');
const ledger=require('../business/ledger'),money=require('../business/money'),v=require('../business/validation'),net=require('./networks');

// Only FundingApi's tenant-scoped deposit approver may reach this operation.
// Human approval is explicitly separate from a blockchain verification.
async function manualReview(workflow,c,request,input,actor){
 const allowed=['requestId','action','reason','amountUsdt'];
 if(!input||Object.keys(input).some(k=>!allowed.includes(k)))throw new AuthError('INVALID_INPUT');
 v.reason(input.reason);v.id(actor);await ledger.lock(c);
 const r=await workflow.request(c,request.id);
 if(input.action==='manual_reject'){
  if(input.amountUsdt!==undefined)throw new AuthError('INVALID_INPUT');
  if(['confirmed','reversed'].includes(r.state))throw new AuthError('CONFLICT');
  if(r.state==='rejected')return {state:r.state};
  await workflow.state(c,r,'rejected',input.reason);
  await workflow.event(c,r,'rejected',input.reason,{approvalMethod:'manual_review'},actor);
  return {state:'rejected'};
 }
 if(input.action!=='manual_confirm')throw new AuthError('INVALID_INPUT');
 const received=input.amountUsdt===undefined?r.snapshot.amountMinor:money.fromDecimal(input.amountUsdt,'USDT');
 money.minor(received);
 const amount=net.conversion(received,r.snapshot.rate);
 if(r.state==='confirmed'){
  if(r.credit_minor!==amount)throw new AuthError('CONFLICT');
  return {state:r.state,alreadyCredited:true};
 }
 if(r.state==='reversed')throw new AuthError('CONFLICT');
 if(BigInt(received)<BigInt(r.snapshot.minimumMinor||net.MINIMUM))throw new AuthError('BELOW_MINIMUM');
 const owner=(await c.query('SELECT a.status,e.approval_status FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.id=$1 AND a.tenant_id=$2',[r.owner_id,r.tenant_id])).rows[0];
 if(!owner||owner.status!=='active'||owner.approval_status!=='approved')throw new AuthError('FORBIDDEN');
 const version=r.accounting_version+1,source='manual_review_no_hash';
 const provenance={approvalMethod:'manual_review',blockchainVerified:false,receivedMinor:received,reason:input.reason};
 const journal=await ledger.post(c,{key:'funding:'+r.id+':'+version,referenceType:'usdt_deposit',referenceId:r.id,actorId:actor,source,snapshot:{funding:r.snapshot},metadata:provenance,entries:ledger.pair(r.owner_id,'capacity_allocated',amount)});
 await c.query("UPDATE wpay_auth.funding_requests SET state='confirmed',reason=$2,source=$3,credit_minor=$4,accounting_version=$5,updated_at=CURRENT_TIMESTAMP WHERE id=$1",[r.id,input.reason,source,amount,version]);
 await workflow.eligibility(c,r.owner_id);
 await workflow.event(c,r,'confirmed',input.reason,{...provenance,source},actor,journal);
 await c.query('INSERT INTO wpay_auth.funding_notifications(id,owner_id,request_id,journal_id,kind,payload) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),r.owner_id,r.id,journal,'deposit_confirmed',{creditMinor:amount,currency:'INR',source}]);
 return {state:'confirmed',creditMinor:amount,capacity:await ledger.summary(c,r.owner_id),source,blockchainVerified:false};
}
module.exports={manualReview};
