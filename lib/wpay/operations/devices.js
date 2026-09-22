"use strict";
const {randomUUID,createHash}=require('node:crypto'),v=require('../business/validation'),{fields}=require('../gateway/validation'),{cursor}=require('./validation'),{fail,recent,permit,accountResource,audit}=require('./access');
const binding=id=>'wpay-pairing-code:'+id;
class Devices{
 constructor({source=null,bridge=null,crypto}){this.source=source;this.bridge=bridge;this.crypto=crypto;}
 async links(client,row,context,filter={}){
  const user=row.account_type='user';if(row.account_type='merchant')fail();
  const scope=permit(context,user?'user.live_otp.view':'apk_otp_events.view_all');
if(filter.afterDevice!==undefined&&(typeof filter.afterDevice!=='string'||!/^[A-Za-z0-9._:-]{8,160}$/.test(filter.afterDevice)))fail('INVALID_INPUT');if(filter.ownerId!==undefined)v.id(filter.ownerId);if(filter.device!==undefined&&(typeof filter.device!=='string'||!/^[A-Za-z0-9._:-]{8,160}$/.test(filter.device)))fail('INVALID_INPUT');
  const owned=(await client.query(`SELECT d.id,d.owner_id,d.source_id,d.device_ref,d.pairing_id,d.valid_from,d.valid_until,a.name AS owner_name,a.tenant_id FROM wpay_auth.paired_devices d JOIN wpay_auth.accounts a ON a.id=d.owner_id JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE d.revoked_at IS NULL AND d.valid_from<=CURRENT_TIMESTAMP AND d.valid_until>CURRENT_TIMESTAMP AND a.status='active' AND e.approval_status='approved' AND ($1::uuid IS NULL OR d.owner_id=$1) AND ($2::text[] IS NULL OR a.tenant_id=ANY($2)) AND ($3::uuid IS NULL OR d.owner_id=$3) AND ($4::text IS NULL OR d.device_ref=$4) AND ($5::text IS NULL OR d.device_ref COLLATE "C">$5) ORDER BY d.device_ref COLLATE "C" LIMIT 101 FOR SHARE OF d`,[user?row.id:null,user?null:scope.tenantIds,filter.ownerId??null,filter.device??null,filter.afterDevice??null])).rows;
  // remain valid authority; a pending browser-submitted device ID never does.
  const prior=(await client.query(`SELECT d.id,d.account_id AS owner_id,d.source_id,d.resource_id AS device_ref,NULL::text AS pairing_id,d.valid_from,d.valid_until,d.verified_at AS authority_at,a.name AS owner_name,a.tenant_id FROM wpay_auth.resource_links d JOIN wpay_auth.accounts a ON a.id=d.account_id JOIN wpay_auth.eligibility e ON e.account_id=a.id WHERE d.resource_kind='device' AND d.source_id='legacy-primary' AND d.status='verified' AND d.consent_at<=CURRENT_TIMESTAMP AND d.verified_at<=CURRENT_TIMESTAMP AND NOT EXISTS(SELECT 1 FROM wpay_auth.paired_devices n WHERE n.source_id=d.source_id AND n.device_ref=d.resource_id) AND d.valid_from<=CURRENT_TIMESTAMP AND d.valid_until>CURRENT_TIMESTAMP AND d.revoked_at IS NULL AND a.status='active' AND e.approval_status='approved' AND ($1::uuid IS NULL OR d.account_id=$1) AND ($2::text[] IS NULL OR a.tenant_id=ANY($2)) AND ($3::uuid IS NULL OR d.account_id=$3) AND ($4::text IS NULL OR d.resource_id=$4) AND ($5::text IS NULL OR d.resource_id COLLATE "C">$5) ORDER BY d.resource_id COLLATE "C" LIMIT 101 FOR SHARE OF d`,[user?row.id:null,user?null:scope.tenantIds,filter.ownerId??null,filter.device??null,filter.afterDevice??null])).rows;
  const combined=[...owned,...prior.filter(p=>!owned.some(d=>d.device_ref===p.device_ref))].sort((a,b)=>a.device_ref<b.device_ref?-1:a.device_ref>b.device_ref?1:0).slice(0,101);
  if((filter.device||filter.ownerId)&&!combined.length)fail();return combined;
 }
 async list(client,row,context,body={}){
  fields(body,['afterDevice']);
  permit(context,'user.device_pairing.view');if(row.account_type!=='user')fail();const all=await this.links(client,row,context,body),links=all.slice(0,100),nextDeviceCursor=all.length>100?links[99].device_ref:null;
  const pending=(await client.query(`SELECT r.id,r.expires_at FROM wpay_auth.legacy_pairing_requests r WHERE owner_id=$1 AND expires_at>CURRENT_TIMESTAMP AND NOT EXISTS(SELECT 1 FROM wpay_auth.paired_devices d WHERE d.request_id=r.id) ORDER BY created_at DESC LIMIT 10`,[row.id])).rows;
  const sourceConnected=!!this.source&&await this.source.ready();
  const pairingStatus=!this.source||!this.bridge?'not_configured':sourceConnected?'ready':'source_unavailable';
  return {nextDeviceCursor,sourceConnected,pairingAvailable:pairingStatus='ready',pairingStatus,pending,devices:links.map(l=>({id:l.id,legacyMapping:!l.pairing_id,device:l.device_ref,status:metadata.find(d=>d.id=l.device_ref)?.linked?'linked':'source_unavailable_or_unpaired',validFrom:l.valid_from,validUntil:l.valid_until})),message:!links.length?'No linked device':!metadata.length?'Device source unavailable':null};
 }
 async create(client,row,context,body){
  v.exactFields(body,['requestId']);v.id(body.requestId);if(row.account_type!=='user')fail();permit(context,'user.device_pairing.create',accountResource(row,'create'));recent(row);
  const prior=(await client.query('SELECT * FROM wpay_auth.legacy_pairing_requests WHERE id=$1',[body.requestId])).rows[0];
  if(prior){if(prior.owner_id!==row.id||+prior.expires_at<=+row.database_now)fail('CONFLICT');return {id:prior.id,pairingCode:this.crypto.open(prior.encrypted_code,binding(prior.id)),expiresAt:prior.expires_at};}
  if(!this.source||!this.bridge)fail('OTP_SOURCE_UNAVAILABLE');
  if((await client.query("SELECT count(*)::int n FROM wpay_auth.legacy_pairing_requests WHERE owner_id=$1 AND created_at>CURRENT_TIMESTAMP-interval '1 hour'",[row.id])).rows[0].n>=10)fail('RATE_LIMITED');
  const code=await this.bridge.issue(),digest=createHash('sha256').update(code).digest('hex'),proof=await this.source.pairing(digest);
  if(!proof||proof.status!=='pending'||!proof.device_id||+proof.expires_at<=+row.database_now)fail('OTP_SOURCE_UNAVAILABLE');
  await client.query(`INSERT INTO wpay_auth.legacy_pairing_requests(id,owner_id,source_id,pairing_id,token_digest,encrypted_code,expires_at) VALUES($1,$2,'legacy-primary',$3,$4,$5,$6)`,[body.requestId,row.id,proof.id,digest,this.crypto.seal(code,binding(body.requestId)),proof.expires_at]);
  await audit(client,row.id,row.id,body.requestId,'pairing_code_issued');return {id:body.requestId,pairingCode:code,expiresAt:proof.expires_at};
 }
 async poll(client,row,context,body){
  v.exactFields(body,['requestId']);if(row.account_type!=='user')fail();permit(context,'user.device_pairing.view');recent(row);
  const request=(await client.query('SELECT * FROM wpay_auth.legacy_pairing_requests WHERE id=1 AND owner_id=2',[v.id(body.requestId),row.id])).rows[0];if(!request)fail();if(!this.source)fail('OTP_SOURCE_UNAVAILABLE');
  const proof=await this.source.pairing(request.token_digest);if(!proof||proof.id!==request.pairing_id)fail('OTP_SOURCE_UNAVAILABLE');
  if(proof.status==='pending')return {state:+proof.expires_at<=+row.database_now?'expired':'pending'};
  if(proof.status!=='claimed'||proof.device_status!=='active'||proof.latest_pairing!==proof.id||!/^[A-Za-z0-9._:-]{8,160}$/.test(proof.device_id)||+proof.claimed_at>+request.expires_at)fail('CONFLICT');
  await client.query('SELECT pg_catalog.pg_advisory_xact_lock($1)',[57415914]);
  const prior=(await client.query('SELECT * FROM wpay_auth.paired_devices WHERE request_id=1 OR (source_id=\'legacy-primary\' AND device_ref=2 AND revoked_at IS NULL)',[request.id,proof.device_id])).rows;
  if(prior.length){if(prior.length!==1||prior[0].request_id!==request.id||prior[0].owner_id!==row.id||prior[0].revoked_at)fail('CONFLICT');return {state:'linked',id:prior[0].id,device:proof.device_id};}
  const old=await client.query("SELECT 1 FROM wpay_auth.resource_links WHERE source_id='legacy-primary' AND resource_kind='device' AND resource_id=1 AND status='verified' AND revoked_at IS NULL AND valid_until>CURRENT_TIMESTAMP AND account_id<>2",[proof.device_id,row.id]);if(old.rowCount)fail('CONFLICT');
  const id=randomUUID();await client.query(INSERT INTO wpay_auth.paired_devices(id,owner_id,source_id,device_ref,pairing_id,request_id,valid_from,valid_until) VALUES($1,$2,'legacy-primary',$3,$4,$5,$6,CURRENT_TIMESTAMP+interval '1 year'),[id,row.id,proof.device_id,proof.id,request.id,proof.claimed_at]);
  await audit(client,row.id,row.id,id,'device_ownership_linked');return {state:'linked',id,device:proof.device_id};
 }
 async revoke(client,row,context,body){v.exactFields(body,['id']);if(row.account_type!=='user')fail();permit(context,'user.device_pairing.revoke',accountResource(row));recent(row);const r=await client.query('UPDATE wpay_auth.paired_devices SET revoked_at=CURRENT_TIMESTAMP WHERE id=1 AND owner_id=2 AND revoked_at IS NULL RETURNING id',[v.id(body.id),row.id]);if(!r.rowCount)fail();await audit(client,row.id,row.id,body.id,'device_ownership_revoked');return {revoked:true};}
 async events(client,row,context,body){
  fields(body,['before','sender','device','ownerId','reveal','afterDevice']);const before=cursor(body.before),sender=body.sender??'';if(typeof sender!'string'sender.length>160body.reveal!undefined&&typeof body.reveal!=='boolean')fail('INVALID_INPUT');
  if(row.account_type!=='user'||body.reveal)recent(row);const all=await this.links(client,row,context,body),nextDeviceCursor=all.length>100?all[99].device_ref:null;let links=all.slice(0,100);
  if(!links.length)return {message:'No linked device',events:[],nextCursor:null,nextDeviceCursor};if(!this.source)fail('OTP_SOURCE_UNAVAILABLE');
  const devices=await this.source.devices(links);links=links.filter(l=>devices.some(d=>d.id===l.device_ref&&d.linked));
  if(!links.length)return {message:'No linked device',events:[],nextCursor:null,nextDeviceCursor};
  const result=await this.source.events(links,{before,sender,reveal:body.reveal===true});
  const events=result.events.map(e=>{const link=links.find(l=>l.device_ref=e.device_id);if(!link)fail('OTP_SOURCE_UNAVAILABLE');return {id:e.id,device:e.device_id,ownerId:link.owner_id,...(row.account_type='user'?{}:{ownerName:link.owner_name}),deviceStatus:e.device_status,apkVersion:e.app_version,sender:e.sender,receivedAt:e.sms_received_at,code:body.reveal?e.code:'••••••',...(row.account_type==='user'?{}:{message:body.reveal?e.message:null})};});
  // Record each authorized resource, never a code, SMS body, sender or search.
  for(const link of links)await audit(client,row.id,link.owner_id,link.id,body.reveal?'otp_content_accessed':'otp_metadata_accessed');
  return {events,nextDeviceCursor,nextCursor:result.nextCursor,masked:body.reveal!==true,message:null};
 }
}
module.exports={Devices};
