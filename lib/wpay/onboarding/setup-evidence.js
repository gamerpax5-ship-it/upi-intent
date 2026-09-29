'use strict';
// Owner-authorized UTR/amount matching for UPI onboarding only. Never supplies
// bank-provider evidence to ledger, gateway, settlement or payout workflows.
const {createHash}=require('node:crypto');
const {readiness}=require('./device-readiness');
const {accountDigest}=require('./evidence');
const minor=value=>{const s=String(value??'');if(!/^\d{1,12}(\.\d{1,2})?$/.test(s))return null;const [n,p='']=s.split('.');return (BigInt(n)*100n+BigInt(p.padEnd(2,'0'))).toString();};
const day=value=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value));
const paymentDigest=utr=>createHash('sha256').update('upi-setup-utr:'+utr).digest('hex');
async function inspect(setup,client,row,context,challenge,bank,selectedUtr){
 if(selectedUtr!==undefined&&(typeof selectedUtr!=='string'||!/^\d{12}$/.test(selectedUtr)))return {state:'invalid_evidence',proof:null};
 const now=Date.now(),start=+new Date(challenge.created_at),end=+new Date(challenge.expires_at);
 if(challenge.owner_id!==row.id||bank.owner_id!==row.id||bank.id!==challenge.bank_id||bank.version!==challenge.bank_version||bank.details.upiId!==challenge.expected_upi||accountDigest(bank.details)!==challenge.account_digest||!Number.isFinite(start)||!Number.isFinite(end)||start>now||now>=end)return {state:'invalid_evidence',proof:null};
 const binding=(await client.query("SELECT metadata->>'deviceRef' AS device FROM wpay_auth.business_audit WHERE entity_id=$1 AND owner_id=$2 AND event='upi_challenge_created' ORDER BY created_at LIMIT 1",[challenge.id,row.id])).rows[0];
 if(!binding?.device)return {state:'restart_required',proof:null};
 const state=await readiness(setup,client,row,context,bank);
 if(!state.devices.some(d=>d.device===binding.device&&['online','offline'].includes(d.status)))return {state:'device_unavailable',proof:null};
 const candidates=new Map();let apkUnavailable=false,before;
 try{
  for(let page=0;page<5;page++){
   const result=await setup.utrs(client,row,context,{device:binding.device,...(before?{before}:{})});
   for(const r of result.records||[]){
    const at=+new Date(r.capturedAt);
    if(r.ownerId!==row.id||r.device!==binding.device||r.historical||r.status!=='CREDIT_RECEIVED'||!/^\d{12}$/.test(r.utr)||minor(r.amount)!==String(challenge.amount_minor)||!Number.isFinite(at)||at<start||at>=end||at>now)continue;
    candidates.set(r.utr,{utr:r.utr,source:'apk-utr-match',receivedAt:new Date(at),precision:'capture-time'});
   }
   if(!result.nextCursor)break;
   before=result.nextCursor;
   if(page===4)return {state:'too_many_records',proof:null};
  }
 }catch{apkUnavailable=true;}
 // Date-only statements cannot establish the bank posting time. Scope them to
 // this owner's current bank/version, today's transaction date and an import
 // made during this live challenge; record that limited precision explicitly.
 const statement=(await client.query(`SELECT c.utr,c.amount_minor::text,c.txn_date,s.created_at
  FROM wpay_auth.bank_statement_credits c JOIN wpay_auth.bank_statement_imports s
  ON s.id=c.import_id AND s.owner_id=c.owner_id AND s.bank_id=c.bank_id AND s.bank_version=c.bank_version
  WHERE c.owner_id=$1 AND c.bank_id=$2 AND c.bank_version=$3 AND s.status='accepted'
  AND s.created_at >= $4 AND s.created_at < $5 AND s.created_at <= CURRENT_TIMESTAMP
  AND c.amount_minor=$6 AND c.txn_date=ANY($7::text[]) ORDER BY s.created_at DESC LIMIT 101`,
 [row.id,bank.id,bank.version,challenge.created_at,challenge.expires_at,challenge.amount_minor,[...new Set([day(start),day(Math.min(now,end-1))])]])).rows;
 if(statement.length>100)return {state:'too_many_records',proof:null};
 for(const r of statement)if(/^\d{12}$/.test(r.utr)&&String(r.amount_minor)===String(challenge.amount_minor)&&!candidates.has(r.utr))candidates.set(r.utr,{utr:r.utr,source:'statement-utr-match',receivedAt:r.created_at,precision:'statement-date/import-time'});
 if(!candidates.size)return {state:apkUnavailable?'apk_unavailable':'pending',proof:null};
 const used=new Set((await client.query('SELECT payment_digest FROM wpay_auth.upi_consumed_evidence WHERE payment_digest=ANY($1::text[])',[[...candidates.keys()].map(paymentDigest)])).rows.map(r=>r.payment_digest));
 const selected=[...candidates.values()].filter(r=>selectedUtr===undefined||r.utr===selectedUtr);
 if(!selected.length)return {state:'pending',proof:null};
 const available=selected.filter(r=>!used.has(paymentDigest(r.utr)));
 if(!available.length)return {state:'duplicate_evidence',proof:null};
 if(available.length!==1)return {state:'ambiguous_evidence',proof:null};
 const match=available[0];
 return {state:'verified',proof:{digest:paymentDigest(match.utr),source:match.source,receivedAt:match.receivedAt,synthetic:false,precision:match.precision}};
}
module.exports={inspect,minor,day,paymentDigest};
