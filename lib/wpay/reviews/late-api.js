'use strict';
const late=require('./late-payment'),{authorize}=require('../authorization-policy'),{recent}=require('../payouts/validation'),{AuthError}=require('../auth/runtime/errors'),v=require('../business/validation');
const fail=()=>{throw new AuthError('FORBIDDEN');};
async function run(core,c,row,context,kind,operation,body,prepared){
 const user=row.account_type==='user';if(row.account_type==='merchant')fail();const action=operation.split('/').at(-1),prefix=kind==='parking'?'user.parking_payments':'user.payout',view=user?prefix+'.view':kind==='parking'?'parking.view':'payout_operations.view';
 const permit=(permissionId,resource={kind:'list'})=>{const result=authorize({...context,permissionId,context:resource});if(!result.allowed)fail();return result.constraints.where;};
 if(action==='search'){v.exactFields(body,['offset']);const scope=permit(view);return late.list(c,kind,{userId:user?row.id:null,tenantIds:user?null:scope.tenantIds,offset:body.offset});}
 if(action==='open'){if(!user)fail();permit(kind==='parking'?'user.parking_payments.create':'user.payout.submit',{kind:'create',tenantId:row.tenant_id,ownerType:'user',ownerId:row.id});recent(row);return late.open(core,c,row.id,kind,body,prepared);}
 const record=await late.record(c,kind,body.id);if(user&&record.user_id!==row.id)fail();const resource={kind:'record',id:record.id,tenantId:record.tenant_id,ownerType:'user',ownerId:record.user_id};
 if(action==='proof'){v.exactFields(body,['id']);permit(user?view:kind==='parking'?'parking.review':'payout_operations.proof',resource);recent(row);return late.proof(core,record);}
 if(action==='decide'){if(user)fail();permit(kind==='parking'?(body.action==='approve'?'parking.approve':'parking.reject'):'payout_operations.resolve',resource);recent(row);return late.decide(core,c,kind,row.id,body);}
 throw new AuthError('NOT_FOUND');
}
module.exports={run};
