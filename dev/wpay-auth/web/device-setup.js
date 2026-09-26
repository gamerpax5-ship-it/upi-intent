"use strict";
(function(root){
 async function render(options,state={}){
  const {destination,account,post,action,el,container,title}=options,page=destination.split('.').at(-1);
  container.replaceChildren();const card=el('section',undefined,'card');container.append(card);
  const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=()=>action(fn);return b;};
  const facts=(node,values)=>{const dl=el('dl',undefined,'facts');for(const [k,v]of Object.entries(values))dl.append(el('dt',k),el('dd',String(v??'—')));node.append(dl);};
  const reload=(next={})=>render(options,next);
  if(page==='devices'||page==='activation'){
   title.textContent=page==='activation'?'Activation Codes':'Linked Devices';
   const data=await post('operations/device-setup',state.afterDevice?{afterDevice:state.afterDevice}:{});
   card.append(el('p','Pair WPay Agent using a code issued to your account. Each code connects one device.','notice'));
   if(data.message)card.append(el('p',data.message));
   if(page==='activation'){
    card.append(el('h2','Activate WPay Agent'),el('p','Enter the generated code in WPay Agent. Its actual expiry is shown with the code. Pairing status refreshes automatically.'));
    let requestId=crypto.randomUUID();
    const generate=button('Generate activation code',async()=>{
     const result=await post('operations/device-setup/create',{requestId});requestId=crypto.randomUUID();
     const box=el('section',undefined,'card pad'),code=el('code',result.pairingCode),status=el('p','Waiting for your APK to pair');code.dataset.secret='true';
     const check=async()=>{const r=await post('operations/device-setup/poll',{requestId:result.id});status.textContent=r.state;if(r.state==='linked'){clearInterval(timer);await reload();}else if(r.state!=='pending')clearInterval(timer);};
     box.append(el('h2','Enter this code in WPay Agent'),code,el('p','Expires '+new Date(result.expiresAt).toLocaleString()),status,button('Check pairing',check),button('Copy code',async()=>{await navigator.clipboard.writeText(result.pairingCode);status.textContent='Code copied';}),button('Hide code',()=>{code.textContent='Hidden';}));card.prepend(box);
     let checking=false;const timer=setInterval(async()=>{if(!box.isConnected||Date.now()>=+new Date(result.expiresAt)){clearInterval(timer);return;}if(checking)return;checking=true;try{await check();}catch{status.textContent='Automatic check paused. Use Check pairing to retry.';clearInterval(timer);}finally{checking=false;}},5000);
     setTimeout(()=>{code.textContent='Hidden';},Math.min(60000,Math.max(0,+new Date(result.expiresAt)-Date.now())));
    });generate.disabled=!data.pairingAvailable||!data.canCreate;card.append(generate);
    if(!data.pairingAvailable)card.append(el('p',data.pairingStatus==='source_unavailable'?'Pairing service is temporarily unavailable. Retry shortly.':'APK pairing is not connected to this workspace. Admin must configure the existing pairing service.','notice'));
    if(!data.canCreate)card.append(el('p','Your account does not have permission to issue pairing codes.','notice'));
    card.append(button('Refresh activation status',()=>reload()));
    const history=await post('operations/pairing-history',{offset:state.historyOffset||0});card.append(el('h2','Activation code history'));
    const table=el('table'),head=el('thead'),heading=el('tr');for(const label of ['Created','Owner','Status','Device','Expires','Action'])heading.append(el('th',label));head.append(heading);table.append(head);const body=el('tbody');
    for(const r of history.requests){const tr=el('tr');for(const value of [new Date(r.created_at).toLocaleString(),r.owner_name,r.state+(r.revoked_at?' · device unlinked':''),r.device_ref||'—',new Date(r.expires_at).toLocaleString()])tr.append(el('td',value));const actions=el('td');if(r.canCheck)actions.append(button('Check pairing',async()=>{await post('operations/device-setup/poll',{requestId:r.id});await reload();}));if(r.canRevoke)actions.append(button('Revoke code',async()=>{await post('operations/device-setup/revokeCode',{requestId:r.id});await reload();}));tr.append(actions);body.append(tr);}table.append(body);const scroll=el('div',undefined,'table-wrap');scroll.append(table);card.append(scroll);if(!history.requests.length)card.append(el('p','No activation codes issued yet.'));
    if(history.offset)card.append(button('Previous codes',()=>reload({historyOffset:Math.max(0,history.offset-50)})));if(history.hasMore)card.append(button('Next codes',()=>reload({historyOffset:history.offset+50})));return;
   }
   const grid=el('div',undefined,'grid equal');card.append(grid);
   for(const d of data.devices){const row=el('article',undefined,'card pad route-card');row.append(el('h2',d.device),el('p',d.status, 'pill'));facts(row,{'Owner':d.ownerName,'Phone':d.phone||'Unavailable','Carrier':d.carrier||'Unavailable','Model':d.model||'Unavailable','APK version':d.apkVersion||'Unavailable','Last seen':d.lastSeenAt?new Date(d.lastSeenAt).toLocaleString():'Unavailable'});
    const detail=el('details'),summary=el('summary','Device details');detail.append(summary);facts(detail,{'WPay link':d.linked?'Linked':'Not currently confirmed','Access until':new Date(d.validUntil).toLocaleString(),'Diagnostics':'Only metadata supplied by the connected service is shown.'});row.append(detail);if(!d.legacyMapping)detail.append(button('Load health & location history',async()=>{const data=await post('operations/device-setup/detail',{id:d.id}),box=el('div'),table=el('table'),head=el('tr');for(const label of ['Time','Battery / health','Network','Location','Location permission'])head.append(el('th',label));table.append(head);for(const h of data.history){const tr=el('tr');for(const value of [new Date(h.at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST',(h.battery??'—')+'% / '+(h.health||'—'),h.network||'—',h.latitude===null||h.longitude===null?'Unavailable':h.latitude+', '+h.longitude,h.locationPermission===null?'Unavailable':h.locationPermission&&h.locationEnabled?'Enabled':'Disabled'])tr.append(el('td',value));table.append(tr);}box.append(el('p','Last 48 hours · one record per 5 minutes'),table);if(!data.history.length)box.append(el('p','No diagnostics available for this pairing.'));detail.querySelector('[data-device-history]')?.remove();box.dataset.deviceHistory='true';detail.append(box);}));
    if(data.canRevoke&&(!d.legacyMapping||account.accountType==='user'))row.append(button('Unlink from WPay',async()=>{await post(d.legacyMapping?'resources/revoke':'operations/device-setup/revoke',d.legacyMapping?{linkId:d.id}:{id:d.id});await reload();}));grid.append(row);
   }
   if(data.nextDeviceCursor)card.append(button('Next devices',()=>reload({afterDevice:data.nextDeviceCursor})));if(state.afterDevice)card.append(button('First devices',()=>reload()));return;
  }
 }
 root.WPayDeviceSetupPage={render};
})(globalThis);
