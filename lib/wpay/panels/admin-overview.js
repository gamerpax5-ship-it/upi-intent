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
 const result={days,asOf:row.database_now,totalVolume:null,todayVolume:null,todayCollection:null,todayPayoutVolume:null,successRate:null,
  merchantAvailable:null,frozen:null,settlement:null,totalUsers:null,totalMerchants:null,totalEmployees:null,activeUsers:null,
  totalUserCommission:null,totalUserCapacity:null,userAvailableCapacity:null,totalUserDeposits:null,totalUserDepositsUsdt:null,
  totalFees:null,runningUpi:null,availableUpi:null,successfulPayouts:null,series:[],recentActivity:[],recentPayouts:null,fees:null,approvals:{}};
 if(has('reports.view')){
  const balances=(await c.query(`SELECT a.account_type,e.ledger_type,COALESCE(sum(CASE WHEN e.direction='credit' THEN e.amount_minor ELSE -e.amount_minor END),0)::text amount
   FROM wpay_auth.business_entries e JOIN wpay_auth.accounts a ON a.id=e.owner_id
   WHERE a.tenant_id=ANY($1) AND e.currency='INR' GROUP BY a.account_type,e.ledger_type`,[tenants])).rows;
  const map=type=>Object.fromEntries(balances.filter(b=>b.account_type===type).map(b=>[b.ledger_type,BigInt(b.amount)]));
  const merchant=map('merchant'),user=map('user'),m=k=>merchant[k]||0n,u=k=>user[k]||0n;
  result.merchantAvailable=(m('merchant_gross')+m('merchant_adjustment')-['merchant_platform_fee','merchant_payout_fee','merchant_hold','merchant_payout_reserved','merchant_payout_principal','merchant_settlement_reserved','merchant_settlement_principal'].reduce((s,k)=>s+m(k),0n)).toString();
  result.frozen=(m('merchant_hold')+m('merchant_payout_reserved')+m('merchant_settlement_reserved')).toString();
  result.settlement=m('merchant_settlement_principal').toString();
  result.totalUserCapacity=u('capacity_allocated').toString();
  result.userAvailableCapacity=(u('capacity_allocated')-u('capacity_consumed')-u('capacity_reserved')-u('capacity_hold')).toString();
  result.totalUserCommission=(u('user_commission')+u('user_payout_commission')+u('user_commission_adjustment')).toString();
  result.totalFees=(m('merchant_platform_fee')+m('merchant_payout_fee')).toString();
  const fees=(await c.query(`SELECT e.ledger_type,COALESCE(sum(CASE WHEN e.direction='credit' THEN e.amount_minor ELSE -e.amount_minor END),0)::text amount
   FROM wpay_auth.business_entries e JOIN wpay_auth.business_journals j ON j.id=e.journal_id JOIN wpay_auth.accounts a ON a.id=e.owner_id
   WHERE a.tenant_id=ANY($1) AND e.currency='INR' AND j.created_at >= $2 AND j.created_at <= $3
   AND e.ledger_type=ANY($4) GROUP BY e.ledger_type`,[tenants,from,row.database_now,['merchant_platform_fee','merchant_payout_fee','user_commission','user_payout_commission']])).rows;
  result.fees=Object.fromEntries(fees.map(x=>[x.ledger_type,x.amount]));
 }
 if(has('users.view')){
  const r=(await c.query(`SELECT count(*)::int total,count(*) FILTER(WHERE a.status='active' AND e.approval_status='approved')::int active
   FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.tenant_id=ANY($1) AND a.account_type='user'`,[tenants])).rows[0];
  result.totalUsers=r.total;result.activeUsers=r.active;
 }
 if(has('merchants.view'))result.totalMerchants=(await c.query("SELECT count(*)::int n FROM wpay_auth.accounts WHERE tenant_id=ANY($1) AND account_type='merchant'",[tenants])).rows[0].n;
 if(has('employee_management.view'))result.totalEmployees=(await c.query("SELECT count(*)::int n FROM wpay_auth.accounts WHERE tenant_id=ANY($1) AND account_type='employee'",[tenants])).rows[0].n;
 if(has('deposits.view')){
  const d=(await c.query(`SELECT COALESCE(sum(credit_minor),0)::text inr,
   COALESCE(sum((snapshot->>'amountMinor')::numeric),0)::text usdt
   FROM wpay_auth.funding_requests WHERE tenant_id=ANY($1) AND state='confirmed'`,[tenants])).rows[0];
  result.totalUserDeposits=d.inr;result.totalUserDepositsUsdt=d.usdt;
  result.approvals.deposit=(await c.query("SELECT count(*)::int n FROM wpay_auth.funding_requests WHERE tenant_id=ANY($1) AND state IN('detected','confirming','review')",[tenants])).rows[0].n;
 }
 if(has('bank_upi.view')){
  const q=(await c.query(`SELECT count(*) FILTER(WHERE status='running' AND NOT frozen AND NOT deactivated)::int running,
   count(*) FILTER(WHERE status='running' AND NOT frozen AND NOT deactivated AND used_minor<limit_minor)::int available
   FROM (
    SELECT b.id,b.status,b.frozen,b.deactivated,COALESCE(dl.limit_minor,v.limit_minor) limit_minor,
     ((SELECT COALESCE(sum(r.amount_minor),0) FROM wpay_auth.business_reservations r WHERE r.bank_id=b.id AND r.state='active' AND r.expires_at>CURRENT_TIMESTAMP)
      +(SELECT COALESCE(sum(f.amount_minor),0) FROM wpay_auth.business_financial_events f JOIN wpay_auth.business_reservations r ON r.id=f.reservation_id
        WHERE r.bank_id=b.id AND (f.created_at AT TIME ZONE 'Asia/Kolkata')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)) used_minor
    FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.accounts a ON a.id=b.owner_id
    JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version
    LEFT JOIN wpay_auth.upi_daily_limits dl ON dl.bank_id=b.id WHERE a.tenant_id=ANY($1)
   ) x`,[tenants])).rows[0];
  result.runningUpi=q.running;result.availableUpi=q.available;
  result.approvals.bank=(await c.query("SELECT count(*)::int count FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.accounts a ON a.id=b.owner_id WHERE a.tenant_id=ANY($1) AND b.status IN ('submitted','review') AND NOT b.deactivated",[tenants])).rows[0].count;
 }
 if(has('transactions.view')&&has('payout_operations.view')){
  const series=(await c.query(`SELECT to_char(happened AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS "day",kind,sum(amount_minor)::text amount FROM (
   SELECT g.paid_at happened,'payin' kind,g.amount_minor FROM wpay_auth.gateway_orders g JOIN wpay_auth.accounts a ON a.id=g.merchant_id
    WHERE a.tenant_id=ANY($1) AND g.state='successful' AND g.paid_at >= $2 AND g.paid_at <= $3
   UNION ALL
   SELECT p.completed_at,'payout',p.amount_minor FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts a ON a.id=p.merchant_id
    WHERE a.tenant_id=ANY($1) AND p.state='successful' AND p.completed_at >= $2 AND p.completed_at <= $3
    AND NOT EXISTS(SELECT 1 FROM wpay_auth.payout_disputes d JOIN wpay_auth.payout_dispute_resolutions r ON r.dispute_id=d.id WHERE d.payout_id=p.id AND r.outcome='payment_invalid')
   ) events GROUP BY "day",kind ORDER BY "day",kind`,[tenants,from,row.database_now])).rows;
  result.series=series;result.totalVolume=series.reduce((n,r)=>n+BigInt(r.amount),0n).toString();
  const today=(await c.query(`SELECT
   COALESCE(sum(g.amount_minor) FILTER(WHERE g.state='successful'),0)::text collection,
   count(*)::int total,count(*) FILTER(WHERE g.state='successful')::int successful
   FROM wpay_auth.gateway_orders g JOIN wpay_auth.accounts a ON a.id=g.merchant_id
   WHERE a.tenant_id=ANY($1) AND (g.created_at AT TIME ZONE 'Asia/Kolkata')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date`,[tenants])).rows[0];
  const payout=(await c.query(`SELECT COALESCE(sum(p.amount_minor),0)::text volume,count(*)::int successful
   FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts a ON a.id=p.merchant_id
   WHERE a.tenant_id=ANY($1) AND p.state='successful'
   AND (p.completed_at AT TIME ZONE 'Asia/Kolkata')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
   AND NOT EXISTS(SELECT 1 FROM wpay_auth.payout_disputes d JOIN wpay_auth.payout_dispute_resolutions r ON r.dispute_id=d.id WHERE d.payout_id=p.id AND r.outcome='payment_invalid')`,[tenants])).rows[0];
  result.todayCollection=today.collection;result.todayPayoutVolume=payout.volume;result.todayVolume=(BigInt(today.collection)+BigInt(payout.volume)).toString();
  result.successRate=today.total?today.successful/today.total:null;result.successfulPayouts=payout.successful;
  result.approvals.payout=(await c.query("SELECT count(*)::int n FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts a ON a.id=p.merchant_id WHERE a.tenant_id=ANY($1) AND p.state='pending_admin'",[tenants])).rows[0].n;
  result.approvals.dispute=(await c.query(`SELECT count(*)::int n FROM wpay_auth.payout_disputes d JOIN wpay_auth.accounts a ON a.id=d.merchant_id
   WHERE a.tenant_id=ANY($1) AND NOT EXISTS(SELECT 1 FROM wpay_auth.payout_dispute_resolutions r WHERE r.dispute_id=d.id)`,[tenants])).rows[0].n;
  result.approvals.late=(await c.query(`SELECT count(*)::int n FROM wpay_auth.late_payment_reviews l
   WHERE l.tenant_id=ANY($1) AND NOT EXISTS(SELECT 1 FROM wpay_auth.late_payment_resolutions r WHERE r.review_id=l.id)`,[tenants])).rows[0].n;
 }
 if(has('transactions.view')){
  const rows=(await c.query(`SELECT 'payin' AS type,g.reference,m.name merchant,u.name "user",g.amount_minor::text amount,
   g.state status,COALESCE(g.evidence_state,'unverified') evidence,COALESCE(g.paid_at,g.created_at) happened
   FROM wpay_auth.gateway_orders g JOIN wpay_auth.accounts m ON m.id=g.merchant_id
   LEFT JOIN wpay_auth.business_reservations br ON br.id=g.reservation_id LEFT JOIN wpay_auth.accounts u ON u.id=br.user_id
   WHERE m.tenant_id=ANY($1) ORDER BY COALESCE(g.paid_at,g.created_at) DESC,g.id LIMIT 6`,[tenants])).rows;
  result.recentActivity.push(...rows);
 }
 if(has('payout_operations.view')){
  const rows=(await c.query(`SELECT 'payout' AS type,p.reference,m.name merchant,u.name "user",p.amount_minor::text amount,
   CASE WHEN r.outcome='payment_invalid' THEN 'reversed' ELSE p.state END status,'payout_workflow' evidence,COALESCE(p.completed_at,p.created_at) happened
   FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts m ON m.id=p.merchant_id
   LEFT JOIN LATERAL(SELECT user_id FROM wpay_auth.payout_claims pc WHERE pc.payout_id=p.id ORDER BY pc.created_at DESC,pc.id LIMIT 1) lc ON true
   LEFT JOIN wpay_auth.accounts u ON u.id=lc.user_id
   LEFT JOIN wpay_auth.payout_disputes d ON d.payout_id=p.id LEFT JOIN wpay_auth.payout_dispute_resolutions r ON r.dispute_id=d.id
   WHERE m.tenant_id=ANY($1) ORDER BY COALESCE(p.completed_at,p.created_at) DESC,p.id LIMIT 6`,[tenants])).rows;
  result.recentActivity.push(...rows);
 }
 result.recentActivity.sort((a,b)=>+new Date(b.happened)-+new Date(a.happened));result.recentActivity=result.recentActivity.slice(0,6);
 if(has('payout_operations.view'))result.recentPayouts=(await c.query(`SELECT p.reference,a.name merchant,p.amount_minor::text amount,
   CASE WHEN r.outcome='payment_invalid' THEN 'reversed' ELSE p.state END state,(p.percentage_fee_minor+p.fixed_fee_minor)::text fee,p.created_at
   FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts a ON a.id=p.merchant_id
   LEFT JOIN wpay_auth.payout_disputes d ON d.payout_id=p.id LEFT JOIN wpay_auth.payout_dispute_resolutions r ON r.dispute_id=d.id
   WHERE a.tenant_id=ANY($1) ORDER BY p.created_at DESC,p.id LIMIT 5`,[tenants])).rows;
 for(const type of ['user','merchant'])if(has(type==='user'?'users.view':'merchants.view'))result.approvals[type]=(await c.query(`SELECT count(*)::int count FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.tenant_id=ANY($1) AND a.account_type=$2 AND a.status='active' AND e.approval_status='pending'`,[tenants,type])).rows[0].count;
 if(has('commission_withdrawal.view'))result.approvals.withdrawal=(await c.query("SELECT count(*)::int count FROM wpay_auth.commission_withdrawals w JOIN wpay_auth.accounts a ON a.id=w.user_id WHERE a.tenant_id=ANY($1) AND w.state IN ('requested','review')",[tenants])).rows[0].count;
 return result;
}
module.exports={overview};
