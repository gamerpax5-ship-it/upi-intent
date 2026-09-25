"use strict";
(function(root){
 const ledgerTypes=['capacity_allocated','capacity_consumed','capacity_reserved','capacity_hold','user_commission','merchant_gross','merchant_platform_fee','merchant_payout_fee','merchant_adjustment','merchant_hold'];
 function format(value,currency='INR'){const scale=currency==='USDT'?6:2,n=BigInt(value),s=(n<0n?-n:n).toString().padStart(scale+1,'0');return (currency==='INR'?'₹':currency+' ')+(n<0n?'-':'')+s.slice(0,-scale)+'.'+s.slice(-scale);}
 function amount(value){if(!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value))throw Error('error.INVALID_INPUT');const [w,f='']=value.split('.');return (BigInt(w)*100n+BigInt(f.padEnd(2,'0'))).toString();}
 const pages={'overview.view':'dashboard','user.overview.view':'dashboard','merchant.overview.view':'dashboard','user.bank_upi.submit':'bank','user.bank_upi.view':'bank','bank_upi.view':'bank','assignments.view':'assignments','routing.view':'routing','ledger.view':'ledger','merchant.ledger.view':'ledger','merchant.fees.view':'ledger','user.payin_commission.view':'ledger','user.holds.view':'holds','merchant.holds.view':'holds','holds.view':'holds'};
 async function render({permission,account,locale,request,post,action,el,container,title}){
  const page=pages[permission];if(!page)return false;const t=key=>root.WPayBusinessLocales.translate(locale,key);
  const admin=!['user','merchant'].includes(account.accountType);title.textContent=t(page);container.replaceChildren();
  const card=el('section',undefined,'card business-card');container.append(card);
  const btn=(key,fn)=>{const b=el('button',t(key));b.type='button';b.onclick=()=>action(fn);return b;};
  function field(form,key,{value='',optional=false,options}={}){const label=el('label',t(key)),input=el(options?'select':'input');input.name=key;input.required=!optional;
   if(options)for(const [v,labelText]of options){const o=el('option',labelText);o.value=v;input.append(o);}else input.type='text';input.value=value;label.append(input);form.append(label);return input;}
  function facts(node,data){const dl=el('dl',undefined,'facts');for(const [key,value]of Object.entries(data)){dl.append(el('dt',t(key)),el('dd',value));}node.append(dl);}
  function showEmpty(rows){if(!rows.length)card.append(el('p',t('empty'),'notice'));}
  const reload=()=>render({permission,account,locale,request,post,action,el,container,title});
  if(page==='dashboard'){
   const data=await request('business/summary');card.append(el('p',t('foundation'),'notice'));
   if(admin){title.textContent=t('adminOverview');facts(card,{currency:data.currency,financialOperations:t(data.financialOperationsEnabled?'enabled':'disabled')});card.append(el('p',t('adminOverviewHelp')));return true;}
   const keys=account.accountType==='user'?['allocated','reserved','consumed','available','signedAvailable','deficit','held','commission']:['gross','fees','payoutFees','held','available'];
   facts(card,Object.fromEntries(keys.map(key=>[key,format(data[key]||'0')])));
   if(account.accountType==='merchant'){facts(card,{routingCapacity:format(data.routingCapacity),status:t(data.routingAvailable?'routingAvailable':'noRoute')});}
   for(const r of data.reconciliation||[])card.append(el('p',r.reason+' · '+format(r.signed_remaining),'notice'));
   card.append(el('p',t('noOrders')));return true;
  }
  if(page==='bank'){
   const data=await request('business/banks');
   async function editor(bank){
    const form=el('form'),d=bank?.details||{};card.replaceChildren(el('h2',t(bank?'edit':'add')),el('p',t('safeNotes'),'notice'));
    for(const key of ['upiId','bankName','holderName','accountNumber','ifsc','mobile'])field(form,key,{value:d[key]||''});
    field(form,'bankLimit',{value:d.bankLimitMinor?format(d.bankLimitMinor).slice(1):''});
    field(form,'accountType',{value:d.accountType||'personal',options:['personal','business'].map(value=>[value,t(value)])});
    field(form,'providerName',{value:d.providerName||'',optional:true});field(form,'notes',{value:d.notes||'',optional:true});
    const save=el('button',t('save'));save.type='submit';form.append(save,btn('cancel',reload));form.onsubmit=event=>{event.preventDefault();action(async()=>{const values=Object.fromEntries(new FormData(form));const details={...values,bankLimitMinor:amount(values.bankLimit)};delete details.bankLimit;await post('business/banks/save',{bankId:bank?.id||null,version:bank?.version||null,details});await reload();});};card.append(form);
   }
   if(!admin&&data.actions.includes('create'))card.append(btn('add',()=>editor(null)));
   const filter=field(card,'status',{value:'all',options:['all','pendingReviews','approved','rejectedFrozen'].map(k=>[k,t(k)])});const list=el('div');card.append(list);
   const draw=()=>{list.replaceChildren();const selected=data.banks.filter(b=>filter.value==='all'||filter.value==='pendingReviews'&&['submitted','review','verification_pending'].includes(b.status)||filter.value==='approved'&&['approved','verified','enabled','running'].includes(b.status)||filter.value==='rejectedFrozen'&&(b.status==='rejected'||b.frozen));
    if(!selected.length)list.append(el('p',t('empty')));
    for(const bank of selected){const item=el('article',undefined,'business-row');facts(item,{bankName:bank.details.bankName,upiId:bank.details.upiId,accountNumber:admin?bank.details.accountNumber:'•••• '+bank.details.accountNumber.slice(-4),status:t(bank.deactivated?'deactivated':bank.frozen?'frozen':bank.status==='review'?'reviewState':bank.status),version:String(bank.version)});if(bank.reason)item.append(el('p',bank.reason));
     const detail=el('details'),summary=el('summary',t('details'));detail.append(summary);facts(detail,{holderName:bank.details.holderName,ifsc:bank.details.ifsc,...(admin?{mobile:bank.details.mobile,providerName:bank.details.providerName||'—',notes:bank.details.notes||'—'}:{}),bankLimit:format(bank.daily_limit_minor||bank.details.bankLimitMinor),accountType:t(bank.details.accountType)});item.append(detail);
     if(admin){const status=el('section');status.append(el('h3','Onboarding status'));const dl=el('dl',undefined,'facts');for(const [key,value]of Object.entries({'Approval':bank.approved_version===bank.version?'Approved':'Required','Verification':bank.verified_version===bank.version?'Verified':'Required','Statement':bank.statement_accepted?'Accepted':'Required','Latest import':bank.statement?bank.statement.status+' · '+new Date(bank.statement.createdAt).toLocaleString(locale):'None','Evidence source':bank.verification?.source||'None','Evidence digest':bank.verification?.digest||'None'}))dl.append(el('dt',key),el('dd',value));status.append(dl,el('p','Statement acceptance is onboarding only. It never posts a financial credit.','notice'));if(bank.verification?.synthetic)status.append(el('p','SYNTHETIC TEST evidence','notice'));item.append(status);}
     if(!admin&&!bank.deactivated&&data.actions.includes('update')){const form=el('form'),limit=field(form,'bankLimit',{value:format(bank.daily_limit_minor||bank.details.bankLimitMinor).slice(1)}),save=el('button','Update daily limit');save.type='submit';form.append(save);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post('business/banks/daily-limit',{bankId:bank.id,limitMinor:amount(limit.value)});await reload();});};item.append(form);}
     if(!bank.deactivated){if(!admin&&data.actions.includes('update'))item.append(btn('edit',()=>editor(bank)));
      const allowed=admin?data.actions.filter(a=>a==='review'&&bank.status==='submitted'||['approve','reject'].includes(a)&&['submitted','review'].includes(bank.status)||a==='freeze'&&!bank.frozen||a==='release'&&bank.frozen||a==='stop'&&['enabled','running'].includes(bank.status)).map(a=>a==='release'?'release_freeze':a):[
       ...(['draft','rejected'].includes(bank.status)?['submit']:[]),...(['verified','stopped'].includes(bank.status)&&bank.verified_version===bank.version&&!bank.frozen?['enable']:[]),...(['enabled','stopped'].includes(bank.status)?['run']:[]),...(['enabled','running'].includes(bank.status)?['stop']:[]),...(!bank.frozen?['freeze']:[]),'deactivate'];
      if(allowed.length&&(admin||data.actions.includes('update'))){const form=el('form');const reason=field(form,'reason');for(const command of allowed)form.append(btn(command,async()=>{if(!reason.reportValidity())return;await post(admin?'business/banks/review':'business/banks/transition',{bankId:bank.id,version:bank.version,action:command,reason:reason.value});await reload();}));item.append(form);}
     }
     list.append(item);
    }
   };filter.onchange=draw;draw();return true;
  }
  if(page==='assignments'){
   const data=await request('business/assignments'),name=id=>data.accounts.find(a=>a.id===id)?.name||id;
   if(data.canUpdate){const form=el('form');field(form,'merchant',{options:data.accounts.filter(a=>a.account_type==='merchant').map(a=>[a.id,a.name])});field(form,'user',{options:data.accounts.filter(a=>a.account_type==='user').map(a=>[a.id,a.name])});
    field(form,'priority',{value:'100'});field(form,'weight',{value:'1'});field(form,'minTicket',{value:'1.00'});field(form,'maxTicket',{value:'10000.00'});
    const submit=el('button',t('assign'));submit.type='submit';form.append(submit);form.onsubmit=event=>{event.preventDefault();action(async()=>{const d=Object.fromEntries(new FormData(form));await post('business/assignments/update',{id:null,merchantId:d.merchant,userId:d.user,priority:Number(d.priority),weight:Number(d.weight),minMinor:amount(d.minTicket),maxMinor:amount(d.maxTicket),enabled:true});await reload();});};card.append(form);}
   showEmpty(data.assignments);for(const a of data.assignments){const item=el('article',undefined,'business-row');facts(item,{merchant:name(a.merchant_id),user:name(a.user_id),status:t(a.status),priority:String(a.priority),available:format(data.capacity[a.user_id]?.available||'0')});
    if(data.canUpdate&&(a.status==='active'||!data.assignments.some(other=>other.status==='active'&&other.merchant_id===a.merchant_id&&other.user_id===a.user_id)))item.append(btn(a.status==='active'?'disable':'enable',async()=>{await post('business/assignments/update',{id:a.status==='active'?a.id:null,merchantId:a.merchant_id,userId:a.user_id,priority:a.priority,weight:a.weight,minMinor:a.min_minor,maxMinor:a.max_minor,enabled:a.status!=='active'});await reload();}));card.append(item);}
   return true;
  }
  if(page==='routing'){
   const data=await request('business/routing');card.append(el('p',t('foundation'),'notice'));showEmpty(data.candidates);
   for(const c of data.candidates){const item=el('article',undefined,'business-row');facts(item,{internalRoute:c.routeId,merchant:c.merchantId,user:c.userId,available:format(c.capacity.available),signedAvailable:format(c.capacity.signedAvailable),deficit:format(c.capacity.deficit),status:t(c.eligible?'eligible':'unavailable')});if(c.reasons.length)item.append(el('p',c.reasons.map(t).join(' · ')));card.append(item);}
   for(const r of data.reconciliation||[])card.append(el('p',r.reason+' · '+r.owner_id+' · '+format(r.signed_remaining),'notice'));
   card.append(el('h2',t('reservations')));if(!data.reservations.length)card.append(el('p',t('empty')));for(const r of data.reservations){const item=el('article',undefined,'business-row');facts(item,{reference:r.order_reference,amount:format(r.amount_minor),status:t(r.state==='active'&&+new Date(r.expires_at)<=Date.now()?'expired':r.state),expires:new Date(r.expires_at).toLocaleString(locale)});card.append(item);}return true;
  }
  if(page==='ledger'){
   card.append(el('p',t('readOnly'),'notice'));const form=el('form');if(admin)field(form,'owner',{optional:true});field(form,'reference',{optional:true});field(form,'type',{value:'',options:[['',t('all')],...ledgerTypes.map(k=>[k,t(k)])]});const search=el('button',t('search'));search.type='submit';form.append(search);card.append(form);const list=el('div');card.append(list);
   let offset=0;const draw=async()=>{const f=Object.fromEntries(new FormData(form)),data=await post('business/ledger/search',{ownerId:f.owner||null,reference:f.reference,type:f.type,offset});list.replaceChildren();if(!data.entries.length)list.append(el('p',t('empty')));
    for(const e of data.entries){const item=el('article',undefined,'business-row');facts(item,{type:t(e.ledger_type),amount:format(e.amount_minor,e.currency),direction:t(e.direction),reference:e.reference_id,created:new Date(e.created_at).toLocaleString(locale),rateVersion:e.snapshot?String(e.snapshot.version):'—'});if(admin)facts(item,{owner:e.owner_id});list.append(item);}
    if(offset)list.append(btn('previous',async()=>{offset=Math.max(0,offset-50);await draw();}));if(data.nextOffset!==null)list.append(btn('next',async()=>{offset=data.nextOffset;await draw();}));};form.onsubmit=event=>{event.preventDefault();action(async()=>{offset=0;await draw();});};await draw();return true;
  }
  if(page==='holds'){const data=await request('business/holds');showEmpty(data.holds);for(const h of data.holds){const item=el('article',undefined,'business-row');facts(item,{amount:format(h.amount_minor,h.currency),status:t(h.state),reason:h.reason,reference:h.reference,created:new Date(h.created_at).toLocaleString(locale)});card.append(item);}return true;}
  return false;
 }
 async function renderAccess({request,post,action,el,container,title}){
  title.textContent='User Collection Access';container.replaceChildren();
  const data=await request('business/user-access');
  container.append(el('p','Free setup allows APK and Bank / UPI setup without funded capacity. Unlimited collection bypasses only the capacity balance; approval, verification, device health and UPI limits still apply.','notice'));
  if(!data.users.length)container.append(el('p','No users available.'));
  for(const user of data.users){const form=el('form',undefined,'card business-card');form.append(el('h2',user.name));
   const toggle=(label,value)=>{const wrap=el('label',label),node=el('input');node.type='checkbox';node.checked=value;wrap.append(node);form.append(wrap);return node;};
   const free=toggle('Free setup',user.free_setup),unlimited=toggle('Unlimited collection',user.unlimited_collection),label=el('label','Reason'),reason=el('input');reason.required=true;reason.maxLength=300;label.append(reason);form.append(label);if(user.reason)form.append(el('p',user.reason));
   const save=el('button','Save access');save.type='submit';form.append(save);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post('business/user-access/update',{userId:user.id,freeSetup:free.checked,unlimitedCollection:unlimited.checked,reason:reason.value});await renderAccess({request,post,action,el,container,title});});};container.append(form);
  }
 }
 root.WPayBusinessPage={render,pages,renderAccess};
})(globalThis);
