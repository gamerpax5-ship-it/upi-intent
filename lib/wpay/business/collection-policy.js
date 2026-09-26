"use strict";
const ledger=require('./ledger'),money=require('./money'),v=require('./validation'),{AuthError}=require('../auth/runtime/errors');
async function access(c,userId){return (await c.query('SELECT free_setup,unlimited_collection FROM wpay_auth.user_collection_permissions WHERE user_id=$1',[userId])).rows[0]||{free_setup:false,unlimited_collection:false};}
async function setup(c,userId){const permission=await access(c,userId);if(!permission.free_setup&&BigInt((await ledger.summary(c,userId)).available)<=0n)throw new AuthError('FUNDING_REQUIRED');}
async function setAccess(c,actorId,input){
 v.exactFields(input,['userId','freeSetup','unlimitedCollection','reason']);v.id(input.userId);v.reason(input.reason);
 if(typeof input.freeSetup!=='boolean'||typeof input.unlimitedCollection!=='boolean')throw new AuthError('INVALID_INPUT');
 await ledger.lock(c);
 await c.query(`INSERT INTO wpay_auth.user_collection_permissions(user_id,free_setup,unlimited_collection,actor_id,reason) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(user_id) DO UPDATE SET free_setup=excluded.free_setup,unlimited_collection=excluded.unlimited_collection,actor_id=excluded.actor_id,reason=excluded.reason,updated_at=CURRENT_TIMESTAMP`,[input.userId,input.freeSetup,input.unlimitedCollection,actorId,input.reason]);
 await ledger.audit(c,{actorId,ownerId:input.userId,entityId:input.userId,event:'collection_permission_updated',reason:input.reason,metadata:{freeSetup:input.freeSetup,unlimitedCollection:input.unlimitedCollection}});
 return {freeSetup:input.freeSetup,unlimitedCollection:input.unlimitedCollection};
}
async function collectionVolume(c,bankId,version){
 return (await c.query(`SELECT
 ((SELECT COALESCE(sum(r.amount_minor),0) FROM wpay_auth.business_reservations r WHERE r.bank_id=$1 AND r.state='active' AND r.expires_at>CURRENT_TIMESTAMP)
 +(SELECT COALESCE(sum(f.amount_minor),0) FROM wpay_auth.business_financial_events f JOIN wpay_auth.business_reservations r ON r.id=f.reservation_id WHERE r.bank_id=$1 AND (f.created_at AT TIME ZONE 'Asia/Kolkata')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date))::text AS used,
 COALESCE((SELECT limit_minor FROM wpay_auth.upi_daily_limits WHERE bank_id=$1),(SELECT limit_minor FROM wpay_auth.business_bank_versions WHERE bank_id=$1 AND version=$2))::text AS shared_limit`,[bankId,version])).rows[0];
}
async function setLimit(c,userId,input){
 v.exactFields(input,['bankId','limitMinor']);v.id(input.bankId);if(money.minor(input.limitMinor)>money.MAX)throw new AuthError('INVALID_INPUT');await ledger.lock(c);
 if(!(await c.query('SELECT 1 FROM wpay_auth.business_bank_accounts WHERE id=$1 AND owner_id=$2 AND NOT deactivated',[input.bankId,userId])).rowCount)throw new AuthError('FORBIDDEN');
 await c.query('INSERT INTO wpay_auth.upi_daily_limits(bank_id,limit_minor,actor_id) VALUES($1,$2,$3) ON CONFLICT(bank_id) DO UPDATE SET limit_minor=excluded.limit_minor,actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP',[input.bankId,input.limitMinor,userId]);
 await ledger.audit(c,{actorId:userId,ownerId:userId,entityId:input.bankId,event:'upi_daily_limit_updated',metadata:{limitMinor:input.limitMinor}});return {limitMinor:input.limitMinor};
}
module.exports={access,setup,setAccess,collectionVolume,setLimit};
