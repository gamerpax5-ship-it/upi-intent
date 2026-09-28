'use strict';
// Reuse the verified read-only connection, but never request SMS bodies, raw
// parser output, device credentials or OTP values.
class CreditReader{
 constructor(source){this.source=source;}
 async read(link,view,before){
  if(!this.source?.withRead||!['transactions','statement'].includes(view))throw Error('UTR_SOURCE_UNAVAILABLE');
  const query=view==='transactions'?`SELECT id::text,utr,status AS legacy_status,amount::text,created_at FROM public.device_transactions WHERE device_id=$1 AND id<$2::bigint AND created_at>=$3 AND created_at<$4 ORDER BY id DESC LIMIT 51`:`SELECT id::text,utr_normalized AS utr,amount::text,txn_date,matched_at FROM public.statement_credit_events WHERE import_id=$1 AND id<$2::bigint AND created_at>=$3 AND created_at<$4 ORDER BY id DESC LIMIT 51`;
  const rows=await this.source.withRead(async c=>(await c.query(query,[link.resource_id,before,link.valid_from,link.valid_until])).rows);
  return {rows:rows.slice(0,50),nextCursor:rows.length>50?rows[49].id:null};
 }
}
module.exports={CreditReader};
