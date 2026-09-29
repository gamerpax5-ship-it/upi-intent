'use strict';
// Exact normalized phone match only; never trust a browser-supplied device ID.
function phone(value){
 const digits=String(value||'').replace(/[ +()-]/g,'');
 if(!/^\d{10,15}$/.test(digits))return null;
 return digits.length===12&&digits.startsWith('91')?digits.slice(2):digits;
}
async function readiness(setup,client,row,context,bank){
 const expected=phone(bank.details.mobile);let afterDevice,devices=[],connected=false;
 if(!expected||!setup)return {ready:false,status:'unavailable',devices:[]};
 for(let page=0;page<10;page++){
  const result=await setup.list(client,row,context,afterDevice?{afterDevice}:{});
  connected=result.sourceConnected===true;
  if(!connected)return {ready:false,status:'unavailable',devices:[]};
  devices.push(...result.devices.filter(d=>d.ownerId===row.id&&phone(d.phone)===expected));
  if(!result.nextDeviceCursor)break;
  if(page===9)return {ready:false,status:'too_many_devices',devices:[]};
  afterDevice=result.nextDeviceCursor;
 }
 const online=devices.filter(d=>d.status==='online'&&d.linked===true);
 // Ambiguous simultaneous devices fail closed; don't pick a source arbitrarily.
 return {ready:online.length===1,status:online.length>1?'ambiguous':online.length===1?'online':devices.length?'offline':'not_linked',
  devices:devices.map(d=>({device:d.device,status:d.status,phone:d.phone,lastSeenAt:d.lastSeenAt,model:d.model})),
  device:online.length===1?online[0].device:null};
}
module.exports={phone,readiness};
