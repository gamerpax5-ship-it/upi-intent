"use strict";
const {recentAuthenticationAt}=require('../auth/runtime/session-assurance');
const {authorize,canUsePermission}=require('../authorization-policy'),{AuthError}=require('../auth/runtime/errors'),v=require('../business/validation');
const GET=['gateway/summary','gateway/keys','gateway/webhooks','gateway/orders','gateway/logs','gateway/diagnostics'],POST=['gateway/create','gateway/get','gateway/search','gateway/keys/create','gateway/keys/revoke','gateway/webhooks/configure','gateway/webhooks/retry'];
function navigation(groups,context){const merchant=context.principal.type==='merchant',permissionId=merchant?'merchant.gateway.view':'transactions.view';if(canUsePermission({...context,permissionId}).allowed)groups.push({id:'gateway.group.collections',label:'Gateway',children:[{id:'gateway.page.orders',destinationId:'gateway.orders',permissionId,label:'Payment gateway',routeStatus:'implemented',descriptorOnly:false,blockers:[]}]});return groups;}
async function run(gateway,client,row,context,operation,body){
 if(![...GET,...POST].includes(operation))throw new AuthError('NOT_FOUND');const merchant=row.account_type==='merchant';
 const manage=/gateway\/(keys\/(create|revoke)|webhooks\/(configure|retry))$/.test(operation),permissionId=merchant?(manage?'merchant.gateway.manage':operation==='gateway/create'?'merchant.gateway.create':'merchant.gateway.view'):'transactions.view';
 const scope={kind:operation==='gateway/create'?'create':manage?'record':'list',id:row.id,tenantId:row.tenant_id,ownerType:'merchant',ownerId:row.merchant_id};
 const permit=authorize({...context,permissionId,context:merchant?scope:{kind:'list'}});if(!permit.allowed)throw new AuthError('FORBIDDEN');
 if(!merchant){
  if(operation==='gateway/diagnostics'){const hookScope=authorize({...context,permissionId:'webhooks.view',context:{kind:'list'}});if(!hookScope.allowed)throw new AuthError('FORBIDDEN');const tenants=hookScope.constraints.where.tenantIds.filter(id=>permit.constraints.where.tenantIds.includes(id));
   return {events:(await client.query('SELECT o.id,o.order_id,o.event_type,o.state,o.attempts,o.last_code,o.next_attempt_at,o.created_at FROM wpay_auth.gateway_outbox o JOIN wpay_auth.accounts a ON a.id=o.merchant_id WHERE a.tenant_id=ANY($1) ORDER BY o.created_at DESC LIMIT 100',[tenants])).rows};
  }
  if(!['gateway/orders','gateway/search'].includes(operation))throw new AuthError('FORBIDDEN');return gateway.list(client,null,body,permit.constraints.where.tenantIds);
 }
 if(operation==='gateway/diagnostics')throw new AuthError('FORBIDDEN');
 if(manage&&(!recentAuthenticationAt(row)||+new Date(row.database_now)-+new Date(recentAuthenticationAt(row))>300000))throw new AuthError('RECENT_MFA_REQUIRED');
 const principal=await gateway.merchant(client,row.id);
 switch(operation){
  case 'gateway/create':return gateway.create(client,row.id,body,'manual',gateway.origin);
  case 'gateway/get':{v.exactFields(body,['id']);const order=await gateway.get(client,row.id,body.id,gateway.origin);return {...order,paymentQr:await gateway.crypto.libraries().qr.toDataURL(order.paymentUrl,{width:256,margin:2})};}
  case 'gateway/orders':case 'gateway/search':return gateway.list(client,row.id,body);
  case 'gateway/summary':return gateway.summary(client,row.id);
  case 'gateway/logs':return {rows:(await client.query('SELECT id,operation,created_at FROM wpay_auth.api_access_audit WHERE merchant_id=$1 ORDER BY created_at DESC,id LIMIT 100',[row.id])).rows};
  case 'gateway/keys':return {keys:(await client.query('SELECT id,prefix,label,scopes,created_at,last_used_at,revoked_at FROM wpay_auth.gateway_keys WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 100',[row.id])).rows};
  case 'gateway/keys/create':return gateway.createKey(client,principal,body);
  case 'gateway/keys/revoke':v.exactFields(body,['id']);return gateway.revokeKey(client,row.id,body.id);
  case 'gateway/webhooks/configure':return gateway.configure(client,row.id,body);
  case 'gateway/webhooks':return {endpoint:(await client.query('SELECT id,url,created_at FROM wpay_auth.gateway_endpoints WHERE merchant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[row.id])).rows[0]||null,events:(await client.query('SELECT id,order_id,event_type,state,attempts,next_attempt_at,last_code,created_at FROM wpay_auth.gateway_outbox WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 100',[row.id])).rows};
  case 'gateway/webhooks/retry':{v.exactFields(body,['id']);const result=await client.query("UPDATE wpay_auth.gateway_outbox SET state='pending',next_attempt_at=CURRENT_TIMESTAMP WHERE id=$1 AND merchant_id=$2 AND state='pending' AND attempts<8 RETURNING id",[v.id(body.id),row.id]);if(!result.rowCount)throw new AuthError('CONFLICT');return {queued:true};}
 }
}
module.exports={run,navigation,GET,POST};
