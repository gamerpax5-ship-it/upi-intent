'use strict';
// Pairing and device metadata only. Never reads or projects OTP/SMS events.
const {randomUUID,createHash}=require('node:crypto'),v=require('../business/validation'),{fields}=require('../gateway/validation');
const {fail,permit,recent,accountResource,audit}=require('./access'),{canUsePermission}=require('../authorization-policy');
const binding=id=>'wpay-pairing-code:'+id;
function permission(row,action='view'){if(!['user','admin','super_admin','employee'].includes(row.account_type))fail();return row.account_type==='user'?'user.device_pairing.'+action:action==='create'?'devices.pairing.create':'devices.'+action;}
function metadata(link,device,now){
 const seen=device?.last_seen_at?new Date(device.last_seen_at):null,age=seen?+now-+seen:NaN;
 const linked=!!device?.linked,online=linked&&Number.isFinite(age)&&age>=-30000&&age<=120000;
 return {id:link.id,ownerId:link.owner_id,ownerName:link.owner_name,device:link.device_ref,legacyMapping:!link.pairing_id,
  status:!device?'unavailable':!linked?'unpaired':online?'online':'offline',linked,lastSeenAt:seen&&Number.isFinite(+seen)?seen.toISOString():null,
  apkVersion:typeof device?.app_version==='string'?device.app_version:null,validFrom:link.valid_from,validUntil:link.valid_until};
}
class DeviceSetup{
 constructor(devices){this.devices=devices;}
 source(){return this.devices.pairingSource||this.devices.source;}
 async links(c,row,context,body={}){
  const scope=permit(context,permission(row));
  if(body.afterDevice!==undefined&&(typeof body.afterDevice!=='string'||!/^[A-Za-z0-9._:-]{8,160}$/.test(body.afterDevice)))fail('INVALID_INPUT');
  const args=[row.account_type==='user'?row.id:null,row.account_type==='user'?null:scope.tenantIds,body.afterDevice??null];
  return (await c.query(`WITH owned AS (
   SELECT d.id,d.owner_id,d.source_id,d.device_ref,d.pairing_id,d.valid_from,d.valid_until,NULL::timestamptz authority_at FROM wpay_auth.paired_devices d WHERE d.revoked_at IS NULL AND d.valid_from<=CURRENT_TIMESTAMP AND d.valid_until>CURRENT_TIMESTAMP
   UNION ALL SELECT d.id,d.account_id,d.source_id,d.resource_id,NULL::text,d.valid_from,d.valid_until,d.verified_at FROM wpay_auth.resource_links d WHERE d.resource_kind='device' AND d.source_id='legacy-primary' AND d.status='verified' AND d.consent_at<=CURRENT_TIMESTAMP AND d.verified_at<=CURRENT_TIMESTAMP AND d.valid_from<=CURRENT_TIMESTAMP AND d.valid_until>CURRENT_TIMESTAMP AND d.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM wpay_auth.paired_devices n WHERE n.source_id=d.source_id AND n.device_ref=d.resource_id)
  ) SELECT o.*,a.name owner_name,a.tenant_id FROM owned o JOIN wpay_auth.accounts a ON a.id=o.owner_id LEFT JOIN wpay_auth.eligibility e ON e.account_id=a.id
  WHERE a.status='active' AND (a.account_type<>'user' OR e.approval_status='approved') AND ($1::uuid IS NULL OR o.owner_id=$1) AND ($2::text[] IS NULL OR a.tenant_id=ANY($2)) AND ($3::text IS NULL OR o.device_ref COLLATE "C">$3) ORDER BY o.device_ref COLLATE "C" LIMIT 101`,args)).rows;
 }
 async list(c,row,context,body){
  fields(body,['afterDevice']);const all=await this.links(c,row,context,body),links=all.slice(0,100),source=this.source();let observed=[],connected=false;
  try{connected=!!source&&await source.ready();if(connected&&links.length)observed=await source.devices(links);}catch{connected=false;}
  const canCreate=canUsePermission({...context,permissionId:permission(row,'create')}).allowed;
  return {sourceConnected:connected,pairingAvailable:connected&&!!this.devices.bridge,canCreate,canRevoke:canUsePermission({...context,permissionId:permission(row,'revoke')}).allowed,
   pairingStatus:!source||!this.devices.bridge?'not_configured':connected?'ready':'source_unavailable',
   nextDeviceCursor:all.length>100?links.at(-1).device_ref:null,devices:links.map(l=>metadata(l,observed.find(d=>d.id===l.device_ref),row.database_now)),
   message:!links.length?'No linked device':!connected?'Device metadata source unavailable':null};
 }
 async history(c,row,context,body){
  fields(body,['offset']);const offset=body.offset??0;if(!Number.isInteger(offset)||offset<0||offset>100000)fail('INVALID_INPUT');const scope=permit(context,permission(row));
  const rows=(await c.query(`SELECT r.id,r.owner_id,a.name owner_name,r.created_at,r.expires_at,d.device_ref,d.revoked_at,
   CASE WHEN d.id IS NOT NULL THEN 'used' WHEN r.expires_at<=CURRENT_TIMESTAMP THEN 'expired' ELSE 'pending' END AS state
   FROM wpay_auth.legacy_pairing_requests r JOIN wpay_auth.accounts a ON a.id=r.owner_id LEFT JOIN wpay_auth.paired_devices d ON d.request_id=r.id
   WHERE ($1::uuid IS NULL OR r.owner_id=$1) AND ($2::text[] IS NULL OR a.tenant_id=ANY($2)) ORDER BY r.created_at DESC,r.id LIMIT 51 OFFSET $3`,[row.account_type==='user'?row.id:null,row.account_type==='user'?null:scope.tenantIds,offset])).rows;
  return {requests:rows.slice(0,50).map(r=>({...r,canCheck:r.state==='pending'&&r.owner_id===row.id})),hasMore:rows.length>50,offset};
 }
 async create(c,row,context,body){
  v.exactFields(body,['requestId']);v.id(body.requestId);permit(context,permission(row,'create'),accountResource(row,'create'));recent(row);
  if(row.account_type==='user')await require('../business/collection-policy').setup(c,row.id);
  await c.query('SELECT pg_catalog.pg_advisory_xact_lock($1)',[57415914]);
  const old=(await c.query('SELECT * FROM wpay_auth.legacy_pairing_requests WHERE id=$1',[body.requestId])).rows[0];
  if(old){if(old.owner_id!==row.id||+old.expires_at<=+row.database_now||(await c.query('SELECT 1 FROM wpay_auth.paired_devices WHERE request_id=$1',[old.id])).rowCount)fail('CONFLICT');return {id:old.id,pairingCode:this.devices.crypto.open(old.encrypted_code,binding(old.id)),expiresAt:old.expires_at};}
  const source=this.source();if(!source||!this.devices.bridge)fail('OTP_SOURCE_UNAVAILABLE');
  if((await c.query("SELECT count(*)::int n FROM wpay_auth.legacy_pairing_requests WHERE owner_id=$1 AND created_at>CURRENT_TIMESTAMP-interval '1 hour'",[row.id])).rows[0].n>=10)fail('RATE_LIMITED');
  const code=await this.devices.bridge.issue();if(typeof code!=='string'||!/^[A-Z2-9]{8}$/.test(code))fail('OTP_SOURCE_UNAVAILABLE');
  const digest=createHash('sha256').update(code).digest('hex'),proof=await source.pairing(digest);
  if(!proof||proof.status!=='pending'||proof.device_id||+new Date(proof.expires_at)<=+new Date(row.database_now)||!Number.isFinite(+new Date(proof.expires_at)))fail('OTP_SOURCE_UNAVAILABLE');
  await c.query("INSERT INTO wpay_auth.legacy_pairing_requests(id,owner_id,source_id,pairing_id,token_digest,encrypted_code,expires_at) VALUES($1,$2,'legacy-primary',$3,$4,$5,$6)",[body.requestId,row.id,proof.id,digest,this.devices.crypto.seal(code,binding(body.requestId)),proof.expires_at]);
  await audit(c,row.id,row.id,body.requestId,'pairing_code_issued');return {id:body.requestId,pairingCode:code,expiresAt:proof.expires_at};
 }
 async poll(c,row,context,body){
  v.exactFields(body,['requestId']);permit(context,permission(row));recent(row);v.id(body.requestId);
  const request=(await c.query('SELECT * FROM wpay_auth.legacy_pairing_requests WHERE id=$1 AND owner_id=$2',[body.requestId,row.id])).rows[0];if(!request)fail();const source=this.source();if(!source)fail('OTP_SOURCE_UNAVAILABLE');
  const proof=await source.pairing(request.token_digest);if(!proof||proof.id!==request.pairing_id)fail('OTP_SOURCE_UNAVAILABLE');
  if(proof.status==='pending')return {state:+request.expires_at<=+row.database_now?'expired':'pending'};
  if(proof.status!=='claimed'||proof.device_status!=='active'||proof.latest_pairing!==proof.id||!/^[A-Za-z0-9._:-]{8,160}$/.test(proof.device_id)||!Number.isFinite(+new Date(proof.claimed_at))||+new Date(proof.claimed_at)<+request.created_at||+new Date(proof.claimed_at)>+request.expires_at)fail('CONFLICT');
  await c.query('SELECT pg_catalog.pg_advisory_xact_lock($1)',[57415914]);
  const prior=(await c.query("SELECT * FROM wpay_auth.paired_devices WHERE request_id=$1 OR (source_id='legacy-primary' AND device_ref=$2 AND revoked_at IS NULL)",[request.id,proof.device_id])).rows;
  if(prior.length){if(prior.length!==1||prior[0].request_id!==request.id||prior[0].owner_id!==row.id||prior[0].revoked_at)fail('CONFLICT');return {state:'linked',id:prior[0].id,device:proof.device_id};}
  if((await c.query("SELECT 1 FROM wpay_auth.resource_links WHERE source_id='legacy-primary' AND resource_kind='device' AND resource_id=$1 AND status='verified' AND revoked_at IS NULL AND valid_until>CURRENT_TIMESTAMP AND account_id<>$2",[proof.device_id,row.id])).rowCount)fail('CONFLICT');
  const id=randomUUID();await c.query("INSERT INTO wpay_auth.paired_devices(id,owner_id,source_id,device_ref,pairing_id,request_id,valid_from,valid_until) VALUES($1,$2,'legacy-primary',$3,$4,$5,$6,CURRENT_TIMESTAMP+interval '1 year')",[id,row.id,proof.device_id,proof.id,request.id,proof.claimed_at]);
  await audit(c,row.id,row.id,id,'device_ownership_linked');return {state:'linked',id,device:proof.device_id};
 }
 async revoke(c,row,context,body){
  v.exactFields(body,['id']);v.id(body.id);recent(row);
  const link=(await c.query('SELECT d.*,a.tenant_id,a.account_type,a.user_id FROM wpay_auth.paired_devices d JOIN wpay_auth.accounts a ON a.id=d.owner_id WHERE d.id=$1 FOR UPDATE OF d',[body.id])).rows[0];if(!link||row.account_type==='user'&&link.owner_id!==row.id)fail();
  permit(context,permission(row,'revoke'),{kind:'record',id:link.id,tenantId:link.tenant_id,ownerType:link.account_type==='user'?'user':'principal',ownerId:link.user_id||link.owner_id});
  if(!link.revoked_at){await c.query('UPDATE wpay_auth.paired_devices SET revoked_at=CURRENT_TIMESTAMP WHERE id=$1 AND revoked_at IS NULL',[link.id]);await audit(c,row.id,link.owner_id,link.id,'device_ownership_revoked');}return {revoked:true};
 }
}
module.exports={DeviceSetup,metadata,permission};
