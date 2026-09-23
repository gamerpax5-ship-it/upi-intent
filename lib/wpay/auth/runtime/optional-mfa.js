'use strict';
const {AuthError}=require('./errors'),v=require('./validation');
const {token,digest,ABSOLUTE_MS}=require('./tokens');
const {verifyPassword,hashPassword}=require('./passwords');
const {securityAudit}=require('../../db/security-repository');
const customer=row=>['user','merchant'].includes(row?.account_type);
async function issue(service,client,row){
 if(!customer(row)||row.mfa_enabled!==false||row.temporary_required)throw new AuthError('AUTH_FAILED');
 const sessionToken=token();
 await client.query(`INSERT INTO wpay_auth.sessions(token_digest,account_id,permission_version,session_epoch,created_at,last_seen_at,expires_at,security_version,factor_version,auth_method,password_at)
 VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+($5*interval '1 millisecond'),$6,$7,'password',CURRENT_TIMESTAMP)`,[digest(sessionToken),row.id,row.permission_version,row.session_epoch,ABSOLUTE_MS,row.security_version,row.factor_version]);
 service.mfa.validate(await service.repository.snapshot(client,digest(sessionToken)));
 await securityAudit(client,row.id,row.id,'customer_password_session_issued');
 return {stage:'authenticated',sessionToken};
}
async function begin(service,account,entryRole){
 return service.repository.startAdminSession(account.id,account.password_record,async(client,row)=>{
  require('./role-entry').requireRole(row,entryRole);
  if(!customer(row)||row.temporary_required)throw new AuthError('AUTH_FAILED');
  return row.mfa_enabled?service.mfa.newChallenge(client,row,'login'):issue(service,client,row);
 });
}
async function change(service,client,row,body,action,sessionDigest){
 if(!customer(row))throw new AuthError('FORBIDDEN');
 if(row.mfa_enabled&&action!=='disable'){
  if(action==='enable')throw new AuthError('CONFLICT');
  return service.mfa.fresh(client,row,body,action,sessionDigest);
 }
 if(!['enable','disable','stepup','password'].includes(action))throw new AuthError('INVALID_INPUT');
 v.exactFields(body,action==='password'?['password','newPassword']:action==='disable'?['password','code']:['password']);v.passwordInput(body.password);
 const current=await service.repository.lockedAccount(client,row.id);
 if(action==='password'){v.password(body.newPassword,current.account_type);if(body.password===body.newPassword)throw new AuthError('INVALID_INPUT');}
 if(!await service.repository.attempt(client,current,null))return {failure:'RATE_LIMITED'};
 if(!await verifyPassword(body.password,current.password_record))return {failure:'AUTH_FAILED'};
 if(action==='disable'){
  if(!current.mfa_enabled)throw new AuthError('CONFLICT');
  const {factorBinding}=require('./mfa-service');
  const step=await service.crypto.verify(service.crypto.open(current.encrypted_secret,factorBinding(current)),body.code,current.database_now,current.last_used_step);
  if(step===null)return {failure:'MFA_FAILED'};
  await service.repository.acceptStep(client,current,step);
  await client.query('UPDATE wpay_auth.account_security SET enabled=false,encrypted_secret=NULL,last_used_step=NULL WHERE account_id=$1',[row.id]);
  await client.query('UPDATE wpay_auth.recovery_codes SET consumed_at=COALESCE(consumed_at,CURRENT_TIMESTAMP) WHERE account_id=$1',[row.id]);
  const next=await service.mfa.revokeEpoch(client,current);next.mfa_enabled=false;
  await securityAudit(client,row.id,row.id,'optional_authenticator_disabled');
  return issue(service,client,next);
 }
 if(current.mfa_enabled)throw new AuthError('AUTH_FAILED');
 if(action==='stepup'){
  await client.query('UPDATE wpay_auth.sessions SET password_at=CURRENT_TIMESTAMP WHERE token_digest=$1',[sessionDigest]);return {ok:true};
 }
 const next=await service.mfa.revokeEpoch(client,current);
 if(action==='enable'){
  await securityAudit(client,row.id,row.id,'optional_authenticator_setup_started');
  return service.mfa.newChallenge(client,next,'enroll');
 }
 const record=await hashPassword(body.newPassword,current.account_type);
 await client.query('UPDATE wpay_auth.credentials SET password_record=$2 WHERE account_id=$1',[row.id,record]);
 await securityAudit(client,row.id,row.id,'customer_password_changed');
 return issue(service,client,next);
}
module.exports={begin,issue,change};
