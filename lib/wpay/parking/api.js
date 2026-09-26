"use strict";
const {recentAuthenticationAt}=require('../auth/runtime/session-assurance');
const {authorize,canUsePermission}=require('../authorization-policy');
const v=require('../business/validation');
const {AuthError}=require('../auth/runtime/errors');
const GET=['parking/beneficiaries','parking/orders','parking/admin'];
const POST=['parking/late/open','parking/late/search','parking/late/proof','parking/late/decide','parking/beneficiary/create','parking/beneficiary/confirm','parking/order/create','parking/lock','parking/release','parking/submit','parking/review','parking/proof'];
const fail=(code='FORBIDDEN')=>{throw new AuthError(code);};
function permit(context,permission,resource={kind:'list'}){const r=authorize({...context,permissionId:permission,context:resource});if(!r.allowed)fail();return r.constraints.where;}
function recent(row){const age=+new Date(row.database_now)-+new Date(recentAuthenticationAt(row));if(!recentAuthenticationAt(row)||!row.database_now||!Number.isFinite(age)||age<0||age>300000)fail('RECENT_MFA_REQUIRED');}
function own(row,id=row.id,kind='record'){return {kind,id,tenantId:row.tenant_id,ownerType:'user',ownerId:row.user_id||row.id};}
function navigation(groups,context){
 const type=context.principal.type,children=[];
 if(type==='user'){
  if(canUsePermission({...context,permissionId:'user.parking_beneficiaries.view'}).allowed)children.push({id:'parking.page.beneficiaries',destinationId:'parking.beneficiaries',permissionId:'user.parking_beneficiaries.view',label:'Parking Beneficiaries',routeStatus:'implemented',descriptorOnly:false,blockers:[]});
  if(canUsePermission({...context,permissionId:'user.parking_payments.view'}).allowed)children.push({id:'parking.page.orders',destinationId:'parking.orders',permissionId:'user.parking_payments.view',label:'Parking Orders',routeStatus:'implemented',descriptorOnly:false,blockers:[]});
 }else if(canUsePermission({...context,permissionId:'parking.view'}).allowed)children.push({id:'parking.page.admin',destinationId:'parking.admin',permissionId:'parking.view',label:'Parking',routeStatus:'implemented',descriptorOnly:false,blockers:[]});
 if(!children.length)return groups;const result=groups.map(g=>({...g,children:[...g.children]}));
 // Remove older descriptor-only/planned Parking rows now replaced by the live canonical destinations.
 for(const g of result)g.children=g.children.filter(c=>!['user.page.parking-beneficiary','user.page.parking-payment','administration.page.parking'].includes(c.id));
 result.push({id:'parking.group.live',label:'Parking',children});return result.filter(g=>g.children.length);
}
function preparation(context,row,operation){if(!['parking/submit','parking/late/open'].includes(operation))return;if(row.account_type!=='user')fail();permit(context,'user.parking_payments.create',own(row,row.id,'create'));recent(row);}
async function run(core,client,row,context,operation,body,prepared){
 if(operation.startsWith('parking/late/'))return require('../reviews/late-api').run(core,client,row,context,'parking',operation,body,prepared);
 if(![...GET,...POST].includes(operation))fail('NOT_FOUND');const user=row.account_type==='user',admin=!['user','merchant'].includes(row.account_type);if(row.account_type==='merchant')fail();
 if(operation==='parking/beneficiaries'){if(!user)fail();permit(context,'user.parking_beneficiaries.view',own(row,row.id,'list'));return {rows:await core.beneficiaries(client,{tenantId:row.tenant_id,userId:row.id})};}
 if(operation==='parking/beneficiary/confirm'){if(!user)fail();v.exactFields(body,['id']);recent(row);permit(context,'user.parking_beneficiaries.confirm',own(row,body.id));return core.confirm(client,row.id,row.tenant_id,body.id);}
 if(operation==='parking/orders'){if(!user)fail();permit(context,'user.parking_payments.view',own(row,row.id,'list'));return {orders:await core.orders(client,{tenantId:row.tenant_id,userId:row.id}),history:await core.userHistory(client,row.id),leaseSeconds:600,cooldownSeconds:300};}
 if(operation==='parking/lock'){if(!user)fail();recent(row);permit(context,'user.parking_payments.create',own(row,row.id,'create'));return core.lock(client,row.id,row.tenant_id,body);}
 if(operation==='parking/release'){if(!user)fail();v.exactFields(body,['id']);recent(row);permit(context,'user.parking_payments.create',own(row,row.id,'create'));return core.release(client,row.id,body.id);}
 if(operation==='parking/submit'){if(!user)fail();permit(context,'user.parking_payments.create',own(row,row.id,'create'));recent(row);return core.submit(client,row.id,body,prepared);}
 if(operation==='parking/admin'){if(!admin)fail();const scope=permit(context,'parking.view');return core.admin(client,scope.tenantIds);}
 if(operation==='parking/beneficiary/create'){if(!admin)fail();recent(row);permit(context,'parking.create',{kind:'create',tenantId:body.tenantId});return core.createBeneficiary(client,row.id,body);}
 if(operation==='parking/order/create'){if(!admin)fail();recent(row);permit(context,'parking.create',{kind:'create',tenantId:body.tenantId});return core.createOrder(client,row.id,body);}
 if(['parking/review','parking/proof'].includes(operation)){
  if(!admin)fail();const data=await core.admin(client,permit(context,'parking.view').tenantIds),review=data.reviews.find(r=>r.id===body.id);if(!review)fail();
  if(operation==='parking/proof'){v.exactFields(body,['id']);permit(context,'parking.review',{kind:'record',id:body.id,tenantId:review.tenantId});recent(row);return core.proof(client,body.id);}
  v.exactFields(body,['id','action','reason']);recent(row);const permission=body.action==='approve'?'parking.approve':body.action==='not_paid'?'parking.reject':'parking.review';permit(context,permission,{kind:'record',id:body.id,tenantId:review.tenantId});return core.review(client,row.id,body.id,body.action,body.reason);
 }
 fail('NOT_FOUND');
}
module.exports={GET,POST,run,navigation,preparation};
