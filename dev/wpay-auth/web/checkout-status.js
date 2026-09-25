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
 const style=document.createElement('style');style.textContent='body.gateway-terminal>*:not(#gatewayFinalStatus){display:none!important}body.gateway-terminal{margin:0;min-height:100vh;display:grid;place-items:center;background:#071b13;color:#f4efd9}#gatewayFinalStatus{padding:32px;text-align:center;font:700 clamp(32px,8vw,64px) system-ui,sans-serif}#gatewayFinalStatus[data-status="failed"],#gatewayFinalStatus[data-status="expired"]{color:#efb0a7}';document.head.append(style);
 const states={pending_payment:['Pending','Complete the payment and submit its UTR.'],pending:['Pending','UTR received. Bank confirmation is pending.'],failed:['Failed','The payment could not be verified. If money was debited, contact support with your UTR.'],expired:['Expired','No UTR was submitted before this payment link expired.'],success:['Successful','Payment independently verified.'],cancelled:['Cancelled','This payment was cancelled.']};
 async function update(){
  if(busy||document.hidden)return;busy=true;
  try{
   const response=await fetch('/api/payments/'+match[1]+'/verification-status',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('Status unavailable');const data=await response.json();
   const key=data.status==='success'&&data.verified!==true?'pending':data.status;
   const state=states[key];if(!state)throw Error('Status unavailable');
   legacy.hidden=true;
   panel.textContent=state[0]+' — '+state[1];panel.className='warn '+(key==='success'?'ok':['failed','expired','cancelled'].includes(key)?'err':'pending');
   if(['failed','expired','success','cancelled'].includes(key)){
    terminal=true;finalScreen.textContent=key==='cancelled'?'Failed':state[0];finalScreen.dataset.status=key==='cancelled'?'failed':key;finalScreen.hidden=false;document.body.classList.add('gateway-terminal');document.title=finalScreen.textContent+' · WPay';
   }
   // Hide the legacy expiry label once it no longer describes the order.
   const timer=document.getElementById('timer');if(timer?.parentElement)timer.parentElement.hidden=key!=='pending_payment';
   if(['failed','expired','cancelled','success'].includes(key))for(const node of document.querySelectorAll('.method,#openSelected,#submitUtr,#pasteUtr,#utrInput'))node.disabled=true;
  }catch{if(!terminal)panel.textContent='Unable to refresh payment status. Retrying…';}
  finally{busy=false;}
 }
 update();setInterval(update,3000);document.addEventListener('visibilitychange',update);
})();
