"use strict";
const {randomUUID}=require("node:crypto");
const {AuthError}=require("../auth/runtime/errors");
const {exactFields}=require("../auth/runtime/validation");
const {contractFor,projection}=require('./contracts');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KINDS={user:['device','receiving_account','statement_import'],merchant:['order','payment_link','merchant_assignment']};
const audit=(client,account,link,event)=>client.query('INSERT INTO wpay_auth.resource_audit(id,account_id,link_id,event) VALUES($1,$2,$3,$4)',[randomUUID(),account,link,event]);
function recent(row){if(+new Date(row.database_now)-+new Date(require('../auth/runtime/session-assurance').recentAuthenticationAt(row))>300000)throw new AuthError('RECENT_MFA_REQUIRED');}
function cursor(value){if(value===null)return '9223372036854775807';if(typeof value!=='string'||! /^[1-9][0-9]{0,18}$/.test(value)||BigInt(value)>9223372036854775807n)throw new AuthError('INVALID_INPUT');return value;}
class Resources {
  constructor(reader=null){this.reader=reader;}
  async run(client,row,operation,body){
    if(!KINDS[row.account_type])throw new AuthError('FORBIDDEN');
    if(operation==='resources'){
      const result=await client.query(`SELECT id,resource_kind AS kind,resource_id AS reference,status,consent_at,verified_at,valid_until,
        (status='verified' AND consent_at<=CURRENT_TIMESTAMP AND verified_at<=CURRENT_TIMESTAMP
         AND valid_from<=CURRENT_TIMESTAMP AND valid_until>CURRENT_TIMESTAMP AND revoked_at IS NULL AND source_id='legacy-primary') AS readable
        FROM wpay_auth.resource_links WHERE account_id=$1 AND status<>'revoked' ORDER BY consent_at DESC,id LIMIT 100`,[row.id]);
      const linkedDevice=result.rows.some(link=>link.kind==='device'&&link.readable);
      const sourceConnected=Boolean(this.reader&&result.rows.some(link=>link.readable)&&await this.reader.ready().catch(()=>false));
      const otpState=row.account_type==='user'?(!linkedDevice?'no_linked_device':sourceConnected?'ready':'source_unavailable'):null;
      return {sourceConnected,otpState,message:otpState==='no_linked_device'?'No linked device':otpState==='source_unavailable'?'OTP source unavailable':sourceConnected?'Ownership verification required':'Device/source not connected',links:result.rows,revealAvailable:false,
        blocked:['global_matching','statement_upload_matching','payment_link_creation','financial_accounting']};
    }
    if(operation==='resources/request'){
      exactFields(body,['requestId','kind','reference','consent']);recent(row);
      if(!UUID.test(body.requestId)||!KINDS[row.account_type].includes(body.kind)||typeof body.reference!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(body.reference)||body.consent!==true)throw new AuthError('INVALID_INPUT');
      const existing=(await client.query('SELECT account_id,resource_kind,resource_id FROM wpay_auth.resource_links WHERE id=$1',[body.requestId])).rows[0];
      if(existing){if(existing.account_id!==row.id||existing.resource_kind!==body.kind||existing.resource_id!==body.reference)throw new AuthError('CONFLICT');return {requested:true,verified:false};}
      const count=await client.query("SELECT count(*)::integer AS count FROM wpay_auth.resource_links WHERE account_id=$1 AND status<>'revoked'",[row.id]);
      if(count.rows[0].count>=100)throw new AuthError('RATE_LIMITED');
      await client.query("INSERT INTO wpay_auth.resource_links(id,account_id,resource_kind,source_id,resource_id) VALUES($1,$2,$3,'legacy-primary',$4)",[body.requestId,row.id,body.kind,body.reference]);
      await audit(client,row.id,body.requestId,'consent_requested');return {requested:true,verified:false};
    }
    if(operation==='resources/revoke'){
      exactFields(body,['linkId']);recent(row);if(!UUID.test(body.linkId))throw new AuthError('INVALID_INPUT');
      const result=await client.query("UPDATE wpay_auth.resource_links SET status='revoked',revoked_at=CURRENT_TIMESTAMP WHERE id=$1 AND account_id=$2 AND status<>'revoked' RETURNING id",[body.linkId,row.id]);
      if(result.rowCount!==1)throw new AuthError('FORBIDDEN');await audit(client,row.id,body.linkId,'revoked');return {revoked:true};
    }
    if(operation!=='resources/read')throw new AuthError('NOT_FOUND');
    exactFields(body,['linkId','view','before']);if(!UUID.test(body.linkId))throw new AuthError('INVALID_INPUT');const before=cursor(body.before);
    // Hold the mapping row lock through the bounded source read and audit.
    // A concurrent revocation must serialize with this authorized read.
    const link=(await client.query(`SELECT * FROM wpay_auth.resource_links WHERE id=$1 AND account_id=$2 AND status='verified'
      AND consent_at<=CURRENT_TIMESTAMP AND verified_at<=CURRENT_TIMESTAMP AND valid_from<=CURRENT_TIMESTAMP AND valid_until>CURRENT_TIMESTAMP AND revoked_at IS NULL FOR SHARE`,[body.linkId,row.id])).rows[0];
    if(!link||!KINDS[row.account_type].includes(link.resource_kind))throw new AuthError('FORBIDDEN');
    const contract=contractFor(row.account_type,link.resource_kind,body.view);
    if(contract.parent){
      if(!link.parent_id)throw new AuthError('FORBIDDEN');
      const parent=await client.query(`SELECT valid_from,valid_until FROM wpay_auth.resource_links WHERE id=$1 AND account_id=$2 AND source_id=$3
        AND resource_kind='receiving_account' AND status='verified' AND consent_at<=CURRENT_TIMESTAMP AND verified_at<=CURRENT_TIMESTAMP
        AND valid_from<=CURRENT_TIMESTAMP AND valid_until>CURRENT_TIMESTAMP AND revoked_at IS NULL FOR SHARE`,[link.parent_id,row.id,link.source_id]);
      if(parent.rowCount!==1)throw new AuthError('FORBIDDEN');
      link.valid_from=new Date(Math.max(+new Date(link.valid_from),+new Date(parent.rows[0].valid_from)));
      link.valid_until=new Date(Math.min(+new Date(link.valid_until),+new Date(parent.rows[0].valid_until)));
    }
    let result;
    try{
      if(!this.reader||this.reader.sourceId!==link.source_id)throw new AuthError('UNAVAILABLE');
      result=projection(body.view,await this.reader.read(link,body.view,before));
    }catch{throw new AuthError(body.view==='otp'?'OTP_SOURCE_UNAVAILABLE':'UNAVAILABLE');}
    await audit(client,row.id,link.id,{device:'read_device',otp:'read_otp_metadata',transactions:'read_transactions',statement:'read_statement',order:'read_order'}[body.view]);
    return result;
  }
}
module.exports={Resources};
