"use strict";
const {AuthError}=require('../auth/runtime/errors');
// These are observation boundaries, not payment validators or legacy-admin proxies.
const CONTRACTS=Object.freeze({
  device:Object.freeze({role:'user',kinds:['device'],fields:['status','last_seen_at']}),
  otp:Object.freeze({role:'user',kinds:['device'],fields:['id','otp_length','sms_received_at','created_at']}),
  transactions:Object.freeze({role:'user',kinds:['device'],parent:'receiving_account',fields:['id','utr','legacy_status','amount','created_at']}),
  statement:Object.freeze({role:'user',kinds:['statement_import'],parent:'receiving_account',fields:['id','utr','amount','txn_date','matched_at']}),
  order:Object.freeze({role:'merchant',kinds:['order','payment_link'],fields:['id','amount','legacy_status','created_at','expires_at','submitted_utr','submitted_at','verified_at','verification_source']})
});
for(const contract of Object.values(CONTRACTS)){Object.freeze(contract.kinds);Object.freeze(contract.fields);}
function contractFor(role,kind,view){
  const contract=Object.hasOwn(CONTRACTS,view)?CONTRACTS[view]:null;
  if(!contract||contract.role!==role||!contract.kinds.includes(kind))throw new AuthError('FORBIDDEN');
  return contract;
}
function projection(view,result){
  const contract=Object.hasOwn(CONTRACTS,view)?CONTRACTS[view]:null;
  if(!contract)throw new AuthError('FORBIDDEN');
  const pick=row=>Object.fromEntries(contract.fields.filter(key=>Object.hasOwn(row,key)).map(key=>{
    const value=row[key];
    if(value!==null&&!['string','number','boolean'].includes(typeof value)&&!(value instanceof Date))throw new AuthError('UNAVAILABLE');
    return [key,value];
  }));
  const common={financiallyAccounted:false,settled:false,ownershipVerified:true,evidenceVerified:false,
    provenance:{source:'legacy-observation',view},note:'Legacy success or submitted UTR is an observation, not WPay financial confirmation.'};
  if(view==='device')return {...common,device:result.device?pick(result.device):null,
    observedAt:new Date().toISOString(),connectivity:'last-seen-observation'};
  if(!Array.isArray(result.rows)||result.rows.length>50)throw new AuthError('UNAVAILABLE');
  const rows=result.rows.map(row=>view==='otp'?{...pick(row),source:row.source==='sms'?'sms':'unknown',
    content:'Masked',code:'••••••',messageAvailable:false}:pick(row));
  const nextCursor=result.nextCursor;
  if(nextCursor!==null&&(typeof nextCursor!=='string'||!/^[1-9][0-9]{0,18}$/.test(nextCursor)||BigInt(nextCursor)>9223372036854775807n))throw new AuthError('UNAVAILABLE');
  return {...common,rows,nextCursor};
}
module.exports={contractFor,projection};
