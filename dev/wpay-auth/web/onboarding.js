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
   let challenge=await post('onboarding/create',{bankId:bank.id,version:bank.version,requestId:crypto.randomUUID()});
   if(challenge.status!=='waiting')return reload();
   const dialog=el('dialog',undefined,'upi-challenge'),heading=el('h2',t('verify')),status=el('p',t('waiting'),'notice'),count=el('p');status.setAttribute('role','status');
   if(challenge.synthetic)dialog.append(el('p',t('synthetic'),'notice'));
   const image=el('img');image.src=challenge.qr;image.alt='UPI payment QR';image.width=image.height=256;
   dialog.append(heading,el('p',bank.details.upiId),el('h2',money(challenge.amountMinor)),image,count,status);
   const close=()=>{clearInterval(timer);dialog.close();dialog.remove();};
   dialog.append(button('cancel',async()=>{await post('onboarding/cancel',{challengeId:challenge.id});close();await reload();}),button('close',async()=>close()));
   container.append(dialog);dialog.showModal();let polling=false,lastPoll=0;
   const timer=setInterval(async()=>{
    if(!dialog.isConnected||!dialog.open){clearInterval(timer);return;}
    const seconds=Math.max(0,Math.ceil((+new Date(challenge.expiresAt)-Date.now())/1000));count.textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
    if(polling||Date.now()-lastPoll<5000)return;polling=true;lastPoll=Date.now();
    try{challenge=await post('onboarding/poll',{challengeId:challenge.id});if(challenge.status==='verified'){close();await reload();}else if(challenge.status!=='waiting'){status.textContent=t(challenge.status);image.remove();clearInterval(timer);}}
    catch(error){status.textContent=root.WPayLocales.translate(locale,error.message);image.remove();clearInterval(timer);}
    finally{polling=false;}
   },1000);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  }
  if(page==='upi-analytics'){
   const data=await request('onboarding/analytics');card.append(el('p',t('formula'),'notice'));
   if(!data.banks.length)card.append(el('p',t('empty')));
   for(const b of data.banks){const item=el('article',undefined,'business-row');item.append(el('h2',b.upi_id));facts(item,Object.fromEntries(['total','successful','failed','pending','expired','cancelled'].map(key=>[t(key),b[key]])));facts(item,{[t('volume')]:money(b.successful_volume_minor),[t('rate')]:b.successRate===null?'—':b.successRate+'%'});card.append(item);}return;
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
