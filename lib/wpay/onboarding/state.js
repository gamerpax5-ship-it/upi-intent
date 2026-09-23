"use strict";
const {AuthError}=require('../auth/runtime/errors'),ledger=require('../business/ledger');
async function refresh(client,owner){
 await client.query(`UPDATE wpay_auth.eligibility SET
  approved_bank_account_available=EXISTS(SELECT 1 FROM wpay_auth.business_bank_accounts b WHERE b.owner_id=$1 AND b.approved_version=b.version AND NOT b.frozen AND NOT b.deactivated),
  upi_approved=EXISTS(SELECT 1 FROM wpay_auth.business_bank_accounts b WHERE b.owner_id=$1 AND b.approved_version=b.version AND NOT b.frozen AND NOT b.deactivated),
  upi_verified=EXISTS(SELECT 1 FROM wpay_auth.business_bank_accounts b WHERE b.owner_id=$1 AND b.verified_version=b.version AND NOT b.frozen AND NOT b.deactivated),
  statement_satisfied=NOT (SELECT statement_required FROM wpay_auth.bank_onboarding_policy) OR EXISTS(SELECT 1 FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.bank_statement_imports s ON s.bank_id=b.id AND s.bank_version=b.version WHERE b.owner_id=$1 AND s.status='accepted' AND NOT b.deactivated),
  operations_enabled=EXISTS(SELECT 1 FROM wpay_auth.business_bank_accounts b WHERE b.owner_id=$1 AND b.status='running' AND b.approved_version=b.version AND (b.verified_version=b.version OR EXISTS(SELECT 1 FROM wpay_auth.admin_bank_approvals ap WHERE ap.bank_id=b.id AND ap.bank_version=b.version)) AND NOT b.frozen AND NOT b.deactivated)
  WHERE account_id=$1`,[owner]);
}
async function invalidate(client,bank){await client.query("UPDATE wpay_auth.upi_verification_challenges SET status='invalidated',completed_at=CURRENT_TIMESTAMP WHERE bank_id=$1 AND status='waiting'",[bank]);}
async function canStart(client,bank){
 const row=(await client.query(`SELECT a.status,e.approval_status,e.initial_deposit_satisfied,z.enabled,z.factor_version,z.encrypted_secret,
  COALESCE(r.device_required,false) AS device_required,COALESCE(r.device_eligible,false) AS device_eligible,
  p.statement_required,EXISTS(SELECT 1 FROM wpay_auth.bank_statement_imports s WHERE s.owner_id=a.id AND s.bank_id=$2 AND s.bank_version=$3 AND s.status='accepted') AS statement_ready
  FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id JOIN wpay_auth.account_security z ON z.account_id=a.id
  LEFT JOIN wpay_auth.business_routing_requirements r ON r.owner_id=a.id CROSS JOIN wpay_auth.bank_onboarding_policy p WHERE a.id=$1`,[bank.owner_id,bank.id,bank.version])).rows[0];
 if(!row||row.status!=='active'||row.approval_status!=='approved'||(row.enabled&&(!row.factor_version||!row.encrypted_secret)))throw new AuthError('FORBIDDEN');
 const balance=await ledger.summary(client,bank.owner_id);
 if(!row.initial_deposit_satisfied||BigInt(balance.allocated)<=0n||BigInt(balance.deficit)>0n)throw new AuthError('FUNDING_REQUIRED');
 if(row.statement_required&&!row.statement_ready)throw new AuthError('STATEMENT_REQUIRED');
 if(row.device_required&&!row.device_eligible)throw new AuthError('DEVICE_REQUIRED');
}
module.exports={refresh,invalidate,canStart};
