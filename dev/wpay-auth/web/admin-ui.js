"use strict";
(function(root){
 let api,nav;
 const $=id=>document.getElementById(id);
 const money=value=>value===null||value===undefined?'—':(()=>{const n=BigInt(value),a=n<0n?-n:n;return (n<0n?'−':'')+'₹'+(a/100n).toLocaleString('en-IN')+'.'+String(a%100n).padStart(2,'0');})();
 function sync(account,navigation,selected){
  nav=navigation;const pages=navigation.groups.flatMap(g=>g.children),buttons=[...$('navigation').querySelectorAll('button')];
  buttons.forEach((b,i)=>{if(pages[i]?.permissionId==='account_security.view')b.textContent='Account settings';b.dataset.destination=pages[i]?.destinationId||'';if(pages[i]?.destinationId===selected||(!selected&&pages[i]?.permissionId==='overview.view'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const groupNames=['USERS','MERCHANTS','UPI & ROUTING','APK & DEVICES','EMPLOYEES & RIGHTS','PROFIT & EXPENSES','TREASURY & REPORTS','OPERATIONS','SETTINGS'],groups=groupNames.map(name=>{const d=document.createElement('details');d.open=true;const s=document.createElement('summary');s.textContent=name;d.append(s);return d;});
  buttons.forEach((b,i)=>{const p=pages[i];if(!p||p.permissionId==='overview.view')return;const id=p.permissionId;let index=7;
   if(/^(users|deposits|commission_withdrawal|commission_hold|parking|bank_upi|statement)/.test(id))index=0;
   else if(/^(merchants|transactions|payout|withdrawals|api_credentials|api_logs|webhooks)/.test(id))index=1;
   else if(/^(routing|assignments)/.test(id))index=2;
   else if(/^(apk|device|otp|utr_center)/.test(id))index=3;
   else if(/^employee/.test(id)||p.destinationId==='operations.admins')index=4;
   else if(/^(reports|ledger|commissions|holds)/.test(id))index=6;
   else if(/^(settings|profile|account_security)/.test(id))index=8;
   if(p.destinationId==='operations.pending-utrs')index=7;
   if(p.destinationId.startsWith('admin-finance.')){b.textContent=p.label;index=p.destinationId.endsWith('.audit')?7:5;}
   if(p.destinationId==='administration.admin-upi'){b.textContent='UPI Directory & Routing';index=2;}
   if(id==='users.view')b.textContent='Users & approvals';
   if(id==='merchants.view')b.textContent='Merchants & approvals';
   if(id==='devices.view')b.textContent='Device management & pairing';
   const icon=document.createElement('i');icon.className='admin-nav-icon';icon.setAttribute('aria-hidden','true');icon.textContent=['♙','▣','⇄','◇','♧','◉','≡','▤','⚙'][index];b.prepend(icon);b.addEventListener('click',()=>document.body.classList.remove('admin-nav-open'));groups[index].append(b);
  });
  $('navigation').replaceChildren(...groups.filter(g=>g.querySelector('button')));
  $('account-home').setAttribute('aria-current',!selected||pages.find(p=>p.destinationId===selected)?.permissionId==='overview.view'?'page':'false');
  let user=$('admin-account');if(!user){user=document.createElement('p');user.id='admin-account';user.className='admin-account';$('workspace').querySelector('aside').prepend(user);}user.textContent=account.name+' · '+(account.accountType==='super_admin'?'Super Admin':'Admin');
  $('account-home').textContent='◇  Overview';
  const crumb=$('admin-crumb');if(crumb)crumb.textContent=pages.find(p=>p.destinationId===selected)?.label||'Overview';
 }
 function connect(value){api=value;
  const header=document.querySelector('header'),search=$('admin-search').closest('.admin-search'),aside=$('workspace').querySelector('aside');
  if(search){search.classList.add('admin-sidebar-search');aside.prepend(search);$('admin-search').placeholder='Search modules…';}
  const crumb=document.createElement('div');crumb.className='admin-breadcrumb';crumb.append(document.createTextNode('Workspace / '));const current=document.createElement('strong');current.id='admin-crumb';current.textContent='Overview';crumb.append(current);header.append(crumb);
  const theme=document.createElement('button');theme.type='button';theme.className='admin-theme';theme.textContent='◐ Theme';theme.setAttribute('aria-label','Toggle colour theme');theme.onclick=()=>{document.body.classList.toggle('admin-light');try{localStorage.setItem('wpay-admin-theme',document.body.classList.contains('admin-light')?'light':'dark');}catch{}};try{document.body.classList.toggle('admin-light',localStorage.getItem('wpay-admin-theme')==='light');}catch{}header.append(theme);
const toggle=document.createElement('button');toggle.type='button';toggle.className='admin-menu-toggle';toggle.textContent='☰';toggle.setAttribute('aria-label','Toggle navigation');toggle.onclick=()=>document.body.classList.toggle('admin-nav-open');document.querySelector('header').prepend(toggle);const veil=document.createElement('button');veil.type='button';veil.className='admin-mobile-veil';veil.setAttribute('aria-label','Close navigation');veil.onclick=()=>document.body.classList.remove('admin-nav-open');document.body.append(veil);$('admin-search').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();for(const d of $('navigation').querySelectorAll('details')){let count=0;for(const b of d.querySelectorAll('button')){b.hidden=!b.textContent.toLowerCase().includes(q);if(!b.hidden)count++;}d.hidden=!count;if(q)d.open=true;}});}
 async function overview({account,post,action,el,container,title,navigate},days=30){
  title.textContent='Overview';container.replaceChildren(el('p','Loading your operational overview…','admin-empty'));
  let data;try{data=await post('panel/admin-overview',{days});}catch(error){const box=el('section',undefined,'card admin-panel'),retry=el('button','Retry overview','primary');retry.type='button';retry.onclick=()=>action(()=>overview({account,post,action,el,container,title,navigate},days));box.append(el('h2','Overview could not load'),el('p','Your session may have expired or the service is temporarily unavailable. Retry to load the current balances.','admin-subtitle'),retry);container.replaceChildren(box);throw error;}container.replaceChildren();
  const toolbar=el('div',undefined,'admin-toolbar'),actions=el('div',undefined,'admin-toolbar-actions'),period=el('select');period.setAttribute('aria-label','Overview period');
  for(const n of [7,30,60]){const o=el('option','Last '+n+' days');o.value=n;period.append(o);}period.value=days;period.onchange=()=>action(()=>overview({account,post,action,el,container,title,navigate},Number(period.value)));
  const pages=nav.groups.flatMap(g=>g.children),go=(permission,label)=>{const b=el('button',label),p=pages.find(p=>p.permissionId===permission);b.type='button';b.disabled=!p;b.onclick=()=>navigate(p.destinationId);return b;};
  actions.append(period,go('reports.export','Export report ↗'));toolbar.append(el('p','Your payment operations, at a glance.','admin-subtitle'),actions);container.append(toolbar);
  const metrics=el('div',undefined,'admin-metrics');for(const [label,value,hint] of [['Total volume',data.totalVolume,'Successful pay-ins + payouts · selected period'],['Merchant available',data.merchantAvailable,'Current balance after fees and reservations'],['Frozen & reserved',data.frozen,'Holds + payouts + withdrawals'],['Total settlement',data.settlement,'Completed merchant settlement · all time']]){const card=el('article',undefined,'card admin-metric');card.append(el('span',label,'admin-metric-label'),el('strong',money(value)),el('small',hint));metrics.append(card);}container.append(metrics);
  const first=el('div',undefined,'admin-columns'),chart=el('section',undefined,'card admin-panel'),queue=el('section',undefined,'card admin-panel');chart.append(el('h2','Payment volume'));const legend=el('div','● Pay-in','admin-legend');legend.append(el('span','● Payout'));chart.append(legend);
  if(data.totalVolume===null)chart.append(el('p','Volume unavailable for your permissions.','admin-empty'));else if(!data.series.length)chart.append(el('p','No successful payments in this period.','admin-empty'));else chart.append(volumeChart(data,el));
  queue.append(el('h2','Action center'));for(const [label,value,permission] of [['User approvals',data.approvals.user,'users.view'],['Merchant approvals',data.approvals.merchant,'merchants.view'],['Bank & UPI review',data.approvals.bank,'bank_upi.view'],['Withdrawal requests',data.approvals.withdrawal,'commission_withdrawal.view']]){const row=el('div',undefined,'admin-review');row.append(el('span',label),el('strong',value??'—'),go(permission,'Review →'));queue.append(row);}first.append(chart,queue);container.append(first);
  const second=el('div',undefined,'admin-columns'),payouts=el('section',undefined,'card admin-panel'),profit=el('section',undefined,'card admin-panel');payouts.append(el('h2','Recent payouts'));
  if(!data.recentPayouts?.length)payouts.append(el('p',data.recentPayouts?'No payouts yet.':'Payouts unavailable for your permissions.','admin-empty'));else{const wrap=el('div',undefined,'table-wrap'),table=el('table',undefined,'admin-table'),head=el('thead'),hr=el('tr');for(const h of ['Reference','Merchant','Amount','Fee*','Status'])hr.append(el('th',h));head.append(hr);table.append(head);const body=el('tbody');for(const p of data.recentPayouts){const row=el('tr');for(const v of [p.reference,p.merchant,money(p.amount),money(p.fee)])row.append(el('td',v));const status=el('td');status.append(el('span',p.state.replaceAll('_',' '),'admin-state '+p.state));row.append(status);body.append(row);}table.append(body);wrap.append(table);payouts.append(wrap,el('p','*Quoted fee. Charged when payout completes successfully.','hint'));}
  profit.append(el('h2','Fees & commissions'));for(const [label,value] of [['Pay-in fees',data.fees?(data.fees.merchant_platform_fee||'0'):null],['Payout fees · incl. fixed',data.fees?(data.fees.merchant_payout_fee||'0'):null],['User pay-in commissions',data.fees?.user_commission],['User payout commissions',data.fees?.user_payout_commission],['USDT exchange profit',null],['Salary & other expenses',null],['Net profit',null]]){const row=el('div',undefined,'admin-profit-row');row.append(el('span',label),el('strong',money(value??(data.fees&&label.includes('commission')?'0':null))));profit.append(row);}profit.append(el('p','— means unavailable, not zero.','hint'));second.append(payouts,profit);container.append(second);
  const foot=el('div',undefined,'admin-bottom');foot.append(el('span','Total settlement · '+money(data.settlement)),el('span','Updated '+new Date(data.asOf).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST'));container.append(foot);
 }
 function volumeChart(data){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 650 225');svg.classList.add('admin-chart');svg.setAttribute('role','img');svg.setAttribute('aria-label','Daily successful pay-in and payout amounts in INR');
  const add=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;svg.append(e);return e;};
  const keys=[...new Set(data.series.map(r=>r.day))],max=Math.max(1,...data.series.map(r=>Number(r.amount)/100));
  for(let i=0;i<5;i++){const y=15+i*43;add('line',{x1:57,x2:635,y1:y,y2:y,stroke:'#23334b'});add('text',{x:0,y:y+4},Math.round(max*(4-i)/4).toLocaleString('en-IN'));}
  for(const [kind,color]of [['payin','#a487ff'],['payout','#25cabc']]){const map=new Map(data.series.filter(r=>r.kind===kind).map(r=>[r.day,Number(r.amount)/100]));const points=keys.map((k,i)=>[57+i*578/Math.max(1,keys.length-1),187-(map.get(k)||0)*172/max]);add('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:color,'stroke-width':2.5});for(const [x,y]of points)add('circle',{cx:x,cy:y,r:3,fill:color});}
  keys.forEach((k,i)=>{if(i===0||i===keys.length-1||i%Math.max(1,Math.ceil(keys.length/5))===0)add('text',{x:57+i*578/Math.max(1,keys.length-1),y:215,'text-anchor':i===keys.length-1?'end':'start'},k.slice(5));});return svg;
 }
 root.WPayAdminUi={sync,connect,overview};
})(globalThis);
