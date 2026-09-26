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
  nav=navigation;const pages=navigation.groups.flatMap(g=>g.children),byPerm=id=>pages.find(p=>p.permissionId===id),byDest=id=>pages.find(p=>p.destinationId===id),can=id=>!!byPerm(id),dest=(permission,...preferred)=>{for(const d of preferred){const p=byDest(d);if(p)return p.destinationId;}return byPerm(permission)?.destinationId||null;};
  const defs=[
   ['DASHBOARD','overview',[
    ['Overview',dest('overview.view','administration.dashboard')],
    ['Analytics',can('overview.view')?'v5.analytics':null]
   ]],
   ['ACCOUNTS & APPROVALS','users',[
    ['Users',can('users.view')?'v5.users':null],
    ['Merchants',can('merchants.view')?'v5.merchants':null],
    ['Pending approvals',(can('users.view')||can('merchants.view'))?'v5.approvals':null],
    ['User collection access',can('users.commercial.update')?'v5.collection-access':null],
    ['User deposits',can('deposits.view')?'v5.deposits':null]
   ]],
   ['COLLECTIONS & ROUTING','route',[
    ['Bank & UPI',can('bank_upi.view')?'v5.bank-upi':null],
    ['UPI Analytics',can('bank_upi.view')?'v5.upi-analytics':null],
    ['UPI daily limits',can('bank_upi.view')?'v5.upi-limits':null],
    ['Assignments & routing',can('routing.view')?'v5.routing':null],
    ['User assignments',can('assignments.view')?'v5.assignments':null],
    ['Transactions',can('transactions.view')?'v5.transactions':null],
    ['Pay-in disputes',can('payin_dispute.view')?'v5.payin-disputes':null],
    ['Statements & reconciliation',can('statement_reconciliation.view')?'v5.statements':null]
   ]],
   ['PARKING','bank',[
    ['Beneficiaries',can('parking.view')?'v5.parking-beneficiaries':null],
    ['Orders',can('parking.view')?'v5.parking-orders':null],
    ['Review queue',can('parking.view')?'v5.parking-review':null]
   ]],
   ['PAYOUTS & TREASURY','finance',[
    ['Payout approval',can('payout_operations.view')?'v5.payout-approval':null],
    ['Payout review',can('payout_operations.view')?'v5.payout-review':null],
    ['Payout bank capabilities',can('payout_operations.view')?'v5.payout-capabilities':null],
    ['Post-approval disputes',can('payout_operations.view')?'v5.payout-disputes':null],
    ['Late payment reviews',can('payout_operations.view')?'v5.late-reviews':null],
    ['Merchant USDT',can('payout_operations.view')?'v5.merchant-usdt':null],
    ['Commission withdrawals',can('commission_withdrawal.view')?'v5.withdrawals':null],
    ['User commissions',can('reports.view')?'v5.user-commissions':null],
    ['Commission holds',can('commission_hold.view')?'v5.commission-holds':null],
    ['Holds / frozen',can('holds.view')?'v5.holds':null]
   ]],
   ['APK SETUP','apk',[
    ['Activation codes',can('devices.view')?'v5.activation':null],
    ['Devices',can('devices.view')?'v5.devices':null],
    ['Pairing history',can('devices.view')?'v5.pairing-history':null],
    ['OTP Events',dest('apk_otp_events.view_all','operations.otp')],
    ['UTR Capture',can('utr_center.view')?'v5.utr':null],
    ['APK / Agent',can('apk.view')?'v5.apk':null]
   ]],
   ['TEAM & ACCESS','employee',[
    ['Employees',can('employee_management.view')?'v5.employees':null],
    ['Admin authority',byDest('operations.admins')?'v5.admins':null]
   ]],
   ['FINANCE & REPORTS','report',[
    ['Ledger',can('ledger.view')?'v5.ledger':null],
    ['Profit overview',can('reports.view')?'v5.profit-overview':null],
    ['Pay-in fees & commissions',can('reports.view')?'v5.finance-payin':null],
    ['Payout fees & commissions',can('reports.view')?'v5.finance-payout':null],
    ['Fixed payout revenue',can('reports.view')?'v5.finance-fixed':null],
    ['USDT exchange',can('reports.view')?'v5.finance-usdt':null],
    ['Salary management',can('reports.view')?'v5.finance-salary':null],
    ['Expense management',can('reports.view')?'v5.finance-expenses':null],
    ['Profit & expenses',can('reports.view')?'v5.profit-expenses':null],
    ['Reports',can('reports.view')?'v5.reports':null],
    ['Audit log',can('settings.view')?'v5.audit':null]
   ]],
   ['DEVELOPER','settings',[
    ['API credentials',can('api_credentials.view')?'v5.credentials':null],
    ['Webhooks',can('webhooks.view')?'v5.webhooks':null],
    ['API logs',can('api_logs.view')?'v5.api-logs':null]
   ]],
   ['SUPPORT & PLATFORM','settings',[
    ['Support',can('support_admin.view')?'v5.support':null],
    ['Notifications',can('notifications.view')?'v5.notifications':null],
    ['Security',can('account_security.view')?'v5.security':null],
    ['Settings',can('settings.view')?'v5.settings':null],
    ['Profile',can('profile.view')?'v5.profile':null]
   ]]
  ];
  const navigationRoot=$('navigation');navigationRoot.replaceChildren();
  for(const [groupName,ico,items] of defs){
   const visible=items.filter(([,d])=>d);if(!visible.length)continue;
   const section=document.createElement('div');section.className='nav-group';const title=document.createElement('div');title.className='nav-title';title.textContent=groupName;section.append(title);
   for(const [label,d]of visible){const b=document.createElement('button');b.type='button';b.className='nav-item';b.dataset.destination=d;b.innerHTML='<span class="nav-icon">'+icon(ico)+'</span><span>'+label+'</span>';if(d===selected||(!selected&&label==='Overview'))b.classList.add('active');b.onclick=()=>{document.body.classList.remove('admin-nav-open');api.navigate(d);};section.append(b);}
   navigationRoot.append(section);
  }
  const home=$('account-home');home.innerHTML='<span class="nav-icon">'+icon('overview')+'</span><span>Overview</span>';home.classList.toggle('active',!selected||byDest(selected)?.permissionId==='overview.view');home.onclick=()=>api.navigate(null);
  const role=account.accountType==='super_admin'?'Super Admin':account.accountType==='employee'?'Employee':'Admin',initials=(account.name||role).split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
  $('admin-account').textContent=account.name||role;$('admin-scope').textContent=role+(account.accountType==='super_admin'?' · Platform authority':' · Scoped authority');$('admin-avatar').textContent=initials;$('admin-top-avatar').textContent=initials;$('admin-top-role').textContent=role;$('admin-top-scope').textContent=account.accountType==='super_admin'?'Platform scope':'Tenant scope';
  const label=[...defs.flatMap(g=>g[2])].find(([,d])=>d===selected)?.[0]||pages.find(p=>p.destinationId===selected)?.label||'Overview';$('admin-crumb').textContent=label;
  const eyebrow=$('page-eyebrow'),subtitle=$('page-subtitle'),meta=pageMeta(label);if(eyebrow)eyebrow.textContent=meta.eyebrow;if(subtitle)subtitle.textContent=meta.subtitle;
 }
 function pageMeta(label){
  const map={
   Overview:['ADMIN OVERVIEW','Full financial and operational command center.'],Analytics:['ANALYTICS','Today’s volume, success, users, UPI health, fees and operating trends.'],
   Users:['ACCOUNTS','Approve users, manage capacity and commercial terms.'],Merchants:['ACCOUNTS','Approve merchants, fees, balances and settlement rates.'],'Pending approvals':['ACTION CENTER','All outstanding account, UPI, payout and withdrawal approvals.'],'User collection access':['ACCESS POLICY','Free setup and unlimited collection permissions without removing device, UPI or risk controls.'],'User deposits':['FUNDING','Review User USDT funding requests, evidence and capacity credit.'],
   'Bank & UPI':['COLLECTIONS','Review collection accounts, daily limits and route readiness.'],'UPI Analytics':['COLLECTIONS','UPI volume, utilization, success, routes and availability analytics.'],'UPI daily limits':['COLLECTIONS','Per-UPI India daily limit utilization and owner-controlled limits.'],'Assignments & routing':['COLLECTIONS','Merchant-to-user UPI assignments, limits, priorities and readiness.'],'User assignments':['ROUTING','Merchant-to-User assignment layer, separate from bank-specific UPI routes.'],Transactions:['COLLECTIONS','Unified pay-in and payout transaction activity.'],'Pay-in disputes':['DISPUTES','Live 48-hour Merchant pay-in dispute workflow with evidence review and financial holds.'],'Statements & reconciliation':['RECONCILIATION','Uploaded statement sources and trusted-evidence review.'],
   Beneficiaries:['PARKING','Create tenant-scoped beneficiaries that Users can confirm in their banking app.'],Orders:['PARKING','Create Parking orders visible only to Users who confirmed the beneficiary.'],'Review queue':['PARKING','Review User Parking payment proof, disputes and capacity restoration.'],
   'Payout approval':['PAYOUTS','Approve reserved Merchant payout requests before User routing.'],'Payout review':['PAYOUTS','Merchant review with 15-minute automatic timeout approval.'],'Payout bank capabilities':['PAYOUTS','Approve or revoke a verified User bank version for payout work.'],'Post-approval disputes':['PAYOUTS','Real 48-hour successful-payout dispute workflow with capacity and commission holds.'],'Late payment reviews':['REVIEWS','Review expired payout or Parking proof without disturbing current assignments.'],'Merchant USDT':['TREASURY','Admin-rate Merchant USDT settlements and processing states.'],'Commission withdrawals':['TREASURY','User INR / USDT commission withdrawal review.'],'User commissions':['TREASURY','Pay-in and payout commission earnings, holds, reserves and withdrawals.'],'Commission holds':['TREASURY','Separate User commission hold ledger and release workflow.'],'Holds / frozen':['RISK','Operational holds and frozen balances.'],
   'Activation codes':['APK SETUP','Admin and Employee pairing-code generation and claim status.'],Devices:['APK SETUP','All paired devices with scoped diagnostics and location history.'],'Pairing history':['APK SETUP','Account-owned pairing codes, used/expired/revoked state and scoped device linking.'],'OTP Events':['APK SETUP','Scoped OTP event access for authorized operational roles.'],'UTR Capture':['APK SETUP','Combined APK-captured and uploaded-statement UTR stream with review actions.'],'APK / Agent':['APK SETUP','Published Android Agent build, signing and release pipeline summary.'],
   Employees:['TEAM','Tenant-scoped Employee access and delegated operations.'],'Admin authority':['TEAM','Super Admin delegated Admin access and permissions.'],
   Ledger:['FINANCE','Accounting movements, commissions, holds and financial references.'],'Profit overview':['FINANCE','Merchant fees minus User commissions and recorded operating costs.'],'Pay-in fees & commissions':['FINANCE','Merchant pay-in fees, User pay-in commissions and margin.'],'Payout fees & commissions':['FINANCE','Merchant payout fees, User payout commissions and margin.'],'Fixed payout revenue':['FINANCE','Successful payout count and fixed/percentage fee components.'],'USDT exchange':['FINANCE','Confirmed User deposits and completed Merchant settlement totals; FX profit remains unavailable.'],'Salary management':['FINANCE','Record or void salary expense records.'],'Expense management':['FINANCE','Server, maintenance and other operating expenses.'],'Profit & expenses':['FINANCE','Platform fees, User commissions, expenses and operating margin.'],Reports:['REPORTS','Operational period summaries and exports.'],'Audit log':['AUDIT','Security, panel, business and operational audit history.'],
   'API credentials':['DEVELOPER','Merchant API credential metadata and scopes.'],Webhooks:['DEVELOPER','Delivery status, retries and endpoints.'],'API logs':['DEVELOPER','Merchant API access audit.'],Support:['SUPPORT','User and Merchant support queue.'],Notifications:['PLATFORM','Admin alerts and action signals.'],Security:['SECURITY','Admin/session policy and authority boundaries.'],Settings:['SETTINGS','Commercial defaults and platform behavior.'],Profile:['ACCOUNT','Admin account and security controls.']
  };
  const [eyebrow,subtitle]=map[label]||['ADMIN WORKSPACE','Live WPay operations with server-enforced permissions.'];return {eyebrow,subtitle};
 }
 function connect(value){api=value;
  const menu=$('admin-menu-btn'),veil=$('admin-mobile-veil'),theme=$('admin-theme'),notifications=$('admin-notifications'),profile=$('admin-profile'),sidebarSearch=$('admin-search'),globalSearch=$('admin-global-search'),results=$('admin-search-results');
  if(menu)menu.onclick=()=>document.body.classList.toggle('admin-nav-open');if(veil)veil.onclick=()=>document.body.classList.remove('admin-nav-open');
  if(theme){try{document.body.classList.toggle('admin-light',localStorage.getItem('wpay-admin-theme')==='light');}catch{}theme.onclick=()=>{document.body.classList.toggle('admin-light');try{localStorage.setItem('wpay-admin-theme',document.body.classList.contains('admin-light')?'light':'dark');}catch{}};}
  const filterNav=q=>{q=q.trim().toLowerCase();for(const group of $('navigation').querySelectorAll('.nav-group')){let shown=0;for(const b of group.querySelectorAll('.nav-item')){b.hidden=!!q&&!b.textContent.toLowerCase().includes(q);if(!b.hidden)shown++;}group.hidden=!!q&&!shown;}};
  if(sidebarSearch)sidebarSearch.oninput=e=>filterNav(e.target.value);
  if(globalSearch)globalSearch.oninput=e=>{const q=e.target.value.trim().toLowerCase();results.replaceChildren();if(!q){results.classList.add('hidden');return;}const matches=[...$('navigation').querySelectorAll('.nav-item')].filter(b=>b.textContent.toLowerCase().includes(q)).slice(0,10);for(const b of matches){const r=document.createElement('div');r.className='search-result';r.innerHTML='<strong>'+b.textContent+'</strong><small>Admin module</small>';r.onclick=()=>{results.classList.add('hidden');globalSearch.value='';api.navigate(b.dataset.destination);};results.append(r);}results.classList.toggle('hidden',!matches.length);};
  if(notifications)notifications.onclick=()=>{const p=nav?.groups.flatMap(g=>g.children).find(x=>x.permissionId==='notifications.view');if(p)api.navigate('v5.notifications');};
  if(profile)profile.onclick=()=>{const p=nav?.groups.flatMap(g=>g.children).find(x=>x.permissionId==='profile.view');if(p)api.navigate('v5.profile');};
 }
 async function overview({account,post,action,el,container,title,navigate},days=30){
  title.textContent='Overview';container.replaceChildren(el('p','Loading your operational overview…','admin-empty'));
  let data;try{data=await post('panel/admin-overview',{days});}catch(error){const box=el('section',undefined,'card admin-panel'),retry=el('button','Retry overview','primary');retry.type='button';retry.onclick=()=>action(()=>overview({account,post,action,el,container,title,navigate},days));box.append(el('h2','Overview could not load'),el('p','Your session may have expired or the service is temporarily unavailable.','admin-subtitle'),retry);container.replaceChildren(box);throw error;}container.replaceChildren();
  const pages=nav.groups.flatMap(g=>g.children),go=(permission,label,destination)=>{const b=el('button',label),p=pages.find(p=>p.permissionId===permission);b.type='button';b.disabled=!p;b.onclick=()=>navigate(destination||p.destinationId);return b;};
  const hero=el('section',undefined,'admin-command');const heroText=el('div');heroText.append(el('span','OPERATIONS COMMAND CENTER','admin-command-eyebrow'),el('h2','WPay platform at a glance'),el('p','Financial position, collections, approvals and operational health without overwhelming the screen.'));const heroActions=el('div',undefined,'admin-command-actions');const period=el('select');for(const n of [7,30,60]){const o=el('option','Last '+n+' days');o.value=n;period.append(o);}period.value=days;period.onchange=()=>action(()=>overview({account,post,action,el,container,title,navigate},Number(period.value)));heroActions.append(period,go('reports.view','Reports','v5.reports'));hero.append(heroText,heroActions);container.append(hero);
  const primary=[['Total volume',data.totalVolume,'Successful payment volume'],['Today collection',data.todayCollection,'India day successful pay-ins'],['Merchant available',data.merchantAvailable,'Spendable Merchant INR'],['User capacity',data.totalUserCapacity,'Allocated User capacity'],['Platform fees',data.totalFees,'Merchant pay-in + payout fees'],['Pending actions',Object.values(data.approvals||{}).filter(v=>v!==null&&v!==undefined).reduce((n,v)=>n+Number(v),0),'Approvals and reviews']];
  const pgrid=el('div',undefined,'admin-primary-kpis');for(const [label,value,hint]of primary){const card=el('article',undefined,'card admin-kpi-compact');card.append(el('span',label,'admin-kpi-label'),el('strong',typeof value==='number'?String(value):money(value)),el('small',hint));pgrid.append(card);}container.append(pgrid);
  const secondary=el('div',undefined,'admin-secondary-kpis');for(const [label,value,moneyValue=false]of [['Users',data.totalUsers],['Merchants',data.totalMerchants],['Employees',data.totalEmployees],['User commission',data.totalUserCommission,true],['User deposits',data.totalUserDeposits,true],['Running UPI',data.runningUpi],['Available UPI',data.availableUpi],['Success rate',data.successRate===null||data.successRate===undefined?'—':(Number(data.successRate)*100).toFixed(1)+'%']]){const item=el('div');item.append(el('small',label),el('strong',moneyValue?money(value):String(value??'—')));secondary.append(item);}container.append(secondary);
  const first=el('div',undefined,'admin-columns'),chart=el('section',undefined,'card admin-panel'),queue=el('section',undefined,'card admin-panel');chart.append(el('h2','Collection & payout trend'),el('p','Successful volume · selected period','admin-subtitle'));const legend=el('div','● Pay-in','admin-legend');legend.append(el('span','● Payout'));chart.append(legend);
  if(data.totalVolume===null)chart.append(el('p','Volume unavailable for your permissions.','admin-empty'));else if(!data.series.length)chart.append(el('p','No successful payments in this period.','admin-empty'));else chart.append(volumeChart(data));
  queue.append(el('h2','Action center'));for(const [label,value,permission,destination]of [['User approvals',data.approvals.user,'users.view','v5.approvals'],['Merchant approvals',data.approvals.merchant,'merchants.view','v5.approvals'],['Bank & UPI review',data.approvals.bank,'bank_upi.view','v5.bank-upi'],['Deposit review',data.approvals.deposit,'deposits.view','v5.deposits'],['Payout approvals',data.approvals.payout,'payout_operations.view','v5.payout-approval'],['Payout disputes',data.approvals.dispute,'payout_operations.view','v5.payout-disputes'],['Late reviews',data.approvals.late,'payout_operations.view','v5.late-reviews'],['Withdrawals',data.approvals.withdrawal,'commission_withdrawal.view','v5.withdrawals']]){if(value===undefined)continue;const row=el('div',undefined,'admin-review');row.append(el('span',label),el('strong',String(value??'—')),go(permission,'Review →',destination));queue.append(row);}first.append(chart,queue);container.append(first);
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
