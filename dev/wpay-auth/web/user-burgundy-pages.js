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
    const form=shell.querySelector(':scope > form');if(form){const grid=el('div',undefined,'deposit-shell'),request=el('section',undefined,'card pad deposit-request-card'),destination=el('section',undefined,'card pad deposit-active-card');request.append(el('h2','Create deposit order'),form);for(const node of [...shell.children])if(!node.matches('details'))destination.append(node);grid.append(request,destination);shell.prepend(grid);
     const amount=form.querySelector('[name=amount]'),preview=el('p',undefined,'deposit-amount-preview'),value=(node,index)=>node?.children[index]?.querySelector('strong')?.textContent;
     const update=()=>{const row=shell.querySelector('.deposit-history article'),latest=row?.depositSummary,matching=latest&&latest.network===value(facts,0)&&latest.address===value(facts,1)&&latest.rate===value(facts,2);preview.textContent=amount.value?amount.value+' USDT · entered amount':matching?'First listed order: '+latest.amount+' USDT · '+latest.state:'Enter an amount to create your order';};preview.updateDepositAmount=update;amount.addEventListener('input',update);update();destination.prepend(preview);
     const address=facts?.children[1]?.querySelector('strong')?.textContent;
     if(address&&root.WPayDepositQr){try{const canvas=el('canvas',undefined,'deposit-address-qr'),info=el('div',undefined,'deposit-destination-info'),visual=el('div',undefined,'deposit-qr-visual');root.WPayDepositQr.draw(canvas,address);canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Admin-assigned deposit address QR');info.append(...destination.childNodes);visual.append(canvas,el('p','Address-only QR. Check the network and enter the order amount in your wallet.','muted'));destination.append(info,visual);}catch{destination.append(el('p','QR unavailable. Copy the address above and check the network.','notice'));}}
    }
    const history=shell.querySelector('.deposit-history');if(history){history.open=true;const rules=shell.querySelector(':scope > details:not(.deposit-history)');if(rules)history.append(rules);}
   }
  }
  if(key==='usdt-deposit')for(const row of host.querySelectorAll('.deposit-history article.business-row')){
   if(row.dataset.compactDeposit)continue;const facts=row.querySelector(':scope > .facts');if(!facts||facts.children.length<12)continue;
   row.dataset.compactDeposit='true';const items=[...facts.children],more=el('details',undefined,'compact-disclosure deposit-order-details'),extra=el('div',undefined,'facts'),value=i=>items[i]?.querySelector('strong')?.textContent;row.depositSummary={network:value(4),address:value(6),rate:value(8),amount:value(7),state:value(3)};more.append(el('summary','Payment details / submit transfer reference'));
   for(const [i,item]of items.entries())if(![0,2,3,7].includes(i))extra.append(item);more.append(extra);for(const node of [...row.childNodes])if(node!==facts)more.append(node);row.append(more);
  }
  if(key==='usdt-deposit')host.querySelector('.deposit-amount-preview')?.updateDepositAmount?.();
  if(key==='payouts'&&shell&&!shell.dataset.payoutLayout){
   // Keep the original queue, filter, detail target and review nodes/listeners.
   const children=[...shell.children],headings=children.filter(n=>n.tagName==='H2');
   if(headings.length>=2){shell.dataset.payoutLayout='compact';shell.classList.add('user-payout-workspace');const orders=el('section',undefined,'payout-orders-section'),history=el('section',undefined,'payout-history-section'),help=el('details',undefined,'compact-disclosure');help.append(el('summary','Payout guidance'));let section=help;
    for(const node of children){if(node===headings[0])section=orders;if(node===headings[1])section=history;section.append(node);}
    const review=history.querySelector(':scope > section.card');if(review)review.classList.add('payout-review-section');shell.append(orders,history);if(review)shell.append(review);shell.append(help);
   }
  }
  if(key==='guide'&&!host.querySelector('.user-guide-layout'))renderGuide(host,el);
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
 function renderGuide(host,el){
  const topics=[
   ['overview','Dashboard','Review capacity, commission, payment totals and device health.','Read the summary cards.|Check route status.|Use Quick Actions for the next task.'],
   ['analytics','Analytics','Understand your real payment performance.','Review successful, failed and pending counts.|Compare collection and payout trends.|Open UPI Analytics for individual routes.'],
   ['bank-upi','Bank & UPI','Add or update your receiving routes.','Choose the correct route type.|Fill the required account and mobile details.|Submit for Admin approval.|Verify the approved version before starting routing.'],
   ['upi-analytics','UPI Analytics','Compare your eligible UPI routes.','Read each route’s status, volume and success rate.|Use permitted routing controls.|An Admin stop remains effective.'],
   ['upi-verification','UPI Verification','Verify an Admin-approved route before routing.','Check the linked APK status.|Generate the test QR when eligible.|Pay the exact amount and submit matching evidence.|Start routing only after verification succeeds.'],
   ['statements','Statements','Upload statement evidence for your bank version.','Choose the correct bank.|Upload a supported statement.|Review the parsed entries and the result shown.'],
   ['usdt-deposit','USDT Deposit','Create a USDT deposit order for collection capacity.','Enter the amount and create the order.|Check the assigned network, address and rate.|Send the order amount on that network.|Submit the transfer reference in history and track confirmation.'],
   ['commission','Commission','Review earned, available and held commission.','Check available commission separately from collection capacity.|Review entitlement and history.|Open Withdraw when needed.'],
   ['withdraw','Withdraw','Request a withdrawal from available commission.','Choose INR or USDT.|Fill the selected destination and amount.|Review fees, rate and net receive.|Submit and track the request in history.'],
   ['holds','Holds','Understand temporarily held funds.','Review the reference and reason.|Check held amount and release status.'],
   ['payins','Pay-in History','Find your collection records.','Use the available filters.|Check reference, UPI, amount, date and status.|Open available details when needed.'],
   ['payouts','Payout Orders','Claim eligible payout work and track reviews.','Choose an eligible bank if required.|Claim an available order.|Check its beneficiary and live payment deadline.|Submit payment evidence before the deadline.|Track the review and history.'],
   ['transactions','Completed Payments','Review completed financial activity.','Check the available payout and Parking records.|Use the page filters and details.'],
   ['parking-beneficiaries','Parking Beneficiaries','Manage beneficiaries offered for Parking work.','Review beneficiary details.|Confirm a beneficiary only after adding it through your bank.'],
   ['parking-orders','Parking Orders','Work with eligible Parking orders.','Check limits and available amount.|Lock an eligible amount.|Pay and submit evidence within the displayed deadline.|Track the result in history.'],
   ['agent','WPay Agent','Set up the official Android companion.','Download the latest available APK.|Install it on your own device.|Pair it with your account activation code.'],
   ['activation','Activation Codes','Generate and track device pairing codes.','Generate a code when eligible.|Enter it in WPay Agent.|Check Pending, Used, Expired or Revoked status.|Keep unused codes private.'],
   ['devices','Linked Devices','Check devices linked to your account.','Review mobile, version, network, battery and last seen.|Check reported location and device history.|Unlink only when you intend to disconnect the device.'],
   ['otp','OTP Events','View the existing masked event history.','Open the page and use its existing filters.|Review the available sender, device and masked event details.'],
   ['trade','Trade with WPay','This section is coming soon.','No trading action is currently available.'],
   ['notifications','Notifications','Review your account updates.','Read new notifications.|Use the available read controls.'],
   ['support','Support','Get help with your account.','Create a ticket describing the issue.|Open the conversation to read replies.|Do not include passwords or secret credentials.'],
   ['security','Security','Manage account access.','Enable login MFA if you want it.|Review sessions and revoke unknown sessions.|Use the password controls when needed.'],
   ['settings','Settings','Adjust available workspace preferences.','Review the options shown.|Save any changes.'],
   ['profile','Profile','Maintain your account profile.','Review account identity and status.|Edit the permitted fields.|Save your profile.']
  ];
  const layout=el('div',undefined,'user-guide-layout'),list=el('nav',undefined,'user-guide-topics'),detail=el('section',undefined,'card pad user-guide-detail');list.setAttribute('aria-label','User guide topics');layout.append(list,detail);
  const show=topic=>{detail.replaceChildren(el('div','Step-by-step guide','eyebrow'),el('h2',topic[1]),el('h3','What this option does'),el('p',topic[2]),el('h3','How to use it'));const steps=el('ol');for(const step of topic[3].split('|'))steps.append(el('li',step));detail.append(steps,el('h3','Important tips'),el('p','Follow the actual limits, eligibility and status shown on the page. A submitted request or reference alone does not confirm payment.'));const open=el('button','Open '+topic[1]);open.type='button';open.dataset.go=topic[0];open.onclick=()=>root.WPayReferenceUi?.select(topic[0]);detail.append(open);for(const button of list.children)button.setAttribute('aria-pressed',String(button.dataset.topic===topic[0]));};
  for(const topic of topics){const button=el('button',topic[1]);button.type='button';button.dataset.topic=topic[0];button.onclick=()=>show(topic);list.append(button);}host.append(layout);show(topics[2]);
 }
 root.WPayUserBurgundyPages={enhance};
})(globalThis);
