"use strict";
const {randomUUID}=require('node:crypto'),ledger=require('../business/ledger'),v=require('../business/validation'),money=require('../business/money'),banks=require('./banks'),a=require('./accounting'),{fail}=require('./validation'),{volume}=require('../business/bank-volume');
const LEASE_SECONDS=600,COOLDOWN_SECONDS=300;
async function pending(client,userId){return BigInt((await client.query("SELECT COALESCE(sum(p.amount_minor),0)::text AS amount FROM wpay_auth.payout_claims c JOIN wpay_auth.payout_orders p ON p.id=c.payout_id WHERE c.user_id=$1 AND ((c.state='active' AND c.expires_at>CURRENT_TIMESTAMP) OR c.state='submitted')",[userId])).rows[0].amount);}
async function eligible(client,userId){
 const balance=await ledger.summary(client,userId),unreserved=BigInt(balance.consumed)-await pending(client,userId),available=unreserved>0n?unreserved:0n,result=[];
 const rows=(await client.query("SELECT id FROM wpay_auth.business_bank_accounts WHERE owner_id=$1 AND status='running' AND NOT frozen AND NOT deactivated ORDER BY id",[userId])).rows;
 for(const row of rows){
  try{const b=await banks.owned(client,userId,row.id,true),limit=await volume(client,b.id,b.version),remaining=BigInt(limit.shared_limit||'0')-BigInt(limit.used),amount=remaining<available?remaining:available;
   if(amount>0n)result.push({id:b.id,version:b.version,maxMinor:amount.toString()});
  }catch(e){if(!['FORBIDDEN','FUNDING_REQUIRED','STATEMENT_REQUIRED','DEVICE_REQUIRED','PAYOUT_BANK_REQUIRED'].includes(e.code))throw e;}
 }return result;
}
async function releaseClaim(client,claim,actor,state){
 if(!['released','expired'].includes(state)||claim.state!=='active')fail('CONFLICT');
 await client.query("UPDATE wpay_auth.payout_claims SET state=$2,closed_at=CURRENT_TIMESTAMP,cooldown_until=CURRENT_TIMESTAMP+($3*interval '1 second') WHERE id=$1",[claim.id,state,COOLDOWN_SECONDS]);
 const p=(await client.query("UPDATE wpay_auth.payout_orders SET state='open' WHERE id=$1 AND state='claimed' RETURNING merchant_id",[claim.payout_id])).rows[0];if(!p)fail('CONFLICT');
 await a.event(client,{id:claim.payout_id,owner:p.merchant_id,actor,kind:'claim',state,reason:state==='expired'?'Unsubmitted claim lease expired':'Owner released unsubmitted claim'});
}
async function expire(client,id=null){
 await ledger.lock(client);const rows=(await client.query("SELECT * FROM wpay_auth.payout_claims WHERE state='active' AND expires_at<=CURRENT_TIMESTAMP AND ($1::uuid IS NULL OR payout_id=$1) ORDER BY expires_at,id LIMIT 200 FOR UPDATE",[id])).rows;
 for(const row of rows)await releaseClaim(client,row,null,'expired');
}
async function queue(client,userId){
 await expire(client);const options=await eligible(client,userId);if(!options.length)return {orders:[],banks:[],leaseSeconds:LEASE_SECONDS,cooldownSeconds:COOLDOWN_SECONDS};
 const max=options.reduce((n,b)=>BigInt(b.maxMinor)>n?BigInt(b.maxMinor):n,0n);
 const rows=(await client.query(`SELECT p.id,p.amount_minor::text,p.created_at FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts m ON m.id=p.merchant_id JOIN wpay_auth.eligibility e ON e.account_id=m.id JOIN wpay_auth.account_security s ON s.account_id=m.id WHERE p.state='open' AND (p.deadline_at IS NULL OR p.deadline_at>=CURRENT_TIMESTAMP+interval '15 minutes') AND p.amount_minor<=$1
 AND NOT EXISTS(SELECT 1 FROM wpay_auth.payout_claims cool WHERE cool.payout_id=p.id AND cool.cooldown_until>CURRENT_TIMESTAMP)
 AND m.status='active' AND e.approval_status='approved' ORDER BY p.created_at,p.id LIMIT 100`,[max.toString()])).rows;
 return {orders:rows.map(p=>({id:p.id,amountMinor:p.amount_minor,currency:'INR',createdAt:p.created_at})),banks:options,leaseSeconds:LEASE_SECONDS,cooldownSeconds:COOLDOWN_SECONDS,capacityPolicy:'unreserved_consumed_capacity'};
}
async function claim(core,client,userId,body){
 v.id(body.id);v.id(body.bankId);await expire(client,body.id);
 const p=(await client.query('SELECT *,CURRENT_TIMESTAMP AS database_now FROM wpay_auth.payout_orders WHERE id=$1 FOR UPDATE',[body.id])).rows[0];if(!p)fail('FORBIDDEN');
 const prior=(await client.query("SELECT * FROM wpay_auth.payout_claims WHERE payout_id=$1 AND state IN('active','submitted')",[p.id])).rows[0];
 if(prior){if(prior.user_id!==userId||prior.bank_id!==body.bankId)fail('CONFLICT');return {id:p.id,claimId:prior.id,status:p.state,expiresAt:prior.expires_at};}
 const cooldown=(await client.query('SELECT cooldown_until FROM wpay_auth.payout_claims WHERE payout_id=$1 AND cooldown_until>CURRENT_TIMESTAMP ORDER BY cooldown_until DESC LIMIT 1',[p.id])).rows[0];
 if(cooldown)fail('CONFLICT');
 if(p.state!=='open'||!require('./approval').routable(p.deadline_at,p.database_now))fail('CONFLICT');
 const m=(await client.query("SELECT a.id FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id JOIN wpay_auth.account_security s ON s.account_id=a.id WHERE a.id=$1 AND a.status='active' AND e.approval_status='approved'",[p.merchant_id])).rows[0];if(!m)fail('FORBIDDEN');
 const b=await banks.owned(client,userId,body.bankId,true),options=await eligible(client,userId),option=options.find(o=>o.id===b.id);if(!option||BigInt(option.maxMinor)<BigInt(p.amount_minor))fail('INSUFFICIENT_CAPACITY');
 const identity=(await client.query('SELECT account_key FROM wpay_auth.business_bank_identities WHERE bank_id=$1 AND version=$2',[b.id,b.version])).rows[0];if(!identity)fail('FORBIDDEN');
 const id=randomUUID(),r=(await client.query("INSERT INTO wpay_auth.payout_claims(id,payout_id,user_id,bank_id,bank_version,account_key,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,'active',CURRENT_TIMESTAMP+($7*interval '1 second')) RETURNING *",[id,p.id,userId,b.id,b.version,identity.account_key,LEASE_SECONDS])).rows[0];
 await client.query("UPDATE wpay_auth.payout_orders SET state='claimed' WHERE id=$1",[p.id]);p.state='claimed';
 await a.event(client,{id:p.id,owner:p.merchant_id,actor:userId,kind:'claim',state:'active',reason:'Exclusive claim; no payment submitted'});await core.gateway.emit(client,p,'payout.claimed','payout',id);return {id:p.id,claimId:id,status:'claimed',expiresAt:r.expires_at};
}
async function release(client,p,userId){
 await ledger.lock(client);const c=(await client.query("SELECT * FROM wpay_auth.payout_claims WHERE payout_id=$1 AND user_id=$2 ORDER BY created_at DESC,id LIMIT 1 FOR UPDATE",[p.id,userId])).rows[0];if(!c)fail('FORBIDDEN');if(['released','expired'].includes(c.state))return {id:p.id,status:'open'};await releaseClaim(client,c,userId,'released');return {id:p.id,status:'open'};
}
async function settle(core,client,p,actor,reason,admin){
 v.reason(reason);await ledger.lock(client);p=(await client.query('SELECT *,CURRENT_TIMESTAMP AS database_now FROM wpay_auth.payout_orders WHERE id=$1 FOR UPDATE',[p.id])).rows[0];if(p.state==='successful')return core.project(p);
 if(p.state!==(admin?'merchant_rejected_review':'submitted'))fail('CONFLICT');
 const c=(await client.query("SELECT c.* FROM wpay_auth.payout_claims c JOIN wpay_auth.payout_submissions s ON s.claim_id=c.id WHERE c.payout_id=$1 AND c.state='submitted'",[p.id])).rows[0];if(!c)fail('CONFLICT');
 const balance=await ledger.summary(client,c.user_id);if(BigInt(balance.consumed)<BigInt(p.amount_minor))fail('CONFLICT');
 // The accepted economic claim survives logout, bank stop and later permission changes.
 const terms=await a.terms(client,c.user_id),commission=money.fee(p.amount_minor,terms.settings.payoutCommission),fees=(BigInt(p.percentage_fee_minor)+BigInt(p.fixed_fee_minor)).toString();
 const entries=[...ledger.pair(p.merchant_id,'merchant_payout_reserved',p.reserve_minor,'INR','debit'),...ledger.pair(p.merchant_id,'merchant_payout_principal',p.amount_minor),...ledger.pair(c.user_id,'capacity_consumed',p.amount_minor,'INR','debit')];
 if(fees!=='0')entries.push(...ledger.pair(p.merchant_id,'merchant_payout_fee',fees));if(commission!=='0')entries.push(...ledger.pair(c.user_id,'user_payout_commission',commission));
 const journalId=await a.journal(client,p.id,'payout_settlement',actor,entries,{...p.snapshot,user:terms},{commissionMinor:commission,feeMinor:fees,reason,acknowledgement:admin?'admin_dispute_paid':'merchant_approved'});
 await client.query('INSERT INTO wpay_auth.payout_settlements(payout_id,claim_id,journal_id,actor_id,user_snapshot,commission_minor) VALUES($1,$2,$3,$4,$5,$6)',[p.id,c.id,journalId,actor,terms,commission]);
 await client.query("UPDATE wpay_auth.payout_claims SET state='consumed',closed_at=CURRENT_TIMESTAMP WHERE id=$1",[c.id]);p=(await client.query("UPDATE wpay_auth.payout_orders SET state='successful',completed_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",[p.id])).rows[0];
 await a.event(client,{id:p.id,owner:p.merchant_id,actor,kind:'payout',state:'successful',reason});await core.gateway.emit(client,p,'payout.success','payout');return core.project(p);
}
module.exports={queue,claim,release,settle,expire,eligible,LEASE_SECONDS,COOLDOWN_SECONDS};
