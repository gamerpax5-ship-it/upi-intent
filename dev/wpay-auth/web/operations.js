"use strict";
(function(root){
 const titles={devices:'Linked Devices',otp:'OTP Events',employees:'Employees'};
 async function render(options,state={}){
  const {destination,account,request,post,action,el,container,title}=options,page=destination.split('.').at(-1);
  if(['devices','activation'].includes(page)&&root.WPayDeviceSetupPage)return root.WPayDeviceSetupPage.render(options,state);
  if(account.accountType==='user'&&page==='transactions'&&root.WPayUserBurgundyDashboard)return root.WPayUserBurgundyDashboard.payins(options,state);
  if(account.accountType!=='user'&&['transactions','pending-utrs'].includes(page))return root.WPayAdminUtr.render(options,state);
  title.textContent=titles[page]||'Operational access';container.replaceChildren();
  const card=el('section',undefined,'card');container.append(card);
  const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=()=>action(fn);return b;};
  const field=(form,label,value='',type='text')=>{const l=el('label',label),input=el('input');input.type=type;input.value=value;l.append(input);form.append(l);return input;};
  const facts=(node,values)=>{const dl=el('dl',undefined,'facts');for(const [k,v]of Object.entries(values))dl.append(el('dt',k),el('dd',String(v??'—')));node.append(dl);};
  const reload=(next={})=>render(options,next);
  if(page==='transactions'){
   title.textContent=account.accountType==='user'?'Pay-in Transactions':'UTR Center';
   const data=await post('operations/transactions',{offset:state.offset||0});card.append(el('p',data.note,'notice'));
   card.append(button('Refresh verification status',()=>reload(state)));
   if(!data.records.length)card.append(el('p','No transactions'));
   for(const r of data.records){const box=el('article',undefined,'card');facts(box,{'Order':r.orderId,'Merchant reference':r.reference,'Amount (INR paise)':r.amountMinor,'Status':r.status,'Created':r.createdAt,'Paid':r.paidAt,'Evidence':r.evidenceState,'Accounting':r.accountingState,'Bank reference':r.bankId,'Bank version':r.bankVersion,'Recovered':r.recovered,...(r.userId?{'User':r.userId,'Merchant':r.merchantId,'Callback':r.callbackState}:{})});
    if(!r.observations.length)box.append(el('p','No UTR observed'));
    for(const o of r.observations)facts(box,{'UTR':o.utr,'Source':o.source,'Captured':o.capturedAt,'Independently verified':o.verified});card.append(box);
    if(account.accountType!=='user'&&!['successful','cancelled'].includes(r.status)){
     const form=el('form'),utr=field(form,'UTR to verify',r.observations.at(-1)?.utr||''),reason=field(form,'Review reason');
     utr.inputMode='numeric';utr.pattern='[0-9]{12}';utr.maxLength=12;utr.required=true;reason.required=true;reason.minLength=3;reason.maxLength=500;
     const submit=el('button','Verify UTR');submit.type='submit';form.append(submit);
     form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;action(async()=>{submit.disabled=true;try{const result=await post('operations/utr/verify',{orderId:r.orderId,utr:utr.value,reason:reason.value});await reload(state);container.prepend(el('p',result.message,'notice'));}finally{submit.disabled=false;}});};
     box.append(form);
    }
   }
   if(data.offset)card.append(button('Previous page',()=>reload({...state,offset:Math.max(0,data.offset-50)})));
   if(data.hasMore)card.append(button('Next page',()=>reload({...state,offset:data.offset+50})));
   if(account.accountType!=='user'){
    const sources=await post('operations/utr-source',state.afterSource?{afterLink:state.afterSource}:{}),sourceBox=el('section',undefined,'card');sourceBox.append(el('h2','Legacy UTR observations'),el('p','Source observations remain unbound until independent account/order evidence establishes the payment.'));
    if(!sources.links.length)sourceBox.append(el('p','No verified source/account links'));
    const sourceRows=el('div');for(const link of sources.links){const read=async before=>{const result=await post('operations/utr-source',{linkId:link.id,...(before?{before}:{})});sourceRows.replaceChildren();for(const o of result.observations){const item=el('article',undefined,'card');facts(item,o);sourceRows.append(item);}if(!result.observations.length)sourceRows.append(el('p','No observations'));if(result.nextCursor)sourceRows.append(button('Next observations',()=>read(result.nextCursor)));};sourceBox.append(button(link.source+' · '+link.ownerId,()=>read()));}
    if(sources.afterLink)sourceBox.append(button('Next source links',()=>reload({...state,afterSource:sources.afterLink})));if(state.afterSource)sourceBox.append(button('First source links',()=>reload({...state,afterSource:null})));sourceBox.append(sourceRows);card.append(sourceBox);
   }return;
  }
  if(page==='statements'){
   title.textContent='Statements';const data=await request('operations/statements');card.append(el('p',data.message,'notice'));
   if(!data.banks.length)card.append(el('p','No authorized bank accounts'));
   for(const bank of data.banks){const box=el('article',undefined,'card');facts(box,{'User':bank.ownerName,'User account':bank.ownerId,'Bank reference':bank.id,'Current version':bank.version,'Status':bank.status});
    const form=el('form'),file=field(form,'Statement for '+bank.ownerName,'','file');file.accept='.csv,.xls,.xlsx';
    form.append(button('Upload targeted statement',async()=>{const chosen=file.files[0];if(!chosen||chosen.size>1048576)throw Error('Choose a statement up to 1 MiB');const bytes=new Uint8Array(await chosen.arrayBuffer());let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);const result=await post('operations/statement/upload',{ownerId:bank.ownerId,bankId:bank.id,version:bank.version,requestId:crypto.randomUUID(),format:chosen.name.split('.').at(-1).toLowerCase(),base64:btoa(raw)});await reload();container.prepend(el('p',result.status+' · '+result.reason,'notice'));}));box.append(form);
    for(const item of data.imports.filter(i=>i.bank_id===bank.id))box.append(el('p',item.id+' · version '+item.bank_version+' · '+item.status+' · '+item.credit_count+' credits · '+item.created_at));card.append(box);
   }return;
  }
  if(page==='devices'||page==='activation'){
   title.textContent=page==='activation'?'Activation Codes':'Linked Devices';
   const data=await post('operations/devices',state.afterDevice?{afterDevice:state.afterDevice}:{});
   card.append(el('p','Pair the existing WPay APK with a code issued to your account. A device ID alone cannot establish ownership.','notice'));
   if(data.message)card.append(el('p',data.message));
   if(page==='activation'){
   card.append(el('h2','Activate WPay Agent'),el('p','Generate your account-owned activation code, enter it in WPay Agent, then check pairing. Codes expire after 10 minutes.'));
   const generate=button('Generate activation code',async()=>{
    const result=await post('operations/device/create',{requestId:crypto.randomUUID()}),box=el('section',undefined,'business-row'),code=el('code',result.pairingCode);code.dataset.secret='true';
    box.append(el('h2','Enter this code in the existing APK'),code,el('p','Expires '+new Date(result.expiresAt).toLocaleString()),button('Check pairing',async()=>{const r=await post('operations/device/poll',{requestId:result.id});if(r.state==='linked')await reload();else box.append(el('p',r.state));}),button('Hide code',()=>{code.textContent='Hidden';}));card.prepend(box);
    setTimeout(()=>{code.textContent='Hidden';},Math.min(60000,Math.max(0,+new Date(result.expiresAt)-Date.now())));
   });generate.disabled=!data.pairingAvailable;card.append(generate);
   if(!data.pairingAvailable)card.append(el('p',data.pairingStatus==='source_unavailable'?'The device pairing connection is temporarily unavailable. Retry shortly.':'APK activation is not connected to this WPay workspace yet. Ask Admin to configure the pairing connection. No activation code has been issued.','notice'));
   card.append(button('Refresh activation status',()=>reload()));
   for(const pending of data.pending)card.append(button('Check pending pairing · '+new Date(pending.expires_at).toLocaleTimeString(),async()=>{const r=await post('operations/device/poll',{requestId:pending.id});if(r.state==='linked')await reload();else card.append(el('p',r.state));}));
   }if(page==='devices')for(const d of data.devices){const row=el('article',undefined,'business-row');facts(row,{Device:d.device,Status:d.status,'Access until':new Date(d.validUntil).toLocaleString()});row.append(button('Revoke WPay ownership',async()=>{await post(d.legacyMapping?'resources/revoke':'operations/device/revoke',d.legacyMapping?{linkId:d.id}:{id:d.id});await reload();}));card.append(row);}
   if(data.nextDeviceCursor)card.append(button('Next devices',()=>reload({afterDevice:data.nextDeviceCursor})));if(state.afterDevice)card.append(button('First devices',()=>reload()));return;
  }
  if(page==='otp'){
   card.append(el('p','Banking OTP events are separate from your WPay authenticator codes. Content is hidden until you request access.','notice'));
   const form=el('form'),device=field(form,'Device reference',state.device||''),sender=field(form,'Sender (exact match)',state.sender||''),owner=account.accountType==='user'?null:field(form,'User account ID',state.ownerId||'');
   for(const i of [device,sender,owner].filter(Boolean))i.maxLength=160;
   const filters=()=>Object.fromEntries(Object.entries({device:device.value.trim(),sender:sender.value.trim(),ownerId:owner?.value.trim()}).filter(([,v])=>v));
   const search=el('button','Search');search.type='submit';form.append(search);form.onsubmit=e=>{e.preventDefault();action(()=>reload(filters()));};card.append(form);
   const query={...state,reveal:state.reveal===true},data=await post('operations/otp',query);
   const results=el('div');card.append(results);if(data.message)results.append(el('p',data.message));else if(!data.events.length)results.append(el('p','No events for these filters.'));
   let hidden=false;const hide=()=>{hidden=true;results.querySelectorAll('[data-secret]').forEach(n=>{n.textContent='Hidden';});};
   if(data.events.length){card.append(button(state.reveal?'Hide content':'Reveal content (recent MFA required)',()=>state.reveal?(hide(),undefined):reload({...filters(),...(state.before?{before:state.before}:{}),...(state.afterDevice?{afterDevice:state.afterDevice}:{}),reveal:true})));
    for(const e of data.events){const row=el('article',undefined,'business-row');facts(row,{...(account.accountType==='user'?{}:{User:e.ownerName,'Account ID':e.ownerId}),Device:e.device,Status:e.deviceStatus,'APK version':e.apkVersion,Sender:e.sender,Received:new Date(e.receivedAt).toLocaleString()});const code=el('code',e.code);code.dataset.secret='true';row.append(code);if(e.message){const message=el('p',e.message);message.dataset.secret='true';row.append(message);}results.append(row);}
   }
   if(state.reveal){setTimeout(hide,30000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')hide();},{once:true});}
   if(data.nextCursor)card.append(button('Older events',()=>reload({...filters(),...(state.afterDevice?{afterDevice:state.afterDevice}:{}),before:data.nextCursor})));
   if(data.nextDeviceCursor)card.append(button('Next devices',()=>reload({...filters(),afterDevice:data.nextDeviceCursor})));
   card.append(button('Refresh masked events',()=>reload(filters())));void hidden;return;
  }
  if(page==='admins'){
   title.textContent='Admin authority';const data=await post('operations/admins',{offset:state.offset||0,limit:25});
   card.append(el('p','Only explicitly authorized Super Admins may change Admin authority. Tenant grants never imply platform scope. Saving changes invalidates existing sessions. Platform security policy is read-only.','notice'));
   const edit=admin=>{
    card.replaceChildren(el('h2',admin?'Edit Admin authority':'Create tenant-scoped Admin'));
    const form=el('form'),name=field(form,'Name',admin?.name||''),email=field(form,'Email',admin?.email||'','email');name.disabled=email.disabled=!!admin;name.required=email.required=true;
    const statusLabel=el('label','Status'),status=el('select');for(const value of ['active','suspended','disabled']){const o=el('option',value);o.value=value;status.append(o);}status.value=admin?.status||'active';statusLabel.append(status);if(admin)form.append(statusLabel);
    const checks=(label,values,selected,required=[])=>{const box=el('fieldset');box.append(el('legend',label));const list=values.map(([id,label])=>{const l=el('label',label),i=el('input');i.type='checkbox';i.checked=selected.includes(id);i.disabled=required.includes(id);l.prepend(i);box.append(l);return [id,i];});form.append(box);return ()=>list.filter(([,i])=>i.checked).map(([id])=>id);};
    const permissions=checks('Explicit permissions',data.permissions.map(p=>[p.id,p.label]),admin?.permissions||data.requiredPermissions,data.requiredPermissions),tenants=checks('Operational tenants',data.tenantIds.map(id=>[id,id]),admin?.admin_scope?.tenantIds||[]);
    form.append(el('p','Select each tenant explicitly. No platform authority or additional permissions are inferred. New Admins must reset their temporary password and enroll in MFA.','notice'));
    const requestId=crypto.randomUUID(),save=el('button','Save Admin authority');save.type='submit';form.append(save,button('Cancel',()=>reload()));
    form.onsubmit=e=>{e.preventDefault();action(async()=>{
     const result=await post(admin?'operations/admin/update':'operations/admin/create',{requestId,...(admin?{id:admin.id,status:status.value,expectedVersion:admin.permission_version}:{name:name.value,email:email.value}),permissions:permissions(),tenantIds:tenants()});
     if(admin)return reload();card.replaceChildren(el('h2','Admin created'),el('p','The temporary password is shown once. Save it privately. Password reset and authenticator MFA are mandatory.'));
     facts(card,{Email:result.email,'Login URL':result.loginPath});
     if(result.oneTimePassword){const secret=el('code',result.oneTimePassword);secret.dataset.secret='true';result.oneTimePassword=null;const hide=()=>{secret.textContent='Hidden';};setTimeout(hide,60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')hide();},{once:true});card.append(secret,button('Saved · hide password',()=>{hide();return reload();}));}
     else card.append(el('p','This creation request was already completed; its one-time credential is not returned again.'),button('Return to Admins',()=>reload()));
    });};card.append(form);
   };
   card.append(button('Create tenant-scoped Admin',()=>edit()));if(!data.admins.length)card.append(el('p','No Admins in your operational scope.'));
   for(const admin of data.admins){const box=el('article',undefined,'business-row');facts(box,{Name:admin.name,Email:admin.email,Status:admin.status,'Permission version':admin.permission_version,'Platform scope':'Not granted'});box.append(button('Edit '+admin.name,()=>edit(admin)));card.append(box);}
   if(data.hasMore)card.append(button('Next Admins',()=>reload({offset:data.offset+25})));if(state.offset)card.append(button('First Admins',()=>reload()));return;
  }
  if(page==='employees'){
   const data=await post('operations/employees',{offset:state.offset||0,limit:25});
   const edit=employee=>{
    card.replaceChildren(el('h2',employee?'Edit Employee':'Create Employee'));
    const form=el('form'),name=field(form,'Name',employee?.name||''),email=field(form,'Email',employee?.email||'','email');name.required=email.required=true;name.maxLength=100;email.maxLength=254;
    const statusLabel=el('label','Status'),status=el('select');for(const value of ['active','suspended','disabled']){const option=el('option',value);option.value=value;status.append(option);}status.value=employee?.status||'active';statusLabel.append(status);if(employee)form.append(statusLabel);
    const checkGroup=(label,values,selected,required=[])=>{const group=el('fieldset');group.append(el('legend',label));const entries=values.map(([value,text])=>{const l=el('label',text),input=el('input');input.type='checkbox';input.checked=selected.includes(value);input.disabled=required.includes(value);l.prepend(input);group.append(l);return [value,input];});form.append(group);return ()=>entries.filter(([,n])=>n.checked).map(([v])=>v);};
    const permissions=checkGroup('Permissions',data.permissions.map(p=>[p.id,p.label]),employee?.permissions||data.requiredPermissions,data.requiredPermissions),tenantIds=checkGroup('Operational tenants',data.tenantIds.map(t=>[t,t]),employee?.admin_scope?.tenantIds||data.tenantIds);
    form.append(el('p','Saving permission or status changes invalidates every existing Employee session. Employees always enroll in authenticator MFA.','notice'));
    const save=el('button','Save Employee');save.type='submit';form.append(save,button('Cancel',()=>reload()));
    form.onsubmit=e=>{e.preventDefault();action(async()=>{const result=await post(employee?'operations/employee/update':'operations/employee/create',{...(employee?{id:employee.id,status:status.value}:{}),name:name.value,email:email.value,permissions:permissions(),tenantIds:tenantIds()});if(employee)return reload();card.replaceChildren(el('h2','Employee created'),el('p','Save the generated password privately. It is shown once. The temporary password expires in 24 hours. The Employee must choose a new password before mandatory MFA.'));facts(card,{Email:result.email,'Login URL':result.loginPath});const secret=el('code',result.oneTimePassword);secret.dataset.secret='true';result.oneTimePassword=null;setTimeout(()=>{secret.textContent='Hidden';},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')secret.textContent='Hidden';},{once:true});card.append(secret,button('Saved · hide password',()=>{secret.textContent='Hidden';return reload();}));});};card.append(form);
   };
   card.append(button('Create Employee',()=>edit()));if(!data.employees.length)card.append(el('p','No Employees in your operational scope.'));
   for(const employee of data.employees){const row=el('article',undefined,'business-row');facts(row,{Name:employee.name,Email:employee.email,Status:employee.status,'OTP permission':employee.permissions.includes('apk_otp_events.view_all')?'Granted':'Not granted','Permission version':employee.permission_version});row.append(button('Edit '+employee.name,()=>edit(employee)));card.append(row);}
   if(data.hasMore)card.append(button('Next Employees',()=>reload({offset:data.offset+25})));if(state.offset)card.append(button('First Employees',()=>reload()));return;
  }
 }
 root.WPayOperationsPage={render};
})(globalThis);
