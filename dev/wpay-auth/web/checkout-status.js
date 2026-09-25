"use strict";
// Hosted gateway presentation only. The original checkout/deeplink handlers
// remain unchanged; the server is authoritative for every displayed status.
(function(){
 const match=/^\/pay\/(WP[a-f0-9]{8})$/.exec(location.pathname);
 const legacy=document.getElementById('verificationState');
 if(!match||!legacy)return;
 const panel=document.createElement('div');panel.className='warn';panel.setAttribute('role','status');panel.id='gatewayPaymentStatus';
 legacy.after(panel);
 let busy=false,terminal=false;
 const finalScreen=document.createElement('section');finalScreen.id='gatewayFinalStatus';finalScreen.hidden=true;finalScreen.setAttribute('role','status');document.body.append(finalScreen);
 const outcome=document.createElement('section');outcome.id='gatewayOutcomeCard';outcome.className='success';outcome.hidden=true;
 const icon=document.createElement('div');icon.className='orb';icon.setAttribute('aria-hidden','true');
 const caption=document.createElement('p');caption.className='gateway-caption';caption.textContent='PAYMENT STATUS';
 const amount=document.createElement('div');amount.className='samount';const amountValue=document.createElement('b'),amountLabel=document.createElement('small');amount.append(amountValue,amountLabel);
 const receipt=document.createElement('div');receipt.className='receipt';const hint=document.createElement('p');hint.className='gateway-hint';
 const actions=document.createElement('div');actions.className='sactions';const save=document.createElement('button');save.type='button';save.textContent='Save payment status';save.onclick=()=>window.print();actions.append(save);
 const powered=document.createElement('div');powered.className='powered';powered.textContent='Powered by WPAY';
 outcome.append(icon,caption,finalScreen,amount,receipt,hint,actions,powered);document.body.append(outcome);
 const detail=(label,value)=>{if(!value)return;const line=document.createElement('div');line.className='r';const name=document.createElement('span'),text=document.createElement('b');name.textContent=label;text.textContent=value;line.append(name,text);receipt.append(line);};
 function renderOutcome(key,data){
  const status=key==='cancelled'?'failed':key;outcome.hidden=false;outcome.classList.add('show');outcome.dataset.status=status;
  icon.innerHTML='<svg viewBox="0 0 24 24">'+(status==='success'?'<path d="m5 12 4 4 10-10"/>':status==='failed'?'<path d="m7 7 10 10M17 7 7 17"/>':'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')+'</svg>';
  amount.hidden=!/^\d+$/.test(String(data.amountMinor));if(!amount.hidden){const n=BigInt(data.amountMinor);amountValue.textContent='₹ '+(n/100n).toLocaleString('en-IN')+'.'+String(n%100n).padStart(2,'0');}
  amountLabel.textContent=status==='success'?'Paid successfully':status==='failed'?'Payment not confirmed':'Payment link expired';
  receipt.replaceChildren();detail('Order reference',data.reference||data.orderId);detail('Status',status==='success'?'Successful':status==='failed'?'Failed':'Expired');
  const at=status==='success'?data.paidAt:status==='expired'?data.expiresAt:null;if(at&&Number.isFinite(Date.parse(at)))detail(status==='success'?'Paid at':'Expired at',new Date(at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})+' IST');
  hint.textContent=status==='success'?'Your payment has been completed.':status==='failed'?'If your account was debited, contact the merchant with your payment reference.':'This link is no longer active. Ask the merchant for a new payment link.';
 }
 const style=document.createElement('style');style.textContent='body.gateway-terminal>*:not(#gatewayFinalStatus){display:none!important}body.gateway-terminal{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 18px;box-sizing:border-box;background:#07182d;color:#fff}body.gateway-terminal>#gatewayOutcomeCard{display:flex!important}#gatewayOutcomeCard{width:min(100%,480px);min-height:660px;box-sizing:border-box;margin:0 auto;padding:32px 28px;border-radius:28px}#gatewayFinalStatus{font:700 36px/1.1 system-ui,sans-serif;margin:0;color:#53efb9}#gatewayOutcomeCard .gateway-caption{font:700 11px system-ui,sans-serif;letter-spacing:2px;color:#b5c2d3;margin:4px 0 10px}#gatewayOutcomeCard .gateway-hint{font:400 13px/1.65 system-ui,sans-serif;color:#b5c2d3;margin:18px 0 0}#gatewayOutcomeCard[data-status="failed"]{background:radial-gradient(circle at 50% 17%,#a5434b44,transparent 34%),linear-gradient(180deg,#342333,#07182d);border-color:#f27e8588}#gatewayOutcomeCard[data-status="failed"] .orb{background:radial-gradient(circle at 35% 30%,#ffb4a5,#e26b77 52%,#873d52);border-color:#ffa6a8;box-shadow:0 0 0 18px #f17d8712,0 0 50px #e26b7744,inset 0 0 25px #fff4}#gatewayOutcomeCard[data-status="failed"] #gatewayFinalStatus{color:#ffa6a8}#gatewayOutcomeCard[data-status="expired"]{background:radial-gradient(circle at 50% 17%,#a8793644,transparent 34%),linear-gradient(180deg,#35302c,#07182d);border-color:#e2b77388}#gatewayOutcomeCard[data-status="expired"] .orb{background:radial-gradient(circle at 35% 30%,#ffe4aa,#d9ad66 52%,#85622d);border-color:#ffe0a0;box-shadow:0 0 0 18px #e2b77312,0 0 50px #d9ad6644,inset 0 0 25px #fff4}#gatewayOutcomeCard[data-status="expired"] #gatewayFinalStatus{color:#ffe0a0}@media(max-width:520px){body.gateway-terminal{padding:18px 12px}#gatewayOutcomeCard{min-height:0;padding:30px 22px;border-radius:24px}#gatewayOutcomeCard .orb{width:140px;height:140px}#gatewayFinalStatus{font-size:32px}}@media print{body.gateway-terminal{background:#fff;color:#111}body.gateway-terminal>#gatewayOutcomeCard{min-height:0;box-shadow:none;background:#fff;color:#111}#gatewayOutcomeCard .orb,#gatewayOutcomeCard .sactions{display:none}#gatewayOutcomeCard .receipt,#gatewayOutcomeCard .samount{background:#fff;color:#111}}';document.head.append(style);
 const states={pending_payment:['Pending','Complete the payment and submit its UTR.'],pending:['Pending','UTR received. Bank confirmation is pending.'],failed:['Failed','The payment could not be verified. If money was debited, contact support with your UTR.'],expired:['Expired','No UTR was submitted before this payment link expired.'],success:['Successful','Payment independently verified.'],cancelled:['Cancelled','This payment was cancelled.']};
 async function update(){
  if(busy||document.hidden)return;busy=true;
  try{
   const response=await fetch('/api/payments/'+match[1]+'/verification-status',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('Status unavailable');const data=await response.json();
   const key=data.status==='success'&&data.verified!==true&&data.approved!==true?'pending':data.status;
   const state=states[key];if(!state)throw Error('Status unavailable');
   legacy.hidden=true;
   panel.textContent=state[0]+' — '+state[1];panel.className='warn '+(key==='success'?'ok':['failed','expired','cancelled'].includes(key)?'err':'pending');
   if(['failed','expired','success','cancelled'].includes(key)){
    terminal=true;renderOutcome(key,data);finalScreen.textContent=key==='cancelled'?'Failed':state[0];finalScreen.dataset.status=key==='cancelled'?'failed':key;finalScreen.hidden=false;document.body.classList.add('gateway-terminal');document.title=finalScreen.textContent+' · WPay';
   }
   // Hide the legacy expiry label once it no longer describes the order.
   const timer=document.getElementById('timer');if(timer?.parentElement)timer.parentElement.hidden=key!=='pending_payment';
   if(['failed','expired','cancelled','success'].includes(key))for(const node of document.querySelectorAll('.method,#openSelected,#submitUtr,#pasteUtr,#utrInput'))node.disabled=true;
  }catch{if(!terminal)panel.textContent='Unable to refresh payment status. Retrying…';}
  finally{busy=false;}
 }
 update();setInterval(update,3000);document.addEventListener('visibilitychange',update);
})();
