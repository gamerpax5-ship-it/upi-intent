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
  const panelTable=(el,headers,rows,titleText="",subtitle="")=>{
    const section=el("section",undefined,"card panel");
    if(titleText){const head=el("div",undefined,"panel-head"),copy=el("div");copy.append(el("h2",titleText));if(subtitle)copy.append(el("p",subtitle));head.append(copy);section.append(head);}
    section.append(table(el,headers,rows));return section;
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
    container.append(panelTable(el,["UPI / owner","Approval","Daily limit usage","Statement","State","Routes","Actions"],rows,"UPI directory",directory.banks.length+" accounts · "+directory.routes.filter(r=>r.status==="active").length+" active routes"));
    function createUpi(){dialog(el,container,"Add Admin-approved UPI",(body,d)=>{const form=el("form",undefined,"form-grid"),users=directory.accounts.filter(x=>x.account_type==="user"),owner=selectField(el,form,"owner","Account owner",users.map(x=>[x.id,x.name])),upi=field(el,form,"upi","UPI ID"),holder=field(el,form,"holder","Account holder"),bank=field(el,form,"bank","Bank name"),account=field(el,form,"account","Account number"),ifsc=field(el,form,"ifsc","IFSC"),mobile=field(el,form,"mobile","Registered mobile"),provider=field(el,form,"provider","UPI provider"),type=selectField(el,form,"type","Account type",[["business","Business"],["personal","Personal"]],"business"),limit=field(el,form,"limit","Shared daily limit INR","1000000"),reason=field(el,form,"reason","Approval reason","Admin verified identity");form.append(el("p","Admin approval is not bank evidence. The live system records this as Admin approval provenance.","notice"));const save=el("button","Create approved UPI","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const [w,fr=""]=String(limit.value).split("."),bankLimitMinor=(BigInt(w)*100n+BigInt(fr.padEnd(2,"0"))).toString();await post("business/admin-upi/create",{ownerId:owner.value,details:{upiId:upi.value,holderName:holder.value,bankName:bank.value,accountNumber:account.value,ifsc:ifsc.value.toUpperCase(),mobile:mobile.value,providerName:provider.value,notes:"",accountType:type.value,bankLimitMinor},reason:reason.value,requestId:crypto.randomUUID()});d.close();await bankUpi(o);});};});}
    function review(bank,command){dialog(el,container,(command==="approve"?"Approve ":command==="reject"?"Reject ":command.replaceAll("_"," ")+" ")+(bank.details?.upiId||bank.id),(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",command==="approve"?"Reviewed account identity":"Operational review"),save=el("button",command.replaceAll("_"," "),command==="reject"||command==="freeze"?"danger":"primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/banks/review",{bankId:bank.id,version:bank.version,action:command,reason:reason.value});d.close();await bankUpi(o);});};});}
    function stateChange(bank,command){dialog(el,container,(command==="start"?"Start ":"Stop ")+(bank.details?.upiId||bank.id),(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",command==="start"?"Resume approved UPI":"Operational stop"),save=el("button",command==="start"?"Start":"Stop",command==="start"?"primary":"danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/admin-upi/state",{bankId:bank.id,version:bank.version,action:command,reason:reason.value});d.close();await bankUpi(o);});};});}
    function details(bank,g){dialog(el,container,"UPI details · "+(bank.details?.upiId||bank.id),(body)=>{const dl=el("dl",undefined,"admin-details"),add=(k,v)=>{dl.append(el("dt",k),el("dd",String(v??"—")));};add("Owner",bank.owner_name||bank.owner_id);add("UPI",bank.details?.upiId);add("Holder",bank.details?.holderName);add("Bank",bank.details?.bankName);add("Account",bank.details?.accountNumber);add("IFSC",bank.details?.ifsc);add("Mobile",bank.details?.mobile);add("Version",bank.version);add("Status",g.frozen?"frozen":g.status);add("Daily usage",money(bank.used||0)+" / "+money(bank.sharedLimit||g.daily_limit_minor||0));body.append(dl,el("h4","Merchant routes"));const routes=directory.routes.filter(r=>r.bank_id===bank.id);if(!routes.length)body.append(el("div","No explicit routes.","admin-empty"));for(const r of routes){const row=el("div",undefined,"summary-row");row.append(el("span",(r.merchant_name||r.merchant_id)+" · priority "+r.priority),el("strong",money(r.min_minor)+" – "+money(r.max_minor)));body.append(row);}});}
  }

  async function upiAnalytics(o){
    const {post,action,el,container,title}=o,days=o.state?.days||1;
    title.textContent="UPI Analytics";
    const data=await post("business/upi-analytics",{days});
    container.replaceChildren();
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();const tabs=el("div",undefined,"section-tabs");for(const n of [1,7,30]){const b=button(el,n===1?"Today":n+" days",()=>action(()=>upiAnalytics({...o,state:{days:n}})),n===days?"active":"");b.dataset.upiWindow=String(n);tabs.append(b);}tools.append(tabs);}
    const totalLimit=BigInt(data.totalLimit||0),used=BigInt(data.used||0),util=totalLimit?Number(used*10000n/totalLimit)/100:0,activeRoutes=data.banks.reduce((n,b)=>n+Number(b.route_count||0),0),totalTx=data.banks.reduce((n,b)=>n+Number(b.txTotal||0),0),ok=data.banks.reduce((n,b)=>n+Number(b.successful||0),0),successRate=totalTx?ok/totalTx*100:0;
    const metrics=el("div",undefined,"grid analytics-metrics");
    metrics.append(
      metric(el,"Total UPI",data.banks.length,"All configured accounts"),
      metric(el,"Running UPI",data.running,"Running and not frozen"),
      metric(el,"Available UPI",data.available,"Shared limit remaining"),
      metric(el,"Shared limit",money(totalLimit),"Configured bank limits"),
      metric(el,"Limit used",money(used),util.toFixed(1)+"% utilization"),
      metric(el,"Active routes",activeRoutes,"Merchant assignments"),
      metric(el,"Success rate",successRate.toFixed(1)+"%",days===1?"Today":days+" day window"),
      metric(el,"Needs review",data.banks.filter(x=>["submitted","review"].includes(x.status)).length,"UPI review queue")
    );container.append(metrics);
    const byUtil=[...data.banks].sort((a,b)=>Number(BigInt(b.used||0)*10000n/BigInt(b.sharedLimit||1))-Number(BigInt(a.used||0)*10000n/BigInt(a.sharedLimit||1)));
    const grid=el("div",undefined,"grid two-col"),utilCard=el("section",undefined,"card panel"),health=el("section",undefined,"card panel");const uHead=el("div",undefined,"panel-head"),uCopy=el("div");uCopy.append(el("h2","UPI utilization"),el("p","Shared daily limit consumption"));uHead.append(uCopy);utilCard.append(uHead);const bars=el("div",undefined,"mini-bar-list");for(const b of byUtil){const limit=BigInt(b.sharedLimit||0),spent=BigInt(b.used||0),p=limit?Number(spent*10000n/limit)/100:0,row=el("div",undefined,"mini-bar-row"),label=el("label",(b.details?.upiId||b.id)+" · "+b.owner_name),progress=el("div",undefined,"progress"),fill=el("span");fill.style.width=Math.min(100,p)+"%";progress.append(fill);row.append(label,progress,el("strong",p.toFixed(1)+"%"));bars.append(row);}utilCard.append(bars);const hHead=el("div",undefined,"panel-head"),hCopy=el("div");hCopy.append(el("h2","Route health"),el("p","Operational readiness"));hHead.append(hCopy);health.append(hHead);for(const [l,v]of [["Running / available",data.running+" / "+data.available],["Frozen UPI",data.banks.filter(x=>x.frozen).length],["Active routes",activeRoutes],["Transactions",totalTx],["Successful",ok],["Verification pending",data.banks.reduce((n,b)=>n+Number(b.pending||0),0)]]){const row=el("div",undefined,"admin-profit-row");row.append(el("span",l),el("strong",String(v)));health.append(row);}grid.append(utilCard,health);container.append(grid);
    const rows=data.banks.map(b=>{const limit=BigInt(b.sharedLimit||0),spent=BigInt(b.used||0),remaining=limit>spent?limit-spent:0n;return [(b.details?.upiId||b.id)+" · "+b.owner_name,b.frozen?"frozen":b.status,b.route_count||0,b.txTotal||0,b.successful||0,b.pending||0,Number(b.successRate||0).toFixed(1)+"%",money(b.volume||0),money(remaining)];});
    container.append(table(el,["UPI / owner","State","Routes","Transactions","Successful","Pending","Success rate","Volume","Limit remaining"],rows));
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
      container.append(panelTable(el,["Beneficiary","Bank details","UPI","Created by","User confirmations","Open orders","State"],rows));
      function createBeneficiary(){dialog(el,container,"Create Parking Beneficiary",(body,d)=>{const form=el("form",undefined,"form-grid"),tenant=selectField(el,form,"tenant","Workspace",(data.tenants||[]).map(x=>[x,x]),data.tenants?.[0]),name=field(el,form,"name","Beneficiary name"),bank=field(el,form,"bank","Bank name"),account=field(el,form,"account","Account number"),ifsc=field(el,form,"ifsc","IFSC"),upi=field(el,form,"upi","UPI ID");const save=el("button","Create beneficiary","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("parking/beneficiary/create",{requestId:crypto.randomUUID(),tenantId:tenant.value,beneficiaryName:name.value,bankName:bank.value,accountNumber:account.value,ifsc:ifsc.value.toUpperCase(),upiId:upi.value});d.close();await parkingView(o,mode);});};});}
      return;
    }
    if(mode==="orders"){
      if(tools){if(data.canCreate)tools.append(button(el,"+ Create Parking order",()=>createOrder(),"primary"));tools.append(button(el,"User visibility preview",preview));}
      container.append(el("p","Latest rule: each order has total, minimum and maximum per transaction. A User can pay the whole remaining amount when the remainder falls below minimum, but cannot exceed maximum. Payment window is 10 minutes + 5-minute submission grace.","notice"));
      const rows=data.orders.map(o=>{const b=beneficiaryById.get(o.beneficiaryId),locked=BigInt(o.lockedMinor||o.locked||0);return [o.reference+" · "+o.id,(b?.details.beneficiaryName||"—")+" · "+(b?.details.bankName||"—"),o.tenantId,money(o.totalMinor),money(o.minMinor),money(o.maxMinor||o.totalMinor),money(o.remainingMinor||0),(b?.confirmationCount||0)+" Users",o.state];});
      container.append(panelTable(el,["Reference","Beneficiary","Workspace","Total","Min / txn","Max / txn","Remaining","Confirmed Users","State"],rows));
      function createOrder(){dialog(el,container,"Create Parking order",(body,d)=>{const form=el("form",undefined,"form-grid"),tenant=selectField(el,form,"tenant","Workspace",(data.tenants||[]).map(x=>[x,x]),data.tenants?.[0]),beneficiary=selectField(el,form,"beneficiary","Beneficiary",data.beneficiaries.filter(x=>!x.revoked).map(b=>[b.id,b.details.beneficiaryName+" · "+b.details.bankName])),reference=field(el,form,"reference","Reference"),total=field(el,form,"total","Total INR","5000"),min=field(el,form,"min","Minimum per transaction INR","500"),max=field(el,form,"max","Maximum per transaction INR","5000"),toMinor=v=>{const [w,f=""]=String(v).split(".");return (BigInt(w)*100n+BigInt(f.padEnd(2,"0"))).toString();};const save=el("button","Create order","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("parking/order/create",{requestId:crypto.randomUUID(),tenantId:tenant.value,beneficiaryId:beneficiary.value,reference:reference.value,totalMinor:toMinor(total.value),minMinor:toMinor(min.value),maxMinor:toMinor(max.value)});d.close();await parkingView(o,mode);});};});}
      return;
    }
    container.append(el("p","Approved Parking completion restores User capacity only after accepted evidence. Review can move submitted → review/disputed → completed or not_paid.","notice"));
    const rows=data.reviews.map(r=>{const order=orderById.get(r.orderId),beneficiary=beneficiaryById.get(r.beneficiaryId||order?.beneficiaryId),actions=el("div",undefined,"admin-row-actions");if(r.state==="submitted")actions.append(button(el,"Review",()=>decision(r,"review")));if(["submitted","review","disputed"].includes(r.state))actions.append(button(el,"Approve paid",()=>decision(r,"approve"),"primary"));if(["submitted","review"].includes(r.state))actions.append(button(el,"Dispute",()=>decision(r,"dispute"),"danger"));if(["submitted","review","disputed"].includes(r.state))actions.append(button(el,"Not paid",()=>decision(r,"not_paid"),"danger"));return [r.orderId,r.userName,beneficiary?.details.beneficiaryName||"—",money(r.amountMinor),r.utr||"—",r.state,r.reviewer||"—",actions];});
    container.append(panelTable(el,["Order","User","Beneficiary","Amount","UTR","State","Reviewer","Action"],rows));
    function decision(r,chosen){dialog(el,container,"Parking decision",(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason"),label={review:"Review",approve:"Approve paid",dispute:"Dispute",not_paid:"Not paid"}[chosen],save=el("button",label,chosen==="approve"?"primary":chosen==="review"?"":"danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("parking/review",{id:r.id,action:chosen,reason:reason.value});d.close();await parkingView(o,mode);});};});}
  }


  async function upiLimits(o){
    const {request,post,el,container,title}=o;
    title.textContent="UPI daily limits";container.replaceChildren();
    let data;
    try{data=await post("business/admin-upi",{offset:0,search:""});}
    catch{const plain=await request("business/banks");data={banks:plain.banks.map(b=>({...b,owner_name:b.owner_id,used:"0",sharedLimit:b.daily_limit_minor}))};}
    const rows=data.banks.map(b=>{
      const limit=BigInt(b.sharedLimit||b.daily_limit_minor||0),spent=BigInt(b.used||0),remaining=limit-spent,p=limit?Number(spent*10000n/limit)/100:0;
      return [b.details?.upiId||b.id,b.owner_name||b.owner_id,money(limit),money(spent),money(remaining>0n?remaining:0n),p.toFixed(1)+"%",b.frozen?"frozen":b.status];
    });
    container.append(el("p","Per-UPI daily limit is owner-managed in the latest backend. Admin can review utilization here; account approval, UPI verification, route min/max and freeze/state checks remain separate.","notice"),panelTable(el,["UPI","Owner","Daily limit","Used today","Remaining","Utilization","State"],rows));
  }

  async function payinDisputes(o){
    const {post,action,el,container,title}=o;title.textContent="Pay-in disputes";container.replaceChildren();
    const data=await post("payin-dispute/search",{offset:0,status:""}),records=data.records||[],open=records.filter(x=>x.status==="pending"),frozen=open.reduce((n,x)=>n+BigInt(x.amountMinor||0),0n);
    const metrics=el("div",undefined,"grid metrics");
    metrics.append(metric(el,"Open disputes",open.length,"Within 48-hour review window"),metric(el,"Frozen exposure",money(frozen),"User capacity under dispute"),metric(el,"Fresh statements",open.length,"Merchant statement proof required"),metric(el,"Backend status","Live","Dedicated dispute flow implemented"));
    container.append(metrics,el("p","Merchant opens a dispute within 48 hours with fresh statement proof. While pending, User capacity + User commission + Merchant net exposure are held. Admin resolution is append-only; payment_invalid exact-reverses the original pay-in economic path.","notice"));
    const rows=records.map(d=>{
      const actions=el("div",undefined,"admin-row-actions");actions.append(button(el,"Review details",()=>detail(d),"primary"));
      return [d.reference+" · "+d.orderId,d.merchantName,d.userName,money(d.amountMinor),d.reason,d.coverageThrough?("Through "+new Date(d.coverageThrough).toLocaleString("en-IN")):"—",d.status,actions];
    });
    container.append(panelTable(el,["Payment","Merchant","User","Amount","Reason","Fresh statement","State","Action"],rows));
    function detail(row){action(async()=>{
      const d=await post("payin-dispute/get",{id:row.orderId}),dlg=document.createElement("dialog"),wrap=el("div"),facts=el("div",undefined,"kv-grid"),add=(l,v)=>{const x=el("div",undefined,"v5-fact");x.append(el("small",l),el("strong",String(v??"—")));facts.append(x);};
      add("Reference",d.reference);add("Merchant",d.merchantName);add("User",d.userName);add("Amount",money(d.amountMinor));add("Status",d.status);add("Coverage from",new Date(d.coverageFrom).toLocaleString("en-IN"));add("Coverage through",new Date(d.coverageThrough).toLocaleString("en-IN"));add("User capacity hold",d.status==="pending"?money(d.amountMinor):money(0));add("User commission hold",d.status==="pending"?money(d.commissionMinor):money(0));add("Merchant net hold",d.status==="pending"?money(d.merchantNetMinor):money(0));wrap.append(facts,el("p",d.reason,"notice"));
      const proofs=el("div",undefined,"admin-row-actions"),statement=button(el,"Download Merchant statement",()=>downloadProof(d.orderId,d.statementId),"primary");proofs.append(statement);for(const r of d.responses||[]){if(r.proofId)proofs.append(button(el,"User response proof",()=>downloadProof(d.orderId,r.proofId)));}wrap.append(proofs);
      if(d.responses?.length)wrap.append(el("h3","User responses"),table(el,["Time","Reason"],d.responses.map(r=>[new Date(r.createdAt).toLocaleString("en-IN"),r.reason])));
      if(d.status==="pending"){const form=document.createElement("form"),reason=field(el,form,"reason","Resolution reason","Reviewed statement and response evidence"),buttons=el("div",undefined,"admin-row-actions");buttons.append(button(el,"Payment valid",()=>resolve("payment_valid"),"primary"),button(el,"Payment wrong",()=>resolve("payment_invalid"),"danger"));form.append(buttons);wrap.append(form);async function resolve(decision){if(!reason.value.trim())return;await post("payin-dispute/resolve",{id:d.orderId,action:decision,reason:reason.value});dlg.close();await payinDisputes(o);}}
      dlg.append(el("h2","Pay-in dispute review"),wrap,button(el,"Close",()=>dlg.close()));container.append(dlg);dlg.showModal();
      async function downloadProof(orderId,proofId){const p=await post("payin-dispute/proof",{id:orderId,proofId}),bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:p.contentType||"application/octet-stream"})),a=document.createElement("a");a.href=url;a.download=p.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    });}
  }
  async function payoutApproval(o){
    const {post,action,el,container,title}=o;
    title.textContent="Payout approval";container.replaceChildren();
    const data=await post("payout/approval/search",{offset:o.state?.offset||0,limit:25});
    container.append(el("p","At create time, Merchant balance reserves principal + percentage fee + fixed payout fee. Admin approval moves an eligible request from pending_admin to open for User claiming.","notice"));
    const rows=data.requests.map(r=>{
      const principal=BigInt(r.volume_minor||0),reserve=BigInt(r.reserve_minor||0),fees=reserve>principal?reserve-principal:0n,actions=el("div",undefined,"admin-row-actions");
      actions.append(button(el,"Approve routing",()=>decide(r,"approve"),"primary"),button(el,"Reject",()=>decide(r,"reject"),"danger"));
      const ref=el("div");ref.append(el("strong",r.id),el("div",(r.merchant_name||"—")+" · "+Number(r.order_count||0)+" order"+(Number(r.order_count||0)===1?"":"s"),"small muted"));
      return [ref,money(principal),money(fees),money(reserve),r.earliest_deadline?new Date(r.earliest_deadline).toLocaleString("en-IN"):"—",pill(el,"pending_admin"),actions];
    });
    container.append(panelTable(el,["Reference / Merchant","Principal","Fees","Total reserved","Deadline","State","Action"],rows));
    function decide(r,decision){
      dialog(el,container,decision==="approve"?"Approve payout routing":"Reject payout",(body,d)=>{
        const form=document.createElement("form"),reason=field(el,form,"reason","Reason",decision==="approve"?"Admin routing approval":"Payout rejected"),save=el("button",decision==="approve"?"Approve routing":"Reject",decision==="approve"?"primary":"danger");save.type="submit";
        form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/approval/decide",{id:r.id,action:decision,reason:reason.value});d.close();await payoutApproval(o);});};
      });
    }
  }
  async function userCommissions(o){
    const {post,el,container,title}=o;title.textContent="User commissions";container.replaceChildren();
    const data=await post("panel/admin-finance",{offset:0}),rows=data.commissionSummary||[],gross=rows.reduce((n,x)=>n+BigInt(x.gross||0),0n),held=rows.reduce((n,x)=>n+BigInt(x.held||0),0n),withdrawn=rows.reduce((n,x)=>n+BigInt(x.withdrawn||0),0n),available=rows.reduce((n,x)=>n+BigInt(x.available||0),0n);
    const metrics=el("div",undefined,"grid metrics");metrics.append(metric(el,"Gross commission",money(gross),"Pay-in + payout commission"),metric(el,"Commission holds",money(held),"Active hold ledger"),metric(el,"Completed withdrawals",money(withdrawn),"Withdrawn entitlement"),metric(el,"Available commission",money(available),"Gross − holds − withdrawn"));
    container.append(metrics,el("p","Commission holds, completed withdrawals and current rates are shown from full scoped ledger and latest commercial terms.","notice"));
    container.append(panelTable(el,["User","Pay-in commission","Payout commission","Gross","Hold","Withdrawn","Available","Current rates"],rows.map(r=>[
      r.name+" · "+r.id,money(r.payin),money(r.payout),money(r.gross),money(r.held),money(r.withdrawn),money(r.available),
      "Pay-in "+(r.settings?.payinCommission??"—")+"% · Payout "+(r.settings?.payoutCommission??"—")+"%"
    ])));
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
    const data=await post("funding/list",{state:"",offset:0});
    container.append(el("p","First confirmed deposit minimum is 2,000 USDT; later top-ups can be smaller. Admin may use manual review without a transaction hash when evidence is reviewed, while manual approval remains explicitly non-blockchain-verified.","notice"));
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
    container.append(panelTable(el,["User","USDT","INR credit / rate","Network / address","Tx reference","State","Source","Action"],rows));
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
    container.append(panelTable(el,["Merchant","UPI / User","Priority","Payment range","State","Readiness","Action"],rows));
    function create(){dialog(el,container,"Assign UPI route",(body,d)=>{const form=el("form",undefined,"form-grid"),banks=data.banks.filter(b=>!b.frozen&&["running","approved","verified","stopped"].includes(b.status)),merchants=data.accounts.filter(a=>a.account_type==="merchant"),bank=selectField(el,form,"bank","UPI account",banks.map(b=>[b.id,(b.details?.upiId||b.id)+" · "+b.owner_name])),merchant=selectField(el,form,"merchant","Merchant",merchants.map(m=>[m.id,m.name])),priority=field(el,form,"priority","Priority","50"),min=field(el,form,"min","Minimum INR","100"),max=field(el,form,"max","Maximum INR","10000"),reason=field(el,form,"reason","Reason","Merchant routing assignment"),minor=v=>{const [w,f=""]=String(v).split(".");return (BigInt(w)*100n+BigInt(f.padEnd(2,"0"))).toString();};const save=el("button","Create route","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const selected=bankById.get(bank.value);await post("business/admin-upi/route",{id:null,bankId:bank.value,version:selected.version,merchantId:merchant.value,priority:Number(priority.value),minMinor:minor(min.value),maxMinor:minor(max.value),enabled:true,reason:reason.value});d.close();await routingPage(o);});};});}
    function toggle(r){dialog(el,container,(r.status==="active"?"Disable ":"Enable ")+"route",(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",r.status==="active"?"Operational route disabled":"Operational route enabled"),bank=bankById.get(r.bank_id),save=el("button",r.status==="active"?"Disable":"Enable",r.status==="active"?"danger":"primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/admin-upi/route",{id:r.id,bankId:r.bank_id,version:bank.version,merchantId:r.merchant_id,priority:r.priority,minMinor:r.min_minor,maxMinor:r.max_minor,enabled:r.status!=="active",reason:reason.value});d.close();await routingPage(o);});};});}
  }

  async function assignmentsPage(o){
    const {request,post,action,el,container,title}=o;title.textContent="User assignments";container.replaceChildren();
    const data=await request("business/assignments"),name=id=>data.accounts.find(a=>a.id===id)?.name||id;
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canUpdate)tools.append(button(el,"+ Assign User",()=>create(),"primary"));}
    container.append(el("p","User Assignment is separate from a bank-specific UPI route. Capacity and account eligibility are shown here; the routing page evaluates concrete bank/UPI candidates.","notice"));
    const rows=data.assignments.map(a=>{const actions=el("div",undefined,"admin-row-actions");if(data.canUpdate&&a.status==="active")actions.append(button(el,"Release",()=>release(a),"danger"));return [name(a.merchant_id),name(a.user_id),a.priority,money(a.min_minor)+" – "+money(a.max_minor),data.capacity[a.user_id]?.available?money(data.capacity[a.user_id].available):"—",a.status,actions];});
    container.append(panelTable(el,["Merchant","User","Priority","Amount range","User available","State","Action"],rows));
    function create(){dialog(el,container,"Assign Merchant to User",(body,d)=>{const form=el("form",undefined,"form-grid"),merchant=selectField(el,form,"merchant","Merchant",data.accounts.filter(a=>a.account_type==="merchant").map(a=>[a.id,a.name])),user=selectField(el,form,"user","User",data.accounts.filter(a=>a.account_type==="user").map(a=>[a.id,a.name])),priority=field(el,form,"priority","Priority","50"),min=field(el,form,"min","Minimum INR","100"),max=field(el,form,"max","Maximum INR","10000"),minor=v=>{const [w,f=""]=String(v).split(".");return (BigInt(w)*100n+BigInt(f.padEnd(2,"0"))).toString();},save=el("button","Assign","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/assignments/update",{id:null,merchantId:merchant.value,userId:user.value,priority:Number(priority.value),weight:1,minMinor:minor(min.value),maxMinor:minor(max.value),enabled:true});d.close();await assignmentsPage(o);});};});}
    function release(a){dialog(el,container,"Release assignment",(body,d)=>{const form=document.createElement("form"),save=el("button","Release","danger");save.type="submit";form.append(el("p","This disables the Merchant-to-User assignment. Bank-specific UPI routes remain independently controlled.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/assignments/update",{id:a.id,merchantId:a.merchant_id,userId:a.user_id,priority:a.priority,weight:a.weight||1,minMinor:a.min_minor,maxMinor:a.max_minor,enabled:false});d.close();await assignmentsPage(o);});};});}
  }

  async function devicesPage(o){
    const {post,action,el,container,title}=o;title.textContent="Devices";container.replaceChildren();
    const data=await post("operations/device-setup",{}),active=data.devices.filter(x=>x.linked).length,locationEnabled=data.devices.filter(x=>x.locationEnabled===true).length;
    const metrics=el("div",undefined,"grid metrics");metrics.append(metric(el,"Total devices",data.devices.length,"All scoped paired devices"),metric(el,"Active devices",active,"Currently linked"),metric(el,"Location enabled",locationEnabled,"Current metadata flag"),metric(el,"48h diagnostics",data.diagnosticsAvailable?"Available":"Unavailable","Optional isolated metadata source"));
    container.append(metrics);
    const grid=el("div",undefined,"device-grid");container.append(grid);
    for(const d of data.devices){const card=el("article",undefined,"card device-card"),top=el("div",undefined,"device-top"),model=el("div",undefined,"device-model"),copy=el("div");copy.append(el("h3",d.model||d.device),el("p",(d.apkVersion||"APK unavailable")+" · "+(d.ownerName||"—")));model.append(copy);top.append(model,pill(el,d.status));card.append(top);const stats=el("div",undefined,"device-stats"),fact=(label,value)=>{const x=el("div",undefined,"fact");x.append(el("label",label),el("strong",String(value??"Unavailable")));return x;};stats.append(fact("Battery",d.battery==null?"Unavailable":d.battery+"% · "+(d.batteryHealth||"health unavailable")),fact("Network",(d.network||"Unavailable")+" · "+(d.carrier||"carrier unavailable")),fact("Location",d.locationEnabled===true?(d.locationLabel||"Enabled"):d.locationEnabled===false?"Disabled":"Unavailable"),fact("Valid until",d.validUntil?new Date(d.validUntil).toLocaleString("en-IN"):"Unavailable"));card.append(stats);const actions=el("div",undefined,"account-card-actions");if(!d.legacyMapping)actions.append(button(el,"View details",()=>detail(d)));if(data.canRevoke&&!d.legacyMapping)actions.append(button(el,"Unlink from WPay",()=>unlink(d),"danger"));card.append(actions);grid.append(card);}if(!data.devices.length)grid.append(el("div","No linked devices.","card admin-empty"));
    function detail(d){action(async()=>{const info=await post("operations/device-setup/detail",{id:d.id}),dlg=document.createElement("dialog"),wrap=el("div"),facts=el("div",undefined,"kv-grid"),device=info.device||d,add=(l,v)=>{const x=el("div",undefined,"v5-fact");x.append(el("small",l),el("strong",String(v??"Unavailable")));facts.append(x);};add("Owner",device.ownerName);add("Phone",device.phone);add("SIM",device.simName);add("APK",device.apkVersion);add("Battery health",device.batteryHealth);add("Link valid until",device.validUntil?new Date(device.validUntil).toLocaleString("en-IN"):"Unavailable");wrap.append(facts,el("p","Last 48 hours · diagnostic metadata only. Unavailable fields are not inferred or fabricated.","notice"));wrap.append(table(el,["Time","Battery / health","Network","Location","Location permission"],(info.history||[]).map(h=>[new Date(h.at).toLocaleString("en-IN"),(h.battery==null?"—":h.battery+"%")+" / "+(h.health||"—"),(h.network||"—")+" / "+(h.carrier||"—"),h.latitude==null?"Unavailable":Number(h.latitude).toFixed(5)+", "+Number(h.longitude).toFixed(5)+(h.accuracy==null?"":" · "+h.accuracy+"m"),h.locationPermission==null?"Unavailable":h.locationPermission&&h.locationEnabled?"Enabled":"Disabled"])));if(data.canRevoke)wrap.append(button(el,"Unlink from WPay",()=>{dlg.close();unlink(d);},"danger"));dlg.append(el("h2","Device · "+(device.model||device.device)),wrap,button(el,"Close",()=>dlg.close()));container.append(dlg);dlg.showModal();});}
    function unlink(d){dialog(el,container,"Unlink device",(body,dlg)=>{body.append(el("p","This revokes the scoped WPay device ownership link. Pairing history remains auditable.","notice"),button(el,"Unlink from WPay",()=>action(async()=>{await post("operations/device-setup/revoke",{id:d.id});dlg.close();await devicesPage(o);}),"danger"));});}
  }
  async function activationPage(o){
    const {post,action,el,container,title}=o;title.textContent="Activation codes";container.replaceChildren();
    const [setup,history]=await Promise.all([post("operations/device-setup",{}),post("operations/pairing-history",{offset:0})]);
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();const generate=button(el,"Generate account-owned code",()=>issue(),"primary");generate.disabled=!setup.canCreate;tools.append(generate);}
    container.append(el("p","Pairing code is account-owned by the current logged-in actor and is separate from sensitive OTP-event access. A code is shown only when issued; history never re-exposes the secret. Expiry: 24 hours.","notice"));
    const rows=history.requests.map(r=>[
      el("span","Hidden after issue · "+r.id,"mono"),
      (r.owner_name||r.owner_id)+" · "+(r.owner_type||"account"),
      new Date(r.created_at).toLocaleString("en-IN"),
      new Date(r.expires_at).toLocaleString("en-IN"),
      pill(el,r.state),
      r.device_ref||"—",
      (()=>{const actions=el("div",undefined,"admin-row-actions");if(r.canCheck)actions.append(button(el,"Check pairing",()=>action(async()=>{await post("operations/device-setup/poll",{requestId:r.id});await activationPage(o);})));if(r.canRevoke)actions.append(button(el,"Revoke code",()=>action(async()=>{await post("operations/device-setup/revokeCode",{requestId:r.id});await activationPage(o);}),"danger"));return actions;})()
    ]);
    container.append(panelTable(el,["Code","Owning session actor","Created","Expires","State","Device","Action"],rows));
    function issue(){action(async()=>{const result=await post("operations/device-setup/create",{requestId:crypto.randomUUID()}),d=document.createElement("dialog"),code=el("code",result.pairingCode,"code-secret");d.append(el("h2","Enter this code in WPay Agent"),el("p","This account-owned 8-character code is displayed only now.","notice"),code,el("p","Expires "+new Date(result.expiresAt).toLocaleString("en-IN")),button(el,"Copy code",()=>navigator.clipboard?.writeText(result.pairingCode)),button(el,"Close",()=>{code.textContent="Hidden";d.close();activationPage(o);}));container.append(d);d.showModal();});}
  }
  async function utrCapture(o){
    const {post,action,el,container,title}=o;title.textContent="UTR Capture";container.replaceChildren();
    const [sources,pending]=await Promise.all([post("operations/utr-source",{}),post("operations/utr/pending",{status:"pending",offset:0})]);
    const linked=sources.links||[],sourceResults=await Promise.all(linked.map(async link=>{try{return {link,...await post("operations/utr-source",{linkId:link.id})};}catch{return {link,observations:[]};}}));
    const captures=sourceResults.flatMap(x=>(x.observations||[]).map(r=>({...r,sourceKind:x.link.source==="device"?"apk":"statement",deviceOrStatement:x.link.source==="device"?x.link.id:"Uploaded statement"}))).sort((a,b)=>new Date(b.capturedAt)-new Date(a.capturedAt));
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();const tabs=el("div",undefined,"section-tabs");for(const [key,label]of [["all","All"],["apk","APK captured"],["statement","Statement"],["pending","Pending review"]]){const b=button(el,label,()=>draw(key),key==="all"?"active":"");b.dataset.utrFilter=key;tabs.append(b);}tools.append(tabs);}
    const metrics=el("div",undefined,"grid metrics");metrics.append(metric(el,"Total UTR captures",captures.length,"APK + uploaded statements"),metric(el,"APK captured",captures.filter(x=>x.sourceKind==="apk").length,"SMS/device source"),metric(el,"Statement captured",captures.filter(x=>x.sourceKind==="statement").length,"Uploaded statement source"),metric(el,"Pending review",pending.records.length,"Claims awaiting decision"));
    container.append(metrics,el("p","APK/statement captures and submitted UTR claims are different evidence surfaces. Manual Admin approval remains explicitly different from bank-verified evidence.","notice"));
    const stream=el("section",undefined,"card admin-panel"),pendingPanel=el("section",undefined,"card admin-panel");stream.append(el("h2","Captured UTR stream"));pendingPanel.append(el("h2","Pending UTR decisions"));container.append(stream,pendingPanel);
    const pendingRows=()=>pending.records.map(r=>{const actions=el("div",undefined,"admin-row-actions");if(r.canReview)actions.append(button(el,"Verify evidence",()=>verify(r)));if(r.canApprove)actions.append(button(el,"Manual approve",()=>decision(r,"approve"),"primary"));if(r.canReview)actions.append(button(el,"Reject",()=>decision(r,"reject"),"danger"));return [new Date(r.submittedAt).toLocaleString("en-IN"),r.utr,r.reference,r.merchant,r.user,money(r.amountMinor),r.paymentStatus,r.status,actions];});
    pendingPanel.append(table(el,["Submitted","UTR","Reference","Merchant","User","Amount","Payment","Review","Actions"],pendingRows()));
    function draw(filter){
      if(tools)for(const b of tools.querySelectorAll("[data-utr-filter]"))b.classList.toggle("active",b.dataset.utrFilter===filter);
      const rows=(filter==="pending"?[]:captures.filter(x=>filter==="all"||x.sourceKind===filter)).map(x=>[new Date(x.capturedAt).toLocaleString("en-IN"),x.utr,x.amount,x.sourceKind==="apk"?"APK":"Statement",x.deviceOrStatement,x.userId||"—",x.merchantId||"—",x.bankReference||"—",x.sourceStatus||"captured"]);
      stream.replaceChildren(el("h2","Captured UTR stream"),table(el,["Captured","UTR","Amount","Source","Device / statement","User","Merchant","Bank","Status"],rows));
      pendingPanel.hidden=filter!=="all"&&filter!=="pending";
    }
    function verify(r){dialog(el,container,"Verify evidence · "+r.reference,(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Review reason","Verify submitted UTR against independent evidence"),save=el("button","Verify evidence","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("operations/utr/verify",{orderId:r.orderId,utr:r.utr,reason:reason.value});d.close();await utrCapture(o);});};});}
    function decision(r,decision){dialog(el,container,(decision==="approve"?"Manual approve":"Reject")+" · "+r.reference,(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",decision==="approve"?"Admin reviewed supporting evidence":"Evidence rejected"),save=el("button",decision==="approve"?"Manual approve":"Reject",decision==="approve"?"primary":"danger");save.type="submit";form.append(el("p",decision==="approve"?"Admin approval is recorded as admin_approved and is not bank verification.":"Rejected claim closes the payment when current state allows.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("operations/utr/decision",{claimId:r.claimId,action:decision,reason:reason.value});d.close();await utrCapture(o);});};});}
    draw("all");
  }
  async function statementsPage(o){
    const {request,post,action,el,container,title}=o;title.textContent="Statements & reconciliation";container.replaceChildren();
    const [data,recovery]=await Promise.all([request("operations/statements"),post("operations/transactions",{offset:0,status:"recovery_review"})]);
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();tools.append(button(el,"+ Upload statement",()=>uploadStatement(),"primary"));}
    container.append(el("p","Statement upload uses the existing parser and creates trusted-source review metadata. An uploaded file alone does not prove account ownership and does not itself post financial credit.","notice"));
    const grid=el("div",undefined,"admin-columns"),imports=el("section",undefined,"card admin-panel"),recon=el("section",undefined,"card admin-panel");
    const ih=el("div",undefined,"panel-head"),ihc=el("div");ihc.append(el("h2","Statement imports"),el("p","Targeted bank/version imports"));ih.append(ihc);imports.append(ih);
    imports.append(table(el,["Import","Owner / bank","Version","Rows","Credits","Status","Reason"],data.imports.map(i=>[
      i.id+" · "+new Date(i.created_at).toLocaleString("en-IN"),
      (data.banks.find(b=>b.id===i.bank_id)?.ownerName||i.owner_id)+" · "+(data.banks.find(b=>b.id===i.bank_id)?.id||i.bank_id),
      i.bank_version,i.rows_scanned,i.credit_count,i.status,i.reason||"—"
    ])));
    const rh=el("div",undefined,"panel-head"),rhc=el("div");rhc.append(el("h2","Reconciliation review"),el("p","UTR observation vs accounting state"));rh.append(rhc);recon.append(rh);
    const rows=recovery.records.map(r=>{
      const observation=(r.observations||[]).find(x=>!x.verified)||(r.observations||[])[0],actions=el("div",undefined,"admin-row-actions");
      if(observation?.claimId&&r.accountingState!=="posted"){
        actions.append(button(el,"Accept evidence",()=>reconcile(r,observation,"approve"),"primary"),button(el,"Reject",()=>reconcile(r,observation,"reject"),"danger"));
      }
      return [r.orderId,(r.userId||"—")+" · "+(r.merchantId||"—"),observation?.utr||"—",observation?.source||"—",r.evidenceState,r.accountingState,actions];
    });
    recon.append(table(el,["Order","User / Merchant","UTR","Source","Evidence","Accounting","Action"],rows));
    grid.append(imports,recon);container.append(grid);

    function uploadStatement(){
      dialog(el,container,"Upload statement",(body,d)=>{
        const form=el("form",undefined,"form-grid"),owners=[...new Map(data.banks.map(b=>[b.ownerId,b.ownerName])).entries()],owner=selectField(el,form,"owner","Owner",owners),bank=selectField(el,form,"bank","Bank / UPI",[]),format=selectField(el,form,"format","Format",[["csv","CSV"],["xls","XLS"],["xlsx","XLSX"]],"csv"),fileLabel=el("label","Statement file"),file=el("input");file.type="file";file.accept=".csv,.xls,.xlsx";file.required=true;fileLabel.append(file);form.append(fileLabel);
        const refreshBanks=()=>{bank.replaceChildren();for(const b of data.banks.filter(x=>x.ownerId===owner.value)){const op=el("option",(b.ownerName||b.ownerId)+" · "+b.id);op.value=b.id;bank.append(op);}};owner.onchange=refreshBanks;refreshBanks();
        form.append(el("p","The existing statement parser runs server-side. Upload alone does not establish ownership or financial credit.","notice"));
        const save=el("button","Upload","primary");save.type="submit";form.append(save);body.append(form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{const selected=data.banks.find(x=>x.id===bank.value),chosen=file.files[0];if(!selected||!chosen||chosen.size>1048576)throw Error("Choose a statement up to 1 MiB");const bytes=new Uint8Array(await chosen.arrayBuffer());let raw="";for(const byte of bytes)raw+=String.fromCharCode(byte);await post("operations/statement/upload",{ownerId:selected.ownerId,bankId:selected.id,version:selected.version,requestId:crypto.randomUUID(),format:format.value,base64:btoa(raw)});d.close();await statementsPage(o);});};
      });
    }
    function reconcile(row,observation,decision){
      dialog(el,container,(decision==="approve"?"Accept evidence":"Reject claim")+" · "+row.reference,(body,d)=>{
        const form=document.createElement("form"),reason=field(el,form,"reason","Reason",decision==="approve"?"Admin reviewed supporting evidence":"Evidence rejected"),save=el("button",decision==="approve"?"Accept evidence":"Reject",decision==="approve"?"primary":"danger");save.type="submit";
        form.append(el("p",decision==="approve"?"This records an explicit Admin-approved payment decision. It is not labeled as bank-verified evidence.":"This rejects the submitted claim and closes the payment as failed when allowed by current state.","notice"),save);body.append(form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("operations/utr/decision",{claimId:observation.claimId,action:decision,reason:reason.value});d.close();await statementsPage(o);});};
      });
    }
  }
  async function payoutReview(o){
    const {post,action,el,container,title}=o;title.textContent="Payout review";container.replaceChildren();
    const data=await post("payout/search",{offset:0,limit:50});
    container.append(el("p","Current policy: User payment window is 10 minutes + 5-minute submission grace. Submitted payout waits for Merchant review; without a Merchant decision, the 15-minute timeout can auto-approve with merchant_review_timeout provenance. Admin resolution applies after Merchant rejection/escalation.","notice"));
    const rows=data.orders.filter(x=>["claimed","submitted","merchant_rejected_review","successful","not_paid"].includes(x.status)).map(p=>{
      const actions=el("div",undefined,"admin-row-actions");
      if(p.status==="merchant_rejected_review")actions.append(button(el,"Mark paid",()=>resolve(p,"paid"),"primary"),button(el,"Not paid",()=>resolve(p,"not_paid"),"danger"));
      else if(p.status==="submitted")actions.append(el("span","Merchant review / timeout","small muted"));
      const due=p.submittedAt?new Date(+new Date(p.submittedAt)+15*60000):null,remaining=due?+due-Date.now():null,timeout=due?(remaining>0?Math.ceil(remaining/60000)+" min remaining":"Due / worker may auto-approve"):"—";
      const ref=el("div");ref.append(el("strong",p.reference),el("div",p.id,"small muted"));
      return [ref,p.claimUserName||p.claimUserId||"—",money(p.amountMinor),p.utr||"—",pill(el,p.status),p.submittedAt?new Date(p.submittedAt).toLocaleString("en-IN"):"—",due?new Date(due).toLocaleString("en-IN")+" · "+timeout:"—",actions];
    });
    container.append(panelTable(el,["Reference","User","Amount","UTR","State","Submitted","15m timeout","Action"],rows));
    function resolve(p,decision){dialog(el,container,decision==="paid"?"Mark payout paid":"Mark payout not paid",(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",decision==="paid"?"Admin reviewed escalated payout evidence":"Payment not received"),save=el("button",decision==="paid"?"Mark paid":"Not paid",decision==="paid"?"primary":"danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/resolve",{id:p.id,action:decision,reason:reason.value});d.close();await payoutReview(o);});};});}
  }
  async function payoutCapabilities(o){
    const {request,post,action,el,container,title}=o;title.textContent="Payout bank capabilities";container.replaceChildren();
    const data=await request("payout/capabilities");
    container.append(el("p","A payout capability belongs to an approved + verified bank version. Revoking it prevents that bank version from being used for payout work.","notice"));
    const rows=data.banks.map(b=>{const actions=el("div",undefined,"admin-row-actions");actions.append(button(el,b.payout_capable?"Revoke":"Enable",()=>change(b),b.payout_capable?"danger":"primary"));return [b.id,b.owner_id,"v"+b.version,b.status,b.frozen?"frozen":"available",b.payout_capable?"payout capable":"not capable",actions];});container.append(table(el,["Bank","Owner","Version","State","Availability","Capability","Action"],rows));
    function change(b){const d=document.createElement("dialog"),form=document.createElement("form"),l=el("label","Reason"),reason=el("input");reason.required=true;l.append(reason);form.append(l);const enabled=!b.payout_capable,save=el("button",enabled?"Enable payout bank":"Revoke capability",enabled?"primary":"danger");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/capability",{bankId:b.id,version:b.version,enabled,reason:reason.value});d.close();await payoutCapabilities(o);});};d.append(el("h2",enabled?"Enable payout capability":"Revoke payout capability"),form);container.append(d);d.showModal();}
  }

  async function merchantUsdt(o){
    const {request,post,action,el,container,title}=o;title.textContent="Merchant USDT";container.replaceChildren();
    const [data,defaults]=await Promise.all([request("payout/merchant-usdt-admin"),request("panel/merchant-default-rate")]),requests=data.requests||[],rates=[...new Set((defaults.tenants||[]).map(x=>x.rate))],defaultLabel=rates.length===1?"₹"+rates[0]:rates.length?"Multiple":"₹107";
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(defaults.canUpdate)tools.append(button(el,"Edit default USDT rate",()=>editDefault()));}
    const band=el("div",undefined,"kpi-band"),add=(label,value)=>{const x=el("div");x.append(el("small",label),el("strong",String(value)));band.append(x);};add("Default Admin rate",defaultLabel);add("Requested",requests.filter(x=>x.state==="requested").length);add("Processing",requests.filter(x=>x.state==="processing").length);add("Completed",requests.filter(x=>x.state==="completed").length);add("Network","TRON-TRC20");container.append(band);
    const rows=requests.map(r=>{const actions=el("div",undefined,"admin-row-actions");if(r.state==="requested")actions.append(button(el,"Approve",()=>transition(r,"approve"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));if(r.state==="review")actions.append(button(el,"Approve",()=>transition(r,"approve"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));if(r.state==="approved")actions.append(button(el,"Process",()=>transition(r,"process")));if(r.state==="processing")actions.append(button(el,"Complete",()=>complete(r),"primary"));return [r.merchantName||r.merchantId,money(r.inrMinor),(BigInt(r.usdtMinor||0)/1000000n).toLocaleString("en-IN")+" USDT","₹"+r.rate,(r.network||"—")+" · "+(r.destinationSummary||"Protected destination"),pill(el,r.state),actions];});
    container.append(panelTable(el,["Merchant","INR reserved","USDT quote","Rate","Network / destination","State","Action"],rows));
    function editDefault(){dialog(el,container,"Edit default Merchant USDT rate",(body,d)=>{const form=el("form",undefined,"form-grid"),tenant=selectField(el,form,"tenant","Workspace",(defaults.tenants||[]).map(x=>[x.tenantId,x.tenantId]),defaults.tenants?.[0]?.tenantId),rate=field(el,form,"rate","INR per USDT",defaults.tenants?.[0]?.rate||"107"),save=el("button","Save default rate","primary");const current=()=>defaults.tenants.find(x=>x.tenantId===tenant.value)||defaults.tenants?.[0]||{};tenant.onchange=()=>{rate.value=current().rate||"107";};save.type="submit";form.append(el("p","This default pre-fills new Merchant approvals. Existing Merchant commercial versions are not silently rewritten.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const dflt=current();await post("panel/merchant-default-rate/update",{tenantId:tenant.value,rate:rate.value,fixedPayoutFee:dflt.fixedPayoutFee||"6",payinFee:dflt.payinFee||"1.2",payoutFee:dflt.payoutFee||"0.8",paymentLinkTtlSeconds:String(dflt.paymentLinkTtlSeconds||300),adminManagedCollections:!!dflt.adminManagedCollections});d.close();await merchantUsdt(o);});};});}
    function transition(r,command){dialog(el,container,"Merchant USDT · "+command,(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason","Admin "+command),save=el("button",command,command==="reject"?"danger":"primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/merchant-usdt/transition",{id:r.id,action:command,reason:reason.value});d.close();await merchantUsdt(o);});};});}
    function complete(r){dialog(el,container,"Complete Merchant USDT",(body,d)=>{const form=el("form",undefined,"form-grid"),reason=field(el,form,"reason","Reason","Manual settlement completed"),reference=field(el,form,"reference","Completion reference"),network=field(el,form,"network","Network",r.network||"TRON-TRC20"),at=field(el,form,"completedAt","Completed at (UTC)",new Date().toISOString().replace(/\.\d{3}Z$/,"Z")),save=el("button","Complete","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/merchant-usdt/transition",{id:r.id,action:"complete",reason:reason.value,reference:reference.value,network:network.value,completedAt:at.value});d.close();await merchantUsdt(o);});};});}
  }
  async function withdrawals(o){
    const {post,action,el,container,title}=o;title.textContent="Commission withdrawals";container.replaceChildren();
    const data=await post("payout/withdrawal/search",{offset:0,limit:50}),requests=data.withdrawals||[];
    container.append(el("p","INR withdrawals reserve the gross commission amount and carry the current 0.5% fee inside that reservation. USDT uses the versioned User rate/network.","notice"));
    const rows=requests.map(r=>{const actions=el("div",undefined,"admin-row-actions");if(r.state==="requested")actions.append(button(el,"Review",()=>transition(r,"review")),button(el,"Approve",()=>transition(r,"approve"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));if(r.state==="review")actions.append(button(el,"Approve",()=>transition(r,"approve"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));if(r.state==="approved")actions.append(button(el,"Process",()=>transition(r,"process"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));if(r.state==="processing")actions.append(button(el,"Complete",()=>complete(r),"primary"));return [r.userId,r.currency,r.currency==="INR"?money(r.amountMinor):(BigInt(r.amountMinor||0)/1000000n).toLocaleString("en-IN")+" USDT",money(r.feeMinor||0),r.currency==="INR"?money(r.netMinor||r.amountMinor):(BigInt(r.netMinor||r.amountMinor||0)/1000000n).toLocaleString("en-IN")+" USDT",r.destinationSummary||"Protected destination",r.state,r.createdAt?new Date(r.createdAt).toLocaleString("en-IN"):"—",actions];});container.append(panelTable(el,["User","Currency","Gross / amount","Fee","Net / entitlement","Destination","State","Created","Action"],rows));
    function transition(r,command){const d=document.createElement("dialog"),form=document.createElement("form"),l=el("label","Reason"),reason=el("input");reason.required=true;l.append(reason);form.append(l);const save=el("button",command,command==="reject"?"danger":"primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/withdrawal/transition",{id:r.id,action:command,reason:reason.value});d.close();await withdrawals(o);});};d.append(el("h2","Withdrawal · "+command),form);container.append(d);d.showModal();}
    function complete(r){const d=document.createElement("dialog"),form=document.createElement("form"),field=(label,value="")=>{const l=el("label",label),i=el("input");i.value=value;i.required=true;l.append(i);form.append(l);return i;},reason=field("Reason"),reference=field(r.currency==="INR"?"12-digit UTR":"Completion reference"),network=r.currency==="USDT"?field("Network","TRON-TRC20"):null,at=field("Completed at (UTC)",new Date().toISOString().replace(/\.\d{3}Z$/,"Z"));const save=el("button","Complete","primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/withdrawal/transition",{id:r.id,action:"complete",reason:reason.value,reference:reference.value,...(network?{network:network.value}:{}),completedAt:at.value});d.close();await withdrawals(o);});};d.append(el("h2","Complete withdrawal"),form);container.append(d);d.showModal();}
  }

  async function commissionHolds(o){
    const {post,action,el,container,title}=o;title.textContent="Commission holds";container.replaceChildren();
    const [data,users]=await Promise.all([post("payout/hold/search",{offset:0,limit:50}),post("panel/directory",{type:"user",status:"approved",search:"",offset:0,limit:100})]),holds=data.holds||[],userName=id=>users.rows.find(x=>x.id===id)?.name||id;
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();tools.append(button(el,"+ Place commission hold",()=>edit(null),"primary"));}
    container.append(el("p","Commission holds are separate from business/capacity holds and reduce withdrawable User commission.","notice"));
    const rows=holds.map(h=>{const actions=el("div",undefined,"admin-row-actions");if(!h.released_at)actions.append(button(el,"Release",()=>edit(h),"primary"));return [userName(h.user_id),money(h.amount_minor),h.reference,h.reason,new Date(h.created_at).toLocaleString("en-IN"),h.released_at?"released":"active",actions];});
    container.append(panelTable(el,["User","Amount","Reference","Reason","Created","State","Action"],rows));
    function edit(h){dialog(el,container,h?"Release commission hold":"Place commission hold",(body,d)=>{const form=el("form",undefined,"form-grid"),user=selectField(el,form,"user","User",users.rows.map(x=>[x.id,x.name]),h?.user_id),amount=field(el,form,"amount","Amount INR",h?String(Number(h.amount_minor)/100):"500"),reference=field(el,form,"reference","Reference",h?.reference||("COM-"+Date.now())),reason=field(el,form,"reason","Reason",h?"Commission review completed":"Commission review hold");if(h){user.disabled=true;amount.disabled=true;reference.disabled=true;}const save=el("button",h?"Release":"Place hold",h?"primary":"primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const minor=h?h.amount_minor:String(Math.round(Number(amount.value)*100));await post("payout/hold/manage",{id:h?.id||crypto.randomUUID(),userId:h?.user_id||user.value,amountMinor:minor,reference:h?.reference||reference.value,reason:reason.value,release:!!h});d.close();await commissionHolds(o);});};});}
  }
  async function businessHolds(o){
    const {request,post,action,el,container,title}=o;title.textContent="Holds / frozen";container.replaceChildren();
    const [data,users,merchants]=await Promise.all([request("business/holds"),post("panel/directory",{type:"user",status:"approved",search:"",offset:0,limit:100}),post("panel/directory",{type:"merchant",status:"approved",search:"",offset:0,limit:100})]),holds=data.holds||[],accounts=[...users.rows,...merchants.rows],name=id=>accounts.find(x=>x.id===id)?.name||id;
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canManage)tools.append(button(el,"+ Place hold",()=>edit(null),"primary"));}
    container.append(el("p","Generic business holds/frozen records are distinct from commission holds and payout-dispute holds. Each domain retains separate accounting provenance.","notice"));
    const rows=holds.map(h=>{const actions=el("div",undefined,"admin-row-actions");if(data.canManage&&h.state==="active"&&!String(h.category).startsWith("payout_dispute"))actions.append(button(el,"Release",()=>edit(h),"primary"));return [name(h.owner_id),String(h.category||"hold").includes("dispute")?"Dispute":"Business",money(h.amount_minor),h.category,h.reference,h.reason,h.state,actions];});
    container.append(panelTable(el,["Owner","Domain","Amount","Category","Reference","Reason","State","Action"],rows));
    function edit(h){dialog(el,container,h?"Release hold":"Place hold",(body,d)=>{const form=el("form",undefined,"form-grid"),owner=selectField(el,form,"owner","Owner",accounts.map(x=>[x.id,x.name+" · "+x.accountType]),h?.owner_id),amount=field(el,form,"amount","Amount INR",h?String(Number(h.amount_minor)/100):"500"),category=selectField(el,form,"category","Category",[["hold","Hold"],["frozen","Frozen"]],h?.category||"hold"),reference=field(el,form,"reference","Reference",h?.reference||("HOLD-"+Date.now())),reason=field(el,form,"reason","Reason",h?"Hold review completed":"Operational hold");if(h){owner.disabled=true;amount.disabled=true;category.disabled=true;reference.disabled=true;}const save=el("button",h?"Release":"Place hold",h?"primary":"danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/holds/update",{id:h?.id||crypto.randomUUID(),ownerId:h?.owner_id||owner.value,amountMinor:h?.amount_minor||String(Math.round(Number(amount.value)*100)),reference:h?.reference||reference.value,reason:reason.value,release:!!h,category:h?.category||category.value});d.close();await businessHolds(o);});};});}
  }
  async function credentialsPage(o){
    const {post,action,el,container,title}=o;title.textContent="API credentials";container.replaceChildren();
    const [data,merchants]=await Promise.all([post("panel/credentials",{offset:0}),post("panel/directory",{type:"merchant",status:"approved",search:"",offset:0})]),merchantName=id=>merchants.rows.find(x=>x.id===id)?.name||id;
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canCreate)tools.append(button(el,"+ Create credential",()=>create(),"primary"));}
    container.append(el("p","Credential metadata is tenant-scoped. Create/revoke is Super Admin-restricted. Secret material is shown once.","notice"));
    const rows=data.rows.map(k=>{const actions=el("div",undefined,"admin-row-actions");if(data.canRevoke&&!k.revoked_at)actions.append(button(el,"Revoke",()=>revoke(k),"danger"));return [k.prefix,k.merchant_name||merchantName(k.merchant_id),k.label,(k.scopes||[]).join(", "),pill(el,k.revoked_at?"revoked":"active"),k.last_used_at?new Date(k.last_used_at).toLocaleString("en-IN"):"—",actions];});
    container.append(panelTable(el,["Prefix","Merchant","Label","Scopes","Status","Last used","Action"],rows));
    function create(){dialog(el,container,"Create API credential",(body,d)=>{const form=el("form",undefined,"form-grid"),merchant=selectField(el,form,"merchant","Merchant",merchants.rows.map(m=>[m.id,m.name])),label=field(el,form,"label","Label","Production integration"),scope=selectField(el,form,"scope","Scopes",[["read","orders:read"],["write","orders:read + orders:write"]],"read"),save=el("button","Create credential","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const result=await post("panel/credentials/create",{merchantId:merchant.value,label:label.value,scopes:scope.value==="write"?["orders:read","orders:write"]:["orders:read"]});d.close();const secret=document.createElement("dialog"),code=el("code",result.secret,"code-secret");secret.append(el("h2","Save credential secret"),el("p","This secret is shown once.","notice"),code,button(el,"Copy",()=>navigator.clipboard?.writeText(result.secret)),button(el,"Hide",()=>{code.textContent="Hidden";secret.close();credentialsPage(o);}));container.append(secret);secret.showModal();});};});}
    function revoke(k){dialog(el,container,"Revoke API credential",(body,d)=>{body.append(el("p","Revoking this credential is permanent for this key. Existing Merchant sessions are also invalidated.","notice"),button(el,"Revoke",()=>action(async()=>{await post("panel/credentials/revoke",{id:k.id});d.close();await credentialsPage(o);}),"danger"));});}
  }
  async function webhooksPage(o){
    const {post,action,el,container,title}=o;title.textContent="Webhooks";container.replaceChildren();
    const [data,merchants]=await Promise.all([post("panel/webhooks",{offset:0}),post("panel/directory",{type:"merchant",status:"approved",search:"",offset:0})]),merchantName=id=>merchants.rows.find(x=>x.id===id)?.name||id,configs=data.endpoints?.rows||[];
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canUpdate)tools.append(button(el,"Configure endpoint",()=>configure(),"primary"));}
    const grid=el("div",undefined,"grid two-col"),left=el("section",undefined,"card panel"),right=el("section",undefined,"card panel"),lh=el("div",undefined,"panel-head"),lc=el("div");lc.append(el("h2","Webhook configuration"),el("p","Merchant endpoint metadata"));lh.append(lc);left.append(lh);
    left.append(table(el,["Merchant","Endpoint","Enabled","Secret version"],configs.map(w=>[w.merchant_name||merchantName(w.merchant_id),w.url,pill(el,w.enabled?"enabled":"disabled"),"v-"+String(w.id).slice(0,8)])));
    const rh=el("div",undefined,"panel-head"),rc=el("div");rc.append(el("h2","Delivery history"),el("p","Retry pending deliveries"));rh.append(rc);right.append(rh);
    const deliveries=data.rows.map(r=>{const actions=el("div",undefined,"admin-row-actions");if(data.canUpdate&&r.state==="pending"&&r.attempts<8)actions.append(button(el,"Retry",()=>retry(r),"primary"));return [r.merchant_name||merchantName(r.merchant_id),r.event_type,pill(el,r.state),r.attempts,r.last_code||"—",actions];});
    right.append(table(el,["Merchant","Event","State","Attempts","HTTP","Action"],deliveries));grid.append(left,right);container.append(grid);

    function configure(){
      dialog(el,container,"Configure webhook",(body,d)=>{
        const form=el("form",undefined,"form-grid"),merchant=selectField(el,form,"merchant","Merchant",merchants.rows.map(m=>[m.id,m.name])),url=field(el,form,"url","HTTPS endpoint","https://example.com/wpay","url"),enabled=selectField(el,form,"enabled","State",[["true","Enabled"],["false","Disabled"]],"true"),save=el("button","Save","primary");
        const loadCurrent=()=>{const current=configs.find(x=>x.merchant_id===merchant.value);if(current){url.value=current.url;enabled.value=String(!!current.enabled);}else{url.value="https://example.com/wpay";enabled.value="true";}};merchant.onchange=loadCurrent;loadCurrent();form.append(save);body.append(form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{const result=await post("panel/webhooks/configure",{merchantId:merchant.value,url:url.value,enabled:enabled.value==="true"});d.close();if(result.secret){const secret=document.createElement("dialog"),code=el("code",result.secret,"code-secret");secret.append(el("h2","Webhook secret rotated"),el("p","Save this secret now. It is shown once.","notice"),code,button(el,"Copy",()=>navigator.clipboard?.writeText(result.secret)),button(el,"Hide",()=>{code.textContent="Hidden";secret.close();webhooksPage(o);}));container.append(secret);secret.showModal();}else await webhooksPage(o);});};
      });
    }
    function retry(r){action(async()=>{await post("panel/webhooks/retry",{id:r.id});await webhooksPage(o);});}
  }
  async function apiLogsPage(o){
    const {post,el,container,title}=o;title.textContent="API logs";container.replaceChildren();
    const data=await post("panel/api-logs",{offset:0});
    container.append(el("p","Merchant API access audit only. Secrets, request bodies and sensitive payloads are not displayed.","notice"));
    container.append(panelTable(el,["Time","Merchant","Operation","Log ID"],data.rows.map(r=>[new Date(r.created_at).toLocaleString("en-IN"),r.merchant_name||r.merchant_id,r.operation,r.id])));
  }
  async function notificationsPage(o){
    const {post,action,el,container,title}=o;title.textContent="Notifications";container.replaceChildren();
    const data=await post("panel/notifications",{offset:0}),grid=el("div",undefined,"grid two-col"),settings=el("section",undefined,"card panel"),history=el("section",undefined,"card panel");
    const line=el("div",undefined,"toggle-line"),copy=el("div");copy.append(el("strong","In-app notifications"),el("p","Enable or disable Admin in-app notification delivery."));const label=el("label",undefined,"switch"),input=el("input"),span=el("span");input.type="checkbox";input.checked=!!data.preferences.in_app_notifications;input.disabled=!data.canUpdate;label.append(input,span);line.append(copy,label);
    settings.append(el("h2","Notification preferences"),line);
    if(data.canUpdate)settings.append(button(el,"Save preference",()=>action(async()=>{await post("panel/preferences",{inAppNotifications:input.checked});await notificationsPage(o);}),"primary"));
    const head=el("div",undefined,"panel-head"),headCopy=el("div");headCopy.append(el("h2","Recent notifications"),el("p","Security and account events"));head.append(headCopy);
    if(data.canUpdate&&data.rows.some(x=>!x.read))head.append(button(el,"Mark all read",()=>action(async()=>{await post("panel/notifications/read-all",{});await notificationsPage(o);}),"sm"));
    history.append(head);
    for(const n of data.rows){
      const row=el("div",undefined,"summary-row"),left=el("div");left.append(el("strong",n.event),el("div",new Date(n.created_at).toLocaleString("en-IN"),"small muted"));row.append(left,pill(el,n.read?"read":"unread"));history.append(row);
    }
    if(!data.rows.length)history.append(el("p","No notification events.","admin-empty"));
    grid.append(settings,history);container.append(grid);
  }
  async function profilePage(o){
    const {account,request,post,action,handleStage,el,container,title}=o;title.textContent="Profile";container.replaceChildren();
    const data=await request("panel/profile"),grid=el("div",undefined,"grid two-col"),profile=el("section",undefined,"card panel"),security=el("section",undefined,"card panel");
    profile.append(el("h2","Profile"));
    const form=el("form",undefined,"form-grid"),name=field(el,form,"name","Display name",account.name||""),email=field(el,form,"email","Email",account.email||"","email");
    const save=el("button","Save profile","primary");save.type="submit";if(!data.canEdit)save.disabled=true;form.append(save);profile.append(form);
    form.onsubmit=e=>{e.preventDefault();action(async()=>{
      if(data.canEdit&&name.value.trim()!==(account.name||"")){const r=await post("panel/profile/update",{name:name.value});account.name=r.name;}
      if(email.value.trim()!==(account.email||""))return confirmCurrentPassword("Change email",async password=>{
        const result=await post("security/admin-email",{password,newEmail:email.value.trim()});password="";await handleStage(result);
      });
      await profilePage(o);
    });};

    security.append(el("h2","Account security"));
    const passwordForm=el("form"),newPassword=field(el,passwordForm,"newPassword","New password","","password");newPassword.autocomplete="new-password";newPassword.minLength=15;newPassword.maxLength=128;
    passwordForm.append(el("p","Use at least 15 characters. Existing sessions are revoked after a successful change.","notice"));
    const change=el("button","Change password","primary");change.type="submit";passwordForm.append(change);security.append(passwordForm);
    passwordForm.onsubmit=e=>{e.preventDefault();if(!passwordForm.reportValidity())return;action(async()=>confirmCurrentPassword("Change password",async password=>{
      const result=await post("security/admin-password",{password,newPassword:newPassword.value});newPassword.value="";password="";await handleStage(result);
    }));};

    grid.append(profile,security);container.append(grid);

    function confirmCurrentPassword(labelText,submit){
      return new Promise((resolve,reject)=>{
        const d=document.createElement("dialog"),form=document.createElement("form"),wrap=el("label","Current password"),password=el("input");password.type="password";password.autocomplete="current-password";password.required=true;wrap.append(password);form.append(wrap,el("p","Confirm your current password to continue. Other active sessions may be revoked.","notice"));
        const buttons=el("div",undefined,"admin-row-actions"),ok=el("button",labelText,"primary"),cancel=el("button","Cancel");ok.type="submit";cancel.type="button";buttons.append(ok,cancel);form.append(buttons);d.append(el("h2",labelText),form);container.append(d);
        let finished=false;const finish=(error)=>{if(finished)return;finished=true;d.close();d.remove();if(error)reject(error);else resolve();};
        cancel.onclick=()=>finish();d.addEventListener("cancel",e=>{e.preventDefault();finish();});
        form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;ok.disabled=true;const secret=password.value;password.value="";try{await submit(secret);finish();}catch(err){ok.disabled=false;finish(err);}};
        d.showModal();
      });
    }
  }
  async function settingsPage(o){
    const {request,post,action,el,container,title}=o;title.textContent="Settings";container.replaceChildren();
    const [auth,defaults]=await Promise.all([request("panel/settings"),request("panel/merchant-default-rate")]);
    const tools=document.getElementById("page-tools");if(tools)tools.replaceChildren();
    const grid=el("div",undefined,"grid two-col"),commercial=el("section",undefined,"card panel"),policy=el("section",undefined,"card panel");
    const head=el("div",undefined,"panel-head"),copy=el("div");copy.append(el("h2","Commercial defaults"),el("p","Applied to new Merchant approvals and Admin-managed collection policy"));head.append(copy);commercial.append(head);
    if(!(defaults.tenants||[]).length)commercial.append(el("p","No writable workspace defaults in your scope.","admin-empty"));
    for(const item of defaults.tenants||[]){
      const form=el("form",undefined,"form-grid"),tenant=field(el,form,"tenant","Workspace",item.tenantId),rate=field(el,form,"rate","Merchant INR / USDT",item.rate||"107"),fixed=field(el,form,"fixed","Fixed payout fee INR",item.fixedPayoutFee||"6"),payin=field(el,form,"payin","Default pay-in fee %",item.payinFee||"1.2"),payout=field(el,form,"payout","Default payout fee %",item.payoutFee||"0.8"),ttl=field(el,form,"ttl","Payment link TTL sec",String(item.paymentLinkTtlSeconds||300));tenant.disabled=true;
      const line=el("div",undefined,"toggle-line full"),left=el("div"),label=el("label",undefined,"switch"),toggle=el("input"),span=el("span");left.append(el("strong","Admin-managed collections"),el("p","When ON, Admin-approved collection routes can operate without User-funded capacity while all other eligibility, UPI, ticket and daily-limit checks remain enforced."));toggle.type="checkbox";toggle.checked=!!item.adminManagedCollections;toggle.disabled=!defaults.canUpdate;label.append(toggle,span);line.append(left,label);form.append(line);
      const source=el("p","Current source: "+(item.adminManagedCollectionsSource==="admin"?"Admin setting":"environment fallback"),"notice full");form.append(source);
      if(defaults.canUpdate){const save=el("button","Save defaults","primary");save.type="submit";form.append(save);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("panel/merchant-default-rate/update",{tenantId:item.tenantId,rate:rate.value,fixedPayoutFee:fixed.value,payinFee:payin.value,payoutFee:payout.value,paymentLinkTtlSeconds:ttl.value,adminManagedCollections:toggle.checked});await settingsPage(o);});};}
      commercial.append(form);
    }
    policy.append(el("h2","Platform behavior"),el("p","Authentication/security timings remain server-enforced.","notice"));
    for(const [l,v] of [["Admin login",auth.adminLogin],["Employee login",auth.employeeLogin],["Session idle",auth.sessionIdleMinutes+" minutes"],["Session maximum",auth.sessionMaximumHours+" hours"],["Sensitive action confirmation",auth.sensitiveActionConfirmationMinutes+" minutes"]]){const row=el("div",undefined,"summary-row");row.append(el("span",l),el("strong",String(v)));policy.append(row);}
    grid.append(commercial,policy);container.append(grid);
  }
  async function ledgerPage(o){
    const {request,post,el,container,title}=o;title.textContent="Ledger";container.replaceChildren();
    const data=await request("business/ledger"),entries=data.entries||[];
    container.append(el("p","Live owner-side ledger projection. Immutable journals, balancing entries and idempotency data remain server authority.","notice"));
    const rows=entries.map(e=>[new Date(e.created_at).toLocaleString("en-IN"),e.owner_id,e.ledger_type,e.direction,money(e.amount_minor),e.reference_type,e.reference_id,e.payout_status||"—"]);
    container.append(panelTable(el,["Time","Owner","Ledger type","Direction","Amount","Reference type","Reference","Payout state"],rows));
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
    const data=await post("panel/admin-audit",{offset:0});container.append(el("p","Security, panel and business audit sources are combined in time order.","notice"),panelTable(el,["Time","Source","Action","Actor","Target"],data.rows.map(r=>[new Date(r.created_at).toLocaleString("en-IN"),r.source,r.action,r.actor_id,r.target_id||"—"])));
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
    const data=await request("apk"),metrics=el("div",undefined,"grid metrics");
    metrics.append(metric(el,"Package",data.package,"Android Agent"),metric(el,"Latest checked build",data.version+" / "+data.build,data.refreshedAt?new Date(data.refreshedAt).toLocaleString("en-IN"):"Current artifact"),metric(el,"Signing",data.signing?.identity||"Unavailable","Artifact signer identity"),metric(el,"Branch trigger","main only","Hosted branch changes do not trigger APK build"));
    container.append(metrics);
    const card=el("section",undefined,"card panel"),head=el("div",undefined,"panel-head"),copy=el("div");copy.append(el("h2","Release pipeline"),el("p","Live workflow / artifact summary"));head.append(copy);card.append(head);
    const line=(label,detail,state)=>{const r=el("div",undefined,"summary-row"),left=el("div");left.append(el("strong",label),el("div",detail,"small muted"));r.append(left,pill(el,state));return r;};
    card.append(
      line("Android unit tests","Gradle testDebugUnitTest before build","configured"),
      line("Debug APK build","assembleDebug in current workflow","configured"),
      line("Release APK signing","Current workflow does not run release signing","not configured"),
      line("Publish artifact metadata","WPAY-Agent.apk + WPAY-Agent.json on main","configured"),
      line("Hosted branch auto-trigger","Not configured; push trigger is main + android paths","not configured")
    );
    const dl=el("a","Download latest APK","primary");dl.href="/wpay-auth/roles/admin/apk/download";dl.download="WPAY-Agent.apk";card.append(el("p","OTP capture code is not changed by this Admin UI work.","notice"),dl);container.append(card);
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
    const {request,el,container,title,navigate}=o;title.textContent="Security";const data=await request("panel/settings");container.replaceChildren();const grid=el("div",undefined,"grid two-col"),auth=el("section",undefined,"card admin-panel"),boundaries=el("section",undefined,"card admin-panel");auth.append(el("h2","Authentication policy"));for(const [l,v]of [["Admin login",data.adminLogin],["Customer login",data.customerLogin],["Employee login",data.employeeLogin],["Session idle",data.sessionIdleMinutes+" minutes"],["Session maximum",data.sessionMaximumHours+" hours"],["Sensitive action confirmation",data.sensitiveActionConfirmationMinutes+" minutes"]]){const row=el("div",undefined,"summary-row");row.append(el("span",l),el("strong",String(v)));auth.append(row);}boundaries.append(el("h2","Authority boundaries"));for(const [l,v]of [["Tenant scoping","Required for Admin data access"],["Recent authentication","Required for high-risk changes"],["Super Admin platform scope","Required for API key/Admin authority"],["Operational OTP reader","Restricted read access"]]){const row=el("div",undefined,"summary-row");row.append(el("span",l),el("strong",v));boundaries.append(row);}boundaries.append(el("p","Use Account settings for password/email changes and recent-auth confirmation.","notice"),button(el,"Open Account settings",()=>navigate("v5.profile"),"primary"));grid.append(auth,boundaries);container.append(grid);
  }

  async function collectionAccessPage(o){
    const {request,post,action,el,container,title}=o;title.textContent="User collection access";container.replaceChildren();
    const data=await request("business/user-access"),policy=el("div",undefined,"policy-grid");
    for(const [name,body]of [["Free Setup","Allows APK/device and bank/UPI setup even when funded available capacity is zero."],["Unlimited Collection","Exempts collection routing from capacity insufficiency only. Account, device, UPI, ticket and daily limits still apply."],["First deposit policy","Without Free Setup, first confirmed deposit requires at least 2,000 USDT. After confirmed history, later top-ups may be smaller."]]){const c=el("article",undefined,"policy-card");c.append(el("strong",name),el("p",body));policy.append(c);}container.append(policy);
    const rows=data.users.map(u=>{const available=BigInt(u.available_minor||0),setup=u.free_setup||available>0n,actions=el("div",undefined,"admin-row-actions");actions.append(button(el,"Manage access",()=>edit(u)));return [u.name+" · "+u.id,money(available),u.free_setup?"enabled":"disabled",u.unlimited_collection?"enabled":"disabled",setup?"setup allowed":"funding required",u.unlimited_collection?"Capacity exempt":"Capacity backed",actions];});
    container.append(panelTable(el,["User","Capacity","Free setup","Unlimited collection","Setup status","Collection mode","Action"],rows),el("p","Unlimited Collection bypasses capacity, not security: User active/approved, device eligibility, UPI approval/verification, route min/max and per-UPI daily limit checks still apply.","notice"));
    function edit(u){dialog(el,container,"Collection access · "+u.name,(body,d)=>{const form=document.createElement("form"),toggle=(labelText,checked)=>{const line=el("div",undefined,"toggle-line"),copy=el("div"),wrap=el("label",undefined,"switch"),input=el("input"),span=el("span");copy.append(el("strong",labelText));input.type="checkbox";input.checked=checked;wrap.append(input,span);line.append(copy,wrap);form.append(line);return input;},free=toggle("Free Setup",u.free_setup),unlimited=toggle("Unlimited Collection",u.unlimited_collection),reason=field(el,form,"reason","Reason",u.reason||"Admin collection access update"),save=el("button","Save access","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/user-access/update",{userId:u.id,freeSetup:free.checked,unlimitedCollection:unlimited.checked,reason:reason.value});d.close();await collectionAccessPage(o);});};});}
  }

  async function transactionsPage(o){
    const {post,el,container,title}=o;title.textContent="Transactions";container.replaceChildren();const tools=document.getElementById("page-tools");if(tools)tools.replaceChildren();
    const [payins,payouts]=await Promise.all([post("operations/transactions",{offset:0,status:""}),post("payout/search",{offset:0,limit:50})]);
    const toolbar=el("div",undefined,"toolbar"),search=el("input"),status=el("select");search.className="control grow";search.placeholder="Search reference, UTR, merchant, user…";for(const v of ["","successful","verification_pending","failed"]){const op=el("option",v||"All status");op.value=v;status.append(op);}status.className="control";toolbar.append(search,status);const panel=el("section",undefined,"card admin-panel");container.append(toolbar,panel);
    const records=[
      ...payins.records.map(t=>({at:t.createdAt,reference:t.reference,id:t.orderId,type:"Pay-in",merchant:t.merchantId||"—",user:t.userId||"—",amount:t.amountMinor,utr:(t.observations||[]).map(x=>x.utr).join(", ")||"—",status:t.status,evidence:t.evidenceState||"—"})),
      ...payouts.orders.map(t=>({at:t.createdAt,reference:t.reference,id:t.id,type:"Payout",merchant:t.merchantId||"—",user:t.claimUserId||t.userId||"—",amount:t.amountMinor,utr:t.utr||"—",status:t.status,evidence:"payout workflow"}))
    ];
    let visible=records;const draw=()=>{const q=search.value.trim().toLowerCase(),st=status.value;visible=records.filter(t=>(!st||t.status===st)&&[t.reference,t.utr,t.merchant,t.user,t.id].join(" ").toLowerCase().includes(q));const rows=visible.map(t=>[t.at?new Date(t.at).toLocaleString("en-IN"):"—",t.reference+" · "+t.id,t.type,t.merchant+" · "+t.user,money(t.amount),t.utr,t.status,t.evidence]);panel.replaceChildren(table(el,["Time","Reference","Type","Merchant / User","Amount","UTR","Status","Evidence"],rows));};search.oninput=draw;status.onchange=draw;if(tools)tools.append(button(el,"Export transactions CSV",()=>{const fields=["id","reference","type","merchant","user","amount_minor","utr","status","evidence","at"],lines=[fields,...visible.map(t=>[t.id,t.reference,t.type,t.merchant,t.user,t.amount,t.utr,t.status,t.evidence,t.at])],csv=lines.map(r=>r.map(v=>`"${String(v??"").replaceAll(`"`,`""`)}"`).join(",")).join("\r\n"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download="wpay-transactions.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},"primary"));draw();
  }

  async function payoutDisputes(o){
    const {post,action,el,container,title}=o;title.textContent="Post-approval disputes";container.replaceChildren();
    const data=await post("payout/dispute/search",{offset:0,limit:25});
    container.append(el("p","Real 48-hour post-approval dispute: Merchant statement coverage must span payment time through near-current review time. Opening holds User capacity + payout commission. Invalid outcome reverses the exact reversible settlement entries.","notice"));
    const rows=data.orders.map(d=>{
      const actions=el("div",undefined,"admin-row-actions");
      const proofs=el("div",undefined,"admin-row-actions");
      if(d.statementId)proofs.append(button(el,"Statement",()=>download(d,d.statementId)));
      if(d.responseProofId)proofs.append(button(el,"User proof",()=>download(d,d.responseProofId)));
      if(d.status==="pending")actions.append(button(el,"Payment valid",()=>resolve(d,"payment_valid"),"primary"),button(el,"Payment invalid",()=>resolve(d,"payment_invalid"),"danger"));
      const identity=el("div");identity.append(el("strong",d.reference),el("div",d.id,"small muted"));
      return [identity,(d.merchantName||d.merchantId)+" · "+(d.userName||d.userId),money(d.amountMinor)+" · commission "+money(d.commissionMinor||0),(d.coverageFrom?new Date(d.coverageFrom).toLocaleString("en-IN"):"—")+" → "+(d.coverageThrough?new Date(d.coverageThrough).toLocaleString("en-IN"):"—"),d.reason,proofs,pill(el,d.status),actions];
    });
    container.append(panelTable(el,["Payout","Merchant / User","Amount / commission","Coverage","Reason","Proofs","Status","Action"],rows));
    function download(d,proofId){action(async()=>{const p=await post("payout/proof",{id:d.id,proofId}),bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:p.contentType||"application/octet-stream"})),a=document.createElement("a");a.href=url;a.download=p.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});}
    function resolve(d,decision){dialog(el,container,decision==="payment_valid"?"Payment valid":"Payment invalid",(body,dlg)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Resolution reason","Reviewed Merchant statement and User response"),save=el("button",decision==="payment_valid"?"Payment valid":"Payment invalid",decision==="payment_valid"?"primary":"danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/dispute/resolve",{id:d.id,action:decision,reason:reason.value});dlg.close();await payoutDisputes(o);});};});}
  }
  async function lateReviews(o){
    const {post,action,el,container,title}=o;title.textContent="Late payment reviews";container.replaceChildren();
    const [payoutData,parkingData]=await Promise.all([post("payout/late/search",{offset:0}),post("parking/late/search",{offset:0})]);
    const records=[
      ...(payoutData.requests||[]).map(r=>({...r,kind:"payout"})),
      ...(parkingData.requests||[]).map(r=>({...r,kind:"parking"}))
    ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    container.append(el("p","Late proof is review-only: existing tasks remain unchanged until explicit Admin approval or rejection. Reviewer can inspect UTR + proof, held amount, reserve mode and conflicts.","notice"));
    const rows=records.map(r=>{
      const proofCell=el("div");proofCell.append(el("strong","UTR / proof"),button(el,"View",()=>proof(r)));
      const actions=el("div",undefined,"admin-row-actions");
      if(r.status==="pending")actions.append(button(el,"Approve",()=>decide(r,"approve"),"primary"),button(el,"Reject",()=>decide(r,"reject"),"danger"));
      return [pill(el,r.kind),r.resource_id+" · "+r.user_name,money(r.amount_minor),money(r.held_minor),r.reserve_mode||"—",proofCell,r.reason+(r.conflict?" · "+r.conflict:""),pill(el,r.status),actions];
    });
    container.append(panelTable(el,["Kind","Resource / User","Amount","Held","Reserve","UTR / proof","Reason / conflict","Status","Action"],rows));
    function proof(r){action(async()=>{const route=r.kind==="parking"?"parking/late/proof":"payout/late/proof",p=await post(route,{id:r.id}),d=document.createElement("dialog"),bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes])),link=el("a","Download proof","primary");link.href=url;link.download=p.name;d.append(el("h2",(r.kind==="parking"?"Parking":"Payout")+" late proof"),el("p","UTR: "+p.utr+" · Scan: "+p.scanState,"notice"),link,button(el,"Close",()=>{URL.revokeObjectURL(url);d.close();}));container.append(d);d.showModal();});}
    function decide(r,decision){dialog(el,container,(decision==="approve"?"Approve ":"Reject ")+(r.kind==="parking"?"Parking":"Payout")+" late proof",(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Decision reason",decision==="approve"?"Late payment evidence accepted":"Late payment evidence rejected"),save=el("button",decision==="approve"?"Approve payment":"Reject request",decision==="approve"?"primary":"danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post(r.kind==="parking"?"parking/late/decide":"payout/late/decide",{id:r.id,action:decision,reason:reason.value});d.close();await lateReviews(o);});};});}
  }
  async function pairingHistory(o){
    const {post,action,el,container,title}=o;title.textContent="Pairing History";
    const [history,setup]=await Promise.all([post("operations/pairing-history",{offset:o.state?.offset||0}),post("operations/device-setup",{})]);
    container.replaceChildren();
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(metric(el,"Pairing requests",history.requests.length,"Account-owned pairing codes"),metric(el,"Used",history.requests.filter(x=>x.state==="used").length,"Linked to devices"),metric(el,"Pending",history.requests.filter(x=>x.state==="pending").length,"Waiting to be claimed"),metric(el,"Linked devices",setup.devices.length,"Scoped active links"));
    container.append(metrics,el("p","Pairing history and device metadata are separate from OTP-event access. Secret pairing codes are not re-exposed after issuance.","notice"));
    const rows=history.requests.map(r=>{const actions=el("div",undefined,"admin-row-actions");if(r.canCheck)actions.append(button(el,"Check pairing",()=>action(async()=>{await post("operations/device-setup/poll",{requestId:r.id});await pairingHistory(o);})));if(r.canRevoke)actions.append(button(el,"Revoke code",()=>action(async()=>{await post("operations/device-setup/revokeCode",{requestId:r.id});await pairingHistory(o);}),"danger"));return ["Hidden · "+r.id,(r.owner_name||r.owner_id)+" · "+(r.owner_type||"account"),new Date(r.created_at).toLocaleString("en-IN"),new Date(r.expires_at).toLocaleString("en-IN"),pill(el,r.state),r.device_ref||"—",actions];});
    container.append(panelTable(el,["Code / request","Owner / actor","Created","Expires","State","Device","Action"],rows));
  }
  async function directory(o,type){
    const {post,request,action,el,container,title}=o,isUser=type==="user",state=o.state||{},status=state.status||"",search=state.search||"";
    title.textContent=isUser?"Users":"Merchants";
    const [data,access]=await Promise.all([
      post("panel/directory",{type,status:status||"all",search,offset:0}),
      isUser?request("business/user-access").catch(()=>({users:[]})):Promise.resolve({users:[]})
    ]);
    const accessMap=new Map((access.users||[]).map(x=>[x.id,x]));
    container.replaceChildren();
    container.append(el("p",isUser?"Admin-created User supports an Admin-set password. Create & approve now is handled as account creation followed by approval/commercial activation. Free Setup and Unlimited Collection remain separate controls.":"Admin-created Merchant supports an Admin-set password. Create & approve now is handled as account creation followed by approval/commercial activation.","notice"));
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
          controls.payin=field(el,form,"payin","Pay-in fee %",opts.defaultMerchantPayinFee||"1.2");controls.payout=field(el,form,"payout","Payout fee %",opts.defaultMerchantPayoutFee||"0.8");controls.fixed=field(el,form,"fixed","Fixed payout fee INR",opts.defaultMerchantFixedPayoutFee||"6");controls.ttl=field(el,form,"ttl","Payment link TTL sec",opts.defaultMerchantPaymentLinkTtlSeconds||"300");controls.rate=field(el,form,"rate","INR per USDT",opts.defaultMerchantInrPerUsdt||"107");
        }
        form.append(el("p","Admin sets the initial password. Approval is a separate server state.","notice"));
        const save=el("button","Create account","primary");save.type="submit";form.append(save);body.append(form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{const requestId=crypto.randomUUID(),created=await post("panel/directory/create",{requestId,type,name:name.value,email:email.value,password:password.value});password.value="";if(approveNow.value==="yes"){const settings=isUser?{payinCommission:controls.payin.value,payoutCommission:controls.payout.value,inrPerUsdt:controls.rate.value,depositNetwork:opts.depositNetworks?.[0]||"TRON-TRC20",depositAddress:controls.address.value}:{payinFee:controls.payin.value,payoutFee:controls.payout.value,fixedPayoutFee:controls.fixed.value,fixedFeeCurrency:opts.fixedFeeCurrency||"INR",paymentLinkTtlSeconds:controls.ttl.value,inrPerUsdt:controls.rate.value};await post("approval",{requestId:crypto.randomUUID(),accountId:created.id,decision:"approve",settings,reason:""});if(isUser)await post("business/user-access/update",{userId:created.id,freeSetup:controls.free.value==="true",unlimitedCollection:controls.unlimited.value==="true",reason:"Configured during Admin account creation"});}d.close();await directory(o,type);});};
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
        else{controls.payin=field(el,form,"payin","Pay-in fee %",settings.payinFee||opts.defaultMerchantPayinFee||"1.2");controls.payout=field(el,form,"payout","Payout fee %",settings.payoutFee||opts.defaultMerchantPayoutFee||"0.8");controls.fixed=field(el,form,"fixed","Fixed payout fee INR",settings.fixedPayoutFee||opts.defaultMerchantFixedPayoutFee||"6");controls.ttl=field(el,form,"ttl","Payment link TTL sec",String(settings.paymentLinkTtlSeconds||opts.defaultMerchantPaymentLinkTtlSeconds||"300"));controls.rate=field(el,form,"rate","INR per USDT",settings.inrPerUsdt||opts.defaultMerchantInrPerUsdt||"107");}
        const save=el("button",ok?"Approve":"Reject",ok?"primary":"danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const commercial=ok?(isUser?{payinCommission:controls.payin.value,payoutCommission:controls.payout.value,inrPerUsdt:controls.rate.value,depositNetwork:opts.depositNetworks?.[0]||"TRON-TRC20",depositAddress:controls.address.value}:{payinFee:controls.payin.value,payoutFee:controls.payout.value,fixedPayoutFee:controls.fixed.value,fixedFeeCurrency:opts.fixedFeeCurrency||"INR",paymentLinkTtlSeconds:controls.ttl.value,inrPerUsdt:controls.rate.value}):null;await post("approval",{requestId:crypto.randomUUID(),accountId:a.id,decision:ok?"approve":"reject",settings:commercial,reason:ok?"":reason.value});if(ok&&isUser)await post("business/user-access/update",{userId:a.id,freeSetup:controls.free.value==="true",unlimitedCollection:controls.unlimited.value==="true",reason:"Configured during Admin approval"});d.close();await directory(o,type);});};
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
    const {post,action,el,container,title}=o;title.textContent="Employees";const data=await post("operations/employees",{offset:0,limit:100});container.replaceChildren(el("p","All delegable Admin permissions are grouped by module. Restricted actions remain visible but disabled.","notice"));const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canCreate)tools.append(button(el,"+ Create employee",()=>editor(null),"primary"));}
    const rows=data.employees.map(e=>[e.name+" · "+e.email,pill(el,e.status),(e.admin_scope?.tenantIds||[]).join(", "),String(e.permissions.length)+" permissions",e.permission_version,data.canUpdate?button(el,"Edit access",()=>editor(e)):"Read only"]);container.append(panelTable(el,["Employee","Status","Tenant","Page / permission access","Version","Action"],rows));
    function editor(emp){
      dialog(el,container,emp?"Edit Employee · "+emp.name:"Create Employee",(body,d)=>{
        const form=el("form",undefined,"form-grid"),name=field(el,form,"name","Name",emp?.name||""),email=field(el,form,"email","Email",emp?.email||"","email"),password=field(el,form,"password",emp?"Reset / set login password":"Set login password","","password"),status=selectField(el,form,"status","Status",[["active","Active"],["suspended","Suspended"],["disabled","Disabled"]],emp?.status||"active");
        const tenantWrap=el("div",undefined,"permission-group full");tenantWrap.append(el("h4","Operational tenants"));const tenantChecks=[];for(const t of data.tenantIds){const l=el("label",undefined,"permission-option"),i=el("input");i.type="checkbox";i.checked=emp?(emp.admin_scope?.tenantIds||[]).includes(t):false;l.append(i,el("span",t));tenantWrap.append(l);tenantChecks.push([t,i]);}form.append(tenantWrap);
        const matrix=el("div",undefined,"permission-matrix full"),permissionChecks=[];for(const g of data.permissionGroups||[]){const group=el("section",undefined,"permission-group-v5"),h=el("h4",g.label);group.append(h);for(const p of g.permissions){const l=el("label",undefined,"permission-page"+(!p.selectable?" restricted":"")),i=el("input"),span=el("span");i.type="checkbox";i.checked=(emp?.permissions||data.requiredPermissions).includes(p.id);i.disabled=!p.selectable||data.requiredPermissions.includes(p.id);span.append(document.createTextNode(p.label),el("small",p.restricted?"Restricted":p.selectable?"Delegable":"Not delegable from this Admin"));l.append(i,span);group.append(l);permissionChecks.push([p.id,i]);}matrix.append(group);}form.append(matrix,el("p","Saving permission/status/password changes invalidates existing Employee sessions. MFA enrollment remains required.","notice"));
        const save=el("button",emp?"Save access":"Create Employee","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const permissions=[...new Set(permissionChecks.filter(([,i])=>i.checked).map(([id])=>id))],tenantIds=tenantChecks.filter(([,i])=>i.checked).map(([id])=>id),payload={name:name.value,email:email.value,permissions,tenantIds,...(emp?{id:emp.id,status:status.value}:{}),...(password.value?{password:password.value}:{})};await post(emp?"operations/employee/update":"operations/employee/create",payload);password.value="";d.close();await employees(o);});};
      });
    }
  }

  async function admins(o){
    const {post,action,el,container,title}=o;title.textContent="Admin authority";const data=await post("operations/admins",{offset:0,limit:100});container.replaceChildren(el("p","Only Super Admin platform authority can create or modify scoped Admin authority.","notice"));const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();tools.append(button(el,"+ Create admin",()=>editor(null),"primary"));}
    const rows=data.admins.map(a=>[a.name+" · "+a.email,pill(el,a.status),(a.admin_scope?.tenantIds||[]).join(", "),String(a.permissions.length)+" permissions",a.permission_version,button(el,"Edit access",()=>editor(a))]);container.append(panelTable(el,["Admin","Status","Tenant","Delegated permissions","Version","Action"],rows));
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
