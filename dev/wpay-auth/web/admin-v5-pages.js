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
    const [users,merchants,banks,deposits,payouts]=await Promise.all([
      post("panel/directory",{type:"user",status:"pending",search:"",offset:0}),
      post("panel/directory",{type:"merchant",status:"pending",search:"",offset:0}),
      post("business/banks",{}),
      post("funding/list",{state:"review",offset:0}),
      post("payout/approval/search",{offset:0,limit:25}).catch(()=>({orders:[]}))
    ]);
    container.replaceChildren();
    const bankCount=banks.banks.filter(x=>["submitted","review"].includes(x.status)).length,payoutCount=(payouts.orders||[]).length;
    const primary=el("div",undefined,"admin-primary-kpis");
    for(const [label,value,hint] of [
      ["User approvals",users.rows.length,"Registration review"],["Merchant approvals",merchants.rows.length,"Commercial activation"],
      ["Bank / UPI review",bankCount,"UPI review"],["Deposit review",deposits.requests.length,"Funding evidence"],
      ["Payout approvals",payoutCount,"Reserved payouts"],["Total waiting",users.rows.length+merchants.rows.length+bankCount+deposits.requests.length+payoutCount,"Visible scoped queues"]
    ])primary.append(metric(el,label,value,hint));
    container.append(primary);
    const list=el("section",undefined,"card admin-panel");list.append(el("h2","Open queues"));
    for(const [label,destination,count] of [
      ["Users","administration.users",users.rows.length],["Merchants","administration.merchants",merchants.rows.length],
      ["Bank & UPI","administration.bank-upi",bankCount],["Deposits","administration.deposits",deposits.requests.length],["Payout approvals","payout.orders",payoutCount]
    ]){const row=el("div",undefined,"admin-review");row.append(el("span",label),el("strong",String(count)),button(el,"Review →",()=>navigate(destination)));list.append(row);}
    container.append(list);
  }


  async function bankUpi(o){
    const {post,action,el,container,title,navigate}=o;
    title.textContent="Bank & UPI";container.replaceChildren();
    const [directory,generic]=await Promise.all([post("business/admin-upi",{offset:0,search:""}),post("business/banks",{})]);
    const genericById=new Map(generic.banks.map(x=>[x.id,x]));
    const toolbar=el("div",undefined,"admin-toolbar");
    toolbar.append(el("p","Admin-approved UPI creation, standard review/freeze controls, shared daily limits and Merchant routes in one live V5 page.","notice"));
    if(directory.canCreate)toolbar.append(button(el,"+ Add Admin-approved UPI",()=>createUpi(),"primary"));
    container.append(toolbar);
    const metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(
      metric(el,"Total UPI",directory.banks.length,"Scoped bank/UPI accounts"),
      metric(el,"Running",directory.banks.filter(x=>x.status==="running"&&!x.frozen).length,"Operational"),
      metric(el,"Needs review",generic.banks.filter(x=>["submitted","review"].includes(x.status)).length,"Submitted/review"),
      metric(el,"Frozen",directory.banks.filter(x=>x.frozen).length,"Operational hold"),
      metric(el,"Active routes",directory.routes.filter(x=>x.status==="active").length,"Merchant assignments"),
      metric(el,"Admin-approved",directory.banks.filter(x=>x.admin_approved_by).length,"Challenge bypass provenance")
    );container.append(metrics);
    const rows=directory.banks.map(b=>{
      const g=genericById.get(b.id)||b,limit=BigInt(b.sharedLimit||g.daily_limit_minor||0),used=BigInt(b.used||0),routeCount=directory.routes.filter(r=>r.bank_id===b.id&&r.status==="active").length;
      const actions=el("div",undefined,"admin-row-actions");
      actions.append(button(el,"Details",()=>showDetails(b,g)));
      if(["submitted","review"].includes(g.status)){
        if(generic.actions.includes("approve"))actions.append(button(el,"Approve",()=>review(g,"approve"),"primary"));
        if(generic.actions.includes("reject"))actions.append(button(el,"Reject",()=>review(g,"reject"),"danger"));
      }
      if(g.frozen&&generic.actions.includes("release"))actions.append(button(el,"Release freeze",()=>review(g,"release_freeze")));
      else if(!g.frozen&&generic.actions.includes("freeze"))actions.append(button(el,"Freeze",()=>review(g,"freeze"),"danger"));
      if(["enabled","running"].includes(g.status)&&generic.actions.includes("stop"))actions.append(button(el,"Stop",()=>review(g,"stop")));
      return [b.details?.upiId||b.id,(b.owner_name||b.owner_id)+" · "+(b.details?.bankName||"—"),b.admin_approved_by?"Admin approved":g.verified_version===g.version?"Payment verified":"Verification pending",money(used)+" / "+money(limit),g.statement?.status||"—",g.frozen?"frozen":g.status,routeCount,actions];
    });
    container.append(table(el,["UPI","Owner / bank","Approval","Daily limit usage","Statement","State","Routes","Actions"],rows));

    function field(form,label,value=""){const l=el("label",label),i=el("input");i.required=true;i.value=value;l.append(i);form.append(l);return i;}
    function createUpi(){
      const d=document.createElement("dialog"),form=document.createElement("form"),users=directory.accounts.filter(x=>x.account_type==="user"),ownerLabel=el("label","Account owner"),owner=el("select");
      for(const u of users){const op=el("option",u.name);op.value=u.id;owner.append(op);}ownerLabel.append(owner);form.append(ownerLabel);
      const upi=field(form,"UPI ID"),holder=field(form,"Account holder"),bank=field(form,"Bank name"),account=field(form,"Account number"),ifsc=field(form,"IFSC"),mobile=field(form,"Registered mobile"),limit=field(form,"Shared daily bank limit (INR)","100000.00"),provider=field(form,"UPI provider",""),notes=field(form,"Notes",""),reason=field(form,"Approval reason");
      const save=el("button","Create approved UPI","primary");save.type="submit";form.append(el("p",(directory.adminManagedCollections?"Admin-managed collection enabled. ":"Funded User capacity remains required. ")+"Admin approval replaces the UPI payment challenge for this entry. Shared bank and route limits still apply.","notice"),save,button(el,"Cancel",()=>d.close()));
      form.onsubmit=e=>{e.preventDefault();action(async()=>{const [w,dec=""]=limit.value.split("."),bankLimitMinor=(BigInt(w)*100n+BigInt(dec.padEnd(2,"0"))).toString();await post("business/admin-upi/create",{ownerId:owner.value,details:{upiId:upi.value,holderName:holder.value,bankName:bank.value,accountNumber:account.value,ifsc:ifsc.value.toUpperCase(),mobile:mobile.value,providerName:provider.value,notes:notes.value,accountType:"business",bankLimitMinor},reason:reason.value,requestId:crypto.randomUUID()});d.close();await bankUpi(o);});};d.append(el("h2","Add Admin-approved UPI"),form);container.append(d);d.showModal();
    }
    function review(bank,command){
      const d=document.createElement("dialog"),form=document.createElement("form"),reason=field(form,"Reason"),save=el("button",command.replaceAll("_"," "),command==="reject"||command==="freeze"?"danger":"primary");save.type="submit";form.append(save,button(el,"Cancel",()=>d.close()));
      form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/banks/review",{bankId:bank.id,version:bank.version,action:command,reason:reason.value});d.close();await bankUpi(o);});};d.append(el("h2","UPI "+command.replaceAll("_"," ")),form);container.append(d);d.showModal();
    }
    function showDetails(bank,g){
      const old=container.querySelector(".v5-upi-detail");if(old)old.remove();const card=el("section",undefined,"card admin-record-detail v5-upi-detail"),top=el("div",undefined,"admin-toolbar");top.append(el("h2",bank.details?.upiId||bank.id),button(el,"Close",()=>card.remove()));card.append(top);
      const facts=el("div",undefined,"kv-grid");
      for(const [label,value] of [["Owner",bank.owner_name||bank.owner_id],["Bank",bank.details?.bankName],["Account",bank.details?.accountNumber],["IFSC",bank.details?.ifsc],["Mobile",bank.details?.mobile],["Version",bank.version],["Verification",g.verification?.status||"—"],["Statement",g.statement?.status||"—"],["Routes",directory.routes.filter(r=>r.bank_id===bank.id).length]])facts.append((()=>{const x=el("div",undefined,"v5-fact");x.append(el("small",label),el("strong",String(value??"—")));return x;})());
      card.append(facts,button(el,"Open routing",()=>navigate("administration.routing"),"primary"));container.append(card);card.scrollIntoView({behavior:"smooth",block:"nearest"});
    }
  }

  async function upiAnalytics(o){
    const {request,el,container,title}=o;
    title.textContent="UPI Analytics";
    const [banks,routing]=await Promise.all([request("business/banks"),request("business/routing")]);
    container.replaceChildren();
    const running=banks.banks.filter(b=>b.status==="running"&&!b.frozen&&!b.deactivated),available=running.filter(b=>BigInt(b.daily_limit_minor||0)>0n);
    const primary=el("div",undefined,"admin-primary-kpis");
    for(const [label,value,hint] of [
      ["Total UPI",banks.banks.length,"Configured accounts"],["Running UPI",running.length,"Operational"],["Available UPI",available.length,"Daily limit configured"],
      ["Routing candidates",routing.candidates.length,"Merchant/User eligibility"],["Reservations",routing.reservations.length,"Recent reservations"],["Reconciliation",routing.reconciliation.length,"Capacity events"]
    ])primary.append(metric(el,label,value,hint));
    container.append(primary);
    const rows=banks.banks.map(b=>{
      const links=routing.candidates.filter(c=>c.userId===b.owner_id),eligible=links.filter(c=>c.eligible).length;
      return [b.details?.upiId||b.id,b.details?.bankName||"—",b.status,money(b.daily_limit_minor||0),eligible+" / "+links.length,b.statement?.status||"—",b.verification?.status||"—"];
    });
    container.append(table(el,["UPI","Bank","State","Daily limit","Eligible routes","Statement","Verification"],rows));
  }

  async function parkingView(o,mode){
    const {request,post,action,el,container,title}=o,data=await request("parking/admin");
    title.textContent=mode==="beneficiaries"?"Parking Beneficiaries":mode==="orders"?"Parking Orders":"Parking Review";
    container.replaceChildren();
    if(mode==="beneficiaries"){
      const toolbar=el("div",undefined,"admin-toolbar");toolbar.append(el("p","Beneficiaries created for Users in the selected workspace.","notice"));
      if(data.canCreate)toolbar.append(button(el,"+ Create beneficiary",()=>createBeneficiary()));container.append(toolbar);
      container.append(table(el,["Name","Workspace","Bank","Account","IFSC","UPI"],data.beneficiaries.map(b=>[b.details.beneficiaryName,b.tenantId,b.details.bankName,b.details.accountNumber,b.details.ifsc,b.details.upiId||"—"])));
      function createBeneficiary(){
        const d=document.createElement("dialog"),f=document.createElement("form");d.append(el("h2","Create Parking Beneficiary"));
        const input=label=>{const l=el("label",label),i=el("input");i.required=true;l.append(i);f.append(l);return i;};
        const tenant=input("Workspace"),name=input("Beneficiary name"),bank=input("Bank name"),account=input("Account number"),ifsc=input("IFSC"),upi=input("UPI ID");tenant.value=data.tenants[0]||"";
        const save=el("button","Create","primary");save.type="submit";f.append(save,button(el,"Cancel",()=>d.close()));
        f.onsubmit=e=>{e.preventDefault();action(async()=>{await post("parking/beneficiary/create",{requestId:crypto.randomUUID(),tenantId:tenant.value,beneficiaryName:name.value,bankName:bank.value,accountNumber:account.value,ifsc:ifsc.value.toUpperCase(),upiId:upi.value});d.close();await parkingView(o,mode);});};
        d.append(f);container.append(d);d.showModal();
      }
      return;
    }
    if(mode==="orders"){
      const toolbar=el("div",undefined,"admin-toolbar");toolbar.append(el("p","Total, minimum and maximum per transaction are enforced by the live Parking backend.","notice"));
      if(data.canCreate)toolbar.append(button(el,"+ Create Parking order",()=>createOrder()));container.append(toolbar);
      container.append(table(el,["Reference","Workspace","Total","Minimum","Maximum","State"],data.orders.map(x=>[x.reference,x.tenantId,money(x.totalMinor),money(x.minMinor),money(x.maxMinor||x.totalMinor),x.state])));
      function createOrder(){
        const d=document.createElement("dialog"),f=document.createElement("form");d.append(el("h2","Create Parking Order"));
        const select=(label,items)=>{const l=el("label",label),s=el("select");for(const [v,t] of items){const op=el("option",t);op.value=v;s.append(op);}l.append(s);f.append(l);return s;};
        const input=label=>{const l=el("label",label),i=el("input");i.required=true;l.append(i);f.append(l);return i;};
        const tenant=select("Workspace",(data.tenants||[]).map(x=>[x,x])),beneficiary=select("Beneficiary",data.beneficiaries.map(b=>[b.id,b.details.beneficiaryName+" · "+b.details.bankName]));
        const reference=input("Reference"),total=input("Total INR"),min=input("Minimum / txn INR"),max=input("Maximum / txn INR");
        const toMinor=v=>{const [w,d=""]=String(v).split(".");return (BigInt(w)*100n+BigInt(d.padEnd(2,"0"))).toString();};
        const save=el("button","Create","primary");save.type="submit";f.append(save,button(el,"Cancel",()=>d.close()));
        f.onsubmit=e=>{e.preventDefault();action(async()=>{await post("parking/order/create",{requestId:crypto.randomUUID(),tenantId:tenant.value,beneficiaryId:beneficiary.value,reference:reference.value,totalMinor:toMinor(total.value),minMinor:toMinor(min.value),maxMinor:toMinor(max.value)});d.close();await parkingView(o,mode);});};
        d.append(f);container.append(d);d.showModal();
      }
      return;
    }
    const rows=data.reviews.map(r=>{
      const actions=el("div",undefined,"admin-row-actions");
      actions.append(
        button(el,"Proof",async()=>{const p=await post("parking/proof",{id:r.id}),bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes])),a=document.createElement("a");a.href=url;a.download=p.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}),
        button(el,"Approve",()=>decision(r,"approve"),"primary"),
        button(el,"Not paid",()=>decision(r,"not_paid"),"danger")
      );
      return [r.reference,r.userName,money(r.amountMinor),r.state,r.scanState||"—",actions];
    });
    container.append(table(el,["Reference","User","Amount","State","Scan","Action"],rows));
    function decision(r,chosen){
      const d=document.createElement("dialog"),f=document.createElement("form"),l=el("label","Reason"),i=el("input");i.required=true;l.append(i);f.append(l);
      const save=el("button",chosen==="approve"?"Approve paid":"Not paid",chosen==="approve"?"primary":"danger");save.type="submit";f.append(save,button(el,"Cancel",()=>d.close()));
      f.onsubmit=e=>{e.preventDefault();action(async()=>{await post("parking/review",{id:r.id,action:chosen,reason:i.value});d.close();await parkingView(o,mode);});};d.append(el("h2","Parking decision"),f);container.append(d);d.showModal();
    }
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
    const data=await post("funding/list",{state:"",offset:0}),confirmed=data.requests.filter(r=>r.state==="confirmed"),pending=data.requests.filter(r=>["requested","detected","confirming","review"].includes(r.state));
    const sum=(rows,key)=>rows.reduce((n,r)=>n+BigInt(key==="credit"?r.credit_minor||0:r.snapshot?.amountMinor||0),0n);
    const metrics=el("div",undefined,"admin-primary-kpis");
    metrics.append(metric(el,"Confirmed deposit",money(sum(confirmed,"credit")),"Credited User capacity"),metric(el,"Needs review",pending.length,"Evidence / provider review"),metric(el,"USDT requested",(sum(data.requests,"usdt")/1000000n).toLocaleString("en-IN")+" USDT","Requested funding"),metric(el,"Funded Users",new Set(confirmed.map(r=>r.owner_id)).size,"Users with confirmed funding"));
    container.append(metrics,el("p","First confirmed deposit minimum is 2,000 USDT; later top-ups can be smaller. Manual Admin confirmation remains explicitly separate from blockchain verification.","notice"));
    const rows=data.requests.map(r=>{
      const actions=el("div",undefined,"admin-row-actions");
      if(!["confirmed","rejected","reversed"].includes(r.state)){
        if(data.actions.includes("review"))actions.append(button(el,"Recheck provider",()=>action(async()=>{await post("funding/recheck",{requestId:r.id});await deposits(o);})));
        if(data.actions.includes("approve"))actions.append(button(el,"Manual confirm",()=>manual(r,"manual_confirm"),"primary"));
        if(data.actions.includes("reject"))actions.append(button(el,"Reject",()=>manual(r,"manual_reject"),"danger"));
      }
      return [r.name,r.id,(BigInt(r.snapshot.amountMinor)/1000000n).toLocaleString("en-IN")+" USDT",r.snapshot.rate,r.claims?.[0]?.tx_hash||"No hash",r.state,r.source||"none",actions];
    });
    container.append(table(el,["User","Request","USDT","Rate","Tx reference","State","Source","Action"],rows));
    function manual(r,command){
      const d=document.createElement("dialog"),form=document.createElement("form"),reasonLabel=el("label","Review reason"),reason=el("input");reason.required=true;reasonLabel.append(reason);form.append(reasonLabel);
      let amount;if(command==="manual_confirm"){const l=el("label","Actual received USDT (optional)"),i=el("input");i.type="number";i.step="0.000001";l.append(i);form.append(l);amount=i;}
      const save=el("button",command==="manual_confirm"?"Confirm deposit":"Reject deposit",command==="manual_confirm"?"primary":"danger");save.type="submit";form.append(el("p","Manual confirmation records human-review provenance and does not claim blockchain verification.","notice"),save,button(el,"Cancel",()=>d.close()));
      form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("funding/review",{requestId:r.id,action:command,reason:reason.value,...(amount?.value?{amountUsdt:amount.value}:{})});d.close();await deposits(o);});};d.append(el("h2",command==="manual_confirm"?"Manual deposit confirmation":"Reject deposit"),form);container.append(d);d.showModal();
    }
  }

  async function routingPage(o){
    const {request,el,container,title}=o;title.textContent="Assignments & routing";container.replaceChildren();
    const data=await request("business/routing"),eligible=data.candidates.filter(x=>x.eligible),blocked=data.candidates.filter(x=>!x.eligible);
    const metrics=el("div",undefined,"admin-primary-kpis");metrics.append(metric(el,"Candidates",data.candidates.length,"Merchant/User routing candidates"),metric(el,"Eligible",eligible.length,"Can accept configured minimum"),metric(el,"Blocked",blocked.length,"Eligibility blockers"),metric(el,"Reservations",data.reservations.length,"Recent reservations"),metric(el,"Reconciliation",data.reconciliation.length,"Capacity deficit/review"),metric(el,"Strategy",data.strategy||"—","Server routing strategy"));container.append(metrics);
    const rows=data.candidates.map(c=>[c.merchantId,c.userId,c.priority??"—",c.eligible?"ready":"blocked",(c.reasons||[]).join(", ")||"—",c.capacity?.available??"—"]);
    container.append(table(el,["Merchant","User","Priority","Readiness","Reasons","Available capacity"],rows));
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

  async function render(destination,o){
    if(destination==="v5.analytics")return analytics(o);
    if(destination==="v5.credentials")return credentialsPage(o);
    if(destination==="v5.webhooks")return webhooksPage(o);
    if(destination==="v5.api-logs")return apiLogsPage(o);
    if(destination==="v5.notifications")return notificationsPage(o);
    if(destination==="v5.profile")return profilePage(o);
    if(destination==="v5.settings")return settingsPage(o);
    if(destination==="v5.payout-review")return payoutReview(o);
    if(destination==="v5.payout-capabilities")return payoutCapabilities(o);
    if(destination==="v5.merchant-usdt")return merchantUsdt(o);
    if(destination==="v5.withdrawals")return withdrawals(o);
    if(destination==="v5.commission-holds")return commissionHolds(o);
    if(destination==="v5.holds")return businessHolds(o);
    if(destination==="v5.utr")return utrCapture(o);
    if(destination==="v5.statements")return statementsPage(o);
    if(destination==="v5.deposits")return deposits(o);
    if(destination==="v5.routing")return routingPage(o);
    if(destination==="v5.assignments")return assignmentsPage(o);
    if(destination==="v5.devices")return devicesPage(o);
    if(destination==="v5.activation")return activationPage(o);
    if(destination==="v5.bank-upi")return bankUpi(o);
    if(destination==="v5.approvals")return approvals(o);
    if(destination==="v5.upi-analytics")return upiAnalytics(o);
    if(destination==="v5.upi-limits")return upiLimits(o);
    if(destination==="v5.payin-disputes")return payinDisputes(o);
    if(destination==="v5.payout-approval")return payoutApproval(o);
    if(destination==="v5.user-commissions")return userCommissions(o);
    if(destination==="v5.profit-expenses")return profitExpenses(o);
    if(destination==="v5.parking-beneficiaries")return parkingView(o,"beneficiaries");
    if(destination==="v5.parking-orders")return parkingView(o,"orders");
    if(destination==="v5.parking-review")return parkingView(o,"review");
    if(destination==="v5.pairing-history")return pairingHistory(o);
    throw new Error("error.NOT_FOUND");
  }
  root.WPayAdminV5Pages={render};
})(globalThis);
