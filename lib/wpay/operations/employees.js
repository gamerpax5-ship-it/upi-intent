"use strict";
const {randomUUID,randomBytes}=require('node:crypto'),validation=require('../auth/runtime/validation'),v=require('../business/validation'),{hashPassword}=require('../auth/runtime/passwords'),{validateGrants}=require('../authorization-policy'),{PERMISSION_CATALOG}=require('../permission-catalog'),{fail,recent,permit,audit}=require('./access');
const SELF=['profile.view','account_security.view','account_security.update'];
function selection(context,permissions,tenants){
 if(!Array.isArray(tenants)||!tenants.length||tenants.length>20||new Set(tenants).size!==tenants.length||tenants.some(t=>typeof t!=='string'||!context.adminScope?.tenantIds.includes(t)))fail();
 const grants=validateGrants(permissions,'employee');if(!grants.allowed||permissions.some(p=>!context.grants.includes(p)))fail();
 if(SELF.some(p=>!permissions.includes(p)))fail('INVALID_INPUT');return {permissions:grants.permissions,tenants};
}
async function record(client,row,employeeId,version,permissions,tenants,status){await client.query('INSERT INTO wpay_auth.employee_access_versions(id,employee_id,actor_id,version,permissions,tenant_ids,status) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),employeeId,row.id,version,permissions,tenants,status]);await audit(client,row.id,employeeId,employeeId,'employee_access_updated');}
async function run(client,row,context,operation,body){
 if(!['admin','super_admin'].includes(row.account_type))fail();const scope=permit(context,'employee_management.view');
 if(operation==='operations/employees'){
  const {page}=require('../payouts/validation'),f=page(body);
  const result=(await client.query(`SELECT a.id,a.name,a.email,a.status,a.permission_version,g.permissions,g.admin_scope FROM wpay_auth.accounts a JOIN wpay_auth.grants g ON g.account_id=a.id WHERE a.account_type='employee' AND a.tenant_id=ANY($1) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(g.admin_scope->'tenantIds') t WHERE NOT(t.value=ANY($1))) ORDER BY a.created_at DESC,a.id LIMIT $2 OFFSET $3`,[scope.tenantIds,f.limit+1,f.offset])).rows;
  return {employees:result.slice(0,f.limit),hasMore:result.length>f.limit,offset:f.offset,tenantIds:scope.tenantIds,permissions:PERMISSION_CATALOG.filter(p=>p.employeeDelegable&&!p.restricted&&context.grants.includes(p.id)).map(p=>({id:p.id,label:p.label,dependencies:p.dependencies})),requiredPermissions:SELF};
 }
 recent(row);
 if(operation==='operations/employee/create'){
  if(!body||Object.getPrototypeOf(body)!==Object.prototype||Object.keys(body).some(k=>!['name','email','password','permissions','tenantIds'].includes(k))||['name','email','permissions','tenantIds'].some(k=>!Object.hasOwn(body,k)))fail('INVALID_INPUT');const name=validation.name(body.name),email=validation.email(body.email),suppliedPassword=Object.hasOwn(body,'password'),password=suppliedPassword?validation.password(body.password,'employee'):'WPay!'+randomBytes(24).toString('base64url'),selected=selection(context,body.permissions,body.tenantIds);
  permit(context,'employee_management.create',{kind:'create',tenantId:selected.tenants[0]});
  const id=randomUUID(),recordHash=await hashPassword(password,'employee');
  await client.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type) VALUES($1,$2,$3,$4,$5,'employee')",[id,randomUUID(),selected.tenants[0],name,email]);
  const credential=suppliedPassword?null:(await client.query("INSERT INTO wpay_auth.credentials(account_id,password_record,temporary_required,temporary_expires_at) VALUES($1,$2,true,CURRENT_TIMESTAMP+interval '24 hours') RETURNING temporary_expires_at",[id,recordHash])).rows[0];if(suppliedPassword)await client.query('INSERT INTO wpay_auth.credentials(account_id,password_record,temporary_required,temporary_expires_at) VALUES($1,$2,false,NULL)',[id,recordHash]);
  await client.query('INSERT INTO wpay_auth.grants(account_id,permission_version,permissions,admin_scope) VALUES($1,1,$2,$3)',[id,selected.permissions,{tenantIds:selected.tenants}]);
  await client.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[id]);
  await client.query('INSERT INTO wpay_auth.account_security(account_id) VALUES($1)',[id]);await client.query('INSERT INTO wpay_auth.preferences(account_id) VALUES($1)',[id]);
  await record(client,row,id,1,selected.permissions,selected.tenants,'active');return suppliedPassword?{id,email,passwordConfigured:true,passwordResetRequired:false,mfaRequired:true,loginPath:'/employee'}:{id,email,oneTimePassword:password,passwordConfigured:false,passwordResetRequired:true,temporaryExpiresAt:credential.temporary_expires_at,mfaRequired:true,loginPath:'/employee'};
 }
 if(operation!=='operations/employee/update')fail('NOT_FOUND');
 validation.exactFields(body,['id','name','email','status','permissions','tenantIds']);v.id(body.id);if(body.id===row.id)fail();
 const target=(await client.query("SELECT a.*,g.admin_scope FROM wpay_auth.accounts a JOIN wpay_auth.grants g ON g.account_id=a.id WHERE a.id=$1 AND a.account_type='employee' FOR UPDATE OF a,g",[body.id])).rows[0];
 if(!target||!scope.tenantIds.includes(target.tenant_id)||!Array.isArray(target.admin_scope?.tenantIds)||target.admin_scope.tenantIds.some(t=>!scope.tenantIds.includes(t)))fail();
 permit(context,'employee_management.update',{kind:'record',id:target.id,tenantId:target.tenant_id});
 if(!['active','suspended','disabled'].includes(body.status))fail('INVALID_INPUT');const selected=selection(context,body.permissions,body.tenantIds),version=target.permission_version+1;
 if(!selected.tenants.includes(target.tenant_id))fail('INVALID_INPUT');
 await client.query('UPDATE wpay_auth.accounts SET name=$2,email=$3,status=$4,permission_version=$5,session_epoch=session_epoch+1 WHERE id=$1',[target.id,validation.name(body.name),validation.email(body.email),body.status,version]);
 await client.query('UPDATE wpay_auth.grants SET permission_version=$2,permissions=$3,admin_scope=$4 WHERE account_id=$1',[target.id,version,selected.permissions,{tenantIds:selected.tenants}]);
 await record(client,row,target.id,version,selected.permissions,selected.tenants,body.status);return {id:target.id,permissionVersion:version,sessionsInvalidated:true};
}
module.exports={run,selection};
