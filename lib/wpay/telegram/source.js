'use strict';
const {createHash}=require('node:crypto');
const {phones,upi}=require('./commands'),fmt=require('./format');
const {metadata}=require('../operations/device-setup');
const {maskedContent}=require('../operations/masked-content');
const MAX_CURSOR='9223372036854775807';
class Source{
 constructor({pool,pairing,operational,legacy,crypto,tenantIds=[]}){Object.assign(this,{pool,pairing,operational,legacy,crypto,tenantIds});}
 async tenants(){
  if(this.tenantIds.length)return this.tenantIds;
  const rows=(await this.pool.query("SELECT DISTINCT tenant_id FROM wpay_auth.accounts WHERE status='active' ORDER BY tenant_id LIMIT 2")).rows;
  if(rows.length!==1)throw Error('TELEGRAM_TENANT_SCOPE_REQUIRED');return [rows[0].tenant_id];
 }
 async links(includeRevoked=false){
  return (await this.pool.query(`WITH owned AS(
   SELECT id,owner_id,device_ref,pairing_id,valid_from,valid_until,revoked_at,NULL::timestamptz authority_at FROM wpay_auth.paired_devices
   UNION ALL SELECT id,account_id,resource_id,NULL::text,valid_from,valid_until,revoked_at,verified_at FROM wpay_auth.resource_links r
   WHERE resource_kind='device' AND source_id='legacy-primary' AND (status='verified' OR ($2 AND status='revoked')) AND consent_at<=CURRENT_TIMESTAMP AND verified_at<=CURRENT_TIMESTAMP
   AND NOT EXISTS(SELECT 1 FROM wpay_auth.paired_devices p WHERE p.device_ref=r.resource_id AND p.source_id=r.source_id)
  ) SELECT d.*,a.name owner_name,a.tenant_id FROM owned d
   JOIN wpay_auth.accounts a ON a.id=d.owner_id LEFT JOIN wpay_auth.eligibility e ON e.account_id=a.id
   WHERE a.tenant_id=ANY($1) AND a.status='active' AND (a.account_type<>'user' OR e.approval_status='approved')
   AND d.valid_from<=CURRENT_TIMESTAMP AND ($2 OR (d.revoked_at IS NULL AND d.valid_until>CURRENT_TIMESTAMP)) ORDER BY d.device_ref`,[await this.tenants(),includeRevoked])).rows;
 }
 async devices(){
  if(!this.pairing)throw Error('DEVICE_SOURCE_UNAVAILABLE');
  const links=await this.links(),result=[];
  for(let i=0;i<links.length;i+=100){const batch=links.slice(i,i+100),rows=await this.pairing.devices(batch);
   for(const link of batch){const raw=rows.find(d=>d.id===link.device_ref);if(!raw?.linked)continue;const d=metadata(link,raw,new Date());
    d.latitude=fmt.numeric(raw.latitude,-90,90);d.longitude=fmt.numeric(raw.longitude,-180,180);d.battery=fmt.numeric(raw.battery_level,0,100);
    d.phones=phones(raw.phone_e164);d.phone=d.phones[0]||null;result.push({...d,link,pairedAt:raw.paired_at});}
  }return result;
 }
 async device(number){const matches=(await this.devices()).filter(d=>d.phones.includes(number));if(matches.length!==1)throw Error(matches.length?'AMBIGUOUS_DEVICE_NUMBER':'DEVICE_NUMBER_NOT_FOUND');return {...matches[0],phone:number};}
 async history(number){
  const d=await this.device(number),rows=[`Number: ${number}\nPaired: ${fmt.time(d.pairedAt||d.link.valid_from)}\nCurrent observation: ${d.status}\nLast seen: ${fmt.time(d.lastSeenAt)}\nAPK uninstall is not a verified event; offline does not mean deleted.`];
  if(this.pairing.diagnostics){
   const now=Date.now(),from=Math.max(now-48*3600000,Date.parse(d.link.valid_from),Date.parse(d.pairedAt||d.link.valid_from)),until=Date.parse(d.link.valid_until);
   if(!Number.isFinite(from)||!Number.isFinite(until)||from>now||until<=from)throw Error('DEVICE_SOURCE_UNAVAILABLE');
   const history=(await this.pairing.diagnostics(d.device,new Date(from))).filter(h=>{
    const at=Date.parse(h.collected_at);return Number.isFinite(at)&&at>=from&&at<until&&at<=now;
   });
   for(let i=0;i<history.length;i+=10)rows.push(history.slice(i,i+10).map(h=>`${fmt.time(h.collected_at)} | Network: ${fmt.clean(h.network_type)} | Battery: ${fmt.numeric(h.battery_level,0,100)??'Unavailable'}`).join('\n'));
  }return rows;
 }
 async *events(since,{includeMaskedContent=false}={}){
  if(!this.operational?.withRead)throw Error('MASKED_EVENT_SOURCE_UNAVAILABLE');
  const devices=await this.devices();
  for(const d of devices){if(!d.phone)continue;let before=MAX_CURSOR;
   do{
    // Metadata-only by default. Connected notifications explicitly request the
    // existing masked columns, then redact legacy content before yielding it.
    const contentColumns=includeMaskedContent?',e.sender,e.code_mask AS code,e.message_masked AS message':'';
    const rows=await this.operational.withRead(async c=>(await c.query(`SELECT e.id::text,e.sms_received_at,e.otp_length${contentColumns} FROM public.device_otp_events e
     WHERE e.device_id=$1 AND e.id<$2::bigint AND e.created_at>=$3 AND e.created_at>=$4 AND e.created_at<$5
     AND e.sms_received_at>=$4 AND e.sms_received_at<$5 ORDER BY e.id DESC LIMIT 50`,[d.device,before,since,d.link.valid_from,d.link.valid_until])).rows);
    for(const row of rows){
     const content=includeMaskedContent?{sender:fmt.clean(row.sender),maskedMessage:maskedContent(row).message,contentMasked:true}:{};
     yield {id:d.device+':'+row.id,phone:d.phone,phones:d.phones,otpLength:row.otp_length,receivedAt:row.sms_received_at,...content};
    }
    before=rows.length===50?rows.at(-1).id:null;
   }while(before);
  }
 }
 async *historyEvents(since){
  const links=await this.links(true);
  for(let i=0;i<links.length;i+=100){const batch=links.slice(i,i+100),devices=this.pairing?await this.pairing.devices(batch):[];
   for(const link of batch){const d=devices.find(x=>x.id===link.device_ref),number=d?.phone_e164||'Unavailable';
    if(+new Date(link.valid_from)>=+new Date(since))yield {id:link.id+':paired',text:`Number: ${fmt.clean(number)}\nDevice paired: ${fmt.time(link.valid_from)}`};
    if(link.revoked_at&&+new Date(link.revoked_at)>=+new Date(since))yield {id:link.id+':revoked',text:`Number: ${fmt.clean(number)}\nDevice link revoked: ${fmt.time(link.revoked_at)}\nThis does not confirm APK uninstall.`};
   }
  }
 }
 async detail(utrValue){
  const utr=String(utrValue||'').trim();if(!/^\d{12}$/.test(utr))throw Error('INVALID_UTR');
  const tenants=await this.tenants(),digest=createHash('sha256').update(utr).digest('hex'),since=new Date(Date.now()-31*86400000);
  const rows=(await this.pool.query(`SELECT o.id AS order_id,o.state AS payment_status,o.amount_minor::text,o.created_at,o.paid_at,
    c.created_at AS claim_at,m.name AS merchant_name,u.name AS user_name,r.user_id,r.bank_id,r.bank_version,v.details->>'upiId' AS upi,
    COALESCE((SELECT x.state FROM wpay_auth.gateway_outbox x WHERE x.order_id=o.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1),'none') AS callback_state,
    (SELECT x.event_type FROM wpay_auth.gateway_outbox x WHERE x.order_id=o.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) AS callback_event,
    COALESCE(o.paid_at,(SELECT f.created_at FROM wpay_auth.business_financial_events f WHERE f.reservation_id=r.id AND f.utr_digest=c.utr_digest ORDER BY f.created_at DESC LIMIT 1),c.created_at,o.created_at) AS detail_at
   FROM wpay_auth.gateway_claims c JOIN wpay_auth.gateway_orders o ON o.id=c.order_id
   JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id
   JOIN wpay_auth.accounts m ON m.id=o.merchant_id JOIN wpay_auth.accounts u ON u.id=r.user_id
   JOIN wpay_auth.business_bank_versions v ON v.bank_id=r.bank_id AND v.version=r.bank_version
   WHERE c.utr_digest=$1 AND m.tenant_id=ANY($2) AND u.tenant_id=ANY($2)
   AND COALESCE(o.paid_at,c.created_at,o.created_at)>=CURRENT_TIMESTAMP-interval '31 days'
   ORDER BY detail_at DESC,o.id LIMIT 5`,[digest,tenants])).rows;
  const amount=value=>{const n=BigInt(value);return `${n/100n}.${String(n%100n).padStart(2,'0')}`;};
  if(rows.length){
   for(const row of rows){row.utr=utr;row.amount=amount(row.amount_minor);row.callbackStatus=row.callback_state==='delivered'?'success':'failed';row.apkNumber=await this.detailApk(row,utr,since);}
   return rows;
  }
  const statements=(await this.pool.query(`SELECT c.id,c.amount_minor::text,c.created_at AS detail_at,a.name AS user_name,c.owner_id AS user_id,c.bank_id,c.bank_version,
    v.details->>'upiId' AS upi FROM wpay_auth.bank_statement_credits c JOIN wpay_auth.accounts a ON a.id=c.owner_id
    JOIN wpay_auth.business_bank_versions v ON v.bank_id=c.bank_id AND v.version=c.bank_version
    WHERE c.utr=$1 AND a.tenant_id=ANY($2) AND c.created_at>=CURRENT_TIMESTAMP-interval '31 days'
    ORDER BY c.created_at DESC,c.id LIMIT 5`,[utr,tenants])).rows;
  for(const row of statements){row.utr=utr;row.amount=amount(row.amount_minor);row.merchant_name=null;row.payment_status='statement_only';row.callbackStatus='failed';row.apkNumber=await this.detailApk(row,utr,since);}
  return statements;
 }
 async detailApk(record,utr,since){
  if(!this.operational?.transactions||!this.pairing||!record?.user_id||!record?.bank_id)return null;
  try{
   const links=(await this.pool.query(`SELECT l.resource_id AS device_ref,l.account_id AS owner_id,NULL::text AS pairing_id,
      GREATEST(l.valid_from,p.valid_from) AS valid_from,
      LEAST(l.valid_until,p.valid_until,COALESCE(l.revoked_at,l.valid_until),COALESCE(p.revoked_at,p.valid_until)) AS valid_until,
      l.verified_at AS authority_at
    FROM wpay_auth.resource_links l JOIN wpay_auth.resource_links p ON p.id=l.parent_id AND p.account_id=l.account_id AND p.source_id=l.source_id
    WHERE l.account_id=$1 AND p.resource_id=$2::text AND l.resource_kind='device' AND p.resource_kind='receiving_account'
      AND l.source_id='legacy-primary' AND l.status IN('verified','revoked') AND p.status IN('verified','revoked')
      AND l.verified_at IS NOT NULL AND p.verified_at IS NOT NULL
      AND GREATEST(l.valid_from,p.valid_from)<LEAST(l.valid_until,p.valid_until,COALESCE(l.revoked_at,l.valid_until),COALESCE(p.revoked_at,p.valid_until))
      AND LEAST(l.valid_until,p.valid_until,COALESCE(l.revoked_at,l.valid_until),COALESCE(p.revoked_at,p.valid_until))>$3
    ORDER BY l.valid_from DESC LIMIT 20`,[record.user_id,record.bank_id,since])).rows;
   if(!links.length)return null;
   const observed=await this.operational.transactions(links,{utr,includeHistory:true});const hit=observed.rows.find(r=>String(r.utr)===utr);if(!hit)return null;
   const raw=(await this.pairing.devices(links)).find(d=>d.id===hit.device_id),list=phones(raw?.phone_e164);return list.length?list.join(', '):null;
  }catch{return null;}
 }
 async *utrs(selectedUpi,since){
  if(selectedUpi)selectedUpi=upi(selectedUpi);
  if(!this.legacy&&!this.operational?.transactions&&!this.crypto)throw Error('UTR_SOURCE_UNAVAILABLE');
  const tenants=await this.tenants();
  if(this.crypto)for await(const record of require('./hosted-credits').credits(this.pool,this.crypto,tenants,selectedUpi,since)){
   let recordedUpi;try{recordedUpi=upi(record.upi);}catch{continue;}
   yield {...record,upi:recordedUpi};
  }
  // A device can collect for multiple UPIs. Only an explicit verified parent
  // receiving-account mapping may attribute a captured credit to a bank/UPI.
  const links=this.legacy?(await this.pool.query(`SELECT l.*,p.resource_id bank_ref,v.details->>'upiId' upi,
    GREATEST(l.valid_from,p.valid_from) read_from,LEAST(l.valid_until,p.valid_until) read_until
    FROM wpay_auth.resource_links l JOIN wpay_auth.resource_links p ON p.id=l.parent_id AND p.account_id=l.account_id AND p.source_id=l.source_id
    JOIN wpay_auth.accounts a ON a.id=l.account_id LEFT JOIN wpay_auth.eligibility e ON e.account_id=a.id
    JOIN wpay_auth.business_bank_accounts b ON b.id::text=p.resource_id AND b.owner_id=l.account_id
    JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version
    WHERE a.tenant_id=ANY($1) AND a.status='active'
    AND (a.account_type IN('admin','super_admin') OR (a.account_type IN('user','merchant') AND e.approval_status='approved'))
    AND l.resource_kind IN('device','statement_import') AND p.resource_kind='receiving_account' AND l.source_id='legacy-primary'
    AND l.status='verified' AND p.status='verified' AND l.revoked_at IS NULL AND p.revoked_at IS NULL
    AND l.consent_at<=CURRENT_TIMESTAMP AND p.consent_at<=CURRENT_TIMESTAMP AND l.verified_at<=CURRENT_TIMESTAMP AND p.verified_at<=CURRENT_TIMESTAMP
    AND l.valid_from<=CURRENT_TIMESTAMP AND p.valid_from<=CURRENT_TIMESTAMP AND l.valid_until>CURRENT_TIMESTAMP AND p.valid_until>CURRENT_TIMESTAMP
    AND ($2::text IS NULL OR lower(v.details->>'upiId')=$2)
    AND NOT EXISTS(SELECT 1 FROM wpay_auth.paired_devices d WHERE l.resource_kind='device' AND d.device_ref=l.resource_id AND d.revoked_at IS NOT NULL)
    ORDER BY l.id`,[tenants,selectedUpi])).rows:[];
  let deviceMetadata=[];if(links.some(l=>l.resource_kind==='device')){try{deviceMetadata=await this.devices();}catch{/* Unavailable metadata must not fabricate a number. */}}
  for(const link of links){let before=MAX_CURSOR,recordedUpi;try{recordedUpi=upi(link.upi);}catch{continue;}
   const scoped={...link,valid_from:new Date(Math.max(+new Date(link.read_from),since?+new Date(since):0)),valid_until:link.read_until},view=link.resource_kind==='device'?'transactions':'statement';
   const device=view==='transactions'?deviceMetadata.find(d=>d.device===link.resource_id&&d.link.owner_id===link.account_id):null;
   do{const page=await this.legacy.read(scoped,view,before);
    for(const row of page.rows){if(!/^\d{12}$/.test(String(row.utr))||!/^\d+(\.\d{1,2})?$/.test(String(row.amount))||Number(row.amount)<=0)continue;
     yield {id:link.id+':'+row.id,upi:recordedUpi,utr:row.utr,amount:row.amount,source:view==='statement'?'Statement':'SMS',at:row.created_at||row.txn_date||row.matched_at,
      apkNumber:device?.phones?.join(', ')||null};}
    before=page.nextCursor;
   }while(before);
  }
  // Unmapped APK inbox history is intentionally excluded from every bot UTR
  // command, including All. Admin device-history views are unaffected.
 }
}
module.exports={Source};
