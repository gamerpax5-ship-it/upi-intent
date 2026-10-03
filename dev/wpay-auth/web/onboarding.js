"use strict";
(function(root){
 const names={'upi-verification':['UPI Verification','Проверка UPI','UPI 验证'],statements:['Statements','Выписки','银行流水'],'upi-analytics':['UPI Analytics','Аналитика UPI','UPI 分析']};
 const words={verify:['Verify','Проверить','验证'],enable:['Enable','Включить','启用'],run:['Start','Запустить','开始'],stop:['Stop','Остановить','停止'],cancel:['Cancel','Отменить','取消'],close:['Close','Закрыть','关闭'],upload:['Upload statement','Загрузить выписку','上传流水'],waiting:['Waiting for verified payment evidence','Ожидание подтверждённых данных о платеже','等待经过验证的付款凭证'],verified:['Verified','Проверено','已验证'],statement:['Accepted statement','Принятая выписка','已接受的流水'],required:['Required for this bank version','Требуется для этой версии счёта','此账户版本必须提供'],accepted:['Accepted','Принято','已接受'],rejected:['Rejected','Отклонено','已拒绝'],notice:['Upload a CSV, XLS or XLSX statement, up to 1 MiB. Acceptance completes onboarding only; it does not credit payments or confirm bank ownership.','Загрузите CSV, XLS или XLSX до 1 МиБ. Принятие завершает только подготовку; платежи не зачисляются, владение счётом не подтверждается.','上传 CSV、XLS 或 XLSX，最大 1 MiB。接受仅完成开户准备，不记入付款，也不确认银行账户归属。'],synthetic:['SYNTHETIC TEST — do not make a real payment','СИНТЕТИЧЕСКИЙ ТЕСТ — не выполняйте реальный платёж','模拟测试 — 请勿实际付款'],empty:['No bank submissions','Нет заявок на банковские счета','暂无银行账户申请'],total:['Total orders','Всего заказов','订单总数'],successful:['Successful','Успешно','成功'],failed:['Failed','Неуспешно','失败'],pending:['Pending','Ожидают','待处理'],expired:['Expired','Истекли','已过期'],cancelled:['Cancelled / released','Отменены / освобождены','已取消／已释放'],volume:['Successful volume','Успешный объём','成功金额'],rate:['Success rate','Доля успешных','成功率'],formula:['Successful ÷ (successful + failed). Pending, expired and cancelled/released orders are excluded. No completed orders: rate unavailable.','Успешные ÷ (успешные + неуспешные). Ожидающие, истёкшие и отменённые исключены. Без завершённых заказов доля недоступна.','成功 ÷（成功 + 失败）。排除待处理、过期及取消／释放的订单。没有已完成订单时不显示成功率。']};
 words.run=['Start routing','Запустить маршрутизацию','开始路由'];words.stop=['Stop routing','Остановить маршрутизацию','停止路由'];
 const text=(locale,key)=>(words[key]||names[key]||[key,key,key])[['en','ru','zh-CN'].indexOf(locale)]||key;
 const label=(locale,destination)=>text(locale,destination.replace('user.onboarding-',''));
 const money=value=>'₹'+(BigInt(value)/100n)+'.'+(BigInt(value)%100n).toString().padStart(2,'0');
 async function render(args){
  const {destination,locale,request,post,action,el,container,title}=args,t=k=>text(locale,k),page=destination.replace('user.onboarding-','');
  title.textContent=label(locale,destination);container.replaceChildren();const card=el('section',undefined,'card business-card');container.append(card);
  const button=(key,fn)=>{const b=el('button',t(key));b.type='button';b.onclick=()=>action(fn);return b;};
  const facts=(node,data)=>{const dl=el('dl',undefined,'facts');for(const [key,value]of Object.entries(data))dl.append(el('dt',key),el('dd',String(value)));node.append(dl);};
  const reload=()=>render(args);
  card.append(button('Refresh',reload));
  async function popup(bank){
   let challenge=null,deviceState={ready:false,status:'checking',devices:[]},busy=false,closed=false,timer,lastRefresh=0,lastDraw='';
   const requestId=crypto.randomUUID(),dialog=el('dialog',undefined,'upi-challenge'),status=el('p','','notice'),apk=el('p','Checking linked APK…','notice'),count=el('strong','Test duration: 10 minutes from QR generation'),qrBox=el('section',undefined,'card'),rows=el('div'),statementStatus=el('p');
   dialog.className+=' upi-reference-popup';dialog.setAttribute('aria-label','Verify UPI');
   const utr=el('input');utr.type='text';utr.inputMode='numeric';utr.maxLength=12;utr.pattern='[0-9]{12}';utr.placeholder='Saved UTR will be checked';utr.setAttribute('aria-label','12-digit UTR');
   status.setAttribute('role','status');apk.setAttribute('role','status');
   const control=(label,fn)=>{const b=el('button',label,'btn');b.type='button';b.onclick=()=>action(async()=>{try{await fn();}catch(e){status.textContent=root.WPayLocales?.translate(locale,e.message)||e.message;throw e;}});return b;};
   const active=()=>challenge?.status==='waiting'&&Date.parse(challenge.expiresAt)>Date.now();
   const close=()=>{closed=true;clearInterval(timer);dialog.close();dialog.remove();};
   const draw=()=>{
    const live=active();generate.disabled=!deviceState.ready||!!challenge;
    poll.disabled=!live;upload.disabled=!live;file.disabled=!live;fetchUtrs.disabled=!live;
    enable.disabled=challenge?.status!=='verified';
    enable.textContent=challenge?.status==='verified'?t('run'):'Enable verified UPI';
    if(!challenge){count.textContent='Test duration: 10 minutes from QR generation';qrBox.replaceChildren(el('p','Bring the APK for this UPI’s registered mobile online, then generate the test QR.'));return;}
    const seconds=Math.max(0,Math.ceil((Date.parse(challenge.expiresAt)-Date.now())/1000));count.textContent=challenge.status==='verified'?'Verified':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' remaining';
    const drawKey=[challenge.id,challenge.status,live,deviceState.ready,utr.value].join('|');if(drawKey===lastDraw)return;lastDraw=drawKey;
    qrBox.replaceChildren();const caption=el('small','LATEST TEST','upi-test-caption'),layout=el('div',undefined,'upi-test-layout'),visual=el('div',undefined,'upi-test-visual'),details=el('div',undefined,'upi-test-details');qrBox.append(caption,layout);layout.append(visual,details);
    if(challenge.synthetic)qrBox.append(el('p',t('synthetic'),'notice'));
    details.append(el('h3','Pay exactly INR '+money(challenge.amountMinor).slice(1)),el('p',bank.details.upiId),el('p','Expires: '+new Date(challenge.expiresAt).toLocaleString()));
    if(utr.value)details.append(el('strong','Submitted UTR: '+utr.value));
    if(live&&deviceState.ready){const image=el('img');image.src=challenge.qr;image.alt='UPI test payment QR';image.width=image.height=200;visual.append(image);}
    else visual.append(el('p',challenge.status==='verified'?'Payment verified.':!seconds?'Test expired. Do not pay this QR. Close and start a new test.':'QR hidden while the matching APK is offline.'));
   };
   const refreshDevice=async()=>{
    try{deviceState=await post('onboarding/device-status',{bankId:bank.id,version:bank.version});}
    catch(e){deviceState={ready:false,status:'unavailable',devices:[]};throw e;}
    finally{if(!closed){apk.textContent='APK status: '+deviceState.status+' · registered mobile '+bank.details.mobile+(deviceState.ready?' · online and linked to your account':' · open WPay Agent on the matching phone and keep it connected');draw();}}
   };
   const check=async()=>{if(!active())return draw();const selected=utr.value.trim();if(selected&&!/^\d{12}$/.test(selected))throw Error('Enter a valid 12-digit UTR.');challenge=await post('onboarding/poll',{challengeId:challenge.id,...(selected?{utr:selected}:{})});status.textContent=(challenge.message||challenge.status)+(challenge.verificationMethod?' · '+challenge.verificationMethod:'');draw();};
   const generate=control('Generate Test QR',async()=>{
    if(challenge)return;await refreshDevice();if(!deviceState.ready)return;
    challenge=await post('onboarding/create',{bankId:bank.id,version:bank.version,requestId});status.textContent=challenge.message||challenge.status;draw();
   }),poll=control('Check status',check),fetchUtrs=control('Fetch',async()=>{
    if(!active())return;await refreshDevice();rows.replaceChildren();
    const devices=deviceState.devices||[],table=el('table'),thead=el('thead'),head=el('tr'),tbody=el('tbody');for(const label of ['UTR','AMOUNT','RECEIVED','MATCH','ACTION'])head.append(el('th',label));thead.append(head);table.append(thead,tbody);
    const seen=new Set();
    for(const device of devices){
     let before;for(let page=0;page<5;page++){
     const result=await post('operations/device-setup/utrs',{device:device.device,...(before?{before}:{})});
     const relevant=(result.records||[]).filter(r=>{
      const at=Date.parse(r.capturedAt),amount=String(r.amount||'');
      if(!/^\d+(\.\d{1,2})?$/.test(amount))return false;
      const [whole,fraction='']=amount.split('.');
      return r.status==='CREDIT_RECEIVED'&&!r.historical&&BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))===BigInt(challenge.amountMinor)&&at>=Date.parse(challenge.createdAt)&&at<Date.parse(challenge.expiresAt)&&at<=Date.now()&&/^\d{12}$/.test(r.utr);
     });
     for(const r of relevant){if(seen.has(r.utr))continue;seen.add(r.utr);const tr=el('tr'),match=el('td'),cell=el('td');tr.append(el('td',r.utr),el('td','INR '+r.amount),el('td',new Date(r.capturedAt).toLocaleString()));match.append(el('span','AMOUNT MATCH','upi-match'));cell.append(control('Use UTR',async()=>{utr.value=r.utr;await check();}));tr.append(match,cell);tbody.append(tr);}
     if(!result.nextCursor)break;before=result.nextCursor;
     }
    }
    rows.append(table);if(!seen.size)rows.append(el('p','No exact-amount UTR candidate in this test window. You can upload a statement below.'));await check();
   }),enable=control('Enable verified UPI',async()=>{
    if(challenge?.status!=='verified')return;
    await post('business/banks/transition',{bankId:bank.id,version:bank.version,action:'run',reason:'Owner started verified UPI routing'});close();await reload();
   });
   const file=el('input');file.type='file';file.accept='.csv,.xls,.xlsx';file.setAttribute('aria-label','Statement fallback');
   const upload=control('Upload statement',async()=>{
    if(!active())return;const selected=file.files?.[0];if(!selected)throw Error('Choose a statement file first.');if(selected.size>1048576)throw Error('error.BODY_TOO_LARGE');
    const format=selected.name.split('.').at(-1).toLowerCase();if(!['csv','xls','xlsx'].includes(format))throw Error('Use CSV, XLS or XLSX.');
    const bytes=new Uint8Array(await selected.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    if(!active())return draw();
    const result=await post('onboarding/upload',{bankId:bank.id,version:bank.version,requestId:crypto.randomUUID(),format,base64:btoa(binary)});
    statementStatus.textContent='Statement '+result.status+' · '+result.creditCount+' credit rows. Checking the current test amount, transaction date and unused 12-digit UTR. Status refreshes automatically.';
    await check();
   });
   const top=el('header',undefined,'upi-popup-top'),apkRow=el('section',undefined,'upi-apk-status'),steps=el('ol',undefined,'upi-test-steps'),testRow=el('div',undefined,'upi-test-row'),utrRow=el('div',undefined,'upi-utr-row'),utrLabel=el('label','12-digit UTR'),captured=el('section',undefined,'upi-captured'),captureHead=el('div',undefined,'upi-capture-head'),captureTitle=el('div'),fallback=el('section',undefined,'upi-statement-fallback'),footer=el('footer',undefined,'upi-popup-footer');
   top.append(el('h2','Verify UPI'),count,control('Close',close));apkRow.append(apk,control('Refresh APK status',refreshDevice));
   for(const line of ['Make sure your APK is connected.','Generate the test QR.','Scan and pay the exact amount shown.','Wait for the credit SMS, or upload your statement below.','Enter the 12-digit UTR.'])steps.append(el('li',line));
   generate.className+=' upi-primary';poll.className+=' upi-primary';enable.className+=' upi-enable';qrBox.className+=' upi-latest-test';rows.className+=' upi-table-wrap';
   testRow.append(qrBox,generate);utrLabel.append(utr);utrRow.append(utrLabel,poll);captureTitle.append(el('h3','Captured APK UTRs'),el('p','Recent credit messages from the linked device for this UPI test.'));captureHead.append(captureTitle,fetchUtrs);captured.append(captureHead,rows);
   fallback.append(el('h3','Statement fallback'),el('p','APK SMS missing? Upload this account’s CSV/XLS/XLSX statement (maximum 1 MiB) within the 10-minute test. The exact amount and an unused 12-digit credit UTR must match. Statement-date matching verifies setup only, not financial credit.'),file,upload,statementStatus);
   footer.append(control('Cancel test',async()=>{if(active())await post('onboarding/cancel',{challengeId:challenge.id});close();await reload();}));
   dialog.append(top,apkRow,steps,testRow,utrRow,status,captured,fallback,enable,footer);
   container.append(dialog);dialog.showModal();draw();
   try{await refreshDevice();}catch(e){status.textContent='APK status is unavailable. QR generation stays blocked.';}
   timer=setInterval(async()=>{
    if(closed||!dialog.isConnected||!dialog.open){clearInterval(timer);return;}
    draw();if(busy||Date.now()-lastRefresh<10000)return;busy=true;lastRefresh=Date.now();
    try{await refreshDevice();if(active())await check();}catch(e){status.textContent=root.WPayLocales?.translate(locale,e.message)||e.message;}finally{busy=false;}
   },1000);
   dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  }
  if(page==='upi-analytics'){
   const data=await request('onboarding/analytics');card.append(el('p',t('formula'),'notice'));
   if(!data.banks.length)card.append(el('p','No active-history UPI routes yet. Verified routes started by you and Admin-added routes linked to your account appear here.'));
   const wrap=el('div',undefined,'table-wrap'),table=el('table'),head=el('thead'),tr=el('tr');for(const label of ['UPI ID','Status','Routing',...['total','successful','failed','pending','expired','cancelled','volume','rate'].map(t)])tr.append(el('th',label));head.append(tr);table.append(head);const body=el('tbody');
   for(const b of data.banks){const row=el('tr'),identity=el('td'),status=el('td'),controls=el('td');identity.append(el('strong',b.upi_id),el('br'),el('small',b.adminManaged?'Admin-added':'User-verified','muted'));status.append(el('span','Status: '+(b.routingStatus||b.status),'pill '+(b.routingReadiness?.eligible===true?'ok':'pending')));if(b.routingReadiness?.reasonText)status.append(el('small',b.routingReadiness.reasonText));row.append(identity,status,controls);
    if(data.canUpdate&&b.canStop){const routeButton=button('stop',async()=>{try{await post('business/banks/transition',{bankId:b.id,version:b.version,action:'stop',reason:'Owner stopped receiving route from UPI Analytics'});}finally{await reload();}});routeButton.textContent='Stop';routeButton.className='upi-analytics-route-button route-stop';controls.append(routeButton);}else if(data.canUpdate&&b.canStart){const routeButton=button('run',async()=>{try{await post('business/banks/transition',{bankId:b.id,version:b.version,action:'run',reason:'Owner restarted receiving route from UPI Analytics'});}finally{await reload();}});routeButton.textContent='Start';routeButton.className='upi-analytics-route-button route-start';controls.append(routeButton);}else controls.append(el('span','—'));
    for(const value of [...['total','successful','failed','pending','expired','cancelled'].map(k=>b[k]),money(b.successful_volume_minor),b.successRate===null?'—':b.successRate+'%'])row.append(el('td',String(value)));body.append(row);}table.append(body);wrap.append(table);card.append(wrap);return;
  }
  const data=await request('business/banks');if(!data.banks.length)card.append(el('p',t('empty')));
  if(page==='statements')card.append(el('p',t('notice'),'notice'));
  for(const bank of data.banks){
   const item=el('article',undefined,'business-row');item.append(el('h2',bank.details.upiId));
   facts(item,{'Account holder':bank.details.holderName,'Account':'•••• '+bank.details.accountNumber.slice(-4),'Mobile':'•••• '+bank.details.mobile.slice(-4),'Limit':money(bank.details.bankLimitMinor),'Status':bank.displayStatus||(bank.status==='running'?'Readiness unavailable':bank.status),'Routing reason':bank.routingReadiness?.reasonText||'—','Version':bank.version,[t('statement')]:t(bank.statement_accepted?'accepted':'required')});
   if(bank.verification?.synthetic)item.append(el('p',t('synthetic'),'notice'));
   if(bank.statement)facts(item,{'Last import':new Date(bank.statement.createdAt).toLocaleString(locale),'Import status':t(bank.statement.status)});
   const approved=bank.approved_version===bank.version&&!bank.frozen&&!bank.deactivated;
   if(page==='upi-verification'){
    const actions=el('div',undefined,'upi-routing-actions');
    if(approved&&['approved','verification_pending'].includes(bank.status))actions.append(button('verify',()=>popup(bank)));
    else if(approved&&bank.verified_version===bank.version&&['verified','enabled','stopped','running'].includes(bank.status)){
     const command=bank.status==='running'?'stop':'run';actions.append(button(command,async()=>{await post('business/banks/transition',{bankId:bank.id,version:bank.version,action:command,reason:'Owner requested '+command});await reload();}));
    }else{
     const verify=button('verify',()=>popup(bank));verify.disabled=true;actions.append(verify,el('p',bank.frozen?'Frozen by Admin.':bank.deactivated?'UPI deactivated.':approved?'Admin-managed route; not User-verified.':bank.status==='rejected'?'Rejected by Admin. Edit and resubmit from Bank & UPI.':'Awaiting Admin approval for version '+bank.version+'. If just approved, click Refresh.','notice'));
    }
    item.append(actions);
   }
   if(page==='statements'&&approved){const form=el('form'),label=el('label',t('upload')),input=el('input');input.type='file';input.accept='.csv,.xls,.xlsx';input.required=true;label.append(input);form.append(label);
    const submit=el('button',t('upload'));submit.type='submit';form.append(submit);form.onsubmit=event=>{event.preventDefault();action(async()=>{const file=input.files[0];if(!file||file.size>1048576)throw Error('error.BODY_TOO_LARGE');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));await post('onboarding/upload',{bankId:bank.id,version:bank.version,requestId:crypto.randomUUID(),format:file.name.split('.').at(-1).toLowerCase(),base64:btoa(binary)});await reload();});};item.append(form);}
   card.append(item);
  }
 }
 root.WPayOnboardingPage={render,label};
})(globalThis);
