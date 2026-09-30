'use strict';
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const {CONTROLLERS,fail,id,email}=require('./policy');
const digest=value=>createHash('sha256').update(value).digest('hex');
// Pure transitions. Store executes them under a group row/advisory lock.
// A mapping UUID is its revocation generation; never recycle it on re-add.
function empty(){return {role:null,mappings:[],reset:null};}
function change(previous,command,account,actor,now=Date.now()){
 const state=structuredClone(previous||empty());id(actor);if(!CONTROLLERS.includes(String(actor)))fail('CONTROLLER_REQUIRED');
 const kind=command.command;
 if(kind==='setadmin'){
  if(state.role&&state.role!=='admin')fail('RESET_GROUP_FIRST');
  if(state.role!=='admin'){state.role='admin';state.reset=null;}return {state,changed:!previous?.role};
 }
 if(!['setuser','setmerchant','removeuser','resetuser'].includes(kind))fail('INVALID_MAPPING_COMMAND');
 if(!account||(kind!=='removeuser'&&account.status!=='active')||!['user','merchant'].includes(account.account_type)||email(account.email)!==command.email)fail('ACCOUNT_NOT_FOUND');
 const role=kind==='setmerchant'?'merchant':'user';if(account.account_type!==role)fail('ACCOUNT_NOT_FOUND');
 if(state.role&&state.role!==role)fail('RESET_GROUP_FIRST');
 const target=role==='user'?id(command.telegramId):null;
 if(target&&CONTROLLERS.includes(target))fail('CONTROLLER_CANNOT_RECEIVE');
 if(kind==='removeuser'||kind==='resetuser'){
  const old=kind==='removeuser'?target:id(command.oldId);
  const index=state.mappings.findIndex(m=>m.accountId===account.id&&m.telegramId===old);
  if(index<0)fail('MAPPING_NOT_FOUND');
  if(kind==='resetuser'&&old===target)return {state,changed:false};
  if(kind==='resetuser'&&state.mappings.some(m=>m.accountId===account.id&&m.telegramId===target))fail('MAPPING_ALREADY_EXISTS');
  state.mappings.splice(index,1);
  if(kind==='removeuser'){state.reset=null;return {state,changed:true};}
 }
 if(kind==='setmerchant'&&state.mappings.some(m=>m.accountId!==account.id))fail('RESET_GROUP_FIRST');
 if(state.mappings.some(m=>m.accountId===account.id&&m.telegramId===target))return {state,changed:false};
 if(state.mappings.length>=100)fail('GROUP_MAPPING_LIMIT');
 state.role=role;state.reset=null;
 state.mappings.push({id:randomUUID(),accountId:account.id,telegramId:target,createdAt:new Date(now).toISOString(),createdBy:String(actor)});
 return {state,changed:true};
}
function requestReset(previous,actor,now=Date.now()){
 if(!CONTROLLERS.includes(String(actor)))fail('CONTROLLER_REQUIRED');
 const state=structuredClone(previous||empty()),token=randomBytes(24).toString('base64url');
 state.reset={digest:digest(token),actor:String(actor),expiresAt:now+120000};return {state,token};
}
function confirmReset(previous,actor,token,now=Date.now()){
 if(!CONTROLLERS.includes(String(actor))||typeof token!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(token))fail('RESET_DENIED');
 const reset=previous?.reset;
 if(!reset||reset.actor!==String(actor)||reset.expiresAt<=now||reset.digest!==digest(token))fail('RESET_DENIED');
 return empty();
}
function receiver(state,{mappingId,accountId,telegramId}){
 return state?.role==='user'&&!CONTROLLERS.includes(String(telegramId))&&state.mappings.some(m=>m.id===mappingId&&m.accountId===accountId&&m.telegramId===String(telegramId));
}
module.exports={empty,change,requestReset,confirmReset,receiver};
