'use strict';
const {binding}=require('../gateway/core');
const amount=value=>{const n=BigInt(value);return `${n/100n}.${String(n%100n).padStart(2,'0')}`;};
// Read-only observations. Bank version and tenant scope come from the actual
// reservation/import, never from the command sender or a guessed device mapping.
async function* credits(pool,crypto,tenants,selectedUpi,since){
 for(const kind of ['payment','statement']){
  let before=null;
  do{
   const rows=(await pool.query(kind==='payment'?`SELECT c.id,c.encrypted_utr,o.id order_id,o.amount_minor::text,f.source,f.created_at,
    v.details->>'upiId' upi
    FROM wpay_auth.gateway_claims c JOIN wpay_auth.gateway_orders o ON o.id=c.order_id
    JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id
    JOIN wpay_auth.business_financial_events f ON f.reservation_id=r.id AND f.utr_digest=c.utr_digest
    JOIN wpay_auth.accounts u ON u.id=r.user_id JOIN wpay_auth.accounts m ON m.id=o.merchant_id
    JOIN wpay_auth.business_bank_accounts b ON b.id=r.bank_id JOIN wpay_auth.accounts owner ON owner.id=b.owner_id
    JOIN wpay_auth.business_bank_versions v ON v.bank_id=r.bank_id AND v.version=r.bank_version
    WHERE u.tenant_id=ANY($1) AND m.tenant_id=ANY($1) AND owner.tenant_id=ANY($1) AND o.state='successful'
    AND ($2::text IS NULL OR lower(v.details->>'upiId')=$2)
    AND ($3::timestamptz IS NULL OR f.created_at>=$3) AND f.created_at<=CURRENT_TIMESTAMP
    AND ($4::uuid IS NULL OR c.id<$4) ORDER BY c.id DESC LIMIT 100`:
   `SELECT c.id,c.utr,c.amount_minor::text,c.created_at,c.txn_date,v.details->>'upiId' upi
    FROM wpay_auth.bank_statement_credits c JOIN wpay_auth.accounts a ON a.id=c.owner_id
    JOIN wpay_auth.business_bank_accounts b ON b.id=c.bank_id AND b.owner_id=c.owner_id
    JOIN wpay_auth.business_bank_versions v ON v.bank_id=c.bank_id AND v.version=c.bank_version
    WHERE a.tenant_id=ANY($1) AND ($2::text IS NULL OR lower(v.details->>'upiId')=$2)
    AND ($3::timestamptz IS NULL OR c.created_at>=$3) AND c.created_at<=CURRENT_TIMESTAMP
    AND ($4::uuid IS NULL OR c.id<$4) ORDER BY c.id DESC LIMIT 100`,[tenants,selectedUpi,since||null,before])).rows;
   for(const r of rows){
    const utr=kind==='payment'?crypto.open(r.encrypted_utr,binding('claim',r.id)):r.utr;
    if(!/^\d{12}$/.test(utr)||!/^\d+$/.test(r.amount_minor)||BigInt(r.amount_minor)<=0n)continue;
    yield {id:`hosted:${kind}:${r.id}`,utr,upi:r.upi||null,amount:amount(r.amount_minor),at:r.created_at,
     source:kind==='statement'?'Statement':r.source==='admin_manual'?'Admin approved':'Verified payment',orderId:r.order_id||null};
   }
   before=rows.length===100?rows.at(-1).id:null;
  }while(before);
 }
}
module.exports={credits};
