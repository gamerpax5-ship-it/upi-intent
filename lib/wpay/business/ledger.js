"use strict";
const {randomUUID,createHash}=require('node:crypto');
const {AuthError}=require('../auth/runtime/errors');
const {minor}=require('./money');
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
async function lock(client){await client.query('UPDATE wpay_auth.business_mutex SET revision=revision+1 WHERE singleton=true');}
async function audit(client,{actorId=null,ownerId=null,entityId=null,event,reason='',metadata={}}){
 await client.query('INSERT INTO wpay_auth.business_audit(id,actor_id,owner_id,entity_id,event,reason,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),actorId,ownerId,entityId,event,reason,metadata]);
}
function pair(ownerId,type,amount,currency='INR',direction='credit'){
 const book={capacity_allocated:'capacity',capacity_consumed:'capacity',capacity_reserved:'reservations',capacity_hold:'holds',user_commission:'commission',merchant_hold:'holds'}[type]||'cash';
 return [{ownerId,type,amount:minor(amount).toString(),currency,direction,book},{ownerId:null,type:'clearing',amount,currency,direction:direction==='credit'?'debit':'credit',book}];
}
async function post(client,{key,referenceType,referenceId,actorId=null,source='wpay-business',snapshot={},metadata={},entries}){
 if(typeof key!=='string'||key.length>200||!entries?.length)throw new AuthError('INVALID_INPUT');
 const payload=digest({referenceType,referenceId,snapshot,metadata,entries});
 const previous=(await client.query('SELECT id,payload_digest FROM wpay_auth.business_journals WHERE idempotency_key=$1',[key])).rows[0];
 if(previous){if(previous.payload_digest!==payload)throw new AuthError('CONFLICT');return previous.id;}
 const balances=new Map();for(const e of entries){const n=minor(e.amount);if(!['INR','USD','USDT'].includes(e.currency)||!['credit','debit'].includes(e.direction))throw new AuthError('INVALID_INPUT');const k=e.book+':'+e.currency;balances.set(k,(balances.get(k)||0n)+(e.direction==='credit'?n:-n));}
 if([...balances.values()].some(n=>n!==0n))throw new AuthError('INVALID_INPUT');
 const id=randomUUID();await client.query('INSERT INTO wpay_auth.business_journals(id,idempotency_key,payload_digest,reference_type,reference_id,actor_id,actor_source,snapshot,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,key,payload,referenceType,referenceId,actorId,source,snapshot,metadata]);
 for(const e of entries)await client.query('INSERT INTO wpay_auth.business_entries(id,journal_id,owner_id,owner_key,book,ledger_type,direction,amount_minor,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),id,e.ownerId,e.ownerId||'system:wpay',e.book,e.type,e.direction,e.amount,e.currency]);
 return id;
}
async function balances(client,ownerId,currency='INR'){
 const result=await client.query("SELECT ledger_type,COALESCE(sum(CASE WHEN direction='credit' THEN amount_minor ELSE -amount_minor END),0)::text AS amount FROM wpay_auth.business_entries WHERE owner_id=$1 AND currency=$2 GROUP BY ledger_type",[ownerId,currency]);
 return Object.fromEntries(result.rows.map(row=>[row.ledger_type,BigInt(row.amount)]));
}
async function summary(client,ownerId){
 const b=await balances(client,ownerId);
 const reserved=BigInt((await client.query("SELECT COALESCE(sum(amount_minor),0)::text AS amount FROM wpay_auth.business_reservations WHERE user_id=$1 AND state='active' AND expires_at>CURRENT_TIMESTAMP",[ownerId])).rows[0].amount);
 const allocated=b.capacity_allocated||0n,consumed=b.capacity_consumed||0n,held=b.capacity_hold||0n;
 const gross=b.merchant_gross||0n,fees=b.merchant_platform_fee||0n,payoutFees=b.merchant_payout_fee||0n,merchantHeld=b.merchant_hold||0n;
 return {currency:'INR',allocated:allocated.toString(),reserved:reserved.toString(),consumed:consumed.toString(),held:held.toString(),available:(allocated-consumed-reserved-held).toString(),commission:(b.user_commission||0n).toString(),gross:gross.toString(),fees:fees.toString(),payoutFees:payoutFees.toString(),merchantHeld:merchantHeld.toString(),merchantAvailable:(gross-fees-payoutFees+(b.merchant_adjustment||0n)-merchantHeld).toString()};
}
module.exports={lock,audit,pair,post,balances,summary,digest};
