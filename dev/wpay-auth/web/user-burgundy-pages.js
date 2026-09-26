'use strict';
(function(root){
 function enhance(host,metadata,account,key){
  // OTP rendering and content remain owned by the existing, unchanged module.
  if(!metadata||key==='otp'||host.querySelector('.reference-dashboard'))return;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  if(!host.querySelector('.page-hero')){const hero=el('div',undefined,'page-hero'),copy=el('div'),stat=el('div',undefined,'hero-stat');copy.append(el('div',metadata.eyebrow||'User workspace','eyebrow'),el('h1',metadata.title),el('p',metadata.description));stat.append(el('small','Workspace'),el('strong',account.name||'WPay User'));hero.append(copy,stat);host.prepend(hero);}
  for(const dl of host.querySelectorAll('dl.facts')){const facts=el('div',undefined,'facts');for(const term of [...dl.children])if(term.tagName==='DT'){const value=term.nextElementSibling;if(value?.tagName!=='DD')continue;const item=el('div',undefined,'fact'),label=el('label',term.textContent),strong=el('strong');strong.append(...value.childNodes);item.append(label,strong);facts.append(item);}dl.replaceWith(facts);}
  for(const article of host.querySelectorAll('article.business-row,article.application-row'))article.classList.add('card','pad','workflow-card');
  for(const form of host.querySelectorAll('form')){if(form.querySelector('.form-row'))continue;form.classList.add('workflow-form');for(const label of form.querySelectorAll(':scope > label'))label.classList.add('field');}
  for(const b of host.querySelectorAll('button')){b.classList.add('btn');if(b.type==='submit'||b.classList.contains('primary'))b.classList.add('burg');else b.classList.add('ghost');}
  for(const table of host.querySelectorAll('table'))if(!table.parentElement.matches('.table-wrap,.table-scroll')){const wrap=el('div',undefined,'table-wrap');table.before(wrap);wrap.append(table);}
  for(const h of host.querySelectorAll('.business-card > h2'))h.classList.add('workflow-heading');
 }
 root.WPayUserBurgundyPages={enhance};
})(globalThis);
