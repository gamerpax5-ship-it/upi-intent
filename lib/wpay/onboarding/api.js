"use strict";
const {AuthError}=require('../auth/runtime/errors'),{authorize,canUsePermission}=require('../authorization-policy'),{Onboarding}=require('./workflow');
const GET=['onboarding/analytics'],POST=['onboarding/create','onboarding/poll','onboarding/cancel','onboarding/upload','onboarding/import'];
function onboardingNavigation(groups,context){
 if(context.principal?.type!=='user')return groups;
 if(canUsePermission({...context,permissionId:'user.bank_upi.view'}).allowed){
  let group=groups.find(g=>g.id==='user.group.bank_upi');if(!group){group={id:'user.group.bank_upi',label:'Bank & UPI',children:[]};groups.push(group);}
  group.children.push(...['upi-verification','statements','upi-analytics'].map((name,i)=>({id:'user.page.onboarding-'+name,destinationId:'user.onboarding-'+name,permissionId:'user.bank_upi.view',label:['UPI Verification','Statements','UPI Analytics'][i],routeStatus:'implemented',descriptorOnly:false,blockers:[]})));
 }
 return groups;
}
class OnboardingApi {
 constructor(options){this.workflow=new Onboarding(options);}
 async run(client,row,context,operation,body){
  if(![...GET,...POST].includes(operation))throw new AuthError('NOT_FOUND');
  if(row.account_type!=='user')throw new AuthError('FORBIDDEN');
  const read=GET.includes(operation)||operation==='onboarding/import',permissionId=read?'user.bank_upi.view':'user.bank_upi.update';
  // The owner is the freshly resolved server session, never a submitted ID.
  const scope={kind:'list',tenantId:row.tenant_id,ownerType:'user',ownerId:row.user_id};
  if(!read){
   const v=require('../business/validation');let bankId=body.bankId;
   if(operation==='onboarding/poll'||operation==='onboarding/cancel')bankId=(await client.query('SELECT bank_id FROM wpay_auth.upi_verification_challenges WHERE id=$1 AND owner_id=$2',[v.id(body.challengeId),row.id])).rows[0]?.bank_id;
   if(!bankId)throw new AuthError('FORBIDDEN');const bank=await this.workflow.core.bankRecord(client,bankId);
   if(!bank||bank.owner_id!==row.id)throw new AuthError('FORBIDDEN');
   Object.assign(scope,{kind:'record',id:bank.id,accountId:bank.id,accountOwnerId:row.user_id,accountTenantId:row.tenant_id});
  }
  if(!authorize({...context,permissionId,context:scope}).allowed)throw new AuthError('FORBIDDEN');
  if(!read&&+new Date(row.database_now)-+new Date(require('../auth/runtime/session-assurance').recentAuthenticationAt(row))>300000)throw new AuthError('RECENT_MFA_REQUIRED');
  if(operation==='onboarding/analytics')return this.workflow.analytics(client,row.id);
  if(operation==='onboarding/create')return this.workflow.create(client,row.id,body);
  if(operation==='onboarding/poll'||operation==='onboarding/cancel')return this.workflow.challenge(client,row.id,body,operation.endsWith('/cancel'));
  if(operation==='onboarding/upload')return this.workflow.upload(client,row.id,body);
  return this.workflow.import(client,row.id,body);
 }
}
module.exports={OnboardingApi,onboardingNavigation,GET,POST};
