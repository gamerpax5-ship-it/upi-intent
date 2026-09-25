"use strict";
const {randomUUID}=require('node:crypto');
const ledger=require('../business/ledger');
const money=require('../business/money');
const v=require('../business/validation');
const {address}=require('../auth/runtime/commercial');
const networks=require('../funding/networks');
const {fail,fields}=require('./validation');
const accounting=require('./accounting');
const binding=(kind,id)=>'wpay-merchant-settlement-'+kind+':'+id;

class MerchantSettlements{
 constructor(crypto){this.crypto=crypto;}
 async terms(client,merchantId){
  const row=(await client.query('SELECT id,version,settings,effective_at FROM wpay_auth.commercial_versions WHERE account_id=$1 AND effective_at<=CURRENT_TIMESTAMP ORDER BY version DESC LIMIT 1',[merchantId])).rows[0];
  if(!row)fail('UNAVAILABLE');
  const rate=row.settings?.inrPerUsdt;
  if(typeof rate!=='string')fail('MERCHANT_FX_UNCONFIGURED');
  const rateMinor=BigInt(money.fromDecimal(rate,'USDT'));if(rateMinor<=0n)fail('MERCHANT_FX_UNCONFIGURED');
  return {...row,rate,rateMinor};
 }
 quote(inrMinor,rateMinor){
  const amount=money.minor(inrMinor),usdt=amount*10000000000n/rateMinor;
  if(usdt<=0n)fail('INVALID_INPUT');return usdt.toString();
 }
 project(r,detail=false){
  const out={id:r.id,currency:'USDT',inrMinor:r.inr_minor,usdtMinor:r.usdt_minor,state:r.state,statusLabel:r.state,createdAt:r.created_at,completedAt:r.completed_at,
   rate:r.snapshot.rate,rateVersion:r.snapshot.version,network:r.snapshot.network,rounding:r.snapshot.rounding,manualProcessing:true,blockchainConfirmed:false};
  if(detail){out.destination=JSON.parse(this.crypto.open(r.encrypted_destination,binding('destination',r.id)));if(r.encrypted_completion)out.completion=JSON.parse(this.crypto.open(r.encrypted_completion,binding('completion',r.id)));}
  return out;
 }
 async summary(client,merchantId){
  const balance=await ledger.summary(client,merchantId),terms=await this.terms(client,merchantId);
  return {enabled:true,currency:'INR',available:balance.merchantAvailable,reserved:balance.merchantSettlementReserved,principal:balance.merchantSettlementPrincipal,
   rate:terms.rate,rateVersion:terms.version,network:'TRON-TRC20',rounding:'floor-to-six-decimals',providerConnected:false,
   maxUsdtMinor:(BigInt(balance.merchantAvailable)>0n?BigInt(balance.merchantAvailable)*10000000000n/terms.rateMinor:0n).toString()};
 }
 async list(client,merchantId,{offset=0,limit=25}={}){
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)fail();
  const rows=(await client.query('SELECT * FROM wpay_auth.merchant_settlement_withdrawals WHERE merchant_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3',[merchantId,limit+1,offset])).rows;
  return {requests:rows.slice(0,limit).map(r=>this.project(r)),hasMore:rows.length>limit,offset};
 }
 async request(client,merchantId,body){
  fields(body,['idempotencyKey','amountMinor','usdtMinor','rateVersion','network','address']);v.reference(body.idempotencyKey);
  if((body.amountMinor===undefined)===(body.usdtMinor===undefined))fail();money.minor(body.usdtMinor??body.amountMinor);
  if(body.network!=='TRON-TRC20')fail();address(body.network,body.address);
  await ledger.lock(client);
  const terms=await this.terms(client,merchantId),fingerprint=ledger.digest(body);
  const prior=(await client.query('SELECT * FROM wpay_auth.merchant_settlement_withdrawals WHERE merchant_id=$1 AND idempotency_key=$2',[merchantId,body.idempotencyKey])).rows[0];
  if(prior){if(prior.payload_digest!==fingerprint)fail('CONFLICT');return this.project(prior);}
  if(body.usdtMinor!==undefined&&body.rateVersion!==terms.version)fail('CONFLICT');
  const amountMinor=body.usdtMinor===undefined?body.amountMinor:((BigInt(body.usdtMinor)*terms.rateMinor+9999999999n)/10000000000n).toString();
  const balance=await ledger.summary(client,merchantId),amount=money.minor(amountMinor);if(amount<=0n||BigInt(balance.merchantAvailable)<amount)fail('INSUFFICIENT_BALANCE');
  const usdtMinor=body.usdtMinor??this.quote(amountMinor,terms.rateMinor),id=randomUUID(),snapshot={id:terms.id,version:terms.version,rate:terms.rate,network:body.network,rounding:'floor-to-six-decimals'};
  const destination={network:body.network,address:body.address};
  const row=(await client.query(`INSERT INTO wpay_auth.merchant_settlement_withdrawals(id,merchant_id,idempotency_key,payload_digest,inr_minor,usdt_minor,snapshot,encrypted_destination)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[id,merchantId,body.idempotencyKey,fingerprint,amountMinor,usdtMinor,snapshot,this.crypto.seal(JSON.stringify(destination),binding('destination',id))])).rows[0];
  await accounting.journal(client,id,'merchant_settlement_reserve',merchantId,ledger.pair(merchantId,'merchant_settlement_reserved',amountMinor),snapshot);
  await accounting.event(client,{id,owner:merchantId,actor:merchantId,kind:'merchant_settlement',state:'requested'});
  return this.project(row);
 }
 async get(client,id){
  const row=(await client.query('SELECT * FROM wpay_auth.merchant_settlement_withdrawals WHERE id=$1',[v.id(id)])).rows[0];if(!row)fail('FORBIDDEN');return row;
 }
 async transition(client,row,actor,body,merchant=false){
  fields(body,['id','action','reason','reference','network','completedAt']);v.reason(body.reason);
  const action=body.action;if(merchant&&action!=='cancel')fail('FORBIDDEN');
  const transitions={review:['requested'],approve:['requested','review'],process:['approved'],complete:['processing'],reject:['requested','review','approved'],cancel:['requested','review']};
  const states={review:'review',approve:'approved',process:'processing',complete:'completed',reject:'rejected',cancel:'cancelled'};
  if(!transitions[action])fail();await ledger.lock(client);
  row=(await client.query('SELECT * FROM wpay_auth.merchant_settlement_withdrawals WHERE id=$1 FOR UPDATE',[row.id])).rows[0];
  let completion=null,completionDigest=null,economicDigest=null;
  if(action==='complete'){
    const destination=JSON.parse(this.crypto.open(row.encrypted_destination,binding('destination',row.id)));
    if(body.network!==destination.network)fail();networks.hash(body.network,body.reference);
    if(typeof body.completedAt!=='string'||! /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(body.completedAt))fail();
    const when=+new Date(body.completedAt),now=+(await client.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now;if(!Number.isFinite(when)||when>now||when<+row.created_at)fail();
    completion={reference:body.reference,network:body.network,completedAt:new Date(when).toISOString(),actorId:actor,recordType:'manual_admin_record',blockchainConfirmed:false};
    completionDigest=ledger.digest(completion);economicDigest=ledger.digest({network:body.network,reference:body.reference});
  }else if(body.reference!==undefined||body.network!==undefined||body.completedAt!==undefined)fail();
  if(row.state===states[action]){if(action==='complete'&&row.completion_digest!==completionDigest)fail('CONFLICT');return this.project(row);}
  if(!transitions[action].includes(row.state))fail('CONFLICT');
  if(['complete','reject','cancel'].includes(action)){
    const entries=ledger.pair(row.merchant_id,'merchant_settlement_reserved',row.inr_minor,'INR','debit');
    if(action==='complete'){
      const used=(await client.query('SELECT resource_id FROM wpay_auth.payout_economic_references WHERE digest=$1',[economicDigest])).rows[0];if(used)fail('DUPLICATE_TRANSFER');
      await client.query("INSERT INTO wpay_auth.payout_economic_references(digest,kind,resource_id) VALUES($1,'merchant_settlement',$2)",[economicDigest,row.id]);
      entries.push(...ledger.pair(row.merchant_id,'merchant_settlement_principal',row.inr_minor));
    }
    await accounting.journal(client,row.id,action==='complete'?'merchant_settlement_complete':'merchant_settlement_release',actor,entries,row.snapshot,{reason:body.reason,...(completionDigest?{completionDigest}:{})});
  }
  const next=(await client.query('UPDATE wpay_auth.merchant_settlement_withdrawals SET state=$2,completed_at=$3,completion_digest=$4,encrypted_completion=$5 WHERE id=$1 RETURNING *',
   [row.id,states[action],completion?.completedAt||null,completionDigest,completion?this.crypto.seal(JSON.stringify(completion),binding('completion',row.id)):null])).rows[0];
  await accounting.event(client,{id:row.id,owner:row.merchant_id,actor,kind:'merchant_settlement',state:states[action],reason:body.reason});
  return this.project(next);
 }
}
module.exports={MerchantSettlements,binding};
