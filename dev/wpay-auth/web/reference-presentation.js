"use strict";
(function(root){
 const role=document.querySelector('meta[name="wpay-entry-role"]').content,host=document.getElementById('page-content');
 let section,account;
 function bind(scope){
  for(const item of scope.querySelectorAll('[data-go]')){
   item.onclick=()=>root.WPayReferenceUi.select(item.dataset.go);
   if(item.tagName!=='BUTTON'){item.setAttribute('role','button');item.tabIndex=0;item.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();item.click();}};}
  }
  root.WPayReferenceIcons?.hydrate(scope);
 }
 function login(card,mode,locale){
  if(mode!=='login')return;
  if(role==='user'){const brand=document.querySelector('#sidebar .brand')?.cloneNode(true);if(brand){brand.style.padding='0 0 18px';for(const node of brand.querySelectorAll('[id]')){const prior=node.id;node.id='login-'+prior;for(const paint of brand.querySelectorAll('[fill],[stroke]'))for(const attr of ['fill','stroke'])if(paint.getAttribute(attr)==='url(#'+prior+')')paint.setAttribute(attr,'url(#'+node.id+')');}brand.querySelector('small').textContent='User workspace';card.prepend(brand);}}
  if(locale==='en'){const eyebrow=card.querySelector('.eyebrow'),heading=card.querySelector('h2');if(eyebrow)eyebrow.textContent='Welcome back';if(heading){heading.textContent=role==='merchant'?'Sign in to WPay Merchant':'Sign in to WPay';const help=document.createElement('p');help.textContent=role==='merchant'?'Use your Merchant password and authenticator MFA.':'Sign in to your account and continue your secure payment operations.';heading.after(help);}}
  const password=card.querySelector('input[type=password]');if(password){const wrap=document.createElement('div');wrap.className='password-wrap';password.before(wrap);wrap.append(password);const toggle=document.createElement('button');toggle.type='button';toggle.textContent='Show';toggle.setAttribute('aria-label','Show password');toggle.onclick=()=>{const show=password.type==='password';password.type=show?'text':'password';toggle.textContent=show?'Hide':'Show';toggle.setAttribute('aria-label',show?'Hide password':'Show password');};wrap.append(toggle);}
 }
 function begin(a,key){
  account=a;section=key;host.dataset.section=key;host.dataset.role=role;
  const metadata=root.WPayReferenceLayouts.pages[role][key];if(!metadata)return;
  const title=document.getElementById('page-title'),head=title.closest('.page-head');
  title.textContent=metadata.title;document.getElementById('account-type').textContent=metadata.eyebrow;
  let description=head.querySelector('.reference-description');if(!description){description=document.createElement('p');description.className='reference-description';title.after(description);}description.textContent=metadata.description;
  let refresh=head.querySelector('.reference-refresh');if(!refresh){refresh=document.createElement('button');refresh.type='button';refresh.className='btn ghost reference-refresh';refresh.textContent='Refresh';refresh.onclick=()=>root.WPayReferenceUi.select(root.WPayReferenceUi.section);head.append(refresh);}
 }
 function refresh(){
  if(!account||!host.children.length)return;
  const metadata=root.WPayReferenceLayouts.pages[role][section];if(metadata)document.getElementById('page-title').textContent=metadata.title;
  bind(host);
  if(host.querySelector('.reference-dashboard'))return;
  for(const card of host.querySelectorAll('.card:not(.table-card)'))card.classList.add('pad');
  for(const b of host.querySelectorAll('button')){b.classList.add('btn');if(b.type==='submit'||b.classList.contains('primary'))b.classList.add('primary');}
  for(const input of host.querySelectorAll('input,select,textarea'))input.classList.add('control');
  // Move live nodes rather than serializing HTML: event handlers and validation survive.
  for(const parent of host.querySelectorAll('div,section')){
   if(parent.closest('table,dialog')||parent.classList.contains('reference-dashboard'))continue;
   const rows=[...parent.children].filter(n=>n.matches('article.business-row,article.application-row'));
   if(!rows.length||rows.some(n=>n.querySelector('form,dialog')))continue;
   const records=rows.map(n=>({node:n,facts:n.querySelector(':scope > dl.facts')}));
   if(records.some(r=>!r.facts))continue;
   const keys=[...records[0].facts.querySelectorAll('dt')].map(n=>n.textContent);
   if(!keys.length||keys.length>9||records.some(r=>[...r.facts.querySelectorAll('dt')].map(n=>n.textContent).join('|')!==keys.join('|')))continue;
   const wrap=document.createElement('div');wrap.className='table-scroll reference-records';const table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');
   for(const key of [...keys,'Details / actions']){const th=document.createElement('th');th.textContent=key;tr.append(th);}thead.append(tr);table.append(thead);const body=document.createElement('tbody');
   for(const record of records){const row=document.createElement('tr');for(const value of record.facts.querySelectorAll('dd')){const cell=document.createElement('td');cell.append(...value.childNodes);row.append(cell);}record.facts.remove();const actions=document.createElement('td');actions.append(...record.node.childNodes);row.append(actions);body.append(row);}
   table.append(body);wrap.append(table);rows[0].before(wrap);rows.forEach(n=>n.remove());
  }
 }
 async function fees({post,action,el,container},offset=0){
  const result=await post('panel/fees',{offset,limit:25});container.replaceChildren();
  const current=result.rows[0],grid=el('div',undefined,'grid reference-metrics');
  if(offset===0&&current)for(const [label,value]of [['Pay-in fee',current.payinFee+'%'],['Payout fee',current.payoutFee+'%'],['Fixed payout fee',current.fixedFeeCurrency+' '+current.fixedPayoutFee],['Current version',String(current.version)]]){const card=el('div',undefined,'card metric');card.append(el('div',label,'metric-top'),el('div',value,'metric-value'));grid.append(card);}container.append(grid);
  const card=el('section',undefined,'card table-card'),heading=el('div',undefined,'table-head');heading.append(el('h2','Fee Version History'));card.append(heading);const scroll=el('div',undefined,'table-scroll'),table=el('table'),head=el('thead'),hr=el('tr');for(const label of ['Version','Pay-in','Payout','Fixed fee','Effective'])hr.append(el('th',label));head.append(hr);table.append(head);const body=el('tbody');for(const r of result.rows){const row=el('tr');for(const value of [r.version,r.payinFee+'%',r.payoutFee+'%',r.fixedFeeCurrency+' '+r.fixedPayoutFee,new Date(r.effectiveAt).toLocaleString()])row.append(el('td',String(value)));body.append(row);}table.append(body);scroll.append(table);card.append(scroll);if(!result.rows.length)card.append(el('p','No effective fee settings have been assigned.','notice'));
  for(const [label,next]of [['Previous',offset?Math.max(0,offset-25):null],['Next',result.nextOffset]])if(next!==null){const button=el('button',label,'btn');button.type='button';button.onclick=()=>action(()=>fees({post,action,el,container},next));card.append(button);}container.append(card);
 }
 root.WPayReferencePresentation={begin,refresh,bind,fees,login};
})(globalThis);
