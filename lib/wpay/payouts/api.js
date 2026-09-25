"use strict";
const {authorize,canUsePermission}=require('../authorization-policy'),v=require('../business/validation'),{fields,fail,page,recent}=require('./validation'),ledger=require('../business/ledger'),a=require('./accounting'),banks=require('./banks');
const GET=['payout/summary','payout/queue','payout/orders','payout/jobs','payout/commission','payout/withdrawals','payout/holds','payout/capabilities','payout/merchant-usdt','payout/merchant-usdt-admin','payout/template'];
const POST=['payout/dispute/open','payout/dispute/respond','payout/dispute/resolve','payout/dispute/search','payout/approval/search','payout/approval/decide','payout/template','payout/merchant-usdt/search','payout/merchant-usdt/get','payout/create','payout/bulk','payout/bulk/validate','payout/get','payout/search','payout/claim','payout/release','payout/submit','payout/review','payout/resolve','payout/proof','payout/withdrawal/create','payout/withdrawal/get','payout/withdrawal/search','payout/withdrawal/transition','payout/hold/manage','payout/hold/search','payout/capability','payout/commission/search','payout/merchant-usdt/create','payout/merchant-usdt/transition'];
function permit(context,permission,resource={kind:'list'}){const r=authorize({...context,permissionId:permission,context:resource});if(!r.allowed)fail('FORBIDDEN');return r.constraints.where;}
async function target(client,id){const r=(await client.query('SELECT id,tenant_id,account_type,user_id,merchant_id FROM wpay_auth.accounts WHERE id=$1',[v.id(id)])).rows[0];if(!r)fail('FORBIDDEN');return r;}
function resource(r,kind='record'){return {kind,id:r.id,tenantId:r.tenant_id,ownerType:r.account_type,ownerId:r.user_id||r.merchant_id||r.id};}
function navigation(groups,context){
 const type=context.principal.type,items=type==='merchant'?[['orders','merchant.payout.view','INR Payouts'],['merchant-usdt','merchant.settlement.view','USDT Withdrawal']]:type==='user'?[['jobs','user.payout.view','INR Payout Jobs'],['commission','user.commission.view','Commission'],['withdrawals','user.commission_withdrawal.view','Commission Withdrawals']]:[['disputes','payout_operations.view','Post-approval Disputes'],['orders','payout_operations.view','Payout Review'],['withdrawals','commission_withdrawal.view','Commission Withdrawals'],['holds','commission_hold.view','Commission Holds'],['capabilities','payout_operations.view','Payout Bank Capabilities']];
 const children=items.filter(([id,permissionId])=>canUsePermission({...context,permissionId}).allowed).map(([id,permissionId,label])=>({id:'payout.page.'+id,destinationId:'payout.'+id,permissionId,label,routeStatus:'implemented',descriptorOnly:false,blockers:[]}));
 if(type!=='user'&&type!=='merchant'&&canUsePermission({...context,permissionId:'payout_operations.view'}).allowed)children.push({id:'payout.page.merchant-usdt-admin',destinationId:'payout.merchant-usdt-admin',permissionId:'payout_operations.view',label:'Merchant USDT Withdrawals',routeStatus:'implemented',descriptorOnly:false,blockers:[]});
 if(children.length)groups.push({id:'payout.group.operations',label:'Payouts & Commission',children});return groups;
}
function preparation(context,row,operation){const user=['payout/submit','payout/dispute/respond'].includes(operation);if(row.account_type!==(user?'user':'merchant'))fail('FORBIDDEN');permit(context,user?'user.payout.submit':operation==='payout/dispute/open'?'merchant.payout.review':'merchant.payout.create',resource(row,user||operation==='payout/dispute/open'?'record':'create'));recent(row);}
async function payoutScope(client,row,context,id,permission){
 const p=(await client.query('SELECT * FROM wpay_auth.payout_orders WHERE id=$1',[v.id(id)])).rows[0];if(!p)fail('FORBIDDEN');
 if(row.account_type==='merchant'){if(p.merchant_id!==row.id)fail('FORBIDDEN');permit(context,permission,resource(await target(client,row.id)));}
 else if(row.account_type==='user'){
  permit(context,permission,resource(await target(client,row.id)));
  if(!(await client.query("SELECT 1 FROM wpay_auth.payout_claims WHERE payout_id=$1 AND user_id=$2 AND (state IN('submitted','consumed','not_paid') OR (state='active' AND expires_at>CURRENT_TIMESTAMP))",[p.id,row.id])).rowCount)fail('FORBIDDEN');
 }else{
  permit(context,permission,resource(await target(client,p.merchant_id)));
  const owners=(await client.query('SELECT DISTINCT user_id FROM wpay_auth.payout_claims WHERE payout_id=$1',[p.id])).rows;for(const c of owners)permit(context,permission,resource(await target(client,c.user_id)));
 }return p;
}
async function withdrawalScope(client,row,context,id,permission){
 const w=(await client.query('SELECT * FROM wpay_auth.commission_withdrawals WHERE id=$1',[v.id(id)])).rows[0];if(!w||row.account_type==='merchant'||row.account_type==='user'&&w.user_id!==row.id)fail('FORBIDDEN');permit(context,permission,resource(await target(client,w.user_id)));return w;
}
async function run(core,client,row,context,operation,body,prepared){
 if(![...GET,...POST].includes(operation))fail('NOT_FOUND');const merchant=row.account_type==='merchant',user=row.account_type==='user',admin=!user&&!merchant;
 if(operation.startsWith('payout/dispute/')){
  const disputes=require('./disputes');
  if(operation==='payout/dispute/search'){
   const f=page(body),scope=permit(context,merchant?'merchant.payout.view':user?'user.payout.view':'payout_operations.view');
   const rows=(await client.query(`SELECT p.id,p.reference,p.amount_minor::text,d.reason,d.created_at,COALESCE(r.outcome,'pending') AS status FROM wpay_auth.payout_disputes d JOIN wpay_auth.payout_orders p ON p.id=d.payout_id JOIN wpay_auth.accounts m ON m.id=d.merchant_id JOIN wpay_auth.accounts u ON u.id=d.user_id LEFT JOIN wpay_auth.payout_dispute_resolutions r ON r.dispute_id=d.id WHERE ($1::uuid IS NULL OR d.merchant_id=$1) AND ($2::uuid IS NULL OR d.user_id=$2) AND ($3::text[] IS NULL OR (m.tenant_id=ANY($3) AND u.tenant_id=ANY($3))) AND ($4::text IS NULL OR COALESCE(r.outcome,'pending')=$4) ORDER BY d.created_at DESC,d.id LIMIT $5 OFFSET $6`,[merchant?row.id:null,user?row.id:null,admin?scope.tenantIds:null,f.state??null,f.limit+1,f.offset])).rows;
   return {orders:rows.slice(0,f.limit).map(r=>({...r,amountMinor:r.amount_minor})),hasMore:rows.length>f.limit,offset:f.offset};
  }
  const opening=operation.endsWith('/open'),responding=operation.endsWith('/respond');
  if(opening&&!merchant||responding&&!user||!opening&&!responding&&!admin)fail('FORBIDDEN');
  const p=await payoutScope(client,row,context,body.id,opening?'merchant.payout.review':responding?'user.payout.submit':'payout_operations.resolve');recent(row);
  return opening?disputes.open(core,client,p,row.id,body,prepared):responding?disputes.respond(core,client,p,row.id,body,prepared):disputes.resolve(core,client,p,row.id,body);
 }
 if(operation==='payout/approval/search'){
  if(!admin)fail('FORBIDDEN');const scope=permit(context,'payout_operations.view');fields(body,['offset','limit']);const filter=page(body);
  await core.expire(client);return require('./approval').list(client,scope.tenantIds,filter);
 }
 if(operation==='payout/approval/decide'){
  if(!admin)fail('FORBIDDEN');fields(body,['id','action','reason']);v.id(body.id);v.reason(body.reason);if(!['approve','reject'].includes(body.action))fail();recent(row);
  await ledger.lock(client);
  const orders=(await client.query('SELECT * FROM wpay_auth.payout_orders WHERE COALESCE(batch_id,id)=$1 ORDER BY id FOR UPDATE',[body.id])).rows;
  if(!orders.length)fail('FORBIDDEN');for(const p of orders)permit(context,'payout_operations.resolve',resource(await target(client,p.merchant_id)));
  return require('./approval').decide(core,client,orders,row.id,body.action,body.reason);
 }
 if(['payout/create','payout/bulk','payout/bulk/validate'].includes(operation)){preparation(context,row,operation);if(operation==='payout/create')return core.create(client,row.id,body);if(operation==='payout/bulk/validate')return core.validateBulk(client,row.id,prepared);return core.bulk(client,row.id,body,prepared);}
 if(operation==='payout/template'){if(!merchant)fail('FORBIDDEN');permit(context,'merchant.payout.view',resource(await target(client,row.id)));fields(body,['transferMode']);return require('./uploads').template(body.transferMode);}
 if(operation.startsWith('payout/merchant-usdt')){
  if(merchant){
   const create=operation.endsWith('/create'),change=operation.endsWith('/transition');
   permit(context,create?'merchant.settlement.create':'merchant.settlement.view',resource(await target(client,row.id),create?'create':'list'));
   if(create)return core.merchantSettlements.request(client,row.id,body);
   if(operation==='payout/merchant-usdt/search'){fields(body,['offset','limit']);return core.merchantSettlements.list(client,row.id,body);}
   if(operation==='payout/merchant-usdt/get'){v.exactFields(body,['id']);const request=await core.merchantSettlements.get(client,v.id(body.id));if(request.merchant_id!==row.id)fail('FORBIDDEN');return core.merchantSettlements.project(request,true);}
   if(change){recent(row);const request=await core.merchantSettlements.get(client,body.id);if(request.merchant_id!==row.id)fail('FORBIDDEN');return core.merchantSettlements.transition(client,request,row.id,body,true);}
   if(operation!=='payout/merchant-usdt')fail('NOT_FOUND');
   let summary;try{summary=await core.merchantSettlements.summary(client,row.id);}catch(error){if(error.code!=='MERCHANT_FX_UNCONFIGURED')throw error;return {enabled:false,status:'rate_not_configured',message:'Merchant USDT rate is not configured by Admin',requests:[],states:['rate_not_configured','requested','review','approved','processing','completed','rejected','cancelled'],creationDisabled:true};}
   const history=await core.merchantSettlements.list(client,row.id,{offset:0,limit:50});
   return {...summary,...history,states:['requested','review','approved','processing','completed','rejected','cancelled'],creationDisabled:false};
  }
  if(operation==='payout/merchant-usdt-admin'){
   const scope=permit(context,'payout_operations.view');
   const rows=(await client.query(`SELECT w.*,a.name AS merchant_name,a.tenant_id FROM wpay_auth.merchant_settlement_withdrawals w JOIN wpay_auth.accounts a ON a.id=w.merchant_id WHERE a.tenant_id=ANY($1) ORDER BY w.created_at DESC,w.id LIMIT 100`,[scope.tenantIds])).rows;
   return {requests:rows.map(r=>({...core.merchantSettlements.project(r),merchantId:r.merchant_id,merchantName:r.merchant_name,tenantId:r.tenant_id}))};
  }
  if(operation.endsWith('/transition')){
   recent(row);const request=await core.merchantSettlements.get(client,body.id),account=await target(client,request.merchant_id);
   permit(context,'payout_operations.resolve',resource(account));return core.merchantSettlements.transition(client,request,row.id,body,false);
  }
  fail('FORBIDDEN');
 }
 if(operation==='payout/summary'){
  if(merchant){permit(context,'merchant.payout.view');await core.expire(client);}
  if(merchant){
   permit(context,'merchant.payout.view');const b=await ledger.summary(client,row.id),states=(await client.query(`SELECT CASE WHEN r.outcome='payment_invalid' THEN 'reversed' ELSE p.state END AS state,count(*)::integer AS n FROM wpay_auth.payout_orders p LEFT JOIN wpay_auth.payout_disputes d ON d.payout_id=p.id LEFT JOIN wpay_auth.payout_dispute_resolutions r ON r.dispute_id=d.id WHERE p.merchant_id=$1 GROUP BY CASE WHEN r.outcome='payment_invalid' THEN 'reversed' ELSE p.state END`,[row.id])).rows,counts=Object.fromEntries(states.map(x=>[x.state,x.n]));
   let merchantUsdt;try{merchantUsdt=await core.merchantSettlements.summary(client,row.id);}catch(error){if(error.code!=='MERCHANT_FX_UNCONFIGURED')throw error;merchantUsdt={enabled:false,status:'rate_not_configured'};}
   return {available:b.merchantAvailable,reserved:b.merchantPayoutReserved,principal:b.merchantPayoutPrincipal,fees:b.payoutFees,held:b.merchantHeld,currency:'INR',providerConnected:false,orderCount:states.reduce((n,x)=>n+x.n,0),openCount:counts.open||0,counts,merchantUsdt};
  }
  if(user){permit(context,'user.commission.view');return a.entitlement(client,row.id);}fail('FORBIDDEN');
 }
 if(operation==='payout/queue'){if(!user)fail('FORBIDDEN');permit(context,'user.payout.view');return core.queue(client,row.id);}
 if(['payout/claim','payout/release'].includes(operation)){
  if(!user)fail('FORBIDDEN');permit(context,'user.payout.claim',resource(await target(client,row.id)));recent(row);
  if(operation==='payout/claim'){fields(body,['id','bankId']);return core.claim(client,row.id,body);}
  v.exactFields(body,['id']);const p=await payoutScope(client,row,context,body.id,'user.payout.claim');return core.release(client,p,row.id);
 }
 if(['payout/get','payout/proof','payout/submit','payout/review','payout/resolve'].includes(operation)){
  const permission=merchant?(operation==='payout/review'?'merchant.payout.review':'merchant.payout.view'):user?(operation==='payout/submit'?'user.payout.submit':'user.payout.view'):operation==='payout/resolve'?'payout_operations.resolve':'payout_operations.view';
  const p=await payoutScope(client,row,context,body.id,permission);
  if(operation==='payout/get'){v.exactFields(body,['id']);const detail=await core.detail(client,p,merchant?'merchant':user?'user':'admin');if(admin&&detail.dispute)detail.dispute.downloadAllowed=canUsePermission({...context,permissionId:'payout_operations.proof'}).allowed;if(admin&&detail.proof)detail.proof.downloadAllowed=canUsePermission({...context,permissionId:'payout_operations.proof'}).allowed;return detail;}
  if(operation==='payout/proof'){if(merchant)fail('FORBIDDEN');if(admin){await payoutScope(client,row,context,body.id,'payout_operations.proof');recent(row);}v.exactFields(body,['id','proofId']);if(user&&!(await client.query('SELECT 1 FROM wpay_auth.payout_proofs WHERE id=$1 AND payout_id=$2 AND owner_id=$3',[body.proofId,p.id,row.id])).rowCount)fail('FORBIDDEN');return core.download(client,p,body.proofId,row.id);}
  recent(row);
  if(operation==='payout/submit'){if(!user)fail('FORBIDDEN');return core.submit(client,p,row.id,body,prepared);}
  v.exactFields(body,['id','action','reason']);v.reason(body.reason);
  if(operation==='payout/review'){
   if(!merchant)fail('FORBIDDEN');if(body.action==='cancel')return core.cancel(client,p,row.id);if(body.action==='reject')return core.reject(client,p,row.id,body.reason);if(body.action==='approve')return core.settle(client,p,row.id,body.reason,false);
  }else{if(!admin)fail('FORBIDDEN');if(body.action==='paid')return core.settle(client,p,row.id,body.reason,true);if(body.action==='not_paid')return core.notPaid(client,p,row.id,body.reason);}fail();
 }
 if(['payout/orders','payout/jobs','payout/search'].includes(operation)){
  const filter=page(body),permission=merchant?'merchant.payout.view':user?'user.payout.view':'payout_operations.view',scope=permit(context,permission);
  await core.expire(client);
  const rows=(await client.query(`SELECT p.*,dr.outcome AS dispute_outcome,c.created_at AS claimed_at,c.expires_at AS claim_expires_at,s.created_at AS submitted_at FROM wpay_auth.payout_orders p JOIN wpay_auth.accounts m ON m.id=p.merchant_id LEFT JOIN LATERAL(SELECT * FROM wpay_auth.payout_claims c WHERE c.payout_id=p.id ORDER BY c.created_at DESC,c.id LIMIT 1)c ON true LEFT JOIN wpay_auth.payout_submissions s ON s.payout_id=p.id LEFT JOIN wpay_auth.payout_disputes pd ON pd.payout_id=p.id LEFT JOIN wpay_auth.payout_dispute_resolutions dr ON dr.dispute_id=pd.id
   WHERE ($1::uuid IS NULL OR p.merchant_id=$1) AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM wpay_auth.payout_claims j WHERE j.payout_id=p.id AND j.user_id=$2))
   AND ($3::text[] IS NULL OR (m.tenant_id=ANY($3) AND NOT EXISTS(SELECT 1 FROM wpay_auth.payout_claims j JOIN wpay_auth.accounts u ON u.id=j.user_id WHERE j.payout_id=p.id AND NOT(u.tenant_id=ANY($3))))) AND ($4::text IS NULL OR CASE WHEN dr.outcome='payment_invalid' THEN 'reversed' ELSE p.state END=$4) AND ($5::text IS NULL OR p.reference=$5)
   ORDER BY p.created_at DESC,p.id LIMIT $6 OFFSET $7`,[merchant?row.id:null,user?row.id:null,admin?scope.tenantIds:null,filter.state??null,filter.reference??null,filter.limit+1,filter.offset])).rows;
  return {orders:rows.slice(0,filter.limit).map(r=>{const out=core.project(r);if(r.dispute_outcome==='payment_invalid')out.status='reversed';if(user){delete out.percentageFeeMinor;delete out.fixedFeeMinor;delete out.fixedFeeCurrency;delete out.reserveMinor;}return out;}),hasMore:rows.length>filter.limit,offset:filter.offset};
 }
 if(['payout/commission','payout/commission/search'].includes(operation)){
  if(!user)fail('FORBIDDEN');permit(context,'user.commission.view');const filter=page(body),balance=await a.entitlement(client,row.id);
  const entries=(await client.query(`SELECT e.id,e.ledger_type,e.direction,e.amount_minor::text,j.reference_type,j.reference_id,j.created_at FROM wpay_auth.business_entries e JOIN wpay_auth.business_journals j ON j.id=e.journal_id WHERE e.owner_id=$1 AND e.currency='INR' AND e.ledger_type=ANY($2) AND ($3::text IS NULL OR j.reference_id=$3) ORDER BY j.created_at DESC,e.id LIMIT $4 OFFSET $5`,[row.id,['user_commission','user_payout_commission','user_commission_adjustment','user_commission_hold','user_commission_reserved','user_commission_withdrawn'],filter.reference??null,filter.limit+1,filter.offset])).rows;
  return {balance,entries:entries.slice(0,filter.limit),hasMore:entries.length>filter.limit,offset:filter.offset};
 }
 if(operation==='payout/withdrawal/create'){if(!user)fail('FORBIDDEN');permit(context,'user.commission_withdrawal.create',resource(await target(client,row.id),'create'));recent(row);return core.withdrawals.request(client,row.id,body);}
 if(['payout/withdrawal/get','payout/withdrawal/transition'].includes(operation)){
  const change=operation.endsWith('/transition'),permission=user?(change?'user.commission_withdrawal.cancel':'user.commission_withdrawal.view'):change?'commission_withdrawal.approve':'commission_withdrawal.view';
  const w=await withdrawalScope(client,row,context,body.id,permission);
  if(change){recent(row);return core.withdrawals.transition(client,w,row.id,body,user);}v.exactFields(body,['id']);return {...core.withdrawals.project(w,true),audit:(await client.query('SELECT actor_id,kind,state,reason,created_at FROM wpay_auth.payout_events WHERE resource_id=$1 ORDER BY created_at DESC,id LIMIT 100',[w.id])).rows};
 }
 if(['payout/withdrawals','payout/withdrawal/search'].includes(operation)){
  if(merchant)fail('FORBIDDEN');const scope=permit(context,user?'user.commission_withdrawal.view':'commission_withdrawal.view'),f=page(body);
  const rows=(await client.query(`SELECT w.*,(SELECT pe.reason FROM wpay_auth.payout_events pe WHERE pe.resource_id=w.id ORDER BY pe.created_at DESC,pe.id DESC LIMIT 1) AS latest_reason FROM wpay_auth.commission_withdrawals w JOIN wpay_auth.accounts u ON u.id=w.user_id WHERE ($1::uuid IS NULL OR w.user_id=$1) AND ($2::text[] IS NULL OR u.tenant_id=ANY($2)) AND ($3::text IS NULL OR w.state=$3) AND ($4::text IS NULL OR w.currency=$4) ORDER BY w.created_at DESC,w.id LIMIT $5 OFFSET $6`,[user?row.id:null,admin?scope.tenantIds:null,f.state??null,f.currency??null,f.limit+1,f.offset])).rows;
  return {withdrawals:rows.slice(0,f.limit).map(r=>({...core.withdrawals.project(r),...(admin?{userId:r.user_id}:{})})),hasMore:rows.length>f.limit,offset:f.offset};
 }
 if(operation==='payout/hold/manage'){
  if(!admin)fail('FORBIDDEN');const account=await target(client,body.userId);if(account.account_type!=='user')fail('FORBIDDEN');permit(context,'commission_hold.manage',resource(account));recent(row);return core.withdrawals.hold(client,row.id,body);
 }
 if(['payout/holds','payout/hold/search'].includes(operation)){
  if(merchant)fail('FORBIDDEN');const scope=permit(context,user?'user.commission.view':'commission_hold.view'),f=page(body);
  const rows=(await client.query(`SELECT h.id,h.user_id,h.amount_minor::text,h.reference,h.reason,h.created_at,h.released_at FROM wpay_auth.commission_holds h JOIN wpay_auth.accounts u ON u.id=h.user_id WHERE ($1::uuid IS NULL OR h.user_id=$1) AND ($2::text[] IS NULL OR u.tenant_id=ANY($2)) AND ($3::text IS NULL OR h.reference=$3) ORDER BY h.created_at DESC,h.id LIMIT $4 OFFSET $5`,[user?row.id:null,admin?scope.tenantIds:null,f.reference??null,f.limit+1,f.offset])).rows;return {domain:'User commission hold',holds:rows.slice(0,f.limit),hasMore:rows.length>f.limit,offset:f.offset};
 }
 if(operation==='payout/capability'){
  if(!admin)fail('FORBIDDEN');const b=await core.gateway.core.bankRecord(client,body.bankId);if(!b)fail('FORBIDDEN');permit(context,'payout_operations.capability',resource(await target(client,b.owner_id)));recent(row);return banks.capability(client,row.id,body);
 }
 if(operation==='payout/capabilities'){
  if(merchant)fail('FORBIDDEN');const scope=permit(context,user?'user.payout.view':'payout_operations.view');
  return {banks:(await client.query(`SELECT b.id,b.owner_id,b.version,b.status,b.frozen,b.deactivated,b.approved_version,b.verified_version,EXISTS(SELECT 1 FROM wpay_auth.payout_capabilities c WHERE c.bank_id=b.id AND c.bank_version=b.version AND c.revoked_at IS NULL) AS payout_capable FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.accounts u ON u.id=b.owner_id WHERE ($1::uuid IS NULL OR b.owner_id=$1) AND ($2::text[] IS NULL OR u.tenant_id=ANY($2)) ORDER BY b.created_at DESC,b.id LIMIT 100`,[user?row.id:null,admin?scope.tenantIds:null])).rows};
 }
 fail('NOT_FOUND');
}
module.exports={GET,POST,run,navigation,preparation};
