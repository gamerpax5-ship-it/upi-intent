"use strict";
const {AuthError}=require('../auth/runtime/errors');
const net=require('./networks');
const POLICY='first-confirmed-2000-usdt-less-100-setup-v1';
const FEE='100000000';
function calculate(receivedMinor,rate,feeMinor='0'){
 const received=BigInt(receivedMinor),fee=BigInt(feeMinor);
 if(received<=fee||fee<0n)throw new AuthError('BELOW_MINIMUM');
 const netMinor=(received-fee).toString();
 return {receivedMinor:received.toString(),setupFeeMinor:fee.toString(),netUsdtMinor:netMinor,creditMinor:net.conversion(netMinor,rate)};
}
// Called under the business ledger mutex. The first accounting event persists even
// after reversal, so a previously funded account is never charged a second time.
async function allocation(c,r,receivedMinor){
 if(r.accounting_version>0){
  const event=(await c.query("SELECT provenance FROM wpay_auth.funding_events WHERE request_id=$1 AND kind='confirmed' ORDER BY created_at,id LIMIT 1",[r.id])).rows[0];
  const prior=event?.provenance||{},fee=prior.setupFeeMinor||'0';
  const result=calculate(receivedMinor,r.snapshot.rate,fee);
  if(result.creditMinor!==r.credit_minor||(prior.receivedMinor&&prior.receivedMinor!==receivedMinor))throw new AuthError('EVIDENCE_REVIEW');
  return result;
 }
 let fee='0';
 if(r.snapshot.initialPolicy===POLICY&&!r.snapshot.freeSetup){
  const history=await c.query('SELECT 1 FROM wpay_auth.funding_requests WHERE owner_id=$1 AND accounting_version>0 LIMIT 1',[r.owner_id]);
  const legacy=await c.query("SELECT 1 FROM wpay_auth.business_entries WHERE owner_id=$1 AND ledger_type='capacity_allocated' AND direction='credit' LIMIT 1",[r.owner_id]);
  const permission=await c.query('SELECT free_setup FROM wpay_auth.user_collection_permissions WHERE user_id=$1',[r.owner_id]);
  if(!history.rowCount&&!legacy.rowCount&&!permission.rows[0]?.free_setup)fee=FEE;
 }
 return calculate(receivedMinor,r.snapshot.rate,fee);
}
module.exports={POLICY,FEE,calculate,allocation};
