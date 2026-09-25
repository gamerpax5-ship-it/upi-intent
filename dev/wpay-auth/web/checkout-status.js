"use strict";
// Hosted gateway presentation only. The original checkout/deeplink handlers
// remain unchanged; the server is authoritative for every displayed status.
(function(){
 const match=/^\/pay\/(WP[a-f0-9]{8})$/.exec(location.pathname);
 const legacy=document.getElementById('verificationState');
 if(!match||!legacy)return;
 const panel=document.createElement('div');panel.className='warn';panel.setAttribute('role','status');panel.id='gatewayPaymentStatus';
 legacy.after(panel);
 let busy=false;
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
   // Hide the legacy expiry label once it no longer describes the order.
   const timer=document.getElementById('timer');if(timer?.parentElement)timer.parentElement.hidden=key!=='pending_payment';
   if(['failed','expired','cancelled','success'].includes(key))for(const node of document.querySelectorAll('.method,#openSelected,#submitUtr,#pasteUtr,#utrInput'))node.disabled=true;
  }catch{panel.textContent='Unable to refresh payment status. Retrying…';}
  finally{busy=false;}
 }
 update();setInterval(update,3000);document.addEventListener('visibilitychange',update);
})();
