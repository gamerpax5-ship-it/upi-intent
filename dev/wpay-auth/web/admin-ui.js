"use strict";
(function(root){
 let api,nav;
 const $=id=>document.getElementById(id);
 const ICONS={
  overview:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  users:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M17 7a3 3 0 0 1 0 6m2 8a5 5 0 0 0-3-4.6"/>',
  merchant:'<path d="M3 10h18M5 10v10h14V10M7 4h10l3 6H4l3-6Z"/><path d="M9 14h6"/>',
  bank:'<path d="M3 10h18M5 10v8m5-8v8m4-8v8m5-8v8M2 21h20M12 3l9 5H3l9-5Z"/>',
  route:'<path d="M5 5h6v6H5zM13 13h6v6h-6z"/><path d="M11 8h3a3 3 0 0 1 3 3v2M13 16h-3a3 3 0 0 1-3-3v-2"/>',
  apk:'<path d="M8 6 6 3m10 3 2-3M7 8h10a3 3 0 0 1 3 3v7H4v-7a3 3 0 0 1 3-3Z"/><path d="M8 12h.01M16 12h.01M8 18v3m8-3v3"/>',
  employee:'<circle cx="9" cy="7" r="3"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16 11h5m-2.5-2.5v5"/>',
  finance:'<circle cx="12" cy="12" r="9"/><path d="M8 14c1 2 7 2 7-1 0-3-7-1-7-4 0-3 6-3 7-1M12 5v14"/>',
  report:'<path d="M5 3h14v18H5z"/><path d="M8 16v-3m4 3V8m4 8v-5"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.3 3.1h5l.3-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4L18.9 13a7 7 0 0 0 .1-1Z"/>'
 };
 const icon=name=>'<svg class="admin-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(ICONS[name]||ICONS.overview)+'</svg>';
 const money=value=>value===null||value===undefined?'—':(()=>{const n=BigInt(value),a=n<0n?-n:n;return (n<0n?'−':'')+'₹'+(a/100n).toLocaleString('en-IN')+'.'+String(a%100n).padStart(2,'0');})();
 function sync(account,navigation,selected){
  nav=navigation;const pages=navigation.groups.flatMap(g=>g.children),buttons=[...$('navigation').querySelectorAll('button')];
  buttons.forEach((b,i)=>{if(pages[i]?.permissionId==='account_security.view')b.textContent='Account settings';b.dataset.destination=pages[i]?.destinationId||'';if(pages[i]?.destinationId===selected||(!selected&&pages[i]?.permissionId==='overview.view'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const defs=[['DASHBOARD','overview'],['ACCOUNTS & APPROVALS','users'],['COLLECTIONS & ROUTING','route'],['PARKING','bank'],['PAYOUTS & TREASURY','finance'],['APK SETUP','apk'],['TEAM & ACCESS','employee'],['FINANCE & REPORTS','report'],['DEVELOPER','settings'],['SUPPORT & PLATFORM','settings']];
  const groups=defs.map(([name,ico])=>{const d=document.createElement('details');d.open=true;const s=document.createElement('summary');s.innerHTML=icon(ico)+'<span>'+name+'</span>';d.append(s);return d;});
  const groupIndex=p=>{
   const id=p.permissionId,d=p.destinationId;
   if(id==='overview.view')return 0;
   if(/^(users|merchants|deposits)/.test(id)||d==='administration.user-access')return 1;
   if(/^(bank_upi|routing|assignments|transactions|statement_reconciliation|reconciliation)/.test(id)||d==='administration.admin-upi')return 2;
   if(/^parking/.test(id)||d.startsWith('parking.'))return 3;
   if(/^(payout|commission_withdrawal|commission_hold|holds)/.test(id)||d.startsWith('payout.'))return 4;
   if(/^(apk|devices|otp|utr_center)/.test(id)||d.startsWith('operations.activation')||d.startsWith('operations.devices')||d.startsWith('operations.otp'))return 5;
   if(/^employee/.test(id)||d==='operations.admins')return 6;
   if(/^(reports|ledger|commissions)/.test(id)||d.startsWith('admin-finance.'))return 7;
   if(/^(api_credentials|api_logs|webhooks)/.test(id))return 8;
   return 9;
  };
  buttons.forEach((b,i)=>{const p=pages[i];if(!p||p.permissionId==='overview.view')return;const gi=groupIndex(p);let label=p.label||b.textContent;
   if(p.destinationId==='administration.admin-upi')label='UPI Directory & Routing';
   if(p.destinationId==='administration.user-access')label='User Collection Access';
   if(p.destinationId==='payout.late-reviews')label='Late Payment Reviews';
   if(p.destinationId==='payout.disputes')label='Post-approval Disputes';
   if(p.destinationId==='payout.capabilities')label='Payout Bank Capabilities';
   if(p.destinationId==='payout.holds')label='Commission Holds';
   if(p.destinationId.startsWith('admin-finance.'))label=p.label;
   b.textContent=label;
   const span=document.createElement('span');span.className='admin-nav-icon';span.innerHTML=icon(defs[gi][1]);b.prepend(span);b.addEventListener('click',()=>document.body.classList.remove('admin-nav-open'));groups[gi].append(b);
  });
  $('navigation').replaceChildren(...groups.filter(g=>g.querySelector('button')));
  $('account-home').innerHTML=icon('overview')+'<span>Overview</span>';
  $('account-home').setAttribute('aria-current',!selected||pages.find(p=>p.destinationId===selected)?.permissionId==='overview.view'?'page':'false');
  let user=$('admin-account');if(!user){user=document.createElement('p');user.id='admin-account';user.className='admin-account';$('workspace').querySelector('aside').prepend(user);}user.textContent=account.name+' · '+(account.accountType==='super_admin'?'Super Admin':account.accountType==='employee'?'Employee':'Admin');
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
  let data;try{data=await post('panel/admin-overview',{days});}catch(error){const box=el('section',undefined,'card admin-panel'),retry=el('button','Retry overview','primary');retry.type='button';retry.onclick=()=>action(()=>overview({account,post,action,el,container,title,navigate},days));box.append(el('h2','Overview could not load'),el('p','Your session may have expired or the service is temporarily unavailable.','admin-subtitle'),retry);container.replaceChildren(box);throw error;}container.replaceChildren();
  const pages=nav.groups.flatMap(g=>g.children),go=(permission,label)=>{const b=el('button',label),p=pages.find(p=>p.permissionId===permission);b.type='button';b.disabled=!p;b.onclick=()=>navigate(p.destinationId);return b;};
  const hero=el('section',undefined,'admin-command');const heroText=el('div');heroText.append(el('span','OPERATIONS COMMAND CENTER','admin-command-eyebrow'),el('h2','WPay platform at a glance'),el('p','Financial position, collections, approvals and operational health without overwhelming the screen.'));const heroActions=el('div',undefined,'admin-command-actions');const period=el('select');for(const n of [7,30,60]){const o=el('option','Last '+n+' days');o.value=n;period.append(o);}period.value=days;period.onchange=()=>action(()=>overview({account,post,action,el,container,title,navigate},Number(period.value)));heroActions.append(period,go('reports.view','Reports'));hero.append(heroText,heroActions);container.append(hero);
  const primary=[['Total volume',data.totalVolume,'Successful payment volume'],['Today collection',data.todayCollection,'India day successful pay-ins'],['Merchant available',data.merchantAvailable,'Spendable Merchant INR'],['User capacity',data.totalUserCapacity,'Allocated User capacity'],['Platform fees',data.totalFees,'Merchant pay-in + payout fees'],['Pending actions',Object.values(data.approvals||{}).filter(v=>v!==null&&v!==undefined).reduce((n,v)=>n+Number(v),0),'Approvals and reviews']];
  const pgrid=el('div',undefined,'admin-primary-kpis');for(const [label,value,hint]of primary){const card=el('article',undefined,'card admin-kpi-compact');card.append(el('span',label,'admin-kpi-label'),el('strong',typeof value==='number'?String(value):money(value)),el('small',hint));pgrid.append(card);}container.append(pgrid);
  const secondary=el('div',undefined,'admin-secondary-kpis');for(const [label,value,moneyValue=false]of [['Users',data.totalUsers],['Merchants',data.totalMerchants],['Employees',data.totalEmployees],['User commission',data.totalUserCommission,true],['User deposits',data.totalUserDeposits,true],['Running UPI',data.runningUpi],['Available UPI',data.availableUpi],['Success rate',data.successRate===null||data.successRate===undefined?'—':(Number(data.successRate)*100).toFixed(1)+'%']]){const item=el('div');item.append(el('small',label),el('strong',moneyValue?money(value):String(value??'—')));secondary.append(item);}container.append(secondary);
  const first=el('div',undefined,'admin-columns'),chart=el('section',undefined,'card admin-panel'),queue=el('section',undefined,'card admin-panel');chart.append(el('h2','Collection & payout trend'),el('p','Successful volume · selected period','admin-subtitle'));const legend=el('div','● Pay-in','admin-legend');legend.append(el('span','● Payout'));chart.append(legend);
  if(data.totalVolume===null)chart.append(el('p','Volume unavailable for your permissions.','admin-empty'));else if(!data.series.length)chart.append(el('p','No successful payments in this period.','admin-empty'));else chart.append(volumeChart(data));
  queue.append(el('h2','Action center'));for(const [label,value,permission]of [['User approvals',data.approvals.user,'users.view'],['Merchant approvals',data.approvals.merchant,'merchants.view'],['Bank & UPI review',data.approvals.bank,'bank_upi.view'],['Deposit review',data.approvals.deposit,'deposits.view'],['Payout approvals',data.approvals.payout,'payout_operations.view'],['Payout disputes',data.approvals.dispute,'payout_operations.view'],['Late reviews',data.approvals.late,'payout_operations.view'],['Withdrawals',data.approvals.withdrawal,'commission_withdrawal.view']]){if(value===undefined)continue;const row=el('div',undefined,'admin-review');row.append(el('span',label),el('strong',String(value??'—')),go(permission,'Review →'));queue.append(row);}first.append(chart,queue);container.append(first);
  const second=el('div',undefined,'admin-columns'),payouts=el('section',undefined,'card admin-panel'),health=el('section',undefined,'card admin-panel');payouts.append(el('h2','Recent payouts'));if(!data.recentPayouts?.length)payouts.append(el('p',data.recentPayouts?'No payouts yet.':'Payouts unavailable for your permissions.','admin-empty'));else{const wrap=el('div',undefined,'table-wrap'),table=el('table',undefined,'admin-table'),head=el('thead'),hr=el('tr');for(const h of ['Reference','Merchant','Amount','Fee','Status'])hr.append(el('th',h));head.append(hr);table.append(head);const body=el('tbody');for(const p of data.recentPayouts){const row=el('tr');for(const v of [p.reference,p.merchant,money(p.amount),money(p.fee)])row.append(el('td',v));const status=el('td');status.append(el('span',p.state.replaceAll('_',' '),'admin-state '+p.state));row.append(status);body.append(row);}table.append(body);wrap.append(table);payouts.append(wrap);}
  health.append(el('h2','Operational health'));for(const [label,value]of [['Active Users',data.activeUsers],['Today Volume',money(data.todayVolume)],['Today Payout',money(data.todayPayoutVolume)],['Successful Payouts',data.successfulPayouts],['Total Settlement',money(data.settlement)]]){const row=el('div',undefined,'admin-profit-row');row.append(el('span',label),el('strong',String(value??'—')));health.append(row);}second.append(payouts,health);container.append(second);
  const foot=el('div',undefined,'admin-bottom');foot.append(el('span','Updated '+new Date(data.asOf).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST'),el('span','Role-scoped metrics only'));container.append(foot);
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
