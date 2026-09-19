"use strict";
const {randomUUID,randomBytes}=require('node:crypto');
const {PERMISSION_CATALOG}=require('../permission-catalog');
const {validateGrants,canUsePermission}=require('../authorization-policy');
const {fail,recent}=require('./access');
const v=require('../auth/runtime/validation'),ids=require('../business/validation'),ledger=require('../business/ledger');
const {hashPassword}=require('../auth/runtime/passwords');
const SELF=['profile.view','account_security.view','account_security.update'];
async function available(c,row,context){
 if(row.account_type!=='super_admin'||context.principal.type!=='super_admin'||context.adminScope?.platform!==true||!canUsePermission({...context,permissionId:'settings.view'}).allowed)return false;
 return (await c.query('SELECT 1 FROM wpay_auth.bootstrap_state WHERE account_id=$1',[row.id])).rowCount===1||canUsePermission({...context,permissionId:'admin_authority.manage'}).allowed;
}
function selected(context,permissions,tenantIds){
 if(!Array.isArray(tenantIds)||!tenantIds.length||tenantIds.length>20||new Set(tenantIds).size!==tenantIds.length||tenantIds.some(x=>!context.adminScope.tenantIds.includes(x)))fail();
 const grant=validateGrants(permissions,'admin');if(!grant.allowed||SELF.some(x=>!permissions.includes(x)))fail('INVALID_INPUT');
 if(permissions.some(x=>!context.grants.includes(x)))fail();
 return {permissions:[...permissions].sort(),tenantIds:[...tenantIds].sort()};
}
async function run(c,row,context,operation,b){
 if(!await available(c,row,context))fail();
 if(operation==='operations/admins'){
  const {offset,limit}=require('../payouts/validation').page(b);
  require('../gateway/validation').fields(b,['offset','limit']);
  const records=(await c.query(`SELECT a.id,a.name,a.email,a.status,a.permission_version,g.permissions,g.admin_scope FROM wpay_auth.accounts a JOIN wpay_auth.grants g ON g.account_id=a.id
   WHERE a.account_type='admin' AND a.tenant_id=ANY($1) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(g.admin_scope->'tenantIds') t WHERE NOT(t.value=ANY($1)))
   ORDER BY a.created_at DESC,a.id LIMIT $2 OFFSET $3`,[context.adminScope.tenantIds,limit+1,offset])).rows;
  return {admins:records.slice(0,limit),hasMore:records.length>limit,offset,tenantIds:context.adminScope.tenantIds,requiredPermissions:SELF,permissions:PERMISSION_CATALOG.filter(p=>p.principalTypes.includes('admin')&&['self','admin_tenants'].includes(p.scope)&&context.grants.includes(p.id)).map(p=>({id:p.id,label:p.label,dependencies:p.dependencies})),platformGrantEnabled:false,securityPolicyEditable:false};
 }
 if(!['operations/admin/create','operations/admin/update'].includes(operation))fail('NOT_FOUND');
 recent(row);v.exactFields(b,operation.endsWith('/create')?['requestId','name','email','permissions','tenantIds']:['requestId','id','expectedVersion','status','permissions','tenantIds']);ids.id(b.requestId);
 const selection=selected(context,b.permissions,b.tenantIds),fingerprint=ledger.digest({operation,...b,...selection});
 await ledger.lock(c);
 const prior=(await c.query('SELECT payload_digest,result FROM wpay_auth.directory_requests WHERE actor_id=$1 AND request_id=$2',[row.id,b.requestId])).rows[0];
 if(prior){if(prior.payload_digest!==fingerprint)fail('CONFLICT');return {...prior.result,credentialShown:false};}
 let result,password;
 if(operation.endsWith('/create')){
  const name=v.name(b.name),email=v.email(b.email),id=randomUUID();password='WPay!'+randomBytes(24).toString('base64url');
  await c.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type) VALUES($1,$2,$3,$4,$5,'admin')",[id,randomUUID(),selection.tenantIds[0],name,email]);
  const credential=(await c.query("INSERT INTO wpay_auth.credentials(account_id,password_record,temporary_required,temporary_expires_at) VALUES($1,$2,true,CURRENT_TIMESTAMP+interval '24 hours') RETURNING temporary_expires_at",[id,await hashPassword(password)])).rows[0];
  await c.query('INSERT INTO wpay_auth.grants(account_id,permission_version,permissions,admin_scope) VALUES($1,1,$2,$3)',[id,selection.permissions,{tenantIds:selection.tenantIds}]);
  await c.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[id]);
  await c.query('INSERT INTO wpay_auth.account_security(account_id) VALUES($1)',[id]);await c.query('INSERT INTO wpay_auth.preferences(account_id) VALUES($1)',[id]);
  result={id,email,permissionVersion:1,status:'active',passwordResetRequired:true,mfaRequired:true,temporaryExpiresAt:credential.temporary_expires_at,loginPath:'/admin'};
  await audit(c,row,id,null,{version:1,status:'active',...selection,platform:false},b.requestId);
 }else{
  ids.id(b.id);if(b.id===row.id)fail();if(!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<1||!['active','suspended','disabled'].includes(b.status))fail('INVALID_INPUT');
  const target=(await c.query("SELECT a.*,g.permissions,g.admin_scope FROM wpay_auth.accounts a JOIN wpay_auth.grants g ON g.account_id=a.id WHERE a.id=$1 FOR UPDATE OF a,g",[b.id])).rows[0];
  if(!target||target.account_type!=='admin'||target.admin_scope?.platform===true||!context.adminScope.tenantIds.includes(target.tenant_id)||!Array.isArray(target.admin_scope?.tenantIds)||target.admin_scope.tenantIds.some(x=>!context.adminScope.tenantIds.includes(x))||!selection.tenantIds.includes(target.tenant_id))fail();
  if(target.permission_version!==b.expectedVersion)fail('CONFLICT');const next=b.expectedVersion+1;
  await c.query('UPDATE wpay_auth.accounts SET status=$2,permission_version=$3,session_epoch=session_epoch+1 WHERE id=$1',[target.id,b.status,next]);
  await c.query('UPDATE wpay_auth.grants SET permissions=$2,admin_scope=$3,permission_version=$4 WHERE account_id=$1',[target.id,selection.permissions,{tenantIds:selection.tenantIds},next]);
  await audit(c,row,target.id,{version:target.permission_version,status:target.status,permissions:target.permissions,tenantIds:target.admin_scope.tenantIds,platform:false},{version:next,status:b.status,...selection,platform:false},b.requestId);
  result={id:target.id,permissionVersion:next,status:b.status,sessionsInvalidated:true};
 }
 await c.query('INSERT INTO wpay_auth.directory_requests(actor_id,request_id,payload_digest,result) VALUES($1,$2,$3,$4)',[row.id,b.requestId,fingerprint,result]);
 return password?{...result,oneTimePassword:password,credentialShown:true}:result;
}
async function audit(c,row,id,before,after,requestId){await c.query("INSERT INTO wpay_auth.panel_audit(id,actor_id,target_id,action,details) VALUES($1,$2,$3,'admin_authority_changed',$4)",[randomUUID(),row.id,id,{requestId,before,after}]);}
module.exports={available,run,selected};
