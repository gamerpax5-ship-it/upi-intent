"use strict";
const {randomUUID}=require('node:crypto'),ledger=require('../business/ledger'),money=require('../business/money'),v=require('../business/validation'),{address}=require('../auth/runtime/commercial'),networks=require('../funding/networks');
const {fail,fields,utr}=require('./validation'),a=require('./accounting'),banks=require('./banks');
const binding=(kind,id)=>'wpay-withdrawal-'+kind+':'+id;
class Withdrawals{
 constructor(crypto){this.crypto=crypto;}
 project(r,detail=false){const out={id:r.id,currency:r.currency,amountMinor:r.amount_minor,entitlementMinor:r.entitlement_minor,state:r.state,statusLabel:r.currency==='USDT'&&r.state==='requested'?'Pending Admin Processing':r.state,createdAt:r.created_at,completedAt:r.completed_at,rate:r.currency==='USDT'?r.snapshot.settings.inrPerUsdt:null,rateVersion:r.snapshot.version,manualProcessing:true,blockchainConfirmed:false};if(detail){out.destination=JSON.parse(this.crypto.open(r.encrypted_destination,binding('destination',r.id)));if(r.encrypted_completion)out.completion=JSON.parse(this.crypto.open(r.encrypted_completion,binding('completion',r.id)));}return out;}
 async request(client,userId,body){
  fields(body,['idempotencyKey','currency','amountMinor','bankId','network','address']);v.reference(body.idempotencyKey);if(!['INR','USDT'].includes(body.currency)||money.minor(body.amountMinor)>money.MAX)fail();
  if(body.currency==='INR'&&(body.network!==undefined||body.address!==undefined)||body.currency==='USDT'&&body.bankId!==undefined)fail();
  await ledger.lock(client);const fingerprint=ledger.digest(body),prior=(await client.query('SELECT * FROM wpay_auth.commission_withdrawals WHERE user_id=$1 AND idempotency_key=$2',[userId,body.idempotencyKey])).rows[0];
  if(prior){if(prior.payload_digest!==fingerprint)fail('CONFLICT');return this.project(prior);}
  const snapshot=await a.terms(client,userId);let destination,amount=body.amountMinor;
  if(body.currency==='INR'){const bank=await banks.owned(client,userId,body.bankId);destination={bankId:bank.id,bankVersion:bank.version,beneficiaryName:bank.details.holderName,accountNumber:bank.details.accountNumber,ifsc:bank.details.ifsc};}
  else{if(body.network!==snapshot.settings.depositNetwork)fail();address(body.network,body.address);destination={network:body.network,address:body.address};amount=networks.conversion(body.amountMinor,snapshot.settings.inrPerUsdt);money.minor(amount);}
  const balance=await a.entitlement(client,userId);if(BigInt(balance.available)<BigInt(amount))fail('INSUFFICIENT_COMMISSION');
  const id=randomUUID(),r=(await client.query(`INSERT INTO wpay_auth.commission_withdrawals(id,user_id,idempotency_key,payload_digest,currency,amount_minor,entitlement_minor,snapshot,encrypted_destination) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[id,userId,body.idempotencyKey,fingerprint,body.currency,body.amountMinor,amount,snapshot,this.crypto.seal(JSON.stringify(destination),binding('destination',id))])).rows[0];
  await a.journal(client,id,'commission_reserve',userId,ledger.pair(userId,'user_commission_reserved',amount),snapshot);
  await a.event(client,{id,owner:userId,actor:userId,kind:'withdrawal',state:'requested'});return this.project(r);
 }
 async transition(client,r,actor,body,user=false){
  fields(body,['id','action','reason','reference','network','completedAt']);v.reason(body.reason);
  const action=body.action;if(user&&action!=='cancel')fail('FORBIDDEN');
  const transitions={review:['requested'],approve:['requested','review'],process:['approved'],complete:['processing'],reject:['requested','review','approved'],cancel:['requested','review']};
  const states={review:'review',approve:'approved',process:'processing',complete:'completed',reject:'rejected',cancel:'cancelled'};
  if(!transitions[action])fail();await ledger.lock(client);r=(await client.query('SELECT * FROM wpay_auth.commission_withdrawals WHERE id=$1 FOR UPDATE',[r.id])).rows[0];
  let completion=null,completionDigest=null,economicDigest=null;
  if(action==='complete'){
   const destination=JSON.parse(this.crypto.open(r.encrypted_destination,binding('destination',r.id)));
   if(r.currency==='USDT'){if(body.network!==destination.network)fail();networks.hash(body.network,body.reference);}else{if(body.network!==undefined)fail();utr(body.reference);}
   if(typeof body.completedAt!=='string'||! /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(body.completedAt))fail();
   const when=+new Date(body.completedAt),now=+(await client.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now;
   if(!Number.isFinite(when)||when>now||when<+r.created_at)fail();
   completion={reference:body.reference,network:body.network??null,completedAt:new Date(when).toISOString(),actorId:actor,recordType:'manual_admin_record',blockchainConfirmed:false};completionDigest=ledger.digest(completion);
   economicDigest=ledger.digest({network:body.network??'INR',reference:body.reference});
  }else if(body.reference!==undefined||body.network!==undefined||body.completedAt!==undefined)fail();
  if(r.state===states[action]){if(action==='complete'&&r.completion_digest!==completionDigest)fail('CONFLICT');return this.project(r);}
  if(!transitions[action].includes(r.state))fail('CONFLICT');
  if(['approve','process'].includes(action)&&r.currency==='INR'){
   const d=JSON.parse(this.crypto.open(r.encrypted_destination,binding('destination',r.id))),b=await banks.owned(client,r.user_id,d.bankId);
   if(b.version!==d.bankVersion)fail('CONFLICT');
  }
  if(['complete','reject','cancel'].includes(action)){
   const entries=ledger.pair(r.user_id,'user_commission_reserved',r.entitlement_minor,'INR','debit');
   if(action==='complete'){
    const used=(await client.query('SELECT resource_id FROM wpay_auth.payout_economic_references WHERE digest=$1',[economicDigest])).rows[0];if(used)fail('DUPLICATE_TRANSFER');
    await client.query("INSERT INTO wpay_auth.payout_economic_references(digest,kind,resource_id) VALUES($1,'withdrawal',$2)",[economicDigest,r.id]);entries.push(...ledger.pair(r.user_id,'user_commission_withdrawn',r.entitlement_minor));
   }
   await a.journal(client,r.id,action==='complete'?'commission_complete':'commission_release',actor,entries,r.snapshot,{reason:body.reason,...(completionDigest?{completionDigest}:{})});
  }
  const next=(await client.query('UPDATE wpay_auth.commission_withdrawals SET state=$2,completed_at=$3,completion_digest=$4,encrypted_completion=$5 WHERE id=$1 RETURNING *',[r.id,states[action],completion?.completedAt||null,completionDigest,completion?this.crypto.seal(JSON.stringify(completion),binding('completion',r.id)):null])).rows[0];
  await a.event(client,{id:r.id,owner:r.user_id,actor,kind:'withdrawal',state:states[action],reason:body.reason});return this.project(next);
 }
 async hold(client,actor,body){
  v.exactFields(body,['id','userId','amountMinor','reference','reason','release']);v.id(body.id);v.id(body.userId);v.reference(body.reference);v.reason(body.reason);money.minor(body.amountMinor);if(typeof body.release!=='boolean')fail();
  await ledger.lock(client);const prior=(await client.query('SELECT * FROM wpay_auth.commission_holds WHERE id=$1',[body.id])).rows[0];
  if(prior&&(prior.user_id!==body.userId||prior.amount_minor!==body.amountMinor||prior.reference!==body.reference))fail('CONFLICT');
  if(body.release){if(!prior)fail('CONFLICT');if(prior.released_at)return {id:prior.id,released:true};await client.query('UPDATE wpay_auth.commission_holds SET released_at=CURRENT_TIMESTAMP WHERE id=$1',[body.id]);}
  else{if(prior){if(prior.reason!==body.reason)fail('CONFLICT');return {id:prior.id,released:!!prior.released_at};}if(BigInt((await a.entitlement(client,body.userId)).available)<BigInt(body.amountMinor))fail('INSUFFICIENT_COMMISSION');await client.query('INSERT INTO wpay_auth.commission_holds(id,user_id,amount_minor,reference,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6)',[body.id,body.userId,body.amountMinor,body.reference,body.reason,actor]);}
  await a.journal(client,body.id,body.release?'commission_hold_release':'commission_hold',actor,ledger.pair(body.userId,'user_commission_hold',body.amountMinor,'INR',body.release?'debit':'credit'),{},{reason:body.reason});
  await a.event(client,{id:body.id,owner:body.userId,actor,kind:'commission_hold',state:body.release?'released':'active',reason:body.reason});return {id:body.id,released:body.release};
 }
}
module.exports={Withdrawals};
