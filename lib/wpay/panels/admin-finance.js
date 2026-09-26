'use strict';
const {randomUUID}=require('node:crypto'),{permit,recent,fail}=require('../operations/access'),{canUsePermission}=require('../authorization-policy');
const v=require('../auth/runtime/validation'),money=require('../business/money'),ledger=require('../business/ledger');
function period(row,b){
 const now=+new Date(row.database_now),to=b.to?Date.parse(b.to):now,from=b.from?Date.parse(b.from):to-60*86400000;
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>62*86400000||to>now+86400000)fail('INVALID_INPUT');return [new Date(from),new Date(to)];
}
function margin(fees,costs){const n=k=>BigInt(fees[k]||'0');return (n('merchant_platform_fee')+n('merchant_payout_fee')-n('user_commission')-n('user_payout_commission')-BigInt(costs)).toString();}
async function run(c,row,context,operation,b){
 if(!['admin','super_admin'].includes(row.account_type))fail();
 const scope=permit(context,operation==='panel/admin-audit'?'settings.view':'reports.view'),tenants=scope.tenantIds;
 if(!Array.isArray(tenants)||!tenants.length)fail();
 if(operation==='panel/expense/create'){
  v.exactFields(b,['requestId','tenantId','category','payee','amountMinor','occurredAt','description']);recent(row);
  permit(context,'finance_expenses.manage',{kind:'record',id:row.id,tenantId:b.tenantId,ownerType:'principal',ownerId:row.id});
  if(!tenants.includes(b.tenantId)||!['salary','server','maintenance','other'].includes(b.category))fail('INVALID_INPUT');
  require('../business/validation').id(b.requestId);const amount=money.minor(b.amountMinor).toString(),payee=v.name(b.payee);
  if(typeof b.description!=='string'||b.description.trim().length<2||b.description.length>500)fail('INVALID_INPUT');
  const at=Date.parse(b.occurredAt);if(!Number.isFinite(at)||at>+new Date(row.database_now)+86400000)fail('INVALID_INPUT');
  await ledger.lock(c);
  const prior=(await c.query('SELECT * FROM wpay_auth.admin_expenses WHERE actor_id=$1 AND request_id=$2',[row.id,b.requestId])).rows[0];
  if(prior){if(prior.tenant_id!==b.tenantId||prior.category!==b.category||prior.payee!==payee||prior.amount_minor!==amount||+prior.occurred_at!==at||prior.description!==b.description.trim())fail('CONFLICT');return {id:prior.id};}
  const id=randomUUID();await c.query('INSERT INTO wpay_auth.admin_expenses(id,tenant_id,actor_id,request_id,category,payee,amount_minor,occurred_at,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,b.tenantId,row.id,b.requestId,b.category,payee,amount,new Date(at),b.description.trim()]);
  await ledger.audit(c,{actorId:row.id,ownerId:row.id,entityId:id,event:'admin_expense_recorded',metadata:{category:b.category,amountMinor:amount}});return {id};
 }
 if(operation==='panel/expense/void'){
  v.exactFields(b,['id','reason']);recent(row);require('../business/validation').id(b.id);
  if(typeof b.reason!=='string'||b.reason.trim().length<2||b.reason.length>500)fail('INVALID_INPUT');
  const e=(await c.query('SELECT * FROM wpay_auth.admin_expenses WHERE id=$1 AND tenant_id=ANY($2)',[b.id,tenants])).rows[0];if(!e)fail();
  permit(context,'finance_expenses.manage',{kind:'record',id:e.id,tenantId:e.tenant_id,ownerType:'principal',ownerId:row.id});
  await c.query('INSERT INTO wpay_auth.admin_expense_voids(expense_id,actor_id,reason) VALUES($1,$2,$3) ON CONFLICT(expense_id) DO NOTHING',[b.id,row.id,b.reason.trim()]);return {voided:true};
 }
 if(Object.keys(b).some(k=>!['from','to','offset'].includes(k)))fail('INVALID_INPUT');
 const [from,to]=period(row,b),offset=b.offset??0;if(!Number.isInteger(offset)||offset<0||offset>100000)fail('INVALID_INPUT');
 if(operation==='panel/admin-audit'){
  const rows=(await c.query(`SELECT * FROM (
   SELECT x.id,x.created_at,x.actor_id,x.account_id target_id,x.event action,'security' source FROM wpay_auth.security_audit x JOIN wpay_auth.accounts a ON a.id=COALESCE(x.account_id,x.actor_id) WHERE a.tenant_id=ANY($1)
   UNION ALL SELECT x.id,x.created_at,x.actor_id,x.target_id,x.action,'panel' FROM wpay_auth.panel_audit x JOIN wpay_auth.accounts a ON a.id=x.actor_id WHERE a.tenant_id=ANY($1)
   UNION ALL SELECT x.id,x.created_at,x.actor_id,x.owner_id,x.event,'business' FROM wpay_auth.business_audit x JOIN wpay_auth.accounts a ON a.id=COALESCE(x.owner_id,x.actor_id) WHERE a.tenant_id=ANY($1)
  ) events WHERE created_at>=$2 AND created_at<$3 ORDER BY created_at DESC,id LIMIT 51 OFFSET $4`,[tenants,from,to,offset])).rows;
  return {rows:rows.slice(0,50),hasMore:rows.length>50,from,to};
 }
 const rows=(await c.query(`SELECT a.id,a.name,a.account_type,e.ledger_type,COALESCE(sum(CASE WHEN e.direction='credit' THEN e.amount_minor ELSE -e.amount_minor END),0)::text amount
 FROM wpay_auth.business_entries e JOIN wpay_auth.business_journals j ON j.id=e.journal_id JOIN wpay_auth.accounts a ON a.id=e.owner_id
 WHERE a.tenant_id=ANY($1) AND e.currency='INR' AND j.created_at>=$2 AND j.created_at<$3 AND e.ledger_type=ANY($4)
 GROUP BY a.id,e.ledger_type ORDER BY a.name,a.id,e.ledger_type`,[tenants,from,to,['merchant_platform_fee','merchant_payout_fee','user_commission','user_payout_commission','merchant_gross','merchant_payout_principal','capacity_consumed']])).rows;
 const fees={};for(const r of rows)fees[r.ledger_type]=(BigInt(fees[r.ledger_type]||'0')+BigInt(r.amount)).toString();
 const expenseTotals=(await c.query(`SELECT category,sum(amount_minor)::text amount FROM wpay_auth.admin_expenses e WHERE tenant_id=ANY($1) AND occurred_at>=$2 AND occurred_at<$3 AND NOT EXISTS(SELECT 1 FROM wpay_auth.admin_expense_voids v WHERE v.expense_id=e.id) GROUP BY category`,[tenants,from,to])).rows;
 const expenses=(await c.query(`SELECT e.*,v.reason void_reason FROM wpay_auth.admin_expenses e LEFT JOIN wpay_auth.admin_expense_voids v ON v.expense_id=e.id WHERE e.tenant_id=ANY($1) AND e.occurred_at>=$2 AND e.occurred_at<$3 ORDER BY e.occurred_at DESC,e.id LIMIT 51 OFFSET $4`,[tenants,from,to,offset])).rows;
 const payout=(await c.query(`SELECT COALESCE(sum(fixed),0)::text fixed,COALESCE(sum(percentage),0)::text percentage,COALESCE(sum(n),0)::int count FROM (
 SELECT p.fixed_fee_minor fixed,p.percentage_fee_minor percentage,1 n FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts a ON a.id=p.merchant_id WHERE a.tenant_id=ANY($1) AND p.state='successful' AND p.completed_at>=$2 AND p.completed_at<$3
 UNION ALL SELECT -p.fixed_fee_minor,-p.percentage_fee_minor,-1 FROM wpay_auth.payout_dispute_resolutions r JOIN wpay_auth.payout_disputes d ON d.id=r.dispute_id JOIN wpay_auth.payout_orders p ON p.id=d.payout_id JOIN wpay_auth.accounts a ON a.id=p.merchant_id WHERE a.tenant_id=ANY($1) AND r.outcome='payment_invalid' AND r.created_at>=$2 AND r.created_at<$3
 ) net`,[tenants,from,to])).rows[0];
 const funding=(await c.query(`SELECT COALESCE(sum(t.amount_minor),0)::text usdt,COALESCE(sum(f.credit_minor),0)::text inr FROM wpay_auth.funding_requests f JOIN wpay_auth.funding_transfers t ON t.request_id=f.id WHERE f.tenant_id=ANY($1) AND f.state='confirmed' AND f.updated_at>=$2 AND f.updated_at<$3`,[tenants,from,to])).rows[0];
 const settlement=(await c.query(`SELECT COALESCE(sum(s.usdt_minor),0)::text usdt,COALESCE(sum(s.inr_minor),0)::text inr FROM wpay_auth.merchant_settlement_withdrawals s JOIN wpay_auth.accounts a ON a.id=s.merchant_id WHERE a.tenant_id=ANY($1) AND s.state='completed' AND s.completed_at>=$2 AND s.completed_at<$3`,[tenants,from,to])).rows[0];
 const totalCosts=expenseTotals.reduce((sum,r)=>sum+BigInt(r.amount),0n).toString();
 const commissionSummary=(await c.query(`SELECT a.id,a.name,
   COALESCE(sum(CASE WHEN e.ledger_type='user_commission' AND e.direction='credit' THEN e.amount_minor WHEN e.ledger_type='user_commission' AND e.direction='debit' THEN -e.amount_minor ELSE 0 END),0)::text AS payin,
   COALESCE(sum(CASE WHEN e.ledger_type='user_payout_commission' AND e.direction='credit' THEN e.amount_minor WHEN e.ledger_type='user_payout_commission' AND e.direction='debit' THEN -e.amount_minor ELSE 0 END),0)::text AS payout,
   COALESCE(sum(CASE WHEN e.ledger_type='user_commission_hold' AND e.direction='credit' THEN e.amount_minor WHEN e.ledger_type='user_commission_hold' AND e.direction='debit' THEN -e.amount_minor ELSE 0 END),0)::text AS held,
   COALESCE(sum(CASE WHEN e.ledger_type='user_commission_withdrawn' AND e.direction='credit' THEN e.amount_minor WHEN e.ledger_type='user_commission_withdrawn' AND e.direction='debit' THEN -e.amount_minor ELSE 0 END),0)::text AS withdrawn,
   (SELECT cv.settings FROM wpay_auth.commercial_versions cv WHERE cv.account_id=a.id AND cv.effective_at<=CURRENT_TIMESTAMP ORDER BY cv.version DESC LIMIT 1) AS settings
   FROM wpay_auth.accounts a LEFT JOIN wpay_auth.business_entries e ON e.owner_id=a.id AND e.currency='INR' AND e.ledger_type=ANY($2)
   WHERE a.tenant_id=ANY($1) AND a.account_type='user'
   GROUP BY a.id,a.name ORDER BY a.name,a.id`,[tenants,['user_commission','user_payout_commission','user_commission_hold','user_commission_withdrawn']])).rows.map(r=>{const gross=BigInt(r.payin)+BigInt(r.payout),available=gross-BigInt(r.held)-BigInt(r.withdrawn);return {...r,gross:gross.toString(),available:(available>0n?available:0n).toString()};});
 return {from,to,rows,fees,payout,funding,settlement,expenseTotals,totalCosts,operatingMargin:margin(fees,totalCosts),expenses:expenses.slice(0,50),hasMore:expenses.length>50,tenants,canManage:canUsePermission({...context,permissionId:'finance_expenses.manage'}).allowed,fxProfit:null,commissionSummary};
}
module.exports={run,margin,period};
