"use strict";
(function(root){
 const money=n=>{const b=BigInt(n||'0'),s=b.toString().padStart(3,'0');return s.slice(0,-2)+'.'+s.slice(-2);};
 async function file(input){const f=input.files[0];if(!f||f.size>1048576)throw new Error('error.INVALID_INPUT');const bytes=new Uint8Array(await f.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return {name:f.name,data:btoa(raw)};}
 function download(name,data){const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function render(args){
  const {destination,account,request,post,action,el,container,title}=args,page=destination.split('.').at(-1);
  title.textContent=page==='beneficiaries'?'Parking Beneficiaries':page==='orders'?'Parking Orders':'Parking';
  container.replaceChildren();const card=el('section',undefined,'card business-card');container.append(card);
  const button=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=()=>action(fn);return b;};
  const field=(form,label,type='text',required=true)=>{const l=el('label',label),n=el('input');n.type=type;n.required=required;n.setAttribute('aria-label',label);l.append(n);form.append(l);return n;};
  const submit=(form,label,fn)=>{const b=el('button',label);b.type='submit';form.append(b);form.onsubmit=e=>{e.preventDefault();action(fn);};};
  const facts=(host,values)=>{const d=el('dl',undefined,'facts');for(const [k,v] of Object.entries(values))d.append(el('dt',k),el('dd',String(v??'—')));host.append(d);};

  if(page==='beneficiaries'){
   const data=await request('parking/beneficiaries');card.append(el('p','Beneficiaries are created by Admin or an authorized Employee. Add the exact beneficiary in your banking app, then confirm “I added”.','notice'));
   for(const b of data.rows){const row=el('article',undefined,'business-row');facts(row,{Name:b.details.beneficiaryName,Bank:b.details.bankName,Account:b.details.accountNumber,IFSC:b.details.ifsc,UPI:b.details.upiId||'—'});row.append(el('p',b.confirmed?'I added · confirmed':'Not confirmed'));if(!b.confirmed)row.append(button('I added this beneficiary',async()=>{await post('parking/beneficiary/confirm',{id:b.id});await render(args);}));card.append(row);}if(!data.rows.length)card.append(el('p','No Parking beneficiaries are available.'));return;
  }

  if(page==='orders'){
   const data=await request('parking/orders');card.append(el('p','Only orders matching beneficiaries you confirmed are visible. A partial lock is exclusive for 10 minutes; expiry/release keeps that amount hidden for a 5-minute cooldown.','notice'));
   const available=el('div');card.append(el('h2','Available Parking Orders'),available);
   for(const o of data.orders){const row=el('article',undefined,'business-row'),form=el('form'),amount=field(form,'Amount to lock (INR)');amount.value=money(o.minMinor);amount.inputMode='decimal';
    facts(row,{Reference:o.reference,Beneficiary:o.beneficiary.beneficiaryName,Bank:o.beneficiary.bankName,Account:o.beneficiary.accountNumber,IFSC:o.beneficiary.ifsc,'Total INR':money(o.totalMinor),'Remaining INR':money(o.remainingMinor),'Minimum INR':money(o.minMinor)});
    submit(form,'Lock amount · 10 minutes',async()=>{const [whole,fraction='']=amount.value.split('.');const minor=(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))).toString();await post('parking/lock',{requestId:crypto.randomUUID(),orderId:o.id,amountMinor:minor});await render(args);});row.append(form);available.append(row);
   }
   if(!data.orders.length)available.append(el('p','No eligible Parking orders.'));
   card.append(el('h2','My Parking Payments'));
   for(const h of data.history){const row=el('article',undefined,'business-row');facts(row,{Reference:h.reference,Amount:'INR '+money(h.amountMinor),State:h.state,Beneficiary:h.beneficiary.beneficiaryName,Bank:h.beneficiary.bankName,Account:h.beneficiary.accountNumber,IFSC:h.beneficiary.ifsc,Expires:h.expiresAt,Cooldown:h.cooldownUntil||'—',Scan:h.scanState||'—'});
    if(h.state==='active'){const form=el('form'),utr=field(form,'12-digit UTR'),proof=field(form,'Payment proof','file'),note=field(form,'Note','text',false);proof.accept='.pdf,.png,.jpg,.jpeg';submit(form,'I paid · Send to review',async()=>{await post('parking/submit',{id:h.id,utr:utr.value,proof:await file(proof),note:note.value});await render(args);});row.append(form,button('Release lock',async()=>{await post('parking/release',{id:h.id});await render(args);}));}
    card.append(row);
   }return;
  }

  if(page==='admin'){
   const data=await request('parking/admin');card.append(el('p','Create tenant-scoped Parking beneficiaries and orders. User payment completion restores capacity only after accepted review evidence.','notice'));
   const beneficiaryForm=el('form'),tenant=field(beneficiaryForm,'Tenant ID'),name=field(beneficiaryForm,'Beneficiary name'),bank=field(beneficiaryForm,'Bank name'),accountNumber=field(beneficiaryForm,'Account number'),ifsc=field(beneficiaryForm,'IFSC'),upi=field(beneficiaryForm,'UPI ID','text',false);
   submit(beneficiaryForm,'Create beneficiary',async()=>{await post('parking/beneficiary/create',{requestId:crypto.randomUUID(),tenantId:tenant.value,beneficiaryName:name.value,bankName:bank.value,accountNumber:accountNumber.value,ifsc:ifsc.value.toUpperCase(),upiId:upi.value});await render(args);});
   card.append(el('h2','Create Parking Beneficiary'),beneficiaryForm);

   const orderForm=el('form'),otenant=field(orderForm,'Tenant ID'),beneficiary=field(orderForm,'Beneficiary ID'),reference=field(orderForm,'Reference'),total=field(orderForm,'Total amount INR'),min=field(orderForm,'Minimum per transaction INR');
   const minor=value=>{if(!/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value))throw new Error('error.INVALID_INPUT');const [w,f='']=value.split('.');return (BigInt(w)*100n+BigInt(f.padEnd(2,'0'))).toString();};
   submit(orderForm,'Create Parking Order',async()=>{await post('parking/order/create',{requestId:crypto.randomUUID(),tenantId:otenant.value,beneficiaryId:beneficiary.value,reference:reference.value,totalMinor:minor(total.value),minMinor:minor(min.value)});await render(args);});
   card.append(el('h2','Create Parking Order'),orderForm,el('h2','Beneficiaries'));
   for(const b of data.beneficiaries){const row=el('article',undefined,'business-row');facts(row,{ID:b.id,Tenant:b.tenantId,Name:b.details.beneficiaryName,Bank:b.details.bankName,Account:b.details.accountNumber,IFSC:b.details.ifsc});card.append(row);}
   card.append(el('h2','Orders'));for(const o of data.orders){const row=el('article',undefined,'business-row');facts(row,{ID:o.id,Tenant:o.tenantId,Reference:o.reference,Total:'INR '+money(o.totalMinor),Minimum:'INR '+money(o.minMinor),State:o.state});card.append(row);}
   card.append(el('h2','Review Queue'));for(const r of data.reviews){const row=el('article',undefined,'business-row'),form=el('form'),reason=field(form,'Reason');facts(row,{ID:r.id,Order:r.orderId,Reference:r.reference,User:r.userName,Amount:'INR '+money(r.amountMinor),State:r.state,Scan:r.scanState||'unscanned'});
    row.append(button('Download proof',async()=>{const p=await post('parking/proof',{id:r.id});download(p.name,p.data);}));
    const act=async chosen=>{await post('parking/review',{id:r.id,action:chosen,reason:reason.value});await render(args);};form.append(button('Review',()=>act('review')),button('Approve paid',()=>act('approve')),button('Dispute',()=>act('dispute')),button('Not paid',()=>act('not_paid')));row.append(form);card.append(row);}return;
  }
  throw new Error('error.NOT_FOUND');
 }
 root.WPayParkingPage={render};
})(globalThis);