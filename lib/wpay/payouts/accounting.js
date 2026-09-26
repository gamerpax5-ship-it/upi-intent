"use strict";
const {randomUUID}=require('node:crypto'),ledger=require('../business/ledger'),money=require('../business/money'),{fail}=require('./validation');
async function terms(client,id,at=null){const row=(await client.query('SELECT id,version,settings,effective_at FROM wpay_auth.commercial_versions WHERE account_id=$1 AND effective_at<=COALESCE($2::timestamptz,CURRENT_TIMESTAMP) ORDER BY effective_at DESC,version DESC LIMIT 1',[id,at])).rows[0];if(!row)fail('UNAVAILABLE');return row;}
// Preserve the order-time rate. A newly configured User may take an older
// order using their first effective rate, never a later replacement rate.
async function payoutTerms(client,id,at){
 const row=(await client.query(`SELECT id,version,settings,effective_at
 FROM wpay_auth.commercial_versions
 WHERE account_id=$1 AND effective_at<=CURRENT_TIMESTAMP
 ORDER BY CASE WHEN effective_at<=$2::timestamptz THEN 0 ELSE 1 END,
 CASE WHEN effective_at<=$2::timestamptz THEN effective_at END DESC,
 CASE WHEN effective_at<=$2::timestamptz THEN version END DESC,
 effective_at ASC,version ASC LIMIT 1`,[id,at])).rows[0];
 if(!row)fail('UNAVAILABLE');return row;
}
async function entitlement(client,id){
 const b=await ledger.balances(client,id),payin=b.user_commission||0n,payout=b.user_payout_commission||0n,adjustments=b.user_commission_adjustment||0n,held=b.user_commission_hold||0n,reserved=b.user_commission_reserved||0n,withdrawn=b.user_commission_withdrawn||0n;
 const gross=payin+payout+adjustments,available=gross-held-reserved-withdrawn,t=await terms(client,id),rate=BigInt(money.fromDecimal(t.settings.inrPerUsdt,'USDT'));if(rate<=0n)fail('UNAVAILABLE');
 return {currency:'INR',payin:payin.toString(),payout:payout.toString(),adjustments:adjustments.toString(),gross:gross.toString(),held:held.toString(),reserved:reserved.toString(),withdrawn:withdrawn.toString(),available:(available>0n?available:0n).toString(),signedAvailable:available.toString(),deficit:(available<0n?-available:0n).toString(),usdtEquivalentMinor:(available>0n?available*10000000000n/rate:0n).toString(),inrPerUsdt:t.settings.inrPerUsdt,rateVersion:t.version,conversionDisplay:'USDT maximum rounded down to six decimals; INR debit rounded up to one paise',network:t.settings.depositNetwork};
}
async function event(client,{id,owner,actor=null,kind,state,reason=''}){
 await client.query('INSERT INTO wpay_auth.payout_events(id,resource_id,owner_id,actor_id,kind,state,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),id,owner,actor,kind,state,reason]);
 await ledger.audit(client,{actorId:actor,ownerId:owner,entityId:id,event:kind+'_'+state,reason});
}
async function journal(client,id,action,actor,entries,snapshot={},metadata={}){return ledger.post(client,{key:'payout-operations:'+action+':'+id,referenceType:action,referenceId:id,actorId:actor,snapshot,metadata,entries});}
module.exports={terms,payoutTerms,entitlement,event,journal};
