"use strict";
const {AuthError}=require("../auth/runtime/errors");
// Queries are fixed and scoped before execution. No legacy mutation or router
// is mounted, and no browser credential is forwarded to the legacy application.
const QUERIES=Object.freeze({
 device:`SELECT status,last_seen_at FROM public.devices WHERE id=$1 LIMIT 1`,
 otp:`SELECT id::text,otp_length,source,sms_received_at,created_at FROM public.device_otp_events
      WHERE device_id=$1 AND id<$2::bigint AND sms_received_at>=$3 AND sms_received_at<$4 ORDER BY device_otp_events.id DESC LIMIT 51`,
 transactions:`SELECT id::text,utr,status AS legacy_status,amount::text,created_at FROM public.device_transactions
      WHERE device_id=$1 AND id<$2::bigint AND created_at>=$3 AND created_at<$4 ORDER BY device_transactions.id DESC LIMIT 51`,
 statement:`SELECT id::text,utr_normalized AS utr,amount::text,txn_date,matched_at FROM public.statement_credit_events
      WHERE import_id=$1 AND id<$2::bigint AND created_at>=$3 AND created_at<$4 ORDER BY statement_credit_events.id DESC LIMIT 51`,
 order:`SELECT p.id,p.amount::text,p.status AS legacy_status,p.created_at,p.expires_at,
      c.utr_display AS submitted_utr,c.submitted_at,c.verified_at,c.verification_source
      FROM public.payment_links p LEFT JOIN public.payment_claims c ON c.payment_id=p.id
      WHERE p.id=$1 AND p.created_at>=$2 AND p.created_at<$3 LIMIT 1`
});
async function createLegacyReader(pool,sourceId='legacy-primary'){
  if(sourceId!=='legacy-primary')throw new AuthError('UNAVAILABLE');
  const check=await pool.query(`SELECT current_user AS name,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,
    EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) AS membership,
    pg_catalog.has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
    pg_catalog.has_column_privilege(current_user,'public.devices','credential_hash','SELECT') AS credentials,
    pg_catalog.has_column_privilege(current_user,'public.device_otp_events','code_mask','SELECT') AS otp,
    pg_catalog.has_column_privilege(current_user,'public.device_otp_events','message_masked','SELECT') AS message,
    pg_catalog.has_column_privilege(current_user,'public.device_transactions','sms_body','SELECT') AS sms,
    pg_catalog.has_column_privilege(current_user,'public.device_transactions','raw_result','SELECT') AS raw_result,
    pg_catalog.has_column_privilege(current_user,'public.payment_links','upi_uri','SELECT') AS upi,
    EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','v') AND
      (c.relowner=r.oid OR pg_catalog.has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'))) AS writes,
    EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('devices','device_otp_events','device_transactions','payment_links')
      AND pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT')) AS broad_sensitive_read
    FROM pg_catalog.pg_roles r WHERE rolname=current_user`);
  const row=check.rows[0];if(!row||row.name!=='wpay_legacy_reader'||Object.entries(row).some(([k,v])=>k!=='name'&&v!==false))throw new AuthError('UNAVAILABLE');
  return Object.freeze({sourceId,async ready(){try{await pool.query({text:'SELECT 1',query_timeout:3000});return true;}catch{return false;}},async read(link,view,before){
    if(!Object.hasOwn(QUERIES,view))throw new AuthError('FORBIDDEN');
    const client=await pool.connect();
    try{
      await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='3s'");
      const params=view==='device'?[link.resource_id]:view==='order'?[link.resource_id,link.valid_from,link.valid_until]:[link.resource_id,before,link.valid_from,link.valid_until];
      const result=await client.query(QUERIES[view],params);await client.query('COMMIT');
      if(view==='device')return {device:result.rows[0]||null,observedAt:new Date().toISOString(),connectivity:'last-seen-observation'};
      const rows=result.rows.slice(0,50).map(item=>view==='otp'?{...item,content:'Masked',code:'••••••',messageAvailable:false}:item);
      return {rows,nextCursor:result.rowCount>50?rows.at(-1).id:null,provenance:{source:'legacy-observation',view},
        note:'Legacy success or submitted UTR is an observation, not WPay financial confirmation.'};
    }catch{await client.query('ROLLBACK').catch(()=>{});throw new AuthError('UNAVAILABLE');}finally{client.release();}
  }});
}
module.exports={createLegacyReader};
