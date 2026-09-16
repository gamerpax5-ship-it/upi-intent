"use strict";
const {permit,recent,fail,audit}=require('./access'),{cursor}=require('./validation'),v=require('../business/validation');
class LegacyUtrs {
 constructor(reader=null){this.reader=reader;}
 async read(client,row,context,body){
  if(!['admin','super_admin'].includes(row.account_type))fail();recent(row);const scope=permit(context,'utr_center.view');
  require('../gateway/validation').fields(body,['linkId','before','afterLink']);if(body.linkId)v.id(body.linkId);if(body.afterLink)v.id(body.afterLink);const before=cursor(body.before);
  const links=(await client.query(`SELECT l.*,p.resource_id AS bank_ref,p.valid_from AS parent_from,p.valid_until AS parent_until
   FROM wpay_auth.resource_links l JOIN wpay_auth.resource_links p ON p.id=l.parent_id AND p.account_id=l.account_id AND p.source_id=l.source_id
   JOIN wpay_auth.accounts a ON a.id=l.account_id JOIN wpay_auth.eligibility e ON e.account_id=a.id
   WHERE a.account_type='user' AND a.status='active' AND e.approval_status='approved' AND a.tenant_id=ANY($1)
   AND l.resource_kind IN('device','statement_import') AND p.resource_kind='receiving_account' AND l.source_id='legacy-primary'
   AND l.status='verified' AND p.status='verified' AND l.revoked_at IS NULL AND p.revoked_at IS NULL
   AND l.consent_at<=CURRENT_TIMESTAMP AND p.consent_at<=CURRENT_TIMESTAMP AND l.verified_at<=CURRENT_TIMESTAMP AND p.verified_at<=CURRENT_TIMESTAMP
   AND l.valid_from<=CURRENT_TIMESTAMP AND p.valid_from<=CURRENT_TIMESTAMP AND l.valid_until>CURRENT_TIMESTAMP AND p.valid_until>CURRENT_TIMESTAMP
   AND NOT EXISTS(SELECT 1 FROM wpay_auth.paired_devices d WHERE l.resource_kind='device' AND d.source_id=l.source_id AND d.device_ref=l.resource_id AND d.revoked_at IS NOT NULL)
   AND ($2::uuid IS NULL OR l.id=$2) AND ($3::uuid IS NULL OR l.id>$3) ORDER BY l.id LIMIT 101 FOR SHARE OF l,p`,[scope.tenantIds,body.linkId??null,body.afterLink??null])).rows;
  if(!body.linkId)return {links:links.slice(0,100).map(l=>({id:l.id,ownerId:l.account_id,bankReference:l.bank_ref,source:l.resource_kind})),afterLink:links.length>100?links[99].id:null,sourceConnected:!!this.reader};
  const link=links[0];if(!link)fail();if(!this.reader||this.reader.sourceId!==link.source_id)fail('UNAVAILABLE');
  link.valid_from=new Date(Math.max(+link.valid_from,+link.parent_from));link.valid_until=new Date(Math.min(+link.valid_until,+link.parent_until));
  const view=link.resource_kind==='device'?'transactions':'statement',result=require('../integrations/contracts').projection(view,await this.reader.read(link,view,before));
  const normalize=require('../../statement-match-router'),observations=[];
  for(const item of result.rows){try{observations.push({id:item.id,utr:normalize.normalizeUtr(item.utr),amount:normalize.normalizeAmount(item.amount),currency:'INR',userId:link.account_id,bankReference:link.bank_ref,source:view,capturedAt:item.created_at||item.matched_at||item.txn_date,orderId:null,merchantId:null,evidenceState:'unbound_observation',accountingState:'not_posted',callbackState:'none',recovered:false});}catch{/* Unsupported observations never become proof. */}}
  await audit(client,row.id,link.account_id,link.id,'read_scoped_utr_source');return {observations,nextCursor:result.nextCursor,financialEvidence:false};
 }
}
module.exports={LegacyUtrs};
