'use strict';
const {randomUUID}=require('node:crypto'),{AuthError}=require('../auth/runtime/errors'),v=require('./validation'),money=require('./money'),ledger=require('./ledger');
const {authorize,canUsePermission}=require('../authorization-policy'),{recentAuthenticationAt}=require('../auth/runtime/session-assurance');
const GET=['business/admin-upi'],POST=['business/admin-upi','business/admin-upi/create','business/admin-upi/route','business/admin-upi/state'];
const fail=(code='FORBIDDEN')=>{throw new AuthError(code);};
function permit(context,permissionId,account,bankId){const r=authorize({...context,permissionId,context:account?{kind:'record',id:bankId||account.id,tenantId:account.tenant_id,ownerType:account.account_type==='user'?'user':'merchant',ownerId:account.user_id||account.merchant_id,accountId:bankId||account.id,accountOwnerId:account.user_id||account.merchant_id,accountTenantId:account.tenant_id}:{kind:'list'}});if(!r.allowed)fail();return r.constraints.where.tenantIds;}
function recent(row){const at=recentAuthenticationAt(row),age=+new Date(row.database_now)-+new Date(at);if(!at||!Number.isFinite(age)||age<0||age>300000)fail('RECENT_MFA_REQUIRED');}
async function run(core,c,row,context,operation,b={}){
 if(!['admin','super_admin'].includes(row.account_type))fail();
 if(operation==='business/admin-upi'){
  require('../gateway/validation').fields(b,['offset','search']);const offset=b.offset??0,search=b.search??'';
  if(!Number.isInteger(offset)||offset<0||offset>100000||typeof search!=='string'||search.length>100)fail('INVALID_INPUT');
  const tenants=permit(context,'bank_upi.view'),routeTenants=canUsePermission({...context,permissionId:'assignments.view'}).allowed?permit(context,'assignments.view').filter(t=>tenants.includes(t)):[];
  const banks=(await c.query(`SELECT b.*,v.details,a.name AS owner_name,a.tenant_id,ap.actor_id AS admin_approved_by,ap.created_at AS admin_approved_at
   FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.accounts a ON a.id=b.owner_id JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version
   LEFT JOIN wpay_auth.admin_bank_approvals ap ON ap.bank_id=b.id AND ap.bank_version=b.version
   WHERE a.tenant_id=ANY($1) AND ($2='' OR position(lower($2) in lower(a.name||' '||(v.details->>'upiId')))>0)
   ORDER BY b.created_at DESC,b.id LIMIT 51 OFFSET $3`,[tenants,search,offset])).rows;
  const visible=banks.slice(0,50),ids=visible.map(x=>x.id);
  const routes=ids.length?(await c.query(`SELECT x.*,m.name AS merchant_name,m.tenant_id FROM wpay_auth.business_assignments x JOIN wpay_auth.accounts m ON m.id=x.merchant_id JOIN wpay_auth.accounts u ON u.id=x.user_id WHERE x.bank_id=ANY($1::uuid[]) AND m.tenant_id=ANY($2) AND u.tenant_id=ANY($2) ORDER BY x.created_at DESC,x.id`,[ids,routeTenants])).rows:[];
  const accounts=(await c.query(`SELECT a.id,a.name,a.account_type,a.tenant_id FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.tenant_id=ANY($1) AND a.account_type IN('user','merchant') AND a.status='active' AND e.approval_status='approved' ORDER BY a.name,a.id`,[tenants])).rows;
  const capacities=new Map();for(const bank of visible){if(!capacities.has(bank.owner_id))capacities.set(bank.owner_id,await ledger.summary(c,bank.owner_id));bank.available=capacities.get(bank.owner_id).available;const vol=await require('./bank-volume').volume(c,bank.id,bank.version);bank.used=vol.used;bank.sharedLimit=vol.shared_limit;}
  return {banks:visible,routes,accounts,hasMore:banks.length>50,offset,canCreate:canUsePermission({...context,permissionId:'bank_upi.approve'}).allowed,canRoute:canUsePermission({...context,permissionId:'assignments.update'}).allowed};
 }
 recent(row);await ledger.lock(c);
 if(operation==='business/admin-upi/create'){
  v.exactFields(b,['ownerId','details','reason','requestId']);v.id(b.requestId);const reason=v.reason(b.reason),owner=await core.account(c,b.ownerId,'user');permit(context,'bank_upi.approve',owner);
  const prior=(await c.query('SELECT bank_id,bank_version,reason FROM wpay_auth.admin_bank_approvals WHERE actor_id=$1 AND request_id=$2',[row.id,b.requestId])).rows[0];
  if(prior){const bank=await core.bankRecord(c,prior.bank_id);if(bank.owner_id!==b.ownerId||prior.reason!==reason||ledger.digest(bank.details)!==ledger.digest(v.bank(b.details)))fail('CONFLICT');return {id:bank.id,version:bank.version,status:bank.status,approvalMode:'admin'};}
  const saved=await core.saveBank(c,b.ownerId,{details:b.details},row.id);
  await c.query('INSERT INTO wpay_auth.admin_bank_approvals(bank_id,bank_version,actor_id,request_id,reason) VALUES($1,$2,$3,$4,$5)',[saved.id,saved.version,row.id,b.requestId,reason]);
  await c.query("UPDATE wpay_auth.business_bank_accounts SET approved_version=version,status='running',reason=$2 WHERE id=$1",[saved.id,reason]);
  await require('../onboarding/state').refresh(c,b.ownerId);
  await ledger.audit(c,{actorId:row.id,ownerId:b.ownerId,entityId:saved.id,event:'admin_bank_approved',reason,metadata:{version:saved.version,method:'admin_approval',paymentEvidence:false}});
  return {...saved,status:'running',approvalMode:'admin'};
 }
 if(operation==='business/admin-upi/route'){
  v.exactFields(b,['id','bankId','version','merchantId','priority','minMinor','maxMinor','enabled','reason']);const reason=v.reason(b.reason),bank=await core.bankRecord(c,b.bankId);if(!bank||bank.version!==b.version||bank.deactivated)fail('CONFLICT');
  const owner=await core.account(c,bank.owner_id,'user'),merchant=await core.account(c,b.merchantId,'merchant');permit(context,'assignments.update',owner);permit(context,'assignments.update',merchant);
  if(owner.tenant_id!==merchant.tenant_id)fail();
  const approved=(await c.query('SELECT 1 FROM wpay_auth.admin_bank_approvals WHERE bank_id=$1 AND bank_version=$2',[bank.id,bank.version])).rowCount;
  if(b.enabled&&(bank.frozen||bank.approved_version!==bank.version||!(approved||bank.verified_version===bank.version)))fail('CONFLICT');
  if(typeof b.enabled!=='boolean'||!Number.isInteger(b.priority)||b.priority<0||b.priority>100000||money.minor(b.minMinor)>money.minor(b.maxMinor))fail('INVALID_INPUT');
  let prior;if(b.id){prior=(await c.query('SELECT * FROM wpay_auth.business_assignments WHERE id=$1',[v.id(b.id)])).rows[0];if(!prior||prior.bank_id!==bank.id||prior.merchant_id!==merchant.id||prior.user_id!==owner.id)fail();}
  if(b.enabled&&(await c.query("SELECT 1 FROM wpay_auth.business_assignments WHERE merchant_id=$1 AND user_id=$2 AND status='active' AND (bank_id=$3 OR (bank_id IS NULL AND NOT EXISTS(SELECT 1 FROM wpay_auth.admin_bank_approvals origin WHERE origin.bank_id=$3))) AND ($4::uuid IS NULL OR id<>$4)",[merchant.id,owner.id,bank.id,prior?.id??null])).rowCount)fail('CONFLICT');
  const id=prior?.id||randomUUID(),status=b.enabled?'active':'disabled';
  if(prior)await c.query("UPDATE wpay_auth.business_assignments SET status=$2,priority=$3,min_minor=$4,max_minor=$5,disabled_at=CASE WHEN $2='disabled' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=$1",[id,status,b.priority,b.minMinor,b.maxMinor]);
  else await c.query("INSERT INTO wpay_auth.business_assignments(id,merchant_id,user_id,bank_id,status,priority,weight,min_minor,max_minor,created_by,disabled_at) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,CASE WHEN $5='disabled' THEN CURRENT_TIMESTAMP ELSE NULL END)",[id,merchant.id,owner.id,bank.id,status,b.priority,b.minMinor,b.maxMinor,row.id]);
  await ledger.audit(c,{actorId:row.id,ownerId:owner.id,entityId:id,event:'upi_route_'+status,reason,metadata:{bankId:bank.id,merchantId:merchant.id,minMinor:b.minMinor,maxMinor:b.maxMinor}});return {id,status};
 }
 if(operation==='business/admin-upi/state'){
  v.exactFields(b,['bankId','version','action','reason']);const bank=await core.bankRecord(c,b.bankId);if(!bank||bank.version!==b.version||bank.deactivated)fail('CONFLICT');const owner=await core.account(c,bank.owner_id,'user');permit(context,'bank_upi.approve',owner);const reason=v.reason(b.reason);
  if(!['start','stop'].includes(b.action))fail('INVALID_INPUT');
  if(b.action==='start'&&(bank.frozen||bank.approved_version!==bank.version||!(await c.query('SELECT 1 FROM wpay_auth.admin_bank_approvals WHERE bank_id=$1 AND bank_version=$2',[bank.id,bank.version])).rowCount))fail('CONFLICT');
  const status=b.action==='start'?'running':'stopped';await c.query('UPDATE wpay_auth.business_bank_accounts SET status=$2,reason=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[bank.id,status,reason]);await require('../onboarding/state').refresh(c,owner.id);
  await ledger.audit(c,{actorId:row.id,ownerId:owner.id,entityId:bank.id,event:'admin_bank_'+b.action,reason});return {id:bank.id,status};
 }
 fail('NOT_FOUND');
}
module.exports={GET,POST,run};
