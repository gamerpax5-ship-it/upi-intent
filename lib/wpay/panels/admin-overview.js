"use strict";
const {permit,fail}=require('../operations/access');
const {canUsePermission}=require('../authorization-policy');
async function overview(c,row,context,body={}){
 if(!['admin','super_admin'].includes(row.account_type))fail();
 const scope=permit(context,'overview.view');
 if(Object.keys(body).some(k=>k!=='days')||![7,30,60].includes(body.days??30))fail('INVALID_INPUT');
 const days=body.days??30,from=new Date(+new Date(row.database_now)-days*86400000),tenants=scope.tenantIds;
 if(!Array.isArray(tenants)||!tenants.length)fail();
 const has=p=>canUsePermission({...context,permissionId:p}).allowed;
 const result={days,asOf:row.database_now,totalVolume:null,merchantAvailable:null,frozen:null,netProfit:null,series:[],recentPayouts:null,fees:null,approvals:{},settlement:null};
 if(has('reports.view')){
  const balances=(await c.query(`SELECT a.account_type,e.ledger_type,COALESCE(sum(CASE WHEN e.direction='credit' THEN e.amount_minor ELSE -e.amount_minor END),0)::text amount FROM wpay_auth.business_entries e JOIN wpay_auth.accounts a ON a.id=e.owner_id WHERE a.tenant_id=ANY($1) AND e.currency='INR' GROUP BY a.account_type,e.ledger_type`,[tenants])).rows;
  const values=Object.fromEntries(balances.filter(b=>b.account_type==='merchant').map(b=>[b.ledger_type,BigInt(b.amount)]));
  const n=k=>values[k]||0n;
  result.merchantAvailable=(n('merchant_gross')+n('merchant_adjustment')-['merchant_platform_fee','merchant_payout_fee','merchant_hold','merchant_payout_reserved','merchant_payout_principal','merchant_settlement_reserved','merchant_settlement_principal'].reduce((s,k)=>s+n(k),0n)).toString();
  result.frozen=(n('merchant_hold')+n('merchant_payout_reserved')+n('merchant_settlement_reserved')).toString();
  result.settlement=n('merchant_settlement_principal').toString();
  const fees=(await c.query(`SELECT e.ledger_type,COALESCE(sum(CASE WHEN e.direction='credit' THEN e.amount_minor ELSE -e.amount_minor END),0)::text amount FROM wpay_auth.business_entries e JOIN wpay_auth.business_journals j ON j.id=e.journal_id JOIN wpay_auth.accounts a ON a.id=e.owner_id WHERE a.tenant_id=ANY($1) AND e.currency='INR' AND j.created_at >= $2 AND j.created_at <= $3 AND e.ledger_type=ANY($4) GROUP BY e.ledger_type`,[tenants,from,row.database_now,['merchant_platform_fee','merchant_payout_fee','user_commission','user_payout_commission']])).rows;
  result.fees=Object.fromEntries(fees.map(f=>[f.ledger_type,f.amount]));
 }
 if(has('transactions.view')&&has('payout_operations.view')){
  const series=(await c.query(`SELECT to_char(happened AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') day,kind,sum(amount_minor)::text amount FROM (SELECT g.paid_at happened,'payin' kind,g.amount_minor FROM wpay_auth.gateway_orders g JOIN wpay_auth.accounts a ON a.id=g.merchant_id WHERE a.tenant_id=ANY($1) AND g.state='successful' AND g.paid_at >= $2 AND g.paid_at <= $3 UNION ALL SELECT p.completed_at,'payout',p.amount_minor FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts a ON a.id=p.merchant_id WHERE a.tenant_id=ANY($1) AND p.state='successful' AND p.completed_at >= $2 AND p.completed_at <= $3) events GROUP BY day,kind ORDER BY day,kind`,[tenants,from,row.database_now])).rows;
  result.series=series;result.totalVolume=series.reduce((n,r)=>n+BigInt(r.amount),0n).toString();
 }
 if(has('payout_operations.view'))result.recentPayouts=(await c.query(`SELECT p.reference,a.name merchant,p.amount_minor::text amount,p.state,(p.percentage_fee_minor+p.fixed_fee_minor)::text fee,p.created_at FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts a ON a.id=p.merchant_id WHERE a.tenant_id=ANY($1) ORDER BY p.created_at DESC,p.id LIMIT 5`,[tenants])).rows;
 for(const type of ['user','merchant'])if(has(type==='user'?'users.view':'merchants.view'))result.approvals[type]=(await c.query(`SELECT count(*)::int count FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.tenant_id=ANY($1) AND a.account_type=$2 AND a.status='active' AND e.approval_status='pending'`,[tenants,type])).rows[0].count;
 return result;
}
module.exports={overview};
