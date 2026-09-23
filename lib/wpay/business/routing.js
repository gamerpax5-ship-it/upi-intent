"use strict";
const {minor}=require('./money');
// Pure decision over server-resolved state. No browser identity or bank output.
function eligibility(candidate,amount,now){
 const reasons=[];const add=(ok,reason)=>{if(!ok)reasons.push(reason);};
 add(candidate.userStatus==='active'&&candidate.approval==='approved','account_unavailable');
 // New background candidates carry authoritative factor state, not a browser session.
 // Older standalone callers must still supply their complete assurance context.
 add((candidate.authenticatorRequired===false||candidate.mfaEnabled===true)&&(candidate.securityReady===undefined?candidate.sessionReady===true:candidate.securityReady===true),'mfa_required');
 add(candidate.deviceRequired!==true||candidate.deviceEligible===true,'device_required');
 add(candidate.operationsEnabled===true,'operations_disabled');add(candidate.funded===true,'funding_required');
 add(candidate.assignmentActive===true&&+new Date(candidate.effectiveFrom)<=now,'assignment_inactive');
 add(candidate.bankApproved===true&&(candidate.bankVerified===true||candidate.bankAdminApproved===true)&&candidate.bankStatus==='running'&&!candidate.bankFrozen&&!candidate.bankDeactivated,'bank_unavailable');
 add(minor(amount)>=minor(candidate.minMinor)&&minor(amount)<=minor(candidate.maxMinor),'ticket_limit');
 add(minor(amount)<=minor(candidate.bankRemainingMinor,{zero:true}),'bank_limit');
 add(minor(amount)<=minor(candidate.availableMinor,{zero:true}),'capacity_insufficient');
 return {eligible:reasons.length===0,reasons};
}
function select(candidates,amount,now=Date.now()){
 return candidates.filter(item=>eligibility(item,amount,now).eligible).sort((a,b)=>a.priority-b.priority ||
  (BigInt(a.availableMinor)>BigInt(b.availableMinor)?-1:BigInt(a.availableMinor)<BigInt(b.availableMinor)?1:0) ||
  a.userId.localeCompare(b.userId)||a.routeId.localeCompare(b.routeId))[0]||null;
}
module.exports={eligibility,select,strategy:'priority-capacity-stable-id',extensionPoints:Object.freeze(['round-robin','success-rate-weighting'])};
