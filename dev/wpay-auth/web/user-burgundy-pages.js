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
 const GUIDE_LANGUAGES=[
  ['en','English'],['hi','हिन्दी'],['bn','বাংলা'],['gu','ગુજરાતી'],['ta','தமிழ்'],
  ['nag','Nagamese'],['ur','اردو'],['pa','ਪੰਜਾਬੀ'],['or','ଓଡ଼ିଆ'],['te','తెలుగు']
 ];
 const GUIDE_COPY={
  en:{
   labels:['User Guide','Choose language','Step-by-step guide','What this option does','How to use it','Important tips','Open'],
   tip:'Follow the actual limits, eligibility and status shown on the page. A submitted request or reference alone does not confirm payment.',
   topics:[
    ['overview','Dashboard','Review capacity, commission, payment totals and device health.',['Read the summary cards.','Check route status.','Use Quick Actions for the next task.']],
    ['analytics','Analytics','Understand your real payment performance.',['Review successful, failed and pending counts.','Compare collection and payout trends.','Open UPI Analytics for individual routes.']],
    ['bank-upi','Bank & UPI','Add or update your receiving routes.',['Choose the correct route type.','Fill the required account and mobile details.','Submit for Admin approval.','Verify the approved version before starting routing.']],
    ['upi-analytics','UPI Analytics','Compare your eligible UPI routes.',['Read each route’s status, volume and success rate.','Use permitted routing controls.','An Admin stop remains effective.']],
    ['upi-verification','UPI Verification','Verify an Admin-approved route before routing.',['Check the linked APK status.','Generate the test QR when eligible.','Pay the exact amount and submit matching evidence.','Start routing only after verification succeeds.']],
    ['statements','Statements','Upload statement evidence for your bank version.',['Choose the correct bank.','Upload a supported statement.','Review the parsed entries and the result shown.']],
    ['usdt-deposit','USDT Deposit','Create a USDT deposit order for collection capacity.',['Enter the amount and create the order.','Check the assigned network, address and rate.','Send the order amount on that network.','Submit the transfer reference in history and track confirmation.']],
    ['commission','Commission','Review earned, available and held commission.',['Check available commission separately from collection capacity.','Review entitlement and history.','Open Withdraw when needed.']],
    ['withdraw','Withdraw','Request a withdrawal from available commission.',['Choose INR or USDT.','Fill the selected destination and amount.','Review fees, rate and net receive.','Submit and track the request in history.']],
    ['holds','Holds','Understand temporarily held funds.',['Review the reference and reason.','Check held amount and release status.']],
    ['payins','Pay-in History','Find your collection records.',['Use the available filters.','Check reference, UPI, amount, date and status.','Open available details when needed.']],
    ['payouts','Payout Orders','Claim eligible payout work and track reviews.',['Choose an eligible bank if required.','Claim an available order.','Check beneficiary and live payment deadline.','Submit payment evidence before the deadline.','Track review and history.']],
    ['transactions','Completed Payments','Review completed financial activity.',['Check available payout and Parking records.','Use the page filters and details.']],
    ['parking-beneficiaries','Parking Beneficiaries','Manage beneficiaries offered for Parking work.',['Review beneficiary details.','Confirm a beneficiary only after adding it through your bank.']],
    ['parking-orders','Parking Orders','Work with eligible Parking orders.',['Check limits and available amount.','Lock an eligible amount.','Pay and submit evidence within the displayed deadline.','Track the result in history.']],
    ['agent','WPay Agent','Set up the official Android companion.',['Download the latest available APK.','Install it on your own device.','Pair it with your account activation code.']],
    ['activation','Activation Codes','Generate and track device pairing codes.',['Generate a code when eligible.','Enter it in WPay Agent.','Check Pending, Used, Expired or Revoked status.','Keep unused codes private.']],
    ['devices','Linked Devices','Check devices linked to your account.',['Review mobile, version, network, battery and last seen.','Check reported location and device history.','Unlink only when you intend to disconnect the device.']],
    ['otp','OTP Events','View the existing masked event history.',['Open the page and use its existing filters.','Review sender, device and masked event details.']],
    ['trade','Trade with WPay','This section is coming soon.',['No trading action is currently available.']],
    ['notifications','Notifications','Review your account updates.',['Read new notifications.','Use the available read controls.']],
    ['support','Support','Get help with your account.',['Create a ticket describing the issue.','Open the conversation to read replies.','Do not include passwords or secret credentials.']],
    ['security','Security','Manage account access.',['Enable login MFA if you want it.','Review sessions and revoke unknown sessions.','Use the password controls when needed.']],
    ['settings','Settings','Adjust available workspace preferences.',['Review the options shown.','Save any changes.']],
    ['profile','Profile','Maintain your account profile.',['Review account identity and status.','Edit the permitted fields.','Save your profile.']]
   ]
  },
  hi:{
   labels:['यूज़र गाइड','भाषा चुनें','चरण-दर-चरण गाइड','यह विकल्प क्या करता है','इसे कैसे उपयोग करें','महत्वपूर्ण सुझाव','खोलें'],
   tip:'पेज पर दिख रही वास्तविक सीमा, पात्रता और स्थिति का ही पालन करें। केवल अनुरोध या रेफरेंस जमा होने से भुगतान की पुष्टि नहीं होती।',
   topics:[
    ['overview','डैशबोर्ड','क्षमता, कमीशन, भुगतान योग और डिवाइस की स्थिति देखें।',['सारांश कार्ड देखें।','रूट की स्थिति जांचें।','अगले काम के लिए Quick Actions उपयोग करें।']],
    ['analytics','एनालिटिक्स','अपने वास्तविक भुगतान प्रदर्शन को समझें।',['सफल, विफल और लंबित संख्या देखें।','कलेक्शन और पेआउट ट्रेंड तुलना करें।','अलग-अलग रूट के लिए UPI Analytics खोलें।']],
    ['bank-upi','बैंक और UPI','रिसीविंग रूट जोड़ें या अपडेट करें।',['सही रूट प्रकार चुनें।','जरूरी खाता और मोबाइल विवरण भरें।','Admin approval के लिए भेजें।','रूटिंग शुरू करने से पहले approved version verify करें।']],
    ['upi-analytics','UPI एनालिटिक्स','अपने पात्र UPI रूट की तुलना करें।',['हर रूट की स्थिति, वॉल्यूम और success rate देखें।','अनुमत routing controls उपयोग करें।','Admin का stop लागू रहेगा।']],
    ['upi-verification','UPI वेरिफिकेशन','रूटिंग से पहले Admin-approved रूट verify करें।',['Linked APK status देखें।','पात्र होने पर test QR बनाएं।','ठीक राशि का भुगतान करके matching evidence दें।','Verification सफल होने के बाद ही routing शुरू करें।']],
    ['statements','स्टेटमेंट','अपने bank version के लिए statement evidence अपलोड करें।',['सही बैंक चुनें।','Supported statement अपलोड करें।','Parsed entries और result देखें।']],
    ['usdt-deposit','USDT डिपॉज़िट','Collection capacity के लिए USDT deposit order बनाएं।',['राशि डालकर order बनाएं।','दिया गया network, address और rate देखें।','उसी network पर order amount भेजें।','History में transfer reference जमा करके confirmation track करें।']],
    ['commission','कमीशन','कमाया, उपलब्ध और hold कमीशन देखें।',['Available commission को collection capacity से अलग देखें।','Entitlement और history देखें।','जरूरत पर Withdraw खोलें।']],
    ['withdraw','विदड्रॉ','Available commission से withdrawal request करें।',['INR या USDT चुनें।','Destination और amount भरें।','Fees, rate और net receive देखें।','Request submit करके history में track करें।']],
    ['holds','होल्ड','अस्थायी रूप से रोकी गई राशि समझें।',['Reference और reason देखें।','Held amount और release status देखें।']],
    ['payins','पे-इन हिस्ट्री','अपने collection records खोजें।',['उपलब्ध filters उपयोग करें।','Reference, UPI, amount, date और status देखें।','जरूरत पर details खोलें।']],
    ['payouts','पेआउट ऑर्डर','पात्र payout work claim करें और review track करें।',['जरूरत हो तो eligible bank चुनें।','Available order claim करें।','Beneficiary और live deadline देखें।','Deadline से पहले payment evidence दें।','Review और history track करें।']],
    ['transactions','पूर्ण भुगतान','पूरी हुई financial activity देखें।',['Available payout और Parking records देखें।','Page filters और details उपयोग करें।']],
    ['parking-beneficiaries','पार्किंग बेनिफिशियरी','Parking work के beneficiaries manage करें।',['Beneficiary details देखें।','Bank में जोड़ने के बाद ही beneficiary confirm करें।']],
    ['parking-orders','पार्किंग ऑर्डर','Eligible Parking orders पर काम करें।',['Limits और available amount देखें।','Eligible amount lock करें।','दिखाई गई deadline में भुगतान और evidence submit करें।','History में result track करें।']],
    ['agent','WPay एजेंट','Official Android companion setup करें।',['Latest APK डाउनलोड करें।','अपने device में install करें।','Account activation code से pair करें।']],
    ['activation','एक्टिवेशन कोड','Device pairing codes बनाएं और track करें।',['Eligible होने पर code बनाएं।','WPay Agent में दर्ज करें।','Pending, Used, Expired या Revoked status देखें।','Unused codes private रखें।']],
    ['devices','लिंक्ड डिवाइस','अपने account से linked devices देखें।',['Mobile, version, network, battery और last seen देखें।','Reported location और device history देखें।','Device disconnect करना हो तभी unlink करें।']],
    ['otp','OTP इवेंट्स','Masked event history देखें।',['Page खोलकर filters उपयोग करें।','Sender, device और masked event details देखें।']],
    ['trade','WPay के साथ ट्रेड','यह section जल्द आ रहा है।',['अभी trading action उपलब्ध नहीं है।']],
    ['notifications','नोटिफिकेशन','Account updates देखें।',['नए notifications पढ़ें।','Available read controls उपयोग करें।']],
    ['support','सपोर्ट','Account से जुड़ी मदद लें।',['Issue बताते हुए ticket बनाएं।','Replies पढ़ने के लिए conversation खोलें।','Password या secret credentials न दें।']],
    ['security','सिक्योरिटी','Account access manage करें।',['चाहें तो login MFA enable करें।','Sessions देखें और unknown sessions revoke करें।','जरूरत पर password controls उपयोग करें।']],
    ['settings','सेटिंग्स','उपलब्ध workspace preferences बदलें।',['दिख रहे options देखें।','Changes save करें।']],
    ['profile','प्रोफाइल','अपना account profile संभालें।',['Account identity और status देखें।','Allowed fields edit करें।','Profile save करें।']]
   ]
  },
  bn:{
   labels:['ইউজার গাইড','ভাষা নির্বাচন করুন','ধাপে ধাপে নির্দেশিকা','এই অপশন কী করে','কীভাবে ব্যবহার করবেন','গুরুত্বপূর্ণ পরামর্শ','খুলুন'],
   tip:'পেজে দেখানো প্রকৃত সীমা, যোগ্যতা ও স্ট্যাটাস অনুসরণ করুন। শুধু রিকোয়েস্ট বা রেফারেন্স জমা দিলেই পেমেন্ট নিশ্চিত হয় না।',
   topics:[
    ['overview','ড্যাশবোর্ড','ক্যাপাসিটি, কমিশন, পেমেন্ট মোট এবং ডিভাইসের অবস্থা দেখুন।',['সারাংশ কার্ড দেখুন।','রুট স্ট্যাটাস পরীক্ষা করুন।','পরবর্তী কাজের জন্য Quick Actions ব্যবহার করুন।']],
    ['analytics','অ্যানালিটিক্স','আপনার বাস্তব পেমেন্ট পারফরম্যান্স বুঝুন।',['সফল, ব্যর্থ ও পেন্ডিং সংখ্যা দেখুন।','কালেকশন ও পেআউট ট্রেন্ড তুলনা করুন।','আলাদা রুটের জন্য UPI Analytics খুলুন।']],
    ['bank-upi','ব্যাংক ও UPI','রিসিভিং রুট যোগ বা আপডেট করুন।',['সঠিক রুট টাইপ বাছুন।','প্রয়োজনীয় অ্যাকাউন্ট ও মোবাইল তথ্য দিন।','Admin approval-এর জন্য জমা দিন।','রাউটিং শুরুর আগে approved version verify করুন।']],
    ['upi-analytics','UPI অ্যানালিটিক্স','যোগ্য UPI রুটগুলোর তুলনা করুন।',['প্রতিটি রুটের স্ট্যাটাস, ভলিউম ও success rate দেখুন।','অনুমোদিত routing controls ব্যবহার করুন।','Admin stop কার্যকর থাকবে।']],
    ['upi-verification','UPI ভেরিফিকেশন','রাউটিংয়ের আগে Admin-approved রুট verify করুন।',['Linked APK status দেখুন।','যোগ্য হলে test QR তৈরি করুন।','সঠিক amount pay করে matching evidence দিন।','Verification সফল হলে routing শুরু করুন।']],
    ['statements','স্টেটমেন্ট','ব্যাংক version-এর statement evidence আপলোড করুন।',['সঠিক ব্যাংক বাছুন।','Supported statement আপলোড করুন।','Parsed entries ও result দেখুন।']],
    ['usdt-deposit','USDT ডিপোজিট','Collection capacity-এর জন্য USDT deposit order তৈরি করুন।',['Amount দিয়ে order তৈরি করুন।','Network, address ও rate দেখুন।','সেই network-এ order amount পাঠান।','History-তে transfer reference দিয়ে confirmation track করুন।']],
    ['commission','কমিশন','Earned, available ও held commission দেখুন।',['Available commission আলাদা করে দেখুন।','Entitlement ও history দেখুন।','প্রয়োজনে Withdraw খুলুন।']],
    ['withdraw','উইথড্র','Available commission থেকে withdrawal request করুন।',['INR বা USDT বাছুন।','Destination ও amount দিন।','Fees, rate ও net receive দেখুন।','Submit করে history-তে track করুন।']],
    ['holds','হোল্ড','সাময়িকভাবে আটকে থাকা funds বুঝুন।',['Reference ও reason দেখুন।','Held amount ও release status দেখুন।']],
    ['payins','পে-ইন হিস্ট্রি','Collection records খুঁজুন।',['Filters ব্যবহার করুন।','Reference, UPI, amount, date ও status দেখুন।','প্রয়োজনে details খুলুন।']],
    ['payouts','পেআউট অর্ডার','Eligible payout work claim ও review track করুন।',['প্রয়োজনে eligible bank বাছুন।','Available order claim করুন।','Beneficiary ও deadline দেখুন।','Deadline-এর আগে evidence দিন।','Review ও history track করুন।']],
    ['transactions','সম্পন্ন পেমেন্ট','সম্পন্ন financial activity দেখুন।',['Payout ও Parking records দেখুন।','Filters ও details ব্যবহার করুন।']],
    ['parking-beneficiaries','পার্কিং বেনিফিশিয়ারি','Parking work-এর beneficiary manage করুন।',['Beneficiary details দেখুন।','Bank-এ যোগ করার পরই confirm করুন।']],
    ['parking-orders','পার্কিং অর্ডার','Eligible Parking orders নিয়ে কাজ করুন।',['Limits ও available amount দেখুন।','Eligible amount lock করুন।','Deadline-এর মধ্যে pay ও evidence submit করুন।','History-তে result দেখুন।']],
    ['agent','WPay এজেন্ট','Official Android companion setup করুন।',['Latest APK download করুন।','নিজের device-এ install করুন।','Activation code দিয়ে pair করুন।']],
    ['activation','অ্যাক্টিভেশন কোড','Device pairing code তৈরি ও track করুন।',['Eligible হলে code তৈরি করুন।','WPay Agent-এ দিন।','Pending, Used, Expired বা Revoked status দেখুন।','Unused code গোপন রাখুন।']],
    ['devices','লিঙ্কড ডিভাইস','Account-এর linked device দেখুন।',['Mobile, version, network, battery ও last seen দেখুন।','Location ও device history দেখুন।','Disconnect করতে চাইলে তবেই unlink করুন।']],
    ['otp','OTP ইভেন্ট','Masked event history দেখুন।',['Page খুলে filters ব্যবহার করুন।','Sender, device ও masked event details দেখুন।']],
    ['trade','WPay-এর সাথে ট্রেড','এই section শীঘ্রই আসছে।',['এখন trading action available নয়।']],
    ['notifications','নোটিফিকেশন','Account update দেখুন।',['নতুন notification পড়ুন।','Available read controls ব্যবহার করুন।']],
    ['support','সাপোর্ট','Account বিষয়ে সহায়তা নিন।',['Issue লিখে ticket তৈরি করুন।','Reply পড়তে conversation খুলুন।','Password বা secret credential দেবেন না।']],
    ['security','সিকিউরিটি','Account access manage করুন।',['চাইলে login MFA enable করুন।','Sessions দেখে unknown session revoke করুন।','প্রয়োজনে password controls ব্যবহার করুন।']],
    ['settings','সেটিংস','Workspace preference পরিবর্তন করুন।',['Options দেখুন।','Changes save করুন।']],
    ['profile','প্রোফাইল','Account profile maintain করুন।',['Identity ও status দেখুন।','Allowed fields edit করুন।','Profile save করুন।']]
   ]
  },
  gu:{
   labels:['યૂઝર ગાઇડ','ભાષા પસંદ કરો','પગલું-દર-પગલું માર્ગદર્શિકા','આ વિકલ્પ શું કરે છે','કેવી રીતે ઉપયોગ કરવો','મહત્વપૂર્ણ સૂચનો','ખોલો'],
   tip:'પેજ પર દેખાતી વાસ્તવિક મર્યાદા, પાત્રતા અને સ્થિતિનું પાલન કરો. માત્ર રિક્વેસ્ટ અથવા રેફરન્સ સબમિટ કરવાથી પેમેન્ટ કન્ફર્મ થતું નથી.',
   topics:[
    ['overview','ડેશબોર્ડ','કૅપેસિટી, કમિશન, પેમેન્ટ ટોટલ અને ડિવાઇસ હેલ્થ જુઓ.',['સારાંશ કાર્ડ જુઓ.','રૂટ સ્ટેટસ તપાસો.','આગળના કામ માટે Quick Actions વાપરો.']],
    ['analytics','એનાલિટિક્સ','તમારી વાસ્તવિક પેમેન્ટ કામગીરી સમજો.',['સફળ, નિષ્ફળ અને પેન્ડિંગ ગણતરી જુઓ.','કલેક્શન અને પેઆઉટ ટ્રેન્ડ સરખાવો.','દરેક રૂટ માટે UPI Analytics ખોલો.']],
    ['bank-upi','બેંક અને UPI','રિસીવિંગ રૂટ ઉમેરો અથવા અપડેટ કરો.',['સાચો રૂટ પ્રકાર પસંદ કરો.','જરૂરી ખાતા અને મોબાઇલ વિગતો भरो.','Admin approval માટે સબમિટ કરો.','રૂટિંગ પહેલાં approved version verify કરો.']],
    ['upi-analytics','UPI એનાલિટિક્સ','પાત્ર UPI રૂટની સરખામણી કરો.',['સ્ટેટસ, વોલ્યુમ અને success rate જુઓ.','મંજૂર routing controls વાપરો.','Admin stop અમલમાં રહેશે.']],
    ['upi-verification','UPI વેરિફિકેશન','રૂટિંગ પહેલાં Admin-approved રૂટ verify કરો.',['Linked APK status તપાસો.','પાત્ર હોય ત્યારે test QR બનાવો.','ચોક્કસ amount pay કરીને matching evidence આપો.','Verification સફળ થયા પછી routing શરૂ કરો.']],
    ['statements','સ્ટેટમેન્ટ','Bank version માટે statement evidence upload કરો.',['સાચી બેંક પસંદ કરો.','Supported statement upload કરો.','Parsed entries અને result જુઓ.']],
    ['usdt-deposit','USDT ડિપોઝિટ','Collection capacity માટે USDT deposit order બનાવો.',['Amount નાખીને order બનાવો.','Network, address અને rate તપાસો.','તે જ network પર amount મોકલો.','Historyમાં transfer reference આપીને confirmation track કરો.']],
    ['commission','કમિશન','Earned, available અને held commission જુઓ.',['Available commission અલગ જુઓ.','Entitlement અને history જુઓ.','જરૂર પડે ત્યારે Withdraw ખોલો.']],
    ['withdraw','વિથડ્રો','Available commissionમાંથી withdrawal request કરો.',['INR અથવા USDT પસંદ કરો.','Destination અને amount भरो.','Fees, rate અને net receive જુઓ.','Submit કરીને historyમાં track કરો.']],
    ['holds','હોલ્ડ્સ','તાત્કાલિક hold થયેલા funds સમજો.',['Reference અને reason જુઓ.','Held amount અને release status તપાસો.']],
    ['payins','પે-ઇન હિસ્ટ્રી','Collection records શોધો.',['Filters વાપરો.','Reference, UPI, amount, date અને status જુઓ.','જરૂર હોય તો details ખોલો.']],
    ['payouts','પેઆઉટ ઓર્ડર્સ','Eligible payout work claim કરીને review track કરો.',['જરૂર હોય તો eligible bank પસંદ કરો.','Available order claim કરો.','Beneficiary અને deadline જુઓ.','Deadline પહેલાં evidence આપો.','Review અને history track કરો.']],
    ['transactions','પૂર્ણ પેમેન્ટ્સ','પૂર્ણ થયેલી financial activity જુઓ.',['Payout અને Parking records જુઓ.','Filters અને details વાપરો.']],
    ['parking-beneficiaries','પાર્કિંગ બેનિફિશિયરી','Parking work માટે beneficiary manage કરો.',['Beneficiary details જુઓ.','Bankમાં ઉમેર્યા પછી જ confirm કરો.']],
    ['parking-orders','પાર્કિંગ ઓર્ડર્સ','Eligible Parking orders પર કામ કરો.',['Limits અને available amount જુઓ.','Eligible amount lock કરો.','Deadlineમાં pay અને evidence submit કરો.','Historyમાં result track કરો.']],
    ['agent','WPay એજન્ટ','Official Android companion setup કરો.',['Latest APK download કરો.','તમારા deviceમાં install કરો.','Activation codeથી pair કરો.']],
    ['activation','એક્ટિવેશન કોડ્સ','Device pairing codes બનાવો અને track કરો.',['Eligible હોય ત્યારે code બનાવો.','WPay Agentમાં દાખલ કરો.','Pending, Used, Expired અથવા Revoked status જુઓ.','Unused code private રાખો.']],
    ['devices','લિંક્ડ ડિવાઇસિસ','Account સાથે linked devices તપાસો.',['Mobile, version, network, battery અને last seen જુઓ.','Location અને device history જુઓ.','Disconnect કરવું હોય ત્યારે જ unlink કરો.']],
    ['otp','OTP ઇવેન્ટ્સ','Masked event history જુઓ.',['Page ખોલીને filters વાપરો.','Sender, device અને masked event details જુઓ.']],
    ['trade','WPay સાથે ટ્રેડ','આ section ટૂંક સમયમાં આવશે.',['હાલ trading action available નથી.']],
    ['notifications','નોટિફિકેશન્સ','Account updates જુઓ.',['નવા notifications વાંચો.','Available read controls વાપરો.']],
    ['support','સપોર્ટ','Account માટે મદદ મેળવો.',['Issue લખીને ticket બનાવો.','Replies માટે conversation ખોલો.','Password અથવા secret credentials ન આપો.']],
    ['security','સિક્યુરિટી','Account access manage કરો.',['ઇચ્છો તો login MFA enable કરો.','Sessions તપાસીને unknown sessions revoke કરો.','જરૂર પડે ત્યારે password controls વાપરો.']],
    ['settings','સેટિંગ્સ','Workspace preferences બદલો.',['Options તપાસો.','Changes save કરો.']],
    ['profile','પ્રોફાઇલ','Account profile maintain કરો.',['Identity અને status જુઓ.','Allowed fields edit કરો.','Profile save કરો.']]
   ]
  },
  ta:{
   labels:['பயனர் வழிகாட்டி','மொழியைத் தேர்ந்தெடுக்கவும்','படிப்படியான வழிகாட்டி','இந்த விருப்பம் என்ன செய்கிறது','எப்படி பயன்படுத்துவது','முக்கிய குறிப்புகள்','திறக்கவும்'],
   tip:'பக்கத்தில் காட்டப்படும் உண்மையான வரம்புகள், தகுதி மற்றும் நிலையையே பின்பற்றுங்கள். கோரிக்கை அல்லது reference அனுப்பியது மட்டும் payment உறுதிப்படுத்தாது.',
   topics:[
    ['overview','டாஷ்போர்டு','Capacity, commission, payment totals மற்றும் device health-ஐ பார்க்கவும்.',['Summary cards-ஐ பார்க்கவும்.','Route status-ஐ சரிபார்க்கவும்.','அடுத்த பணிக்கு Quick Actions பயன்படுத்தவும்.']],
    ['analytics','அனலிட்டிக்ஸ்','உங்கள் உண்மையான payment performance-ஐ புரிந்துகொள்ளுங்கள்.',['Successful, failed, pending எண்ணிக்கைகளை பார்க்கவும்.','Collection மற்றும் payout trends-ஐ ஒப்பிடவும்.','ஒவ்வொரு route-க்கும் UPI Analytics திறக்கவும்.']],
    ['bank-upi','வங்கி & UPI','Receiving routes-ஐ சேர்க்க அல்லது update செய்யவும்.',['சரியான route type தேர்ந்தெடுக்கவும்.','Account மற்றும் mobile விவரங்களை நிரப்பவும்.','Admin approval-க்கு submit செய்யவும்.','Routing முன் approved version-ஐ verify செய்யவும்.']],
    ['upi-analytics','UPI அனலிட்டிக்ஸ்','தகுதியான UPI routes-ஐ ஒப்பிடவும்.',['Status, volume, success rate பார்க்கவும்.','அனுமதிக்கப்பட்ட routing controls பயன்படுத்தவும்.','Admin stop தொடர்ந்து அமலில் இருக்கும்.']],
    ['upi-verification','UPI சரிபார்ப்பு','Routing முன் Admin-approved route-ஐ verify செய்யவும்.',['Linked APK status பார்க்கவும்.','தகுதி இருந்தால் test QR உருவாக்கவும்.','Exact amount செலுத்தி matching evidence submit செய்யவும்.','Verification வெற்றி பெற்ற பிறகு routing தொடங்கவும்.']],
    ['statements','ஸ்டேட்மென்ட்ஸ்','உங்கள் bank version-க்கு statement evidence upload செய்யவும்.',['சரியான வங்கி தேர்ந்தெடுக்கவும்.','Supported statement upload செய்யவும்.','Parsed entries மற்றும் result பார்க்கவும்.']],
    ['usdt-deposit','USDT டெபாசிட்','Collection capacity-க்கு USDT deposit order உருவாக்கவும்.',['Amount உள்ளிட்டு order உருவாக்கவும்.','Network, address, rate பார்க்கவும்.','அதே network-ல் amount அனுப்பவும்.','History-ல் transfer reference submit செய்து confirmation track செய்யவும்.']],
    ['commission','கமிஷன்','Earned, available, held commission பார்க்கவும்.',['Available commission-ஐ collection capacity-யிலிருந்து தனியாக பார்க்கவும்.','Entitlement மற்றும் history பார்க்கவும்.','தேவையெனில் Withdraw திறக்கவும்.']],
    ['withdraw','வித்ட்ரா','Available commission-லிருந்து withdrawal request செய்யவும்.',['INR அல்லது USDT தேர்வு செய்யவும்.','Destination மற்றும் amount நிரப்பவும்.','Fees, rate, net receive பார்க்கவும்.','Submit செய்து history-ல் track செய்யவும்.']],
    ['holds','ஹோல்ட்ஸ்','தற்காலிகமாக hold செய்யப்பட்ட funds-ஐ புரிந்துகொள்ளுங்கள்.',['Reference மற்றும் reason பார்க்கவும்.','Held amount மற்றும் release status பார்க்கவும்.']],
    ['payins','Pay-in வரலாறு','Collection records-ஐ கண்டுபிடிக்கவும்.',['Filters பயன்படுத்தவும்.','Reference, UPI, amount, date, status பார்க்கவும்.','தேவையெனில் details திறக்கவும்.']],
    ['payouts','Payout Orders','Eligible payout work claim செய்து review track செய்யவும்.',['தேவையெனில் eligible bank தேர்வு செய்யவும்.','Available order claim செய்யவும்.','Beneficiary மற்றும் deadline பார்க்கவும்.','Deadline முன் evidence submit செய்யவும்.','Review மற்றும் history track செய்யவும்.']],
    ['transactions','முடிந்த Payments','முடிந்த financial activity பார்க்கவும்.',['Payout மற்றும் Parking records பார்க்கவும்.','Filters மற்றும் details பயன்படுத்தவும்.']],
    ['parking-beneficiaries','Parking Beneficiaries','Parking work beneficiary-களை manage செய்யவும்.',['Beneficiary details பார்க்கவும்.','Bank-ல் சேர்த்த பிறகு மட்டும் confirm செய்யவும்.']],
    ['parking-orders','Parking Orders','Eligible Parking orders-ல் வேலை செய்யவும்.',['Limits மற்றும் available amount பார்க்கவும்.','Eligible amount lock செய்யவும்.','Deadline-க்குள் pay செய்து evidence submit செய்யவும்.','History-ல் result track செய்யவும்.']],
    ['agent','WPay Agent','Official Android companion setup செய்யவும்.',['Latest APK download செய்யவும்.','உங்கள் device-ல் install செய்யவும்.','Activation code மூலம் pair செய்யவும்.']],
    ['activation','Activation Codes','Device pairing codes உருவாக்கி track செய்யவும்.',['Eligible என்றால் code உருவாக்கவும்.','WPay Agent-ல் உள்ளிடவும்.','Pending, Used, Expired, Revoked status பார்க்கவும்.','Unused codes-ஐ private-ஆக வைத்திருக்கவும்.']],
    ['devices','Linked Devices','Account-க்கு linked devices பார்க்கவும்.',['Mobile, version, network, battery, last seen பார்க்கவும்.','Location மற்றும் device history பார்க்கவும்.','Disconnect செய்ய விரும்பினால் மட்டுமே unlink செய்யவும்.']],
    ['otp','OTP Events','Masked event history பார்க்கவும்.',['Page திறந்து filters பயன்படுத்தவும்.','Sender, device மற்றும் masked event details பார்க்கவும்.']],
    ['trade','WPay உடன் Trade','இந்த section விரைவில் வரும்.',['தற்போது trading action கிடைக்கவில்லை.']],
    ['notifications','Notifications','Account updates பார்க்கவும்.',['புதிய notifications படிக்கவும்.','Available read controls பயன்படுத்தவும்.']],
    ['support','Support','Account உதவி பெறவும்.',['Issue-ஐ விவரித்து ticket உருவாக்கவும்.','Replies படிக்க conversation திறக்கவும்.','Password அல்லது secret credentials சேர்க்க வேண்டாம்.']],
    ['security','Security','Account access manage செய்யவும்.',['விரும்பினால் login MFA enable செய்யவும்.','Sessions பார்த்து unknown sessions revoke செய்யவும்.','தேவையெனில் password controls பயன்படுத்தவும்.']],
    ['settings','Settings','Workspace preferences மாற்றவும்.',['காட்டப்படும் options பார்க்கவும்.','Changes save செய்யவும்.']],
    ['profile','Profile','Account profile maintain செய்யவும்.',['Identity மற்றும் status பார்க்கவும்.','Allowed fields edit செய்யவும்.','Profile save செய்யவும்.']]
   ]
  },
  nag:{
   labels:['User Guide','Language select koribi','Step-by-step guide','Eitu option ki kore','Kene use koribo','Important kotha','Open'],
   tip:'Page-t dekhai diya actual limit, eligibility aru status follow koribi. Request nohoile reference submit korilei payment confirm nohoi.',
   topics:[
    ['overview','Dashboard','Capacity, commission, payment total aru device health sab ek jagat sabo.',['Summary card sab sabi.','Route status check koribi.','Next kaam karone Quick Actions use koribi.']],
    ['analytics','Analytics','Apuni payment performance bhalke bujibo.',['Successful, failed aru pending count sabi.','Collection aru payout trend compare koribi.','Alag route karone UPI Analytics khulibi.']],
    ['bank-upi','Bank & UPI','Receiving route add nohoile update koribi.',['Thik route type select koribi.','Account aru mobile details fill koribi.','Admin approval karone submit koribi.','Routing start korar age approved version verify koribi.']],
    ['upi-analytics','UPI Analytics','Eligible UPI route sab compare koribi.',['Status, volume aru success rate sabi.','Allowed routing control use koribi.','Admin stop thakile eitu effective thakibo.']],
    ['upi-verification','UPI Verification','Routing age Admin-approved route verify koribi.',['Linked APK status sabi.','Eligible hole test QR generate koribi.','Exact amount pay kori matching evidence dibo.','Verification successful hole he routing start koribi.']],
    ['statements','Statements','Bank version karone statement evidence upload koribi.',['Thik bank select koribi.','Supported statement upload koribi.','Parsed entry aru result sabi.']],
    ['usdt-deposit','USDT Deposit','Collection capacity karone USDT deposit order bonabi.',['Amount di order bonabi.','Network, address aru rate sabi.','Same network-t amount pathabi.','History-t transfer reference di confirmation track koribi.']],
    ['commission','Commission','Earned, available aru held commission sabi.',['Available commission alag sabi.','Entitlement aru history sabi.','Lage hole Withdraw khulibi.']],
    ['withdraw','Withdraw','Available commission pora withdrawal request dibo.',['INR nohoile USDT select koribi.','Destination aru amount dibo.','Fees, rate aru net receive sabi.','Submit kori history-t track koribi.']],
    ['holds','Holds','Temporary hold kora fund bujibi.',['Reference aru reason sabi.','Held amount aru release status sabi.']],
    ['payins','Pay-in History','Collection record sab bisaribi.',['Filter use koribi.','Reference, UPI, amount, date aru status sabi.','Lage hole details khulibi.']],
    ['payouts','Payout Orders','Eligible payout work claim kori review track koribi.',['Lage hole eligible bank select koribi.','Available order claim koribi.','Beneficiary aru deadline sabi.','Deadline age evidence submit koribi.','Review aru history track koribi.']],
    ['transactions','Completed Payments','Complete hoa financial activity sabi.',['Payout aru Parking record sabi.','Filter aru details use koribi.']],
    ['parking-beneficiaries','Parking Beneficiaries','Parking work karone beneficiary manage koribi.',['Beneficiary details sabi.','Bank-t add korar pichete confirm koribi.']],
    ['parking-orders','Parking Orders','Eligible Parking order-t kaam koribi.',['Limit aru available amount sabi.','Eligible amount lock koribi.','Deadline bhitor pay kori evidence submit koribi.','History-t result track koribi.']],
    ['agent','WPay Agent','Official Android companion setup koribi.',['Latest APK download koribi.','Nijor device-t install koribi.','Activation code diya pair koribi.']],
    ['activation','Activation Codes','Device pairing code bonai track koribi.',['Eligible hole code generate koribi.','WPay Agent-t enter koribi.','Pending, Used, Expired nohoile Revoked status sabi.','Unused code private rakhibi.']],
    ['devices','Linked Devices','Account logot linked device sab sabi.',['Mobile, version, network, battery aru last seen sabi.','Location aru device history sabi.','Disconnect koribo mon hole he unlink koribi.']],
    ['otp','OTP Events','Masked event history sabi.',['Page khuli filter use koribi.','Sender, device aru masked event detail sabi.']],
    ['trade','Trade with WPay','Eitu section olop din pichete ahibo.',['Etiya trading action available nai.']],
    ['notifications','Notifications','Account update sab sabi.',['Notun notification porhibi.','Read control use koribi.']],
    ['support','Support','Account karone help lobi.',['Problem explain kori ticket bonabi.','Reply porhibole conversation khulibi.','Password nohoile secret credential nidibi.']],
    ['security','Security','Account access manage koribi.',['Mon hole login MFA enable koribi.','Session sabi aru unknown session revoke koribi.','Lage hole password control use koribi.']],
    ['settings','Settings','Workspace preference adjust koribi.',['Option sab sabi.','Change save koribi.']],
    ['profile','Profile','Account profile maintain koribi.',['Identity aru status sabi.','Allowed field edit koribi.','Profile save koribi.']]
   ]
  },
  ur:{
   labels:['یوزر گائیڈ','زبان منتخب کریں','مرحلہ وار رہنمائی','یہ آپشن کیا کرتا ہے','اسے کیسے استعمال کریں','اہم ہدایات','کھولیں'],
   tip:'صفحے پر دکھائی گئی اصل حد، اہلیت اور اسٹیٹس پر عمل کریں۔ صرف درخواست یا ریفرنس جمع ہونے سے ادائیگی کی تصدیق نہیں ہوتی۔',
   topics:[
    ['overview','ڈیش بورڈ','کیپیسٹی، کمیشن، ادائیگی کا مجموعہ اور ڈیوائس کی حالت دیکھیں۔',['خلاصہ کارڈ دیکھیں۔','روٹ اسٹیٹس چیک کریں۔','اگلے کام کے لیے Quick Actions استعمال کریں۔']],
    ['analytics','اینالٹکس','اپنی حقیقی ادائیگی کی کارکردگی سمجھیں۔',['کامیاب، ناکام اور زیرِ التوا تعداد دیکھیں۔','کلیکشن اور پے آؤٹ رجحانات کا موازنہ کریں۔','ہر روٹ کے لیے UPI Analytics کھولیں۔']],
    ['bank-upi','بینک اور UPI','ریسیونگ روٹس شامل یا اپڈیٹ کریں۔',['درست روٹ ٹائپ منتخب کریں۔','ضروری اکاؤنٹ اور موبائل تفصیل درج کریں۔','Admin approval کے لیے جمع کریں۔','Routing شروع کرنے سے پہلے approved version verify کریں۔']],
    ['upi-analytics','UPI اینالٹکس','اپنے اہل UPI روٹس کا موازنہ کریں۔',['ہر روٹ کا اسٹیٹس، والیوم اور success rate دیکھیں۔','اجازت یافتہ routing controls استعمال کریں۔','Admin stop نافذ رہے گا۔']],
    ['upi-verification','UPI ویریفکیشن','Routing سے پہلے Admin-approved روٹ verify کریں۔',['Linked APK status دیکھیں۔','اہل ہونے پر test QR بنائیں۔','درست رقم ادا کرکے matching evidence دیں۔','Verification کامیاب ہونے کے بعد routing شروع کریں۔']],
    ['statements','اسٹیٹمنٹس','اپنے bank version کے لیے statement evidence اپلوڈ کریں۔',['صحیح بینک منتخب کریں۔','Supported statement اپلوڈ کریں۔','Parsed entries اور نتیجہ دیکھیں۔']],
    ['usdt-deposit','USDT ڈپازٹ','Collection capacity کے لیے USDT deposit order بنائیں۔',['رقم درج کرکے order بنائیں۔','Network، address اور rate دیکھیں۔','اسی network پر رقم بھیجیں۔','History میں transfer reference دے کر confirmation track کریں۔']],
    ['commission','کمیشن','Earned، available اور held commission دیکھیں۔',['Available commission الگ دیکھیں۔','Entitlement اور history دیکھیں۔','ضرورت پر Withdraw کھولیں۔']],
    ['withdraw','وِدڈرال','Available commission سے withdrawal request کریں۔',['INR یا USDT منتخب کریں۔','Destination اور amount درج کریں۔','Fees، rate اور net receive دیکھیں۔','Submit کرکے history میں track کریں۔']],
    ['holds','ہولڈز','عارضی طور پر روکی گئی رقم سمجھیں۔',['Reference اور reason دیکھیں۔','Held amount اور release status دیکھیں۔']],
    ['payins','Pay-in ہسٹری','اپنے collection records تلاش کریں۔',['Filters استعمال کریں۔','Reference، UPI، amount، date اور status دیکھیں۔','ضرورت پر details کھولیں۔']],
    ['payouts','Payout Orders','اہل payout work claim کریں اور review track کریں۔',['ضرورت ہو تو eligible bank منتخب کریں۔','Available order claim کریں۔','Beneficiary اور deadline دیکھیں۔','Deadline سے پہلے evidence جمع کریں۔','Review اور history track کریں۔']],
    ['transactions','مکمل ادائیگیاں','مکمل financial activity دیکھیں۔',['Payout اور Parking records دیکھیں۔','Filters اور details استعمال کریں۔']],
    ['parking-beneficiaries','Parking Beneficiaries','Parking work کے beneficiary manage کریں۔',['Beneficiary details دیکھیں۔','Bank میں شامل کرنے کے بعد ہی confirm کریں۔']],
    ['parking-orders','Parking Orders','Eligible Parking orders پر کام کریں۔',['Limits اور available amount دیکھیں۔','Eligible amount lock کریں۔','Deadline میں pay اور evidence submit کریں۔','History میں result track کریں۔']],
    ['agent','WPay Agent','Official Android companion setup کریں۔',['Latest APK download کریں۔','اپنے device میں install کریں۔','Activation code سے pair کریں۔']],
    ['activation','Activation Codes','Device pairing codes بنائیں اور track کریں۔',['Eligible ہونے پر code بنائیں۔','WPay Agent میں درج کریں۔','Pending، Used، Expired یا Revoked status دیکھیں۔','Unused codes محفوظ رکھیں۔']],
    ['devices','Linked Devices','Account سے linked devices دیکھیں۔',['Mobile، version، network، battery اور last seen دیکھیں۔','Location اور device history دیکھیں۔','صرف disconnect کرنا ہو تو unlink کریں۔']],
    ['otp','OTP Events','Masked event history دیکھیں۔',['Page کھول کر filters استعمال کریں۔','Sender، device اور masked event details دیکھیں۔']],
    ['trade','WPay کے ساتھ Trade','یہ section جلد آ رہا ہے۔',['فی الحال trading action available نہیں۔']],
    ['notifications','Notifications','Account updates دیکھیں۔',['نئے notifications پڑھیں۔','Available read controls استعمال کریں۔']],
    ['support','Support','Account کے لیے مدد لیں۔',['مسئلہ بتا کر ticket بنائیں۔','Replies پڑھنے کے لیے conversation کھولیں۔','Password یا secret credentials شامل نہ کریں۔']],
    ['security','Security','Account access manage کریں۔',['چاہیں تو login MFA enable کریں۔','Sessions دیکھ کر unknown sessions revoke کریں۔','ضرورت پر password controls استعمال کریں۔']],
    ['settings','Settings','Workspace preferences بدلیں۔',['Options دیکھیں۔','Changes save کریں۔']],
    ['profile','Profile','Account profile برقرار رکھیں۔',['Identity اور status دیکھیں۔','Allowed fields edit کریں۔','Profile save کریں۔']]
   ]
  },
  pa:{
   labels:['ਯੂਜ਼ਰ ਗਾਈਡ','ਭਾਸ਼ਾ ਚੁਣੋ','ਕਦਮ-ਦਰ-ਕਦਮ ਗਾਈਡ','ਇਹ ਵਿਕਲਪ ਕੀ ਕਰਦਾ ਹੈ','ਕਿਵੇਂ ਵਰਤਣਾ ਹੈ','ਮਹੱਤਵਪੂਰਨ ਸੁਝਾਅ','ਖੋਲ੍ਹੋ'],
   tip:'ਪੇਜ ਉੱਤੇ ਦਿਖਾਈ ਅਸਲ ਹੱਦਾਂ, ਯੋਗਤਾ ਅਤੇ ਸਟੇਟਸ ਦੀ ਪਾਲਣਾ ਕਰੋ। ਸਿਰਫ ਰਿਕਵੇਸਟ ਜਾਂ ਰੈਫਰੈਂਸ ਸਬਮਿਟ ਹੋਣ ਨਾਲ ਭੁਗਤਾਨ ਕਨਫਰਮ ਨਹੀਂ ਹੁੰਦਾ।',
   topics:[
    ['overview','ਡੈਸ਼ਬੋਰਡ','Capacity, commission, payment totals ਅਤੇ device health ਵੇਖੋ।',['Summary cards ਵੇਖੋ।','Route status ਚੈੱਕ ਕਰੋ।','ਅਗਲੇ ਕੰਮ ਲਈ Quick Actions ਵਰਤੋ।']],
    ['analytics','ਐਨਾਲਿਟਿਕਸ','ਆਪਣੀ ਅਸਲ payment performance ਸਮਝੋ।',['Successful, failed ਅਤੇ pending counts ਵੇਖੋ।','Collection ਅਤੇ payout trends compare ਕਰੋ।','ਹਰ route ਲਈ UPI Analytics ਖੋਲ੍ਹੋ।']],
    ['bank-upi','ਬੈਂਕ ਅਤੇ UPI','Receiving routes add ਜਾਂ update ਕਰੋ।',['ਸਹੀ route type ਚੁਣੋ।','ਲੋੜੀਂਦੇ account ਅਤੇ mobile details ਭਰੋ।','Admin approval ਲਈ submit ਕਰੋ।','Routing ਤੋਂ ਪਹਿਲਾਂ approved version verify ਕਰੋ।']],
    ['upi-analytics','UPI ਐਨਾਲਿਟਿਕਸ','Eligible UPI routes compare ਕਰੋ।',['Status, volume ਅਤੇ success rate ਵੇਖੋ।','Allowed routing controls ਵਰਤੋ।','Admin stop ਲਾਗੂ ਰਹੇਗਾ।']],
    ['upi-verification','UPI ਵੈਰੀਫਿਕੇਸ਼ਨ','Routing ਤੋਂ ਪਹਿਲਾਂ Admin-approved route verify ਕਰੋ।',['Linked APK status ਵੇਖੋ।','Eligible ਹੋਣ ਤੇ test QR ਬਣਾਓ।','Exact amount pay ਕਰਕੇ matching evidence ਦਿਓ।','Verification successful ਹੋਣ ਤੋਂ ਬਾਅਦ routing ਸ਼ੁਰੂ ਕਰੋ।']],
    ['statements','ਸਟੇਟਮੈਂਟਸ','Bank version ਲਈ statement evidence upload ਕਰੋ।',['ਸਹੀ bank ਚੁਣੋ।','Supported statement upload ਕਰੋ।','Parsed entries ਅਤੇ result ਵੇਖੋ।']],
    ['usdt-deposit','USDT ਡਿਪਾਜ਼ਿਟ','Collection capacity ਲਈ USDT deposit order ਬਣਾਓ।',['Amount ਪਾ ਕੇ order ਬਣਾਓ।','Network, address ਅਤੇ rate ਵੇਖੋ।','ਉਸੇ network ਤੇ amount ਭੇਜੋ।','History ਵਿੱਚ transfer reference ਦੇ ਕੇ confirmation track ਕਰੋ।']],
    ['commission','ਕਮਿਸ਼ਨ','Earned, available ਅਤੇ held commission ਵੇਖੋ।',['Available commission ਵੱਖਰਾ ਵੇਖੋ।','Entitlement ਅਤੇ history ਵੇਖੋ।','ਲੋੜ ਤੇ Withdraw ਖੋਲ੍ਹੋ।']],
    ['withdraw','ਵਿਡਰੌ','Available commission ਤੋਂ withdrawal request ਕਰੋ।',['INR ਜਾਂ USDT ਚੁਣੋ।','Destination ਅਤੇ amount ਭਰੋ।','Fees, rate ਅਤੇ net receive ਵੇਖੋ।','Submit ਕਰਕੇ history ਵਿੱਚ track ਕਰੋ।']],
    ['holds','ਹੋਲਡਸ','Temporary held funds ਸਮਝੋ।',['Reference ਅਤੇ reason ਵੇਖੋ।','Held amount ਅਤੇ release status ਵੇਖੋ।']],
    ['payins','Pay-in ਹਿਸਟਰੀ','Collection records ਲੱਭੋ।',['Filters ਵਰਤੋ।','Reference, UPI, amount, date ਅਤੇ status ਵੇਖੋ।','ਲੋੜ ਤੇ details ਖੋਲ੍ਹੋ।']],
    ['payouts','Payout Orders','Eligible payout work claim ਕਰੋ ਅਤੇ review track ਕਰੋ।',['ਲੋੜ ਹੋਵੇ ਤਾਂ eligible bank ਚੁਣੋ।','Available order claim ਕਰੋ।','Beneficiary ਅਤੇ deadline ਵੇਖੋ।','Deadline ਤੋਂ ਪਹਿਲਾਂ evidence submit ਕਰੋ।','Review ਅਤੇ history track ਕਰੋ।']],
    ['transactions','Completed Payments','Complete financial activity ਵੇਖੋ।',['Payout ਅਤੇ Parking records ਵੇਖੋ।','Filters ਅਤੇ details ਵਰਤੋ।']],
    ['parking-beneficiaries','Parking Beneficiaries','Parking work ਲਈ beneficiary manage ਕਰੋ।',['Beneficiary details ਵੇਖੋ।','Bank ਵਿੱਚ add ਕਰਨ ਤੋਂ ਬਾਅਦ ਹੀ confirm ਕਰੋ।']],
    ['parking-orders','Parking Orders','Eligible Parking orders ਤੇ ਕੰਮ ਕਰੋ।',['Limits ਅਤੇ available amount ਵੇਖੋ।','Eligible amount lock ਕਰੋ।','Deadline ਅੰਦਰ pay ਅਤੇ evidence submit ਕਰੋ।','History ਵਿੱਚ result track ਕਰੋ।']],
    ['agent','WPay Agent','Official Android companion setup ਕਰੋ।',['Latest APK download ਕਰੋ।','ਆਪਣੇ device ਵਿੱਚ install ਕਰੋ।','Activation code ਨਾਲ pair ਕਰੋ।']],
    ['activation','Activation Codes','Device pairing codes ਬਣਾਓ ਅਤੇ track ਕਰੋ।',['Eligible ਹੋਣ ਤੇ code ਬਣਾਓ।','WPay Agent ਵਿੱਚ enter ਕਰੋ।','Pending, Used, Expired ਜਾਂ Revoked status ਵੇਖੋ।','Unused codes private ਰੱਖੋ।']],
    ['devices','Linked Devices','Account ਨਾਲ linked devices ਵੇਖੋ।',['Mobile, version, network, battery ਅਤੇ last seen ਵੇਖੋ।','Location ਅਤੇ device history ਵੇਖੋ।','Disconnect ਕਰਨਾ ਹੋਵੇ ਤਾਂ ਹੀ unlink ਕਰੋ।']],
    ['otp','OTP Events','Masked event history ਵੇਖੋ।',['Page ਖੋਲ੍ਹ ਕੇ filters ਵਰਤੋ।','Sender, device ਅਤੇ masked event details ਵੇਖੋ।']],
    ['trade','WPay ਨਾਲ Trade','ਇਹ section ਜਲਦੀ ਆਵੇਗਾ।',['ਇਸ ਵੇਲੇ trading action available ਨਹੀਂ।']],
    ['notifications','Notifications','Account updates ਵੇਖੋ।',['ਨਵੇਂ notifications ਪੜ੍ਹੋ।','Available read controls ਵਰਤੋ।']],
    ['support','Support','Account ਲਈ ਮਦਦ ਲਵੋ।',['Issue ਦੱਸ ਕੇ ticket ਬਣਾਓ।','Replies ਲਈ conversation ਖੋਲ੍ਹੋ।','Password ਜਾਂ secret credentials ਨਾ ਦਿਓ।']],
    ['security','Security','Account access manage ਕਰੋ।',['ਚਾਹੋ ਤਾਂ login MFA enable ਕਰੋ।','Sessions ਵੇਖ ਕੇ unknown sessions revoke ਕਰੋ।','ਲੋੜ ਤੇ password controls ਵਰਤੋ।']],
    ['settings','Settings','Workspace preferences ਬਦਲੋ।',['Options ਵੇਖੋ।','Changes save ਕਰੋ।']],
    ['profile','Profile','Account profile maintain ਕਰੋ।',['Identity ਅਤੇ status ਵੇਖੋ।','Allowed fields edit ਕਰੋ।','Profile save ਕਰੋ।']]
   ]
  },
  or:{
   labels:['ୟୁଜର ଗାଇଡ୍','ଭାଷା ବାଛନ୍ତୁ','ପଦକ୍ଷେପ ଅନୁଯାୟୀ ଗାଇଡ୍','ଏହି ବିକଳ୍ପ କଣ କରେ','କିପରି ବ୍ୟବହାର କରିବେ','ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ ସୂଚନା','ଖୋଲନ୍ତୁ'],
   tip:'ପେଜରେ ଦେଖାଯାଇଥିବା ବାସ୍ତବ ସୀମା, ଯୋଗ୍ୟତା ଓ status ଅନୁସରଣ କରନ୍ତୁ। କେବଳ request କିମ୍ବା reference submit ହେଲେ payment confirm ହୁଏ ନାହିଁ।',
   topics:[
    ['overview','ଡ୍ୟାଶବୋର୍ଡ','Capacity, commission, payment total ଏବଂ device health ଦେଖନ୍ତୁ।',['Summary cards ଦେଖନ୍ତୁ।','Route status ଯାଞ୍ଚ କରନ୍ତୁ।','ପରବର୍ତ୍ତୀ କାମ ପାଇଁ Quick Actions ବ୍ୟବହାର କରନ୍ତୁ।']],
    ['analytics','ଆନାଲିଟିକ୍ସ','ଆପଣଙ୍କ ବାସ୍ତବ payment performance ବୁଝନ୍ତୁ।',['Successful, failed ଏବଂ pending count ଦେଖନ୍ତୁ।','Collection ଓ payout trend ତୁଳନା କରନ୍ତୁ।','ପ୍ରତ୍ୟେକ route ପାଇଁ UPI Analytics ଖୋଲନ୍ତୁ।']],
    ['bank-upi','ବ୍ୟାଙ୍କ ଏବଂ UPI','Receiving route add କିମ୍ବା update କରନ୍ତୁ।',['ଠିକ route type ବାଛନ୍ତୁ।','Account ଓ mobile details ପୂରଣ କରନ୍ତୁ।','Admin approval ପାଇଁ submit କରନ୍ତୁ।','Routing ପୂର୍ବରୁ approved version verify କରନ୍ତୁ।']],
    ['upi-analytics','UPI ଆନାଲିଟିକ୍ସ','Eligible UPI route ତୁଳନା କରନ୍ତୁ।',['Status, volume ଓ success rate ଦେଖନ୍ତୁ।','Allowed routing controls ବ୍ୟବହାର କରନ୍ତୁ।','Admin stop କାର୍ଯ୍ୟକାରୀ ରହିବ।']],
    ['upi-verification','UPI ଭେରିଫିକେସନ୍','Routing ପୂର୍ବରୁ Admin-approved route verify କରନ୍ତୁ।',['Linked APK status ଦେଖନ୍ତୁ।','Eligible ହେଲେ test QR ତିଆରି କରନ୍ତୁ।','Exact amount pay କରି matching evidence ଦିଅନ୍ତୁ।','Verification ସଫଳ ପରେ routing ଆରମ୍ଭ କରନ୍ତୁ।']],
    ['statements','ଷ୍ଟେଟମେଣ୍ଟ୍','Bank version ପାଇଁ statement evidence upload କରନ୍ତୁ।',['ଠିକ bank ବାଛନ୍ତୁ।','Supported statement upload କରନ୍ତୁ।','Parsed entries ଓ result ଦେଖନ୍ତୁ।']],
    ['usdt-deposit','USDT ଡିପୋଜିଟ୍','Collection capacity ପାଇଁ USDT deposit order ବନାନ୍ତୁ।',['Amount ଦେଇ order ବନାନ୍ତୁ।','Network, address ଓ rate ଦେଖନ୍ତୁ।','ସେହି network ରେ amount ପଠାନ୍ତୁ।','History ରେ transfer reference ଦେଇ confirmation track କରନ୍ତୁ।']],
    ['commission','କମିଶନ୍','Earned, available ଓ held commission ଦେଖନ୍ତୁ।',['Available commission ଅଲଗା ଦେଖନ୍ତୁ।','Entitlement ଓ history ଦେଖନ୍ତୁ।','ଦରକାର ହେଲେ Withdraw ଖୋଲନ୍ତୁ।']],
    ['withdraw','ୱିଥଡ୍ରଅ','Available commission ରୁ withdrawal request କରନ୍ତୁ।',['INR କିମ୍ବା USDT ବାଛନ୍ତୁ।','Destination ଓ amount ଦିଅନ୍ତୁ।','Fees, rate ଓ net receive ଦେଖନ୍ତୁ।','Submit କରି history ରେ track କରନ୍ତୁ।']],
    ['holds','ହୋଲ୍ଡ୍ସ','Temporary held fund ବୁଝନ୍ତୁ।',['Reference ଓ reason ଦେଖନ୍ତୁ।','Held amount ଓ release status ଦେଖନ୍ତୁ।']],
    ['payins','Pay-in History','Collection records ଖୋଜନ୍ତୁ।',['Filters ବ୍ୟବହାର କରନ୍ତୁ।','Reference, UPI, amount, date ଓ status ଦେଖନ୍ତୁ।','ଦରକାର ହେଲେ details ଖୋଲନ୍ତୁ।']],
    ['payouts','Payout Orders','Eligible payout work claim କରି review track କରନ୍ତୁ।',['ଦରକାର ହେଲେ eligible bank ବାଛନ୍ତୁ।','Available order claim କରନ୍ତୁ।','Beneficiary ଓ deadline ଦେଖନ୍ତୁ।','Deadline ପୂର୍ବରୁ evidence submit କରନ୍ତୁ।','Review ଓ history track କରନ୍ତୁ।']],
    ['transactions','Completed Payments','Complete financial activity ଦେଖନ୍ତୁ।',['Payout ଓ Parking records ଦେଖନ୍ତୁ।','Filters ଓ details ବ୍ୟବହାର କରନ୍ତୁ।']],
    ['parking-beneficiaries','Parking Beneficiaries','Parking work ପାଇଁ beneficiary manage କରନ୍ତୁ।',['Beneficiary details ଦେଖନ୍ତୁ।','Bank ରେ add କରିବା ପରେ ମାତ୍ର confirm କରନ୍ତୁ।']],
    ['parking-orders','Parking Orders','Eligible Parking order ରେ କାମ କରନ୍ତୁ।',['Limits ଓ available amount ଦେଖନ୍ତୁ।','Eligible amount lock କରନ୍ତୁ।','Deadline ଭିତରେ pay କରି evidence submit କରନ୍ତୁ।','History ରେ result track କରନ୍ତୁ।']],
    ['agent','WPay Agent','Official Android companion setup କରନ୍ତୁ।',['Latest APK download କରନ୍ତୁ।','ନିଜ device ରେ install କରନ୍ତୁ।','Activation code ସହ pair କରନ୍ତୁ।']],
    ['activation','Activation Codes','Device pairing code ବନାଇ track କରନ୍ତୁ।',['Eligible ହେଲେ code ବନାନ୍ତୁ।','WPay Agent ରେ enter କରନ୍ତୁ।','Pending, Used, Expired କିମ୍ବା Revoked status ଦେଖନ୍ତୁ।','Unused code private ରଖନ୍ତୁ।']],
    ['devices','Linked Devices','Account ସହ linked devices ଦେଖନ୍ତୁ।',['Mobile, version, network, battery ଓ last seen ଦେଖନ୍ତୁ।','Location ଓ device history ଦେଖନ୍ତୁ।','Disconnect କରିବାକୁ ଚାହିଁଲେ ମାତ୍ର unlink କରନ୍ତୁ।']],
    ['otp','OTP Events','Masked event history ଦେଖନ୍ତୁ।',['Page ଖୋଲି filters ବ୍ୟବହାର କରନ୍ତୁ।','Sender, device ଓ masked event details ଦେଖନ୍ତୁ।']],
    ['trade','WPay ସହ Trade','ଏହି section ଶୀଘ୍ର ଆସିବ।',['ବର୍ତ୍ତମାନ trading action available ନାହିଁ।']],
    ['notifications','Notifications','Account updates ଦେଖନ୍ତୁ।',['ନୂଆ notifications ପଢନ୍ତୁ।','Available read controls ବ୍ୟବହାର କରନ୍ତୁ।']],
    ['support','Support','Account ପାଇଁ ସହାୟତା ନିଅନ୍ତୁ।',['Issue ଲେଖି ticket ବନାନ୍ତୁ।','Replies ପାଇଁ conversation ଖୋଲନ୍ତୁ।','Password କିମ୍ବା secret credentials ଦିଅନ୍ତୁ ନାହିଁ।']],
    ['security','Security','Account access manage କରନ୍ତୁ।',['ଚାହିଁଲେ login MFA enable କରନ୍ତୁ।','Sessions ଦେଖି unknown sessions revoke କରନ୍ତୁ।','ଦରକାର ହେଲେ password controls ବ୍ୟବହାର କରନ୍ତୁ।']],
    ['settings','Settings','Workspace preferences ବଦଳାନ୍ତୁ।',['Options ଦେଖନ୍ତୁ।','Changes save କରନ୍ତୁ।']],
    ['profile','Profile','Account profile maintain କରନ୍ତୁ।',['Identity ଓ status ଦେଖନ୍ତୁ।','Allowed fields edit କରନ୍ତୁ।','Profile save କରନ୍ତୁ।']]
   ]
  },
  te:{
   labels:['యూజర్ గైడ్','భాషను ఎంచుకోండి','దశల వారీ గైడ్','ఈ ఎంపిక ఏమి చేస్తుంది','ఎలా ఉపయోగించాలి','ముఖ్యమైన సూచనలు','తెరవండి'],
   tip:'పేజీలో చూపిన నిజమైన limits, eligibility మరియు status ను అనుసరించండి. Request లేదా reference submit చేయడం మాత్రమే payment confirmation కాదు.',
   topics:[
    ['overview','డ్యాష్‌బోర్డ్','Capacity, commission, payment totals మరియు device health చూడండి.',['Summary cards చూడండి.','Route status చెక్ చేయండి.','తదుపరి పనికి Quick Actions ఉపయోగించండి.']],
    ['analytics','అనలిటిక్స్','మీ నిజమైన payment performance అర్థం చేసుకోండి.',['Successful, failed, pending counts చూడండి.','Collection మరియు payout trends పోల్చండి.','ప్రతి route కోసం UPI Analytics తెరవండి.']],
    ['bank-upi','బ్యాంక్ & UPI','Receiving routes add లేదా update చేయండి.',['సరైన route type ఎంచుకోండి.','Account మరియు mobile details నింపండి.','Admin approval కోసం submit చేయండి.','Routing ముందు approved version verify చేయండి.']],
    ['upi-analytics','UPI అనలిటిక్స్','Eligible UPI routes ను పోల్చండి.',['Status, volume మరియు success rate చూడండి.','Allowed routing controls ఉపయోగించండి.','Admin stop అమల్లోనే ఉంటుంది.']],
    ['upi-verification','UPI వెరిఫికేషన్','Routing ముందు Admin-approved route verify చేయండి.',['Linked APK status చూడండి.','Eligible అయితే test QR generate చేయండి.','Exact amount pay చేసి matching evidence submit చేయండి.','Verification success తర్వాత routing ప్రారంభించండి.']],
    ['statements','స్టేట్‌మెంట్స్','Bank version కోసం statement evidence upload చేయండి.',['సరైన bank ఎంచుకోండి.','Supported statement upload చేయండి.','Parsed entries మరియు result చూడండి.']],
    ['usdt-deposit','USDT డిపాజిట్','Collection capacity కోసం USDT deposit order సృష్టించండి.',['Amount ఇచ్చి order సృష్టించండి.','Network, address మరియు rate చూడండి.','అదే network లో amount పంపండి.','History లో transfer reference submit చేసి confirmation track చేయండి.']],
    ['commission','కమిషన్','Earned, available మరియు held commission చూడండి.',['Available commission ను collection capacity నుండి వేరుగా చూడండి.','Entitlement మరియు history చూడండి.','అవసరమైతే Withdraw తెరవండి.']],
    ['withdraw','విత్‌డ్రా','Available commission నుండి withdrawal request చేయండి.',['INR లేదా USDT ఎంచుకోండి.','Destination మరియు amount నింపండి.','Fees, rate మరియు net receive చూడండి.','Submit చేసి history లో track చేయండి.']],
    ['holds','హోల్డ్స్','Temporary held funds అర్థం చేసుకోండి.',['Reference మరియు reason చూడండి.','Held amount మరియు release status చూడండి.']],
    ['payins','Pay-in History','Collection records కనుగొనండి.',['Filters ఉపయోగించండి.','Reference, UPI, amount, date మరియు status చూడండి.','అవసరమైతే details తెరవండి.']],
    ['payouts','Payout Orders','Eligible payout work claim చేసి review track చేయండి.',['అవసరమైతే eligible bank ఎంచుకోండి.','Available order claim చేయండి.','Beneficiary మరియు deadline చూడండి.','Deadline ముందు evidence submit చేయండి.','Review మరియు history track చేయండి.']],
    ['transactions','Completed Payments','Completed financial activity చూడండి.',['Payout మరియు Parking records చూడండి.','Filters మరియు details ఉపయోగించండి.']],
    ['parking-beneficiaries','Parking Beneficiaries','Parking work కోసం beneficiary manage చేయండి.',['Beneficiary details చూడండి.','Bank లో add చేసిన తర్వాత మాత్రమే confirm చేయండి.']],
    ['parking-orders','Parking Orders','Eligible Parking orders పై పని చేయండి.',['Limits మరియు available amount చూడండి.','Eligible amount lock చేయండి.','Deadline లోపు pay చేసి evidence submit చేయండి.','History లో result track చేయండి.']],
    ['agent','WPay Agent','Official Android companion setup చేయండి.',['Latest APK download చేయండి.','మీ device లో install చేయండి.','Activation code తో pair చేయండి.']],
    ['activation','Activation Codes','Device pairing codes సృష్టించి track చేయండి.',['Eligible అయితే code సృష్టించండి.','WPay Agent లో enter చేయండి.','Pending, Used, Expired లేదా Revoked status చూడండి.','Unused codes private గా ఉంచండి.']],
    ['devices','Linked Devices','Account తో linked devices చూడండి.',['Mobile, version, network, battery మరియు last seen చూడండి.','Location మరియు device history చూడండి.','Disconnect చేయాలనుకున్నప్పుడు మాత్రమే unlink చేయండి.']],
    ['otp','OTP Events','Masked event history చూడండి.',['Page తెరిచి filters ఉపయోగించండి.','Sender, device మరియు masked event details చూడండి.']],
    ['trade','WPay తో Trade','ఈ section త్వరలో వస్తుంది.',['ప్రస్తుతం trading action available లేదు.']],
    ['notifications','Notifications','Account updates చూడండి.',['కొత్త notifications చదవండి.','Available read controls ఉపయోగించండి.']],
    ['support','Support','Account కోసం సహాయం పొందండి.',['Issue వివరించి ticket సృష్టించండి.','Replies కోసం conversation తెరవండి.','Password లేదా secret credentials ఇవ్వవద్దు.']],
    ['security','Security','Account access manage చేయండి.',['కావాలంటే login MFA enable చేయండి.','Sessions చూసి unknown sessions revoke చేయండి.','అవసరమైతే password controls ఉపయోగించండి.']],
    ['settings','Settings','Workspace preferences మార్చండి.',['Options చూడండి.','Changes save చేయండి.']],
    ['profile','Profile','Account profile maintain చేయండి.',['Identity మరియు status చూడండి.','Allowed fields edit చేయండి.','Profile save చేయండి.']]
   ]
  }
 };
 function renderGuide(host,el){
  let language='en';try{const saved=localStorage.getItem('wpay-user-guide-language');if(GUIDE_COPY[saved])language=saved;}catch{}
  const controls=el('div',undefined,'user-guide-language'),label=el('label'),select=el('select');
  label.append(el('span',GUIDE_COPY[language].labels[1]));for(const [code,name]of GUIDE_LANGUAGES){const option=document.createElement('option');option.value=code;option.textContent=name;select.append(option);}select.value=language;label.append(select);controls.append(el('div',GUIDE_COPY[language].labels[0],'eyebrow'),label);
  const layout=el('div',undefined,'user-guide-layout'),list=el('nav',undefined,'user-guide-topics'),detail=el('section',undefined,'card pad user-guide-detail');layout.append(list,detail);host.append(controls,layout);
  let activeKey='bank-upi';
  const render=()=>{
   const copy=GUIDE_COPY[language]||GUIDE_COPY.en,topic=copy.topics.find(x=>x[0]===activeKey)||copy.topics[0];label.firstChild.textContent=copy.labels[1];controls.firstChild.textContent=copy.labels[0];list.setAttribute('aria-label',copy.labels[0]);list.replaceChildren();
   const show=current=>{activeKey=current[0];detail.replaceChildren(el('div',copy.labels[2],'eyebrow'),el('h2',current[1]),el('h3',copy.labels[3]),el('p',current[2]),el('h3',copy.labels[4]));const steps=el('ol');for(const step of current[3])steps.append(el('li',step));detail.append(steps,el('h3',copy.labels[5]),el('p',copy.tip));const open=el('button',copy.labels[6]+' '+current[1]);open.type='button';open.dataset.go=current[0];open.onclick=()=>root.WPayReferenceUi?.select(current[0]);detail.append(open);for(const button of list.children)button.setAttribute('aria-pressed',String(button.dataset.topic===current[0]));};
   for(const item of copy.topics){const button=el('button',item[1]);button.type='button';button.dataset.topic=item[0];button.onclick=()=>show(item);list.append(button);}show(topic);
  };
  select.onchange=()=>{language=GUIDE_COPY[select.value]?select.value:'en';try{localStorage.setItem('wpay-user-guide-language',language);}catch{}render();};
  render();
 }
 root.WPayUserBurgundyPages={enhance};
})(globalThis);
