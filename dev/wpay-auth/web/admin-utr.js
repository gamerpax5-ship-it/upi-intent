'use strict';
(function(root){
 let generation=0;
 const money=v=>{const n=BigInt(v);return '₹'+(n/100n).toLocaleString('en-IN')+'.'+String(n%100n).padStart(2,'0');};
 async function render(o,state={}){
  const current=++generation;
  const {post,action,el,container,title,destination}=o,pending=destination==='operations.pending-utrs';
  title.textContent=pending?'Pending UTR':'UTR Center';
  const card=el('section',undefined,'card admin-panel');container.replaceChildren(card);
  const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=()=>action(fn);return b;};
  const reload=next=>render(o,next||state);
  const table=(headers,rows)=>{const wrap=el('div',undefined,'table-wrap'),table=el('table',undefined,'admin-table'),head=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th',h)));head.append(tr);table.append(head);const body=el('tbody');for(const values of rows){const line=el('tr');for(const value of values){const cell=el('td');if(value?.nodeType)cell.append(value);else cell.textContent=String(value??'—');line.append(cell);}body.append(line);}table.append(body);wrap.append(table);card.append(wrap);};
  const toolbar=el('div',undefined,'admin-toolbar');toolbar.append(button('Refresh',()=>reload()));card.append(toolbar);
  if(pending){
   const data=await post('operations/utr/pending',{status:'pending',offset:state.offset||0});
   card.append(el('p','Only unmatched, undecided UTR claims appear here. Verify the receipt details before manual approval. Approve settles the payment without SMS or statement evidence; Reject closes it as Failed.','notice'));
   const review=(r,mode)=>{
    const dialog=el('dialog'),form=el('form'),label=el('label','Review reason'),reason=el('textarea');reason.required=true;reason.minLength=3;reason.maxLength=500;label.append(reason);form.append(label);
    dialog.append(el('h2',mode==='approve'?'Approve payment':'Reject payment'),el('p',r.utr+' · '+r.reference+' · '+money(r.amountMinor)),form);
    if(mode==='approve')form.append(el('p','This posts the payment amount and configured fees to the ledger. It is recorded as Admin approved, not bank verified.','notice'));
    if(mode==='reject')form.append(el('p','This rejects the payment and all of its submitted UTR claims.','notice'));
    const submit=el('button',mode==='approve'?'Confirm approval':'Confirm rejection');submit.type='submit';form.append(submit,button('Cancel',()=>dialog.close()));
    form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;action(async()=>{submit.disabled=true;try{const result=await post('operations/utr/decision',{claimId:r.claimId,action:mode,reason:reason.value});dialog.close();await reload();const message=el('p',result.message||(result.status==='successful'?'Verified — payment Successful.':'Rejected — payment Failed.'),'notice');message.setAttribute('role','status');container.prepend(message);}finally{submit.disabled=false;}});};
    dialog.onclose=()=>dialog.remove();card.append(dialog);dialog.showModal();
   };
   table(['Submitted','UTR','Reference / order','Merchant','User','Amount','Payment status','Review status','Actions'],data.records.map(r=>{const actions=el('div',undefined,'admin-row-actions');if(r.canApprove)actions.append(button('Approve',async()=>review(r,'approve')));if(r.canReview)actions.append(button('Reject',async()=>review(r,'reject')));return [new Date(r.submittedAt).toLocaleString('en-IN'),r.utr,r.reference+' / '+r.orderId,r.merchant,r.user,money(r.amountMinor),r.paymentStatus,r.status,actions];}));
   if(!data.records.length)card.append(el('p','No unmatched UTRs awaiting a decision.','admin-empty'));
   const pager=el('div',undefined,'admin-pagination');if(data.offset)pager.append(button('Previous',()=>reload({...state,offset:Math.max(0,data.offset-50)})));if(data.hasMore)pager.append(button('Next',()=>reload({...state,offset:data.offset+50})));card.append(pager);
   if(typeof setTimeout==='function'){const poll=async()=>{if(current!==generation||!card.isConnected)return;if(card.querySelector('dialog')||document.hidden){setTimeout(poll,10000);return;}try{await reload();}catch{if(current===generation)setTimeout(poll,10000);}};setTimeout(poll,10000);}
   return;
  }
  card.append(el('p','Captured UTRs from SMS devices and statement imports only. Source status is shown as reported; customer claims are on Pending UTR.','notice'));
  const sources=await post('operations/utr-source',state.afterSource?{afterLink:state.afterSource}:{});
  if(!sources.links.length){card.append(el('p','No authorized SMS device or statement sources are linked.','admin-empty'));return;}
  const label=el('label','Captured source '),select=el('select');for(const s of sources.links){const option=el('option',(s.source==='device'?'SMS':'Statement')+' · '+s.ownerId+' · '+s.bankReference);option.value=s.id;select.append(option);}const source=sources.links.find(s=>s.id===state.linkId)||sources.links[0];select.value=source.id;select.onchange=()=>action(()=>reload({...state,linkId:select.value,before:null}));label.append(select);toolbar.prepend(label);
  const data=await post('operations/utr-source',{linkId:source.id,...(state.before?{before:state.before}:{})});
  table(['Captured at','UTR','Amount (INR)','Source','User','Bank','Source status'],data.observations.map(r=>[r.capturedAt,r.utr,r.amount,r.source==='transactions'?'SMS':'Statement',r.userId,r.bankReference,r.sourceStatus||'captured']));
  if(!data.observations.length)card.append(el('p','No captured UTRs for this source.','admin-empty'));
  const pager=el('div',undefined,'admin-pagination');if(state.before)pager.append(button('Newest',()=>reload({...state,before:null})));if(data.nextCursor)pager.append(button('Older UTRs',()=>reload({...state,linkId:source.id,before:data.nextCursor})));if(sources.afterLink)pager.append(button('More sources',()=>reload({afterSource:sources.afterLink})));if(state.afterSource)pager.append(button('First sources',()=>reload({})));card.append(pager);
 }
 root.WPayAdminUtr={render};
})(globalThis);
