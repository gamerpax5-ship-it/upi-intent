'use strict';
const {createHash}=require('node:crypto');

const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const validUtr=value=>typeof value==='string'&&/^\d{12}$/.test(value);
function amountToMinor(value){
 const text=String(value??'').trim();
 const m=/^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
 if(!m)return null;
 return (BigInt(m[1])*100n+BigInt((m[2]||'').padEnd(2,'0'))).toString();
}
function proof(snapshot,match){
 return {
  orderId:snapshot.orderId,reservationId:snapshot.reservationId,merchantId:snapshot.merchantId,userId:snapshot.userId,
  bankId:snapshot.bankId,bankVersion:snapshot.bankVersion,upi:snapshot.upi,accountDigest:snapshot.accountDigest,
  amountMinor:snapshot.amountMinor,currency:snapshot.currency,createdAt:snapshot.createdAt,expiresAt:snapshot.expiresAt,
  status:'confirmed',verified:true,final:true,source:match.source,
  evidenceId:match.evidenceId,economicId:match.economicId,utr:match.utr,receivedAt:match.receivedAt,synthetic:false
 };
}
class ClaimedUtrEvidence{
 constructor({pool,operational=null}={}){this.pool=pool;this.operational=operational;}
 async statementMatches(snapshot,claims){
  const rows=(await this.pool.query(`
   SELECT source,id::text,utr,amount_minor::text,created_at FROM (
    SELECT 'statement'::text AS source,c.id,c.utr,c.amount_minor,c.created_at
      FROM wpay_auth.bank_statement_credits c
     WHERE c.owner_id=$1 AND c.bank_id=$2 AND c.bank_version=$3
       AND c.amount_minor=$4 AND c.utr=ANY($5::text[])
    UNION ALL
    SELECT 'statement_bot'::text AS source,c.id,c.utr,c.amount_minor,c.created_at
      FROM wpay_auth.statement_bot_credits c
     WHERE c.user_id=$1 AND c.bank_id=$2 AND c.bank_version=$3
       AND c.amount_minor=$4 AND c.utr=ANY($5::text[])
   ) q ORDER BY created_at,id`,
   [snapshot.userId,snapshot.bankId,snapshot.bankVersion,snapshot.amountMinor,claims])).rows;
  return rows.map(r=>({utr:r.utr,source:'statement',receivedAt:new Date(r.created_at).toISOString(),
   evidenceId:'stmt-'+r.id.replace(/[^A-Za-z0-9_.:-]/g,''),economicId:'utr-'+hash(r.utr).slice(0,32)}));
 }
 async operationalLinks(snapshot){
  return (await this.pool.query(`
   SELECT device_ref,valid_from,valid_until,pairing_id,valid_from AS authority_at
     FROM wpay_auth.paired_devices
    WHERE owner_id=$1 AND revoked_at IS NULL
      AND valid_until>$2::timestamptz
    ORDER BY valid_from DESC LIMIT 100`,[snapshot.userId,snapshot.createdAt])).rows;
 }
 async smsMatches(snapshot,claims){
  if(!this.operational?.transactions||!claims.length)return [];
  const links=await this.operationalLinks(snapshot);if(!links.length)return [];
  const found=[];
  for(const utr of claims){
   let result;try{result=await this.operational.transactions(links,{utr,includeHistory:true});}catch{continue;}
   for(const row of result?.rows||[]){
    const minor=amountToMinor(row.amount);if(minor!==String(snapshot.amountMinor))continue;
    const at=new Date(row.created_at);if(!Number.isFinite(+at)||+at<Date.parse(snapshot.createdAt)||+at>Date.now()+30000)continue;
    found.push({utr,source:'normal',receivedAt:at.toISOString(),evidenceId:'sms-'+String(row.id).replace(/[^A-Za-z0-9_.:-]/g,'').slice(0,80),economicId:'utr-'+hash(utr).slice(0,32)});
   }
  }
  return found;
 }
 async verify(snapshot){
  const claims=[...new Set((snapshot?.claims||[]).filter(validUtr))];
  if(!claims.length)return null;
  const matches=[...await this.statementMatches(snapshot,claims),...await this.smsMatches(snapshot,claims)];
  const byUtr=new Map();
  for(const match of matches)if(!byUtr.has(match.utr)||byUtr.get(match.utr).source==='statement'&&match.source==='normal')byUtr.set(match.utr,match);
  // More than one distinct claimed UTR found for one order is ambiguous: fail closed for manual review.
  if(byUtr.size!==1)return null;
  return proof(snapshot,[...byUtr.values()][0]);
 }
}
module.exports={ClaimedUtrEvidence,amountToMinor};
