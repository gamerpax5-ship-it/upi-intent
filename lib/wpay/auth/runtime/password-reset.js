"use strict";
const {token,digest}=require('./tokens'),{AuthError}=require('./errors'),v=require('./validation');
const {hashPassword,verifyPassword}=require('./passwords'),{transaction}=require('../../db/migrations');
const {credentialFingerprint}=require('../../db/security-repository'),{requireRole}=require('./role-entry');
const fail=()=>{throw new AuthError('AUTH_FAILED');};
function pending(row){return row.temporary_required===true;}
function valid(row){if(!pending(row)||!['employee','admin'].includes(row.account_type)||!row.temporary_expires_at||+row.temporary_expires_at<=+row.database_now)fail();}
async function begin(repository,client,row){
 valid(row);
 const count=await client.query('SELECT count(*)::int n FROM wpay_auth.password_reset_challenges WHERE account_id=$1 AND consumed_at IS NULL AND expires_at>CURRENT_TIMESTAMP',[row.id]);
 if(count.rows[0].n>=5)throw new AuthError('RATE_LIMITED');
 const challengeToken=token();await client.query("INSERT INTO wpay_auth.password_reset_challenges(token_digest,account_id,session_epoch,credential_fingerprint,expires_at) VALUES($1,$2,$3,$4,LEAST($5,CURRENT_TIMESTAMP+interval '10 minutes'))",[digest(challengeToken),row.id,row.session_epoch,credentialFingerprint(row.password_record),row.temporary_expires_at]);
 return {stage:'password-reset',challengeToken};
}
async function complete(service,rawToken,body,entryRole){
 v.exactFields(body,['password']);v.password(body.password);const key=digest(rawToken);if(!key)fail();
 return transaction(service.repository.pool,async client=>{
  const identity=(await client.query('SELECT account_id FROM wpay_auth.password_reset_challenges WHERE token_digest=$1',[key])).rows[0];if(!identity)fail();
  const row=await service.repository.lockedAccount(client,identity.account_id);requireRole(row,entryRole);valid(row);
  const challenge=(await client.query('SELECT * FROM wpay_auth.password_reset_challenges WHERE token_digest=$1 FOR UPDATE',[key])).rows[0];
  if(!challenge||challenge.consumed_at||+challenge.expires_at<=+row.database_now||challenge.session_epoch!==row.session_epoch||challenge.credential_fingerprint!==credentialFingerprint(row.password_record))fail();
  if(await verifyPassword(body.password,row.password_record))throw new AuthError('INVALID_INPUT');
  const record=await hashPassword(body.password);
  await client.query('UPDATE wpay_auth.credentials SET password_record=$2,temporary_required=false,temporary_expires_at=NULL WHERE account_id=$1',[row.id,record]);
  await client.query('UPDATE wpay_auth.password_reset_challenges SET consumed_at=CURRENT_TIMESTAMP WHERE account_id=$1 AND consumed_at IS NULL',[row.id]);
  const next=await service.mfa.revokeEpoch(client,row);next.temporary_required=false;next.temporary_expires_at=null;next.password_record=record;
  await client.query("INSERT INTO wpay_auth.panel_audit(id,actor_id,target_id,action) VALUES(gen_random_uuid(),$1,$1,'temporary_password_reset')",[row.id]);
  if(require("./session-assurance").isAdmin(next))return require("./admin-account").issue(service,client,next);
  // Employee MFA remains mandatory after reset.
  return service.mfa.newChallenge(client,next,next.mfa_enabled?'login':'enroll');
 });
}
module.exports={pending,valid,begin,complete};
