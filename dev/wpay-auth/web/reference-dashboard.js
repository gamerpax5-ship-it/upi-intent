"use strict";
(function(root){
 const money=value=>{if(value===undefined||value===null)return '—';const n=BigInt(value),s=(n<0n?-n:n).toString().padStart(3,'0');return (n<0n?'-':'')+'₹'+s.slice(0,-2)+'.'+s.slice(-2);};
 function table(el,target,rows,columns){target.replaceChildren();if(!rows.length){const row=el('tr'),cell=el('td','No records yet.');cell.colSpan=columns.length;row.append(cell);target.append(row);return;}for(const data of rows){const row=el('tr');for(const get of columns)row.append(el('td',String(get(data)??'—')));target.append(row);}}
 function item(el,target,label,value,status){const row=el('div',undefined,'item'),main=el('div',undefined,'item-main');main.append(el('strong',label),el('small',value));row.append(main);if(status)row.append(el('span',status,'pill info'));target.append(row);}
 function chart(el,box,rows,days){
  box.replaceChildren();const recent=rows.filter(r=>+new Date(r.createdAt||r.created_at)>=Date.now()-days*86400000);
  if(!recent.length){box.append(el('div','No activity in this period.','empty'));return;}
  const buckets=new Map();for(const row of recent){const key=new Date(row.createdAt||row.created_at).toISOString().slice(0,10);buckets.set(key,(buckets.get(key)||0n)+BigInt(row.amountMinor||row.amount_minor||'0'));}
  const points=[...buckets].sort((a,b)=>a[0].localeCompare(b[0])),max=points.reduce((a,[,b])=>b>a?b:a,1n),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 760 270');svg.setAttribute('role','img');svg.setAttribute('aria-label','Daily amount from displayed recent records');
  points.forEach(([day,value],i)=>{const x=35+i*690/points.length,w=Math.max(3,Math.min(45,620/points.length)),height=Number(value*200n/max),bar=document.createElementNS(ns,'rect');bar.setAttribute('x',String(x));bar.setAttribute('y',String(230-height));bar.setAttribute('width',String(w));bar.setAttribute('height',String(height));bar.setAttribute('rx','5');bar.setAttribute('fill','var(--burg3,var(--violet))');const tip=document.createElementNS(ns,'title');tip.textContent=day+' · '+money(value);bar.append(tip);svg.append(bar);});box.append(svg);
 }
 async function render(args){
  const {account,request,post,el,container,title,groups=[]}=args,merchant=account.accountType==='merchant',role=merchant?'merchant':'user';
  const template=document.createElement('template');template.innerHTML=root.WPayReferenceLayouts.dashboards[role];const page=template.content.firstElementChild.cloneNode(true);page.classList.add('reference-dashboard');container.replaceChildren(page);title.textContent=merchant?'Merchant Dashboard':'Dashboard';root.WPayReferencePresentation.bind(page);
  const metrics=[...page.querySelectorAll('.metric-value')],setMetric=(i,value)=>{metrics[i].textContent=value;},query=s=>page.querySelector(s),granted=new Set(groups.flatMap(g=>g.children||[]).map(p=>p.destinationId));
  const tasks=[],load=(destination,fn,apply,target)=>{
   if(destination&&!granted.has(destination)){if(target)target.replaceChildren(el('p','Unavailable for this account.','notice'));return;}
   tasks.push((async()=>{try{const value=await fn();if(page.isConnected)apply(value);}catch(error){if(error.message==='error.AUTH_FAILED')throw error;if(page.isConnected&&target)target.replaceChildren(el('p',error.message==='error.FORBIDDEN'?'Unavailable for this account.':'Could not load this section. Use Refresh to retry.','notice'));}})());
  };
  const chartBox=query('.chart');chartBox.append(el('div','Loading account activity…','empty'));
  if(merchant){
   const health=query('#liveHealth');item(el,health,'Account approval',account.approvalStatus,account.operationsEnabled?'Operations enabled':'Setup required');
   load(null,()=>request('business/summary'),r=>setMetric(0,money(r.available)),health);
   load('merchant.holds',()=>request('business/holds'),r=>{let held=0n,frozen=0n;for(const h of r.holds||[])if(h.state==='active'){if(h.category==='frozen')frozen+=BigInt(h.amount_minor);else held+=BigInt(h.amount_minor);}setMetric(1,money(frozen));setMetric(2,money(held));},health);
   load('gateway.orders',()=>request('gateway/summary'),r=>{setMetric(3,money(r.successfulVolumeMinor));setMetric(5,String(r.counts?.successful??0));metrics[5].nextElementSibling.textContent=r.successRate===null?'No settled order ratio':(r.successRate*100).toFixed(1)+'% success rate';item(el,health,'Payment verification',r.verificationConnected?'Connected':'Provider unavailable');},health);
   load('payout.orders',()=>request('payout/summary'),r=>{setMetric(4,String(r.orderCount));item(el,health,'USDT withdrawal',r.merchantUsdt?.enabled?'Available':'Rate / capability not configured');},health);
   load('gateway.orders',()=>request('gateway/orders'),r=>{table(el,query('#dashOrders'),r.orders.slice(0,6),[x=>x.reference,x=>money(x.amountMinor),x=>x.status,x=>x.origin]);chart(el,chartBox,r.orders.filter(x=>x.status==='successful'),30);query('.chart').parentElement.querySelector('.card-head p').textContent='Successful amounts from the latest returned orders · 30 days.';},query('#dashOrders').closest('.table-scroll'));
   load('payout.orders',()=>post('payout/search',{state:'submitted',offset:0,limit:6}),r=>table(el,query('#dashPayoutReviews'),r.orders,[x=>x.reference,x=>money(x.amountMinor),()=> 'Submitted',x=>x.status]),query('#dashPayoutReviews').closest('.table-scroll'));
  }else{
   const readiness=query('#liveReadiness');item(el,readiness,'Profile',account.name,account.emailOwnershipVerified?'Email verified':'Verify email');item(el,readiness,'Account approval',account.approvalStatus,account.operationsEnabled?'Operations enabled':'Setup required');item(el,readiness,'Security','Manage authenticator and sessions in Security');query('.progress').hidden=true;query('.main-grid > .card:nth-child(2) .card-head .pill').textContent=account.approvalStatus;
   load(null,()=>request('business/summary'),r=>setMetric(0,money(r.available)),readiness);
   load('payout.commission',()=>request('payout/summary'),r=>{setMetric(1,money(r.payin));setMetric(2,money(r.payout));},readiness);
   load('user.bank-upi',()=>request('business/banks'),r=>{const target=query('#overviewUpiHealth');target.replaceChildren();for(const b of r.banks||[])item(el,target,b.details?.upiId||b.id,b.details?.bankName||'',b.status);if(!r.banks.length)target.append(el('p','No bank / UPI records yet.','empty'));},query('#overviewUpiHealth'));
   load('operations.transactions',()=>post('operations/transactions',{offset:0}),r=>{
    table(el,query('#recentPayins'),r.records.slice(0,4),[x=>x.reference,()=> '—',x=>x.status,x=>money(x.amountMinor),()=> 'See Commission']);const terminal=r.records.filter(x=>['successful','failed'].includes(x.status));setMetric(3,terminal.length?(100*terminal.filter(x=>x.status==='successful').length/terminal.length).toFixed(1)+'%':'—');metrics[3].nextElementSibling.textContent='Displayed recent records only';
    chart(el,chartBox,r.records,7);query('.main-grid .card-head p').textContent='Recent returned activity; chart requires a transaction date.';
    for(const button of document.querySelectorAll('#overviewRanges button')){button.onclick=()=>{document.querySelectorAll('#overviewRanges button').forEach(b=>b.classList.toggle('active',b===button));chart(el,chartBox,r.records,Number(button.dataset.range));};}
   },query('#recentPayins').closest('.table-scroll'));
   load('payout.jobs',()=>request('payout/queue'),r=>{const target=query('#overviewPayouts');target.replaceChildren();for(const p of r.orders.slice(0,4))item(el,target,p.reference||p.id,money(p.amountMinor),'Available');if(!r.orders.length)target.append(el('p','No eligible payout orders.','empty'));},query('#overviewPayouts'));
  }
  await Promise.all(tasks);if(page.isConnected&&chartBox.textContent.includes('Loading account activity'))chartBox.replaceChildren(el('div','Activity is unavailable for this account.','empty'));
 }
 root.WPayReferenceDashboard={render};
})(globalThis);
