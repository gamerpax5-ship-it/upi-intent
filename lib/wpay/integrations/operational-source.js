"use strict";
const {Pool}=require('pg'),{AuthError}=require('../auth/runtime/errors');
const unavailable=()=>{throw new AuthError('OTP_SOURCE_UNAVAILABLE');};
async function verify(pool){
 const row=(await pool.query(`SELECT current_user AS name,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
 EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=r.oid) AS memberships,
 pg_catalog.has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
 pg_catalog.has_schema_privilege(current_user,'public','CREATE') AS schema_create,
 pg_catalog.has_column_privilege(current_user,'public.devices','credential_hash','SELECT') AS credentials,
 pg_catalog.has_column_privilege(current_user,'public.devices','sim_fingerprint_hash','SELECT') AS sim_secret,
 EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema') AND c.relkind IN('r','p','v') AND (c.relowner=r.oid OR pg_catalog.has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'))) AS writes,
 EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('devices','device_pairings','device_otp_events') AND pg_catalog.has_table_privilege(r.oid,c.oid,'SELECT')) AS broad_read
 FROM pg_catalog.pg_roles r WHERE rolname=current_user`)).rows[0];
 if(!row||row.name!=='wpay_operational_reader'||Object.entries(row).some(([k,v])=>k!=='name'&&v!==false))unavailable();
}
class OperationalSource{
 constructor(pool){this.pool=pool;this.sourceId='legacy-primary';}
 async withRead(fn){let client;try{await verify(this.pool);client=await this.pool.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL statement_timeout='3s'");const result=await fn(client);await client.query('COMMIT');return result;}catch{if(client)await client.query('ROLLBACK').catch(()=>{});unavailable();}finally{client?.release();}}
 async ready(){try{await this.withRead(c=>c.query('SELECT 1'));return true;}catch{return false;}}
 async pairing(digest){return this.withRead(async c=>(await c.query(`SELECT p.id::text,p.status,p.device_id,p.created_at,p.expires_at,p.claimed_at,d.status AS device_status,
 (SELECT x.id::text FROM public.device_pairings x WHERE x.device_id=p.device_id AND x.status='claimed' ORDER BY x.claimed_at DESC,x.id DESC LIMIT 1) AS latest_pairing
 FROM public.device_pairings p LEFT JOIN public.devices d ON d.id=p.device_id WHERE p.token_hash=$1 LIMIT 1`,[digest])).rows[0]||null);}
 async devices(links){
  if(!Array.isArray(links)||links.length>100)unavailable();if(!links.length)return [];
  return this.withRead(async c=>(await c.query(`SELECT d.id,d.status,d.app_version,d.last_seen_at,
  (SELECT p.id::text FROM public.device_pairings p WHERE p.device_id=d.id AND p.status='claimed' ORDER BY p.claimed_at DESC,p.id DESC LIMIT 1) AS latest_pairing,
  (SELECT p.claimed_at FROM public.device_pairings p WHERE p.device_id=d.id AND p.status='claimed' ORDER BY p.claimed_at DESC,p.id DESC LIMIT 1) AS paired_at
  FROM public.devices d WHERE d.id=ANY($1::text[])`,[links.map(l=>l.device_ref)])).rows.map(d=>({...d,linked:links.some(l=>l.device_ref===d.id&&(l.pairing_id?l.pairing_id===d.latest_pairing:d.paired_at&&+d.paired_at<=+new Date(l.authority_at)))&&d.status==='active'})));
 }
 async events(links,{before='9223372036854775807',sender='',reveal=false}={}){
  if(!Array.isArray(links)||links.length>100)unavailable();if(!links.length)return {events:[],nextCursor:null};
  return this.withRead(async c=>{
   const result=await c.query(`WITH scope AS(SELECT * FROM unnest($1::text[],$2::timestamptz[],$3::timestamptz[],$4::text[],$8::timestamptz[]) AS s(device_ref,valid_from,valid_until,pairing_id,authority_at))
    SELECT e.id::text,e.device_id,e.sender,e.otp_length,e.sms_received_at,e.created_at,e.source,
      CASE WHEN $7 THEN e.code_mask ELSE NULL END AS code,CASE WHEN $7 THEN e.message_masked ELSE NULL END AS message,d.status AS device_status,d.app_version
    FROM public.device_otp_events e JOIN public.devices d ON d.id=e.device_id JOIN scope s ON s.device_ref=d.id
    WHERE d.status='active' AND e.id<$5::bigint AND e.created_at>=s.valid_from AND e.created_at<s.valid_until AND e.sms_received_at>=s.valid_from AND e.sms_received_at<s.valid_until
      AND ((s.pairing_id IS NULL AND (SELECT p.claimed_at FROM public.device_pairings p WHERE p.device_id=d.id AND p.status='claimed' ORDER BY p.claimed_at DESC,p.id DESC LIMIT 1)<=s.authority_at) OR s.pairing_id=(SELECT p.id::text FROM public.device_pairings p WHERE p.device_id=d.id AND p.status='claimed' ORDER BY p.claimed_at DESC,p.id DESC LIMIT 1))
      AND ($6='' OR lower(e.sender)=lower($6)) ORDER BY e.id DESC LIMIT 51`,[links.map(l=>l.device_ref),links.map(l=>l.valid_from),links.map(l=>l.valid_until),links.map(l=>l.pairing_id||null),before,sender,reveal,links.map(l=>l.authority_at||l.valid_from)]);
   return {events:result.rows.slice(0,50),nextCursor:result.rowCount>50?result.rows[49].id:null};
  });
 }
}
function config(env){
 if(!env.WPAY_OPERATIONAL_READER_DATABASE_URL&&!env.WPAY_OPERATIONAL_READER_TARGET)return null;
 try{
  const u=new URL(env.WPAY_OPERATIONAL_READER_DATABASE_URL),port=Number(u.port||5432),db=u.pathname.slice(1),username=decodeURIComponent(u.username),host=u.hostname.replace(/^\[|\]$/g,'');
  const local=['127.0.0.1','::1'].includes(host);
  const privateHost=/^[a-z0-9][a-z0-9-]*\.railway\.internal$/.test(host)&&env.WPAY_HOSTED_NETWORK==='railway-private-network';
  const supabaseHost=host==='aws-0-ap-northeast-2.pooler.supabase.com';
  const supabaseUser='wpay_operational_reader.nzbuvltvqxgtbmicjxag';
  const validUser=supabaseHost?username===supabaseUser:username==='wpay_operational_reader';
  if(!['postgresql:','postgres:'].includes(u.protocol)||!validUser||!u.password||u.search||u.hash||!/^\w{1,63}$/.test(db)||(!local&&!privateHost&&!supabaseHost)||!Number.isInteger(port)||port<1||port>65535||(!local&&port!==5432)||env.WPAY_OPERATIONAL_READER_TARGET!==`${host}:${port}/${db}`)throw 0;
  return {host,port,database:db,user:username,password:decodeURIComponent(u.password),ssl:supabaseHost?{rejectUnauthorized:false}:false,max:2,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:3000,options:'-c search_path=pg_catalog -c default_transaction_read_only=on',application_name:'wpay-operational-source'};
 }catch{unavailable();}
}
function openOperationalSource(env=process.env){const settings=config(env);if(!settings)return {source:null,close:async()=>{}};const pool=new Pool(settings);pool.on('error',()=>{});return {source:new OperationalSource(pool),close:()=>pool.end()};}
module.exports={OperationalSource,openOperationalSource,config};
