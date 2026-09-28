'use strict';
function redact(message,utr){
 if(typeof message!=='string'||!message.trim())return null;
 const text=message.trim().slice(0,3000);
 // Only a body tied to this exact transaction may be displayed. Never treat
 // arbitrary stored text or a credential-bearing SMS as a credit message.
 if(typeof utr!=='string'||!/^\d{12}$/.test(utr)||!text.includes(utr)||/\b(?:otp|pin|password|passcode|verification|login|authenticate|secret)\b/i.test(text))return '[Masked message]';
 return text.replace(/https?:\/\/\S+/giu,'[Masked link]')
  .replace(/[\p{L}\p{N}]*\p{N}[\p{L}\p{N}]*/gu,'[MASKED]')
  .replace(/[\x00-\x1f\x7f]/g,' ').slice(0,1800);
}
async function readMessages(operational,link,rows){
 if(!operational?.withRead||!rows.length)return new Map();
 const ids=rows.map(r=>String(r.id)).filter(id=>/^\d{1,19}$/.test(id)).slice(0,50);
 if(!ids.length)return new Map();
 try{return await operational.withRead(async c=>{
  const result=await c.query(`SELECT id::text,utr,sender,sms_body FROM public.device_transactions
   WHERE device_id=$1 AND id=ANY($2::bigint[]) AND created_at>=$3 AND created_at<$4 AND created_at<=CURRENT_TIMESTAMP`,[link.resource_id,ids,link.valid_from,link.valid_until]);
  const safe=new Map();for(const row of result.rows){const requested=rows.find(r=>String(r.id)===row.id&&r.utr===row.utr);if(!requested)continue;
   safe.set(row.id,{maskedMessage:redact(row.sms_body,row.utr),sender:typeof row.sender==='string'?row.sender.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,120):null});}
  return safe;
 });}catch{return new Map();} // Do not log bodies, credentials or driver messages.
}
module.exports={redact,readMessages};
