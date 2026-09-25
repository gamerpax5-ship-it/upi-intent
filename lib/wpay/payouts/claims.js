"use strict";
const {randomUUID}=require('node:crypto'),ledger=require('../business/ledger'),v=require('../business/validation'),money=require('../business/money'),banks=require('./banks'),a=require('./accounting'),{fail}=require('./validation'),{volume}=require('../business/bank-volume');
const LEASE_SECONDS=600,COOLDOWN_SECONDS=300;
const {POLICY}=require('../business/user-workflow-policy');
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
 await client.query("UPDATE wpay_auth.payout_claims SET state=$2,closed_at=CURRENT_TIMESTAMP,cooldown_until=CURRENT_TIMESTAMP+($3*interval '1 second') WHERE id=$1",[claim.id,state,state==='expired'?0:COOLDOWN_SECONDS]);
 const p=(await client.query("UPDATE wpay_auth.payout_orders SET state='open' WHERE id=$1 AND state='claimed' RETURNING merchant_id",[claim.payout_id])).rows[0];if(!p)fail('CONFLICT');
 await a.event(client,{id:claim.payout_id,owner:p.merchant_id,actor,kind:'claim',state,reason:state==='expired'?'Unsubmitted claim lease expired':'Owner released unsubmitted claim'});
}
async function expire(client,id=null){
 await ledger.lock(client);const rows=(await client.query("SELECT * FROM wpay_auth.payout_claims WHERE state='active' AND expires_at<=CURRENT_TIMESTAMP AND ($1::uuid IS NULL OR payout_id=$1) ORDER BY expires_at,id LIMIT 200 FOR UPDATE",[id])).rows;
 for(const row of rows)await releaseClaim(client,row,null,'expired');
}
async function queue(client,userId){
 await expire(client);
 const owner=(await client.query("SELECT a.id,a.tenant_id FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.id=$1 AND a.account_type='user' AND a.status='active' AND e.approval_status='approved'",[userId])).rows[0];
 if(!owner)fail('FORBIDDEN');
 const options=await eligible(client,userId),max=options.reduce((n,b)=>BigInt(b.maxMinor)>n?BigInt(b.maxMinor):n,0n);
 const active=(await client.query("SELECT 1 FROM wpay_auth.payout_claims WHERE user_id=$1 AND state='active' LIMIT 1",[userId])).rowCount>0;
 if(active)return {orders:[],banks:options,activeClaim:true,leaseSeconds:LEASE_SECONDS,cooldownSeconds:COOLDOWN_SECONDS};
 const rows=(await client.query(`SELECT p.id,p.amount_minor::text,p.created_at,p.snapshot,p.deadline_at FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts m ON m.id=p.merchant_id JOIN wpay_auth.eligibility e ON e.account_id=m.id
 WHERE p.state='open' AND m.tenant_id=$2 AND (p.deadline_at IS NULL OR p.deadline_at>=CURRENT_TIMESTAMP+interval '15 minutes')
 AND ((p.snapshot->>'workflowPolicy'=$3 AND EXISTS(SELECT 1 FROM wpay_auth.commercial_versions t WHERE t.account_id=$4 AND t.effective_at<=CURRENT_TIMESTAMP)) OR (p.snapshot->>'workflowPolicy' IS DISTINCT FROM $3 AND p.amount_minor<=$1))
 AND NOT EXISTS(SELECT 1 FROM wpay_auth.payout_claims cool WHERE cool.payout_id=p.id AND cool.cooldown_until>CURRENT_TIMESTAMP)
 AND m.status='active' AND e.approval_status='approved' ORDER BY p.created_at,p.id LIMIT 100`,[max.toString(),owner.tenant_id,POLICY.version,userId])).rows;
 return {orders:rows.map(p=>({id:p.id,amountMinor:p.amount_minor,currency:'INR',createdAt:p.created_at,deadlineAt:p.deadline_at,bankRequired:p.snapshot.workflowPolicy!==POLICY.version})),banks:options,leaseSeconds:LEASE_SECONDS,cooldownSeconds:COOLDOWN_SECONDS,capacityPolicy:'capacity_credited_after_approval'};
}
async function claim(core,client,userId,body){
 v.id(body.id);if(body.bankId!==undefined&&body.bankId!==null)v.id(body.bankId);await expire(client);
 const p=(await client.query('SELECT *,CURRENT_TIMESTAMP AS database_now FROM wpay_auth.payout_orders WHERE id=$1 FOR UPDATE',[body.id])).rows[0];if(!p)fail('FORBIDDEN');
 const prior=(await client.query("SELECT * FROM wpay_auth.payout_claims WHERE payout_id=$1 AND state IN('active','submitted')",[p.id])).rows[0];
 if(prior){if(prior.user_id!==userId||prior.bank_id!==(body.bankId??null))fail('CONFLICT');return {id:p.id,claimId:prior.id,status:p.state,expiresAt:prior.expires_at};}
 const cooldown=(await client.query('SELECT cooldown_until FROM wpay_auth.payout_claims WHERE payout_id=$1 AND cooldown_until>CURRENT_TIMESTAMP ORDER BY cooldown_until DESC LIMIT 1',[p.id])).rows[0];
 if(cooldown)fail('CONFLICT');
 if(p.state!=='open'||!require('./approval').routable(p.deadline_at,p.database_now))fail('CONFLICT');
 const m=(await client.query("SELECT a.id FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id JOIN wpay_auth.account_security s ON s.account_id=a.id WHERE a.id=$1 AND a.status='active' AND e.approval_status='approved'",[p.merchant_id])).rows[0];if(!m)fail('FORBIDDEN');
 const modern=p.snapshot.workflowPolicy===POLICY.version;
 if((await client.query("SELECT 1 FROM wpay_auth.payout_claims WHERE user_id=$1 AND state='active' LIMIT 1",[userId])).rowCount)fail('CONFLICT');
 const owner=(await client.query("SELECT a.id FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.id=$1 AND a.account_type='user' AND a.status='active' AND e.approval_status='approved' AND a.tenant_id=(SELECT tenant_id FROM wpay_auth.accounts WHERE id=$2)",[userId,p.merchant_id])).rows[0];if(!owner)fail('FORBIDDEN');
 let b=null,identity=null;
 if(!modern){b=await banks.owned(client,userId,body.bankId,true);const options=await eligible(client,userId),option=options.find(o=>o.id===b.id);if(!option||BigInt(option.maxMinor)<BigInt(p.amount_minor))fail('INSUFFICIENT_CAPACITY');}
 else if(body.bankId){b=(await client.query('SELECT id,version FROM wpay_auth.business_bank_accounts WHERE id=$1 AND owner_id=$2 AND NOT frozen AND NOT deactivated',[body.bankId,userId])).rows[0];if(!b)fail('FORBIDDEN');}
 if(b){identity=(await client.query('SELECT account_key FROM wpay_auth.business_bank_identities WHERE bank_id=$1 AND version=$2',[b.id,b.version])).rows[0];if(!identity)fail('FORBIDDEN');}
 await (modern?a.payoutTerms(client,userId,p.created_at):a.terms(client,userId));
 const id=randomUUID(),r=(await client.query("INSERT INTO wpay_auth.payout_claims(id,payout_id,user_id,bank_id,bank_version,account_key,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,'active',CURRENT_TIMESTAMP+($7*interval '1 second')) RETURNING *",[id,p.id,userId,b?.id??null,b?.version??null,identity?.account_key??null,modern?LEASE_SECONDS+COOLDOWN_SECONDS:LEASE_SECONDS])).rows[0];
 await client.query("UPDATE wpay_auth.payout_orders SET state='claimed' WHERE id=$1",[p.id]);p.state='claimed';
 await a.event(client,{id:p.id,owner:p.merchant_id,actor:userId,kind:'claim',state:'active',reason:'Exclusive claim; no payment submitted'});await core.gateway.emit(client,p,'payout.claimed','payout',id);return {id:p.id,claimId:id,status:'claimed',expiresAt:r.expires_at};
}
async function release(client,p,userId){
 await ledger.lock(client);const c=(await client.query("SELECT * FROM wpay_auth.payout_claims WHERE payout_id=$1 AND user_id=$2 ORDER BY created_at DESC,id LIMIT 1 FOR UPDATE",[p.id,userId])).rows[0];if(!c)fail('FORBIDDEN');if(['released','expired'].includes(c.state))return {id:p.id,status:'open'};await releaseClaim(client,c,userId,'released');return {id:p.id,status:'open'};
}
async function settle(core,client,p,actor,reason,admin,automatic=false){
 v.reason(reason);await ledger.lock(client);p=(await client.query('SELECT *,CURRENT_TIMESTAMP AS database_now FROM wpay_auth.payout_orders WHERE id=$1 FOR UPDATE',[p.id])).rows[0];if(p.state==='successful')return core.project(p);
 if(p.state!==(admin?'merchant_rejected_review':'submitted'))fail('CONFLICT');
 const c=(await client.query("SELECT c.* FROM wpay_auth.payout_claims c JOIN wpay_auth.payout_submissions s ON s.claim_id=c.id WHERE c.payout_id=$1 AND c.state='submitted'",[p.id])).rows[0];if(!c)fail('CONFLICT');
 const balance=await ledger.summary(client,c.user_id),modern=p.snapshot.workflowPolicy===POLICY.version;if(!modern&&BigInt(balance.consumed)<BigInt(p.amount_minor))fail('CONFLICT');
 // The accepted economic claim survives logout, bank stop and later permission changes.
 const terms=await (modern?a.payoutTerms(client,c.user_id,p.created_at):a.terms(client,c.user_id)),commission=money.fee(p.amount_minor,terms.settings.payoutCommission),fees=(BigInt(p.percentage_fee_minor)+BigInt(p.fixed_fee_minor)).toString();
 const entries=[...ledger.pair(p.merchant_id,'merchant_payout_reserved',p.reserve_minor,'INR','debit'),...ledger.pair(p.merchant_id,'merchant_payout_principal',p.amount_minor),...(BigInt(balance.consumed)>=BigInt(p.amount_minor)?ledger.pair(c.user_id,'capacity_consumed',p.amount_minor,'INR','debit'):ledger.pair(c.user_id,'capacity_allocated',p.amount_minor))];
 if(fees!=='0')entries.push(...ledger.pair(p.merchant_id,'merchant_payout_fee',fees));if(commission!=='0')entries.push(...ledger.pair(c.user_id,'user_payout_commission',commission));
 const journalId=await a.journal(client,p.id,'payout_settlement',actor,entries,{...p.snapshot,user:terms},{commissionMinor:commission,feeMinor:fees,reason,acknowledgement:automatic?'merchant_review_timeout':admin?'admin_dispute_paid':'merchant_approved'});
 await client.query('INSERT INTO wpay_auth.payout_settlements(payout_id,claim_id,journal_id,actor_id,user_snapshot,commission_minor) VALUES($1,$2,$3,$4,$5,$6)',[p.id,c.id,journalId,actor,terms,commission]);
 await client.query("UPDATE wpay_auth.payout_claims SET state='consumed',closed_at=CURRENT_TIMESTAMP WHERE id=$1",[c.id]);p=(await client.query("UPDATE wpay_auth.payout_orders SET state='successful',completed_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *",[p.id])).rows[0];
 await a.event(client,{id:p.id,owner:p.merchant_id,actor,kind:'payout',state:'successful',reason});await core.gateway.emit(client,p,'payout.success','payout');return core.project(p);
}
async function autoApprove(core,client){
 await ledger.lock(client);
 const rows=(await client.query("SELECT p.* FROM wpay_auth.payout_orders p JOIN wpay_auth.payout_submissions s ON s.payout_id=p.id WHERE p.state='submitted' AND p.snapshot->>'workflowPolicy'=$1 AND s.created_at<=CURRENT_TIMESTAMP-interval '15 minutes' ORDER BY s.created_at,p.id LIMIT 100 FOR UPDATE OF p",[POLICY.version])).rows;
 for(const p of rows)await settle(core,client,p,null,'Automatically approved after 15 minutes without Merchant decision',false,true);
 return rows.length;
}
module.exports={queue,claim,release,settle,expire,eligible,autoApprove,LEASE_SECONDS,COOLDOWN_SECONDS};
