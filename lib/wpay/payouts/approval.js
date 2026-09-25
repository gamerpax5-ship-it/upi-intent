'use strict';
const ledger=require('../business/ledger'),a=require('./accounting'),{fail}=require('./validation');
const MIN_REMAINING_MS=15*60*1000;
function routable(deadline,now){return deadline===null||deadline===undefined||+new Date(deadline)-+new Date(now)>=MIN_REMAINING_MS;}
async function close(core,client,p,actor,state,reason){
 if(!['pending_admin','open'].includes(p.state))fail('CONFLICT');
 await a.journal(client,p.id,'merchant_payout_release',actor,ledger.pair(p.merchant_id,'merchant_payout_reserved',p.reserve_minor,'INR','debit'),p.snapshot,{reason});
 const next=(await client.query('UPDATE wpay_auth.payout_orders SET state=$2,completed_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *',[p.id,state])).rows[0];
 await a.event(client,{id:p.id,owner:p.merchant_id,actor,kind:'payout',state,reason});
 await core.gateway.emit(client,next,'payout.cancelled','payout');return next;
}
async function expire(core,client){
 await ledger.lock(client);
 const rows=(await client.query("SELECT * FROM wpay_auth.payout_orders WHERE state IN('pending_admin','open') AND deadline_at<CURRENT_TIMESTAMP+interval '15 minutes' ORDER BY deadline_at,id LIMIT 200 FOR UPDATE")).rows;
 for(const p of rows)await close(core,client,p,null,'failed','Insufficient time remaining: payout requires 10 minutes plus 5 minutes cooldown');
}
async function list(client,tenantIds,{offset=0,limit=25}={}){
 const rows=(await client.query(`SELECT COALESCE(p.batch_id,p.id) AS id,p.merchant_id,m.name AS merchant_name,
 count(*)::int AS order_count,sum(p.amount_minor)::text AS volume_minor,sum(p.reserve_minor)::text AS reserve_minor,
 min(p.deadline_at) AS earliest_deadline,max(p.deadline_at) AS latest_deadline,min(p.created_at) AS created_at,
 count(*) FILTER(WHERE p.state='pending_admin')::int AS pending_count,
 count(*) FILTER(WHERE p.state='failed')::int AS failed_count
 FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts m ON m.id=p.merchant_id
 WHERE m.tenant_id=ANY($1) GROUP BY COALESCE(p.batch_id,p.id),p.merchant_id,m.name
 HAVING count(*) FILTER(WHERE p.state='pending_admin')>0
 ORDER BY min(p.created_at),COALESCE(p.batch_id,p.id) LIMIT $2 OFFSET $3`,[tenantIds,limit+1,offset])).rows;
 const balances=new Map();for(const r of rows){if(!balances.has(r.merchant_id))balances.set(r.merchant_id,(await ledger.summary(client,r.merchant_id)).merchantAvailable);r.available_minor=balances.get(r.merchant_id);}
 return {requests:rows.slice(0,limit),hasMore:rows.length>limit,offset};
}
async function decide(core,client,rows,actor,action,reason){
 const now=(await client.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now,result=[];
 for(const p of rows){
  if(p.state!=='pending_admin'){result.push(core.project(p));continue;}
  if(action==='reject'||!routable(p.deadline_at,now)){result.push(core.project(await close(core,client,p,actor,action==='reject'?'rejected':'failed',action==='reject'?reason:'Admin approval exceeded routing deadline')));continue;}
  const next=(await client.query("UPDATE wpay_auth.payout_orders SET state='open' WHERE id=$1 RETURNING *",[p.id])).rows[0];
  await a.event(client,{id:p.id,owner:p.merchant_id,actor,kind:'payout',state:'open',reason});result.push(core.project(next));
 }
 return {orders:result,approved:result.filter(r=>r.status==='open').length,failed:result.filter(r=>r.status==='failed').length,rejected:result.filter(r=>r.status==='rejected').length};
}
module.exports={MIN_REMAINING_MS,routable,close,expire,list,decide};
