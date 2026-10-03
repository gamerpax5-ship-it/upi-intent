'use strict';
const {eligibility}=require('./routing');
const labels=Object.freeze({
 merchant_assignment_missing:'No merchant is assigned to this UPI.',
 merchant_unavailable:'Assigned merchant is inactive or not approved.',
 commercial_terms_missing:'User or merchant commercial terms are missing.',
 account_unavailable:'UPI owner is inactive or not approved.',
 mfa_required:'UPI owner security setup is incomplete.',
 device_required:'Required linked device is not eligible.',
 statement_required:'An accepted statement is missing for this UPI version.',
 operations_disabled:'Collection operations are disabled.',
 funding_required:'Collection funding is not ready.',
 assignment_inactive:'Merchant assignment is disabled or has not started yet.',
 bank_unavailable:'UPI is stopped, frozen, deactivated or awaiting current-version approval/verification.',
 ticket_limit:'Payment amount is outside the assigned route range.',
 bank_limit:'Remaining UPI daily limit is below the route minimum.',
 capacity_insufficient:'Available collection capacity is below the route minimum.'
});
function project(bank,decisions){
 const eligible=decisions.some(d=>d.eligible)&&bank.status==='running'&&!bank.frozen&&!bank.deactivated;
 const reasons=eligible?[]:[...new Set(decisions.length?decisions.flatMap(d=>d.reasons):['merchant_assignment_missing'])];
 if(!eligible&&(bank.status!=='running'||bank.frozen||bank.deactivated)&&!reasons.includes('bank_unavailable'))reasons.unshift('bank_unavailable');
 const displayStatus=bank.deactivated?'deactivated':bank.frozen?'frozen':bank.status!=='running'?bank.status:eligible?'running':decisions.length?'blocked':'unassigned';
 return {displayStatus,routingReadiness:{eligible,reasons,reasonText:reasons.map(r=>labels[r]||r.replaceAll('_',' ')).join(' '),evaluatedAt:'route_minimum'}};
}
// Call only with banks already restricted by the caller's permission/owner scope.
// No merchant identities or other owners' financial data are returned on banks.
async function decorate(client,banks,core){
 if(!banks.length)return new Map();
 core=core||new (require('./core').BusinessCore)();
 const ids=banks.map(b=>b.id),byBank=new Map(ids.map(id=>[id,[]])),routeDecisions=new Map();
 const assignments=(await client.query(`SELECT DISTINCT x.id,x.merchant_id,b.id AS bank_id,
  (m.status='active' AND me.approval_status='approved') AS merchant_ready,
  (EXISTS(SELECT 1 FROM wpay_auth.commercial_versions cv WHERE cv.account_id=m.id AND cv.effective_at<=CURRENT_TIMESTAMP)
   AND EXISTS(SELECT 1 FROM wpay_auth.commercial_versions cv WHERE cv.account_id=u.id AND cv.effective_at<=CURRENT_TIMESTAMP)) AS terms_ready
  FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.accounts u ON u.id=b.owner_id
  JOIN wpay_auth.business_assignments x ON x.user_id=b.owner_id AND
   (x.bank_id=b.id OR (x.bank_id IS NULL AND NOT EXISTS(SELECT 1 FROM wpay_auth.admin_bank_approvals ap WHERE ap.bank_id=b.id)))
  JOIN wpay_auth.accounts m ON m.id=x.merchant_id AND m.tenant_id=u.tenant_id AND m.account_type='merchant'
  LEFT JOIN wpay_auth.eligibility me ON me.account_id=m.id
  WHERE b.id=ANY($1::uuid[]) ORDER BY x.merchant_id,x.id,b.id`,[ids])).rows;
 const cache=new Map();
 for(const assignment of assignments){
  if(!cache.has(assignment.merchant_id))cache.set(assignment.merchant_id,await core.candidates(client,assignment.merchant_id,{bankIds:ids}));
  const candidate=cache.get(assignment.merchant_id).find(c=>c.assignmentId===assignment.id&&c.bankId===assignment.bank_id);
  const decision=candidate?eligibility(candidate,candidate.minMinor,candidate.databaseNow):{eligible:false,reasons:['bank_unavailable']};
  if(assignment.merchant_ready!==true)decision.reasons.push('merchant_unavailable');
  if(assignment.terms_ready!==true)decision.reasons.push('commercial_terms_missing');
  decision.eligible=decision.reasons.length===0;
  byBank.get(assignment.bank_id).push(decision);routeDecisions.set(assignment.id+':'+assignment.bank_id,decision);
 }
 for(const bank of banks)Object.assign(bank,project(bank,byBank.get(bank.id)));
 return routeDecisions;
}
module.exports={decorate,project};
