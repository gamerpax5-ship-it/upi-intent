'use strict';
const {phones,upi}=require('./commands'),fmt=require('./format');
const {metadata}=require('../operations/device-setup');
const {maskedContent}=require('../operations/masked-content');
const {readMessages}=require('./transaction-message');
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
 async *utrs(selectedUpi,since){
  if(selectedUpi)selectedUpi=upi(selectedUpi);
  if(!this.legacy&&!this.operational?.transactions&&!this.crypto)throw Error('UTR_SOURCE_UNAVAILABLE');
  const tenants=await this.tenants(),seen=new Set();
  if(this.crypto)yield* require('./hosted-credits').credits(this.pool,this.crypto,tenants,selectedUpi,since);
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
  for(const link of links){let before=MAX_CURSOR;
   const scoped={...link,valid_from:new Date(Math.max(+new Date(link.read_from),since?+new Date(since):0)),valid_until:link.read_until},view=link.resource_kind==='device'?'transactions':'statement';
   const device=view==='transactions'?deviceMetadata.find(d=>d.device===link.resource_id&&d.link.owner_id===link.account_id):null;
   do{const page=await this.legacy.read(scoped,view,before);
    const messages=view==='transactions'?await readMessages(this.operational,scoped,page.rows):new Map();
    for(const row of page.rows){if(!/^[A-Za-z0-9-]{6,40}$/.test(String(row.utr))||!/^\d+(\.\d{1,2})?$/.test(String(row.amount))||Number(row.amount)<=0)continue;
     if(view==='transactions')seen.add(link.resource_id+':'+row.id);
     yield {id:link.id+':'+row.id,upi:upi(link.upi),utr:row.utr,amount:row.amount,source:view==='statement'?'Statement':'SMS',at:row.created_at||row.txn_date||row.matched_at,
      apkNumber:device?.phones?.join(', ')||null,maskedMessage:messages.get(String(row.id))?.maskedMessage||null,sender:messages.get(String(row.id))?.sender||null};}
    before=page.nextCursor;
   }while(before);
  }
  // All includes device history even when no receiving-account mapping exists.
  // Such rows have no proven UPI: never assign them to a selected UPI.
  if(!selectedUpi&&this.operational?.transactions){
   const owned=await this.links();
   for(let i=0;i<owned.length;i+=100){const batch=owned.slice(i,i+100);let before=MAX_CURSOR;
    let metadata=[];try{metadata=this.pairing?await this.pairing.devices(batch):[];}catch{/* Optional metadata only. */}
    do{const page=await this.operational.transactions(batch,{before,includeHistory:true});
     for(const link of batch){const rows=page.rows.filter(r=>r.device_id===link.device_ref&&!seen.has(r.device_id+':'+r.id)&&(!since||Date.parse(r.created_at)>=Date.parse(since)));
      const raw=metadata.find(d=>d.id===link.device_ref&&d.linked),number=raw?phones(raw.phone_e164).join(', '):null;
      for(let offset=0;offset<rows.length;offset+=50){const chunk=rows.slice(offset,offset+50),messages=await readMessages(this.operational,{resource_id:link.device_ref,valid_from:new Date(0),valid_until:link.valid_until},chunk);
       for(const r of chunk){if(!/^\d{12}$/.test(String(r.utr))||!/^\d+(\.\d{1,2})?$/.test(String(r.amount))||Number(r.amount)<=0)continue;seen.add(r.device_id+':'+r.id);
        yield {id:'device:'+r.device_id+':'+r.id,utr:r.utr,upi:null,amount:r.amount,at:r.created_at,source:'SMS',historical:r.historical===true,apkNumber:number,
         maskedMessage:messages.get(String(r.id))?.maskedMessage||null,sender:messages.get(String(r.id))?.sender||null};
       }
      }
     }before=page.nextCursor;
    }while(before);
   }
  }
 }
}
module.exports={Source};
