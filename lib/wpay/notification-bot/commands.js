'use strict';
const {id,email,fail}=require('./policy');
const MENU=Object.freeze([
 ['setuser','Link a WPay User with up to 10 @usernames'],['removeuser','Remove one User mapping'],['resetuser','Replace a mapped @username'],
 ['resetgroup','Reset this group after confirmation'],['mappings','List this group mappings'],['setmerchant','Link a Merchant'],
 ['setadmin','Set an Admin notification group'],['status','Show mapped UPI status'],['users','List Users in an Admin group'],['merchants','List Merchants in an Admin group']
].map(([command,description])=>Object.freeze({command,description})));
function parse(text,username){
 if(typeof text!=='string'||text.length>500)return null;
 const parts=text.trim().split(/\s+/),match=/^\/([a-z]+)(?:@([A-Za-z0-9_]+))?$/.exec(parts.shift());
 if(!match||match[2]&&match[2].toLowerCase()!==String(username).toLowerCase())return null;
 const command=match[1];if(!MENU.some(x=>x.command===command))return null;
 const count=n=>{if(parts.length!==n)fail('INVALID_COMMAND_ARGUMENTS');};
 switch(command){
  case 'setuser':{
   if(parts.length>=2&&parts[1].startsWith('@')){const names=parts.slice(1).join(' ').split(/[\s,]+/).filter(Boolean);if(names.length>10||names.some(n=>!n.startsWith('@')))fail('INVALID_COMMAND_ARGUMENTS');return {command,email:email(parts[0]),usernames:[...new Set(names.map(require('./usernames').username))]};}
   count(2);return {command,email:email(parts[0]),telegramId:id(parts[1])};
  }
  case 'removeuser':count(2);return {command,email:email(parts[0]),...(parts[1].startsWith('@')?{telegramUsername:require('./usernames').username(parts[1])}:{telegramId:id(parts[1])})};
  case 'resetuser':count(3);if(parts[2].startsWith('@'))return {command,email:email(parts[0]),oldTarget:parts[1].startsWith('@')?'@'+require('./usernames').username(parts[1]):id(parts[1]),telegramUsername:require('./usernames').username(parts[2])};return {command,email:email(parts[0]),oldId:id(parts[1]),telegramId:id(parts[2])};
  case 'setmerchant':count(1);return {command,email:email(parts[0])};
  case 'setadmin':if(parts.length>1)fail('INVALID_COMMAND_ARGUMENTS');return {command,...(parts.length?{email:email(parts[0])}:{})};
  case 'status':count(1);if(!/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(parts[0]))fail('INVALID_UPI');return {command,upi:parts[0].toLowerCase()};
  case 'users':case 'merchants':case 'mappings':if(parts.length>1||parts.length===1&&!/^[1-9][0-9]{0,3}$/.test(parts[0]))fail('INVALID_PAGE');return {command,page:parts.length?Number(parts[0]):1};
  default:count(0);return {command};
 }
}
module.exports={MENU,parse};
