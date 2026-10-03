'use strict';
// Decisions only; never mutates a bank or manufactures payment evidence.
// Probe failure is unknown, NOT offline. Caller rechecks under financial lock.
function decide({bank,device,pendingClaims=[],stop,now,settings}){
 if(!Number.isFinite(now))throw Error('INVALID_MONITOR_TIME');
 const seen=Date.parse(device?.lastSeenAt),known=device?.sourceConnected===true;
 const offline=known&&device.status==='offline'&&Number.isFinite(seen)&&seen<=now;
 const online=known&&device.status==='online'&&Number.isFinite(seen)&&seen<=now+30000&&seen>=now-120000;
 const claims=new Map();
 for(const claim of pendingClaims){const at=Date.parse(claim.createdAt);if(claim.orderId&&claim.utrDigest&&Number.isFinite(at)&&at<=now-settings.pendingAgeMs){const prior=claims.get(claim.utrDigest);if(!prior||at<prior.at)claims.set(claim.utrDigest,{orderId:claim.orderId,at});}}
 const pending=new Set([...claims.values()].map(c=>c.orderId)).size;
 const adminManaged=bank.adminManaged===true;
 const reasons=[];if(!adminManaged&&offline&&now-seen>=settings.offlineStopMs)reasons.push('device_offline');if(pending>=settings.threshold)reasons.push('pending_utr');
 const restricted=bank.frozen||bank.deactivated||bank.approvedVersion!==bank.version;
 const ownsStop=stop&&stop.bankVersion===bank.version&&stop.bankUpdatedAt===bank.updatedAt&&bank.status==='stopped'&&bank.reason===stop.reason;
 const priorPending=stop?.reasons?.includes('pending_utr');
 const recoveredDevice=adminManaged||online;
 const overrideActive=stop?.adminOverride===true&&stop.bankVersion===bank.version&&bank.status==='running'&&!restricted&&!(recoveredDevice&&pendingClaims.length===0);
 return {pending,reasons,offlineReminder:offline&&(bank.status==='running'||ownsStop),statementReminder:pending>0,
  overrideActive,stop:bank.status==='running'&&!restricted&&!overrideActive&&reasons.length>0,
  // Even one unresolved claim keeps a threshold stop active. Existing canStart
  // must also approve before the worker applies an otherwise eligible restart.
  restart:!!ownsStop&&!restricted&&recoveredDevice&&!reasons.length&&(!priorPending||pendingClaims.length===0),
  unknown:!online&&!offline};
}
module.exports={decide};
