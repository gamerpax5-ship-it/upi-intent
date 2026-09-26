"use strict";
(function(root){
  const money=value=>{
    const n=BigInt(value||0),a=n<0n?-n:n;
    return (n<0n?"−":"")+"₹"+(a/100n).toLocaleString("en-IN")+"."+String(a%100n).padStart(2,"0");
  };
  const button=(el,label,fn,cls="")=>{
    const b=el("button",label,cls);b.type="button";b.onclick=fn;return b;
  };
  const metric=(el,label,value,hint)=>{
    const c=el("article",undefined,"card admin-kpi-compact");
    c.append(el("span",label,"admin-kpi-label"),el("strong",String(value??"—")),el("small",hint||""));
    return c;
  };
  const table=(el,headers,rows)=>{
    const wrap=el("div",undefined,"table-wrap"),t=el("table",undefined,"admin-table"),thead=el("thead"),hr=el("tr");
    for(const h of headers)hr.append(el("th",h));thead.append(hr);t.append(thead);
    const tbody=el("tbody");
    for(const row of rows){
      const tr=el("tr");
      for(const value of row){
        const td=el("td");
        td.append(value instanceof Node?value:document.createTextNode(String(value??"—")));
        tr.append(td);
      }
      tbody.append(tr);
    }
    if(!rows.length){const tr=el("tr"),td=el("td","No records.");td.colSpan=headers.length;tr.append(td);tbody.append(tr);}
    t.append(tbody);wrap.append(t);return wrap;
  };

  async function analytics(o){
    const {post,action,el,container,title}=o,days=o.state?.days||30;
    title.textContent="Analytics";
    const data=await post("panel/admin-overview",{days});
    container.replaceChildren();
    const hero=el("section",undefined,"admin-command"),copy=el("div"),select=el("select");
    copy.append(el("span","ADMIN ANALYTICS","admin-command-eyebrow"),el("h2","Today, volume and operational health"),el("p","Scoped V5 analytics backed by the live Admin overview endpoint."));
    for(const n of [7,30,60]){const op=el("option","Last "+n+" days");op.value=n;select.append(op);}
    select.value=days;select.onchange=()=>action(()=>analytics({...o,state:{days:Number(select.value)}}));hero.append(copy,select);container.append(hero);
    const primary=el("div",undefined,"admin-primary-kpis");
    for(const [label,value,hint] of [
      ["Today volume",money(data.todayVolume),"Collection + payout"],
      ["Success rate",data.successRate==null?"—":(Number(data.successRate)*100).toFixed(1)+"%","India-day gateway success"],
      ["Running UPI",data.runningUpi,"Operational routes"],
      ["Active Users",data.activeUsers,"Approved + active"],
      ["Today collection",money(data.todayCollection),"Successful pay-ins"],
      ["Today payout",money(data.todayPayoutVolume),"Successful payouts"]
    ])primary.append(metric(el,label,value,hint));
    container.append(primary);
    const secondary=el("div",undefined,"admin-secondary-kpis");
    for(const [label,value] of [
      ["Platform fees",money(data.totalFees)],["User commission",money(data.totalUserCommission)],["User deposits",money(data.totalUserDeposits)],
      ["Payouts",data.successfulPayouts],["Users",data.totalUsers],["Merchants",data.totalMerchants],["Employees",data.totalEmployees],["Available UPI",data.availableUpi]
    ]){const x=el("div");x.append(el("small",label),el("strong",String(value??"—")));secondary.append(x);}
    container.append(secondary);
    const grid=el("div",undefined,"admin-columns"),trend=el("section",undefined,"card admin-panel"),queues=el("section",undefined,"card admin-panel");
    trend.append(el("h2","Period activity"));
    for(const r of data.series||[]){const row=el("div",undefined,"admin-profit-row");row.append(el("span",r.day+" · "+r.kind),el("strong",money(r.amount)));trend.append(row);}
    queues.append(el("h2","Action queues"));
    for(const [k,v] of Object.entries(data.approvals||{})){const row=el("div",undefined,"admin-profit-row");row.append(el("span",k.replaceAll("_"," ")),el("strong",String(v??"—")));queues.append(row);}
    grid.append(trend,queues);container.append(grid);
  }

  async function approvals(o){
    const {post,el,container,title,navigate}=o;
    title.textContent="Pending approvals";
    const [users,merchants,banks,payouts,withdrawals]=await Promise.all([
      post("panel/directory",{type:"user",status:"pending",search:"",offset:0}),
      post("panel/directory",{type:"merchant",status:"pending",search:"",offset:0}),
      post("business/banks",{}),
      post("payout/approval/search",{offset:0,limit:50}),
      post("payout/withdrawal/search",{offset:0,limit:50})
    ]);
    const rows=[];
    for(const x of users.rows)rows.push({kind:"User",id:x.id,name:x.name,created:x.created_at,destination:"v5.users"});
    for(const x of merchants.rows)rows.push({kind:"Merchant",id:x.id,name:x.name,created:x.created_at,destination:"v5.merchants"});
    for(const x of banks.banks.filter(x=>["submitted","review"].includes(x.status)))rows.push({kind:"Bank / UPI",id:x.id,name:x.details?.upiId||x.id,created:x.created_at||x.updated_at,destination:"v5.bank-upi"});
    for(const x of payouts.requests||[])rows.push({kind:"Payout",id:x.id,name:x.merchant_name||x.id,created:x.created_at,destination:"v5.payout-approval"});
    for(const x of (withdrawals.withdrawals||[]).filter(x=>["requested","review"].includes(x.state)))rows.push({kind:"Withdrawal",id:x.id,name:x.userId||x.id,created:x.createdAt||x.created_at,destination:"v5.withdrawals"});
    const band=el("div",undefined,"kpi-band"),add=(label,value)=>{const x=el("div");x.append(el("small",label),el("strong",String(value)));band.append(x);};
    add("Total pending",rows.length);add("Users",rows.filter(x=>x.kind==="User").length);add("Merchants",rows.filter(x=>x.kind==="Merchant").length);add("UPI",rows.filter(x=>x.kind==="Bank / UPI").length);add("Finance",rows.filter(x=>["Payout","Withdrawal"].includes(x.kind)).length);
    const section=el("section",undefined,"card admin-panel"),head=el("div",undefined,"panel-head"),copy=el("div");copy.append(el("h2","Unified action queue"),el("p","Approvals stay in their own backend domain; this page only groups the work."));head.append(copy);section.append(head);
    section.append(table(el,["Type","Record","Name","Created","Action"],rows.map(r=>[pill(el,r.kind),r.id,r.name,r.created?new Date(r.created).toLocaleString("en-IN"):"—",button(el,"Open module",()=>navigate(r.destination),"primary")])));
    container.replaceChildren(band,section);
  }

  async function bankUpi(o){
    const {post,action,el,container,title}=o;title.textContent="Bank & UPI";container.replaceChildren();
    const [directory,generic]=await Promise.all([post("business/admin-upi",{offset:0,search:""}),post("business/banks",{})]),genericById=new Map(generic.banks.map(x=>[x.id,x]));
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(directory.canCreate)tools.append(button(el,"+ Add Admin-approved UPI",()=>createUpi(),"primary"));}
    container.append(el("p","Admin review supports approve/reject/freeze/release and operational Stop/Start. Per-UPI daily limit is User-owned in the latest backend, so Admin sees the limit and utilization but does not edit it here.","notice"));
    const rows=directory.banks.map(b=>{
      const g=genericById.get(b.id)||b,limit=BigInt(b.sharedLimit||g.daily_limit_minor||0),used=BigInt(b.used||0),remaining=limit>used?limit-used:0n,routes=directory.routes.filter(r=>r.bank_id===b.id&&r.status==="active").length,actions=el("div",undefined,"admin-row-actions");
      actions.append(button(el,"Details",()=>details(b,g)));
      if(["submitted","review"].includes(g.status)){if(generic.actions.includes("approve"))actions.append(button(el,"Approve",()=>review(g,"approve"),"primary"));if(generic.actions.includes("reject"))actions.append(button(el,"Reject",()=>review(g,"reject"),"danger"));}
      if(g.frozen&&generic.actions.includes("release"))actions.append(button(el,"Release freeze",()=>review(g,"release_freeze")));else if(!g.frozen&&generic.actions.includes("freeze"))actions.append(button(el,"Freeze",()=>review(g,"freeze"),"danger"));
      if(["running","stopped","approved","verified"].includes(g.status)&&!g.frozen)actions.append(button(el,g.status==="stopped"?"Start":"Stop",()=>stateChange(b,g.status==="stopped"?"start":"stop")));
      return [(b.details?.upiId||b.id)+" · "+(b.owner_name||b.owner_id)+" · "+(b.details?.bankName||"—"),b.admin_approved_by?"admin approved":g.verified_version===g.version?"payment verified":"verification pending",money(used)+" / "+money(limit)+" · "+money(remaining)+" remaining · owner-managed daily limit",g.statement?.status||"no statement",g.frozen?"frozen":g.status,routes,actions];
    });
    container.append(table(el,["UPI / owner","Approval","Daily limit usage","Statement","State","Routes","Actions"],rows));
    function createUpi(){dialog(el,container,"Add Admin-approved UPI",(body,d)=>{const form=el("form",undefined,"form-grid"),users=directory.accounts.filter(x=>x.account_type==="user"),owner=selectField(el,form,"owner","Account owner",users.map(x=>[x.id,x.name])),upi=field(el,form,"upi","UPI ID"),holder=field(el,form,"holder","Account holder"),bank=field(el,form,"bank","Bank name"),account=field(el,form,"account","Account number"),ifsc=field(el,form,"ifsc","IFSC"),mobile=field(el,form,"mobile","Registered mobile"),provider=field(el,form,"provider","UPI provider"),type=selectField(el,form,"type","Account type",[["business","Business"],["personal","Personal"]],"business"),limit=field(el,form,"limit","Shared daily limit INR","1000000"),reason=field(el,form,"reason","Approval reason","Admin verified identity");form.append(el("p","Admin approval is not bank evidence. The live system records this as Admin approval provenance.","notice"));const save=el("button","Create approved UPI","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const [w,fr=""]=String(limit.value).split("."),bankLimitMinor=(BigInt(w)*100n+BigInt(fr.padEnd(2,"0"))).toString();await post("business/admin-upi/create",{ownerId:owner.value,details:{upiId:upi.value,holderName:holder.value,bankName:bank.value,accountNumber:account.value,ifsc:ifsc.value.toUpperCase(),mobile:mobile.value,providerName:provider.value,notes:"",accountType:type.value,bankLimitMinor},reason:reason.value,requestId:crypto.randomUUID()});d.close();await bankUpi(o);});};});}
    function review(bank,command){dialog(el,container,(command==="approve"?"Approve ":command==="reject"?"Reject ":command.replaceAll("_"," ")+" ")+(bank.details?.upiId||bank.id),(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",command==="approve"?"Reviewed account identity":"Operational review"),save=el("button",command.replaceAll("_"," "),command==="reject"||command==="freeze"?"danger":"primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/banks/review",{bankId:bank.id,version:bank.version,action:command,reason:reason.value});d.close();await bankUpi(o);});};});}
    function stateChange(bank,command){dialog(el,container,(command==="start"?"Start ":"Stop ")+(bank.details?.upiId||bank.id),(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",command==="start"?"Resume approved UPI":"Operational stop"),save=el("button",command==="start"?"Start":"Stop",command==="start"?"primary":"danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/admin-upi/state",{bankId:bank.id,version:bank.version,action:command,reason:reason.value});d.close();await bankUpi(o);});};});}
    function details(bank,g){dialog(el,container,"UPI details · "+(bank.details?.upiId||bank.id),(body)=>{const dl=el("dl",undefined,"admin-details"),add=(k,v)=>{dl.append(el("dt",k),el("dd",String(v??"—")));};add("Owner",bank.owner_name||bank.owner_id);add("UPI",bank.details?.upiId);add("Holder",bank.details?.holderName);add("Bank",bank.details?.bankName);add("Account",bank.details?.accountNumber);add("IFSC",bank.details?.ifsc);add("Mobile",bank.details?.mobile);add("Version",bank.version);add("Status",g.frozen?"frozen":g.status);add("Daily usage",money(bank.used||0)+" / "+money(bank.sharedLimit||g.daily_limit_minor||0));body.append(dl,el("h4","Merchant routes"));const routes=directory.routes.filter(r=>r.bank_id===bank.id);if(!routes.length)body.append(el("div","No explicit routes.","admin-empty"));for(const r of routes){const row=el("div",undefined,"summary-row");row.append(el("span",(r.merchant_name||r.merchant_id)+" · priority "+r.priority),el("strong",money(r.min_minor)+" – "+money(r.max_minor)));body.append(row);}});}
  }

  async function upiAnalytics(o){
    const {post,action,el,container,title}=o,days=o.state?.days||1;title.textContent="UPI Analytics";
    const [directory,transactions,generic]=await Promise.all([post("business/admin-upi",{offset:0,search:""}),post("operations/transactions",{offset:0,status:""}),post("business/banks",{})]),genericById=new Map(generic.banks.map(x=>[x.id,x]));
    const cutoff=Date.now()-days*86400000,records=transactions.records.filter(t=>!t.createdAt||+new Date(t.createdAt)>=cutoff),running=directory.banks.filter(b=>{const g=genericById.get(b.id)||b;return g.status==="running"&&!g.frozen}),totalLimit=directory.banks.reduce((n,b)=>n+BigInt(b.sharedLimit||genericById.get(b.id)?.daily_limit_minor||0),0n),used=directory.banks.reduce((n,b)=>n+BigInt(b.used||0),0n),available=directory.banks.filter(b=>{const g=genericById.get(b.id)||b,l=BigInt(b.sharedLimit||g.daily_limit_minor||0);return g.status==="running"&&!g.frozen&&l>BigInt(b.used||0)}).length,activeRoutes=directory.routes.filter(r=>r.status==="active").length,successRate=records.length?records.filter(x=>x.status==="successful").length/records.length*100:0,util=totalLimit?Number(used*10000n/totalLimit)/100:0;
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();const tabs=el("div",undefined,"section-tabs");for(const [n,label]of [[1,"Today"],[7,"7 days"],[30,"30 days"]]){const b=button(el,label,()=>action(()=>upiAnalytics({...o,state:{days:n}})));if(days===n)b.classList.add("active");tabs.append(b);}tools.append(tabs);}
    container.replaceChildren();const metrics=el("div",undefined,"grid analytics-metrics");for(const [l,v,h]of [["Total UPI",directory.banks.length,"All configured accounts"],["Running UPI",running.length,"Running and not frozen"],["Available UPI",available,"Shared limit remaining"],["Shared limit",money(totalLimit),"Configured bank limits"],["Limit used",money(used),util.toFixed(1)+"% utilization"],["Active routes",activeRoutes,"Merchant assignments"],["Success rate",successRate.toFixed(1)+"%","Owner-side aggregate"],["Needs review",generic.banks.filter(x=>["submitted","review"].includes(x.status)).length,"UPI review queue"]])metrics.append(metric(el,l,v,h));container.append(metrics);
    const txByBank=directory.banks.map(b=>{const g=genericById.get(b.id)||b,tx=records.filter(t=>t.bankId===b.id),ok=tx.filter(t=>t.status==="successful"),pending=tx.filter(t=>t.status==="verification_pending"),limit=BigInt(b.sharedLimit||g.daily_limit_minor||0),bankUsed=BigInt(b.used||0);return {bank:b,g,txTotal:tx.length,successful:ok.length,pending:pending.length,volume:ok.reduce((n,t)=>n+BigInt(t.amountMinor||0),0n),successRate:tx.length?ok.length/tx.length*100:0,routeCount:directory.routes.filter(r=>r.bank_id===b.id&&r.status==="active").length,limit,bankUsed};});
    const grid=el("div",undefined,"admin-columns"),utilCard=el("section",undefined,"card admin-panel"),health=el("section",undefined,"card admin-panel");utilCard.append(el("h2","UPI utilization"),el("p","Shared daily limit consumption","admin-subtitle"));const bars=el("div",undefined,"mini-bar-list");for(const x of [...txByBank].sort((a,b)=>Number((b.bankUsed*10000n/(b.limit||1n))-(a.bankUsed*10000n/(a.limit||1n))))){const pct=x.limit?Number(x.bankUsed*10000n/x.limit)/100:0,row=el("div",undefined,"mini-bar-row"),progress=el("div",undefined,"progress"),fill=el("span");fill.style.width=Math.min(100,pct)+"%";progress.append(fill);row.append(el("label",x.bank.details?.upiId||x.bank.id),progress,el("strong",pct.toFixed(1)+"%"));bars.append(row);}utilCard.append(bars);health.append(el("h2","Route health"));for(const [l,v]of [["Running / available",running.length+" / "+available],["Frozen UPI",generic.banks.filter(x=>x.frozen).length],["Admin-approved",directory.banks.filter(x=>x.admin_approved_by).length],["Payment verified",generic.banks.filter(x=>x.verified_version===x.version).length],["Active routes",activeRoutes],["Disabled routes",directory.routes.filter(x=>x.status!=="active").length]]){const row=el("div",undefined,"summary-row");row.append(el("span",l),el("strong",String(v)));health.append(row);}grid.append(utilCard,health);container.append(grid);
    container.append(el("section",undefined,"card admin-panel"));const perf=container.lastElementChild;perf.append(el("h2","UPI performance"),el("p","Owner-side transactions + shared limits","admin-subtitle"),table(el,["UPI / owner","State","Routes","Transactions","Successful","Pending","Success rate","Volume","Limit remaining"],txByBank.map(x=>[(x.bank.details?.upiId||x.bank.id)+" · "+(x.bank.owner_name||x.bank.owner_id)+" · "+(x.bank.details?.bankName||"—"),x.g.frozen?"frozen":x.g.status,x.routeCount,x.txTotal,x.successful,x.pending,x.successRate.toFixed(1)+"%",money(x.volume),money(x.limit>x.bankUsed?x.limit-x.bankUsed:0n)])));
    container.append(el("p","Window changes filter the scoped transaction sample while shared-limit utilization remains current India-day state.","notice"));
  }

  async function parkingView(o,mode){
    const {request,post,action,el,container,title}=o,data=await request("parking/admin");
    title.textContent=mode==="beneficiaries"?"Parking Beneficiaries":mode==="orders"?"Parking Orders":"Parking Review";
    container.replaceChildren();
    const tools=document.getElementById("page-tools");if(tools)tools.replaceChildren();
    const beneficiaryById=new Map(data.beneficiaries.map(b=>[b.id,b])),orderById=new Map(data.orders.map(x=>[x.id,x]));
    const confirmedFor=b=>data.confirmations.filter(c=>c.beneficiary_id===b.id);
    const preview=()=>{
      dialog(el,container,"Preview what a User sees",(body)=>{
        const form=document.createElement("form"),label=el("label","User"),select=el("select");for(const u of data.users||[]){const op=el("option",u.name);op.value=u.id;select.append(op);}label.append(select);form.append(label);const host=el("div");body.append(form,host);
        const draw=()=>{const uid=select.value,confirmed=new Set(data.confirmations.filter(c=>c.user_id===uid).map(c=>c.beneficiary_id)),visible=data.orders.filter(o=>o.state==="open"&&BigInt(o.remainingMinor||0)>0n&&confirmed.has(o.beneficiaryId));host.replaceChildren();const phone=el("div",undefined,"preview-phone"),head=el("div","WPay User · Parking","preview-phone-head"),screen=el("div",undefined,"preview-screen");screen.append(el("div","Beneficiaries","eyebrow"));for(const b of data.beneficiaries){const item=el("div",undefined,"preview-item");item.append(el("strong",b.details.beneficiaryName),el("span",b.details.bankName+" · "+(confirmed.has(b.id)?"I added · confirmed":"Not confirmed")));screen.append(item);}screen.append(el("div","Visible Parking orders","eyebrow"));if(!visible.length){const item=el("div",undefined,"preview-item");item.append(el("strong","No eligible Parking orders"),el("span","Confirm a matching beneficiary first."));screen.append(item);}for(const o of visible){const b=beneficiaryById.get(o.beneficiaryId),item=el("div",undefined,"preview-item");item.append(el("strong",o.reference+" · "+money(o.totalMinor)),el("span",(b?.details.beneficiaryName||"—")+" · min "+money(o.minMinor)+" · max "+money(o.maxMinor||o.totalMinor)));screen.append(item);}phone.append(head,screen);host.append(phone);};select.onchange=draw;draw();
      });
    };
    if(mode==="beneficiaries"){
      if(tools){if(data.canCreate)tools.append(button(el,"+ Create beneficiary",()=>createBeneficiary(),"primary"));tools.append(button(el,"User preview",preview));}
      const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(metric(el,"Beneficiaries",data.beneficiaries.filter(x=>!x.revoked).length,"Tenant-scoped beneficiary records"),metric(el,"User confirmations",data.confirmations.length,"“I added” confirmations"),metric(el,"Open orders",data.orders.filter(x=>x.state==="open").length,"Orders linked to beneficiaries"),metric(el,"Review queue",data.reviews.length,"Submitted User payments"));container.append(metrics,el("p","Actual repo logic: Admin / authorized Employee creates the beneficiary. User sees it, adds the exact beneficiary in their banking app, then confirms I added. Only confirmed beneficiaries unlock matching Parking orders for that User.","notice"));
      const rows=data.beneficiaries.map(b=>[b.details.beneficiaryName+" · "+b.id+" · "+b.tenantId,b.details.bankName+" · "+b.details.accountNumber+" · "+b.details.ifsc,b.details.upiId||"—",(b.sourceName||"—")+" · "+(b.sourceType||"—"),String(b.confirmationCount||0)+" · "+(confirmedFor(b).map(c=>c.user_name).join(", ")||"No confirmations yet"),data.orders.filter(o=>o.beneficiaryId===b.id&&o.state==="open").length,b.revoked?"revoked":"active"]);
      container.append(table(el,["Beneficiary","Bank details","UPI","Created by","User confirmations","Open orders","State"],rows));
      function createBeneficiary(){dialog(el,container,"Create Parking Beneficiary",(body,d)=>{const form=el("form",undefined,"form-grid"),tenant=selectField(el,form,"tenant","Workspace",(data.tenants||[]).map(x=>[x,x]),data.tenants?.[0]),name=field(el,form,"name","Beneficiary name"),bank=field(el,form,"bank","Bank name"),account=field(el,form,"account","Account number"),ifsc=field(el,form,"ifsc","IFSC"),upi=field(el,form,"upi","UPI ID");const save=el("button","Create beneficiary","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("parking/beneficiary/create",{requestId:crypto.randomUUID(),tenantId:tenant.value,beneficiaryName:name.value,bankName:bank.value,accountNumber:account.value,ifsc:ifsc.value.toUpperCase(),upiId:upi.value});d.close();await parkingView(o,mode);});};});}
      return;
    }
    if(mode==="orders"){
      if(tools){if(data.canCreate)tools.append(button(el,"+ Create Parking order",()=>createOrder(),"primary"));tools.append(button(el,"User visibility preview",preview));}
      container.append(el("p","Latest rule: each order has total, minimum and maximum per transaction. A User can pay the whole remaining amount when the remainder falls below minimum, but cannot exceed maximum. Payment window is 10 minutes + 5-minute submission grace.","notice"));
      const rows=data.orders.map(o=>{const b=beneficiaryById.get(o.beneficiaryId),locked=BigInt(o.lockedMinor||o.locked||0);return [o.reference+" · "+o.id,(b?.details.beneficiaryName||"—")+" · "+(b?.details.bankName||"—"),o.tenantId,money(o.totalMinor),money(o.minMinor),money(o.maxMinor||o.totalMinor),money(o.remainingMinor||0),(b?.confirmationCount||0)+" Users",o.state];});
      container.append(table(el,["Reference","Beneficiary","Workspace","Total","Min / txn","Max / txn","Remaining","Confirmed Users","State"],rows));
      function createOrder(){dialog(el,container,"Create Parking order",(body,d)=>{const form=el("form",undefined,"form-grid"),tenant=selectField(el,form,"tenant","Workspace",(data.tenants||[]).map(x=>[x,x]),data.tenants?.[0]),beneficiary=selectField(el,form,"beneficiary","Beneficiary",data.beneficiaries.filter(x=>!x.revoked).map(b=>[b.id,b.details.beneficiaryName+" · "+b.details.bankName])),reference=field(el,form,"reference","Reference"),total=field(el,form,"total","Total INR","5000"),min=field(el,form,"min","Minimum per transaction INR","500"),max=field(el,form,"max","Maximum per transaction INR","5000"),toMinor=v=>{const [w,f=""]=String(v).split(".");return (BigInt(w)*100n+BigInt(f.padEnd(2,"0"))).toString();};const save=el("button","Create order","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("parking/order/create",{requestId:crypto.randomUUID(),tenantId:tenant.value,beneficiaryId:beneficiary.value,reference:reference.value,totalMinor:toMinor(total.value),minMinor:toMinor(min.value),maxMinor:toMinor(max.value)});d.close();await parkingView(o,mode);});};});}
      return;
    }
    container.append(el("p","Approved Parking completion restores User capacity only after accepted evidence. Review can move submitted → review/disputed → completed or not_paid.","notice"));
    const rows=data.reviews.map(r=>{const order=orderById.get(r.orderId),beneficiary=beneficiaryById.get(r.beneficiaryId||order?.beneficiaryId),actions=el("div",undefined,"admin-row-actions");actions.append(button(el,"Review",()=>decision(r,"review")),button(el,"Approve paid",()=>decision(r,"approve"),"primary"),button(el,"Dispute",()=>decision(r,"dispute"),"danger"),button(el,"Not paid",()=>decision(r,"not_paid"),"danger"));return [r.orderId,r.userName,beneficiary?.details.beneficiaryName||"—",money(r.amountMinor),r.utr||"—",r.state,r.reviewer||"—",actions];});
    container.append(table(el,["Order","User","Beneficiary","Amount","UTR","State","Reviewer","Action"],rows));
    function decision(r,chosen){dialog(el,container,"Parking decision",(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason"),label={review:"Review",approve:"Approve paid",dispute:"Dispute",not_paid:"Not paid"}[chosen],save=el("button",label,chosen==="approve"?"primary":chosen==="review"?"":"danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("parking/review",{id:r.id,action:chosen,reason:reason.value});d.close();await parkingView(o,mode);});};});}
  }


  async function upiLimits(o){
    const {request,post,el,container,title}=o;
    title.textContent="UPI daily limits";container.replaceChildren();
    let data;
    try{data=await post("business/admin-upi",{offset:0,search:""});}
    catch{const plain=await request("business/banks");data={banks:plain.banks.map(b=>({...b,owner_name:b.owner_id,used:"0",sharedLimit:b.daily_limit_minor}))};}
    const total=data.banks.reduce((n,b)=>n+BigInt(b.sharedLimit||b.daily_limit_minor||0),0n),used=data.banks.reduce((n,b)=>n+BigInt(b.used||0),0n);
    const metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Configured UPI",data.banks.length,"Current bank versions"),metric(el,"Combined daily limit",money(total),"All scoped UPIs"),metric(el,"Used today",money(used),"Active reservations + successful collection volume"),metric(el,"Remaining",money(total-used>0n?total-used:0n),"Combined remaining"));
    container.append(metrics);
    const rows=data.banks.map(b=>{
      const limit=BigInt(b.sharedLimit||b.daily_limit_minor||0),spent=BigInt(b.used||0),remaining=limit-spent,p=limit?Number(spent*10000n/limit)/100:0;
      return [b.details?.upiId||b.id,b.owner_name||b.owner_id,money(limit),money(spent),money(remaining>0n?remaining:0n),p.toFixed(1)+"%",b.frozen?"frozen":b.status];
    });
    container.append(el("p","Per-UPI daily limit is owner-managed in the latest backend. Admin can review utilization here; account approval, UPI verification, route min/max and freeze/state checks remain separate.","notice"),table(el,["UPI","Owner","Daily limit","Used today","Remaining","Utilization","State"],rows));
  }

  async function payinDisputes(o){
    const {post,el,container,title}=o;
    title.textContent="Pay-in disputes";container.replaceChildren();
    const data=await post("operations/transactions",{offset:0,status:"recovery_review"});
    const metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Recovery review",data.records.length,"Pay-ins requiring evidence review"),metric(el,"Verified observations",data.records.reduce((n,r)=>n+r.observations.filter(x=>x.verified).length,0),"Independent evidence"),metric(el,"Unposted accounting",data.records.filter(r=>r.accountingState!=="posted").length,"No final journal yet"),metric(el,"Recovered",data.records.filter(r=>r.recovered).length,"Statement-recovered pay-ins"));
    container.append(metrics,el("p",data.note||"Submitted UTR is an observation until independent evidence or explicit Admin decision establishes accounting.","notice"));
    const rows=data.records.map(r=>[r.reference,r.userId||"—",r.merchantId||"—",money(r.amountMinor),r.status,r.evidenceState,r.accountingState,r.observations.map(x=>x.utr+" · "+x.source+(x.verified?" · verified":"")).join(" | ")||"—"]);
    container.append(table(el,["Reference","User","Merchant","Amount","Status","Evidence","Accounting","UTR observations"],rows));
  }

  async function payoutApproval(o){
    const {post,action,el,container,title}=o;
    title.textContent="Payout approval";container.replaceChildren();
    const data=await post("payout/approval/search",{offset:o.state?.offset||0,limit:25});
    const metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Pending batches",data.requests.length,"Awaiting Admin routing approval"),metric(el,"Orders",data.requests.reduce((n,r)=>n+Number(r.order_count||0),0),"Orders inside pending requests"),metric(el,"Principal volume",money(data.requests.reduce((n,r)=>n+BigInt(r.volume_minor||0),0n)),"Payout principal"),metric(el,"Reserved",money(data.requests.reduce((n,r)=>n+BigInt(r.reserve_minor||0),0n)),"Principal + fees"));
    container.append(metrics,el("p","Merchant balance is reserved before this queue. Approval opens the payout for User claiming only when enough routing time remains; rejection releases the reservation.","notice"));
    const rows=data.requests.map(r=>{
      const actions=el("div",undefined,"admin-row-actions");
      actions.append(button(el,"Approve routing",()=>decide(r,"approve"),"primary"),button(el,"Reject",()=>decide(r,"reject"),"danger"));
      return [r.id,r.merchant_name,r.order_count,money(r.volume_minor),money(r.reserve_minor),money(r.available_minor),new Date(r.earliest_deadline).toLocaleString("en-IN"),actions];
    });
    container.append(table(el,["Request / batch","Merchant","Orders","Principal","Reserved","Merchant available","Earliest deadline","Action"],rows));
    function decide(r,decision){
      const d=document.createElement("dialog"),f=document.createElement("form"),l=el("label","Reason"),reason=el("input");reason.required=true;l.append(reason);f.append(l);
      const save=el("button",decision==="approve"?"Approve routing":"Reject payout",decision==="approve"?"primary":"danger");save.type="submit";f.append(save,button(el,"Cancel",()=>d.close()));
      f.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/approval/decide",{id:r.id,action:decision,reason:reason.value});d.close();await payoutApproval(o);});};
      d.append(el("h2",decision==="approve"?"Approve payout routing":"Reject payout"),f);container.append(d);d.showModal();
    }
  }

  async function userCommissions(o){
    const {post,el,container,title}=o;
    title.textContent="User commissions";container.replaceChildren();
    const data=await post("panel/admin-finance",{offset:0});
    const rows=data.rows.filter(r=>r.account_type==="user"&&["user_commission","user_payout_commission"].includes(r.ledger_type));
    const byUser=new Map();
    for(const r of rows){const v=byUser.get(r.id)||{name:r.name,payin:0n,payout:0n};if(r.ledger_type==="user_commission")v.payin+=BigInt(r.amount);else v.payout+=BigInt(r.amount);byUser.set(r.id,v);}
    const payin=BigInt(data.fees.user_commission||0),payout=BigInt(data.fees.user_payout_commission||0),gross=payin+payout;
    const metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Gross commission",money(gross),"Pay-in + payout commission"),metric(el,"Pay-in commission",money(payin),"Successful collections"),metric(el,"Payout commission",money(payout),"Successful payouts"),metric(el,"Users with earnings",byUser.size,"Selected finance period"));
    container.append(metrics,el("p","This page is a live Admin ledger aggregation. Commission holds, reserved withdrawals and completed withdrawals remain separate treasury domains.","notice"));
    container.append(table(el,["User","Pay-in commission","Payout commission","Gross"],[...byUser.entries()].map(([id,v])=>[v.name+" · "+id,money(v.payin),money(v.payout),money(v.payin+v.payout)])));
  }

  async function profitExpenses(o){
    const {post,el,container,title}=o;
    title.textContent="Profit & expenses";container.replaceChildren();
    const data=await post("panel/admin-finance",{offset:0}),fee=data.fees,n=k=>BigInt(fee[k]||0),fees=n("merchant_platform_fee")+n("merchant_payout_fee"),comm=n("user_commission")+n("user_payout_commission"),costs=BigInt(data.totalCosts||0),margin=BigInt(data.operatingMargin||0);
    const metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Merchant fees",money(fees),"Pay-in + payout posted fees"),metric(el,"User commissions",money(comm),"Pay-in + payout earnings"),metric(el,"Salary & expenses",money(costs),"Recorded operating costs"),metric(el,"Operating margin",money(margin),"Fees − commissions − costs"));
    container.append(metrics,el("p","USDT exchange profit is excluded until acquisition-cost matching exists. Saving salary/expense records never transfers money.","notice"));
    container.append(table(el,["Date","Category","Payee","Amount","Reference","State"],data.expenses.map(e=>[new Date(e.occurred_at).toLocaleString("en-IN"),e.category,e.payee,money(e.amount_minor),e.description,e.void_reason?"voided":"recorded"])));
  }


  async function deposits(o){
    const {post,action,el,container,title}=o;title.textContent="User deposits";container.replaceChildren();
    const data=await post("funding/list",{state:"",offset:0}),confirmed=data.requests.filter(r=>r.state==="confirmed"),pending=data.requests.filter(r=>["review","detected","confirming","requested"].includes(r.state));
    const sum=(rows,key)=>rows.reduce((n,r)=>n+BigInt(key==="credit"?r.credit_minor||0:r.snapshot?.amountMinor||0),0n);
    const metrics=el("div",undefined,"grid analytics-metrics");
    metrics.append(metric(el,"Confirmed deposit",money(sum(confirmed,"credit")),"Credited User capacity"),metric(el,"Needs review",pending.length,"Evidence / provider review"),metric(el,"USDT requested",(sum(data.requests,"usdt")/1000000n).toLocaleString("en-IN")+" USDT","Funding request total"),metric(el,"Funded users",new Set(confirmed.map(r=>r.owner_id)).size,"Users with confirmed funding"));
    container.append(metrics,el("p","Funding workflow independently verifies TRC20/ERC20 transfers. 2,000 USDT minimum applies to the first confirmed deposit only. After confirmed history, later top-ups may be smaller. A submitted transaction hash is never confirmation.","notice"));
    const quoteInr=r=>{
      if(r.credit_minor)return money(r.credit_minor);
      const raw=String(r.snapshot?.rate??"0"),[w,f=""]=raw.split("."),ratePaise=BigInt(w||0)*100n+BigInt(f.padEnd(2,"0").slice(0,2)||0),minor=BigInt(r.snapshot?.amountMinor||0);
      return money(minor*ratePaise/1000000n);
    };
    const rows=data.requests.map(r=>{
      const actions=el("div",undefined,"admin-row-actions");
      if(!["confirmed","rejected","reversed"].includes(r.state)){
        if(data.actions.includes("approve"))actions.append(button(el,"Manual confirm",()=>manual(r,"manual_confirm"),"primary"));
        if(data.actions.includes("review"))actions.append(button(el,"Recheck provider",()=>action(async()=>{await post("funding/recheck",{requestId:r.id});await deposits(o);})));
        if(data.actions.includes("reject"))actions.append(button(el,"Reject",()=>manual(r,"manual_reject"),"danger"));
      }else if(r.state==="confirmed"&&data.actions.includes("approve"))actions.append(button(el,"Reverse",()=>reverse(r),"danger"));
      const tx=(r.claims||[])[0]?.tx_hash||"No hash";
      return [r.name+" · "+r.id,(BigInt(r.snapshot?.amountMinor||0)/1000000n).toLocaleString("en-IN")+" USDT",quoteInr(r)+" · ₹"+String(r.snapshot?.rate??"—")+" / USDT",(r.snapshot?.network||"—")+" · "+(r.snapshot?.address||"—"),tx,r.state,r.source||"none",actions];
    });
    container.append(table(el,["User","USDT","INR credit / rate","Network / address","Tx reference","State","Source","Action"],rows));
    function manual(r,command){
      const d=document.createElement("dialog"),form=document.createElement("form"),reasonLabel=el("label","Review reason"),reason=el("input");reason.required=true;reasonLabel.append(reason);form.append(reasonLabel);
      let amount;if(command==="manual_confirm"){const l=el("label","Actual received USDT (optional)"),i=el("input");i.type="number";i.step="0.000001";l.append(i);form.append(l);amount=i;}
      const save=el("button",command==="manual_confirm"?"Confirm review":"Reject",command==="manual_confirm"?"primary":"danger");save.type="submit";form.append(el("p","Manual review provenance remains distinct from blockchain verification.","notice"),save,button(el,"Cancel",()=>d.close()));
      form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("funding/review",{requestId:r.id,action:command,reason:reason.value,...(amount?.value?{amountUsdt:amount.value}:{})});d.close();await deposits(o);});};d.append(el("h2",command==="manual_confirm"?"Manual deposit confirmation":"Reject deposit"),form);container.append(d);d.showModal();
    }
    function reverse(r){
      const d=document.createElement("dialog"),form=document.createElement("form"),rl=el("label","Reversal reason"),reason=el("input"),refLabel=el("label","Evidence reference"),reference=el("input");reason.required=reference.required=true;reference.value="admin-reversal-"+r.id;rl.append(reason);refLabel.append(reference);form.append(rl,refLabel);
      const save=el("button","Reverse confirmed deposit","danger");save.type="submit";form.append(el("p","This posts an exact capacity reversal and may create a reconciliation deficit if capacity was already consumed.","notice"),save,button(el,"Cancel",()=>d.close()));
      form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("funding/review",{requestId:r.id,action:"reverse",reason:reason.value,evidenceReference:reference.value,attributionReference:"",network:"",token:"",address:"",amountUsdt:"",txHash:"",eventIndex:0,reviewedFinal:false});d.close();await deposits(o);});};d.append(el("h2","Reverse deposit"),form);container.append(d);d.showModal();
    }
  }

  async function routingPage(o){
    const {post,action,el,container,title}=o;title.textContent="Assignments & routing";const data=await post("business/admin-upi",{offset:0,search:""}),bankById=new Map(data.banks.map(b=>[b.id,b]));
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canRoute)tools.append(button(el,"+ Assign route",()=>create(),"primary"));}
    container.replaceChildren(el("p","Routing uses account status, approval, security readiness, bank state, daily limits, configured ticket limits and capacity policy. Lower priority value routes first.","notice"));
    const rows=data.routes.map(r=>{const bank=bankById.get(r.bank_id),ready=r.readiness?.eligible===true,actions=el("div",undefined,"admin-row-actions");if(data.canRoute)actions.append(button(el,r.status==="active"?"Disable":"Enable",()=>toggle(r)));return [r.merchant_name||r.merchant_id,(bank?.details?.upiId||r.bank_id)+" · "+(bank?.owner_name||r.user_id),r.priority,money(r.min_minor)+" – "+money(r.max_minor),r.status,ready?"ready":"blocked",actions];});
    container.append(table(el,["Merchant","UPI / User","Priority","Payment range","State","Readiness","Action"],rows));
    function create(){dialog(el,container,"Assign UPI route",(body,d)=>{const form=el("form",undefined,"form-grid"),banks=data.banks.filter(b=>!b.frozen&&["running","approved","verified","stopped"].includes(b.status)),merchants=data.accounts.filter(a=>a.account_type==="merchant"),bank=selectField(el,form,"bank","UPI account",banks.map(b=>[b.id,(b.details?.upiId||b.id)+" · "+b.owner_name])),merchant=selectField(el,form,"merchant","Merchant",merchants.map(m=>[m.id,m.name])),priority=field(el,form,"priority","Priority","50"),min=field(el,form,"min","Minimum INR","100"),max=field(el,form,"max","Maximum INR","10000"),reason=field(el,form,"reason","Reason","Merchant routing assignment"),minor=v=>{const [w,f=""]=String(v).split(".");return (BigInt(w)*100n+BigInt(f.padEnd(2,"0"))).toString();};const save=el("button","Create route","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const selected=bankById.get(bank.value);await post("business/admin-upi/route",{id:null,bankId:bank.value,version:selected.version,merchantId:merchant.value,priority:Number(priority.value),minMinor:minor(min.value),maxMinor:minor(max.value),enabled:true,reason:reason.value});d.close();await routingPage(o);});};});}
    function toggle(r){dialog(el,container,(r.status==="active"?"Disable ":"Enable ")+"route",(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",r.status==="active"?"Operational route disabled":"Operational route enabled"),bank=bankById.get(r.bank_id),save=el("button",r.status==="active"?"Disable":"Enable",r.status==="active"?"danger":"primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/admin-upi/route",{id:r.id,bankId:r.bank_id,version:bank.version,merchantId:r.merchant_id,priority:r.priority,minMinor:r.min_minor,maxMinor:r.max_minor,enabled:r.status!=="active",reason:reason.value});d.close();await routingPage(o);});};});}
  }

  async function assignmentsPage(o){
    const {request,post,action,el,container,title}=o;title.textContent="User assignments";container.replaceChildren();
    const data=await request("business/assignments"),name=id=>data.accounts.find(a=>a.id===id)?.name||id;
    const toolbar=el("div",undefined,"admin-toolbar");toolbar.append(el("p","Merchant-to-User assignment layer. Bank-specific UPI routes remain a separate collection-routing layer.","notice"));if(data.canUpdate)toolbar.append(button(el,"+ Assign User",()=>create(),"primary"));container.append(toolbar);
    const rows=data.assignments.map(a=>[name(a.merchant_id),name(a.user_id),a.priority,a.weight,money(a.min_minor)+" – "+money(a.max_minor),a.status,data.capacity[a.user_id]?.available?money(data.capacity[a.user_id].available):"—"]);
    container.append(table(el,["Merchant","User","Priority","Weight","Ticket range","State","User available"],rows));
    function create(){
      const d=document.createElement("dialog"),form=document.createElement("form"),select=(label,items)=>{const l=el("label",label),s=el("select");for(const [v,t] of items){const op=el("option",t);op.value=v;s.append(op);}l.append(s);form.append(l);return s;},inp=(label,value)=>{const l=el("label",label),i=el("input");i.value=value;i.required=true;l.append(i);form.append(l);return i;};
      const merchant=select("Merchant",data.accounts.filter(a=>a.account_type==="merchant").map(a=>[a.id,a.name])),user=select("User",data.accounts.filter(a=>a.account_type==="user").map(a=>[a.id,a.name])),priority=inp("Priority","100"),weight=inp("Weight","1"),min=inp("Minimum INR","1.00"),max=inp("Maximum INR","10000.00");
      const minor=v=>{const [w,f=""]=v.split(".");return (BigInt(w)*100n+BigInt(f.padEnd(2,"0"))).toString();},save=el("button","Assign","primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/assignments/update",{id:null,merchantId:merchant.value,userId:user.value,priority:Number(priority.value),weight:Number(weight.value),minMinor:minor(min.value),maxMinor:minor(max.value),enabled:true});d.close();await assignmentsPage(o);});};d.append(el("h2","Assign Merchant to User"),form);container.append(d);d.showModal();
    }
  }

  async function devicesPage(o){
    const {post,action,el,container,title}=o;title.textContent="Devices";container.replaceChildren();
    const data=await post("operations/device-setup",{});
    const metrics=el("div",undefined,"admin-primary-kpis");metrics.append(metric(el,"Linked devices",data.devices.length,"Scoped ownership links"),metric(el,"Online",data.devices.filter(x=>x.status==="online").length,"Heartbeat within 120s"),metric(el,"Offline",data.devices.filter(x=>x.status==="offline").length,"Linked but stale"),metric(el,"Pairing",data.pairingAvailable?"Ready":"Unavailable","Pairing bridge status"));container.append(metrics);
    const grid=el("div",undefined,"device-grid");
    for(const d of data.devices){
      const card=el("article",undefined,"card device-card"),top=el("div",undefined,"device-top"),copy=el("div",undefined,"device-model");copy.append(el("h3",d.model||d.device),el("p",(d.ownerName||"—")+" · "+d.device));top.append(copy,el("span",d.status,"admin-state "+d.status));card.append(top);
      const stats=el("div",undefined,"device-stats"),fact=(label,value)=>{const x=el("div",undefined,"fact");x.append(el("label",label),el("strong",String(value??"—")));return x;};stats.append(fact("Phone",d.phone||"Unavailable"),fact("Carrier",d.carrier||"Unavailable"),fact("APK",d.apkVersion||"Unavailable"),fact("Last seen",d.lastSeenAt?new Date(d.lastSeenAt).toLocaleString("en-IN"):"Unavailable"));card.append(stats);
      const actions=el("div",undefined,"account-card-actions");if(!d.legacyMapping)actions.append(button(el,"Health & location history",()=>detail(d)));if(data.canRevoke)actions.append(button(el,"Unlink from WPay",()=>action(async()=>{await post("operations/device-setup/revoke",{id:d.id});await devicesPage(o);}),"danger"));card.append(actions);grid.append(card);
    }container.append(grid);
    function detail(d){action(async()=>{const info=await post("operations/device-setup/detail",{id:d.id}),dialog=document.createElement("dialog"),wrap=el("div"),rows=info.history.map(h=>[new Date(h.at).toLocaleString("en-IN"),(h.battery??"—")+"% / "+(h.health||"—"),h.network||"—",h.latitude==null?"Unavailable":h.latitude+", "+h.longitude,h.locationPermission==null?"Unavailable":h.locationPermission&&h.locationEnabled?"Enabled":"Disabled"]);wrap.append(el("p","Last 48 hours · diagnostic metadata only.","notice"),table(el,["Time","Battery / health","Network","Location","Location permission"],rows));dialog.append(el("h2","Device details · "+d.device),wrap,button(el,"Close",()=>dialog.close()));container.append(dialog);dialog.showModal();});}
  }

  async function activationPage(o){
    const {post,action,el,container,title}=o;title.textContent="Activation codes";container.replaceChildren();
    const [setup,history]=await Promise.all([post("operations/device-setup",{}),post("operations/pairing-history",{offset:0})]);
    const toolbar=el("div",undefined,"admin-toolbar");toolbar.append(el("p","Pairing codes are account-owned and separate from OTP-event permissions.","notice"));const generate=button(el,"Generate activation code",()=>issue(),"primary");generate.disabled=!setup.canCreate;toolbar.append(generate);container.append(toolbar);
    const rows=history.requests.map(r=>{const actions=el("div",undefined,"admin-row-actions");if(r.canCheck)actions.append(button(el,"Check",()=>action(()=>post("operations/device-setup/poll",{requestId:r.id}))));if(r.canRevoke)actions.append(button(el,"Revoke",()=>action(async()=>{await post("operations/device-setup/revokeCode",{requestId:r.id});await activationPage(o);}),"danger"));return [new Date(r.created_at).toLocaleString("en-IN"),r.owner_name,r.state,r.device_ref||"—",new Date(r.expires_at).toLocaleString("en-IN"),actions];});container.append(table(el,["Created","Owner","Status","Device","Expires","Action"],rows));
    function issue(){action(async()=>{const result=await post("operations/device-setup/create",{requestId:crypto.randomUUID()}),d=document.createElement("dialog"),code=el("code",result.pairingCode,"code-secret");d.append(el("h2","Enter this code in WPay Agent"),code,el("p","Expires "+new Date(result.expiresAt).toLocaleString("en-IN")),button(el,"Copy code",()=>navigator.clipboard?.writeText(result.pairingCode)),button(el,"Close",()=>d.close()));container.append(d);d.showModal();});}
  }


  async function utrCapture(o){
    const {post,el,container,title}=o;title.textContent="UTR Capture";container.replaceChildren();
    const data=await post("operations/transactions",{offset:0,status:""}),observations=data.records.flatMap(r=>(r.observations||[]).map(x=>({...x,reference:r.reference,orderId:r.orderId,userId:r.userId,merchantId:r.merchantId,status:r.status,accounting:r.accountingState,recovered:r.recovered})));
    const statement=observations.filter(x=>x.source==="statement"||x.recovered),verified=observations.filter(x=>x.verified),pending=data.records.filter(r=>["pending_payment","verification_pending","recovery_review"].includes(r.status));
    const metrics=el("div",undefined,"admin-primary-kpis");metrics.append(metric(el,"Total UTR captures",observations.length,"Scoped observations"),metric(el,"Verified",verified.length,"Independent evidence"),metric(el,"Statement captured",statement.length,"Statement/recovery source"),metric(el,"Pending review",pending.length,"Orders awaiting evidence"));
    container.append(metrics,el("p","Captured UTR observations and financial approval are separate evidence surfaces. Manual Admin approval remains explicit and does not become bank verification.","notice"));
    const rows=observations.sort((a,b)=>new Date(b.capturedAt)-new Date(a.capturedAt)).map(x=>[new Date(x.capturedAt).toLocaleString("en-IN"),x.reference,x.utr,x.source,x.userId||"—",x.merchantId||"—",x.verified?"verified":"observed",x.accounting]);
    container.append(table(el,["Captured","Reference","UTR","Source","User","Merchant","Evidence","Accounting"],rows));
  }

  async function statementsPage(o){
    const {request,post,action,el,container,title}=o;title.textContent="Statements & reconciliation";container.replaceChildren();
    const [data,recovery]=await Promise.all([request("operations/statements"),post("operations/transactions",{offset:0,status:"recovery_review"})]);
    const toolbar=el("div",undefined,"admin-toolbar");toolbar.append(el("p",data.message||"Statement import is onboarding/reconciliation evidence and never posts credit by upload alone.","notice"));container.append(toolbar);
    const metrics=el("div",undefined,"admin-primary-kpis");metrics.append(metric(el,"Authorized banks",data.banks.length,"Scoped receiving accounts"),metric(el,"Statement imports",data.imports.length,"Uploaded/parser records"),metric(el,"Accepted imports",data.imports.filter(x=>x.status==="accepted").length,"Parser accepted"),metric(el,"Recovery review",recovery.records.length,"Pay-ins under reconciliation"));container.append(metrics);
    const bankRows=data.banks.map(b=>{
      const actions=el("div",undefined,"admin-row-actions"),upload=button(el,"Upload statement",()=>uploadFor(b),"primary");actions.append(upload);return [b.ownerName,b.id,b.version,b.status,data.imports.filter(x=>x.bank_id===b.id).length,actions];
    });container.append(el("h2","Statement sources"),table(el,["User","Bank reference","Version","State","Imports","Action"],bankRows));
    container.append(el("h2","Import history"),table(el,["Import","Owner","Bank","Version","Rows","Credits","State","Reason"],data.imports.map(i=>[i.id,i.owner_id,i.bank_id,i.bank_version,i.rows_scanned,i.credit_count,i.status,i.reason||"—"])));
    container.append(el("h2","Reconciliation review"),table(el,["Reference","User","Merchant","Amount","Evidence","Accounting","UTR observations"],recovery.records.map(r=>[r.reference,r.userId||"—",r.merchantId||"—",money(r.amountMinor),r.evidenceState,r.accountingState,(r.observations||[]).map(x=>x.utr+" · "+x.source).join(" | ")||"—"])));
    function uploadFor(bank){
      const d=document.createElement("dialog"),form=document.createElement("form"),label=el("label","Statement file"),input=el("input");input.type="file";input.accept=".csv,.xls,.xlsx";input.required=true;label.append(input);form.append(label);const save=el("button","Upload targeted statement","primary");save.type="submit";form.append(el("p","The existing statement parser runs server-side. Upload alone does not establish ownership or financial credit.","notice"),save,button(el,"Cancel",()=>d.close()));
      form.onsubmit=e=>{e.preventDefault();action(async()=>{const chosen=input.files[0];if(!chosen||chosen.size>1048576)throw Error("Choose a statement up to 1 MiB");const bytes=new Uint8Array(await chosen.arrayBuffer());let raw="";for(const byte of bytes)raw+=String.fromCharCode(byte);await post("operations/statement/upload",{ownerId:bank.ownerId,bankId:bank.id,version:bank.version,requestId:crypto.randomUUID(),format:chosen.name.split(".").at(-1).toLowerCase(),base64:btoa(raw)});d.close();await statementsPage(o);});};d.append(el("h2","Upload statement · "+bank.ownerName),form);container.append(d);d.showModal();
    }
  }


  async function payoutReview(o){
    const {post,action,el,container,title}=o;title.textContent="Payout review";container.replaceChildren();
    const data=await post("payout/search",{offset:0,limit:25});
    const metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(
      metric(el,"Orders",data.orders.length,"Scoped payout history"),
      metric(el,"Submitted",data.orders.filter(x=>x.status==="submitted").length,"Waiting Merchant review"),
      metric(el,"Admin review",data.orders.filter(x=>x.status==="merchant_rejected_review").length,"Merchant rejected / escalated"),
      metric(el,"Successful",data.orders.filter(x=>x.status==="successful").length,"Settled"),
      metric(el,"Reversed",data.orders.filter(x=>x.status==="reversed").length,"Invalid dispute reversal"),
      metric(el,"Open",data.orders.filter(x=>x.status==="open").length,"Available for claiming")
    );container.append(metrics,el("p","Current server policy keeps submitted payouts with Merchant review first. Admin resolution is available on escalated merchant_rejected_review records. Submitted payouts can also auto-approve after the configured review timeout.","notice"));
    const rows=data.orders.map(p=>{
      const actions=el("div",undefined,"admin-row-actions");actions.append(button(el,"Details",()=>detail(p)));
      if(p.status==="merchant_rejected_review"){actions.append(button(el,"Mark paid",()=>resolve(p,"paid"),"primary"),button(el,"Not paid",()=>resolve(p,"not_paid"),"danger"));}
      return [p.reference,money(p.amountMinor),p.status,p.claimedAt?new Date(p.claimedAt).toLocaleString("en-IN"):"—",p.submittedAt?new Date(p.submittedAt).toLocaleString("en-IN"):"—",p.completedAt?new Date(p.completedAt).toLocaleString("en-IN"):"—",actions];
    });container.append(table(el,["Reference","Amount","State","Claimed","Submitted","Completed","Action"],rows));
    function detail(p){action(async()=>{const d=await post("payout/get",{id:p.id}),dialog=document.createElement("dialog"),wrap=el("div"),facts=el("div",undefined,"kv-grid"),add=(l,v)=>{const x=el("div",undefined,"v5-fact");x.append(el("small",l),el("strong",String(v??"—")));facts.append(x);};add("Reference",d.reference);add("Merchant",d.merchantId);add("Amount",money(d.amountMinor));add("State",d.status);add("UTR",d.evidence?.utr||"—");add("Proof",d.proof?.name||"—");wrap.append(facts);if(d.audit?.length)wrap.append(el("h3","Audit"),table(el,["State","Reason","Time"],d.audit.map(a=>[a.state,a.reason||"—",new Date(a.created_at).toLocaleString("en-IN")])));dialog.append(el("h2","Payout details"),wrap,button(el,"Close",()=>dialog.close()));container.append(dialog);dialog.showModal();});}
    function resolve(p,decision){const d=document.createElement("dialog"),form=document.createElement("form"),l=el("label","Reason"),reason=el("input");reason.required=true;l.append(reason);form.append(l);const save=el("button",decision==="paid"?"Mark paid":"Mark not paid",decision==="paid"?"primary":"danger");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/resolve",{id:p.id,action:decision,reason:reason.value});d.close();await payoutReview(o);});};d.append(el("h2","Resolve payout"),form);container.append(d);d.showModal();}
  }

  async function payoutCapabilities(o){
    const {request,post,action,el,container,title}=o;title.textContent="Payout bank capabilities";container.replaceChildren();
    const data=await request("payout/capabilities"),metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Banks",data.banks.length,"Scoped bank versions"),metric(el,"Payout capable",data.banks.filter(x=>x.payout_capable).length,"Approved for payout work"),metric(el,"Running",data.banks.filter(x=>x.status==="running").length,"Current bank state"),metric(el,"Frozen",data.banks.filter(x=>x.frozen).length,"Cannot be enabled while frozen"));container.append(metrics,el("p","A payout capability belongs to an approved + verified bank version. Revoking it prevents that bank version from being used for payout work.","notice"));
    const rows=data.banks.map(b=>{const actions=el("div",undefined,"admin-row-actions");actions.append(button(el,b.payout_capable?"Revoke":"Enable",()=>change(b),b.payout_capable?"danger":"primary"));return [b.id,b.owner_id,"v"+b.version,b.status,b.frozen?"frozen":"available",b.payout_capable?"payout capable":"not capable",actions];});container.append(table(el,["Bank","Owner","Version","State","Availability","Capability","Action"],rows));
    function change(b){const d=document.createElement("dialog"),form=document.createElement("form"),l=el("label","Reason"),reason=el("input");reason.required=true;l.append(reason);form.append(l);const enabled=!b.payout_capable,save=el("button",enabled?"Enable payout bank":"Revoke capability",enabled?"primary":"danger");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/capability",{bankId:b.id,version:b.version,enabled,reason:reason.value});d.close();await payoutCapabilities(o);});};d.append(el("h2",enabled?"Enable payout capability":"Revoke payout capability"),form);container.append(d);d.showModal();}
  }

  async function merchantUsdt(o){
    const {request,post,action,el,container,title}=o;title.textContent="Merchant USDT";container.replaceChildren();
    const data=await request("payout/merchant-usdt-admin"),requests=data.requests||[],metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Requests",requests.length,"Merchant settlement withdrawals"),metric(el,"Requested",requests.filter(x=>x.state==="requested").length,"Awaiting review"),metric(el,"Processing",requests.filter(x=>x.state==="processing").length,"Manual processing"),metric(el,"Completed",requests.filter(x=>x.state==="completed").length,"Recorded completion"));container.append(metrics,el("p","Merchant USDT settlement uses the versioned Admin rate. Processing is manual and completion records a reference; it does not claim automatic blockchain confirmation.","notice"));
    const rows=requests.map(r=>{const actions=el("div",undefined,"admin-row-actions");if(r.state==="requested")actions.append(button(el,"Review",()=>transition(r,"review")),button(el,"Approve",()=>transition(r,"approve"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));if(r.state==="review")actions.append(button(el,"Approve",()=>transition(r,"approve"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));if(r.state==="approved")actions.append(button(el,"Process",()=>transition(r,"process"),"primary"));if(r.state==="processing")actions.append(button(el,"Complete",()=>complete(r),"primary"));return [r.merchantName||r.merchantId,money(r.inrMinor),(BigInt(r.usdtMinor||0)/1000000n).toLocaleString("en-IN")+" USDT","₹"+r.rate,r.network,r.state,actions];});container.append(table(el,["Merchant","INR reserved","USDT quote","Rate","Network","State","Action"],rows));
    function transition(r,command){const d=document.createElement("dialog"),form=document.createElement("form"),l=el("label","Reason"),reason=el("input");reason.required=true;l.append(reason);form.append(l);const save=el("button",command,command==="reject"?"danger":"primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/merchant-usdt/transition",{id:r.id,action:command,reason:reason.value});d.close();await merchantUsdt(o);});};d.append(el("h2","Merchant USDT · "+command),form);container.append(d);d.showModal();}
    function complete(r){const d=document.createElement("dialog"),form=document.createElement("form"),field=(label,value="")=>{const l=el("label",label),i=el("input");i.value=value;i.required=true;l.append(i);form.append(l);return i;},reason=field("Reason"),reference=field("Completion reference"),network=field("Network",r.network),at=field("Completed at (UTC)",new Date().toISOString().replace(/\.\d{3}Z$/,"Z"));const save=el("button","Complete","primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/merchant-usdt/transition",{id:r.id,action:"complete",reason:reason.value,reference:reference.value,network:network.value,completedAt:at.value});d.close();await merchantUsdt(o);});};d.append(el("h2","Complete Merchant USDT"),form);container.append(d);d.showModal();}
  }

  async function withdrawals(o){
    const {post,action,el,container,title}=o;title.textContent="Commission withdrawals";container.replaceChildren();
    const data=await post("payout/withdrawal/search",{offset:0,limit:50}),requests=data.withdrawals||[],metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Requests",requests.length,"User commission withdrawals"),metric(el,"Requested",requests.filter(x=>x.state==="requested").length,"Awaiting review"),metric(el,"Processing",requests.filter(x=>x.state==="processing").length,"Manual processing"),metric(el,"Completed",requests.filter(x=>x.state==="completed").length,"Completed withdrawals"));container.append(metrics,el("p","INR withdrawals reserve the gross commission amount and carry the current 0.5% fee inside that reservation. USDT uses the versioned User rate/network.","notice"));
    const rows=requests.map(r=>{const actions=el("div",undefined,"admin-row-actions");if(r.state==="requested")actions.append(button(el,"Review",()=>transition(r,"review")),button(el,"Approve",()=>transition(r,"approve"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));if(r.state==="review")actions.append(button(el,"Approve",()=>transition(r,"approve"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));if(r.state==="approved")actions.append(button(el,"Process",()=>transition(r,"process"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));if(r.state==="processing")actions.append(button(el,"Complete",()=>complete(r),"primary"));return [r.userId,r.currency,r.currency==="INR"?money(r.amountMinor):(BigInt(r.amountMinor||0)/1000000n).toLocaleString("en-IN")+" USDT",money(r.feeMinor||0),r.currency==="INR"?money(r.netMinor||r.amountMinor):(BigInt(r.netMinor||r.amountMinor||0)/1000000n).toLocaleString("en-IN")+" USDT",r.state,r.reason||"—",actions];});container.append(table(el,["User","Currency","Gross / amount","Fee","Net","State","Reason","Action"],rows));
    function transition(r,command){const d=document.createElement("dialog"),form=document.createElement("form"),l=el("label","Reason"),reason=el("input");reason.required=true;l.append(reason);form.append(l);const save=el("button",command,command==="reject"?"danger":"primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/withdrawal/transition",{id:r.id,action:command,reason:reason.value});d.close();await withdrawals(o);});};d.append(el("h2","Withdrawal · "+command),form);container.append(d);d.showModal();}
    function complete(r){const d=document.createElement("dialog"),form=document.createElement("form"),field=(label,value="")=>{const l=el("label",label),i=el("input");i.value=value;i.required=true;l.append(i);form.append(l);return i;},reason=field("Reason"),reference=field(r.currency==="INR"?"12-digit UTR":"Completion reference"),network=r.currency==="USDT"?field("Network","TRON-TRC20"):null,at=field("Completed at (UTC)",new Date().toISOString().replace(/\.\d{3}Z$/,"Z"));const save=el("button","Complete","primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/withdrawal/transition",{id:r.id,action:"complete",reason:reason.value,reference:reference.value,...(network?{network:network.value}:{}),completedAt:at.value});d.close();await withdrawals(o);});};d.append(el("h2","Complete withdrawal"),form);container.append(d);d.showModal();}
  }

  async function commissionHolds(o){
    const {post,action,el,container,title}=o;title.textContent="Commission holds";container.replaceChildren();
    const data=await post("payout/hold/search",{offset:0,limit:50}),holds=data.holds||[],metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Holds",holds.length,"Commission hold history"),metric(el,"Active",holds.filter(x=>!x.released_at).length,"Currently reducing entitlement"),metric(el,"Held value",money(holds.filter(x=>!x.released_at).reduce((n,x)=>n+BigInt(x.amount_minor||0),0n)),"Active commission holds"));container.append(metrics);
    const toolbar=el("div",undefined,"admin-toolbar");toolbar.append(el("p","Commission holds are separate from business/capacity holds and reduce withdrawable User commission.","notice"),button(el,"+ Place commission hold",()=>create(),"primary"));container.append(toolbar);
    const rows=holds.map(h=>{const actions=el("div",undefined,"admin-row-actions");if(!h.released_at)actions.append(button(el,"Release",()=>release(h),"primary"));return [h.user_id,money(h.amount_minor),h.reference,h.reason,new Date(h.created_at).toLocaleString("en-IN"),h.released_at?"released":"active",actions];});container.append(table(el,["User","Amount","Reference","Reason","Created","State","Action"],rows));
    function formBase(titleText,submitText,submitFn,seed={}){const d=document.createElement("dialog"),form=document.createElement("form"),field=(label,value="")=>{const l=el("label",label),i=el("input");i.value=value;i.required=true;l.append(i);form.append(l);return i;},user=field("User ID",seed.user||""),amount=field("Amount minor",seed.amount||""),reference=field("Reference",seed.reference||""),reason=field("Reason",seed.reason||"");const save=el("button",submitText,"primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await submitFn({user:user.value,amount:amount.value,reference:reference.value,reason:reason.value});d.close();await commissionHolds(o);});};d.append(el("h2",titleText),form);container.append(d);d.showModal();}
    function create(){formBase("Place commission hold","Place hold",async v=>post("payout/hold/manage",{id:crypto.randomUUID(),userId:v.user,amountMinor:v.amount,reference:v.reference,reason:v.reason,release:false}));}
    function release(h){formBase("Release commission hold","Release",async v=>post("payout/hold/manage",{id:h.id,userId:h.user_id,amountMinor:h.amount_minor,reference:h.reference,reason:v.reason,release:true}),{user:h.user_id,amount:h.amount_minor,reference:h.reference,reason:"Commission review completed"});}
  }

  async function businessHolds(o){
    const {request,post,action,el,container,title}=o;title.textContent="Holds / frozen";container.replaceChildren();
    const data=await request("business/holds"),holds=data.holds||[],metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Records",holds.length,"Business + dispute holds"),metric(el,"Active",holds.filter(x=>x.state==="active").length,"Currently held"),metric(el,"Active value",money(holds.filter(x=>x.state==="active").reduce((n,x)=>n+BigInt(x.amount_minor||0),0n)),"INR hold value"));container.append(metrics,el("p","Generic business holds/frozen records are distinct from commission holds and payout-dispute holds. Each domain retains separate accounting provenance.","notice"));
    const rows=holds.map(h=>{const actions=el("div",undefined,"admin-row-actions");if(data.canManage&&h.state==="active")actions.append(button(el,"Release",()=>release(h),"primary"));return [h.owner_id,money(h.amount_minor),h.category,h.reference,h.reason,h.state,new Date(h.created_at).toLocaleString("en-IN"),actions];});container.append(table(el,["Owner","Amount","Category","Reference","Reason","State","Created","Action"],rows));
    function release(h){const d=document.createElement("dialog"),form=document.createElement("form"),l=el("label","Reason"),reason=el("input");reason.required=true;l.append(reason);form.append(l);const save=el("button","Release","primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/holds/update",{id:h.id,ownerId:h.owner_id,amountMinor:h.amount_minor,reference:h.reference,reason:reason.value,release:true,category:h.category});d.close();await businessHolds(o);});};d.append(el("h2","Release hold"),form);container.append(d);d.showModal();}
  }


  async function credentialsPage(o){
    const {post,action,el,container,title}=o;title.textContent="API credentials";container.replaceChildren();
    const [data,merchants]=await Promise.all([post("panel/credentials",{offset:0}),post("panel/directory",{type:"merchant",status:"approved",search:"",offset:0})]);
    const toolbar=el("div",undefined,"admin-toolbar");toolbar.append(el("p","API credential metadata is tenant-scoped. Create/revoke is Super Admin-restricted and secret material is shown once.","notice"));if(data.canCreate)toolbar.append(button(el,"+ Create credential",()=>create(),"primary"));container.append(toolbar);
    const rows=data.rows.map(k=>{const actions=el("div",undefined,"admin-row-actions");if(data.canRevoke&&!k.revoked_at)actions.append(button(el,"Revoke",()=>revoke(k),"danger"));return [k.prefix,k.merchant_id,k.label,(k.scopes||[]).join(", "),k.revoked_at?"revoked":"active",k.last_used_at?new Date(k.last_used_at).toLocaleString("en-IN"):"—",actions];});container.append(table(el,["Prefix","Merchant","Label","Scopes","State","Last used","Action"],rows));
    function create(){const d=document.createElement("dialog"),form=document.createElement("form"),select=(label,items)=>{const l=el("label",label),x=el("select");for(const [v,t]of items){const op=el("option",t);op.value=v;x.append(op);}l.append(x);form.append(l);return x;},field=(label,value="")=>{const l=el("label",label),x=el("input");x.value=value;x.required=true;l.append(x);form.append(l);return x;},merchant=select("Merchant",merchants.rows.map(m=>[m.id,m.name])),label=field("Label","Production integration"),scope=select("Scopes",[["read","orders:read"],["write","orders:read + orders:write"]]),save=el("button","Create credential","primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{const result=await post("panel/credentials/create",{merchantId:merchant.value,label:label.value,scopes:scope.value==="write"?["orders:read","orders:write"]:["orders:read"]});d.close();const secret=document.createElement("dialog"),code=el("code",result.secret,"code-secret");secret.append(el("h2","Save credential secret"),el("p","This secret is shown once.","notice"),code,button(el,"Copy",()=>navigator.clipboard?.writeText(result.secret)),button(el,"Hide",()=>{code.textContent="Hidden";secret.close();credentialsPage(o);}));container.append(secret);secret.showModal();});};d.append(el("h2","Create API credential"),form);container.append(d);d.showModal();}
    function revoke(k){action(async()=>{await post("panel/credentials/revoke",{id:k.id});await credentialsPage(o);});}
  }

  async function webhooksPage(o){
    const {post,action,el,container,title}=o;title.textContent="Webhooks";container.replaceChildren();
    const [data,merchants]=await Promise.all([post("panel/webhooks",{offset:0}),post("panel/directory",{type:"merchant",status:"approved",search:"",offset:0})]);
    const endpointRows=(data.endpoints?.rows||[]).map(e=>[e.merchant_id,e.url,new Date(e.created_at).toLocaleString("en-IN"),e.id]);
    const toolbar=el("div",undefined,"admin-toolbar");toolbar.append(el("p","Webhook endpoint rotation and delivery retry are now available through scoped Admin panel actions.","notice"));if(data.canUpdate)toolbar.append(button(el,"Configure endpoint",()=>configure(),"primary"));container.append(toolbar);
    const grid=el("div",undefined,"grid two-col"),left=el("section",undefined,"card panel"),right=el("section",undefined,"card panel");left.append(el("h2","Endpoint configuration"),table(el,["Merchant","Endpoint","Created","Secret version"],endpointRows));
    const deliveries=data.rows.map(r=>{const actions=el("div",undefined,"admin-row-actions");if(data.canUpdate&&r.state==="pending"&&r.attempts<8)actions.append(button(el,"Retry",()=>retry(r),"primary"));return [r.merchant_id,r.event_type,r.state,r.attempts,r.last_code||"—",r.next_attempt_at?new Date(r.next_attempt_at).toLocaleString("en-IN"):"—",actions];});right.append(el("h2","Delivery history"),table(el,["Merchant","Event","State","Attempts","HTTP","Next attempt","Action"],deliveries));grid.append(left,right);container.append(grid);
    function configure(){const d=document.createElement("dialog"),form=document.createElement("form"),ml=el("label","Merchant"),m=el("select");for(const x of merchants.rows){const op=el("option",x.name);op.value=x.id;m.append(op);}ml.append(m);form.append(ml);const ul=el("label","HTTPS endpoint"),url=el("input");url.type="url";url.required=true;url.value="https://example.com/wpay";ul.append(url);form.append(ul);const save=el("button","Save endpoint","primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{const result=await post("panel/webhooks/configure",{merchantId:m.value,url:url.value});d.close();const secret=document.createElement("dialog"),code=el("code",result.secret,"code-secret");secret.append(el("h2","Webhook secret rotated"),el("p","Save this secret now. It is shown once.","notice"),code,button(el,"Copy",()=>navigator.clipboard?.writeText(result.secret)),button(el,"Hide",()=>{code.textContent="Hidden";secret.close();webhooksPage(o);}));container.append(secret);secret.showModal();});};d.append(el("h2","Configure Merchant webhook"),form);container.append(d);d.showModal();}
    function retry(r){action(async()=>{await post("panel/webhooks/retry",{id:r.id});await webhooksPage(o);});}
  }

  async function apiLogsPage(o){
    const {post,el,container,title}=o;title.textContent="API logs";container.replaceChildren();
    const data=await post("panel/api-logs",{offset:0});container.append(el("p","Audit-only API access metadata. Secrets and request bodies are not displayed.","notice"),table(el,["Time","Merchant","Operation","Log ID"],data.rows.map(r=>[new Date(r.created_at).toLocaleString("en-IN"),r.merchant_id,r.operation,r.id])));
  }

  async function notificationsPage(o){
    const {post,action,el,container,title}=o;title.textContent="Notifications";container.replaceChildren();
    const data=await post("panel/notifications",{offset:0}),grid=el("div",undefined,"grid two-col"),settings=el("section",undefined,"card panel"),history=el("section",undefined,"card panel");
    const line=el("div",undefined,"toggle-line"),copy=el("div");copy.append(el("strong","In-app notifications"),el("p","Enable or disable Admin in-app notification delivery."));const label=el("label",undefined,"switch"),input=el("input"),span=el("span");input.type="checkbox";input.checked=data.preferences.in_app_notifications;input.disabled=!data.canUpdate;label.append(input,span);line.append(copy,label);settings.append(el("h2","Notification preferences"),line);if(data.canUpdate)settings.append(button(el,"Save preference",()=>action(async()=>{await post("panel/preferences",{inAppNotifications:input.checked});await notificationsPage(o);}),"primary"));
    history.append(el("h2","Recent notifications"));for(const n of data.rows){const row=el("div",undefined,"summary-row");row.append(el("strong",n.event),el("span",new Date(n.created_at).toLocaleString("en-IN")));history.append(row);}if(!data.rows.length)history.append(el("p","No notification events.","admin-empty"));grid.append(settings,history);container.append(grid);
  }

  async function profilePage(o){
    const {account,request,post,action,el,container,title,navigate}=o;title.textContent="Profile";container.replaceChildren();
    const data=await request("panel/profile"),grid=el("div",undefined,"grid two-col"),profile=el("section",undefined,"card panel"),security=el("section",undefined,"card panel");profile.append(el("h2","Admin account"));
    const form=document.createElement("form"),label=el("label","Display name"),name=el("input");name.value=account.name;name.required=true;label.append(name);form.append(label);if(data.canEdit){const save=el("button","Save profile","primary");save.type="submit";form.append(save);form.onsubmit=e=>{e.preventDefault();action(async()=>{const r=await post("panel/profile/update",{name:name.value});account.name=r.name;await profilePage(o);});};}profile.append(form,el("p","Email: "+account.email,"notice"));
    security.append(el("h2","Account security"),el("p","Email/password changes and recent-auth confirmation use the live Security page.","notice"),button(el,"Open Security",()=>navigate("administration.account-security"),"primary"));grid.append(profile,security);container.append(grid);
  }

  async function settingsPage(o){
    const {request,el,container,title}=o;title.textContent="Settings";container.replaceChildren();
    const data=await request("panel/settings"),grid=el("div",undefined,"grid two-col"),auth=el("section",undefined,"card panel"),policy=el("section",undefined,"card panel");auth.append(el("h2","Authentication policy"));for(const [l,v] of [["Admin login",data.adminLogin],["Customer login",data.customerLogin],["Employee login",data.employeeLogin],["Session idle",data.sessionIdleMinutes+" minutes"],["Session maximum",data.sessionMaximumHours+" hours"],["Sensitive action confirmation",data.sensitiveActionConfirmationMinutes+" minutes"]]){const row=el("div",undefined,"summary-row");row.append(el("span",l),el("strong",String(v)));auth.append(row);}policy.append(el("h2","Platform behavior"),el("p","Security policy is server-enforced and not editable from this page.","notice"));for(const [l,v]of [["Temporary password",data.temporaryPasswordHours+" hours"],["Reset challenge",data.resetChallengeMinutes+" minutes"],["Security policy editable",data.securityPolicyEditable?"Yes":"No"]]){const row=el("div",undefined,"summary-row");row.append(el("span",l),el("strong",String(v)));policy.append(row);}grid.append(auth,policy);container.append(grid);
  }


  async function ledgerPage(o){
    const {request,post,el,container,title}=o;title.textContent="Ledger";container.replaceChildren();
    const data=await request("business/ledger"),entries=data.entries||[],types=[...new Set(entries.map(x=>x.ledger_type))];
    const metrics=el("div",undefined,"admin-primary-kpis");metrics.append(metric(el,"Entries",entries.length,"Current ledger page"),metric(el,"Ledger types",types.length,"Distinct accounting domains"),metric(el,"Credits",entries.filter(x=>x.direction==="credit").length,"Credit entries"),metric(el,"Debits",entries.filter(x=>x.direction==="debit").length,"Debit entries"));container.append(metrics,el("p","Live owner-side ledger projection. Immutable journals, balancing entries and idempotency data remain server authority.","notice"));
    const rows=entries.map(e=>[new Date(e.created_at).toLocaleString("en-IN"),e.owner_id,e.ledger_type,e.direction,money(e.amount_minor),e.reference_type,e.reference_id,e.payout_status||"—"]);
    container.append(table(el,["Time","Owner","Ledger type","Direction","Amount","Reference type","Reference","Payout state"],rows));
  }

  async function reportsPage(o){
    const {post,action,el,container,title}=o;title.textContent="Reports";container.replaceChildren();
    const data=await post("panel/reports",{offset:0}),metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Rows",data.rows.length,"Visible ledger rows"),metric(el,"Currencies",new Set(data.rows.map(x=>x.currency)).size,"Visible currencies"),metric(el,"Export",data.canExport?"Enabled":"Unavailable","Permission-controlled"),metric(el,"Period",new Date(data.from).toLocaleDateString("en-IN")+" – "+new Date(data.to).toLocaleDateString("en-IN"),"Current report window"));container.append(metrics);
    const summary=el("div",undefined,"admin-summary-grid");for(const [k,v]of Object.entries(data.totals||{})){const tile=el("article",undefined,"admin-summary-tile");tile.append(el("span",k.replaceAll("_"," ")),el("strong",String(v)));summary.append(tile);}container.append(summary);
    container.append(table(el,["Date","Owner","Ledger","Direction","Amount","Currency","Reference"],data.rows.map(r=>[new Date(r.created_at).toLocaleString("en-IN"),r.owner_id,r.ledger_type,r.direction,r.amount_minor,r.currency,r.reference_id])));
    if(data.canExport)container.append(button(el,"Export CSV",()=>action(async()=>{const out=await post("panel/reports/export",{offset:0,from:data.from,to:data.to}),url=URL.createObjectURL(new Blob([out.csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="wpay-report.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}),"primary"));
  }

  async function auditPage(o){
    const {post,el,container,title}=o;title.textContent="Audit log";container.replaceChildren();
    const data=await post("panel/admin-audit",{offset:0});container.append(el("p","Security, panel and business audit sources are combined in time order.","notice"),table(el,["Time","Source","Action","Actor","Target"],data.rows.map(r=>[new Date(r.created_at).toLocaleString("en-IN"),r.source,r.action,r.actor_id,r.target_id||"—"])));
  }

  async function supportPage(o){
    const {post,action,el,container,title}=o;title.textContent="Support";container.replaceChildren();
    const data=await post("panel/support",{offset:0});
    const metrics=el("div",undefined,"admin-primary-kpis");metrics.append(metric(el,"Tickets",data.rows.length,"Visible support queue"),metric(el,"Open",data.rows.filter(x=>x.status==="open").length,"Needs response"),metric(el,"Resolved",data.rows.filter(x=>x.status==="resolved").length,"Closed cases"),metric(el,"Write access",data.canWrite?"Enabled":"Read only","Permission-controlled"));container.append(metrics);
    const rows=data.rows.map(t=>{const actions=el("div",undefined,"admin-row-actions");if(data.canWrite)actions.append(button(el,"Reply / update",()=>reply(t),"primary"));return [new Date(t.created_at).toLocaleString("en-IN"),t.subject,t.message,t.status,t.reply||"—",actions];});container.append(table(el,["Created","Subject","Message","Status","Latest reply","Action"],rows));
    function reply(t){const d=document.createElement("dialog"),form=document.createElement("form"),statusLabel=el("label","Status"),status=el("select");for(const v of ["open","resolved"]){const op=el("option",v);op.value=v;status.append(op);}status.value=t.status;statusLabel.append(status);form.append(statusLabel);const l=el("label","Reply"),message=el("textarea");message.required=true;l.append(message);form.append(l);const save=el("button","Save reply","primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("panel/support/update",{requestId:crypto.randomUUID(),id:t.id,status:status.value,message:message.value});d.close();await supportPage(o);});};d.append(el("h2","Support ticket"),form);container.append(d);d.showModal();}
  }

  async function apkPage(o){
    const {request,el,container,title}=o;title.textContent="APK / Agent";container.replaceChildren();
    const data=await request("apk"),metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Package",data.package,"Android Agent"),metric(el,"Version",data.version+" / "+data.build,"Current artifact"),metric(el,"Minimum Android",data.minimumAndroidApi,"API level"),metric(el,"File size",data.bytes,"Bytes"),metric(el,"Signing",data.signing?.identity||"—","Verified signer"),metric(el,"Refreshed",data.refreshedAt?new Date(data.refreshedAt).toLocaleString("en-IN"):"—","Artifact metadata"));
    container.append(metrics,el("p","APK artifact metadata is hash-bound and read-only here. OTP capture logic is not modified by this Admin UI work.","notice"));
    const link=el("a","Download WPAY Agent","primary");link.href="/wpay-auth/roles/admin/apk/download";link.download="WPAY-Agent.apk";container.append(link);
  }



  async function financeSnapshot(o){
    return o.post("panel/admin-finance",{offset:0});
  }
  async function profitOverviewPage(o){
    const {el,container,title}=o;title.textContent="Profit overview";const d=await financeSnapshot(o),fees=d.fees||{},m=k=>BigInt(fees[k]||0),merchantFees=m("merchant_platform_fee")+m("merchant_payout_fee"),userCommissions=m("user_commission")+m("user_payout_commission");
    container.replaceChildren();const grid=el("div",undefined,"admin-primary-kpis");grid.append(metric(el,"Merchant fees",money(merchantFees),"Posted pay-in + payout fees"),metric(el,"User commissions",money(userCommissions),"Pay-in + payout"),metric(el,"Salary & expenses",money(d.totalCosts||0),"Recorded operating costs"),metric(el,"Operating margin",money(d.operatingMargin||0),"Fees − commissions − costs"));container.append(grid,el("p","USDT exchange profit is excluded until acquisition-cost matching exists.","notice"));
  }
  async function financePayinPage(o){
    const {el,container,title}=o;title.textContent="Pay-in fees & commissions";const d=await financeSnapshot(o),f=d.fees||{},fees=BigInt(f.merchant_platform_fee||0),comm=BigInt(f.user_commission||0);container.replaceChildren();const grid=el("div",undefined,"admin-primary-kpis");grid.append(metric(el,"Merchant pay-in fees",money(fees),"Successful pay-ins"),metric(el,"User pay-in commission",money(comm),"User earnings"),metric(el,"Pay-in margin",money(fees-comm),"Fee less commission"));container.append(grid);
  }
  async function financePayoutPage(o){
    const {el,container,title}=o;title.textContent="Payout fees & commissions";const d=await financeSnapshot(o),f=d.fees||{},fees=BigInt(f.merchant_payout_fee||0),comm=BigInt(f.user_payout_commission||0);container.replaceChildren();const grid=el("div",undefined,"admin-primary-kpis");grid.append(metric(el,"Merchant payout fees",money(fees),"Successful payouts"),metric(el,"User payout commission",money(comm),"User earnings"),metric(el,"Payout margin",money(fees-comm),"Fee less commission"));container.append(grid,el("p","Fixed payout fees are already included in posted Merchant payout fees and are not double-counted.","notice"));
  }
  async function financeFixedPage(o){
    const {el,container,title}=o;title.textContent="Fixed payout revenue";const d=await financeSnapshot(o),p=d.payout||{};container.replaceChildren();const grid=el("div",undefined,"admin-primary-kpis");grid.append(metric(el,"Successful payouts",p.count||0,"Net successful payouts"),metric(el,"Fixed payout revenue",money(p.fixed||0),"Fixed fee component"),metric(el,"Percentage payout fees",money(p.percentage||0),"Percentage component"));container.append(grid);
  }
  async function financeUsdtPage(o){
    const {el,container,title}=o;title.textContent="USDT exchange";const d=await financeSnapshot(o),fund=d.funding||{},set=d.settlement||{},usdt=v=>{const n=BigInt(v||0),a=n<0n?-n:n,s=a.toString().padStart(7,"0");return (n<0n?"−":"")+s.slice(0,-6)+"."+s.slice(-6)+" USDT";};container.replaceChildren();const grid=el("div",undefined,"admin-primary-kpis");grid.append(metric(el,"Confirmed User deposits",usdt(fund.usdt),"USDT received"),metric(el,"INR capacity credited",money(fund.inr||0),"Funding conversion"),metric(el,"Completed Merchant settlements",usdt(set.usdt),"USDT settlement"),metric(el,"INR settled",money(set.inr||0),"Settlement principal"));container.append(grid,el("p","FX profit is intentionally unavailable; deposit-vs-settlement difference is not treated as profit.","notice"));
  }
  async function expensePage(o,mode){
    const {post,action,el,container,title}=o,d=await financeSnapshot(o),salary=mode==="salary";title.textContent=salary?"Salary management":"Expense management";container.replaceChildren(el("p","These records affect reporting only; saving does not transfer money. Voided entries remain auditable.","notice"));
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(d.canManage)tools.append(button(el,salary?"+ Record salary":"+ Record expense",()=>create(),"primary"));}
    const rows=(d.expenses||[]).filter(e=>salary?e.category==="salary":e.category!=="salary").map(e=>[new Date(e.occurred_at).toLocaleString("en-IN"),e.category,e.payee,money(e.amount_minor),e.description,e.void_reason?"voided":"recorded",!e.void_reason&&d.canManage?button(el,"Void",()=>voidExpense(e),"danger"):"—"]);container.append(table(el,["Date","Category","Payee","Amount","Reference","State","Action"],rows));
    function create(){dialog(el,container,salary?"Record salary payment":"Record expense",(body,dlg)=>{const form=el("form",undefined,"form-grid"),tenant=selectField(el,form,"tenant","Workspace",(d.tenants||[]).map(x=>[x,x]),d.tenants?.[0]),category=selectField(el,form,"category","Category",salary?[["salary","Salary"]]:[["server","Server"],["maintenance","Maintenance"],["other","Other"]],salary?"salary":"server"),payee=field(el,form,"payee",salary?"Employee name / reference":"Payee"),amount=field(el,form,"amount","Amount INR"),description=field(el,form,"description","Description / payment reference"),save=el("button","Save record","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const [w,f=""]=String(amount.value).split("."),minor=(BigInt(w)*100n+BigInt(f.padEnd(2,"0"))).toString();await post("panel/expense/create",{requestId:crypto.randomUUID(),tenantId:tenant.value,category:category.value,payee:payee.value,amountMinor:minor,occurredAt:new Date().toISOString(),description:description.value});dlg.close();await expensePage(o,mode);});};});}
    function voidExpense(e){dialog(el,container,"Void expense",(body,dlg)=>{const form=el("form"),reason=field(el,form,"reason","Reason","Incorrect expense record"),save=el("button","Confirm void","danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=x=>{x.preventDefault();action(async()=>{await post("panel/expense/void",{id:e.id,reason:reason.value});dlg.close();await expensePage(o,mode);});};});}
  }
  async function securityPage(o){
    const {request,el,container,title,navigate}=o;title.textContent="Security";const data=await request("panel/settings");container.replaceChildren();const grid=el("div",undefined,"grid two-col"),auth=el("section",undefined,"card admin-panel"),boundaries=el("section",undefined,"card admin-panel");auth.append(el("h2","Authentication policy"));for(const [l,v]of [["Admin login",data.adminLogin],["Customer login",data.customerLogin],["Employee login",data.employeeLogin],["Session idle",data.sessionIdleMinutes+" minutes"],["Session maximum",data.sessionMaximumHours+" hours"],["Sensitive action confirmation",data.sensitiveActionConfirmationMinutes+" minutes"]]){const row=el("div",undefined,"summary-row");row.append(el("span",l),el("strong",String(v)));auth.append(row);}boundaries.append(el("h2","Authority boundaries"));for(const [l,v]of [["Tenant scoping","Required for Admin data access"],["Recent authentication","Required for high-risk changes"],["Super Admin platform scope","Required for API key/Admin authority"],["Operational OTP reader","Restricted read access"]]){const row=el("div",undefined,"summary-row");row.append(el("span",l),el("strong",v));boundaries.append(row);}boundaries.append(el("p","Use Account settings for password/email changes and recent-auth confirmation.","notice"),button(el,"Open Account settings",()=>navigate("administration.account-security"),"primary"));grid.append(auth,boundaries);container.append(grid);
  }

  async function collectionAccessPage(o){
    const {request,post,action,el,container,title}=o;title.textContent="User collection access";container.replaceChildren();
    const data=await request("business/user-access"),policy=el("div",undefined,"policy-grid");
    for(const [name,body]of [["Free Setup","Allows APK/device and bank/UPI setup even when funded available capacity is zero."],["Unlimited Collection","Exempts collection routing from capacity insufficiency only. Account, device, UPI, ticket and daily limits still apply."],["First deposit policy","Without Free Setup, first confirmed deposit requires at least 2,000 USDT. After confirmed history, later top-ups may be smaller."]]){const c=el("article",undefined,"policy-card");c.append(el("strong",name),el("p",body));policy.append(c);}container.append(policy);
    const rows=data.users.map(u=>{const available=BigInt(u.available_minor||0),setup=u.free_setup||available>0n,actions=el("div",undefined,"admin-row-actions");actions.append(button(el,"Manage access",()=>edit(u)));return [u.name+" · "+u.id,money(available),u.free_setup?"enabled":"disabled",u.unlimited_collection?"enabled":"disabled",setup?"setup allowed":"funding required",u.unlimited_collection?"Capacity exempt":"Capacity backed",actions];});
    container.append(table(el,["User","Capacity","Free setup","Unlimited collection","Setup status","Collection mode","Action"],rows),el("p","Unlimited Collection bypasses capacity, not security: User active/approved, device eligibility, UPI approval/verification, route min/max and per-UPI daily limit checks still apply.","notice"));
    function edit(u){dialog(el,container,"Collection access · "+u.name,(body,d)=>{const form=document.createElement("form"),toggle=(labelText,checked)=>{const line=el("div",undefined,"toggle-line"),copy=el("div"),wrap=el("label",undefined,"switch"),input=el("input"),span=el("span");copy.append(el("strong",labelText));input.type="checkbox";input.checked=checked;wrap.append(input,span);line.append(copy,wrap);form.append(line);return input;},free=toggle("Free Setup",u.free_setup),unlimited=toggle("Unlimited Collection",u.unlimited_collection),reason=field(el,form,"reason","Reason",u.reason||"Admin collection access update"),save=el("button","Save access","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/user-access/update",{userId:u.id,freeSetup:free.checked,unlimitedCollection:unlimited.checked,reason:reason.value});d.close();await collectionAccessPage(o);});};});}
  }

  async function transactionsPage(o){
    const {post,el,container,title}=o;title.textContent="Transactions";container.replaceChildren();
    const [payins,payouts]=await Promise.all([post("operations/transactions",{offset:0,status:""}),post("payout/search",{offset:0,limit:50})]);
    const toolbar=el("div",undefined,"toolbar"),search=el("input"),status=el("select");search.className="control grow";search.placeholder="Search reference, UTR, merchant, user…";for(const v of ["","successful","verification_pending","failed"]){const op=el("option",v||"All status");op.value=v;status.append(op);}status.className="control";toolbar.append(search,status);const panel=el("section",undefined,"card admin-panel");container.append(toolbar,panel);
    const records=[
      ...payins.records.map(t=>({at:t.createdAt,reference:t.reference,id:t.orderId,type:"Pay-in",merchant:t.merchantId||"—",user:t.userId||"—",amount:t.amountMinor,utr:(t.observations||[]).map(x=>x.utr).join(", ")||"—",status:t.status,evidence:t.evidenceState||"—"})),
      ...payouts.orders.map(t=>({at:t.createdAt,reference:t.reference,id:t.id,type:"Payout",merchant:t.merchantId||"—",user:t.claimUserId||t.userId||"—",amount:t.amountMinor,utr:t.utr||"—",status:t.status,evidence:"payout workflow"}))
    ];
    const draw=()=>{const q=search.value.trim().toLowerCase(),st=status.value,rows=records.filter(t=>(!st||t.status===st)&&[t.reference,t.utr,t.merchant,t.user,t.id].join(" ").toLowerCase().includes(q)).map(t=>[t.at?new Date(t.at).toLocaleString("en-IN"):"—",t.reference+" · "+t.id,t.type,t.merchant+" · "+t.user,money(t.amount),t.utr,t.status,t.evidence]);panel.replaceChildren(table(el,["Time","Reference","Type","Merchant / User","Amount","UTR","Status","Evidence"],rows));};search.oninput=draw;status.onchange=draw;draw();
  }

  async function payoutDisputes(o){
    const {post,action,el,container,title}=o;title.textContent="Post-approval disputes";container.replaceChildren();
    const data=await post("payout/dispute/search",{offset:0,limit:25}),metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Disputes",data.orders.length,"48-hour payout disputes"),metric(el,"Pending",data.orders.filter(x=>x.status==="pending").length,"Awaiting Admin resolution"),metric(el,"Payment valid",data.orders.filter(x=>x.status==="payment_valid").length,"Holds released"),metric(el,"Payment invalid",data.orders.filter(x=>x.status==="payment_invalid").length,"Original path reversed"));container.append(metrics,el("p","Merchant statement coverage, User response proof, capacity hold and payout-commission hold are reviewed before a payment_valid/payment_invalid decision.","notice"));
    const rows=data.orders.map(d=>{const actions=el("div",undefined,"admin-row-actions");actions.append(button(el,"Review details",()=>review(d),"primary"));return [d.reference,money(d.amountMinor),d.reason,d.status,new Date(d.created_at).toLocaleString("en-IN"),actions];});container.append(table(el,["Payout","Amount","Reason","Status","Opened","Action"],rows));
    function review(d){action(async()=>{const p=await post("payout/get",{id:d.id}),dialog=document.createElement("dialog"),wrap=el("div"),dis=p.dispute||{},facts=el("div",undefined,"kv-grid"),add=(l,v)=>{const x=el("div",undefined,"v5-fact");x.append(el("small",l),el("strong",String(v??"—")));facts.append(x);};add("Reference",p.reference);add("Amount",money(p.amountMinor));add("Merchant",p.merchantId);add("Dispute status",dis.status);add("Capacity held",dis.status==="pending"?money(dis.amountMinor):money(0));add("Commission held",dis.status==="pending"?money(dis.commissionMinor):money(0));add("Coverage from",dis.coverageFrom?new Date(dis.coverageFrom).toLocaleString("en-IN"):"—");add("Coverage through",dis.coverageThrough?new Date(dis.coverageThrough).toLocaleString("en-IN"):"—");wrap.append(facts,el("p",dis.reason||"—","notice"));
      if(dis.status==="pending"){const form=document.createElement("form"),l=el("label","Resolution reason"),reason=el("input");reason.required=true;l.append(reason);form.append(l);for(const [decision,label,cls]of [["payment_valid","Payment valid","primary"],["payment_invalid","Payment invalid","danger"]])form.append(button(el,label,()=>action(async()=>{await post("payout/dispute/resolve",{id:p.id,action:decision,reason:reason.value});dialog.close();await payoutDisputes(o);}),cls));wrap.append(form);}
      dialog.append(el("h2","Payout dispute review"),wrap,button(el,"Close",()=>dialog.close()));container.append(dialog);dialog.showModal();});}
  }

  async function lateReviews(o){
    const {post,action,el,container,title}=o;title.textContent="Late payment reviews";container.replaceChildren();
    const data=await post("payout/late/search",{offset:0}),metrics=el("div",undefined,"admin-primary-kpis");metrics.append(metric(el,"Requests",data.requests.length,"Late payout proof reviews"),metric(el,"Pending",data.requests.filter(x=>x.status==="pending").length,"Awaiting decision"),metric(el,"Held value",money(data.requests.filter(x=>x.status==="pending").reduce((n,x)=>n+BigInt(x.held_minor||0),0n)),"Amount held for review"));container.append(metrics,el("p","Late proof never automatically credits funds. Existing assignments stay unchanged until review is explicitly approved or rejected.","notice"));
    const rows=data.requests.map(r=>{const actions=el("div",undefined,"admin-row-actions");actions.append(button(el,"View UTR / proof",()=>proof(r)));if(r.status==="pending")actions.append(button(el,"Approve",()=>decide(r,"approve"),"primary"),button(el,"Reject",()=>decide(r,"reject"),"danger"));return [r.resource_id,r.user_name,money(r.amount_minor),money(r.held_minor),r.reserve_mode,r.reason,r.conflict||"—",r.status,actions];});container.append(table(el,["Payout","User","Amount","Held","Reserve mode","Reason","Conflict","Status","Action"],rows));
    function proof(r){action(async()=>{const p=await post("payout/late/proof",{id:r.id}),d=document.createElement("dialog"),bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes])),link=el("a","Download proof","primary");link.href=url;link.download=p.name;d.append(el("h2","Late payment proof"),el("p","UTR: "+p.utr+" · Scan: "+p.scanState,"notice"),link,button(el,"Close",()=>{URL.revokeObjectURL(url);d.close();}));container.append(d);d.showModal();});}
    function decide(r,decision){const d=document.createElement("dialog"),form=document.createElement("form"),l=el("label","Decision reason"),reason=el("input");reason.required=true;l.append(reason);form.append(l);const save=el("button",decision==="approve"?"Approve payment":"Reject request",decision==="approve"?"primary":"danger");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/late/decide",{id:r.id,action:decision,reason:reason.value});d.close();await lateReviews(o);});};d.append(el("h2","Late payment decision"),form);container.append(d);d.showModal();}
  }

  async function pairingHistory(o){
    const {post,action,el,container,title}=o;
    title.textContent="Pairing History";
    const data=await post("operations/pairing-history",{offset:o.state?.offset||0});
    container.replaceChildren(el("p","Account-owned activation codes and their used, pending, expired or revoked state.","notice"));
    const rows=data.requests.map(r=>{
      const actions=el("div",undefined,"admin-row-actions");
      if(r.canCheck)actions.append(button(el,"Check",()=>action(()=>post("operations/device-setup/poll",{requestId:r.id}))));
      if(r.canRevoke)actions.append(button(el,"Revoke",()=>action(async()=>{await post("operations/device-setup/revokeCode",{requestId:r.id});await pairingHistory(o);}),"danger"));
      return [new Date(r.created_at).toLocaleString("en-IN"),r.owner_name,r.state,r.device_ref||"—",new Date(r.expires_at).toLocaleString("en-IN"),actions];
    });
    container.append(table(el,["Created","Owner","State","Device","Expires","Action"],rows));
  }



  const tone=value=>{
    const s=String(value||"").toLowerCase();
    if(/approved|active|running|successful|completed|verified|accepted|open/.test(s))return "green";
    if(/pending|review|processing|submitted|claimed|requested|verification/.test(s))return "amber";
    if(/reject|failed|frozen|suspended|disabled|cancel|expired|not_paid/.test(s))return "red";
    if(/manual|admin/.test(s))return "purple";
    return "gray";
  };
  const pill=(el,value)=>el("span",String(value||"—").replaceAll("_"," "),"pill "+tone(value));
  const dialog=(el,container,title,build)=>{
    const d=document.createElement("dialog"),head=el("div",undefined,"split-head"),body=el("div"),close=button(el,"Close",()=>d.close(),"ghost");
    head.append(el("h2",title),close);d.append(head,body);container.append(d);d.addEventListener("close",()=>d.remove());build(body,d);d.showModal();return d;
  };
  const field=(el,form,name,label,value="",type="text")=>{
    const wrap=el("label",label),input=el("input");input.name=name;input.value=value??"";input.type=type;input.required=true;wrap.append(input);form.append(wrap);return input;
  };
  const selectField=(el,form,name,label,items,value)=>{
    const wrap=el("label",label),node=el("select");node.name=name;for(const [v,t]of items){const op=el("option",t);op.value=v;node.append(op);}node.value=value??"";wrap.append(node);form.append(wrap);return node;
  };

  async function directory(o,type){
    const {post,request,action,el,container,title}=o,isUser=type==="user",state=o.state||{},status=state.status||"",search=state.search||"";
    title.textContent=isUser?"Users":"Merchants";
    const [data,access]=await Promise.all([
      post("panel/directory",{type,status:status||"all",search,offset:0}),
      isUser?request("business/user-access").catch(()=>({users:[]})):Promise.resolve({users:[]})
    ]);
    const accessMap=new Map((access.users||[]).map(x=>[x.id,x]));
    container.replaceChildren();
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canCreate)tools.append(button(el,"+ Create "+(isUser?"User":"Merchant"),()=>createAccount(),"primary"));}
    const filters=el("div",undefined,"toolbar"),q=el("input"),st=el("select");
    q.className="control grow";q.placeholder="Search name, email or ID…";q.value=search;
    for(const [v,t]of [["","All accounts"],["pending","Pending approval"],["approved","Approved"],["rejected","Rejected"],["suspended","Suspended"]]){const op=el("option",t);op.value=v;st.append(op);}st.className="control";st.value=status;
    const apply=button(el,"Apply",()=>action(()=>directory({...o,state:{search:q.value.trim(),status:st.value}},type)),"primary");filters.append(q,st,apply);container.append(filters);
    const grid=el("div",undefined,"account-card-grid");container.append(grid);
    for(const a of data.rows){
      const accessRow=accessMap.get(a.id)||{},settings=a.settings||{},cardNode=el("article",undefined,"card account-card"),top=el("div",undefined,"account-card-top"),identity=el("div",undefined,"account-identity"),avatar=el("div",(a.name||"?").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase(),"avatar"),copy=el("div");
      copy.append(el("h3",a.name),el("p",a.email+" · "+a.id));identity.append(avatar,copy);top.append(identity,pill(el,a.status==="active"?a.approvalStatus:a.status));cardNode.append(top);
      const stats=el("div",undefined,"account-card-stats");
      const stat=(label,value)=>{const x=el("div",undefined,"fact");x.append(el("label",label),el("strong",value));return x;};
      stats.append(stat(isUser?"Available capacity":"Available balance",money(a.availableMinor||0)),stat(isUser?"UPI accounts":"Active routes",a.routeCount||0),stat("Transactions",a.transactionCount||0));cardNode.append(stats);
      const terms=el("div",undefined,"summary-row");terms.append(el("span","Current terms"),el("strong",isUser?`Pay-in ${settings.payinCommission??"—"}% · Payout ${settings.payoutCommission??"—"}% · USDT ₹${settings.inrPerUsdt??"—"}`:`Pay-in ${settings.payinFee??"—"}% · Payout ${settings.payoutFee??"—"}% · Fixed ₹${settings.fixedPayoutFee??"—"} · USDT ₹${settings.inrPerUsdt??"—"}`));cardNode.append(terms);
      if(isUser){const badges=el("div",undefined,"access-badges");const f=el("span","Free setup "+(accessRow.free_setup?"ON":"OFF"),"access-pill"+(accessRow.free_setup?"":" off")),u=el("span","Unlimited collection "+(accessRow.unlimited_collection?"ON":"OFF"),"access-pill"+(accessRow.unlimited_collection?"":" off"));badges.append(f,u);cardNode.append(badges);}
      const actions=el("div",undefined,"account-card-actions");actions.append(button(el,"View / manage",()=>manage(a,accessRow)));
      if(a.approvalStatus==="pending"){if(data.actions.includes("approve"))actions.append(button(el,"Approve",()=>approve(a,true),"primary"));if(data.actions.includes("reject"))actions.append(button(el,"Reject",()=>approve(a,false),"danger"));}
      if(a.approvalStatus==="approved"&&data.actions.includes("commercial.update"))actions.append(button(el,"Edit rates",()=>editTerms(a)));
      if(isUser&&data.actions.includes("commercial.update"))actions.append(button(el,"Collection access",()=>editAccess(a,accessRow)));
      if(a.status==="active"&&data.actions.includes("suspend"))actions.append(button(el,"Suspend",()=>suspend(a),"danger"));
      else if(a.status!=="active")actions.append(el("span","Reactivation backend action not exposed","access-pill off"));
      cardNode.append(actions);grid.append(cardNode);
    }
    if(!data.rows.length)grid.append(el("div","No matching accounts.","card admin-empty"));

    async function createAccount(){
      const opts=await request("approval-options");
      dialog(el,container,"Create "+(isUser?"User":"Merchant"),(body,d)=>{
        const form=el("form",undefined,"form-grid"),name=field(el,form,"name","Name"),email=field(el,form,"email","Email","","email"),password=field(el,form,"password","Set login password","","password"),approveNow=selectField(el,form,"approveNow","Account approval",[["yes","Create & approve now"],["no","Create as pending"]],"yes");
        const controls={};
        if(isUser){
          controls.payin=field(el,form,"payin","Pay-in commission %","0.45");controls.payout=field(el,form,"payout","Payout commission %","0.30");controls.rate=field(el,form,"rate","INR per USDT","107.00");controls.address=field(el,form,"address","USDT address");controls.free=selectField(el,form,"freeSetup","Free setup",[["false","Require deposit for setup"],["true","Allow setup without deposit"]],"false");controls.unlimited=selectField(el,form,"unlimited","Collection capacity policy",[["false","Capacity backed"],["true","Unlimited collection (capacity exempt)"]],"false");
        }else{
          controls.payin=field(el,form,"payin","Pay-in fee %","1.20");controls.payout=field(el,form,"payout","Payout fee %","0.80");controls.fixed=field(el,form,"fixed","Fixed payout fee INR","6");controls.rate=field(el,form,"rate","INR per USDT","107.00");
        }
        form.append(el("p","Admin sets the initial password. Approval is a separate server state.","notice"));
        const save=el("button","Create account","primary");save.type="submit";form.append(save);body.append(form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{const requestId=crypto.randomUUID(),created=await post("panel/directory/create",{requestId,type,name:name.value,email:email.value,password:password.value});password.value="";if(approveNow.value==="yes"){const settings=isUser?{payinCommission:controls.payin.value,payoutCommission:controls.payout.value,inrPerUsdt:controls.rate.value,depositNetwork:opts.depositNetworks?.[0]||"TRON-TRC20",depositAddress:controls.address.value}:{payinFee:controls.payin.value,payoutFee:controls.payout.value,fixedPayoutFee:controls.fixed.value,fixedFeeCurrency:opts.fixedFeeCurrency||"INR",paymentLinkTtlSeconds:"300",inrPerUsdt:controls.rate.value};await post("approval",{requestId:crypto.randomUUID(),accountId:created.id,decision:"approve",settings,reason:""});if(isUser)await post("business/user-access/update",{userId:created.id,freeSetup:controls.free.value==="true",unlimitedCollection:controls.unlimited.value==="true",reason:"Configured during Admin account creation"});}d.close();await directory(o,type);});};
      });
    }
    function manage(a,accessRow){
      dialog(el,container,(isUser?"User":"Merchant")+" · "+a.name,(body)=>{
        const layout=el("div",undefined,"admin-columns"),left=el("section",undefined,"card admin-panel"),right=el("section",undefined,"card admin-panel"),dl=el("dl",undefined,"admin-details"),settings=a.settings||{};
        const add=(k,v)=>{dl.append(el("dt",k),el("dd",String(v??"—")));};add("Account ID",a.id);add("Email",a.email);add("Status",a.status);add("Approval",a.approvalStatus);add("Login password",a.passwordConfigured?"Admin configured":"Not configured");add("Login readiness",a.passwordConfigured&&a.approvalStatus==="approved"&&a.status==="active"?"Direct login ready":"Login / operations limited by account state");add(isUser?"Available capacity":"Available balance",money(a.availableMinor||0));if(isUser){add("Pay-in commission",(settings.payinCommission??"—")+"%");add("Payout commission",(settings.payoutCommission??"—")+"%");add("USDT rate","₹"+(settings.inrPerUsdt??"—"));add("USDT address",settings.depositAddress||"—");add("Free setup",accessRow.free_setup?"Enabled":"Disabled");add("Unlimited collection",accessRow.unlimited_collection?"Enabled":"Disabled");}else{add("Pay-in fee",(settings.payinFee??"—")+"%");add("Payout fee",(settings.payoutFee??"—")+"%");add("Fixed payout fee","₹"+(settings.fixedPayoutFee??"—"));add("USDT rate","₹"+(settings.inrPerUsdt??"—"));}
        left.append(dl);right.append(el("h3","Operational links"));const links=[[isUser?"UPI accounts":"Active routes",a.routeCount||0],["Recent transactions",a.transactionCount||0]];if(isUser){links.push(["Linked devices",a.linkedDeviceCount||0],["Confirmed deposits",a.confirmedDepositCount||0]);}else links.push(["Payout requests",a.payoutRequestCount||0]);for(const [l,v]of links)right.append(metric(el,l,v,"Live account scope"));layout.append(left,right);body.append(layout,el("h3","Recent transactions"));
        body.append(table(el,["Reference","Type","Amount","Status"],(a.recentActivity||[]).map(x=>[x.reference,x.type,money(x.amountMinor),pill(el,x.status)])));
      });
    }
    async function approve(a,ok){
      const opts=await request("approval-options"),settings=a.settings||{};
      dialog(el,container,(ok?"Approve ":"Reject ")+a.name,(body,d)=>{
        const form=el("form",undefined,"form-grid"),reason=field(el,form,"reason","Reason",ok?"KYC and profile reviewed":"Unable to approve"),controls={};
        if(isUser){controls.payin=field(el,form,"payin","Pay-in commission %",settings.payinCommission||"0.45");controls.payout=field(el,form,"payout","Payout commission %",settings.payoutCommission||"0.30");controls.rate=field(el,form,"rate","INR per USDT",settings.inrPerUsdt||"107.00");controls.address=field(el,form,"address","USDT address",settings.depositAddress||"");controls.free=selectField(el,form,"freeSetup","Free setup",[["false","Require deposit"],["true","Allow setup without deposit"]],String(!!accessMap.get(a.id)?.free_setup));controls.unlimited=selectField(el,form,"unlimited","Collection capacity",[["false","Capacity backed"],["true","Unlimited collection"]],String(!!accessMap.get(a.id)?.unlimited_collection));}
        else{controls.payin=field(el,form,"payin","Pay-in fee %",settings.payinFee||"1.20");controls.payout=field(el,form,"payout","Payout fee %",settings.payoutFee||"0.80");controls.fixed=field(el,form,"fixed","Fixed payout fee INR",settings.fixedPayoutFee||"6");controls.rate=field(el,form,"rate","INR per USDT",settings.inrPerUsdt||"107.00");}
        const save=el("button",ok?"Approve":"Reject",ok?"primary":"danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const commercial=ok?(isUser?{payinCommission:controls.payin.value,payoutCommission:controls.payout.value,inrPerUsdt:controls.rate.value,depositNetwork:opts.depositNetworks?.[0]||"TRON-TRC20",depositAddress:controls.address.value}:{payinFee:controls.payin.value,payoutFee:controls.payout.value,fixedPayoutFee:controls.fixed.value,fixedFeeCurrency:opts.fixedFeeCurrency||"INR",paymentLinkTtlSeconds:"300",inrPerUsdt:controls.rate.value}):null;await post("approval",{requestId:crypto.randomUUID(),accountId:a.id,decision:ok?"approve":"reject",settings:commercial,reason:ok?"":reason.value});if(ok&&isUser)await post("business/user-access/update",{userId:a.id,freeSetup:controls.free.value==="true",unlimitedCollection:controls.unlimited.value==="true",reason:"Configured during Admin approval"});d.close();await directory(o,type);});};
      });
    }
    function editTerms(a){
      const settings=a.settings||{};
      dialog(el,container,"Update commercials · "+a.name,(body,d)=>{
        const form=el("form",undefined,"form-grid"),controls={};
        if(isUser){controls.payin=field(el,form,"payin","Pay-in commission %",settings.payinCommission||"0.45");controls.payout=field(el,form,"payout","Payout commission %",settings.payoutCommission||"0.30");controls.rate=field(el,form,"rate","INR per USDT",settings.inrPerUsdt||"107.00");controls.address=field(el,form,"address","USDT address",settings.depositAddress||"");}
        else{controls.payin=field(el,form,"payin","Pay-in fee %",settings.payinFee||"1.20");controls.payout=field(el,form,"payout","Payout fee %",settings.payoutFee||"0.80");controls.fixed=field(el,form,"fixed","Fixed payout fee INR",settings.fixedPayoutFee||"6");controls.rate=field(el,form,"rate","INR per USDT",settings.inrPerUsdt||"107.00");}
        const reason=field(el,form,"reason","Change reason","Commercial terms updated"),save=el("button","Save terms","primary");save.type="submit";form.append(save);body.append(el("p","Saving creates a new versioned commercial snapshot and invalidates affected sessions.","notice"),form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{const next=isUser?{payinCommission:controls.payin.value,payoutCommission:controls.payout.value,inrPerUsdt:controls.rate.value,depositNetwork:settings.depositNetwork||"TRON-TRC20",depositAddress:controls.address.value}:{payinFee:controls.payin.value,payoutFee:controls.payout.value,fixedPayoutFee:controls.fixed.value,fixedFeeCurrency:settings.fixedFeeCurrency||"INR",paymentLinkTtlSeconds:settings.paymentLinkTtlSeconds||"300",inrPerUsdt:controls.rate.value};await post("panel/directory/update",{requestId:crypto.randomUUID(),id:a.id,action:"commercial.update",reason:reason.value,settings:next,expectedVersion:a.commercialVersion||0});d.close();await directory(o,type);});};
      });
    }
    function editAccess(a,accessRow){
      dialog(el,container,"Collection access · "+a.name,(body,d)=>{
        const form=el("form",undefined,"form-grid"),free=selectField(el,form,"free","Free setup",[["false","Require deposit for setup"],["true","Allow setup without deposit"]],String(!!accessRow.free_setup)),unlimited=selectField(el,form,"unlimited","Collection capacity policy",[["false","Capacity backed"],["true","Unlimited collection (capacity exempt)"]],String(!!accessRow.unlimited_collection)),reason=field(el,form,"reason","Reason",accessRow.reason||"Admin collection access update"),save=el("button","Save access","primary");save.type="submit";form.append(save);body.append(el("p","Unlimited Collection bypasses only capacity-insufficient routing. Account, device, UPI and daily-limit checks still apply.","notice"),form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/user-access/update",{userId:a.id,freeSetup:free.value==="true",unlimitedCollection:unlimited.value==="true",reason:reason.value});d.close();await directory(o,type);});};
      });
    }
    function suspend(a){
      dialog(el,container,"Suspend "+a.name,(body,d)=>{const form=el("form"),reason=field(el,form,"reason","Reason","Operational suspension"),save=el("button","Suspend","danger");save.type="submit";form.append(save);body.append(el("p","Suspension blocks operational use and invalidates sessions.","notice"),form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("panel/directory/update",{requestId:crypto.randomUUID(),id:a.id,action:"suspend",reason:reason.value,settings:null,expectedVersion:a.commercialVersion||0});d.close();await directory(o,type);});};});
    }
  }

  async function employees(o){
    const {post,action,el,container,title}=o;title.textContent="Employees";const data=await post("operations/employees",{offset:0,limit:100});container.replaceChildren(el("p","All delegable Admin permissions are grouped by module. Restricted actions remain visible but disabled.","notice"));const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();tools.append(button(el,"+ Create employee",()=>editor(null),"primary"));}
    const rows=data.employees.map(e=>[e.name,e.email,pill(el,e.status),(e.admin_scope?.tenantIds||[]).join(", "),String(e.permissions.length)+" permissions",e.permission_version,button(el,"Edit",()=>editor(e))]);container.append(table(el,["Name","Email","Status","Tenants","Permissions","Version","Action"],rows));
    function editor(emp){
      dialog(el,container,emp?"Edit Employee · "+emp.name:"Create Employee",(body,d)=>{
        const form=el("form",undefined,"form-grid"),name=field(el,form,"name","Name",emp?.name||""),email=field(el,form,"email","Email",emp?.email||"","email"),password=field(el,form,"password",emp?"Reset / set login password":"Set login password","","password"),status=selectField(el,form,"status","Status",[["active","Active"],["suspended","Suspended"],["disabled","Disabled"]],emp?.status||"active");
        const tenantWrap=el("div",undefined,"permission-group full");tenantWrap.append(el("h4","Operational tenants"));const tenantChecks=[];for(const t of data.tenantIds){const l=el("label",undefined,"permission-option"),i=el("input");i.type="checkbox";i.checked=(emp?.admin_scope?.tenantIds||data.tenantIds).includes(t);l.append(i,el("span",t));tenantWrap.append(l);tenantChecks.push([t,i]);}form.append(tenantWrap);
        const matrix=el("div",undefined,"permission-matrix full"),permissionChecks=[];for(const g of data.permissionGroups||[]){const group=el("section",undefined,"permission-group"),h=el("h4",g.label);group.append(h);for(const p of g.permissions){const l=el("label",undefined,"permission-option"+(!p.selectable?" restricted":"")),i=el("input"),span=el("span");i.type="checkbox";i.checked=(emp?.permissions||data.requiredPermissions).includes(p.id);i.disabled=!p.selectable||data.requiredPermissions.includes(p.id);span.append(document.createTextNode(p.label),el("small",p.restricted?"Restricted":p.selectable?"Delegable":"Not delegable from this Admin"));l.append(i,span);group.append(l);permissionChecks.push([p.id,i]);}matrix.append(group);}form.append(matrix,el("p","Saving permission/status/password changes invalidates existing Employee sessions. MFA enrollment remains required.","notice"));
        const save=el("button",emp?"Save access":"Create Employee","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const permissions=[...new Set(permissionChecks.filter(([,i])=>i.checked).map(([id])=>id))],tenantIds=tenantChecks.filter(([,i])=>i.checked).map(([id])=>id),payload={name:name.value,email:email.value,permissions,tenantIds,...(emp?{id:emp.id,status:status.value}:{}),...(password.value?{password:password.value}:{})};await post(emp?"operations/employee/update":"operations/employee/create",payload);password.value="";d.close();await employees(o);});};
      });
    }
  }

  async function admins(o){
    const {post,action,el,container,title}=o;title.textContent="Admin authority";const data=await post("operations/admins",{offset:0,limit:100});container.replaceChildren(el("p","Only Super Admin platform authority can create or modify scoped Admin authority.","notice"));const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();tools.append(button(el,"+ Create admin",()=>editor(null),"primary"));}
    const rows=data.admins.map(a=>[a.name,a.email,pill(el,a.status),(a.admin_scope?.tenantIds||[]).join(", "),String(a.permissions.length)+" permissions",a.permission_version,button(el,"Edit",()=>editor(a))]);container.append(table(el,["Name","Email","Status","Tenants","Permissions","Version","Action"],rows));
    function editor(admin){
      dialog(el,container,admin?"Edit Admin authority · "+admin.name:"Create tenant-scoped Admin",(body,d)=>{
        const form=el("form",undefined,"form-grid"),name=field(el,form,"name","Name",admin?.name||""),email=field(el,form,"email","Email",admin?.email||"","email"),status=selectField(el,form,"status","Status",[["active","Active"],["suspended","Suspended"],["disabled","Disabled"]],admin?.status||"active");if(admin){name.disabled=true;email.disabled=true;}
        const tenantWrap=el("div",undefined,"permission-group full");tenantWrap.append(el("h4","Operational tenants"));const tenants=[];for(const t of data.tenantIds){const l=el("label",undefined,"permission-option"),i=el("input");i.type="checkbox";i.checked=(admin?.admin_scope?.tenantIds||[]).includes(t);l.append(i,el("span",t));tenantWrap.append(l);tenants.push([t,i]);}form.append(tenantWrap);
        const group=el("div",undefined,"permission-group full"),checks=[];group.append(el("h4","Explicit permissions"));for(const p of data.permissions){const l=el("label",undefined,"permission-option"),i=el("input");i.type="checkbox";i.checked=(admin?.permissions||data.requiredPermissions).includes(p.id);i.disabled=data.requiredPermissions.includes(p.id);l.append(i,el("span",p.label));group.append(l);checks.push([p.id,i]);}form.append(group,el("p","Platform authority is never implied. New Admins receive a one-time temporary credential and must complete reset + MFA.","notice"));
        const save=el("button","Save Admin authority","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const payload={requestId:crypto.randomUUID(),permissions:checks.filter(([,i])=>i.checked).map(([id])=>id),tenantIds:tenants.filter(([,i])=>i.checked).map(([id])=>id),...(admin?{id:admin.id,status:status.value,expectedVersion:admin.permission_version}:{name:name.value,email:email.value})},result=await post(admin?"operations/admin/update":"operations/admin/create",payload);if(!admin&&result.oneTimePassword){body.replaceChildren(el("h3","Admin created"),el("p","Save this one-time password privately.","notice"),el("code",result.oneTimePassword));}else{d.close();await admins(o);}});};
      });
    }
  }

  async function render(destination,o){
    if(destination==="v5.users")return directory(o,"user");
    if(destination==="v5.merchants")return directory(o,"merchant");
    if(destination==="v5.employees")return employees(o);
    if(destination==="v5.admins")return admins(o);
    if(destination==="v5.analytics")return analytics(o);
    if(destination==="v5.approvals")return approvals(o);
    if(destination==="v5.collection-access")return collectionAccessPage(o);
    if(destination==="v5.deposits")return deposits(o);
    if(destination==="v5.bank-upi")return bankUpi(o);
    if(destination==="v5.upi-analytics")return upiAnalytics(o);
    if(destination==="v5.upi-limits")return upiLimits(o);
    if(destination==="v5.routing")return routingPage(o);
    if(destination==="v5.assignments")return assignmentsPage(o);
    if(destination==="v5.transactions")return transactionsPage(o);
    if(destination==="v5.payin-disputes")return payinDisputes(o);
    if(destination==="v5.statements")return statementsPage(o);
    if(destination==="v5.parking-beneficiaries")return parkingView(o,"beneficiaries");
    if(destination==="v5.parking-orders")return parkingView(o,"orders");
    if(destination==="v5.parking-review")return parkingView(o,"review");
    if(destination==="v5.payout-approval")return payoutApproval(o);
    if(destination==="v5.payout-review")return payoutReview(o);
    if(destination==="v5.payout-capabilities")return payoutCapabilities(o);
    if(destination==="v5.payout-disputes")return payoutDisputes(o);
    if(destination==="v5.late-reviews")return lateReviews(o);
    if(destination==="v5.merchant-usdt")return merchantUsdt(o);
    if(destination==="v5.withdrawals")return withdrawals(o);
    if(destination==="v5.user-commissions")return userCommissions(o);
    if(destination==="v5.commission-holds")return commissionHolds(o);
    if(destination==="v5.holds")return businessHolds(o);
    if(destination==="v5.activation")return activationPage(o);
    if(destination==="v5.devices")return devicesPage(o);
    if(destination==="v5.pairing-history")return pairingHistory(o);
    if(destination==="v5.utr")return utrCapture(o);
    if(destination==="v5.apk")return apkPage(o);
    if(destination==="v5.ledger")return ledgerPage(o);
    if(destination==="v5.profit-overview")return profitOverviewPage(o);
    if(destination==="v5.finance-payin")return financePayinPage(o);
    if(destination==="v5.finance-payout")return financePayoutPage(o);
    if(destination==="v5.finance-fixed")return financeFixedPage(o);
    if(destination==="v5.finance-usdt")return financeUsdtPage(o);
    if(destination==="v5.finance-salary")return expensePage(o,"salary");
    if(destination==="v5.finance-expenses")return expensePage(o,"expense");
    if(destination==="v5.profit-expenses")return profitExpenses(o);
    if(destination==="v5.reports")return reportsPage(o);
    if(destination==="v5.audit")return auditPage(o);
    if(destination==="v5.credentials")return credentialsPage(o);
    if(destination==="v5.webhooks")return webhooksPage(o);
    if(destination==="v5.api-logs")return apiLogsPage(o);
    if(destination==="v5.support")return supportPage(o);
    if(destination==="v5.notifications")return notificationsPage(o);
    if(destination==="v5.security")return securityPage(o);
    if(destination==="v5.settings")return settingsPage(o);
    if(destination==="v5.profile")return profilePage(o);
    throw new Error("error.NOT_FOUND");
  }
  root.WPayAdminV5Pages={render};
})(globalThis);
