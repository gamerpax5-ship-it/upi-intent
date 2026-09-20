"use strict";
(function(root){
 const role=document.querySelector('meta[name="wpay-entry-role"]').content;
 const nav=root.WPayReferenceNavigation;
 let controller,groups=[],current=role==='user'?'overview':'dashboard';
 const buttons=[...document.querySelectorAll('.sidebar .nav-item[data-page]')];
 function closeSidebar(){document.getElementById('menuBtn')?.setAttribute('aria-expanded','false');document.getElementById('sidebar')?.classList.remove('open');document.getElementById('overlay')?.classList.remove('show');}
 function select(key){
  if(!controller)return;
  if(!nav.resolve(role,key,groups)){document.getElementById('message').textContent='This section is unavailable for your current account permissions or funding status.';return;}
  if(controller.navigate)controller.navigate('ui:'+key);else controller.action(()=>controller.load('ui:'+key));closeSidebar();
 }
 buttons.forEach(b=>{b.onclick=()=>select(b.dataset.page);});
 document.querySelectorAll('[data-go]').forEach(b=>{b.onclick=()=>select(b.dataset.go);});
 const menu=document.getElementById('menuBtn')||document.getElementById('mobileMenu');
 if(menu)menu.onclick=()=>{const open=document.getElementById('sidebar')?.classList.toggle('open');document.getElementById('overlay')?.classList.toggle('show',!!open);menu.setAttribute('aria-expanded',String(!!open));};
 const overlay=document.getElementById('overlay');if(overlay)overlay.onclick=closeSidebar;
 const search=document.getElementById('globalSearch');
 if(search)search.onkeydown=e=>{if(e.key!=='Enter')return;const q=search.value.trim().toLowerCase();if(!q)return;const match=buttons.find(b=>!b.disabled&&b.textContent.toLowerCase().includes(q));if(match)select(match.dataset.page);else document.getElementById('message').textContent='No matching available section. Use the filters inside Orders or Transactions to search records.';};
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebar();});
 root.addEventListener('hashchange',()=>{const key=location.hash.slice(1);if(key!==current&&nav.routes[role]?.[key])select(key);});
 root.WPayReferenceUi={
  connect(c){controller=c;},
  restoreAvailability(){buttons.forEach(b=>{b.disabled=!nav.resolve(role,b.dataset.page,groups);});},
  settings(){const host=document.getElementById('page-content');document.getElementById('page-title').textContent='Settings';const card=document.createElement('section');card.className='card';const label=document.createElement('label');label.textContent='Appearance';const select=document.createElement('select');for(const value of ['dark','light']){const option=document.createElement('option');option.value=value;option.textContent=value==='dark'?'Dark':'Light';select.append(option);}select.value=document.documentElement.classList.contains('light')?'light':'dark';select.onchange=()=>{document.documentElement.classList.toggle('light',select.value==='light');try{localStorage.setItem('wpay-role-theme',select.value);}catch{/* Appearance still works without persistence. */}};label.append(select);card.append(label);host.replaceChildren(card);},
  select,
  get section(){return current;},
  sync(account,navigation,selected){
   groups=navigation.groups||[];
   const requirements=navigation.requirements,blocked=buttons.some(b=>!nav.resolve(role,b.dataset.page,groups));
   const headline=requirements?document.getElementById('page-title')?.closest('.page-head'):null;
   if(headline&&requirements){let notice=document.getElementById('account-requirements');if(!notice){notice=document.createElement('div');notice.id='account-requirements';notice.className='notice account-requirements';headline.after(notice);}const missing=[];
    if(requirements.approvalStatus!=='approved')missing.push('account approval');
    if(role==='user')for(const [key,label]of [['initialDepositSatisfied','initial deposit'],['approvedBankAccountAvailable','approved bank account'],['statementSatisfied','accepted statement'],['upiApproved','UPI approval'],['upiVerified','UPI verification'],['operationsEnabled','operations enabled by Admin']])if(!requirements[key])missing.push(label);
    notice.hidden=!blocked;notice.textContent=missing.length?'Some sections are locked until setup is complete: '+missing.join(', ')+'. Start with Bank & UPI and USDT Deposit.':'Some sections are unavailable under your current account permissions. Contact Support for access.';
   }
   for(const b of buttons){const available=!!nav.resolve(role,b.dataset.page,groups);b.disabled=!available;b.setAttribute('aria-disabled',String(!available));b.title=available?'':'Requires account permission or funding';}
   document.querySelectorAll('[data-account-name]').forEach(n=>{n.textContent=account.name;});
   document.querySelectorAll('[data-account-status]').forEach(n=>{n.textContent=account.approvalStatus||account.status;});
   let key=selected==='security'?'security':selected?.startsWith('ui:')?selected.slice(3):null;
   if(!selected){key=location.hash.slice(1)|| (role==='user'?'overview':'dashboard');if(!nav.resolve(role,key,groups))key=nav.resolve(role,'profile',groups)?'profile':Object.keys(nav.routes[role]).find(k=>nav.resolve(role,k,groups));}
   if(!key)key=Object.keys(nav.routes[role]).find(k=>nav.resolve(role,k,groups)?.destinationId===selected)||'profile';
   const page=nav.resolve(role,key,groups);if(!page)throw new Error('error.FORBIDDEN');
   current=key;buttons.forEach(b=>{const active=b.dataset.page===key;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
   if(location.hash.slice(1)!==key)history.replaceState(null,'','#'+key);
   document.getElementById('page-content').replaceChildren();
   return page.destinationId;
  },
  lock(){groups=[];closeSidebar();document.querySelectorAll('[data-account-name],[data-account-status]').forEach(n=>{n.textContent='';});buttons.forEach(b=>{b.disabled=true;b.setAttribute('aria-disabled','true');});document.querySelectorAll('[data-secret]').forEach(n=>{if('value'in n)n.value='';n.textContent='';});document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
 };
})(globalThis);
