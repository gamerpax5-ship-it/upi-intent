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
    if(destination==="v5.approvals")return approvals(o);
    if(destination==="v5.upi-analytics")return upiAnalytics(o);
    if(destination==="v5.parking-beneficiaries")return parkingView(o,"beneficiaries");
    if(destination==="v5.parking-orders")return parkingView(o,"orders");
    if(destination==="v5.parking-review")return parkingView(o,"review");
    if(destination==="v5.pairing-history")return pairingHistory(o);
    throw new Error("error.NOT_FOUND");
  }
  root.WPayAdminV5Pages={render};
})(globalThis);
