"use strict";
(function(root){
 const names={'upi-verification':['UPI Verification','Проверка UPI','UPI 验证'],statements:['Statements','Выписки','银行流水'],'upi-analytics':['UPI Analytics','Аналитика UPI','UPI 分析']};
 const words={verify:['Verify','Проверить','验证'],enable:['Enable','Включить','启用'],run:['Start','Запустить','开始'],stop:['Stop','Остановить','停止'],cancel:['Cancel','Отменить','取消'],close:['Close','Закрыть','关闭'],upload:['Upload statement','Загрузить выписку','上传流水'],waiting:['Waiting for verified payment evidence','Ожидание подтверждённых данных о платеже','等待经过验证的付款凭证'],verified:['Verified','Проверено','已验证'],statement:['Accepted statement','Принятая выписка','已接受的流水'],required:['Required for this bank version','Требуется для этой версии счёта','此账户版本必须提供'],accepted:['Accepted','Принято','已接受'],rejected:['Rejected','Отклонено','已拒绝'],notice:['Upload a CSV, XLS or XLSX statement, up to 1 MiB. Acceptance completes onboarding only; it does not credit payments or confirm bank ownership.','Загрузите CSV, XLS или XLSX до 1 МиБ. Принятие завершает только подготовку; платежи не зачисляются, владение счётом не подтверждается.','上传 CSV、XLS 或 XLSX，最大 1 MiB。接受仅完成开户准备，不记入付款，也不确认银行账户归属。'],synthetic:['SYNTHETIC TEST — do not make a real payment','СИНТЕТИЧЕСКИЙ ТЕСТ — не выполняйте реальный платёж','模拟测试 — 请勿实际付款'],empty:['No bank submissions','Нет заявок на банковские счета','暂无银行账户申请'],total:['Total orders','Всего заказов','订单总数'],successful:['Successful','Успешно','成功'],failed:['Failed','Неуспешно','失败'],pending:['Pending','Ожидают','待处理'],expired:['Expired','Истекли','已过期'],cancelled:['Cancelled / released','Отменены / освобождены','已取消／已释放'],volume:['Successful volume','Успешный объём','成功金额'],rate:['Success rate','Доля успешных','成功率'],formula:['Successful ÷ (successful + failed). Pending, expired and cancelled/released orders are excluded. No completed orders: rate unavailable.','Успешные ÷ (успешные + неуспешные). Ожидающие, истёкшие и отменённые исключены. Без завершённых заказов доля недоступна.','成功 ÷（成功 + 失败）。排除待处理、过期及取消／释放的订单。没有已完成订单时不显示成功率。']};
 const text=(locale,key)=>(words[key]||names[key]||[key,key,key])[['en','ru','zh-CN'].indexOf(locale)]||key;
 const label=(locale,destination)=>text(locale,destination.replace('user.onboarding-',''));
 const money=value=>'₹'+(BigInt(value)/100n)+'.'+(BigInt(value)%100n).toString().padStart(2,'0');
 async function render(args){
  const {destination,locale,request,post,action,el,container,title}=args,t=k=>text(locale,k),page=destination.replace('user.onboarding-','');
  title.textContent=label(locale,destination);container.replaceChildren();const card=el('section',undefined,'card business-card');container.append(card);
  const button=(key,fn)=>{const b=el('button',t(key));b.type='button';b.onclick=()=>action(fn);return b;};
  const facts=(node,data)=>{const dl=el('dl',undefined,'facts');for(const [key,value]of Object.entries(data))dl.append(el('dt',key),el('dd',String(value)));node.append(dl);};
  const reload=()=>render(args);
  async function popup(bank){
   let challenge=null,deviceState={ready:false,status:'checking',devices:[]},busy=false,closed=false,timer,lastRefresh=0;
   const requestId=crypto.randomUUID(),dialog=el('dialog',undefined,'upi-challenge'),status=el('p','','notice'),apk=el('p','Checking linked APK…','notice'),count=el('strong','Test duration: 10 minutes from QR generation'),qrBox=el('section',undefined,'card'),rows=el('div'),statementStatus=el('p');
   Object.assign(dialog.style,{width:'min(940px,94vw)',maxWidth:'calc(100vw - 24px)',maxHeight:'92vh',overflow:'auto',padding:'24px',borderRadius:'20px',textAlign:'left',background:'var(--panel, #211019)',color:'var(--text, #f4e7ed)',border:'1px solid var(--line2, #4b2d3a)'});dialog.setAttribute('aria-label','Verify UPI');
   status.setAttribute('role','status');apk.setAttribute('role','status');
   const control=(label,fn)=>{const b=el('button',label,'btn');b.type='button';b.onclick=()=>action(async()=>{try{await fn();}catch(e){status.textContent=root.WPayLocales?.translate(locale,e.message)||e.message;throw e;}});return b;};
   const active=()=>challenge?.status==='waiting'&&Date.parse(challenge.expiresAt)>Date.now();
   const close=()=>{closed=true;clearInterval(timer);dialog.close();dialog.remove();};
   const draw=()=>{
    const live=active();generate.disabled=!deviceState.ready||!!challenge;
    poll.disabled=!live;upload.disabled=!live;file.disabled=!live;fetchUtrs.disabled=!live;
    enable.disabled=challenge?.status!=='verified';
    if(!challenge){count.textContent='Test duration: 10 minutes from QR generation';qrBox.replaceChildren(el('p','Bring the APK for this UPI’s registered mobile online, then generate the test QR.'));return;}
    const seconds=Math.max(0,Math.ceil((Date.parse(challenge.expiresAt)-Date.now())/1000));count.textContent=challenge.status==='verified'?'Verified':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' remaining';
    qrBox.replaceChildren();
    if(challenge.synthetic)qrBox.append(el('p',t('synthetic'),'notice'));
    qrBox.append(el('h3','Pay exactly INR '+money(challenge.amountMinor).slice(1)),el('p',bank.details.upiId));qrBox.style.textAlign='center';
    if(live&&deviceState.ready){const image=el('img');image.src=challenge.qr;image.alt='UPI test payment QR';image.width=image.height=256;image.style.maxWidth='100%';qrBox.append(image);}
    else qrBox.append(el('p',challenge.status==='verified'?'Payment verified.':!seconds?'Test expired. Do not pay this QR. Close and start a new test.':'QR hidden while the matching APK is offline.'));
    qrBox.append(el('p','Expires: '+new Date(challenge.expiresAt).toLocaleString()));
   };
   const refreshDevice=async()=>{
    try{deviceState=await post('onboarding/device-status',{bankId:bank.id,version:bank.version});}
    catch(e){deviceState={ready:false,status:'unavailable',devices:[]};throw e;}
    finally{if(!closed){apk.textContent='APK status: '+deviceState.status+' · registered mobile '+bank.details.mobile+(deviceState.ready?' · online and linked to your account':' · open WPay Agent on the matching phone and keep it connected');draw();}}
   };
   const check=async()=>{if(!active())return draw();challenge=await post('onboarding/poll',{challengeId:challenge.id});status.textContent=(challenge.message||challenge.status)+(challenge.verificationMethod?' · '+challenge.verificationMethod:'');draw();};
   const generate=control('Generate Test QR',async()=>{
    if(challenge)return;await refreshDevice();if(!deviceState.ready)return;
    challenge=await post('onboarding/create',{bankId:bank.id,version:bank.version,requestId});status.textContent=challenge.message||challenge.status;draw();
   }),poll=control('Check status',check),fetchUtrs=control('Fetch captured APK UTRs',async()=>{
    if(!active())return;await refreshDevice();rows.replaceChildren();
    const devices=deviceState.devices||[];
    for(const device of devices){
     const result=await post('operations/device-setup/utrs',{device:device.device});
     const relevant=(result.records||[]).filter(r=>{
      const at=Date.parse(r.capturedAt),amount=String(r.amount||'');
      if(!/^\d+(\.\d{1,2})?$/.test(amount))return false;
      const [whole,fraction='']=amount.split('.');
      return r.status==='CREDIT_RECEIVED'&&!r.historical&&BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))===BigInt(challenge.amountMinor)&&at>=Date.parse(challenge.createdAt)&&at<Date.parse(challenge.expiresAt)&&at<=Date.now()&&/^\d{12}$/.test(r.utr);
     });
     for(const r of relevant){const item=el('p',r.utr+' · INR '+r.amount+' · '+new Date(r.capturedAt).toLocaleString()+' · Exact amount received; checking reuse and device binding');rows.append(item);}
    }
    if(!rows.children.length)rows.append(el('p','No exact-amount UTR candidate in this test window. You can upload a statement below.'));await check();
   }),enable=control('Enable verified UPI',async()=>{
    if(challenge?.status!=='verified')return;
    await post('business/banks/transition',{bankId:bank.id,version:bank.version,action:'enable',reason:'Owner enabled verified UPI'});close();await reload();
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
   dialog.append(el('h2','Verify UPI'),apk,control('Refresh APK status',refreshDevice),count,
    el('p','1. Connect the matching APK. 2. Generate the QR. 3. Pay the exact test amount. 4. Let the APK capture the credit UTR, or upload your statement. 5. Enable after the UTR and amount match.'),
    qrBox,generate,poll,status,el('h3','Captured APK UTRs'),fetchUtrs,rows,
    el('h3','Statement fallback'),el('p','SMS missing? Upload this account’s CSV/XLS/XLSX statement (maximum 1 MiB) before the timer ends. It must contain today’s credit with the exact test amount and an unused 12-digit UTR. Date-only statements are checked by transaction date and upload time, not bank posting time. This verifies UPI setup only; it does not credit your balance.'),file,upload,statementStatus,enable,
    control('Cancel test',async()=>{if(active())await post('onboarding/cancel',{challengeId:challenge.id});close();await reload();}),control('Close',close));
   for(const b of [generate,poll,fetchUtrs,upload,enable]){b.style.margin='8px';}
   enable.style.width='calc(100% - 16px)';enable.style.minHeight='44px';file.style.maxWidth='100%';
   for(const node of [qrBox,rows,statementStatus,apk]){node.style.marginBlock='16px';node.style.overflowWrap='anywhere';}
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
   if(!data.banks.length)card.append(el('p',t('empty')));
   const wrap=el('div',undefined,'table-wrap'),table=el('table'),head=el('thead'),tr=el('tr');for(const label of ['UPI ID',...['total','successful','failed','pending','expired','cancelled','volume','rate'].map(t)])tr.append(el('th',label));head.append(tr);table.append(head);const body=el('tbody');
   for(const b of data.banks){const row=el('tr');for(const value of [b.upi_id,...['total','successful','failed','pending','expired','cancelled'].map(k=>b[k]),money(b.successful_volume_minor),b.successRate===null?'—':b.successRate+'%'])row.append(el('td',String(value)));body.append(row);}table.append(body);wrap.append(table);card.append(wrap);return;
  }
  const data=await request('business/banks');if(!data.banks.length)card.append(el('p',t('empty')));
  if(page==='statements')card.append(el('p',t('notice'),'notice'));
  for(const bank of data.banks){
   const item=el('article',undefined,'business-row');item.append(el('h2',bank.details.upiId));
   facts(item,{'Account holder':bank.details.holderName,'Account':'•••• '+bank.details.accountNumber.slice(-4),'Mobile':'•••• '+bank.details.mobile.slice(-4),'Limit':money(bank.details.bankLimitMinor),'Status':bank.frozen?'frozen':bank.status,'Version':bank.version,[t('statement')]:t(bank.statement_accepted?'accepted':'required')});
   if(bank.verification?.synthetic)item.append(el('p',t('synthetic'),'notice'));
   if(bank.statement)facts(item,{'Last import':new Date(bank.statement.createdAt).toLocaleString(locale),'Import status':t(bank.statement.status)});
   const approved=bank.approved_version===bank.version&&!bank.frozen&&!bank.deactivated;
   if(page==='upi-verification'&&approved){
    if(['approved','verification_pending'].includes(bank.status))item.append(button('verify',()=>popup(bank)));
    for(const command of [...(bank.status==='verified'?['enable']:[]),...(['enabled','stopped'].includes(bank.status)?['run']:[]),...(bank.status==='running'?['stop']:[])])item.append(button(command,async()=>{await post('business/banks/transition',{bankId:bank.id,version:bank.version,action:command,reason:'Owner requested '+command});await reload();}));
   }
   if(page==='statements'&&approved){const form=el('form'),label=el('label',t('upload')),input=el('input');input.type='file';input.accept='.csv,.xls,.xlsx';input.required=true;label.append(input);form.append(label);
    const submit=el('button',t('upload'));submit.type='submit';form.append(submit);form.onsubmit=event=>{event.preventDefault();action(async()=>{const file=input.files[0];if(!file||file.size>1048576)throw Error('error.BODY_TOO_LARGE');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));await post('onboarding/upload',{bankId:bank.id,version:bank.version,requestId:crypto.randomUUID(),format:file.name.split('.').at(-1).toLowerCase(),base64:btoa(binary)});await reload();});};item.append(form);}
   card.append(item);
  }
 }
 root.WPayOnboardingPage={render,label};
})(globalThis);
