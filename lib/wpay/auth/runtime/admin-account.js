"use strict";
const {AuthError}=require('./errors'),v=require('./validation');
const {token,digest,ABSOLUTE_MS}=require('./tokens');
const {isAdmin}=require('./session-assurance');
const {verifyPassword,hashPassword}=require('./passwords');
const {securityAudit}=require('../../db/security-repository');
async function issue(service,client,row){
 if(!isAdmin(row)||row.status!=='active'||row.temporary_required)throw new AuthError('AUTH_FAILED');
 const sessionToken=token();
 await client.query(`INSERT INTO wpay_auth.sessions(token_digest,account_id,permission_version,session_epoch,created_at,last_seen_at,expires_at,security_version,factor_version,auth_method,password_at)
 VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP+($5*interval '1 millisecond'),$6,$7,'password',CURRENT_TIMESTAMP)`,
 [digest(sessionToken),row.id,row.permission_version,row.session_epoch,ABSOLUTE_MS,row.security_version,row.factor_version]);
 service.mfa.validate(await service.repository.snapshot(client,digest(sessionToken)));
 await securityAudit(client,row.id,row.id,'admin_password_session_issued');
 return {stage:'authenticated',sessionToken};
}
async function begin(service,account,entryRole){
 return service.repository.startAdminSession(account.id,account.password_record,async(client,row)=>{
  require('./role-entry').requireRole(row,entryRole);
  if(!isAdmin(row))throw new AuthError('AUTH_FAILED');
  if(row.temporary_required)return require('./password-reset').begin(service.repository,client,row);
  return issue(service,client,row);
 });
}
async function change(service,client,row,body,action,sessionDigest){
 if(!isAdmin(row))throw new AuthError('FORBIDDEN');
 v.exactFields(body,action==='reauth'?['password']:['password',action==='email'?'newEmail':'newPassword']);
 v.passwordInput(body.password);
 const email=action==='email'?v.email(body.newEmail):null;
 if(action==='password'){v.password(body.newPassword,row.account_type);if(body.newPassword===body.password)throw new AuthError('INVALID_INPUT');}
 const current=await service.repository.lockedAccount(client,row.id);
 if(!await service.repository.attempt(client,current,null))return {failure:'RATE_LIMITED'};
 if(!await verifyPassword(body.password,current.password_record))return {failure:'AUTH_FAILED'};
 if(action==='reauth'){
  if(row.auth_method!=='password')return issue(service,client,current);
  await client.query('UPDATE wpay_auth.sessions SET password_at=CURRENT_TIMESTAMP WHERE token_digest=$1',[sessionDigest]);
  return {ok:true};
 }
 if(action==='email'){
  if(email===current.email)throw new AuthError('INVALID_INPUT');
  const used=await client.query('SELECT 1 FROM wpay_auth.accounts WHERE email=$1',[email]);
  if(used.rowCount)throw new AuthError('CONFLICT');
  await client.query('UPDATE wpay_auth.accounts SET email=$2 WHERE id=$1',[row.id,email]);
 }else if(action==='password'){
  const record=await hashPassword(body.newPassword,row.account_type);
  await client.query('UPDATE wpay_auth.credentials SET password_record=$2 WHERE account_id=$1',[row.id,record]);
 }else throw new AuthError('NOT_FOUND');
 const next=await service.mfa.revokeEpoch(client,current);
 await securityAudit(client,row.id,row.id,action==='email'?'admin_email_changed':'admin_password_changed');
 return issue(service,client,next);
}
module.exports={begin,issue,change};
