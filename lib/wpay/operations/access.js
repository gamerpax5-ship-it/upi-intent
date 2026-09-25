"use strict";
const {recentAuthenticationAt}=require('../auth/runtime/session-assurance');
const {randomUUID}=require('node:crypto'),{authorize,canUsePermission}=require('../authorization-policy'),{AuthError}=require('../auth/runtime/errors');
const fail=(code='FORBIDDEN')=>{throw new AuthError(code);};
function recent(row){const age=+new Date(row.database_now)-+new Date(recentAuthenticationAt(row));if(!recentAuthenticationAt(row)||!row.database_now||!Number.isFinite(age)||age<0||age>300000)fail('RECENT_MFA_REQUIRED');}
function permit(context,permission,resource={kind:'list'}){const result=authorize({...context,permissionId:permission,context:resource});if(!result.allowed)fail();return result.constraints.where;}
const accountResource=(row,kind='record')=>({kind,id:row.id,tenantId:row.tenant_id,ownerType:row.account_type==='user'?'user':'principal',ownerId:row.user_id||row.id});
async function audit(client,actor,owner,resource,action){await client.query('INSERT INTO wpay_auth.operations_audit(id,actor_id,owner_id,resource_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),actor,owner,resource,action]);}
function navigation(groups,context){
 const user=context.principal.type==='user';const pages=user?[['devices','user.device_pairing.view','Linked Devices'],['otp','user.live_otp.view','OTP Events'],['transactions','user.transaction_history.view','Pay-in Transactions']]:[['otp','apk_otp_events.view_all','OTP Events'],['employees','employee_management.view','Employees'],['transactions','utr_center.view','UTR Center'],['pending-utrs','utr_center.view','Pending UTR'],['statements','statement_reconciliation.view','Statements']];
 const children=pages.filter(([,permissionId])=>canUsePermission({...context,permissionId}).allowed).map(([id,permissionId,label])=>({id:'operations.page.'+id,destinationId:'operations.'+id,permissionId,label,routeStatus:'implemented',descriptorOnly:false,blockers:[]}));
 const result=groups.map(g=>({...g,children:[...g.children]}));
 for(const child of children){const name=child.destinationId.split('.').at(-1),section=name==='employees'?'employees':['transactions','pending-utrs','statements'].includes(name)?'transactions':'apk_events';let group=result.find(g=>g.id.endsWith('.'+section));if(!group){group={id:'operations.group.'+section,label:{employees:'Employees',transactions:'Transactions',apk_events:'APK & Events'}[section],children:[]};result.push(group);}group.children.push(child);}
 return result;
}
module.exports={fail,recent,permit,accountResource,audit,navigation};
