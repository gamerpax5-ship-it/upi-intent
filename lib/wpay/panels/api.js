"use strict";
const {randomUUID,createHash}=require('node:crypto'),v=require('../business/validation'),validation=require('../auth/runtime/validation');
const {commercial}=require('../auth/runtime/commercial'),{permit,recent,fail}=require('../operations/access'),{canUsePermission}=require('../authorization-policy');
const GET=['panel/admin-finance','panel/admin-audit','panel/admin-overview','panel/merchant-default-rate','panel/fees','panel/profile','panel/support','panel/notifications','panel/settings','panel/webhooks','panel/credentials','panel/api-logs','panel/devices','panel/analytics','panel/reports'];
const POST=[...GET,'panel/merchant-default-rate/update','panel/expense/create','panel/expense/void','panel/profile/update','panel/preferences','panel/support/create','panel/support/update','panel/directory','panel/directory/create','panel/directory/update','panel/credentials/create','panel/credentials/revoke','panel/webhooks/configure','panel/webhooks/retry','panel/reports/export'];
const self=row=>({kind:'record',id:row.id,tenantId:row.tenant_id,ownerType:'principal',ownerId:row.id});
function page(body,allowed=[]){if(!body||Object.keys(body).some(k=>!['offset','limit',...allowed].includes(k)))fail('INVALID_INPUT');const offset=body.offset??0,limit=body.limit??25;if(!Number.isInteger(offset)||offset<0||offset>10000||!Number.isInteger(limit)||limit<1||limit>100)fail('INVALID_INPUT');return {offset,limit};}
function more(rows,f){return {rows:rows.slice(0,f.limit),nextOffset:rows.length>f.limit?f.offset+f.limit:null};}
async function audit(c,row,target,action,details={}){await c.query('INSERT INTO wpay_auth.panel_audit(id,actor_id,target_id,action,details) VALUES($1,$2,$3,$4,$5)',[randomUUID(),row.id,target,action,details]);}
function csvCell(value){let s=String(value??'');if(/^[\s]*[=+\-@]/u.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function csv(rows){const fields=['id','created_at','owner_id','reference_type','reference_id','ledger_type','direction','amount_minor','currency'];return [fields.map(csvCell).join(','),...rows.map(r=>fields.map(k=>csvCell(r[k] instanceof Date?r[k].toISOString():r[k])).join(','))].join('\r\n');}
async function directory(c,row,context,body,fixedCurrency){
 const f=page(body,['type','status','search']);if(!['user','merchant'].includes(body.type))fail('INVALID_INPUT');
 const scope=permit(context,body.type==='user'?'users.view':'merchants.view');
 const status=body.status??'all',search=body.search??'';if(!['all','pending','approved','rejected','suspended','disabled'].includes(status)||typeof search!=='string'||search.length>100)fail('INVALID_INPUT');
 const rows=(await c.query(`SELECT a.id,a.name,a.email,a.account_type AS "accountType",a.status,e.approval_status AS "approvalStatus",a.created_at,
 cv.version AS "commercialVersion",cv.settings,cv.effective_at FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id
 LEFT JOIN LATERAL(SELECT version,settings,effective_at FROM wpay_auth.commercial_versions WHERE account_id=a.id ORDER BY version DESC LIMIT 1) cv ON true
 WHERE a.account_type=$1 AND a.tenant_id=ANY($2) AND ($3='all' OR ($3 IN('suspended','disabled') AND a.status=$3) OR ($3 IN('pending','approved','rejected') AND e.approval_status=$3 AND a.status='active'))
 AND ($4='' OR position(lower($4) in lower(a.name))>0 OR position(lower($4) in lower(a.email))>0)
 ORDER BY a.created_at DESC,a.id LIMIT $5 OFFSET $6`,[body.type,scope.tenantIds,status,search,f.limit+1,f.offset])).rows;
 const prefix=body.type==='user'?'users':'merchants';
 const ids=rows.map(r=>r.id),stats=new Map();
 if(ids.length){
  const counts=(await c.query(`SELECT a.id,
   EXISTS(SELECT 1 FROM wpay_auth.credentials cr WHERE cr.account_id=a.id) AS password_configured,
   CASE WHEN a.account_type='user' THEN (SELECT count(*)::int FROM wpay_auth.business_bank_accounts b WHERE b.owner_id=a.id)
        ELSE (SELECT count(*)::int FROM wpay_auth.business_assignments x WHERE x.merchant_id=a.id AND x.status='active') END AS route_count,
   CASE WHEN a.account_type='user' THEN (SELECT count(*)::int FROM wpay_auth.business_reservations r WHERE r.user_id=a.id)
        ELSE (SELECT count(*)::int FROM wpay_auth.gateway_orders g WHERE g.merchant_id=a.id) END AS transaction_count,
   CASE WHEN a.account_type='user' THEN (SELECT count(*)::int FROM wpay_auth.paired_devices d WHERE d.owner_id=a.id AND d.revoked_at IS NULL) ELSE 0 END AS linked_device_count,
   CASE WHEN a.account_type='user' THEN (SELECT count(*)::int FROM wpay_auth.funding_requests f WHERE f.owner_id=a.id AND f.state='confirmed') ELSE 0 END AS confirmed_deposit_count,
   CASE WHEN a.account_type='merchant' THEN (SELECT count(*)::int FROM wpay_auth.payout_orders p WHERE p.merchant_id=a.id) ELSE 0 END AS payout_request_count
   FROM wpay_auth.accounts a WHERE a.id=ANY($1::uuid[])`,[ids])).rows;
  for(const item of counts)stats.set(item.id,item);
  const ledger=require('../business/ledger');
  for(const item of rows){
   const b=await ledger.summary(c,item.id),x=stats.get(item.id)||{};
   item.availableMinor=item.accountType==='user'?b.available:b.merchantAvailable;
   item.routeCount=x.route_count||0;item.transactionCount=x.transaction_count||0;item.passwordConfigured=!!x.password_configured;
   item.linkedDeviceCount=x.linked_device_count||0;item.confirmedDepositCount=x.confirmed_deposit_count||0;item.payoutRequestCount=x.payout_request_count||0;
   item.recentActivity=item.accountType==='user'
    ?(await c.query(`SELECT o.reference,o.amount_minor::text AS "amountMinor",o.state AS status,'payin' AS type,o.created_at AS "createdAt"
      FROM wpay_auth.gateway_orders o JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id
      WHERE r.user_id=$1 ORDER BY o.created_at DESC,o.id LIMIT 6`,[item.id])).rows
    :(await c.query(`SELECT o.reference,o.amount_minor::text AS "amountMinor",o.state AS status,'payin' AS type,o.created_at AS "createdAt"
      FROM wpay_auth.gateway_orders o WHERE o.merchant_id=$1 ORDER BY o.created_at DESC,o.id LIMIT 6`,[item.id])).rows;
  }
 }
 return {...more(rows,f),actions:['approve','reject','suspend','commercial.update'].filter(p=>canUsePermission({...context,permissionId:prefix+'.'+p}).allowed),canCreate:['admin','super_admin'].includes(row.account_type)&&canUsePermission({...context,permissionId:prefix+'.approve'}).allowed,fixedFeeCurrency:fixedCurrency||null};
}
async function directoryUpdate(c,row,context,b,fixedCurrency){
 validation.exactFields(b,['requestId','id','action','reason','settings','expectedVersion']);v.id(b.requestId);v.id(b.id);const reason=v.reason(b.reason);recent(row);
 if(!['suspend','commercial.update'].includes(b.action)||!Number.isInteger(b.expectedVersion)||b.expectedVersion<0)fail('INVALID_INPUT');
 await require('../business/ledger').lock(c);
 const target=(await c.query("SELECT a.*,e.approval_status FROM wpay_auth.accounts a JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE a.id=$1 FOR UPDATE OF a,e",[b.id])).rows[0];
 if(!target||!['user','merchant'].includes(target.account_type)||target.id===row.id)fail();
 permit(context,(target.account_type==='user'?'users':'merchants')+'.'+b.action,{kind:'record',id:target.id,tenantId:target.tenant_id});
 const settings=b.action==='commercial.update'?commercial(target.account_type,b.settings,fixedCurrency):null;if(b.action==='suspend'&&b.settings!==null)fail('INVALID_INPUT');
 const hash=createHash('sha256').update(JSON.stringify({...b,settings,reason})).digest('hex');
 const prior=(await c.query('SELECT payload_digest,result FROM wpay_auth.directory_requests WHERE actor_id=$1 AND request_id=$2',[row.id,b.requestId])).rows[0];if(prior){if(prior.payload_digest!==hash)fail('CONFLICT');return prior.result;}
 const version=(await c.query('SELECT COALESCE(max(version),0)::int n FROM wpay_auth.commercial_versions WHERE account_id=$1',[target.id])).rows[0].n;
 if(version!==b.expectedVersion)fail('CONFLICT');let result;
 if(settings){if(target.approval_status!=='approved'||target.status!=='active')fail('CONFLICT');await c.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),target.id,version+1,settings,row.id]);result={id:target.id,commercialVersion:version+1};}
 else {if(target.status!=='active')fail('CONFLICT');await c.query("UPDATE wpay_auth.accounts SET status='suspended' WHERE id=$1",[target.id]);result={id:target.id,status:'suspended'};}
 await c.query('UPDATE wpay_auth.accounts SET permission_version=permission_version+1,session_epoch=session_epoch+1 WHERE id=$1',[target.id]);
 await c.query('UPDATE wpay_auth.grants SET permission_version=permission_version+1 WHERE account_id=$1',[target.id]);
 await audit(c,row,target.id,'directory_'+b.action,{previousVersion:version,nextVersion:settings?version+1:version,reason});
 result.sessionsInvalidated=true;await c.query('INSERT INTO wpay_auth.directory_requests(actor_id,request_id,payload_digest,result) VALUES($1,$2,$3,$4)',[row.id,b.requestId,hash,result]);return result;
}
async function report(c,row,context,body,exporting=false){
 const own=['user','merchant'].includes(row.account_type),f=page(body,['from','to']);
 const permission=own?row.account_type+'.analytics.view':exporting?'reports.export':'reports.view',scope=permit(context,permission);
 if(['from','to'].some(k=>body[k]!==undefined&&(typeof body[k]!=='string'||body[k].length>40)))fail('INVALID_INPUT');
 const now=+new Date(row.database_now),end=body.to?Date.parse(body.to):now,start=body.from?Date.parse(body.from):end-30*86400000;
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>(own?31:62)*86400000||end>now+86400000)fail('INVALID_INPUT');
 const rows=(await c.query(`SELECT e.id,j.created_at,${own?'NULL::uuid':'e.owner_id'} AS owner_id,j.reference_type,j.reference_id,e.ledger_type,e.direction,e.amount_minor::text,e.currency
 FROM wpay_auth.business_entries e JOIN wpay_auth.business_journals j ON j.id=e.journal_id JOIN wpay_auth.accounts a ON a.id=e.owner_id
 WHERE ($1::uuid IS NULL OR a.id=$1) AND ($2::text[] IS NULL OR a.tenant_id=ANY($2)) AND j.created_at>=$3 AND j.created_at<$4
 ORDER BY j.created_at DESC,e.id LIMIT $5 OFFSET $6`,[own?row.id:null,own?null:scope.tenantIds,new Date(start),new Date(end),f.limit+1,f.offset])).rows;
 const data=more(rows,f),totals={};for(const e of data.rows){const k=e.currency+':'+e.ledger_type;totals[k]=(BigInt(totals[k]||'0')+(e.direction==='credit'?1n:-1n)*BigInt(e.amount_minor)).toString();}
 if(exporting){await audit(c,row,row.id,'report_exported',{rows:data.rows.length,from:new Date(start).toISOString(),to:new Date(end).toISOString()});return {csv:csv(data.rows),nextOffset:data.nextOffset,from:new Date(start).toISOString(),to:new Date(end).toISOString()};}
 return {...data,totals,canExport:!own&&canUsePermission({...context,permissionId:"reports.export"}).allowed,pageTotalsOnly:true,from:new Date(start).toISOString(),to:new Date(end).toISOString()};
}
async function run(c,row,context,operation,b,fixedCurrency,gateway){
 if(![...GET,...POST].includes(operation))fail('NOT_FOUND');
 if(['panel/admin-finance','panel/admin-audit','panel/expense/create','panel/expense/void'].includes(operation))return require('./admin-finance').run(c,row,context,operation,b);
 if(operation==='panel/admin-overview')return require('./admin-overview').overview(c,row,context,b);
 if(operation==='panel/merchant-default-rate'){
  if(!['admin','super_admin'].includes(row.account_type))fail();const scope=permit(context,'merchants.view'),rows=(await c.query("SELECT tenant_id,merchant_inr_per_usdt,updated_at FROM wpay_auth.admin_commercial_defaults WHERE tenant_id=ANY($1) ORDER BY tenant_id",[scope.tenantIds])).rows,map=new Map(rows.map(x=>[x.tenant_id,x]));
  return {tenants:scope.tenantIds.map(id=>({tenantId:id,rate:map.get(id)?.merchant_inr_per_usdt||'107',updatedAt:map.get(id)?.updated_at||null})),canUpdate:canUsePermission({...context,permissionId:'merchants.commercial.update'}).allowed};
 }
 if(operation==='panel/merchant-default-rate/update'){
  if(!['admin','super_admin'].includes(row.account_type))fail();validation.exactFields(b,['tenantId','rate']);recent(row);const scope=permit(context,'merchants.commercial.update');if(typeof b.tenantId!=='string'||!scope.tenantIds.includes(b.tenantId))fail();
  const rate=require('../auth/runtime/commercial').decimal(b.rate,{positive:true});
  await c.query(`INSERT INTO wpay_auth.admin_commercial_defaults(tenant_id,merchant_inr_per_usdt,actor_id,updated_at) VALUES($1,$2,$3,CURRENT_TIMESTAMP)
   ON CONFLICT(tenant_id) DO UPDATE SET merchant_inr_per_usdt=EXCLUDED.merchant_inr_per_usdt,actor_id=EXCLUDED.actor_id,updated_at=CURRENT_TIMESTAMP`,[b.tenantId,rate,row.id]);
  await audit(c,row,row.id,'merchant_default_rate_updated',{tenantId:b.tenantId,rate});return {tenantId:b.tenantId,rate};
 }
 if(operation==='panel/directory')return directory(c,row,context,b,fixedCurrency);
 if(operation==='panel/directory/create')return require('./admin-create-account').create(c,row,context,b);
 if(operation==='panel/directory/update')return directoryUpdate(c,row,context,b,fixedCurrency);
 if(['panel/analytics','panel/reports','panel/reports/export'].includes(operation)){
  const own=['user','merchant'].includes(row.account_type);
  if(operation==='panel/analytics'&&!own)fail();
  if(!own&&operation!=='panel/reports'&&operation!=='panel/reports/export')fail();
  return report(c,row,context,b,operation.endsWith('/export'));
 }
 if(operation==='panel/fees'){
  if(row.account_type!=='merchant')fail();
  permit(context,'merchant.fees.view');const f=page(b);
  const rows=(await c.query('SELECT version,settings,effective_at FROM wpay_auth.commercial_versions WHERE account_id=$1 AND effective_at<=CURRENT_TIMESTAMP ORDER BY version DESC LIMIT $2 OFFSET $3',[row.id,f.limit+1,f.offset])).rows;
  return more(rows.map(r=>({version:r.version,effectiveAt:r.effective_at,payinFee:r.settings.payinFee,payoutFee:r.settings.payoutFee,fixedPayoutFee:r.settings.fixedPayoutFee,fixedFeeCurrency:r.settings.fixedFeeCurrency})),f);
 }
 if(operation==='panel/profile'){permit(context,'profile.view');return {canEdit:canUsePermission({...context,permissionId:'profile.update'}).allowed};}
 if(operation==='panel/profile/update'){
  validation.exactFields(b,['name']);permit(context,'profile.update',self(row));recent(row);const name=validation.name(b.name);
  await c.query('UPDATE wpay_auth.accounts SET name=$2 WHERE id=$1 AND tenant_id=$3',[row.id,name,row.tenant_id]);await audit(c,row,row.id,'profile_name_updated');return {name};
 }
 if(operation==='panel/notifications'){
  const f=page(b);permit(context,'notifications.view');const preferences=(await c.query('SELECT locale,in_app_notifications FROM wpay_auth.preferences WHERE account_id=$1',[row.id])).rows[0];
  const rows=preferences.in_app_notifications?(await c.query('SELECT id,event,created_at FROM wpay_auth.security_audit WHERE account_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3',[row.id,f.limit+1,f.offset])).rows:[];
  return {...more(rows,f),preferences,emailDeliveryConfigured:false,canUpdate:canUsePermission({...context,permissionId:'notifications.update'}).allowed};
 }
 if(operation==='panel/preferences'){
  validation.exactFields(b,['inAppNotifications']);if(typeof b.inAppNotifications!=='boolean')fail('INVALID_INPUT');permit(context,'notifications.update',self(row));
  await c.query('UPDATE wpay_auth.preferences SET in_app_notifications=$2 WHERE account_id=$1',[row.id,b.inAppNotifications]);await audit(c,row,row.id,'notification_preferences_updated',{enabled:b.inAppNotifications});return {saved:true};
 }
 if(operation.startsWith('panel/support')){
  const admin=['admin','super_admin','employee'].includes(row.account_type);
  if(operation==='panel/support'){
   const f=page(b);const scope=permit(context,admin?'support_admin.view':'support.view');
   const rows=(await c.query(`SELECT t.id,t.subject,t.message,t.created_at,COALESCE(e.status,'open') AS status,e.message AS reply,e.created_at AS replied_at FROM wpay_auth.support_tickets t JOIN wpay_auth.accounts a ON a.id=t.owner_id LEFT JOIN LATERAL(SELECT status,message,created_at FROM wpay_auth.support_events WHERE ticket_id=t.id ORDER BY created_at DESC,id DESC LIMIT 1)e ON true WHERE ($1::uuid IS NULL OR t.owner_id=$1) AND ($2::text[] IS NULL OR a.tenant_id=ANY($2)) ORDER BY t.created_at DESC,t.id LIMIT $3 OFFSET $4`,[admin?null:row.id,admin?scope.tenantIds:null,f.limit+1,f.offset])).rows;
   return {...more(rows,f),admin,canWrite:canUsePermission({...context,permissionId:admin?'support_admin.update':'support.create'}).allowed,externalDelivery:false};
  }
  recent(row);
  if(operation==='panel/support/create'){
   if(admin)fail();validation.exactFields(b,['requestId','subject','message']);v.id(b.requestId);const subject=v.text(b.subject),message=v.text(b.message,2000);permit(context,'support.create',{kind:'create',tenantId:row.tenant_id,ownerType:'principal',ownerId:row.id});
   const old=(await c.query('SELECT id,subject,message FROM wpay_auth.support_tickets WHERE owner_id=$1 AND request_id=$2',[row.id,b.requestId])).rows[0];if(old){if(old.subject!==subject||old.message!==message)fail('CONFLICT');return {id:old.id};}
   const id=randomUUID();await c.query('INSERT INTO wpay_auth.support_tickets(id,owner_id,request_id,subject,message) VALUES($1,$2,$3,$4,$5)',[id,row.id,b.requestId,subject,message]);await audit(c,row,row.id,'support_opened',{ticketId:id});return {id};
  }
  validation.exactFields(b,['requestId','id','status','message']);v.id(b.id);v.id(b.requestId);if(!admin||!['open','resolved'].includes(b.status))fail();const message=v.text(b.message,2000);
  const target=(await c.query('SELECT t.owner_id,a.tenant_id FROM wpay_auth.support_tickets t JOIN wpay_auth.accounts a ON a.id=t.owner_id WHERE t.id=$1',[b.id])).rows[0];if(!target)fail();permit(context,'support_admin.update',{kind:'record',id:b.id,tenantId:target.tenant_id});
  const previous=(await c.query('SELECT ticket_id,status,message FROM wpay_auth.support_events WHERE actor_id=$1 AND request_id=$2',[row.id,b.requestId])).rows[0];if(previous){if(previous.ticket_id!==b.id||previous.status!==b.status||previous.message!==message)fail('CONFLICT');return {saved:true};}
  await c.query('INSERT INTO wpay_auth.support_events(id,ticket_id,actor_id,request_id,status,message) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),b.id,row.id,b.requestId,b.status,message]);await audit(c,row,target.owner_id,'support_updated',{ticketId:b.id,status:b.status});return {saved:true};
 }
 if(operation==='panel/settings'){
  permit(context,'settings.view');return {adminLogin:'Email and password',customerLogin:'Email and password; authenticator optional in Security settings',employeeLogin:'Password and authenticator',sessionIdleMinutes:30,sessionMaximumHours:12,temporaryPasswordHours:24,resetChallengeMinutes:10,sensitiveActionConfirmationMinutes:5,securityPolicyEditable:false};
 }
 if(operation==='panel/webhooks/configure'){
  validation.exactFields(b,['merchantId','url']);v.id(b.merchantId);recent(row);const scope=permit(context,'webhooks.view');
  const target=(await c.query("SELECT id,merchant_id,tenant_id,account_type FROM wpay_auth.accounts WHERE id=$1 AND account_type='merchant'",[b.merchantId])).rows[0];if(!target||!scope.tenantIds.includes(target.tenant_id))fail();
  permit(context,'webhooks.update',{kind:'record',id:target.id,tenantId:target.tenant_id,ownerType:'merchant',ownerId:target.merchant_id||target.id});
  const result=await gateway.configure(c,target.id,{url:b.url},row.id);await audit(c,row,target.id,'webhook_configuration_updated',{endpointId:result.id});return result;
 }
 if(operation==='panel/webhooks/retry'){
  validation.exactFields(b,['id']);v.id(b.id);recent(row);const scope=permit(context,'webhooks.view');
  const target=(await c.query('SELECT o.id,o.merchant_id,a.merchant_id AS owner_ref,a.tenant_id,o.state,o.attempts FROM wpay_auth.gateway_outbox o JOIN wpay_auth.accounts a ON a.id=o.merchant_id WHERE o.id=$1',[b.id])).rows[0];if(!target||!scope.tenantIds.includes(target.tenant_id))fail();
  permit(context,'webhooks.update',{kind:'record',id:target.id,tenantId:target.tenant_id,ownerType:'merchant',ownerId:target.owner_ref||target.merchant_id});
  const changed=await c.query("UPDATE wpay_auth.gateway_outbox SET state='pending',next_attempt_at=CURRENT_TIMESTAMP WHERE id=$1 AND state='pending' AND attempts<8 RETURNING id",[b.id]);if(!changed.rowCount)fail('CONFLICT');
  await audit(c,row,target.merchant_id,'webhook_retry_queued',{eventId:b.id});return {queued:true};
 }
 if(operation==='panel/credentials/create'){
  validation.exactFields(b,['merchantId','label','scopes']);v.id(b.merchantId);recent(row);if(row.account_type!=='super_admin')fail();
  const scope=permit(context,'api_credentials.view');permit(context,'api_credentials.create',{kind:'create',platform:true});
  const tenant=(await c.query('SELECT tenant_id FROM wpay_auth.accounts WHERE id=$1',[b.merchantId])).rows[0];if(!tenant||!scope.tenantIds.includes(tenant.tenant_id))fail();
  const merchant=await gateway.merchant(c,b.merchantId);if(!merchant.permissions.includes('merchant.gateway.view')||!merchant.permissions.includes('merchant.gateway.manage'))fail();
  if(Array.isArray(b.scopes)&&b.scopes.includes('orders:write')&&!merchant.permissions.includes('merchant.gateway.create'))fail();
  const result=await gateway.createKey(c,merchant,{label:b.label,scopes:b.scopes},row.id);
  await audit(c,row,merchant.id,'api_credential_created',{credentialId:result.id});return result;
 }
 if(operation==='panel/credentials/revoke'){
  validation.exactFields(b,['id']);v.id(b.id);recent(row);if(row.account_type!=='super_admin')fail();const scope=permit(context,'api_credentials.view');permit(context,'api_credentials.revoke',{kind:'record',platform:true,id:b.id});
  const target=(await c.query('SELECT k.merchant_id,a.tenant_id FROM wpay_auth.gateway_keys k JOIN wpay_auth.accounts a ON a.id=k.merchant_id WHERE k.id=$1',[b.id])).rows[0];if(!target||!scope.tenantIds.includes(target.tenant_id))fail();
  await c.query('UPDATE wpay_auth.gateway_keys SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE id=$1 AND merchant_id=$2',[b.id,target.merchant_id]);
  await c.query('UPDATE wpay_auth.accounts SET session_epoch=session_epoch+1 WHERE id=$1',[target.merchant_id]);await audit(c,row,target.merchant_id,'api_credential_revoked',{credentialId:b.id});return {revoked:true};
 }
 const f=page(b),permissions={'panel/webhooks':'webhooks.view','panel/credentials':'api_credentials.view','panel/api-logs':'api_logs.view','panel/devices':'devices.view'},permission=permissions[operation];if(!permission)fail('NOT_FOUND');const scope=permit(context,permission);
 let sql;
 if(operation==='panel/credentials')sql='SELECT k.id,k.merchant_id,k.prefix,k.label,k.scopes,k.created_at,k.last_used_at,k.revoked_at FROM wpay_auth.gateway_keys k JOIN wpay_auth.accounts a ON a.id=k.merchant_id WHERE a.tenant_id=ANY($1) ORDER BY k.created_at DESC,k.id LIMIT $2 OFFSET $3';
 if(operation==='panel/webhooks')sql='SELECT o.id,o.merchant_id,o.order_id,o.event_type,o.state,o.attempts,o.next_attempt_at,o.last_code,o.created_at FROM wpay_auth.gateway_outbox o JOIN wpay_auth.accounts a ON a.id=o.merchant_id WHERE a.tenant_id=ANY($1) ORDER BY o.created_at DESC,o.id LIMIT $2 OFFSET $3';
 if(operation==='panel/api-logs')sql='SELECT l.id,l.merchant_id,l.operation,l.created_at FROM wpay_auth.api_access_audit l JOIN wpay_auth.accounts a ON a.id=l.merchant_id WHERE a.tenant_id=ANY($1) ORDER BY l.created_at DESC,l.id LIMIT $2 OFFSET $3';
 if(operation==='panel/devices')sql="SELECT d.id,d.owner_id,d.device_ref,d.valid_from,d.valid_until,d.revoked_at,d.created_at FROM wpay_auth.paired_devices d JOIN wpay_auth.accounts a ON a.id=d.owner_id WHERE a.tenant_id=ANY($1) ORDER BY d.created_at DESC,d.id LIMIT $2 OFFSET $3";
 const rows=(await c.query(sql,[scope.tenantIds,f.limit+1,f.offset])).rows;
 const extra={};
 if(operation==='panel/webhooks')extra.endpoints=more((await c.query('SELECT e.id,e.merchant_id,e.url,e.created_at FROM wpay_auth.gateway_endpoints e JOIN wpay_auth.accounts a ON a.id=e.merchant_id WHERE a.tenant_id=ANY($1) ORDER BY e.created_at DESC,e.id LIMIT $2 OFFSET $3',[scope.tenantIds,f.limit+1,f.offset])).rows,f);
 if(operation==='panel/devices'){
  extra.links=more((await c.query("SELECT r.id,r.account_id,r.source_id,r.resource_id,r.status,r.valid_from,r.valid_until,r.revoked_at FROM wpay_auth.resource_links r JOIN wpay_auth.accounts a ON a.id=r.account_id WHERE a.tenant_id=ANY($1) AND r.resource_kind='device' ORDER BY r.consent_at DESC,r.id LIMIT $2 OFFSET $3",[scope.tenantIds,f.limit+1,f.offset])).rows,f);
  extra.pairingRequests=more((await c.query('SELECT p.id,p.owner_id,p.source_id,p.created_at,p.expires_at FROM wpay_auth.legacy_pairing_requests p JOIN wpay_auth.accounts a ON a.id=p.owner_id WHERE a.tenant_id=ANY($1) ORDER BY p.created_at DESC,p.id LIMIT $2 OFFSET $3',[scope.tenantIds,f.limit+1,f.offset])).rows,f);
 }
 return {...more(rows,f),...extra,canCreate:operation==='panel/credentials'&&row.account_type==='super_admin'&&canUsePermission({...context,permissionId:'api_credentials.create'}).allowed,canRevoke:operation==='panel/credentials'&&row.account_type==='super_admin'&&canUsePermission({...context,permissionId:'api_credentials.revoke'}).allowed,canUpdate:operation==='panel/webhooks'&&canUsePermission({...context,permissionId:'webhooks.update'}).allowed,sourceConnected:false};
}
module.exports={GET,POST,run,page,csvCell,csv};
