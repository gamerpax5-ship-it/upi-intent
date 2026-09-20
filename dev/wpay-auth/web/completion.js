"use strict";
(function(root){
 const pages={'profile.view':'profile','support.view':'support','support_admin.view':'support','guide.view':'guide','notifications.view':'notifications','user.analytics.view':'analytics','merchant.analytics.view':'analytics','reports.view':'reports','reports.export':'reports','users.view':'directory','merchants.view':'directory','webhooks.view':'webhooks','api_credentials.view':'credentials','api_logs.view':'api-logs','devices.view':'devices','settings.view':'settings','ledger.adjust':'adjust','holds.view':'holds','user.trade.view':'trade'};
 async function render(options,state={}){
  const {permission,account,locale,request,post,action,el,container,title}=options,kind=options.destination==='merchant.reports'?'reports':pages[permission],t=k=>{const own=root.WPayCompletionLocales.text(locale,k);return own===k&&root.WPayBusinessLocales?root.WPayBusinessLocales.translate(locale,k):own;};
  title.textContent=root.WPayLocales.translate(locale,'nav.'+permission);container.replaceChildren();const card=el('section',undefined,'card');container.append(card);
  const button=(label,fn)=>{const b=el('button',t(label));b.type='button';b.onclick=()=>action(fn);return b;};
  const field=(form,key,value='',choices)=>{const label=el('label',t(key)),i=el(choices?'select':['message','reply'].includes(key)?'textarea':'input');i.name=key;i.required=true;if(choices)for(const value of choices){const o=el('option',t(value));o.value=value;i.append(o);}else{if(!['message','reply'].includes(key))i.type='text';i.maxLength=['message','reply'].includes(key)?2000:300;}i.value=value;label.append(i);form.append(label);return i;};
  const facts=(node,record)=>{const dl=el('dl',undefined,'facts');for(const [k,v]of Object.entries(record)){if(v===undefined||v===null)continue;dl.append(el('dt',t(k)),el('dd',typeof v==='object'?JSON.stringify(v):t(String(v))));}node.append(dl);};
  const reload=(next=state)=>render(options,next),paging=data=>{if(state.offset)card.append(button('previous',()=>reload({...state,offset:Math.max(0,state.offset-25)})));if(data.nextOffset!==null&&data.nextOffset!==undefined)card.append(button('next',()=>reload({...state,offset:data.nextOffset})));};
  const records=data=>{if(!data.rows.length)card.append(el('p',t('empty'),'notice'));for(const r of data.rows){const article=el('article',undefined,'business-row');facts(article,r);card.append(article);}paging(data);};
  if(kind==='trade'||kind==='guide'){card.append(el('h2',t(kind)),el('p',t(kind==='guide'?'guideBody':'trade')));return;}
  if(kind==='profile'){
   const data=await request('panel/profile');facts(card,{name:account.name,email:account.email,status:account.status});card.append(el('p',t('readOnlyEmail'),'notice'));
   if(data.emailVerification){const e=data.emailVerification;card.append(el('p',t(e.emailOwnershipVerified?'emailVerified':'emailUnverified')),el('p',t(e.providerConfigured?'emailProviderReady':'emailProviderUnavailable')));
    if(e.providerConfigured&&!e.emailOwnershipVerified){const requestId=crypto.randomUUID();card.append(button('requestVerification',async()=>{await post('email/request',{requestId});await reload();}));const verification=el('form'),code=field(verification,'emailVerificationToken');code.type='password';code.autocomplete='off';code.dataset.secret='true';verification.append(button('verifyEmail',async()=>{if(!verification.reportValidity())return;await post('email/verify',{token:code.value});code.value='';await reload();}));card.append(verification);}
   }
   if(data.canEdit){const form=el('form'),name=field(form,'name',account.name);name.maxLength=100;form.append(button('save',async()=>{if(!form.reportValidity())return;const r=await post('panel/profile/update',{name:name.value});account.name=r.name;await reload();}));card.append(form);}return;
  }
  if(kind==='notifications'){
   const data=await post('panel/notifications',{offset:state.offset||0});card.append(el('p',t(data.emailDeliveryConfigured?'emailProviderReady':'delivery'),'notice'));const label=el('label',t('inApp')),input=el('input');input.type='checkbox';input.checked=data.preferences.in_app_notifications;input.disabled=!data.canUpdate;label.append(input);card.append(label);
   if(data.canUpdate)card.append(button('save',async()=>{await post('panel/preferences',{inAppNotifications:input.checked});await reload();}));records(data);return;
  }
  if(kind==='support'){
   const data=await post('panel/support',{offset:state.offset||0});card.append(el('p',t('noSecrets'),'notice'),el('p',t('delivery')));
   if(data.canWrite&&!data.admin){const form=el('form'),subject=field(form,'subject'),message=field(form,'message');subject.maxLength=120;let requestId=crypto.randomUUID();form.append(button('ticket',async()=>{if(!form.reportValidity())return;await post('panel/support/create',{requestId,subject:subject.value,message:message.value});requestId=crypto.randomUUID();await reload({});}));card.append(form);}
   if(!data.rows.length)card.append(el('p',t('empty')));
   for(const r of data.rows){const article=el('article',undefined,'business-row');facts(article,r);if(data.admin&&data.canWrite){const form=el('form'),status=field(form,'status',r.status,['open','resolved']),reply=field(form,'reply');const requestId=crypto.randomUUID();form.append(button('save',async()=>{if(!form.reportValidity())return;await post('panel/support/update',{requestId,id:r.id,status:status.value,message:reply.value});await reload();}));article.append(form);}card.append(article);}paging(data);return;
  }
  if(kind==='directory'){
   const type=permission==='users.view'?'user':'merchant',data=await post('panel/directory',{type,status:state.status||'all',search:state.search||'',offset:state.offset||0});
   const filters=el('form'),status=field(filters,'status',state.status||'all',['all','pending','approved','rejected','suspended','disabled']),search=field(filters,'search',state.search||'');search.required=false;search.maxLength=100;filters.append(button('filter',()=>reload({status:status.value,search:search.value})));card.append(filters);
   async function editor(r,mode){const form=el('form');form.append(el('h3',r.name+' · '+t(mode==='suspend'?'suspend':'terms')));const reason=field(form,'reason');let fields={};
    if(mode==='commercial.update')for(const k of type==='user'?['payinCommission','payoutCommission','inrPerUsdt','depositNetwork','depositAddress']:['payinFee','payoutFee','fixedPayoutFee','fixedFeeCurrency','paymentLinkTtlSeconds','inrPerUsdt']){fields[k]=field(form,k,r.settings?.[k]??'',k==='depositNetwork'?['ETHEREUM-ERC20','TRON-TRC20']:k==='fixedFeeCurrency'?[data.fixedFeeCurrency]:undefined);}
    const requestId=crypto.randomUUID();form.append(button('save',async()=>{if(!form.reportValidity())return;await post('panel/directory/update',{requestId,id:r.id,action:mode,reason:reason.value,settings:mode==='suspend'?null:Object.fromEntries(Object.entries(fields).map(([k,i])=>[k,i.value])),expectedVersion:r.commercialVersion||0});await reload();}));card.replaceChildren(form);
   }
   if(!data.rows.length)card.append(el('p',t('empty')));
   for(const r of data.rows){const article=el('article',undefined,'business-row');facts(article,r);
    if(r.approvalStatus==='pending'&&r.status==='active'&&(data.actions.includes('approve')||data.actions.includes('reject')))article.append(button('review',()=>options.review(r)));
    if(r.status==='active'&&data.actions.includes('suspend'))article.append(button('suspend',()=>editor(r,'suspend')));
    if(r.status==='active'&&r.approvalStatus==='approved'&&data.actions.includes('commercial.update'))article.append(button('terms',()=>editor(r,'commercial.update')));card.append(article);
   }paging(data);return;
  }
  if(kind==='analytics'||kind==='reports'){
   const data=await post('panel/'+kind,{offset:state.offset||0,...(state.from?{from:state.from,to:state.to}:{})});card.append(el('p',t('pageTotals'),'notice'));
   const form=el('form'),from=field(form,'from',state.from||data.from),to=field(form,'to',state.to||data.to);form.append(button('filter',()=>reload({from:from.value,to:to.value})));card.append(form);facts(card,data.totals);records(data);
   if(kind==='reports'&&(permission==='reports.export'||account.accountType==='merchant'))card.append(button('export',async()=>{const exported=await post('panel/reports/export',{offset:state.offset||0,from:data.from,to:data.to});const url=URL.createObjectURL(new Blob([exported.csv],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=url;a.download='wpay-report.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));return;
  }
  if(kind==='settings'){facts(card,await request('panel/settings'));card.append(el('p',t('policy'),'notice'));return;}
  if(kind==='adjust'){
   const form=el('form'),fields={};for(const k of ['ownerId','amountMinor','direction','reference','reason'])fields[k]=field(form,k,k==='direction'?'credit':'',k==='direction'?['credit','debit']:undefined);
   const idempotencyKey=crypto.randomUUID();form.append(button('adjust',async()=>{if(!form.reportValidity())return;const data=await post('business/ledger/adjust',{...Object.fromEntries(Object.entries(fields).map(([k,i])=>[k,i.value])),idempotencyKey});await reload();facts(card,data);}));card.append(form);return;
  }
  if(kind==='holds'){
   const data=await request('business/holds');if(!data.holds.length)card.append(el('p',t('empty')));for(const h of data.holds){const item=el('article',undefined,'business-row');facts(item,h);if(data.canManage&&h.state==='active'){const form=el('form'),reason=field(form,'reason');form.append(button('release',async()=>{if(!form.reportValidity())return;await post('business/holds/update',{id:h.id,ownerId:h.owner_id,amountMinor:h.amount_minor,reference:h.reference,reason:reason.value,release:true});await reload();}));item.append(form);}card.append(item);}
   if(data.canManage){const form=el('form'),fields={};for(const k of ['ownerId','amountMinor','reference','reason'])fields[k]=field(form,k);const category=field(form,'category','hold',['hold','frozen']),id=crypto.randomUUID();form.append(button('hold',async()=>{if(!form.reportValidity())return;await post('business/holds/update',{id,...Object.fromEntries(Object.entries(fields).map(([k,i])=>[k,i.value])),category:category.value,release:false});await reload();}));card.append(form);}return;
  }
  const data=await post('panel/'+kind,{offset:state.offset||0});card.append(el('p',t('metadata'),'notice'));if(kind==='api-logs')card.append(el('p',t('auditOnly')));
  for(const key of ['endpoints','links','pairingRequests'])if(data[key]){card.append(el('h3',t(key)));records(data[key]);}
  if(data.canCreate){const form=el('form'),merchantId=field(form,'merchantId'),label=field(form,'label'),scope=field(form,'scope','orders:read',['orders:read','orders:write','readWrite']);form.append(button('createCredential',async()=>{
   if(!form.reportValidity())return;const result=await post('panel/credentials/create',{merchantId:merchantId.value,label:label.value,scopes:scope.value==='readWrite'?['orders:read','orders:write']:[scope.value]});
   const secret=el('code',result.secret);result.secret=null;secret.dataset.secret='true';card.replaceChildren(el('p',t('saveSecret')),secret,button('hideSecret',()=>reload()));
   const hide=()=>{secret.textContent=t('hidden');};setTimeout(hide,60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')hide();},{once:true});
  }));card.append(form);}
  if(!data.rows.length)card.append(el('p',t('empty')));for(const r of data.rows){const article=el('article',undefined,'business-row');facts(article,r);if(data.canRevoke&&!r.revoked_at)article.append(button('revoke',async()=>{await post('panel/credentials/revoke',{id:r.id});await reload();}));card.append(article);}paging(data);
 }
 root.WPayCompletionPage={pages,render};
})(globalThis);
