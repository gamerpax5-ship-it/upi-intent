"use strict";
(function(root){
 const pages={'user.deposits.view':true,'user.deposits.submit':true,'deposits.view':true};
 const decimal=(value,scale)=>{const n=BigInt(value),s=(n<0n?-n:n).toString().padStart(scale+1,'0');return (n<0n?'-':'')+s.slice(0,-scale)+'.'+s.slice(-scale);};
 async function render(ctx){const {account,locale,request,post,action,el,container,title}=ctx,t=k=>root.WPayFundingLocales.translate(locale,k),user=account.accountType==='user';
  title.textContent=t(user?'title':'reviewTitle');container.replaceChildren();const card=el('section',undefined,'card business-card');container.append(card);
  const button=(key,fn)=>{const b=el('button',t(key));b.type='button';b.onclick=()=>action(fn);return b;};
  function field(form,key,value='',type='text'){const l=el('label',t(key)),i=el('input');i.name=key;i.type=type;i.required=true;if(type==='checkbox')i.checked=false;else i.value=value;l.append(i);form.append(l);return i;}
  function facts(node,rows){const dl=el('dl',undefined,'facts');for(const [key,value]of rows)dl.append(el('dt',t(key)),el('dd',String(value)));node.append(dl);}
  const capacity=(node,c)=>facts(node,[['capacity',decimal(c.available,2)],['signed',decimal(c.signedAvailable,2)],['deficit',decimal(c.deficit,2)]]);
  if(!user)card.append(el('p',t('policy'),'notice'),el('p',t('warning')));
  if(user){const config=await request('funding/config');card.classList.add('deposit-focused');
   if(!config.providerConfigured)card.append(el('p',t('missing'),'notice'));
   if(config.settings){const s=config.settings.settings;card.append(el('h2','Admin-assigned USDT destination'));facts(card,[['network',s.depositNetwork],['address',s.depositAddress],['rate',s.inrPerUsdt]]);const copyStatus=el('p');copyStatus.setAttribute('role','status');card.append(button('copy',async()=>{await navigator.clipboard.writeText(s.depositAddress);copyStatus.textContent=t('copied');}),copyStatus);
    if(config.canSubmit){const form=el('form'),amount=field(form,'amount'),confirm=field(form,'confirmRequest','','checkbox');amount.inputMode='decimal';amount.pattern='(0|[1-9][0-9]*)(\\.[0-9]{1,6})?';let key=crypto.randomUUID(),previous='';const submit=el('button',t('create'));submit.type='submit';form.append(submit);form.onsubmit=e=>{e.preventDefault();action(async()=>{if(!confirm.checked)return;if(previous&&previous!==amount.value)key=crypto.randomUUID();previous=amount.value;await post('funding/create',{idempotencyKey:key,amountUsdt:amount.value});await render(ctx);const history=container.querySelector('.deposit-history');if(history){history.open=true;history.scrollIntoView({block:'nearest'});}});};card.append(form);}
   }else card.append(el('p','Admin has not assigned a USDT receiving address. Contact Admin before depositing.','notice'));
   const help=el('details',undefined,'compact-disclosure');help.append(el('summary','Deposit rules & collateral details'),el('p',t('policy')),el('p',t('warning')),el('p',t('capacityExplanation')));capacity(help,config.capacity);card.append(help);
  }
  const historyHost=user?el('details',undefined,'compact-disclosure deposit-history'):card;if(user){historyHost.append(el('summary',t('history')+' / submit transfer reference'));card.append(historyHost);}else card.append(el('h2',t('history')));const filter=el('select');filter.setAttribute('aria-label',t('status'));for(const key of ['all','requested','detected','confirming','review','confirmed','rejected','reversed']){const o=el('option',t(key));o.value=key==='all'?'':key;filter.append(o);}historyHost.append(filter);let offset=0;const list=el('div');historyHost.append(button('filter',async()=>{offset=0;await draw();}),list);
  async function draw(){const data=await post('funding/list',{state:filter.value,offset});list.replaceChildren();if(!data.requests.length)list.append(el('p',t('empty')));
   for(const r of data.requests){const s=r.snapshot,item=el('article',undefined,'business-row');facts(item,[['id',r.id],['owner',r.name],['created',new Date(r.created_at).toLocaleString(locale)],['status',t(r.state)],['network',s.network],['token',s.token],['address',s.address],['amount',decimal(s.amountMinor,6)],['rate',s.rate],['version',s.commercialVersion],['source',t(r.source||'none')],['credit',r.credit_minor?decimal(r.credit_minor,2):'0.00']]);const accounting=(r.events||[]).find(e=>e.kind==='confirmed'&&e.provenance?.setupFeeMinor!==undefined)?.provenance;if(accounting)facts(item,[['setupFee',decimal(accounting.setupFeeMinor,6)],['netUsdt',decimal(accounting.netUsdtMinor,6)]]);if(r.reason)item.append(el('p',r.reason,'notice'));capacity(item,r.capacity);item.append(el('p',t(r.providerConfigured?'configured':'missing'),'notice'));
    if(user&&!['confirmed','reversed','rejected'].includes(r.state)){const form=el('form'),hash=field(form,'hash'),index=field(form,'index','0','number');index.min='0';index.max='100000';index.step='1';const submit=el('button',t('claim'));submit.type='submit';form.append(submit);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post('funding/claim',{requestId:r.id,txHash:hash.value,eventIndex:Number(index.value)});await draw();});};item.append(form);}
    if(user||data.actions.includes('review'))item.append(button('recheck',async()=>{await post('funding/recheck',{requestId:r.id});await draw();}));
    if(!user&&!['confirmed','reversed'].includes(r.state)&&(data.actions.includes('approve')||data.actions.includes('reject'))){
     const manual=el('form'),reason=field(manual,'reason');reason.maxLength=300;
     const decide=command=>async()=>{if(!reason.reportValidity())return;await post('funding/review',{requestId:r.id,action:command,reason:reason.value});await draw();};
     manual.append(el('p','Manual review: independently check the received funds. This records a human decision, not blockchain confirmation.','notice'));
     if(data.actions.includes('approve')){const approve=button('confirm',decide('manual_confirm'));approve.textContent='Approve after manual check';manual.append(approve);}
     if(data.actions.includes('reject'))manual.append(button('reject',decide('manual_reject')));item.append(manual);
    }
    if(!user&&(data.actions.includes('approve')||data.actions.includes('reject'))){const form=el('form'),reason=field(form,'reason'),evidence=field(form,'evidence'),attribution=field(form,'attribution'),hash=field(form,'hash',r.claims[0]?.tx_hash||''),index=field(form,'index',String(r.claims[0]?.event_index||0),'number'),final=field(form,'final','','checkbox');reason.maxLength=300;evidence.maxLength=attribution.maxLength=100;index.min='0';index.max='100000';index.step='1';
     const send=command=>async()=>{if(!reason.reportValidity()||!evidence.reportValidity())return;if(['confirm','restore'].includes(command)&&!form.reportValidity())return;await post('funding/review',{requestId:r.id,action:command,reason:reason.value,evidenceReference:evidence.value,attributionReference:attribution.value,network:s.network,token:s.token,address:s.address,amountUsdt:decimal(s.amountMinor,6),txHash:hash.value,eventIndex:Number(index.value),reviewedFinal:final.checked});await draw();};
     if(data.actions.includes('approve'))form.append(button(r.state==='confirmed'?'reverse':r.state==='reversed'?'restore':'confirm',send(r.state==='confirmed'?'reverse':r.state==='reversed'?'restore':'confirm')));if(data.actions.includes('reject')&&!['confirmed','reversed'].includes(r.state))form.append(button('reject',send('reject')));item.append(form);
    }
    const audit=el('details');audit.append(el('summary',t('audit')));for(const e of r.events){const entry=el('div');entry.append(el('p',new Date(e.created_at).toLocaleString(locale)+' · '+e.kind+' · '+e.reason),el('pre',JSON.stringify(e.provenance,null,2)));audit.append(entry);}item.append(audit);list.append(item);
   }
   if(offset)list.append(button('previous',async()=>{offset=Math.max(0,offset-25);await draw();}));if(data.nextOffset!==null)list.append(button('next',async()=>{offset=data.nextOffset;await draw();}));
  }await draw();return true;
 }
 root.WPayFundingPage={pages,render};
})(globalThis);
