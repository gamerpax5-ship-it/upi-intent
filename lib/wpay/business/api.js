"use strict";
const {recentAuthenticationAt}=require('../auth/runtime/session-assurance');
const {AuthError}=require('../auth/runtime/errors'),{authorize,canUsePermission}=require('../authorization-policy');
const {BusinessCore}=require('./core'),ledger=require('./ledger'),v=require('./validation'),routing=require('./routing');
const adminUpi=require('./admin-upi');
const GET=[...adminUpi.GET,'business/summary','business/user-dashboard','business/user-access','business/banks','business/assignments','business/routing','business/ledger','business/holds'];
const EXTRA_POST=['business/upi-analytics'];
const POST=[...adminUpi.POST,...EXTRA_POST,'business/user-access/update','business/banks/daily-limit','business/banks/save','business/banks/transition','business/banks/review','business/assignments/update','business/reservations/reserve','business/reservations/release','business/ledger/search','business/ledger/adjust','business/holds/update'];
function permit(context,permissionId,resource={kind:'list'}){const result=authorize({...context,permissionId,context:resource});if(!result.allowed)throw new AuthError('FORBIDDEN');return result.constraints.where;}
function recent(row){if(+new Date(row.database_now)-+new Date(recentAuthenticationAt(row))>300000)throw new AuthError('RECENT_MFA_REQUIRED');}
async function target(client,id){const row=(await client.query('SELECT id,tenant_id,account_type,user_id,merchant_id FROM wpay_auth.accounts WHERE id=$1',[v.id(id)])).rows[0];if(!row)throw new AuthError('FORBIDDEN');return row;}
function resource(account,id=account.id,bankId){return {kind:'record',id,tenantId:account.tenant_id,ownerType:account.account_type==='user'?'user':account.account_type==='merchant'?'merchant':'principal',ownerId:account.user_id||account.merchant_id||account.id,...(bankId?{accountId:bankId,accountOwnerId:account.user_id,accountTenantId:account.tenant_id}:{})};}
function businessNavigation(groups,context){
 if(canUsePermission({...context,permissionId:'assignments.view'}).allowed){let group=groups.find(g=>g.id==='administration.group.merchants');if(!group){group={id:'administration.group.merchants',children:[],label:'Merchants'};groups.push(group);}group.children.push({id:'administration.page.business-assignments',destinationId:'administration.business-assignments',permissionId:'assignments.view',label:'User Assignment',routeStatus:'implemented',descriptorOnly:false,blockers:[]});}
 if(['admin','super_admin'].includes(context.principal.type)&&canUsePermission({...context,permissionId:'bank_upi.view'}).allowed)groups.push({id:'administration.group.upi',label:'UPI',children:[{id:'administration.page.admin-upi',destinationId:'administration.admin-upi',permissionId:'bank_upi.view',label:'UPI Directory & Routing',routeStatus:'implemented',descriptorOnly:false,blockers:[]}]});
 if(['admin','super_admin'].includes(context.principal.type)&&canUsePermission({...context,permissionId:'users.commercial.update'}).allowed){let group=groups.find(g=>g.id==='administration.group.users');if(!group){group={id:'administration.group.users',children:[],label:'Users'};groups.push(group);}group.children.push({id:'administration.page.user-access',destinationId:'administration.user-access',permissionId:'users.commercial.update',label:'User Collection Access',routeStatus:'implemented',descriptorOnly:false,blockers:[]});}
 return groups;
}
class BusinessApi {
 constructor(){this.core=new BusinessCore();} // No live verification or confirmation provider.
 async ownerScope(client,row,context,permission){if(['user','merchant'].includes(row.account_type)){permit(context,permission);return {ids:[row.id],tenants:null};}return {ids:null,tenants:permit(context,permission).tenantIds};}
 async run(client,row,context,operation,body){
  if(![...GET,...POST].includes(operation))throw new AuthError('NOT_FOUND');
  if([...adminUpi.GET,...adminUpi.POST].includes(operation))return adminUpi.run(this.core,client,row,context,operation,body);
  if(POST.includes(operation)&&operation!=='business/ledger/search')recent(row);
  const isUser=row.account_type==='user',isMerchant=row.account_type==='merchant',admin=!isUser&&!isMerchant;
  if(operation==='business/user-dashboard'){if(!isUser)throw new AuthError('FORBIDDEN');permit(context,'user.overview.view');return require('./user-dashboard').overview(client,row.id);}
  if(['business/user-access','business/user-access/update'].includes(operation)){
   if(!['admin','super_admin'].includes(row.account_type))throw new AuthError('FORBIDDEN');
   if(!canUsePermission({...context,permissionId:'users.commercial.update'}).allowed)throw new AuthError('FORBIDDEN');
   const scope=permit(context,'users.view');
   if(operation.endsWith('/update')){const user=await target(client,body.userId);if(user.account_type!=='user')throw new AuthError('FORBIDDEN');permit(context,'users.commercial.update',resource(user));return require('./collection-policy').setAccess(client,row.id,body);}
   const users=(await client.query("SELECT a.id,a.name,COALESCE(p.free_setup,false) AS free_setup,COALESCE(p.unlimited_collection,false) AS unlimited_collection,p.reason FROM wpay_auth.accounts a LEFT JOIN wpay_auth.user_collection_permissions p ON p.user_id=a.id WHERE a.tenant_id=ANY($1) AND a.account_type='user' ORDER BY a.name,a.id LIMIT 200",[scope.tenantIds])).rows;
   for(const user of users)user.available_minor=(await ledger.summary(client,user.id)).available;
   return {users};
  }
  if(operation==='business/banks/daily-limit'){
   if(!isUser)throw new AuthError('FORBIDDEN');const bank=await this.core.bankRecord(client,body.bankId);if(!bank||bank.owner_id!==row.id)throw new AuthError('FORBIDDEN');permit(context,'user.bank_upi.update',resource(await target(client,row.id),bank.id,bank.id));return require('./collection-policy').setLimit(client,row.id,body);
  }
  if(operation==='business/summary'){
   if(admin){permit(context,'overview.view');return {currency:'INR',administrative:true,financialOperationsEnabled:false};}
   permit(context,isUser?'user.overview.view':'merchant.overview.view');const b=await ledger.summary(client,row.id);
   if(isUser)return {signedAvailable:b.signedAvailable,deficit:b.deficit,reconciliation:(await client.query('SELECT reason,reference,signed_remaining,deficit_minor,created_at FROM wpay_auth.business_reconciliation WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 10',[row.id])).rows,currency:b.currency,allocated:b.allocated,reserved:b.reserved,consumed:b.consumed,held:b.held,available:b.available,commission:b.commission,financialOperationsEnabled:false};
   const candidates=await this.core.candidates(client,row.id),byUser=new Map();
   for(const c of candidates)if(routing.eligibility(c,c.minMinor,c.databaseNow).eligible){const possible=[BigInt(c.availableMinor),BigInt(c.bankRemainingMinor),BigInt(c.maxMinor)].reduce((a,b)=>a<b?a:b);const previous=byUser.get(c.userId)||0n;if(possible>previous)byUser.set(c.userId,possible);}
   return {currency:b.currency,gross:b.gross,fees:b.fees,payoutFees:b.payoutFees,held:b.merchantHeld,available:b.merchantAvailable,routingAvailable:byUser.size>0,routingCapacity:[...byUser.values()].reduce((a,b)=>a+b,0n).toString(),financialOperationsEnabled:false};
  }
  if(operation==='business/banks'){
   if(isMerchant)throw new AuthError('FORBIDDEN');const scope=await this.ownerScope(client,row,context,isUser?'user.bank_upi.view':'bank_upi.view');
   const rows=(await client.query(`SELECT b.id,b.owner_id,b.version,b.status,b.frozen,b.deactivated,b.reason,b.approved_version,b.verified_version,v.details,b.created_at,COALESCE((SELECT limit_minor::text FROM wpay_auth.upi_daily_limits dl WHERE dl.bank_id=b.id),v.limit_minor::text) AS daily_limit_minor,
    (SELECT jsonb_build_object('id',s.id,'status',s.status,'createdAt',s.created_at,'version',s.bank_version,'parserDigest',s.parser_digest,'fileDigest',s.file_digest,'creditCount',s.credit_count) FROM wpay_auth.bank_statement_imports s WHERE s.owner_id=b.owner_id AND s.bank_id=b.id AND s.bank_version=b.version ORDER BY s.created_at DESC,s.id LIMIT 1) AS statement,
    EXISTS(SELECT 1 FROM wpay_auth.bank_statement_imports s WHERE s.owner_id=b.owner_id AND s.bank_id=b.id AND s.bank_version=b.version AND s.status='accepted') AS statement_accepted,
    (SELECT jsonb_build_object('id',c.id,'status',c.status,'source',c.evidence_source,'digest',c.evidence_digest,'synthetic',c.synthetic) FROM wpay_auth.upi_verification_challenges c WHERE c.bank_id=b.id AND c.owner_id=b.owner_id AND c.bank_version=b.version ORDER BY c.created_at DESC,c.id LIMIT 1) AS verification
    FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.accounts a ON a.id=b.owner_id JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version
    WHERE ($1::uuid[] IS NULL OR b.owner_id=ANY($1)) AND ($2::text[] IS NULL OR a.tenant_id=ANY($2)) ORDER BY b.created_at DESC,b.id LIMIT 100`,[scope.ids,scope.tenants])).rows;
   const allowed=admin?['review','approve','reject','freeze','release'].filter(action=>canUsePermission({...context,permissionId:'bank_upi.'+action}).allowed):[['create','user.bank_upi.submit'],['update','user.bank_upi.update']].filter(([,permissionId])=>canUsePermission({...context,permissionId}).allowed).map(([action])=>action);
   if(admin&&allowed.includes('freeze'))allowed.push('stop');
   return {banks:rows,actions:allowed,verificationConnected:false,statementRequired:(await client.query('SELECT statement_required FROM wpay_auth.bank_onboarding_policy')).rows[0].statement_required};
  }
  if(operation==='business/banks/save'){
   v.exactFields(body,['bankId','version','details']);if(!isUser)throw new AuthError('FORBIDDEN');
   const own=await target(client,row.id);if(body.bankId){const bank=await this.core.bankRecord(client,body.bankId);if(!bank||bank.owner_id!==row.id)throw new AuthError('FORBIDDEN');permit(context,'user.bank_upi.update',resource(own,bank.id,bank.id));}
   else {permit(context,'user.bank_upi.submit',{...resource(own),kind:'create'});await require('./collection-policy').setup(client,row.id);}
   return this.core.saveBank(client,row.id,body);
  }
  if(['business/banks/transition','business/banks/review'].includes(operation)){
   v.exactFields(body,['bankId','version','action','reason']);const bank=await this.core.bankRecord(client,body.bankId);if(!bank)throw new AuthError('FORBIDDEN');const owner=await target(client,bank.owner_id);
   if(operation==='business/banks/transition'){
    if(!isUser||bank.owner_id!==row.id||!['submit','request_verification','enable','run','stop','freeze','deactivate'].includes(body.action))throw new AuthError('FORBIDDEN');permit(context,'user.bank_upi.update',resource(owner,bank.id,bank.id));
   }else {if(!admin||!['review','approve','reject','freeze','release_freeze','stop'].includes(body.action))throw new AuthError('FORBIDDEN');permit(context,'bank_upi.'+(body.action==='release_freeze'?'release':body.action==='stop'?'freeze':body.action),resource(owner,bank.id,bank.id));}
   return this.core.transitionBank(client,bank.id,body.version,body.action,row.id,{ownerId:isUser?row.id:null,reason:v.reason(body.reason)});
  }
  if(operation==='business/assignments'){
   if(!admin)throw new AuthError('FORBIDDEN');const tenants=permit(context,'assignments.view').tenantIds;
   const accounts=(await client.query("SELECT a.id,a.name,a.account_type,e.approval_status FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.tenant_id=ANY($1) AND a.account_type IN('user','merchant') AND a.status='active' AND e.approval_status='approved' ORDER BY a.account_type,a.name,a.id LIMIT 200",[tenants])).rows;
   const assignments=(await client.query(`SELECT x.* FROM wpay_auth.business_assignments x JOIN wpay_auth.accounts u ON u.id=x.user_id JOIN wpay_auth.accounts m ON m.id=x.merchant_id
    WHERE x.bank_id IS NULL AND u.tenant_id=ANY($1) AND m.tenant_id=ANY($1) ORDER BY x.created_at DESC,x.id LIMIT 100`,[tenants])).rows;
   const capacity={};for(const a of accounts)if(a.account_type==='user')capacity[a.id]=await ledger.summary(client,a.id);
   return {accounts,assignments,capacity,canUpdate:canUsePermission({...context,permissionId:'assignments.update'}).allowed};
  }
  if(operation==='business/assignments/update'){
   if(!admin)throw new AuthError('FORBIDDEN');const merchant=await target(client,body.merchantId),user=await target(client,body.userId);
   permit(context,'assignments.update',resource(merchant));permit(context,'assignments.update',resource(user));return this.core.assignment(client,row.id,body);
  }
  if(operation==='business/upi-analytics'){
   if(!admin)throw new AuthError('FORBIDDEN');
   const tenants=permit(context,'bank_upi.view').tenantIds,days=body?.days??1;
   if(![1,7,30].includes(days)||Object.keys(body||{}).some(k=>k!=='days'))throw new AuthError('INVALID_INPUT');
   const from=new Date(+new Date(row.database_now)-days*86400000);
   const banks=(await client.query(`SELECT b.id,b.owner_id,b.version,b.status,b.frozen,b.deactivated,a.name AS owner_name,v.details,
    COALESCE((SELECT limit_minor::text FROM wpay_auth.upi_daily_limits dl WHERE dl.bank_id=b.id),v.limit_minor::text) AS daily_limit_minor,
    COALESCE((SELECT count(*)::int FROM wpay_auth.business_assignments x WHERE x.bank_id=b.id AND x.status='active'),0) AS route_count
    FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.accounts a ON a.id=b.owner_id JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version
    WHERE a.tenant_id=ANY($1) ORDER BY a.name,b.created_at DESC`,[tenants])).rows;
   const stats=(await client.query(`SELECT r.bank_id,count(*)::int total,
    count(*) FILTER(WHERE o.state='successful')::int successful,
    count(*) FILTER(WHERE o.state='verification_pending')::int pending,
    COALESCE(sum(o.amount_minor) FILTER(WHERE o.state='successful'),0)::text volume
    FROM wpay_auth.gateway_orders o JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id
    JOIN wpay_auth.accounts u ON u.id=r.user_id JOIN wpay_auth.accounts m ON m.id=o.merchant_id
    WHERE u.tenant_id=ANY($1) AND m.tenant_id=ANY($1) AND o.created_at>=$2
    GROUP BY r.bank_id`,[tenants,from])).rows;
   const byBank=new Map(stats.map(x=>[x.bank_id,x]));
   let totalLimit=0n,used=0n;for(const b of banks){const vol=await require('./bank-volume').volume(client,b.id,b.version);b.used=vol.used;b.sharedLimit=vol.shared_limit;totalLimit+=BigInt(vol.shared_limit||0);used+=BigInt(vol.used||0);const x=byBank.get(b.id)||{total:0,successful:0,pending:0,volume:'0'};b.txTotal=x.total;b.successful=x.successful;b.pending=x.pending;b.volume=x.volume;b.successRate=x.total?x.successful/x.total*100:0;}
   return {days,from,asOf:row.database_now,banks,totalLimit:totalLimit.toString(),used:used.toString(),running:banks.filter(x=>x.status==='running'&&!x.frozen&&!x.deactivated).length,available:banks.filter(x=>x.status==='running'&&!x.frozen&&!x.deactivated&&BigInt(x.sharedLimit||0)>BigInt(x.used||0)).length};
  }
  if(operation==='business/routing'){
   if(!admin)throw new AuthError('FORBIDDEN');const tenants=permit(context,'routing.view').tenantIds;
   const merchants=(await client.query("SELECT id,name FROM wpay_auth.accounts WHERE tenant_id=ANY($1) AND account_type='merchant' ORDER BY id LIMIT 100",[tenants])).rows;
   const candidates=[];for(const m of merchants)for(const c of await this.core.candidates(client,m.id)){
    const user=await target(client,c.userId);if(!tenants.includes(user.tenant_id))continue;
    candidates.push({merchantId:m.id,userId:c.userId,routeId:c.routeId,assignmentId:c.assignmentId,priority:c.priority,capacity:c.summary,...routing.eligibility(c,c.minMinor,c.databaseNow)});
   }
   const reservations=(await client.query(`SELECT r.id,r.order_reference,r.amount_minor::text,r.state,r.expires_at,r.merchant_id,r.user_id FROM wpay_auth.business_reservations r
    JOIN wpay_auth.accounts u ON u.id=r.user_id JOIN wpay_auth.accounts m ON m.id=r.merchant_id WHERE u.tenant_id=ANY($1) AND m.tenant_id=ANY($1) ORDER BY r.created_at DESC,r.id LIMIT 100`,[tenants])).rows;
   const reconciliation=(await client.query('SELECT r.owner_id,r.reason,r.reference,r.signed_remaining,r.deficit_minor,r.created_at FROM wpay_auth.business_reconciliation r JOIN wpay_auth.accounts a ON a.id=r.owner_id WHERE a.tenant_id=ANY($1) ORDER BY r.created_at DESC LIMIT 100',[tenants])).rows;
   return {candidates,reservations,reconciliation,strategy:routing.strategy,livePaymentsEnabled:false};
  }
  if(operation==='business/reservations/reserve'){
   v.exactFields(body,['orderReference','idempotencyKey','amountMinor','ttlSeconds']);if(!isMerchant)throw new AuthError('FORBIDDEN');permit(context,'merchant.overview.view');return this.core.reserve(client,row.id,body);
  }
  if(operation==='business/reservations/release'){
   v.exactFields(body,['reservationId']);if(!isMerchant)throw new AuthError('FORBIDDEN');permit(context,'merchant.overview.view');
   const reservation=(await client.query('SELECT id FROM wpay_auth.business_reservations WHERE id=$1 AND merchant_id=$2',[v.id(body.reservationId),row.id])).rows[0];if(!reservation)throw new AuthError('FORBIDDEN');return this.core.release(client,reservation.id,row.id,'cancelled');
  }
  if(['business/ledger','business/ledger/search'].includes(operation)){
   const permission=isUser?'user.payin_commission.view':isMerchant?'merchant.ledger.view':'ledger.view';const scope=await this.ownerScope(client,row,context,permission);
   const filter=operation==='business/ledger'?{ownerId:null,reference:'',type:'',offset:0}:body;v.exactFields(filter,['ownerId','reference','type','offset']);
   if(filter.ownerId!==null)v.id(filter.ownerId);if(!admin&&filter.ownerId&&filter.ownerId!==row.id)throw new AuthError('FORBIDDEN');
   if(typeof filter.reference!=='string'||filter.reference.length>100||typeof filter.type!=='string'||filter.type.length>80||!Number.isInteger(filter.offset)||filter.offset<0||filter.offset>10000)throw new AuthError('INVALID_INPUT');
   const result=await client.query(`SELECT e.id,e.owner_id,a.account_type,e.ledger_type,e.direction,e.amount_minor::text,e.currency,j.reference_type,j.reference_id,j.idempotency_key,j.created_at,j.actor_source,j.snapshot,CASE WHEN EXISTS(SELECT 1 FROM wpay_auth.payout_disputes pd JOIN wpay_auth.payout_dispute_resolutions pr ON pr.dispute_id=pd.id WHERE pd.payout_id=p.id AND pr.outcome='payment_invalid') THEN 'reversed' ELSE p.state END AS payout_status
    FROM wpay_auth.business_entries e JOIN wpay_auth.business_journals j ON j.id=e.journal_id JOIN wpay_auth.accounts a ON a.id=e.owner_id LEFT JOIN wpay_auth.payout_orders p ON p.id::text=COALESCE(j.snapshot->>'payoutId',j.reference_id) AND p.merchant_id=e.owner_id
    WHERE ($1::uuid[] IS NULL OR e.owner_id=ANY($1)) AND ($2::text[] IS NULL OR a.tenant_id=ANY($2)) AND ($3::uuid IS NULL OR e.owner_id=$3)
     AND ($4='' OR j.reference_id=$4) AND ($5='' OR e.ledger_type=$5) ORDER BY j.created_at DESC,j.id,e.id LIMIT 51 OFFSET $6`,[scope.ids,scope.tenants,filter.ownerId,filter.reference,filter.type,filter.offset]);
   return {entries:result.rows.slice(0,50).map(entry=>{const snapshot=entry.snapshot[entry.account_type];return {...entry,snapshot:snapshot?{version:snapshot.version,settings:snapshot.settings}:null,...(!admin?{owner_id:undefined}: {})};}),nextOffset:result.rowCount>50?filter.offset+50:null};
  }
  if(operation==='business/holds'){
   const scope=await this.ownerScope(client,row,context,isUser?'user.holds.view':isMerchant?'merchant.holds.view':'holds.view');
   const disputeHolds=await require('../payouts/disputes').holds(client,scope);
   return {canManage:admin&&canUsePermission({...context,permissionId:'holds.update'}).allowed,holds:[...disputeHolds,...(await client.query(`SELECT h.id,h.owner_id,h.amount_minor::text,h.currency,h.state,h.category,h.reason,h.reference,h.created_at,h.released_at FROM wpay_auth.business_holds h JOIN wpay_auth.accounts a ON a.id=h.owner_id
    WHERE ($1::uuid[] IS NULL OR h.owner_id=ANY($1)) AND ($2::text[] IS NULL OR a.tenant_id=ANY($2)) ORDER BY h.created_at DESC,h.id LIMIT 100`,[scope.ids,scope.tenants])).rows].sort((a,b)=>+new Date(b.created_at)-+new Date(a.created_at))};
  }
  if(operation==='business/holds/update'){
   if(!body||Object.getPrototypeOf(body)!==Object.prototype||Object.keys(body).some(k=>!['id','ownerId','amountMinor','reference','reason','release','category'].includes(k))||['id','ownerId','amountMinor','reference','reason','release'].some(k=>!Object.hasOwn(body,k)))throw new AuthError('INVALID_INPUT');if(!admin||typeof body.release!=='boolean')throw new AuthError('FORBIDDEN');const owner=await target(client,body.ownerId);permit(context,'holds.update',resource(owner));return this.core.hold(client,row.id,body);
  }
  if(operation==='business/ledger/adjust'){
   if(row.account_type!=='super_admin')throw new AuthError('FORBIDDEN');const owner=await target(client,body.ownerId);permit(context,'ledger.adjust',resource(owner,owner.id,owner.id));return this.core.adjustment(client,row.id,body);
  }
  throw new AuthError('NOT_FOUND');
 }
}
module.exports={BusinessApi,businessNavigation,GET,POST};
