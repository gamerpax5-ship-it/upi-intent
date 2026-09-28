'use strict';
function phone(value){const s=String(value||'').replace(/[\s()-]/g,'');if(!/^\+?[1-9][0-9]{7,14}$/.test(s))throw Error('INVALID_PHONE');const n=s.replace(/^\+/,'');return /^[6-9][0-9]{9}$/.test(n)?'91'+n:n;}
function upi(value){const s=String(value||'').trim().toLowerCase();if(!/^[a-z0-9._-]{2,128}@[a-z0-9.-]{2,64}$/.test(s))throw Error('INVALID_UPI');return s;}
function parse(text,botUsername){
 if(typeof text!=='string'||text.length>300)return null;
 const m=/^\/([a-z]+)(?:@([a-z0-9_]+))?(?:\s+(.+))?$/i.exec(text.trim());if(!m||m[2]&&m[2].toLowerCase()!==String(botUsername).toLowerCase())return null;
 let command=m[1].toLowerCase(),arg=(m[3]||'').trim();
 if(command==='device'&&/^history\s+/i.test(arg)){command='devicehistory';arg=arg.replace(/^history\s+/i,'');}
 if(command==='ceditutrall')command='creditutrall';
 if(['start','help','stopall','connectall','devicehistoryall','creditutrall'].includes(command)){if(arg)throw Error('UNEXPECTED_ARGUMENT');return {command};}
 if(command==='disconnect'&&arg.toLowerCase()==='all')return {command,all:true};
 if(['status','location','connect','disconnect','devicehistory'].includes(command))return {command,phone:phone(arg)};
 if(command==='creditutr')return {command,upi:upi(arg)};
 return null;
}
function subscription(state,input){
 const s={otpAll:false,phones:[],excluded:[],historyAll:false,utrAll:false,...structuredClone(state||{})};
 if(input.command==='connectall'){s.otpAll=true;s.phones=[];s.excluded=[];}
 if(input.command==='connect'){s.phones=[...new Set([...s.phones,input.phone])];s.excluded=s.excluded.filter(n=>n!==input.phone);}
 if(input.command==='disconnect'&&input.all){s.otpAll=false;s.phones=[];s.excluded=[];}
 else if(input.command==='disconnect'){s.phones=s.phones.filter(n=>n!==input.phone);if(s.otpAll)s.excluded=[...new Set([...s.excluded,input.phone])];}
 if(input.command==='devicehistoryall')s.historyAll=true;
 if(input.command==='creditutrall')s.utrAll=true;
 return s;
}
const watchesPhone=(s,n)=>!!s&&!s.excluded?.includes(n)&&(s.otpAll||s.phones?.includes(n));
module.exports={phone,upi,parse,subscription,watchesPhone};
