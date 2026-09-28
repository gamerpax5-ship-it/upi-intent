"use strict";
(function(root){
 let api,nav,resetSearch;
 const $=id=>document.getElementById(id);
 const ICONS={
  overview:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  analytics:'<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/><path d="m4 14 5-4 5 2 5-6"/>',
  users:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M17 7a3 3 0 0 1 0 6m2 8a5 5 0 0 0-3-4.6"/>',
  merchant:'<path d="M3 10h18M5 10v10h14V10M7 4h10l3 6H4l3-6Z"/><path d="M9 14h6"/>',
  approvals:'<path d="M9 11l2 2 4-5"/><path d="M5 3h14v18H5z"/><path d="M8 17h8"/>',
  bank:'<path d="M3 10h18M5 10v8m5-8v8m4-8v8m5-8v8M2 21h20M12 3l9 5H3l9-5Z"/>',
  routing:'<path d="M5 5h6v6H5zM13 13h6v6h-6z"/><path d="M11 8h3a3 3 0 0 1 3 3v2M13 16h-3a3 3 0 0 1-3-3v-2"/>',
  transactions:'<path d="M4 7h16m-13-3L4 7l3 3m10 4 3 3-3 3M4 17h16"/>',
  statements:'<path d="M6 3h9l3 3v15H6V3Zm9 0v4h4M9 11h6m-6 4h6"/>',
  dispute:'<path d="M5 21V4m0 1h12l-2 4 2 4H5"/><circle cx="18" cy="18" r="3"/>',
  payout:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h10m-10 4h6"/><path d="m16 16 3-3-3-3"/>',
  usdt:'<circle cx="12" cy="12" r="9"/><path d="M8 8h8M8 12h8m-4-7v14"/>',
  withdraw:'<path d="M12 3v13m0 0 5-5m-5 5-5-5M5 21h14"/>',
  hold:'<rect x="4" y="7" width="16" height="12" rx="2"/><path d="M8 7V5a4 4 0 0 1 8 0v2M12 11v4"/>',
  parking:'<path d="M7 21V3h7a5 5 0 0 1 0 10H7m0 0h7"/>',
  activation:'<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h3"/><circle cx="17" cy="16" r="2"/>',
  device:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4m-2 14h.01"/>',
  otp:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M7 9h2m2 0h2m2 0h2M7 14h10"/>',
  utr:'<path d="M4 5h16v14H4z"/><path d="M7 9h10M7 13h6"/><path d="m15 16 2 2 4-4"/>',
  apk:'<path d="M8 6 6 3m10 3 2-3M7 8h10a3 3 0 0 1 3 3v7H4v-7a3 3 0 0 1 3-3Z"/><path d="M8 12h.01M16 12h.01M8 18v3m8-3v3"/>',
  employees:'<circle cx="9" cy="7" r="3"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16 11h5m-2.5-2.5v5"/>',
  admin:'<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="M9 12h6M12 9v6"/>',
  ledger:'<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  finance:'<circle cx="12" cy="12" r="9"/><path d="M8 14c1 2 7 2 7-1 0-3-7-1-7-4 0-3 6-3 7-1M12 5v14"/>',
  reports:'<path d="M5 3h14v18H5z"/><path d="M8 16v-3m4 3V8m4 8v-5"/>',
  audit:'<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>',
  key:'<circle cx="8" cy="12" r="4"/><path d="m12 12 9-9m-4 4 2 2m-5 1 2 2"/>',
  webhook:'<path d="M7 7a5 5 0 0 1 8-1l2 2"/><path d="m17 4 .5 4.5L13 9"/><path d="M17 17a5 5 0 0 1-8 1l-2-2"/><path d="m7 20-.5-4.5L11 15"/>',
  logs:'<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  support:'<path d="M4 5h16v12H9l-5 4V5Z"/><path d="M8 9h8m-8 4h5"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  security:'<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.3 3.1h5l.3-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4L18.9 13a7 7 0 0 0 .1-1Z"/>',
  profile:'<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
  location:'<path d="M12 21s7-5.5 7-12a7 7 0 1 0-14 0c0 6.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2"/>',
  battery:'<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10v4"/>',
  network:'<path d="M4 16a11 11 0 0 1 16 0M7 13a7 7 0 0 1 10 0m-7 3a3 3 0 0 1 4 0"/><circle cx="12" cy="19" r="1"/>',
  volume:'<path d="M4 18V9m5 9V5m5 13v-7m5 7V3"/>',
  fee:'<path d="M5 5h14v14H5z"/><path d="m8 16 8-8M9 9h.01M15 15h.01"/>',
  capacity:'<path d="M4 17h16M6 17V9h3v8m3 0V5h3v12m3 0v-4h2"/>',
  deposit:'<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/>',
  upianalytics:'<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/><path d="M3 4h5v5H3zM16 4h5v5h-5z"/>',
  beneficiary:'<circle cx="8" cy="8" r="3"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0"/><path d="M15 5h6v6h-6z"/><path d="m16.5 8 1 1 2-2"/>',
  orders:'<path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/><path d="m16 16 2 2 3-4"/>',
  parkingreview:'<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5"/><circle cx="17" cy="16" r="3"/><path d="m16 16 1 1 2-2"/>',
  commission:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  access:'<path d="M4 7h10M4 12h16M4 17h8"/><circle cx="18" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
  history:'<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8"/><path d="M4 3v5h5M12 8v5l3 2"/>',
  late:'<path d="M12 3v9l4 2"/><circle cx="12" cy="12" r="9"/><path d="m16 18 2 2 4-4"/>',
  dispute2:'<path d="M4 5h16v12H8l-4 4V5Z"/><path d="M8 9h8m-8 4h5"/><path d="m16 16 2 2 3-4"/>',
  password:'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/>',
  success:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'
 };
 const icon=name=>'<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(ICONS[name]||ICONS.overview)+'</svg>';
 const money=value=>value===null||value===undefined?'—':(()=>{const n=BigInt(value),a=n<0n?-n:n;return (n<0n?'−':'')+'₹'+(a/100n).toLocaleString('en-IN')+'.'+String(a%100n).padStart(2,'0');})();
 function sync(account,navigation,selected){
  resetSearch?.();
  nav=navigation;const pages=navigation.groups.flatMap(g=>g.children),byPerm=id=>pages.find(p=>p.permissionId===id),byDest=id=>pages.find(p=>p.destinationId===id),can=id=>!!byPerm(id),dest=(permission,...preferred)=>{for(const d of preferred){const p=byDest(d);if(p)return p.destinationId;}return byPerm(permission)?.destinationId||null;};
  const defs=[
   ['DASHBOARD',null,[
    ['Overview',dest('overview.view','administration.dashboard'),'overview'],
    ['Analytics',can('overview.view')?'v5.analytics':null,'analytics']
   ]],
   ['ACCOUNTS & APPROVALS',null,[
    ['Users',can('users.view')?'v5.users':null,'users'],
    ['Merchants',can('merchants.view')?'v5.merchants':null,'merchant'],
    ['Pending approvals',(can('users.view')||can('merchants.view'))?'v5.approvals':null,'approvals'],
    ['User collection access',can('users.commercial.update')?'v5.collection-access':null,'access'],
    ['User deposits',can('deposits.view')?'v5.deposits':null,'deposit']
   ]],
   ['COLLECTIONS & ROUTING',null,[
    ['Bank & UPI',can('bank_upi.view')?'v5.bank-upi':null,'bank'],
    ['UPI Analytics',can('bank_upi.view')?'v5.upi-analytics':null,'upianalytics'],
    ['UPI daily limits',can('bank_upi.view')?'v5.upi-limits':null,'capacity'],
    ['Assignments & routing',can('routing.view')?'v5.routing':null,'routing'],
    ['User assignments',can('assignments.view')?'v5.assignments':null,'routing'],
    ['Transactions',can('transactions.view')?'v5.transactions':null,'transactions'],
    ['Pay-in disputes',can('payin_dispute.view')?'v5.payin-disputes':null,'dispute'],
    ['Statements & reconciliation',can('statement_reconciliation.view')?'v5.statements':null,'statements']
   ]],
   ['PARKING',null,[
    ['Beneficiaries',can('parking.view')?'v5.parking-beneficiaries':null,'beneficiary'],
    ['Orders',can('parking.view')?'v5.parking-orders':null,'orders'],
    ['Review queue',can('parking.view')?'v5.parking-review':null,'parkingreview']
   ]],
   ['PAYOUTS & TREASURY',null,[
    ['Payout approval',can('payout_operations.view')?'v5.payout-approval':null,'payout'],
    ['Payout review',can('payout_operations.view')?'v5.payout-review':null,'payout'],
    ['Payout bank capabilities',can('payout_operations.view')?'v5.payout-capabilities':null,'bank'],
    ['Post-approval disputes',can('payout_operations.view')?'v5.payout-disputes':null,'dispute2'],
    ['Late payment reviews',can('payout_operations.view')?'v5.late-reviews':null,'late'],
    ['Merchant USDT',can('payout_operations.view')?'v5.merchant-usdt':null,'usdt'],
    ['Commission withdrawals',can('commission_withdrawal.view')?'v5.withdrawals':null,'withdraw'],
    ['User commissions',can('reports.view')?'v5.user-commissions':null,'commission'],
    ['Commission holds',can('commission_hold.view')?'v5.commission-holds':null,'hold'],
    ['Holds / frozen',can('holds.view')?'v5.holds':null,'hold']
   ]],
   ['APK SETUP',null,[
    ['Activation codes',can('devices.view')?'v5.activation':null,'activation'],
    ['Devices',can('devices.view')?'v5.devices':null,'device'],
    ['Pairing history',can('devices.view')?'v5.pairing-history':null,'history'],
    ['OTP Events',dest('apk_otp_events.view_all','operations.otp'),'otp'],
    ['UTR Capture',can('utr_center.view')?'v5.utr':null,'utr'],
    ['APK / Agent',can('apk.view')?'v5.apk':null,'apk']
   ]],
   ['TEAM & ACCESS',null,[
    ['Employees',can('employee_management.view')?'v5.employees':null,'employees'],
    ['Admin authority',byDest('operations.admins')?'v5.admins':null,'admin']
   ]],
   ['FINANCE & REPORTS',null,[
    ['Ledger',can('ledger.view')?'v5.ledger':null,'ledger'],
    ['Profit overview',can('reports.view')?'v5.profit-overview':null,'finance'],
    ['Pay-in fees & commissions',can('reports.view')?'v5.finance-payin':null,'fee'],
    ['Payout fees & commissions',can('reports.view')?'v5.finance-payout':null,'payout'],
    ['Fixed payout revenue',can('reports.view')?'v5.finance-fixed':null,'commission'],
    ['USDT exchange',can('reports.view')?'v5.finance-usdt':null,'usdt'],
    ['Salary management',can('reports.view')?'v5.finance-salary':null,'employees'],
    ['Expense management',can('reports.view')?'v5.finance-expenses':null,'finance'],
    ['Profit & expenses',can('reports.view')?'v5.profit-expenses':null,'finance'],
    ['Reports',can('reports.view')?'v5.reports':null,'reports'],
    ['Audit log',can('settings.view')?'v5.audit':null,'audit']
   ]],
   ['DEVELOPER',null,[
    ['API credentials',can('api_credentials.view')?'v5.credentials':null,'key'],
    ['Webhooks',can('webhooks.view')?'v5.webhooks':null,'webhook'],
    ['API logs',can('api_logs.view')?'v5.api-logs':null,'logs']
   ]],
   ['SUPPORT & PLATFORM',null,[
    ['Support',can('support_admin.view')?'v5.support':null,'support'],
    ['Notifications',can('notifications.view')?'v5.notifications':null,'bell'],
    ['Security',can('account_security.view')?'v5.security':null,'security'],
    ['Settings',can('settings.view')?'v5.settings':null,'settings'],
    ['Profile',can('profile.view')?'v5.profile':null,'profile']
   ]]
  ];
  const navigationRoot=$('navigation');navigationRoot.replaceChildren();
  for(const [groupName,ico,items] of defs){
   const visible=items.filter(([,d])=>d);if(!visible.length)continue;
   const section=document.createElement('div');section.className='nav-group';const title=document.createElement('div');title.className='nav-title';title.textContent=groupName;section.append(title);
   for(const [label,d,itemIcon]of visible){const b=document.createElement('button');b.type='button';b.className='nav-item';b.dataset.destination=d;b.innerHTML='<span class="nav-icon">'+icon(itemIcon)+'</span><span>'+label+'</span>';if(d===selected||(!selected&&label==='Overview'))b.classList.add('active');b.onclick=()=>{document.body.classList.remove('admin-nav-open');api.navigate(d);};section.append(b);}
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
   Ledger:['FINANCE','Accounting movements, commissions, holds and financial references.'],'Profit overview':['FINANCE','Merchant fees minus User commissions and recorded operating costs.'],'Pay-in fees & commissions':['FINANCE','Merchant pay-in fees, User pay-in commissions and margin.'],'Payout fees & commissions':['FINANCE','Merchant payout fees, User payout commissions and margin.'],'Fixed payout revenue':['FINANCE','Successful payout count and fixed/percentage fee components.'],'USDT exchange':['FINANCE','Actual User deposit and Merchant settlement amounts valued at their locked account rates.'],'Salary management':['FINANCE','Record or void salary expense records.'],'Expense management':['FINANCE','Server, maintenance and other operating expenses.'],'Profit & expenses':['FINANCE','Platform fees, User commissions, expenses and operating margin.'],Reports:['REPORTS','Operational period summaries and exports.'],'Audit log':['AUDIT','Security, panel, business and operational audit history.'],
   'API credentials':['DEVELOPER','Merchant API credential metadata and scopes.'],Webhooks:['DEVELOPER','Delivery status, retries and endpoints.'],'API logs':['DEVELOPER','Merchant API access audit.'],Support:['SUPPORT','User and Merchant support queue.'],Notifications:['PLATFORM','Admin alerts and action signals.'],Security:['SECURITY','Admin/session policy and authority boundaries.'],Settings:['SETTINGS','Commercial defaults and platform behavior.'],Profile:['ACCOUNT','Admin account and security controls.']
  };
  const [eyebrow,subtitle]=map[label]||['ADMIN WORKSPACE','Live WPay operations with server-enforced permissions.'];return {eyebrow,subtitle};
 }
 let searchSelection=null;
 function takeSearch(destination){const selected=searchSelection;searchSelection=null;return selected?.destination===destination?selected.state:{};}
 async function searchEntities(post,permissions,query){
  const q=String(query||'').trim().slice(0,100),hits=[],warnings=[];
  if(q.length<2)return {hits,warnings};
  await Promise.all([['users.view','user','v5.users'],['merchants.view','merchant','v5.merchants']].map(async([permission,type,destination])=>{
   if(!permissions.includes(permission))return;
   try{const data=await post('panel/directory',{type,status:'all',search:q,limit:3,offset:0});for(const row of data.rows)hits.push({label:row.name,subtitle:(type==='user'?'User':'Merchant')+' · '+row.email,destination,state:{search:row.id}});}catch{warnings.push((type==='user'?'User':'Merchant')+' search unavailable.');}
  }));
  if(permissions.includes('utr_center.view')&&/^[0-9]{12}$/.test(q)){
   try{
    const [sources,claims]=await Promise.all([post('operations/utr-source',{}),post('operations/utr/pending',{status:'all',offset:0,utr:q})]);
    for(const r of claims.records.slice(0,3))hits.push({label:r.utr,subtitle:'Payment claim · '+r.reference+' · '+r.status,destination:'v5.utr',state:{utr:q}});
    const links=sources.links||[];let captured=0;
    for(let start=0;start<links.length&&captured<3;start+=4){
     const batches=await Promise.all(links.slice(start,start+4).map(async link=>{try{return await post('operations/utr-source',{linkId:link.id,utr:q});}catch{warnings.push('A UTR source is unavailable.');return {observations:[]};}}));
     for(const data of batches)for(const r of data.observations){if(captured>=3)break;captured++;hits.push({label:r.utr,subtitle:(r.source==='transactions'?'APK':'Statement')+' · INR '+r.amount,destination:'v5.utr',state:{utr:q}});}
    }
    if(sources.afterLink)warnings.push('More sources are available on the UTR Capture page.');
   }catch{warnings.push('UTR search unavailable; open Security to confirm access if required.');}
  }
  return {hits,warnings:[...new Set(warnings)]};
 }
 function connectSearch(input,results){
  if(!input||!results)return;let generation=0,timer;
  input.maxLength=100;input.setAttribute('aria-controls','admin-search-results');input.setAttribute('aria-expanded','false');results.setAttribute('aria-live','polite');
  const hide=()=>{generation++;clearTimeout(timer);results.classList.add('hidden');input.setAttribute('aria-expanded','false');};
  resetSearch=()=>{hide();input.value='';results.replaceChildren();};
  const add=(label,subtitle,destination,state)=>{const row=document.createElement('button'),strong=document.createElement('strong'),small=document.createElement('small');row.type='button';row.className='search-result';strong.textContent=label;small.textContent=subtitle;row.append(strong,small);row.onclick=()=>{hide();input.value='';searchSelection={destination,state:state||{}};api.navigate(destination);};results.append(row);};
  input.oninput=()=>{
   clearTimeout(timer);const current=++generation,q=input.value.trim();results.replaceChildren();if(!q){hide();return;}
   const pages=[...$('navigation').querySelectorAll('.nav-item')].filter(b=>b.textContent.toLowerCase().includes(q.toLowerCase())).slice(0,6);for(const p of pages)add(p.textContent,'Admin module',p.dataset.destination);
   results.classList.remove('hidden');input.setAttribute('aria-expanded','true');
   const note=document.createElement('div');note.className='search-result search-note';note.textContent=q.length<2?'Type at least two characters to search accounts.':'Searching accounts'+(/^[0-9]{12}$/.test(q)?' and UTRs':'')+'…';results.append(note);
   if(q.length<2)return;
   timer=setTimeout(async()=>{const permissions=(nav?.groups||[]).flatMap(g=>g.children).map(p=>p.permissionId),data=await searchEntities(api.post,permissions,q);if(current!==generation)return;note.remove();for(const h of data.hits)add(h.label,h.subtitle,h.destination,h.state);for(const text of data.warnings){const n=document.createElement('div');n.className='search-result search-note';n.textContent=text;results.append(n);}if(!pages.length&&!data.hits.length&&!data.warnings.length){note.textContent='No matching accounts or pages. Enter a full 12-digit UTR to search receipts.';results.append(note);}},300);
  };
  document.addEventListener('click',e=>{if(!e.target.closest('.top-search'))hide();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();input.focus();}});
 }

 function connect(value){api=value;
  const menu=$('admin-menu-btn'),veil=$('admin-mobile-veil'),theme=$('admin-theme'),notifications=$('admin-notifications'),profile=$('admin-profile'),sidebarSearch=$('admin-search'),globalSearch=$('admin-global-search'),results=$('admin-search-results');
  if(menu)menu.onclick=()=>{const open=document.body.classList.toggle('admin-nav-open');menu.setAttribute('aria-expanded',String(open));};if(veil)veil.onclick=()=>{document.body.classList.remove('admin-nav-open');menu?.setAttribute('aria-expanded','false');};
  if(theme){try{document.body.classList.toggle('admin-light',localStorage.getItem('wpay-admin-theme')==='light');}catch{}theme.onclick=()=>{document.body.classList.toggle('admin-light');try{localStorage.setItem('wpay-admin-theme',document.body.classList.contains('admin-light')?'light':'dark');}catch{}};}
  const filterNav=q=>{q=q.trim().toLowerCase();for(const group of $('navigation').querySelectorAll('.nav-group')){let shown=0;for(const b of group.querySelectorAll('.nav-item')){b.hidden=!!q&&!b.textContent.toLowerCase().includes(q);if(!b.hidden)shown++;}group.hidden=!!q&&!shown;}};
  if(sidebarSearch)sidebarSearch.oninput=e=>filterNav(e.target.value);
  connectSearch(globalSearch,results);
  if(notifications)notifications.onclick=()=>{const p=nav?.groups.flatMap(g=>g.children).find(x=>x.permissionId==='notifications.view');if(p)api.navigate('v5.notifications');};
  if(profile)profile.onclick=()=>{const p=nav?.groups.flatMap(g=>g.children).find(x=>x.permissionId==='profile.view');if(p)api.navigate('v5.profile');};
 }
 async function overview({account,request,post,action,el,container,title,navigate},days=14){
  title.textContent='Overview';container.replaceChildren(el('p','Loading your operational overview…','admin-empty'));
  const safe=promise=>Promise.resolve(promise).catch(()=>null);
  let data;try{data=await post('panel/admin-overview',{days});}catch(error){const box=el('section',undefined,'card panel'),retry=el('button','Retry overview','btn primary');retry.type='button';retry.onclick=()=>action(()=>overview({account,request,post,action,el,container,title,navigate},days));box.append(el('h2','Overview could not load'),el('p','Your session may have expired or the service is temporarily unavailable.','muted'),retry);container.replaceChildren(box);throw error;}
  const healthPromise=Promise.all([
    safe(post('operations/device-setup',{})),
    safe(request('parking/admin')),
    safe(request('panel/merchant-default-rate')),
    safe(post('panel/notifications',{offset:0,limit:100}))
  ]);
  container.replaceChildren();
  const pages=nav.groups.flatMap(g=>g.children),go=(permission,label,destination,primary=false)=>{const b=el('button',label,'btn'+(primary?' primary':'')+(label==='Deep analytics'||label==='View all'?' sm':'')),p=pages.find(p=>p.permissionId===permission);b.type='button';b.disabled=!p;b.onclick=()=>navigate(destination||p.destinationId);return b;};

  const hero=el('section',undefined,'command-strip'),main=el('div',undefined,'command-main'),copy=el('div'),actions=el('div',undefined,'command-actions');
  copy.append(el('div','OPERATIONS COMMAND CENTER','eyebrow'),el('h2','WPay platform at a glance'),el('p','Financial position, collection health and operational queues without overwhelming the screen.'));
  const analytics=go('overview.view','Analytics','v5.analytics',true),actionCenter=go('users.view','Action center','v5.approvals');analytics.insertAdjacentHTML('afterbegin',icon('analytics')+' ');actionCenter.insertAdjacentHTML('afterbegin',icon('approvals')+' ');actions.append(analytics,actionCenter);main.append(copy,actions);hero.append(main);container.append(hero);

  const pendingTotal=Object.values(data.approvals||{}).filter(v=>v!==null&&v!==undefined).reduce((n,v)=>n+Number(v),0),primary=[
    ['volume','Total volume',data.totalVolume,'Successful payment volume'],
    ['deposit','Today collection',data.todayCollection,'Successful pay-ins today'],
    ['merchant','Merchant available',data.merchantAvailable,'Spendable Merchant INR'],
    ['capacity','User capacity',data.totalUserCapacity,'Allocated capacity'],
    ['fee','Platform fees',data.totalFees,'Fee income'],
    ['approvals','Pending actions',pendingTotal,'Needs Admin review']
  ];
  const pgrid=el('div',undefined,'primary-kpis');for(const [iconName,label,value,hint]of primary){const card=el('article',undefined,'kpi-compact'),ico=el('div',undefined,'ico'),body=el('div');ico.innerHTML=icon(iconName);body.append(el('small',label),el('strong',typeof value==='number'?String(value):money(value)),el('em',hint));card.append(ico,body);pgrid.append(card);}container.append(pgrid);

  const secondary=el('div',undefined,'secondary-kpis');for(const [label,value,moneyValue=false]of [
    ['Total users',data.totalUsers],['Merchants',data.totalMerchants],['Employees',data.totalEmployees],['User commission',data.totalUserCommission,true],
    ['User deposits',data.totalUserDeposits,true],['Running UPI',data.runningUpi],['Available UPI',data.availableUpi],['Success rate',data.overallSuccessRate==null?'—':(Number(data.overallSuccessRate)*100).toFixed(1)+'%']
  ]){const item=el('div');item.append(el('small',label),el('strong',moneyValue?money(value):String(value??'—')));secondary.append(item);}container.append(secondary);

  const grid=el('div',undefined,'dashboard-grid'),chart=el('section',undefined,'card panel'),queue=el('section',undefined,'card panel');
  const chartHead=el('div',undefined,'panel-head'),chartCopy=el('div');chartCopy.append(el('h2','Collection & payout trend'),el('p','Last 14 days · INR'));chartHead.append(chartCopy,go('overview.view','Deep analytics','v5.analytics'));chart.append(chartHead);if(data.totalVolume===null)chart.append(el('p','Volume unavailable for your permissions.','empty'));else if(!data.series.length)chart.append(el('p','No successful payments in this period.','empty'));else chart.append(volumeChart(data));

  const qHead=el('div',undefined,'panel-head'),qCopy=el('div');qCopy.append(el('h2','Action center'),el('p','Highest priority queues'));qHead.append(qCopy,el('span',pendingTotal+' pending','pill amber'));queue.append(qHead);const list=el('div',undefined,'action-list');
  for(const [iconName,label,value,permission,destination]of [
    ['users','User approvals',data.approvals.user,'users.view','v5.approvals'],['merchant','Merchant approvals',data.approvals.merchant,'merchants.view','v5.approvals'],
    ['bank','UPI reviews',data.approvals.bank,'bank_upi.view','v5.bank-upi'],['payout','Payout approvals',data.approvals.payout,'payout_operations.view','v5.payout-approval'],
    ['deposit','Deposit review',data.approvals.deposit,'deposits.view','v5.deposits'],['dispute2','Payout disputes',data.approvals.dispute,'payout_operations.view','v5.payout-disputes'],
    ['late','Late reviews',data.approvals.late,'payout_operations.view','v5.late-reviews']
  ]){if(value===undefined)continue;const item=el('div',undefined,'action-card'),ico=el('div',undefined,'action-icon'),body=el('div');ico.innerHTML=icon(iconName);body.append(el('strong',label),el('span',String(value??0)+' waiting for action'));item.append(ico,body,go(permission,'Review →',destination));list.append(item);}queue.append(list);grid.append(chart,queue);container.append(grid);

  const bottom=el('div',undefined,'dashboard-bottom'),activity=el('section',undefined,'card panel'),health=el('section',undefined,'card panel');
  const aHead=el('div',undefined,'panel-head'),aCopy=el('div');aCopy.append(el('h2','Recent financial activity'),el('p','Latest posted / verification activity'));aHead.append(aCopy,go('transactions.view','View all','v5.transactions'));activity.append(aHead);
  const tableWrap=el('div',undefined,'table-wrap'),table=el('table'),thead=el('thead'),hr=el('tr');for(const h of ['Reference','Type','Amount','Party','Status','Evidence'])hr.append(el('th',h));thead.append(hr);const tbody=el('tbody');
  for(const r of data.recentActivity||[]){const tr=el('tr'),ref=el('td'),refStrong=el('strong',r.reference),refDate=el('div',r.happened?new Date(r.happened).toLocaleString('en-IN'):'—','small muted'),party=el('td'),merchant=el('div',r.merchant||'—'),user=el('div',r.user||'—','small muted');ref.append(refStrong,refDate);party.append(merchant,user);tr.append(ref,el('td',String(r.type||'—')),el('td',money(r.amount)),party,el('td',String(r.status||'—')),el('td',String(r.evidence||'—')));tbody.append(tr);}
  if(!tbody.children.length){const tr=el('tr'),td=el('td');td.colSpan=6;td.append(el('div','No matching records.','empty'));tr.append(td);tbody.append(tr);}table.append(thead,tbody);tableWrap.append(table);activity.append(tableWrap);

  const hHead=el('div',undefined,'panel-head'),hCopy=el('div');hCopy.append(el('h2','Operational health'),el('p','Collections + APK Setup'));hHead.append(hCopy);health.append(hHead);
  const addHealth=(label,value)=>{const row=el('div',undefined,'summary-row');row.append(el('span',label),el('strong',String(value)));health.append(row);};
  addHealth('UPI shared limit used',money(data.upiLimitUsed||0)+' / '+money(data.upiLimitTotal||0));
  addHealth('Active devices','Loading…');addHealth('Parking open orders','Loading…');addHealth('UTR review','Open UTR Center');addHealth('USDT rate','Loading…');addHealth('Unread notifications','Loading…');
  bottom.append(activity,health);container.append(bottom);
  healthPromise.then(([devices,parking,defaults,notifications])=>{
    const online=devices?devices.devices.filter(x=>x.status==='online').length:null,totalDevices=devices?.devices?.length??null,openParking=parking?parking.orders.filter(x=>x.state==='open').length:null;
    const rates=(defaults?.tenants||[]).map(x=>x.rate).filter(Boolean),rate=rates.length?(rates.every(x=>x===rates[0])?'₹'+rates[0]:'Multiple'):'—',unread=notifications?.rows?(String(notifications.rows.filter(x=>!x.read).length)+(notifications.nextOffset!==null&&notifications.nextOffset!==undefined?'+':'')):'—';
    health.replaceChildren(hHead);addHealth('UPI shared limit used',money(data.upiLimitUsed||0)+' / '+money(data.upiLimitTotal||0));addHealth('Active devices',online==null?'—':online+' / '+totalDevices);addHealth('Parking open orders',openParking??'—');addHealth('UTR review','Open UTR Center');addHealth('USDT rate',rate);addHealth('Unread notifications',unread);
  }).catch(()=>{});

 }
 function volumeChart(data){
  const ns='http://www.w3.org/2000/svg',wrap=document.createElement('div'),chart=document.createElement('div'),svg=document.createElementNS(ns,'svg');chart.className='chart';svg.setAttribute('viewBox','0 0 760 260');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('role','img');svg.setAttribute('aria-label','Daily successful pay-in and payout amounts in INR');
  const add=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;svg.append(e);return e;};
  const keys=[...new Set((data.series||[]).map(r=>r.day))],max=Math.max(1,...(data.series||[]).map(r=>Number(r.amount)/100)),p=38,w=760,h=260;
  const x=i=>p+i*(w-p*2)/Math.max(1,keys.length-1),y=v=>h-p-v*(h-p*2)/max;
  for(let i=0;i<5;i++){const yy=p+i*(h-p*2)/4;add('line',{class:'grid-line',x1:p,x2:w-p,y1:yy,y2:yy});}
  const seriesPoints={};
  for(const [kind,cls]of [['payin','line1'],['payout','line2']]){const map=new Map((data.series||[]).filter(r=>r.kind===kind).map(r=>[r.day,Number(r.amount)/100]));const points=keys.map((k,i)=>[x(i),y(map.get(k)||0)]);seriesPoints[kind]=points;add('polyline',{class:cls,points:points.map(q=>q.join(',')).join(' ')});}
  if(seriesPoints.payin?.length)add('polygon',{class:'area',points:p+','+(h-p)+' '+seriesPoints.payin.map(q=>q.join(',')).join(' ')+' '+(w-p)+','+(h-p)});
  keys.forEach((k,i)=>{if(i%3===0||i===keys.length-1)add('text',{x:x(i),y:h-8,'text-anchor':'middle'},k.slice(5));});chart.append(svg);wrap.append(chart);
  const legend=document.createElement('div');legend.className='legend';const a=document.createElement('span'),b=document.createElement('span'),ia=document.createElement('i'),ib=document.createElement('i');ia.style.background='#9a6bff';ib.style.background='#55d6c8';a.append(ia,document.createTextNode('Pay-in volume'));b.append(ib,document.createTextNode('Payout volume'));legend.append(a,b);wrap.append(legend);return wrap;
 }
 root.WPayAdminUi={sync,connect,overview,icon,volumeChart,searchEntities,takeSearch};
})(globalThis);
