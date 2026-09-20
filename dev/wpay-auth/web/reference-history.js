"use strict";
(function(root){
 const money=value=>{const n=BigInt(value),s=(n<0n?-n:n).toString().padStart(3,'0');return (n<0n?'-':'')+'₹'+s.slice(0,-2)+'.'+s.slice(-2);};
 async function render(args,offset=0){
  const {request,post,action,el,container,title,groups}=args;
  title.textContent='Transaction History';container.replaceChildren();
  const destinations=new Set(groups.flatMap(g=>g.children||[]).filter(p=>p.routeStatus!=='unavailable').map(p=>p.destinationId));
  const button=(label,fn)=>{const b=el('button',label,'btn');b.type='button';b.onclick=()=>action(fn);return b;};
  const table=(label,rows)=>{const card=el('section',undefined,'card');card.append(el('h2',label));if(!rows.length)card.append(el('p','No completed transactions.','notice'));for(const r of rows){const item=el('article',undefined,'business-row');item.append(el('strong',r.reference||r.id),el('p',money(r.amountMinor)),el('p',r.status||r.state));if(r.completedAt)item.append(el('p',new Date(r.completedAt).toLocaleString()));card.append(item);}container.append(card);return card;};
  if(destinations.has('payout.jobs')){
   const result=await post('payout/search',{state:'successful',offset,limit:25});const card=table('Successful payouts',result.orders);
   if(offset)card.append(button('Previous payouts',()=>render(args,Math.max(0,offset-25))));
   if(result.hasMore)card.append(button('Next payouts',()=>render(args,offset+25)));
  }else container.append(el('p','Payout history is unavailable for this account.','notice'));
  if(destinations.has('parking.orders')){
   const result=await request('parking/orders');const card=table('Completed Parking payments',result.history.filter(r=>r.state==='completed'));
   card.append(el('p','Completed payments from the latest 100 Parking requests.','hint'));
  }else container.append(el('p','Parking history is unavailable for this account.','notice'));
 }
 root.WPayReferenceHistory={render};
})(globalThis);
