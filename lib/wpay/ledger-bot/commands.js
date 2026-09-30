'use strict';
const email=v=>{const s=String(v||'').trim().toLowerCase();if(!/^[^\s@]{1,128}@[^\s@]{1,190}$/.test(s)||s.length>254)throw Error('INVALID_EMAIL');return s;};
const upi=v=>{const s=String(v||'').trim().toLowerCase();if(!/^[a-z0-9._-]{2,128}@[a-z0-9.-]{2,64}$/.test(s))throw Error('INVALID_UPI');return s;};
const WINDOWS=new Set(['1d','7d','30d','all']);
const LEDGER_FILTERS=new Set(['capacity','commission','fees','holds','payout']);
const NOARG=new Set(['unsetaccount','account','accountstatus','groupinfo','whoami','summary','balance','capacity','available','today','recent','analytics','holds','frozen','reserved','commission','commissionrate','rates','fees','feerate','usdt','deposits','depositaddress','withdrawals','settlement','payins','payouts','parking','health','alerts','refresh','help','topusers','topmerchants','platform','platformfees','platformcapacity','limits']);
function parse(text,username){
 if(typeof text!=='string'||text.length>300)return null;
 const m=/^\/([a-z]+)(?:@([a-z0-9_]+))?(?:\s+(.+))?$/i.exec(text.trim());if(!m)return null;if(m[2]&&m[2].toLowerCase()!==String(username||'').toLowerCase())return null;
 const command=m[1].toLowerCase(),arg=(m[3]||'').trim();
 if(['setuser','switchuser'].includes(command))return {command,email:email(arg),targetType:'user'};
 if(['setmerchant','switchmerchant'].includes(command))return {command,email:email(arg),targetType:'merchant'};
 if(command==='setadmin')return {command,email:email(arg),targetType:'admin'};
 if(['user','merchant'].includes(command))return {command,email:email(arg)};
 if(command==='volume'){const window=(arg||'all').toLowerCase();if(!WINDOWS.has(window))throw Error('INVALID_WINDOW');return {command,window};}
 if(command==='ledger'){
  if(!arg)return {command,limit:10};
  if(/^\d+$/.test(arg)){const limit=Number(arg);if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('INVALID_LIMIT');return {command,limit};}
  const filter=arg.toLowerCase();if(!LEDGER_FILTERS.has(filter))throw Error('INVALID_LEDGER_FILTER');return {command,limit:25,filter};
 }
 if(command==='upi')return arg?{command,upi:upi(arg)}:{command};
 if(command==='upivolume')return {command,upi:upi(arg)};
 if(NOARG.has(command)){if(arg)throw Error('UNEXPECTED_ARGUMENT');return {command};}
 return null;
}
const ADMIN_ONLY=new Set(['user','merchant','topusers','topmerchants','platform','platformfees','platformcapacity']);
const USER_ONLY=new Set(['commissionrate','depositaddress','parking']);
const MERCHANT_ONLY=new Set(['feerate']);
const USER_OR_ADMIN_UPI=new Set(['upivolume','limits']);
const USER_OR_ADMIN=new Set(['capacity','commission','deposits']);
const MERCHANT_OR_ADMIN=new Set(['available','fees','settlement']);
function allowedForRole(command,role){
 if(['whoami','help','setuser','setmerchant','setadmin','switchuser','switchmerchant','unsetaccount'].includes(command))return true;
 if(ADMIN_ONLY.has(command))return role==='admin'||role==='super_admin';
 if(USER_ONLY.has(command))return role==='user';
 if(MERCHANT_ONLY.has(command))return role==='merchant';
 if(USER_OR_ADMIN_UPI.has(command))return role==='user'||role==='admin'||role==='super_admin';
 if(USER_OR_ADMIN.has(command))return role==='user'||role==='admin'||role==='super_admin';
 if(MERCHANT_OR_ADMIN.has(command))return role==='merchant'||role==='admin'||role==='super_admin';
 return ['user','merchant','admin','super_admin'].includes(role);
}
module.exports={parse,allowedForRole,ADMIN_ONLY,USER_ONLY,MERCHANT_ONLY,USER_OR_ADMIN,MERCHANT_OR_ADMIN,USER_OR_ADMIN_UPI,WINDOWS,LEDGER_FILTERS};