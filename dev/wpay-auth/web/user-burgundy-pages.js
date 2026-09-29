'use strict';
(function(root){
 function enhance(host,metadata,account,key){
  // OTP rendering and content remain owned by the existing, unchanged module.
  if(!metadata||key==='otp'||host.querySelector('.reference-dashboard'))return;
  for(const card of host.querySelectorAll('.card:not(.table-card)'))card.classList.add('pad');
  for(const input of host.querySelectorAll('input,select,textarea'))input.classList.add('control');
  if(key==='withdraw'&&!host.querySelector('.withdraw-history')){
   const card=host.querySelector('.business-card'),panel=card?.querySelector('.withdraw-method-panel:last-of-type');
   if(panel){const history=document.createElement('details'),summary=document.createElement('summary');history.className='compact-disclosure withdraw-history';summary.textContent='Withdrawal history';history.append(summary);let node=panel.nextSibling;while(node){const next=node.nextSibling;history.append(node);node=next;}card.append(history);}
  }
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  if(!host.querySelector('.page-hero')){const hero=el('div',undefined,'page-hero'),copy=el('div'),stat=el('div',undefined,'hero-stat');copy.append(el('div',metadata.eyebrow||'User workspace','eyebrow'),el('h1',metadata.title),el('p',metadata.description));stat.append(el('small','Workspace'),el('strong',account.name||'WPay User'));hero.append(copy,stat);host.prepend(hero);}
  for(const dl of host.querySelectorAll('dl.facts')){
   // Both DT/DD siblings and grouped DIV > DT/DD are valid definition lists.
   // Leave unfamiliar markup intact instead of silently deleting its content.
   const children=[...dl.children],terms=children.flatMap(n=>n.tagName==='DIV'?[...n.children]:[n]);
   if(!terms.length||terms.length%2||terms.some((n,i)=>n.tagName!==(i%2?'DD':'DT')))continue;
   const facts=el('div',undefined,'facts');
   for(let i=0;i<terms.length;i+=2){const item=el('div',undefined,'fact'),label=el('label',terms[i].textContent),strong=el('strong');strong.append(...terms[i+1].childNodes);item.append(label,strong);facts.append(item);}
   dl.replaceWith(facts);
  }
  // Reparent live nodes so listeners, validation and ownership gates stay intact.
  const shell=host.querySelector('.business-card');
  if(shell&&!shell.dataset.referenceLayout&&['commission','withdraw','usdt-deposit'].includes(key)){
   shell.dataset.referenceLayout=key;shell.classList.remove('card','pad');shell.classList.add('reference-workflow-shell');
   const facts=shell.querySelector(':scope > .facts');
   if(['withdraw','usdt-deposit'].includes(key)&&facts){const rate=facts.children[2]?.querySelector('strong')?.textContent,stat=host.querySelector('.hero-stat');if(rate&&stat)stat.replaceChildren(el('small','Admin-set USDT rate'),el('strong','₹'+rate+' / USDT'));}
   if(key==='commission'&&facts){
    const items=[...facts.children],metrics=el('div',undefined,'metric-grid'),more=el('details',undefined,'compact-disclosure');more.append(el('summary','Balance & entitlement details'));const extra=el('div',undefined,'facts');
    for(const i of [0,1,4,6])if(items[i]){const item=items[i];item.className='metric';const label=item.querySelector('label');label.replaceWith(el('small',label.textContent));metrics.append(item);}
    for(const item of items)if(!metrics.contains(item))extra.append(item);more.append(extra);facts.replaceWith(metrics);metrics.after(more);
    const available=items[7]?.querySelector('strong')?.textContent,stat=host.querySelector('.hero-stat');if(available&&stat)stat.replaceChildren(el('small','Available INR'),el('strong',available));
   }
   if(key==='withdraw'){
    const chooser=shell.querySelector('.withdraw-method-picker'),select=chooser?.querySelector('select'),panels=[...shell.querySelectorAll('.withdraw-method-panel')];
    if(select&&panels.length){const tabs=el('div',undefined,'tabs'),grid=el('div',undefined,'grid equal'),formCard=el('section',undefined,'card pad'),balance=el('section',undefined,'card pad');balance.append(el('h2','Available balance'));if(facts)balance.append(facts);const notice=shell.querySelector(':scope > .notice');if(notice)balance.append(notice);
     for(const [value,label] of [['INR','INR Withdrawal'],['USDT','USDT Withdrawal']]){const b=el('button',label);b.type='button';b.classList.toggle('active',select.value===value);b.setAttribute('aria-pressed',String(select.value===value));b.onclick=()=>{select.value=value;select.onchange();for(const button of tabs.children){button.classList.toggle('active',button===b);button.setAttribute('aria-pressed',String(button===b));}};tabs.append(b);}chooser.hidden=true;chooser.before(tabs,grid);formCard.append(...panels);grid.append(formCard,balance);
    }
   }
   if(key==='usdt-deposit'){
    const form=shell.querySelector(':scope > form');if(form){const grid=el('div',undefined,'deposit-shell'),request=el('section',undefined,'card pad deposit-request-card'),destination=el('section',undefined,'card pad deposit-active-card');request.append(el('h2','New deposit request'),form);for(const node of [...shell.children])if(!node.matches('details'))destination.append(node);grid.append(request,destination);shell.prepend(grid);}
   }
  }
  if(key==='activation'){
   const workspace=host.querySelector('.device-workspace');
   if(workspace&&!workspace.dataset.referenceLayout){
    const generate=[...workspace.querySelectorAll(':scope > button')].find(b=>b.textContent==='Generate activation code'),heading=[...workspace.querySelectorAll(':scope > h2')].find(h=>h.textContent==='Activate WPay Agent');
    if(generate&&heading){generate.classList.add('burg');generate.classList.remove('ghost');const feedback=generate.nextElementSibling,result=feedback?.nextElementSibling;if(result){
     workspace.dataset.referenceLayout='activation';workspace.classList.remove('card','pad');workspace.classList.add('reference-workflow-shell');
     const help=el('details',undefined,'compact-disclosure'),grid=el('div',undefined,'grid equal'),create=el('section',undefined,'card pad'),current=el('section',undefined,'card pad');help.append(el('summary','Pairing guidance & device shortcuts'));let node=workspace.firstChild;while(node&&node!==heading){const next=node.nextSibling;help.append(node);node=next;}
     const description=heading.nextElementSibling;create.append(heading,description,generate,feedback);current.append(el('h2','Current activation'),el('p','New codes appear here. Keep the code private until pairing completes.','muted'),result);grid.append(create,current);workspace.prepend(grid);workspace.append(help);
    }}
   }
  }
  for(const article of host.querySelectorAll('article.business-row,article.application-row'))article.classList.add('card','pad','workflow-card');
  for(const form of host.querySelectorAll('form')){if(form.querySelector('.form-row'))continue;form.classList.add('workflow-form');for(const label of form.querySelectorAll(':scope > label'))label.classList.add('field');}
  for(const b of host.querySelectorAll('button')){if(b.parentElement?.classList.contains('tabs')){b.classList.remove('btn','ghost','burg','primary');continue;}b.classList.add('btn');if(b.type==='submit'||b.classList.contains('primary')){b.classList.add('burg');b.classList.remove('ghost');}else if(!b.matches('.burg,.gold,.danger,.ghost'))b.classList.add('ghost');}
  for(const table of host.querySelectorAll('table'))if(!table.parentElement.matches('.table-wrap,.table-scroll')){const wrap=el('div',undefined,'table-wrap');table.before(wrap);wrap.append(table);}
  for(const h of host.querySelectorAll('.business-card > h2'))h.classList.add('workflow-heading');
 }
 root.WPayUserBurgundyPages={enhance};
})(globalThis);
