'use strict';
const {phone}=require('../onboarding/device-readiness'),{fail}=require('./policy'),fmt=require('./format');
class Source{
 constructor({pool,pairing,origin}){Object.assign(this,{pool,pairing,origin});}
 async bank(c,id,tenants){return (await c.query(`SELECT b.*,v.details,a.name,a.email,a.tenant_id,a.status AS account_status,e.approval_status,
 EXISTS(SELECT 1 FROM wpay_auth.admin_bank_approvals ap WHERE ap.bank_id=b.id AND ap.bank_version=b.version) AS admin_managed,
 (SELECT statement_required FROM wpay_auth.bank_onboarding_policy) AS statement_required,
 EXISTS(SELECT 1 FROM wpay_auth.bank_statement_imports s WHERE s.owner_id=b.owner_id AND s.bank_id=b.id AND s.bank_version=b.version AND s.status='accepted') AS statement_ready
 FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version
 JOIN wpay_auth.accounts a ON a.id=b.owner_id JOIN wpay_auth.eligibility e ON e.account_id=a.id
 WHERE b.id=$1 AND a.account_type='user' AND a.tenant_id=ANY($2)`,[id,tenants])).rows[0];}
 async device(bank){
  const expected=phone(bank.details.mobile);if(!expected||!this.pairing)return {sourceConnected:false,status:'unavailable',lastSeenAt:null};
  const links=(await this.pool.query(`WITH owned AS (
   SELECT id,owner_id,source_id,device_ref,pairing_id,valid_from,valid_until,NULL::timestamptz authority_at FROM wpay_auth.paired_devices WHERE owner_id=$1 AND revoked_at IS NULL AND valid_from<=CURRENT_TIMESTAMP AND valid_until>CURRENT_TIMESTAMP
   UNION ALL SELECT id,account_id,source_id,resource_id,NULL::text,valid_from,valid_until,verified_at FROM wpay_auth.resource_links r WHERE account_id=$1 AND resource_kind='device' AND source_id='legacy-primary' AND status='verified' AND consent_at<=CURRENT_TIMESTAMP AND verified_at<=CURRENT_TIMESTAMP AND valid_from<=CURRENT_TIMESTAMP AND valid_until>CURRENT_TIMESTAMP AND revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM wpay_auth.paired_devices p WHERE p.device_ref=r.resource_id AND p.source_id=r.source_id)
  ) SELECT * FROM owned ORDER BY device_ref LIMIT 101`,[bank.owner_id])).rows;
  if(!links.length||links.length>100)return {sourceConnected:true,status:links.length?'ambiguous':'not_linked',lastSeenAt:null};
  try{
   if(this.pairing.devicesIncludesReadiness!==true&&!await this.pairing.ready())throw Error();
   const devices=(await this.pairing.devices(links)).filter(d=>links.some(l=>l.device_ref===d.id)&&d.linked===true&&phone(d.phone_e164)===expected);
   const now=Date.now(),valid=devices.filter(d=>Number.isFinite(Date.parse(d.last_seen_at))&&Date.parse(d.last_seen_at)<=now+30000),online=valid.filter(d=>now-Date.parse(d.last_seen_at)>=-30000&&now-Date.parse(d.last_seen_at)<=120000);
   if(online.length>1)return {sourceConnected:true,status:'ambiguous',lastSeenAt:null};
   const latest=online[0]||valid.sort((a,b)=>Date.parse(b.last_seen_at)-Date.parse(a.last_seen_at))[0];
   return {sourceConnected:true,status:online.length?'online':latest?'offline':'not_reported',lastSeenAt:latest?new Date(latest.last_seen_at).toISOString():null};
  }catch{return {sourceConnected:false,status:'unavailable',lastSeenAt:null};}
 }
 async claims(c,bankId){return (await c.query(`SELECT cl.id,cl.order_id,cl.utr_digest,cl.created_at FROM wpay_auth.gateway_claims cl
 JOIN wpay_auth.gateway_orders o ON o.id=cl.order_id JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id
 WHERE r.bank_id=$1 AND o.state NOT IN('successful','cancelled') AND o.evidence_state NOT IN('rejected','verified') ORDER BY cl.created_at,cl.id LIMIT 501`,[bankId])).rows;}
 async claim(c,id,tenants){return (await c.query(`SELECT cl.*,o.state,o.evidence_state,o.amount_minor,o.id AS order_id,r.user_id,r.bank_id,bv.details->>'upiId' AS upi,
 u.tenant_id FROM wpay_auth.gateway_claims cl JOIN wpay_auth.gateway_orders o ON o.id=cl.order_id
 JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id JOIN wpay_auth.business_bank_versions bv ON bv.bank_id=r.bank_id AND bv.version=r.bank_version
 JOIN wpay_auth.accounts u ON u.id=r.user_id JOIN wpay_auth.accounts m ON m.id=o.merchant_id
 JOIN wpay_auth.eligibility ue ON ue.account_id=u.id JOIN wpay_auth.eligibility me ON me.account_id=m.id
 WHERE cl.id=$1 AND u.status='active' AND m.status='active' AND ue.approval_status='approved' AND me.approval_status='approved' AND u.tenant_id=ANY($2) AND m.tenant_id=ANY($2)`,[id,tenants])).rows[0];}
 async status(c,current,upi){
  const ids=current.state.mappings.map(m=>m.accountId),role=current.state.role;
  if(!['user','merchant','admin'].includes(role))fail('GROUP_NOT_CONFIGURED');
  if(role!=='admin'&&!(await c.query("SELECT 1 FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.id=ANY($1::uuid[]) AND a.account_type=$2 AND a.status='active' AND e.approval_status='approved' AND a.tenant_id=ANY($3)",[ids,role,current.tenant_ids])).rowCount)fail('UPI_UNAVAILABLE');
  const rows=(await c.query(`SELECT b.id FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version JOIN wpay_auth.accounts a ON a.id=b.owner_id
 WHERE lower(v.details->>'upiId')=$1 AND a.tenant_id=ANY($2) AND ($3='admin' OR ($3='user' AND b.owner_id=ANY($4::uuid[])) OR ($3='merchant' AND EXISTS(SELECT 1 FROM wpay_auth.business_assignments x WHERE x.user_id=b.owner_id AND x.status='active' AND (x.bank_id IS NULL OR x.bank_id=b.id) AND x.merchant_id=ANY($4::uuid[])))) LIMIT 2`,[upi,current.tenant_ids,role,ids])).rows;
  if(rows.length!==1)fail('UPI_NOT_FOUND_OR_AMBIGUOUS');const b=await this.bank(c,rows[0].id,current.tenant_ids);if(!b||b.account_status!=='active')fail('UPI_UNAVAILABLE');
  const device=await this.device(b);
  return ['UPI: '+fmt.text(b.details.upiId,320),'Status: '+(b.deactivated?'DISABLED':b.frozen?'FROZEN':b.status.toUpperCase()),
   'Device: '+device.status,'Approval: '+(b.approved_version===b.version?'Approved':b.status),
   'Verification: '+(b.verified_version===b.version?'Verified':b.admin_managed?'Admin managed':'Pending'),
   'Restrictions: '+(b.deactivated?'Deactivated':b.frozen?'Frozen':b.status==='rejected'?'Rejected':b.status==='stopped'?'Routing stopped — see dashboard for detailed reason':'None reported')].join('\n');
 }
}
module.exports={Source};
