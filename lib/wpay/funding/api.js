"use strict";
const {recentAuthenticationAt}=require('../auth/runtime/session-assurance');
const {authorize,canUsePermission}=require('../authorization-policy'),{AuthError}=require('../auth/runtime/errors'),v=require('../business/validation'),ledger=require('../business/ledger'),net=require('./networks'),{FundingWorkflow}=require('./workflow');
const GET=['funding/config'],POST=['funding/list','funding/create','funding/claim','funding/review','funding/recheck'];
function permit(context,permissionId,resource={kind:'list'}){const p=authorize({...context,permissionId,context:resource});if(!p.allowed)throw new AuthError('FORBIDDEN');return p.constraints.where;}
class FundingApi{
 constructor(options={}){this.workflow=new FundingWorkflow(options);}
 async run(c,row,context,operation,body){const user=row.account_type==='user',admin=['admin','super_admin','employee'].includes(row.account_type);if(!user&&!admin)throw new AuthError('FORBIDDEN');
  if(![...GET,...POST].includes(operation))throw new AuthError('NOT_FOUND');
  const permission=user?'user.deposits.view':'deposits.view',scope=permit(context,permission);
  if(!['funding/list','funding/config'].includes(operation)&&+row.database_now-+new Date(recentAuthenticationAt(row))>300000)throw new AuthError('RECENT_MFA_REQUIRED');
  if(operation==='funding/config'){if(!user)throw new AuthError('FORBIDDEN');const terms=(await c.query('SELECT version,settings FROM wpay_auth.commercial_versions WHERE account_id=$1 AND effective_at<=CURRENT_TIMESTAMP ORDER BY version DESC LIMIT 1',[row.id])).rows[0];return {settings:terms||null,minimumUsdt:(await this.workflow.minimum(c,row.id))===net.MINIMUM?'2000':'0.000001',topupMinimumUsdt:'0.000001',maximumUsdt:null,aggregationAllowed:false,providerConfigured:!!terms&&this.workflow.provider.configured(terms.settings.depositNetwork),canSubmit:canUsePermission({...context,permissionId:'user.deposits.submit'}).allowed,capacity:await ledger.summary(c,row.id)};}
  if(operation==='funding/list'){v.exactFields(body,['state','offset']);if(!['','requested','detected','confirming','review','confirmed','rejected','reversed'].includes(body.state)||!Number.isInteger(body.offset)||body.offset<0||body.offset>10000)throw new AuthError('INVALID_INPUT');
   const rows=(await c.query("SELECT r.*,a.name FROM wpay_auth.funding_requests r JOIN wpay_auth.accounts a ON a.id=r.owner_id WHERE ($1::uuid IS NULL OR r.owner_id=$1) AND ($2::text[] IS NULL OR (r.tenant_id=ANY($2) AND a.tenant_id=ANY($2))) AND ($3='' OR r.state=$3) ORDER BY r.created_at DESC,r.id LIMIT 26 OFFSET $4",[user?row.id:null,user?null:scope.tenantIds,body.state,body.offset])).rows;
   const requests=[];for(const r of rows.slice(0,25)){const events=(await c.query('SELECT kind,reason,provenance,created_at FROM wpay_auth.funding_events WHERE request_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50',[r.id])).rows;
    const claims=(await c.query('SELECT tx_hash,event_index FROM wpay_auth.funding_claims WHERE request_id=$1 ORDER BY created_at DESC LIMIT 20',[r.id])).rows;requests.push({...r,events,claims,capacity:await ledger.summary(c,r.owner_id),providerConfigured:this.workflow.provider.configured(r.snapshot.network)});}
   return {requests,nextOffset:rows.length>25?body.offset+25:null,actions:admin?['review','approve','reject'].filter(a=>canUsePermission({...context,permissionId:'deposits.'+a}).allowed):[]};}
  if(operation==='funding/create'){if(!user)throw new AuthError('FORBIDDEN');permit(context,'user.deposits.submit',{kind:'create',tenantId:row.tenant_id,ownerType:'user',ownerId:row.user_id});return this.workflow.create(c,row,body);}
  const request=await this.workflow.request(c,body.requestId),owner=(await c.query('SELECT user_id,tenant_id FROM wpay_auth.accounts WHERE id=$1',[request.owner_id])).rows[0];const resource={kind:'record',id:request.id,tenantId:request.tenant_id,ownerType:'user',ownerId:owner.user_id};
  if(owner.tenant_id!==request.tenant_id)throw new AuthError('FORBIDDEN');
  if(user){if(request.owner_id!==row.id)throw new AuthError('FORBIDDEN');permit(context,'user.deposits.submit',{...resource,kind:'create'});}else permit(context,operation==='funding/review'?(['reject','manual_reject'].includes(body.action)?'deposits.reject':'deposits.approve'):'deposits.review',resource);
  if(operation==='funding/claim'){if(!user)throw new AuthError('FORBIDDEN');return this.workflow.claim(c,request,body,row.id);}
  if(operation==='funding/recheck'){v.exactFields(body,['requestId']);await c.query("UPDATE wpay_auth.funding_jobs j SET state='queued',attempts=0,next_attempt_at=CURRENT_TIMESTAMP,lease_until=NULL WHERE claim_id IN(SELECT id FROM wpay_auth.funding_claims WHERE request_id=$1) AND state<>'running'",[request.id]);await this.workflow.event(c,request,'recheck_requested','Bounded verification retry queued',{},row.id);return {queued:true,providerConfigured:this.workflow.provider.configured(request.snapshot.network)};}
  if(operation==='funding/review'){if(!admin)throw new AuthError('FORBIDDEN');if(['manual_confirm','manual_reject'].includes(body.action))return require('./manual-review').manualReview(this.workflow,c,request,body,row.id);return this.workflow.review(c,request,body,row.id);}
  throw new AuthError('NOT_FOUND');
 }
}
module.exports={FundingApi,GET,POST};
