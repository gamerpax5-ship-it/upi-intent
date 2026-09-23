'use strict';
(function(root){
 const amount=s=>{const n=BigInt(s||'0'),a=n<0n?-n:n;return (n<0n?'−':'')+'₹'+(a/100n).toLocaleString('en-IN')+'.'+String(a%100n).padStart(2,'0');};
 const usdt=s=>{const n=BigInt(s||'0');return (n/1000000n).toLocaleString('en-IN')+'.'+String(n%1000000n).padStart(6,'0')+' USDT';};
 async function render(o,state={offset:0}){
  const {page,post,action,el,container,title}=o,mode=page.destinationId.split('.')[1];title.textContent=page.label;container.replaceChildren(el('p','Loading…','admin-empty'));
  const data=await post(mode==='audit'?'panel/admin-audit':'panel/admin-finance',state);container.replaceChildren();
  const button=(label,fn,cls='')=>{const b=el('button',label,cls);b.type='button';b.onclick=()=>action(fn);return b;};
  const field=(form,label,value='',type='text')=>{const l=el('label',label),i=el('input');i.type=type;i.value=value;i.required=true;l.append(i);form.append(l);return i;};
  const table=(headers,rows)=>{const wrap=el('div',undefined,'table-wrap'),t=el('table',undefined,'admin-table'),head=el('thead'),hr=el('tr');headers.forEach(v=>hr.append(el('th',v)));head.append(hr);t.append(head);const body=el('tbody');for(const cells of rows){const tr=el('tr');for(const value of cells){const td=el('td');td.append(typeof value==='object'?value:document.createTextNode(String(value??'—')));tr.append(td);}body.append(tr);}if(!rows.length){const tr=el('tr'),td=el('td','No records in this period.');td.colSpan=headers.length;tr.append(td);body.append(tr);}t.append(body);wrap.append(t);container.append(wrap);};
  const filter=el('form',undefined,'admin-filters'),from=field(filter,'From',new Date(data.from).toISOString().slice(0,16),'datetime-local'),to=field(filter,'To',new Date(data.to).toISOString().slice(0,16),'datetime-local'),go=el('button','Apply dates','primary');go.type='submit';filter.append(go);filter.onsubmit=e=>{e.preventDefault();action(()=>render(o,{from:new Date(from.value+'Z').toISOString(),to:new Date(to.value+'Z').toISOString(),offset:0}));};container.append(el('p','History up to 62 days · date filters use UTC.','admin-subtitle'),filter);
  const tiles=items=>{const grid=el('div',undefined,'admin-summary-grid');for(const [label,value]of items){const tile=el('div',undefined,'admin-summary-tile');tile.append(el('span',label),el('strong',value));grid.append(tile);}container.append(grid);};
  if(mode==='audit')table(['Date','Source','Action','Actor','Account'],data.rows.map(r=>[new Date(r.created_at).toLocaleString(),r.source,r.action,r.actor_id,r.target_id]));
  else if(['salary','expenses'].includes(mode)){
   const category=mode==='salary'?'salary':null,rows=data.expenses.filter(e=>category?e.category===category:e.category!=='salary');
   tiles(data.expenseTotals.filter(e=>category?e.category===category:e.category!=='salary').map(e=>[e.category,amount(e.amount)]));
   container.append(el('p','Record expenses already paid. These records affect reporting only; saving does not transfer money. Voided entries remain in history.','notice'));
   if(data.canManage)container.append(button(mode==='salary'?'+ Record salary':'+ Record expense',()=>{
    const d=el('dialog'),form=el('form',undefined,'admin-editor');d.append(el('h2',mode==='salary'?'Record salary payment':'Record expense'),button('Close',()=>d.close()),form);container.append(d);d.onclose=()=>d.remove();
    const tenantLabel=el('label','Workspace'),tenant=el('select');for(const id of data.tenants){const option=el('option',id);option.value=id;tenant.append(option);}tenantLabel.append(tenant);form.append(tenantLabel);
    const categoryLabel=el('label','Category'),cat=el('select');for(const key of category?[category]:['server','maintenance','other']){const option=el('option',key);option.value=key;cat.append(option);}categoryLabel.append(cat);form.append(categoryLabel);
    const payee=field(form,category?'Employee name / reference':'Payee'),value=field(form,'Amount (INR)'),at=field(form,'Paid on (UTC)',new Date().toISOString().slice(0,16),'datetime-local'),description=field(form,'Description / payment reference'),save=el('button','Save record','primary');save.type='submit';form.append(save);const requestId=crypto.randomUUID();
    form.onsubmit=e=>{e.preventDefault();action(async()=>{if(!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value.value))throw Error('Enter a valid INR amount');const [whole,decimal='']=value.value.split('.');save.disabled=true;try{await post('panel/expense/create',{requestId,tenantId:tenant.value,category:cat.value,payee:payee.value,amountMinor:(BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'))).toString(),occurredAt:new Date(at.value+'Z').toISOString(),description:description.value});d.close();await render(o,state);}finally{save.disabled=false;}});};d.showModal();
   },'primary'));
   table(['Date','Category','Payee','Amount','Reference','State','Action'],rows.map(r=>[new Date(r.occurred_at).toLocaleString(),r.category,r.payee,amount(r.amount_minor),r.description,r.void_reason?'Voided':'Recorded',!r.void_reason&&data.canManage?button('Void',()=>{
    const d=el('dialog'),f=el('form'),reason=field(f,'Reason for voiding');d.append(el('h2','Void expense'),button('Close',()=>d.close()),f);const save=el('button','Confirm void');save.type='submit';f.append(save);f.onsubmit=e=>{e.preventDefault();action(async()=>{await post('panel/expense/void',{id:r.id,reason:reason.value});d.close();await render(o,state);});};d.onclose=()=>d.remove();container.append(d);d.showModal();
   }):'—']));
  }else if(mode==='usdt'){
   tiles([['Confirmed user deposits',usdt(data.funding.usdt)],['INR capacity credited',amount(data.funding.inr)],['Completed merchant settlements',usdt(data.settlement.usdt)],['INR settled',amount(data.settlement.inr)]]);
   container.append(el('p','Exchange profit is unavailable: completed settlements are not yet matched to acquisition cost lots. Deposit and settlement totals are shown separately; their difference is not profit.','notice'));
  }else{
   const fee=data.fees,n=k=>BigInt(fee[k]||'0'),payin=n('merchant_platform_fee')-n('user_commission'),payout=n('merchant_payout_fee')-n('user_payout_commission');
   if(mode==='payin')tiles([['Merchant pay-in fees',amount(n('merchant_platform_fee'))],['User pay-in commissions',amount(n('user_commission'))],['Pay-in margin',amount(payin)]]);
   else if(mode==='payout')tiles([['Merchant payout fees',amount(n('merchant_payout_fee'))],['User payout commissions',amount(n('user_payout_commission'))],['Payout margin',amount(payout)]]);
   else if(mode==='fixed')tiles([['Successful payouts',String(data.payout.count)],['Fixed payout revenue',amount(data.payout.fixed)],['Percentage payout fees',amount(data.payout.percentage)]]);
   else tiles([['Merchant fees',amount(n('merchant_platform_fee')+n('merchant_payout_fee'))],['User commissions',amount(n('user_commission')+n('user_payout_commission'))],['Salary & expenses',amount(data.totalCosts)],['Operating margin',amount(data.operatingMargin)]]);
   container.append(el('p','Totals cover the full selected period. Operating margin = posted merchant fees − user commissions − recorded expenses. USDT exchange profit is excluded until acquisition cost matching is available. Fixed payout fees are included in payout fees, not added twice.','notice'));
   const types=mode==='payin'?['merchant_platform_fee','user_commission','merchant_gross','capacity_consumed']:mode==='payout'?['merchant_payout_fee','user_payout_commission','merchant_payout_principal']:null;
   if(mode!=='fixed')table(['Account','Role','Ledger','Amount'],data.rows.filter(r=>!types||types.includes(r.ledger_type)).map(r=>[r.name,r.account_type,r.ledger_type.replaceAll('_',' '),amount(r.amount)]));
  }
  if(['salary','expenses','audit'].includes(mode)){const pager=el('div',undefined,'admin-pagination');pager.append(el('span','Page '+(1+(state.offset||0)/50)));if(state.offset)pager.append(button('Previous',()=>render(o,{...state,offset:state.offset-50})));if(data.hasMore)pager.append(button('Next',()=>render(o,{...state,offset:(state.offset||0)+50})));container.append(pager);}
 }
 root.WPayAdminFinance={render};
})(globalThis);
