'use strict';
(function(root){
 const supported=new Set(['users.view','merchants.view','reports.view','reports.export','settings.view']);
 const labels={payinCommission:'Pay-in commission (%)',payoutCommission:'Payout commission (%)',inrPerUsdt:'INR per USDT',depositNetwork:'USDT network',depositAddress:'USDT address',payinFee:'Pay-in fee (%)',payoutFee:'Payout fee (%)',fixedPayoutFee:'Fixed fee per successful payout (INR)',fixedFeeCurrency:'Fee currency',paymentLinkTtlSeconds:'Payment link expiry (seconds)'};
 const words=s=>labels[s]||String(s).replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
 const money=(s,currency='INR')=>{if(s===null||s===undefined)return '—';const n=BigInt(s),a=n<0n?-n:n;return (n<0n?'−':'')+(currency==='INR'?'₹':currency+' ')+(a/100n).toLocaleString('en-IN')+'.'+String(a%100n).padStart(2,'0');};
 function supports(permission,account){return ['admin','super_admin'].includes(account?.accountType)&&supported.has(permission);}
 async function render(o,state={}){
  const {permission,post,request,action,el,container,title}=o;
  const user=permission==='users.view',directory=['users.view','merchants.view'].includes(permission),settings=permission==='settings.view';
  title.textContent=directory?(user?'Users':'Merchants'):settings?'Platform settings':'Financial reports';
  const card=el('section',undefined,'card admin-panel');container.replaceChildren(card);
  const button=(text,fn,cls='')=>{const b=el('button',text,cls);b.type='button';b.onclick=()=>action(fn);return b;};
  const input=(form,label,value='',choices)=>{const l=el('label',words(label)),i=el(choices?'select':'input');i.name=label;i.required=true;if(choices)for(const value of choices){const p=el('option',words(value));p.value=value;i.append(p);}else i.type='text';i.value=value??'';l.append(i);form.append(l);return i;};
  const reload=(next=state)=>render(o,next);
  const detail=(node,values)=>{const dl=el('dl',undefined,'admin-details');for(const [k,v]of Object.entries(values)){if(v===null||v===undefined)continue;dl.append(el('dt',words(k)),el('dd',typeof v==='boolean'?(v?'Yes':'No'):String(v)));}node.append(dl);};
  const table=(head,rows)=>{const wrap=el('div',undefined,'table-wrap'),t=el('table',undefined,'admin-table'),th=el('thead'),hr=el('tr');head.forEach(h=>hr.append(el('th',h)));th.append(hr);t.append(th);const body=el('tbody');rows.forEach(cells=>{const tr=el('tr');cells.forEach(v=>{const td=el('td');td.append(typeof v==='object'?v:document.createTextNode(v??'—'));tr.append(td);});body.append(tr);});t.append(body);wrap.append(t);card.append(wrap);};
  const paging=data=>{const foot=el('div',undefined,'admin-pagination');foot.append(el('span',data.rows.length?`Showing ${(state.offset||0)+1}–${(state.offset||0)+data.rows.length}`:'No matching records'));if(state.offset)foot.append(button('Previous',()=>reload({...state,offset:Math.max(0,state.offset-25)})));if(data.nextOffset!=null)foot.append(button('Next',()=>reload({...state,offset:data.nextOffset})));card.append(foot);};
  const badge=s=>el('span',words(s),'admin-state '+s);
  if(settings){const data=await request('panel/settings');card.append(el('h2','Authentication & sessions'),el('p','Current server-enforced policy. Change your own email and password from Account settings.','admin-subtitle'));detail(card,data);return;}
  if(directory){
   const type=user?'user':'merchant',data=await post('panel/directory',{type,status:state.status||'all',search:state.search||'',offset:state.offset||0});
   const intro=el('div',undefined,'admin-toolbar');intro.append(el('p',user?'Review registrations and manage user commissions and USDT terms.':'Review registrations and manage merchant fees and settlement rates.','admin-subtitle'),button('Refresh',()=>reload()));if(data.canCreate)intro.append(button(user?'+ Create user':'+ Create merchant',()=>{
    const d=el('dialog'),form=el('form',undefined,'admin-editor');d.append(el('h2',user?'Create user':'Create merchant'),button('Close',()=>d.close()),form);card.append(d);d.onclose=()=>d.remove();
    const name=input(form,'Name'),email=input(form,'Email'),password=input(form,'Password');email.type='email';password.type='password';password.autocomplete='new-password';globalThis.WPayPasswordPolicy.bind(password,'en','establish');
    const approveLabel=el('label','Approve immediately'),approveNow=el('input');approveNow.type='checkbox';approveNow.checked=true;approveLabel.prepend(approveNow);form.append(approveLabel);
    const fields={};
    for(const k of user?['payinCommission','payoutCommission','inrPerUsdt','depositNetwork','depositAddress']:['payinFee','payoutFee','fixedPayoutFee','fixedFeeCurrency','paymentLinkTtlSeconds','inrPerUsdt']){
     fields[k]=input(form,k,k==='fixedPayoutFee'?'6':k==='paymentLinkTtlSeconds'?'900':'',k==='depositNetwork'?['TRON-TRC20','ETHEREUM-ERC20']:k==='fixedFeeCurrency'?[data.fixedFeeCurrency||'']:undefined);
     if(!['depositNetwork','depositAddress','fixedFeeCurrency'].includes(k))fields[k].inputMode='decimal';
    }
    let freeSetup,unlimitedCollection;if(user&&data.actions.includes('commercial.update')){const freeLabel=el('label','Free setup · allow APK/UPI setup without deposit'),unlimitedLabel=el('label','Unlimited collection · capacity-exempt routing');freeSetup=el('input');unlimitedCollection=el('input');freeSetup.type=unlimitedCollection.type='checkbox';freeLabel.prepend(freeSetup);unlimitedLabel.prepend(unlimitedCollection);form.append(freeLabel,unlimitedLabel);}
    form.append(el('p','Admin sets the login password. If “Approve immediately” is enabled, creation is followed by the normal approval/commercial-policy action; no approval rule is bypassed.','notice'));const save=el('button','Create account','primary');save.type='submit';form.append(save);const requestId=crypto.randomUUID(),approvalRequestId=crypto.randomUUID();
    form.onsubmit=e=>{e.preventDefault();action(async()=>{if(!form.reportValidity())return;save.disabled=true;const emailValue=email.value,passwordValue=password.value;try{const created=await post('panel/directory/create',{requestId,type,name:name.value,email:emailValue,password:passwordValue});password.value='';if(approveNow.checked){const settings=Object.fromEntries(Object.entries(fields).map(([k,i])=>[k,i.value]));await post('approval',{requestId:approvalRequestId,accountId:created.id,decision:'approve',settings,reason:''});if(user&&freeSetup&&data.actions.includes('commercial.update'))await post('business/user-access/update',{userId:created.id,freeSetup:freeSetup.checked,unlimitedCollection:unlimitedCollection.checked,reason:'Configured during Admin account creation'});d.close();await reload({status:'approved',search:emailValue,offset:0});}else{d.close();await reload({status:'pending',search:emailValue,offset:0});}}finally{password.value='';save.disabled=false;}});};d.showModal();
   },'primary'));card.append(intro);
   const filter=el('form',undefined,'admin-filters'),search=input(filter,'Search name or email',state.search||''),status=input(filter,'Status',state.status||'all',['all','pending','approved','rejected','suspended','disabled']);search.required=false;search.maxLength=100;
   const submit=el('button','Apply filters','primary');submit.type='submit';filter.append(submit);filter.onsubmit=e=>{e.preventDefault();action(()=>reload({search:search.value,status:status.value}));};card.append(filter);
   const drawer=el('section',undefined,'admin-record-detail');drawer.hidden=true;
   function inspect(r,mode='details'){
    drawer.hidden=false;drawer.replaceChildren();const top=el('div',undefined,'admin-toolbar');top.append(el('h2',r.name),button('Close',async()=>{drawer.hidden=true;}));drawer.append(top);
    detail(drawer,{email:r.email,accountStatus:r.status,approval:r.approvalStatus,accountId:r.id,created:new Date(r.created_at).toLocaleString('en-IN'),termsVersion:r.commercialVersion||0});
    if(r.settings){drawer.append(el('h3','Current commercial terms'));detail(drawer,r.settings);}
    if(mode==='details'){drawer.scrollIntoView({block:'nearest',behavior:'smooth'});return;}
    const form=el('form',undefined,'admin-editor');form.append(el('h3',mode==='suspend'?'Suspend account':'Update commercial terms'));const fields={};
    if(mode==='commercial.update')for(const k of user?['payinCommission','payoutCommission','inrPerUsdt','depositNetwork','depositAddress']:['payinFee','payoutFee','fixedPayoutFee','fixedFeeCurrency','paymentLinkTtlSeconds','inrPerUsdt']){
     fields[k]=input(form,k,r.settings?.[k]??(k==='fixedPayoutFee'?'6':k==='paymentLinkTtlSeconds'?'900':''),k==='depositNetwork'?['TRON-TRC20','ETHEREUM-ERC20']:k==='fixedFeeCurrency'?[data.fixedFeeCurrency||'']:undefined);
     if(!['depositNetwork','depositAddress','fixedFeeCurrency'].includes(k))fields[k].inputMode='decimal';
    }
    const reason=input(form,'Reason');reason.maxLength=500;reason.minLength=3;const save=el('button',mode==='suspend'?'Confirm suspension':'Save terms','primary');save.type='submit';form.append(save);
    let requestId=crypto.randomUUID(),previous;
    form.onsubmit=e=>{e.preventDefault();action(async()=>{if(!form.reportValidity())return;const body={id:r.id,action:mode,reason:reason.value,settings:mode==='suspend'?null:Object.fromEntries(Object.entries(fields).map(([k,i])=>[k,i.value])),expectedVersion:r.commercialVersion||0};const fingerprint=JSON.stringify(body);if(previous&&previous!==fingerprint)requestId=crypto.randomUUID();previous=fingerprint;await post('panel/directory/update',{requestId,...body});await reload();});};drawer.append(form);drawer.scrollIntoView({block:'nearest',behavior:'smooth'});
   }
   if(!data.rows.length)card.append(el('div','No accounts match these filters.','admin-empty'));
   else table(['Account','Status','Commercial terms','Joined','Actions'],data.rows.map(r=>{
    const identity=el('div',undefined,'admin-identity');identity.append(el('strong',r.name),el('small',r.email));
    const terms=el('div');if(r.settings)for(const k of user?['payinCommission','payoutCommission','inrPerUsdt']:['payinFee','payoutFee','fixedPayoutFee','inrPerUsdt'])terms.append(el('div',words(k)+': '+(r.settings[k]??'Not set')));else terms.textContent='Approval required';
    const actions=el('div',undefined,'admin-row-actions');actions.append(button('Details',async()=>inspect(r)));
    if(r.status==='active'&&r.approvalStatus==='pending'&&(data.actions.includes('approve')||data.actions.includes('reject')))actions.append(button('Review',()=>o.review(r),'primary'));
    if(r.status==='active'&&r.approvalStatus==='approved'&&data.actions.includes('commercial.update'))actions.append(button('Edit terms',async()=>inspect(r,'commercial.update')));
    if(r.status==='active'&&data.actions.includes('suspend'))actions.append(button('Suspend',async()=>inspect(r,'suspend'),'danger'));
    return [identity,badge(r.status==='active'?r.approvalStatus:r.status),terms,new Date(r.created_at).toLocaleDateString('en-IN'),actions];
   }));paging(data);card.append(drawer);return;
  }
  const data=await post('panel/reports',{offset:state.offset||0,...(state.from?{from:state.from,to:state.to}:{})});
  card.append(el('p','Posted ledger entries · filter up to 62 days. Amounts below are totals for the visible page, not total business profit.','admin-subtitle'));
  const filter=el('form',undefined,'admin-filters'),from=input(filter,'From',state.from||data.from),to=input(filter,'To',state.to||data.to),apply=el('button','Apply dates','primary');apply.type='submit';filter.append(apply);filter.onsubmit=e=>{e.preventDefault();action(()=>reload({from:from.value,to:to.value}));};card.append(filter);
  const summary=el('div',undefined,'admin-summary-grid');for(const [key,value]of Object.entries(data.totals)){const [currency,type]=key.split(':'),tile=el('article',undefined,'admin-summary-tile');tile.append(el('span',words(type)),el('strong',money(value,currency)));summary.append(tile);}card.append(summary);
  if(!data.rows.length)card.append(el('div','No posted entries in this period.','admin-empty'));else table(['Date','Ledger','Amount','Direction','Account','Reference'],data.rows.map(r=>[new Date(r.created_at).toLocaleString('en-IN'),words(r.ledger_type),money(r.amount_minor,r.currency),badge(r.direction),r.owner_id,r.reference_id]));paging(data);
  if(data.canExport)card.append(button('Download this page (CSV)',async()=>{const exported=await post('panel/reports/export',{offset:state.offset||0,from:data.from,to:data.to}),url=URL.createObjectURL(new Blob([exported.csv],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download='wpay-ledger-page.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
 }
 root.WPayAdminPages={supports,render};
})(globalThis);
