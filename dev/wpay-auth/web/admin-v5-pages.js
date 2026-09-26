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
