"use strict";
(function(root){
 const money=value=>{const n=BigInt(value||'0'),sign=n<0n?'-':'',a=n<0n?-n:n,s=a.toString().padStart(3,'0');return sign+'₹'+s.slice(0,-2)+'.'+s.slice(-2);};
 const ratio=value=>value===null||value===undefined?'—':(Number(value)*100).toFixed(1)+'%';
 async function optional(fn,fallback){try{return await fn();}catch(error){if(error.message==='error.FORBIDDEN')return {...fallback,unavailable:true};throw error;}}
 function metric(el,label,value,hint){const c=el('article',undefined,'card role-metric');c.append(el('span',label,'role-metric-label'),el('strong',value,'role-metric-value'),el('small',hint||'','role-metric-hint'));return c;}
 async function merchant(args){
  const {request,el,container,title}=args;title.textContent='Dashboard';
  const [business,gateway,payout,holds,orders]=await Promise.all([
   request('business/summary'),request('gateway/summary'),request('payout/summary'),request('business/holds'),optional(()=>request('gateway/orders'),{orders:[]})
  ]);
  const active=(holds.holds||[]).filter(h=>h.state==='active'),frozen=active.filter(h=>h.category==='frozen').reduce((n,h)=>n+BigInt(h.amount_minor),0n),held=active.filter(h=>h.category!=='frozen').reduce((n,h)=>n+BigInt(h.amount_minor),0n);
  const grid=el('div',undefined,'role-metric-grid');grid.append(
   metric(el,'Available Balance',money(business.available),'Spendable Merchant INR'),
   metric(el,'Frozen Balance',money(frozen),'Risk / dispute frozen'),
   metric(el,'Hold Balance',money(held),'Operational holds'),
   metric(el,'Total Volume',money(gateway.successfulVolumeMinor),'Successful order volume'),
   metric(el,'Payout Orders',String(payout.orderCount??0),String(payout.openCount??0)+' open'),
   metric(el,'Success Rate',ratio(gateway.successRate),String(gateway.total||0)+' total orders')
  );
  const layout=el('div',undefined,'role-dashboard-columns'),health=el('section',undefined,'card role-dashboard-card'),recent=el('section',undefined,'card role-dashboard-card');
  health.append(el('h2','Operational Health'),el('p','Payment verification: '+(gateway.verificationConnected?'Connected':'Provider unavailable'),'hint'),el('p','Routing capacity: '+money(business.routingCapacity||'0'),'hint'),el('p','USDT rate: '+(payout.merchantUsdt?.rate?('₹'+payout.merchantUsdt.rate+' / USDT'):'Admin rate not configured'),'hint'));
  recent.append(el('h2','Recent Orders'));for(const o of (orders.orders||[]).slice(0,6)){const r=el('article',undefined,'role-dashboard-row');r.append(el('strong',o.reference),el('span',money(o.amountMinor)+' · '+o.status));recent.append(r);}if(!(orders.orders||[]).length)recent.append(el('p',orders.unavailable?'Recent orders are unavailable for this account.':'No orders yet.','hint'));
  layout.append(recent,health);container.replaceChildren(grid,layout);
 }
 async function user(args){
  const {request,el,container,title}=args;title.textContent='Dashboard';
  const [business,payout,banks,parking]=await Promise.all([
   request('business/summary'),request('payout/summary'),request('business/banks'),optional(()=>request('parking/orders'),{orders:[],history:[]})
  ]);
  const running=(banks.banks||[]).filter(b=>b.status==='running').length,verified=(banks.banks||[]).filter(b=>b.verified_version===b.version).length;
  const grid=el('div',undefined,'role-metric-grid');grid.append(
   metric(el,'Available Capacity',money(business.available),'Signed capacity '+money(business.signedAvailable||business.available)),
   metric(el,'Pay-in Commission',money(payout.payin||'0'),'Earned from verified pay-ins'),
   metric(el,'Payout Commission',money(payout.payout||'0'),'Earned from completed payouts'),
   metric(el,'Held / Frozen',money(business.held),'Capacity holds'),
   metric(el,'Running UPI',String(running),String(verified)+' verified bank versions'),
   metric(el,'Parking Orders',parking.unavailable?'—':String((parking.orders||[]).length),parking.unavailable?'Unavailable for this account':String((parking.history||[]).filter(x=>['active','submitted','review','disputed'].includes(x.state)).length)+' active/review')
  );
  const layout=el('div',undefined,'role-dashboard-columns'),bank=el('section',undefined,'card role-dashboard-card'),park=el('section',undefined,'card role-dashboard-card');
  bank.append(el('h2','Bank & UPI Health'));for(const b of (banks.banks||[]).slice(0,5)){const r=el('article',undefined,'role-dashboard-row');r.append(el('strong',b.details?.upiId||b.details?.bankName||b.id),el('span',b.status+' · '+(b.verification?.status||'not verified')));bank.append(r);}if(!(banks.banks||[]).length)bank.append(el('p','No bank / UPI records.','hint'));
  park.append(el('h2','Payout & Parking'));park.append(el('p','Commission available: '+money(payout.available||'0'),'hint'),el('p','Eligible Parking orders: '+(parking.unavailable?'Unavailable':String((parking.orders||[]).length)),'hint'),el('p','APK / OTP data appears only from your verified source mappings.','hint'));
  layout.append(bank,park);container.replaceChildren(grid,layout);
 }
 async function render(args){if(args.account.accountType==='merchant')return merchant(args);if(args.account.accountType==='user')return user(args);throw new Error('error.FORBIDDEN');}
 root.WPayRoleDashboard={render,money};
})(globalThis);