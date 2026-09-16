"use strict";
const {BusinessCore}=require('../business/core'),onboarding=require('../onboarding/state'),v=require('../business/validation'),{fail}=require('./validation'),ledger=require('../business/ledger');
const core=new BusinessCore();
async function owned(client,userId,bankId,running=false){
 const b=await core.bankRecord(client,bankId);
 if(!b||b.owner_id!==userId||b.approved_version!==b.version||b.verified_version!==b.version||b.frozen||b.deactivated||!(running?['running']:['verified','enabled','running','stopped']).includes(b.status))fail('FORBIDDEN');
 if(running){await onboarding.canStart(client,b);if(!(await client.query('SELECT 1 FROM wpay_auth.payout_capabilities WHERE bank_id=$1 AND bank_version=$2 AND revoked_at IS NULL',[b.id,b.version])).rowCount)fail('PAYOUT_BANK_REQUIRED');}
 return b;
}
async function capability(client,actor,body){
 v.exactFields(body,['bankId','version','enabled','reason']);v.reason(body.reason);if(typeof body.enabled!=='boolean'||!Number.isInteger(body.version))fail();await ledger.lock(client);
 const b=await core.bankRecord(client,body.bankId);if(!b||b.version!==body.version)fail('CONFLICT');
 if(body.enabled)await owned(client,b.owner_id,b.id);
 const prior=(await client.query('SELECT id FROM wpay_auth.payout_capabilities WHERE bank_id=$1 AND bank_version=$2 AND revoked_at IS NULL',[b.id,b.version])).rows[0];
 if(body.enabled&&!prior)await client.query('INSERT INTO wpay_auth.payout_capabilities(id,bank_id,bank_version,actor_id,reason) VALUES(gen_random_uuid(),$1,$2,$3,$4)',[b.id,b.version,actor,body.reason]);
 if(!body.enabled&&prior)await client.query('UPDATE wpay_auth.payout_capabilities SET revoked_at=CURRENT_TIMESTAMP WHERE id=$1',[prior.id]);
 await ledger.audit(client,{actorId:actor,ownerId:b.owner_id,entityId:b.id,event:'payout_capability_'+(body.enabled?'approved':'revoked'),reason:body.reason,metadata:{version:b.version}});return {bankId:b.id,version:b.version,payoutCapable:body.enabled};
}
module.exports={owned,capability};
