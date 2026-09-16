"use strict";
const {randomUUID}=require('node:crypto'),ledger=require('../business/ledger'),money=require('../business/money'),{fail}=require('./validation');
async function terms(client,id){const row=(await client.query('SELECT id,version,settings,effective_at FROM wpay_auth.commercial_versions WHERE account_id=$1 AND effective_at<=CURRENT_TIMESTAMP ORDER BY version DESC LIMIT 1',[id])).rows[0];if(!row)fail('UNAVAILABLE');return row;}
async function entitlement(client,id){
 const b=await ledger.balances(client,id),payin=b.user_commission||0n,payout=b.user_payout_commission||0n,adjustments=b.user_commission_adjustment||0n,held=b.user_commission_hold||0n,reserved=b.user_commission_reserved||0n,withdrawn=b.user_commission_withdrawn||0n;
 const gross=payin+payout+adjustments,available=gross-held-reserved-withdrawn,t=await terms(client,id),rate=BigInt(money.fromDecimal(t.settings.inrPerUsdt,'USDT'));if(rate<=0n)fail('UNAVAILABLE');
 return {currency:'INR',payin:payin.toString(),payout:payout.toString(),adjustments:adjustments.toString(),gross:gross.toString(),held:held.toString(),reserved:reserved.toString(),withdrawn:withdrawn.toString(),available:(available>0n?available:0n).toString(),usdtEquivalentMinor:(available>0n?available*10000000000n/rate:0n).toString(),inrPerUsdt:t.settings.inrPerUsdt,rateVersion:t.version,conversionDisplay:'floor-to-six-decimals; withdrawal must have exact INR value',network:t.settings.depositNetwork};
}
async function event(client,{id,owner,actor=null,kind,state,reason=''}){
 await client.query('INSERT INTO wpay_auth.payout_events(id,resource_id,owner_id,actor_id,kind,state,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),id,owner,actor,kind,state,reason]);
 await ledger.audit(client,{actorId:actor,ownerId:owner,entityId:id,event:kind+'_'+state,reason});
}
async function journal(client,id,action,actor,entries,snapshot={},metadata={}){return ledger.post(client,{key:'payout-operations:'+action+':'+id,referenceType:action,referenceId:id,actorId:actor,snapshot,metadata,entries});}
module.exports={terms,entitlement,event,journal};
