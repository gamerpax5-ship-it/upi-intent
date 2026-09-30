'use strict';
const {randomUUID}=require('node:crypto');
const {CONTROLLERS,id,fail}=require('./policy');
const TTL=24*60*60*1000;
function username(value){
 if(typeof value!=='string'||!/^@?[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value))fail('INVALID_TELEGRAM_USERNAME');
 return value.replace(/^@/,'').toLowerCase();
}
const matches=(mapping,target)=>target.startsWith('@')?mapping.telegramUsername===username(target):mapping.telegramId===id(target);
function change(previous,command,account,actor,now=Date.now()){
 const state=structuredClone(previous),kind=command.command;
 if(!CONTROLLERS.includes(String(actor)))fail('CONTROLLER_REQUIRED');
 if(!account||account.account_type!=='user'||account.email!==command.email||(kind!=='removeuser'&&account.status!=='active'))fail('ACCOUNT_NOT_FOUND');
 if(state.role&&state.role!=='user')fail('RESET_GROUP_FIRST');
 if(kind==='removeuser'||kind==='resetuser'){
  const target=kind==='removeuser'?'@'+command.telegramUsername:command.oldTarget;
  const index=state.mappings.findIndex(m=>m.accountId===account.id&&matches(m,target));
  if(index<0)fail('MAPPING_NOT_FOUND');
  if(kind==='resetuser'&&matches(state.mappings[index],'@'+command.telegramUsername))return {state,changed:false};
  if(kind==='resetuser'&&state.mappings.some(m=>m.accountId===account.id&&m.telegramUsername===command.telegramUsername))fail('MAPPING_ALREADY_EXISTS');
  state.mappings.splice(index,1);state.reset=null;
  if(kind==='removeuser')return {state,changed:true};
 }
 const names=[...new Set((command.usernames||[command.telegramUsername]).map(username))];
 if(names.length<1||names.length>10)fail('INVALID_COMMAND_ARGUMENTS');
 let changed=kind==='resetuser';
 for(const name of names){
  const prior=state.mappings.findIndex(m=>m.accountId===account.id&&m.telegramUsername===name);
  // Already-bound aliases never silently rebind to a new numerical identity.
  if(prior>=0){const m=state.mappings[prior];if(m.telegramId||Date.parse(m.createdAt)+TTL>now)continue;state.mappings.splice(prior,1);}
  if(state.mappings.length>=100)fail('GROUP_MAPPING_LIMIT');
  state.mappings.push({id:randomUUID(),accountId:account.id,telegramId:null,telegramUsername:name,createdAt:new Date(now).toISOString(),createdBy:String(actor)});changed=true;
 }
 if(changed){state.role='user';state.reset=null;}return {state,changed};
}
function bind(previous,mappingId,person,now=Date.now()){
 const state=structuredClone(previous),actor=id(person?.id);
 if(state.role!=='user'||person?.is_bot||CONTROLLERS.includes(actor))fail('USERNAME_BIND_DENIED');
 const mapping=state.mappings.find(m=>m.id===mappingId);
 if(!mapping||!person.username||mapping.telegramUsername!==username(person.username))fail('USERNAME_BIND_DENIED');
 if(mapping.telegramId){if(mapping.telegramId!==actor)fail('USERNAME_BIND_DENIED');return {state,changed:false,accountId:mapping.accountId};}
 if(!Number.isFinite(Date.parse(mapping.createdAt))||Date.parse(mapping.createdAt)+TTL<=now)fail('USERNAME_BIND_EXPIRED');
 mapping.telegramId=actor;mapping.boundAt=new Date(now).toISOString();state.reset=null;
 return {state,changed:true,accountId:mapping.accountId};
}
function buttons(state,accountId,names,now=Date.now()){
 const rows=state.mappings.filter(m=>m.accountId===accountId&&names.includes(m.telegramUsername)&&!m.telegramId&&Date.parse(m.createdAt)+TTL>now);
 return rows.length?{inline_keyboard:rows.map(m=>[{text:'Connect @'+m.telegramUsername,callback_data:'nb:bind:'+m.id}])}:undefined;
}
module.exports={username,change,bind,buttons,TTL};
