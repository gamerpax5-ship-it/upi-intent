"use strict";
(function(root){
  const money=value=>{
    const n=BigInt(value||0),a=n<0n?-n:n;
    return (n<0n?"−":"")+"₹"+(a/100n).toLocaleString("en-IN")+"."+String(a%100n).padStart(2,"0");
  };
  const button=(el,label,fn,cls="")=>{
    const b=el("button",label,[...new Set(("btn "+cls).trim().split(/\s+/))].join(" "));b.type="button";b.onclick=fn;return b;
  };
  const metric=(el,label,value,hint)=>{
    const c=el("article",undefined,"card metric-rich"),ico=el("div",undefined,"metric-ico"),copy=el("div");
    const icons=[[/upi|bank/i,"bank"],[/route|assign/i,"routing"],[/fee/i,"fee"],[/commission/i,"commission"],[/usdt|deposit/i,"usdt"],[/withdraw|settle/i,"withdraw"],[/hold|frozen/i,"hold"],[/device|linked/i,"device"],[/user|account/i,"users"],[/merchant/i,"merchant"],[/payout/i,"payout"],[/success|running|active/i,"success"],[/review|pending/i,"approvals"],[/volume|amount|capacity|limit/i,"capacity"]];
    if(root.WPayAdminUi?.icon)ico.innerHTML=root.WPayAdminUi.icon(icons.find(([re])=>re.test(label))?.[1]||"overview");
    copy.append(el("div",label,"label"),el("strong",String(value??"—")),el("div",hint||"","hint"));c.append(ico,copy);
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

  const pill=(el,value)=>{
    const state=String(value??"unknown").toLowerCase(),tone=["active","approved","verified","successful","completed","running","enabled","paid"].includes(state)?"green":["failed","rejected","suspended","revoked","cancelled","disabled","frozen"].includes(state)?"red":["pending","review","submitted","requested","processing","held","disputed"].includes(state)?"amber":"gray";
    return el("span",String(value??"—"),"pill "+tone);
  };
  let fieldSequence=0;
  function field(el,parent,name,label,value="",type="text"){
    const wrap=el("div",undefined,"field"),caption=el("label",label),input=el("input",undefined,"control");
    input.id="admin-field-"+(++fieldSequence);input.name=name;input.type=type;input.value=value??"";caption.htmlFor=input.id;
    wrap.append(caption,input);parent.append(wrap);return input;
  }
  function selectField(el,parent,name,label,choices,value){
    const wrap=el("div",undefined,"field"),caption=el("label",label),input=el("select",undefined,"control");
    input.id="admin-field-"+(++fieldSequence);input.name=name;caption.htmlFor=input.id;
    for(const [v,text] of choices){const option=el("option",text);option.value=v;input.append(option);}
    if(value!==undefined)input.value=value;wrap.append(caption,input);parent.append(wrap);return input;
  }
  function dialog(el,container,title,build){
    const modal=el("dialog",undefined,"admin-v5-dialog"),head=el("div",undefined,"modal-head"),body=el("div",undefined,"modal-body");
    const heading=el("h3",title);heading.id="admin-dialog-"+(++fieldSequence);modal.setAttribute("aria-labelledby",heading.id);
    head.append(heading,button(el,"Close",()=>modal.close(),"btn sm"));modal.append(head,body);modal.onclose=()=>modal.remove();
    build(body,modal);container.append(modal);modal.showModal();return modal;
  }

  async function analytics(o){
    const {post,action,el,container,title}=o;title.textContent="Analytics";const tools=document.getElementById("page-tools");if(tools)tools.replaceChildren();
    const safe=promise=>Promise.resolve(promise).catch(()=>null),[data,upi,devices,utrPending,utrLinks]=await Promise.all([
      post("panel/admin-overview",{days:14}),
      safe(post("business/upi-analytics",{days:1})),
      safe(post("operations/device-setup",{})),
      safe(post("operations/utr/pending",{status:"pending",offset:0})),
      safe(post("operations/utr-source",{}))
    ]);
    let utrToday=null;
    if(utrLinks?.links&&utrLinks.links.length<=20){
      const reads=await Promise.all(utrLinks.links.map(link=>safe(post("operations/utr-source",{linkId:link.id}))));
      const parts=date=>{const p=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(date)),m=Object.fromEntries(p.map(x=>[x.type,x.value]));return m.year+"-"+m.month+"-"+m.day;};
      const today=parts(data.asOf);utrToday=reads.flatMap(x=>x?.observations||[]).filter(x=>x.capturedAt&&parts(x.capturedAt)===today).length;
    }
    container.replaceChildren();
    const icon=name=>globalThis.WPayAdminUi?.icon?.(name)||"",metricRich=(iconName,label,value,hint="")=>{const card=el("article",undefined,"card metric-rich"),ico=el("div",undefined,"metric-ico"),body=el("div");ico.innerHTML=icon(iconName);body.append(el("div",label,"label"),el("strong",String(value??"—")),el("div",hint,"hint"));card.append(ico,body);return card;};
    const metrics=el("div",undefined,"grid analytics-metrics"),rate=data.overallSuccessRate==null?"—":(Number(data.overallSuccessRate)*100).toFixed(1)+"%",activeDevices=devices?devices.devices.filter(x=>x.status==="online").length:null;
    metrics.append(
      metricRich("volume","Today volume",money(data.todayVolume),"Successful pay-in + payout"),
      metricRich("success","Success rate",rate,"All current transaction records"),
      metricRich("bank","Running UPI",data.runningUpi,"Active receiving routes"),
      metricRich("users","Active users",data.activeUsers,"Approved + active Users"),
      metricRich("deposit","Today collection",money(data.todayCollection),"Successful pay-ins"),
      metricRich("payout","Successful payout",data.successfulPayouts,"Completed payout transactions today"),
      metricRich("fee","Platform fees",money(data.todayFees),"Today fee income"),
      metricRich("fee","User commission",money(data.todayUserCommission),"Today User earnings"),
      metricRich("payout","Today payout volume",money(data.todayPayoutVolume),"Successful payout principal"),
      metricRich("approvals","Pending payouts",data.pendingPayouts,"Admin/open/claimed/submitted"),
      metricRich("device","Active devices",activeDevices??"—","Paired operational devices"),
      metricRich("utr","UTR captured today",utrToday??"—",utrToday===null?"Scoped source unavailable or too large":"APK + statements")
    );container.append(metrics);

    const upper=el("div",undefined,"grid two-col");upper.style.marginTop="14px";
    const trend=el("section",undefined,"card panel"),trendHead=el("div",undefined,"panel-head"),trendCopy=el("div");trendCopy.append(el("h2","Volume trend"),el("p","Pay-in vs payout · 14 days"));trendHead.append(trendCopy);trend.append(trendHead);
    if(data.series?.length)trend.append(globalThis.WPayAdminUi.volumeChart(data));else trend.append(el("div","No successful payments in this period.","empty"));

    const health=el("section",undefined,"card panel"),healthHead=el("div",undefined,"panel-head"),healthCopy=el("div");healthCopy.append(el("h2","Transaction health"),el("p","Status distribution"));healthHead.append(healthCopy);health.append(healthHead);
    const counts=data.transactionHealth||{successful:0,pending:0,failed:0},total=Math.max(1,Number(counts.successful||0)+Number(counts.pending||0)+Number(counts.failed||0)),green=Number(counts.successful||0)/total*100,amber=Number(counts.pending||0)/total*100,donutWrap=el("div",undefined,"donut-wrap"),donut=el("div",undefined,"donut"),center=el("div",undefined,"donut-center");donut.style.background="conic-gradient(#42d392 0 "+green+"%,#ffbf69 "+green+"% "+(green+amber)+"%,#ff6f91 "+(green+amber)+"% 100%)";center.append(el("strong",rate),el("span","success"));donut.append(center);
    const summaries=el("div"),summary=(label,value)=>{const row=el("div",undefined,"summary-row");row.append(el("span",label),el("strong",String(value??0)));return row;};summaries.append(summary("Successful",counts.successful),summary("Verification pending",counts.pending),summary("Failed",counts.failed),summary("Pending UTR review",utrPending?.records?(String(utrPending.records.length)+(utrPending.hasMore?"+":"")):"—"));donutWrap.append(donut,summaries);health.append(donutWrap);upper.append(trend,health);container.append(upper);

    const lower=el("div",undefined,"grid two-col");lower.style.marginTop="14px";
    const merchants=el("section",undefined,"card panel"),merchantHead=el("div",undefined,"panel-head"),merchantCopy=el("div");merchantCopy.append(el("h2","Top merchants by volume"),el("p","Successful transaction volume"));merchantHead.append(merchantCopy);merchants.append(merchantHead);const merchantList=el("div",undefined,"mini-bar-list"),top=data.topMerchants||[],max=top.reduce((m,x)=>BigInt(x.amount||0)>m?BigInt(x.amount||0):m,1n);for(const x of top){const row=el("div",undefined,"mini-bar-row"),progress=el("div",undefined,"progress"),fill=el("span");fill.style.width=Number(BigInt(x.amount||0)*10000n/max)/100+"%";progress.append(fill);row.append(el("label",x.name),progress,el("strong",money(x.amount)));merchantList.append(row);}if(!top.length)merchantList.append(el("div","No successful merchant volume yet.","empty"));merchants.append(merchantList);

    const limits=el("section",undefined,"card panel"),limitHead=el("div",undefined,"panel-head"),limitCopy=el("div");limitCopy.append(el("h2","UPI shared-limit usage"),el("p","Highest utilization first"));limitHead.append(limitCopy);limits.append(limitHead);const limitList=el("div",undefined,"mini-bar-list"),banks=[...(upi?.banks||[])].sort((a,b)=>{const ap=BigInt(a.sharedLimit||0)?Number(BigInt(a.used||0)*10000n/BigInt(a.sharedLimit||1)):0,bp=BigInt(b.sharedLimit||0)?Number(BigInt(b.used||0)*10000n/BigInt(b.sharedLimit||1)):0;return bp-ap;});for(const b of banks){const limit=BigInt(b.sharedLimit||0),used=BigInt(b.used||0),pct=limit?Number(used*10000n/limit)/100:0,row=el("div",undefined,"mini-bar-row"),progress=el("div",undefined,"progress"),fill=el("span");fill.style.width=Math.min(100,pct)+"%";progress.append(fill);row.append(el("label",b.details?.upiId||b.id),progress,el("strong",pct.toFixed(1)+"%"));limitList.append(row);}if(!banks.length)limitList.append(el("div","No UPI utilization data available.","empty"));limits.append(limitList);
    lower.append(merchants,limits);container.append(lower);
  }

  async function approvals(o){
    const {post,request,el,container,title,navigate}=o;
    title.textContent="Pending approvals";
    const [users,merchants,banks,payouts,withdrawals]=await Promise.all([
      post("panel/directory",{type:"user",status:"pending",search:"",offset:0}),
      post("panel/directory",{type:"merchant",status:"pending",search:"",offset:0}),
      request("business/banks"),
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
    const section=el("section",undefined,"card panel"),head=el("div",undefined,"panel-head"),copy=el("div");copy.append(el("h2","Unified action queue"),el("p","Approvals stay in their own backend domain; this page only groups the work."));head.append(copy);section.append(head);
    section.append(table(el,["Type","Record","Name","Created","Action"],rows.map(r=>[pill(el,r.kind),r.id,r.name,r.created?new Date(r.created).toLocaleString("en-IN"):"—",button(el,"Open module",()=>navigate(r.destination),"btn sm primary")])));
    container.replaceChildren(band,section);
  }

  async function bankUpi(o){
    const {post,request,action,el,container,title}=o,search=String(o.state?.search||"");
    title.textContent="Bank & UPI";container.replaceChildren();
    const [directory,generic]=await Promise.all([post("business/admin-upi",{offset:0,search}),request("business/banks")]),genericById=new Map(generic.banks.map(x=>[x.id,x]));
    const tools=document.getElementById("page-tools");
    if(tools){
      tools.replaceChildren();
      const searchForm=el("form",undefined,"admin-inline-filter"),input=el("input");input.type="search";input.placeholder="Search owner or UPI ID";input.value=search;
      const submit=el("button","Search","btn sm");submit.type="submit";searchForm.append(input,submit);
      searchForm.onsubmit=e=>{e.preventDefault();action(()=>bankUpi({...o,state:{...(o.state||{}),search:input.value.trim()}}));};
      tools.append(searchForm);
      if(search)tools.append(button(el,"Clear",()=>action(()=>bankUpi({...o,state:{...(o.state||{}),search:""}})),"btn sm"));
      if(directory.canCreate)tools.append(button(el,"+ Add Admin-approved UPI",()=>createUpi(),"primary"));
    }
    const totalLimit=directory.banks.reduce((n,b)=>n+BigInt(b.sharedLimit||genericById.get(b.id)?.daily_limit_minor||0),0n),used=directory.banks.reduce((n,b)=>n+BigInt(b.used||0),0n),remaining=totalLimit>used?totalLimit-used:0n;
    const metrics=el("div",undefined,"grid analytics-metrics");
    metrics.append(
      metric(el,"Total UPI",directory.banks.length,search?"Filtered result":"Scoped collection accounts"),
      metric(el,"Running",directory.banks.filter(b=>{const g=genericById.get(b.id)||b;return g.status==="running"&&!g.frozen;}).length,"Operational accounts"),
      metric(el,"Needs review",directory.banks.filter(b=>{const g=genericById.get(b.id)||b;return ["submitted","review"].includes(g.status);}).length,"Submitted / review"),
      metric(el,"Frozen",directory.banks.filter(b=>(genericById.get(b.id)||b).frozen).length,"Operational hold"),
      metric(el,"Active routes",directory.routes.filter(r=>r.status==="active").length,"Merchant bindings"),
      metric(el,"Limit remaining",money(remaining),"Across visible UPI accounts")
    );
    container.append(metrics,el("p","Admin review supports approve/reject/freeze/release and operational Stop/Start. Per-UPI daily limit remains User-owned; Admin reviews the configured limit, utilization and route readiness without silently changing owner policy.","notice"));
    const rows=directory.banks.map(b=>{
      const g=genericById.get(b.id)||b,limit=BigInt(b.sharedLimit||g.daily_limit_minor||0),usedNow=BigInt(b.used||0),left=limit>usedNow?limit-usedNow:0n,routes=directory.routes.filter(r=>r.bank_id===b.id&&r.status==="active").length,actions=el("div",undefined,"admin-row-actions");
      actions.append(button(el,"Details",()=>details(b,g)));
      if(["submitted","review"].includes(g.status)){if(generic.actions.includes("approve"))actions.append(button(el,"Approve",()=>review(g,"approve"),"primary"));if(generic.actions.includes("reject"))actions.append(button(el,"Reject",()=>review(g,"reject"),"danger"));}
      if(g.frozen&&generic.actions.includes("release"))actions.append(button(el,"Release freeze",()=>review(g,"release_freeze")));else if(!g.frozen&&generic.actions.includes("freeze"))actions.append(button(el,"Freeze",()=>review(g,"freeze"),"danger"));
      if(["running","stopped","approved","verified"].includes(g.status)&&!g.frozen)actions.append(button(el,g.status==="stopped"?"Start":"Stop",()=>stateChange(b,g.status==="stopped"?"start":"stop")));
      const approval=b.admin_approved_by?"Admin approved":g.verified_version===g.version?"Payment verified":"Verification pending";
      return [(b.details?.upiId||b.id)+" · "+(b.owner_name||b.owner_id)+" · "+(b.details?.bankName||"—"),approval,money(usedNow)+" / "+money(limit)+" · "+money(left)+" remaining",g.statement?.status||"no statement",g.frozen?"frozen":g.status,routes,actions];
    });
    container.append(panelTable(el,["UPI / owner","Approval","Daily limit usage","Statement","State","Routes","Actions"],rows,"UPI directory",directory.banks.length+" accounts · "+directory.routes.filter(r=>r.status==="active").length+" active routes"+(directory.hasMore?" · more available":"")));
    function createUpi(){dialog(el,container,"Add Admin-approved UPI",(body,d)=>{const form=el("form",undefined,"form-grid"),users=directory.accounts.filter(x=>x.account_type==="user"),owner=selectField(el,form,"owner","Account owner",users.map(x=>[x.id,x.name])),upi=field(el,form,"upi","UPI ID"),holder=field(el,form,"holder","Account holder"),bank=field(el,form,"bank","Bank name"),account=field(el,form,"account","Account number"),ifsc=field(el,form,"ifsc","IFSC"),mobile=field(el,form,"mobile","Registered mobile"),provider=field(el,form,"provider","UPI provider"),type=selectField(el,form,"type","Account type",[["business","Business"],["personal","Personal"]],"business"),limit=field(el,form,"limit","Shared daily limit INR","1000000"),reason=field(el,form,"reason","Approval reason","Admin verified identity");form.append(el("p","Admin approval is provenance, not fabricated bank/payment evidence. Shared limits, capacity and route checks continue to apply.","notice"));const save=el("button","Create approved UPI","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const [w,fr=""]=String(limit.value).split("."),bankLimitMinor=(BigInt(w)*100n+BigInt(fr.padEnd(2,"0"))).toString();await post("business/admin-upi/create",{ownerId:owner.value,details:{upiId:upi.value,holderName:holder.value,bankName:bank.value,accountNumber:account.value,ifsc:ifsc.value.toUpperCase(),mobile:mobile.value,providerName:provider.value,notes:"",accountType:type.value,bankLimitMinor},reason:reason.value,requestId:crypto.randomUUID()});d.close();await bankUpi(o);});};});}
    function review(bank,command){dialog(el,container,(command==="approve"?"Approve ":command==="reject"?"Reject ":command.replaceAll("_"," ")+" ")+(bank.details?.upiId||bank.id),(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",command==="approve"?"Reviewed account identity":"Operational review"),save=el("button",command.replaceAll("_"," "),command==="reject"||command==="freeze"?"danger":"primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/banks/review",{bankId:bank.id,version:bank.version,action:command,reason:reason.value});d.close();await bankUpi(o);});};});}
    function stateChange(bank,command){dialog(el,container,(command==="start"?"Start ":"Stop ")+(bank.details?.upiId||bank.id),(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",command==="start"?"Resume approved UPI":"Operational stop"),save=el("button",command==="start"?"Start":"Stop",command==="start"?"primary":"danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/admin-upi/state",{bankId:bank.id,version:bank.version,action:command,reason:reason.value});d.close();await bankUpi(o);});};});}
    function details(bank,g){dialog(el,container,"UPI details · "+(bank.details?.upiId||bank.id),(body)=>{const dl=el("dl",undefined,"admin-details"),add=(k,v)=>{dl.append(el("dt",k),el("dd",String(v??"—")));};add("Owner",bank.owner_name||bank.owner_id);add("UPI",bank.details?.upiId);add("Holder",bank.details?.holderName);add("Bank",bank.details?.bankName);add("Account",bank.details?.accountNumber);add("IFSC",bank.details?.ifsc);add("Mobile",bank.details?.mobile);add("Version",bank.version);add("Status",g.frozen?"frozen":g.status);add("Approval",bank.admin_approved_by?"Admin approved":g.verified_version===g.version?"Payment verified":"Verification pending");add("User capacity",money(bank.available||0));add("Daily usage",money(bank.used||0)+" / "+money(bank.sharedLimit||g.daily_limit_minor||0));body.append(dl,el("h4","Merchant routes"));const routes=directory.routes.filter(r=>r.bank_id===bank.id);if(!routes.length)body.append(el("div","No explicit bank-specific Merchant routes.","admin-empty"));for(const r of routes){const row=el("div",undefined,"summary-row"),ready=r.readiness?.eligible?"eligible":(r.readiness?.reasons||[]).join(", ")||"not ready";row.append(el("span",(r.merchant_name||r.merchant_id)+" · priority "+r.priority+" · "+ready),el("strong",money(r.min_minor)+" – "+money(r.max_minor)));body.append(row);}});}
  }

  async function upiAnalytics(o){
    const {post,action,el,container,title}=o,days=o.state?.days||1;
    title.textContent="UPI Analytics";
    const data=await post("business/upi-analytics",{days});
    container.replaceChildren();
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();const tabs=el("div",undefined,"section-tabs");for(const n of [1,7,30]){const b=button(el,n===1?"Today":n+" days",()=>action(()=>upiAnalytics({...o,state:{...(o.state||{}),days:n}})),n===days?"active":"");b.dataset.upiWindow=String(n);tabs.append(b);}tools.append(tabs);}
    const totalLimit=BigInt(data.totalLimit||0),used=BigInt(data.used||0),util=totalLimit?Number(used*10000n/totalLimit)/100:0,activeRoutes=data.banks.reduce((n,b)=>n+Number(b.route_count||0),0),totalTx=data.banks.reduce((n,b)=>n+Number(b.txTotal||0),0),ok=data.banks.reduce((n,b)=>n+Number(b.successful||0),0),pending=data.banks.reduce((n,b)=>n+Number(b.pending||0),0),successRate=totalTx?ok/totalTx*100:0,volume=data.banks.reduce((n,b)=>n+BigInt(b.volume||b.successful_volume_minor||0),0n);
    const metrics=el("div",undefined,"grid analytics-metrics");
    metrics.append(
      metric(el,"Total UPI",data.banks.length,"All configured accounts"),
      metric(el,"Running UPI",data.running,"Running and not frozen"),
      metric(el,"Available UPI",data.available,"Shared limit remaining"),
      metric(el,"Collection volume",money(volume),days===1?"Today":days+" day window"),
      metric(el,"Limit used",money(used),util.toFixed(1)+"% utilization"),
      metric(el,"Active routes",activeRoutes,"Merchant assignments"),
      metric(el,"Success rate",successRate.toFixed(1)+"%","Successful ÷ all orders in window"),
      metric(el,"Needs review",data.banks.filter(x=>["submitted","review"].includes(x.status)).length,"UPI review queue")
    );container.append(metrics);
    if(!data.banks.length){container.append(el("div","No UPI analytics are available for the current scope.","empty"));return;}
    const byUtil=[...data.banks].sort((a,b)=>{const bl=BigInt(b.sharedLimit||0),al=BigInt(a.sharedLimit||0),bp=bl?Number(BigInt(b.used||0)*10000n/bl):0,ap=al?Number(BigInt(a.used||0)*10000n/al):0;return bp-ap;});
    const grid=el("div",undefined,"grid two-col"),utilCard=el("section",undefined,"card panel"),health=el("section",undefined,"card panel");const uHead=el("div",undefined,"panel-head"),uCopy=el("div");uCopy.append(el("h2","UPI utilization"),el("p","Shared daily limit consumption · highest first"));uHead.append(uCopy);utilCard.append(uHead);const bars=el("div",undefined,"mini-bar-list");for(const b of byUtil){const limit=BigInt(b.sharedLimit||0),spent=BigInt(b.used||0),p=limit?Number(spent*10000n/limit)/100:0,row=el("div",undefined,"mini-bar-row"),label=el("label",(b.details?.upiId||b.id)+" · "+(b.owner_name||"—")),progress=el("div",undefined,"progress"),fill=el("span");fill.style.width=Math.min(100,p)+"%";progress.append(fill);row.append(label,progress,el("strong",p.toFixed(1)+"%"));bars.append(row);}utilCard.append(bars);
    const hHead=el("div",undefined,"panel-head"),hCopy=el("div");hCopy.append(el("h2","Route & transaction health"),el("p",days===1?"Today":"Last "+days+" days"));hHead.append(hCopy);health.append(hHead);for(const [l,v]of [["Running / available",data.running+" / "+data.available],["Frozen UPI",data.banks.filter(x=>x.frozen).length],["Active routes",activeRoutes],["Transactions",totalTx],["Successful",ok],["Pending / verification",pending],["Other / non-success",Math.max(0,totalTx-ok-pending)]]){const row=el("div",undefined,"admin-profit-row");row.append(el("span",l),el("strong",String(v)));health.append(row);}grid.append(utilCard,health);container.append(grid);
    const rows=data.banks.map(b=>{const limit=BigInt(b.sharedLimit||0),spent=BigInt(b.used||0),remaining=limit>spent?limit-spent:0n;return [(b.details?.upiId||b.id)+" · "+(b.owner_name||"—"),b.frozen?"frozen":b.status,b.route_count||0,b.txTotal||0,b.successful||0,Math.max(0,Number(b.txTotal||0)-Number(b.successful||0)-Number(b.pending||0)),b.pending||0,b.successRate==null?"—":Number(b.successRate).toFixed(1)+"%",money(b.volume||b.successful_volume_minor||0),money(remaining)];});
    container.append(panelTable(el,["UPI / owner","State","Routes","Transactions","Successful","Other","Pending","Success rate","Volume","Limit remaining"],rows,"UPI performance","Live scoped analytics · "+(days===1?"Today":days+" days")));
  }

  async function parkingView(o,mode){
    const {request,post,action,el,container,title}=o,data=await request("parking/admin");
    title.textContent=mode==="beneficiaries"?"Parking Beneficiaries":mode==="orders"?"Parking Orders":"Parking Review";
    container.replaceChildren();
    const tools=document.getElementById("page-tools");if(tools)tools.replaceChildren();
    const beneficiaryById=new Map(data.beneficiaries.map(b=>[b.id,b])),orderById=new Map(data.orders.map(x=>[x.id,x]));
    const confirmedFor=b=>data.confirmations.filter(c=>c.beneficiary_id===b.id);
    const activeBeneficiaries=data.beneficiaries.filter(x=>!x.revoked),openOrders=data.orders.filter(x=>x.state==="open"&&BigInt(x.remainingMinor||0)>0n);
    const reviewOpen=data.reviews.filter(x=>["submitted","review","disputed"].includes(x.state));

    const preview=()=>{
      dialog(el,container,"Preview what a User sees",(body)=>{
        if(!(data.users||[]).length){body.append(el("p","No approved active Users are available in this scope.","empty"));return;}
        const form=document.createElement("form"),label=el("label","User"),select=el("select");for(const u of data.users){const op=el("option",u.name);op.value=u.id;select.append(op);}label.append(select);form.append(label);const host=el("div");body.append(form,host);
        const draw=()=>{const uid=select.value,confirmed=new Set(data.confirmations.filter(c=>c.user_id===uid).map(c=>c.beneficiary_id)),visible=data.orders.filter(o=>o.state==="open"&&BigInt(o.remainingMinor||0)>0n&&confirmed.has(o.beneficiaryId));host.replaceChildren();const phone=el("div",undefined,"preview-phone"),head=el("div","WPay User · Parking","preview-phone-head"),screen=el("div",undefined,"preview-screen");screen.append(el("div","Confirmed beneficiaries","eyebrow"));const confirmedRows=activeBeneficiaries.filter(b=>confirmed.has(b.id));if(!confirmedRows.length)screen.append(el("div","No confirmed beneficiaries.","preview-item"));for(const b of confirmedRows){const item=el("div",undefined,"preview-item");item.append(el("strong",b.details.beneficiaryName),el("span",b.details.bankName+" · confirmed"));screen.append(item);}screen.append(el("div","Visible Parking orders","eyebrow"));if(!visible.length){const item=el("div",undefined,"preview-item");item.append(el("strong","No eligible Parking orders"),el("span","Only open orders tied to a confirmed beneficiary are visible."));screen.append(item);}for(const o of visible){const b=beneficiaryById.get(o.beneficiaryId),item=el("div",undefined,"preview-item");item.append(el("strong",o.reference+" · "+money(o.remainingMinor||0)+" remaining"),el("span",(b?.details.beneficiaryName||"—")+" · min "+money(o.minMinor)+" · max "+money(o.maxMinor||o.totalMinor)));screen.append(item);}phone.append(head,screen);host.append(phone);};select.onchange=draw;draw();
      });
    };

    if(mode==="beneficiaries"){
      if(tools){if(data.canCreate)tools.append(button(el,"+ Create beneficiary",()=>createBeneficiary(),"primary"));tools.append(button(el,"User preview",preview));}
      const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
        metric(el,"Active beneficiaries",activeBeneficiaries.length,"Tenant-scoped records"),
        metric(el,"User confirmations",data.confirmations.length,"I added confirmations"),
        metric(el,"Confirmed beneficiaries",data.beneficiaries.filter(b=>Number(b.confirmationCount||0)>0&&!b.revoked).length,"Visible to at least one User"),
        metric(el,"Open orders",openOrders.length,"Remaining amount available"),
        metric(el,"Review queue",reviewOpen.length,"Submitted / review / disputed"),
        metric(el,"Approved Users",(data.users||[]).length,"Preview / confirmation population")
      );
      container.append(metrics,el("p","Admin or an authorized operational role creates a beneficiary. A User must add that exact beneficiary in their banking app and confirm it before matching Parking orders become visible.","notice"));
      const rows=data.beneficiaries.map(b=>[
        b.details.beneficiaryName+" · "+b.id,
        b.tenantId,
        b.details.bankName+" · ••••"+String(b.details.accountNumber||"").slice(-4)+" · "+b.details.ifsc,
        b.details.upiId||"—",
        (b.sourceName||"—")+" · "+(b.sourceType||"—"),
        String(b.confirmationCount||0)+(confirmedFor(b).length?" · "+confirmedFor(b).map(c=>c.user_name).join(", "):""),
        data.orders.filter(o=>o.beneficiaryId===b.id&&o.state==="open").length,
        b.revoked?"revoked":"active"
      ]);
      container.append(panelTable(el,["Beneficiary","Workspace","Bank details","UPI","Created by","User confirmations","Open orders","State"],rows,"Parking beneficiaries",activeBeneficiaries.length+" active"));
      function createBeneficiary(){dialog(el,container,"Create Parking Beneficiary",(body,d)=>{const form=el("form",undefined,"form-grid"),tenant=selectField(el,form,"tenant","Workspace",(data.tenants||[]).map(x=>[x,x]),data.tenants?.[0]),name=field(el,form,"name","Beneficiary name"),bank=field(el,form,"bank","Bank name"),account=field(el,form,"account","Account number"),ifsc=field(el,form,"ifsc","IFSC"),upi=field(el,form,"upi","UPI ID (optional)","", "text", false);account.pattern="[0-9]{6,24}";ifsc.pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}";const save=el("button","Create beneficiary","primary");save.type="submit";form.append(el("p","Account number and IFSC must match the exact bank beneficiary the User will add.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;action(async()=>{await post("parking/beneficiary/create",{requestId:crypto.randomUUID(),tenantId:tenant.value,beneficiaryName:name.value,bankName:bank.value,accountNumber:account.value,ifsc:ifsc.value.toUpperCase(),upiId:upi.value.trim()});d.close();await parkingView(o,mode);});};});}
      return;
    }

    if(mode==="orders"){
      if(tools){if(data.canCreate)tools.append(button(el,"+ Create Parking order",()=>createOrder(),"primary"));tools.append(button(el,"User visibility preview",preview));}
      const totalOpen=openOrders.reduce((n,o)=>n+BigInt(o.remainingMinor||0),0n),totalLocked=data.orders.reduce((n,o)=>n+BigInt(o.lockedMinor||o.locked||0),0n);
      const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
        metric(el,"Orders",data.orders.length,"Latest scoped orders"),
        metric(el,"Open orders",openOrders.length,"Accepting eligible User payments"),
        metric(el,"Open amount",money(totalOpen),"Remaining across open orders"),
        metric(el,"Locked / in-flight",money(totalLocked),"Active + review related locks"),
        metric(el,"Confirmed beneficiaries",data.beneficiaries.filter(b=>Number(b.confirmationCount||0)>0&&!b.revoked).length,"Can expose matching orders"),
        metric(el,"Review queue",reviewOpen.length,"Submitted evidence")
      );
      container.append(metrics,el("p","Each Parking order enforces total, minimum and maximum per transaction. User payment visibility requires a confirmed beneficiary. The backend uses a 10-minute payment lease plus a 5-minute submission cooldown/grace path.","notice"));
      const rows=data.orders.map(o=>{const b=beneficiaryById.get(o.beneficiaryId),locked=BigInt(o.lockedMinor||o.locked||0),remaining=BigInt(o.remainingMinor||0);return [
        o.reference+" · "+o.id,
        (b?.details.beneficiaryName||"—")+" · "+(b?.details.bankName||"—"),
        o.tenantId,
        money(o.totalMinor),
        money(o.minMinor)+" – "+money(o.maxMinor||o.totalMinor),
        money(locked),
        money(remaining),
        Number(b?.confirmationCount||0)+" Users",
        o.state
      ];});
      container.append(panelTable(el,["Reference","Beneficiary","Workspace","Total","Per txn range","Locked","Remaining","Confirmed Users","State"],rows,"Parking orders",openOrders.length+" open"));
      function createOrder(){dialog(el,container,"Create Parking order",(body,d)=>{const form=el("form",undefined,"form-grid"),tenant=selectField(el,form,"tenant","Workspace",(data.tenants||[]).map(x=>[x,x]),data.tenants?.[0]),beneficiary=selectField(el,form,"beneficiary","Beneficiary",[],null),reference=field(el,form,"reference","Reference"),total=field(el,form,"total","Total INR","5000"),min=field(el,form,"min","Minimum per transaction INR","500"),max=field(el,form,"max","Maximum per transaction INR","5000"),toMinor=v=>{const [w,f=""]=String(v).split(".");return (BigInt(w||0)*100n+BigInt(f.padEnd(2,"0").slice(0,2)||0)).toString();};const refreshBeneficiaries=()=>{beneficiary.replaceChildren();for(const b of activeBeneficiaries.filter(x=>x.tenantId===tenant.value)){const op=el("option",b.details.beneficiaryName+" · "+b.details.bankName);op.value=b.id;beneficiary.append(op);}};tenant.onchange=refreshBeneficiaries;refreshBeneficiaries();const save=el("button","Create order","primary");save.type="submit";form.append(el("p","Only active beneficiaries in the selected workspace are eligible. User visibility still requires that User to confirm the beneficiary.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();if(!beneficiary.value)throw Error("No active beneficiary available for this workspace");const totalMinor=toMinor(total.value),minMinor=toMinor(min.value),maxMinor=toMinor(max.value);if(BigInt(minMinor)<=0n||BigInt(maxMinor)<BigInt(minMinor)||BigInt(totalMinor)<BigInt(minMinor))throw Error("Check total, minimum and maximum amounts");action(async()=>{await post("parking/order/create",{requestId:crypto.randomUUID(),tenantId:tenant.value,beneficiaryId:beneficiary.value,reference:reference.value,totalMinor,minMinor,maxMinor});d.close();await parkingView(o,mode);});};});}
      return;
    }

    const metrics=el("div",undefined,"grid analytics-metrics"),submitted=reviewOpen.filter(x=>x.state==="submitted").length,inReview=reviewOpen.filter(x=>x.state==="review").length,disputed=reviewOpen.filter(x=>x.state==="disputed").length,reviewVolume=reviewOpen.reduce((n,x)=>n+BigInt(x.amountMinor||0),0n);
    metrics.append(metric(el,"Review queue",reviewOpen.length,"Open Parking evidence"),metric(el,"Submitted",submitted,"Awaiting first review"),metric(el,"In review",inReview,"Reviewer working"),metric(el,"Disputed",disputed,"Evidence disputed"),metric(el,"Review amount",money(reviewVolume),"Open evidence amount"),metric(el,"Scan flagged",reviewOpen.filter(x=>x.scanState&&x.scanState!=="clean").length,"Non-clean proof scan state"));
    container.append(metrics,el("p","Approval restores User capacity only after explicit accepted evidence. Review and dispute states do not post capacity. Duplicate transfer protection remains server-enforced.","notice"));
    const rows=data.reviews.map(r=>{const order=orderById.get(r.orderId),beneficiary=beneficiaryById.get(r.beneficiaryId||order?.beneficiaryId),actions=el("div",undefined,"admin-row-actions");
      actions.append(button(el,"Proof",()=>proof(r)));
      if(r.state==="submitted")actions.append(button(el,"Review",()=>decision(r,"review")));
      if(["submitted","review","disputed"].includes(r.state))actions.append(button(el,"Approve paid",()=>decision(r,"approve"),"primary"));
      if(["submitted","review"].includes(r.state))actions.append(button(el,"Dispute",()=>decision(r,"dispute"),"danger"));
      if(["submitted","review","disputed"].includes(r.state))actions.append(button(el,"Not paid",()=>decision(r,"not_paid"),"danger"));
      return [r.reference+" · "+r.orderId,r.userName,beneficiary?.details.beneficiaryName||"—",money(r.amountMinor),r.utr||"—",r.scanState||"—",r.submittedAt?new Date(r.submittedAt).toLocaleString("en-IN"):"—",r.state,r.reviewer||"—",actions];
    });
    container.append(panelTable(el,["Order","User","Beneficiary","Amount","UTR","Proof scan","Submitted","State","Reviewer","Action"],rows,"Parking review queue",reviewOpen.length+" open reviews"));
    function proof(r){action(async()=>{const p=await post("parking/proof",{id:r.id}),bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:p.contentType||"application/octet-stream"})),a=document.createElement("a");a.href=url;a.download=p.name||("parking-"+r.id);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});}
    function decision(r,chosen){dialog(el,container,"Parking decision · "+r.reference,(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",chosen==="approve"?"Reviewed payment evidence":chosen==="not_paid"?"Payment not received":"Evidence under review"),label={review:"Move to review",approve:"Approve paid",dispute:"Dispute",not_paid:"Not paid"}[chosen],save=el("button",label,chosen==="approve"?"primary":chosen==="review"?"":"danger");save.type="submit";form.append(el("p",chosen==="approve"?"Approval posts the backend capacity restoration and duplicate-transfer check.":"This changes only the Parking review state until a final decision.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("parking/review",{id:r.id,action:chosen,reason:reason.value});d.close();await parkingView(o,mode);});};});}
  }

  async function upiLimits(o){
    const {request,post,el,container,title}=o;
    title.textContent="UPI daily limits";container.replaceChildren();
    let data;
    try{data=await post("business/admin-upi",{offset:0,search:""});}
    catch{const plain=await request("business/banks");data={banks:plain.banks.map(b=>({...b,owner_name:b.owner_id,used:"0",sharedLimit:b.daily_limit_minor}))};}
    const total=data.banks.reduce((n,b)=>n+BigInt(b.sharedLimit||b.daily_limit_minor||0),0n),used=data.banks.reduce((n,b)=>n+BigInt(b.used||0),0n),remaining=total>used?total-used:0n;
    const metrics=el("div",undefined,"grid analytics-metrics");
    metrics.append(
      metric(el,"Configured UPI",data.banks.length,"Current scoped bank versions"),
      metric(el,"Combined daily limit",money(total),"User-owned limits"),
      metric(el,"Used today",money(used),"Reservations + collected volume"),
      metric(el,"Remaining",money(remaining),"Across visible UPI accounts"),
      metric(el,"At ≥80%",data.banks.filter(b=>{const l=BigInt(b.sharedLimit||b.daily_limit_minor||0),u=BigInt(b.used||0);return l>0n&&u*100n>=l*80n;}).length,"High utilization"),
      metric(el,"Exhausted",data.banks.filter(b=>{const l=BigInt(b.sharedLimit||b.daily_limit_minor||0),u=BigInt(b.used||0);return l>0n&&u>=l;}).length,"No remaining bank limit")
    );
    const rows=data.banks.map(b=>{
      const limit=BigInt(b.sharedLimit||b.daily_limit_minor||0),spent=BigInt(b.used||0),left=limit>spent?limit-spent:0n,p=limit?Number(spent*10000n/limit)/100:0;
      const state=b.frozen?"frozen":b.status,health=limit===0n?"no limit":spent>=limit?"exhausted":p>=80?"high usage":"available";
      return [b.details?.upiId||b.id,b.owner_name||b.owner_id,money(limit),money(spent),money(left),p.toFixed(1)+"%",health,state];
    });
    container.append(metrics,el("p","Daily limit ownership remains with the User. Admin gets operational visibility only; UPI approval, verification, freeze/state, route min/max and capacity checks remain separate controls.","notice"),panelTable(el,["UPI","Owner","Daily limit","Used today","Remaining","Utilization","Limit health","State"],rows,"UPI daily utilization",data.banks.length+" scoped accounts"));
  }

  async function payinDisputes(o){
    const {post,action,el,container,title}=o;title.textContent="Pay-in disputes";container.replaceChildren();
    const data=await post("payin-dispute/search",{offset:0,status:""}),records=data.records||[],open=records.filter(x=>x.status==="pending"),valid=records.filter(x=>x.status==="payment_valid"),invalid=records.filter(x=>x.status==="payment_invalid"),frozen=open.reduce((n,x)=>n+BigInt(x.amountMinor||0),0n),commissionHold=open.reduce((n,x)=>n+BigInt(x.commissionMinor||0),0n),merchantHold=open.reduce((n,x)=>n+BigInt(x.merchantNetMinor||0),0n);
    const metrics=el("div",undefined,"grid analytics-metrics");
    metrics.append(metric(el,"Open disputes",open.length,"Within 48-hour review window"),metric(el,"Frozen User capacity",money(frozen),"Pending exposure"),metric(el,"Commission hold",money(commissionHold),"Pending User commission"),metric(el,"Merchant net hold",money(merchantHold),"Pending Merchant exposure"),metric(el,"Payment valid",valid.length,"Resolved valid"),metric(el,"Payment invalid",invalid.length,"Exact-reversal outcome"));
    container.append(metrics,el("p","Merchant opens a pay-in dispute within 48 hours with fresh statement coverage. While pending, User capacity, User commission and Merchant net exposure are held. Resolution is append-only; payment_invalid exact-reverses the original reversible pay-in accounting path.","notice"));
    const rows=records.map(d=>{
      const actions=el("div",undefined,"admin-row-actions");actions.append(button(el,"Review details",()=>detail(d),"primary"));
      const coverage=(d.coverageFrom?new Date(d.coverageFrom).toLocaleString("en-IN"):"—")+" → "+(d.coverageThrough?new Date(d.coverageThrough).toLocaleString("en-IN"):"—");
      return [d.reference+" · "+d.orderId,d.merchantName,d.userName,money(d.amountMinor),money(d.commissionMinor||0),money(d.merchantNetMinor||0),coverage,d.reason,pill(el,d.status),actions];
    });
    container.append(panelTable(el,["Payment","Merchant","User","Amount","Commission","Merchant net","Statement coverage","Reason","State","Action"],rows,"Pay-in dispute queue",records.length+" scoped disputes"+(data.hasMore?" · more available":"")));
    function detail(row){action(async()=>{
      const d=await post("payin-dispute/get",{id:row.orderId}),dlg=document.createElement("dialog"),wrap=el("div"),facts=el("div",undefined,"kv-grid"),add=(l,v)=>{const x=el("div",undefined,"v5-fact");x.append(el("small",l),el("strong",String(v??"—")));facts.append(x);};
      add("Reference",d.reference);add("Merchant",d.merchantName);add("User",d.userName);add("Amount",money(d.amountMinor));add("Status",d.status);add("Coverage from",d.coverageFrom?new Date(d.coverageFrom).toLocaleString("en-IN"):"—");add("Coverage through",d.coverageThrough?new Date(d.coverageThrough).toLocaleString("en-IN"):"—");add("User capacity hold",d.status==="pending"?money(d.amountMinor):money(0));add("User commission hold",d.status==="pending"?money(d.commissionMinor):money(0));add("Merchant net hold",d.status==="pending"?money(d.merchantNetMinor):money(0));wrap.append(facts,el("p",d.reason,"notice"));
      const proofs=el("div",undefined,"admin-row-actions");if(d.statementId)proofs.append(button(el,"Download Merchant statement",()=>downloadProof(d.orderId,d.statementId),"primary"));for(const r of d.responses||[]){if(r.proofId)proofs.append(button(el,"User response proof",()=>downloadProof(d.orderId,r.proofId)));}wrap.append(proofs);
      if(d.responses?.length)wrap.append(el("h3","User responses"),table(el,["Time","Reason"],d.responses.map(r=>[new Date(r.createdAt).toLocaleString("en-IN"),r.reason])));
      if(d.status==="pending"){const form=document.createElement("form"),reason=field(el,form,"reason","Resolution reason","Reviewed statement and response evidence"),buttons=el("div",undefined,"admin-row-actions");buttons.append(button(el,"Payment valid",()=>resolve("payment_valid"),"primary"),button(el,"Payment invalid",()=>resolve("payment_invalid"),"danger"));form.append(el("p","Choose only after reviewing the statement coverage and any User response. The backend records an append-only resolution.","notice"),buttons);wrap.append(form);async function resolve(decision){if(!reason.value.trim())return;await post("payin-dispute/resolve",{id:d.orderId,action:decision,reason:reason.value});dlg.close();await payinDisputes(o);}}
      dlg.append(el("h2","Pay-in dispute review"),wrap,button(el,"Close",()=>dlg.close()));container.append(dlg);dlg.showModal();
      async function downloadProof(orderId,proofId){const p=await post("payin-dispute/proof",{id:orderId,proofId}),bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:p.contentType||"application/octet-stream"})),a=document.createElement("a");a.href=url;a.download=p.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    });}
  }

  async function payoutApproval(o){
    const {post,action,el,container,title}=o;
    title.textContent="Payout approval";container.replaceChildren();
    const data=await post("payout/approval/search",{offset:o.state?.offset||0,limit:25}),requests=data.requests||[],now=Date.now();
    const principal=requests.reduce((n,r)=>n+BigInt(r.volume_minor||0),0n),reserved=requests.reduce((n,r)=>n+BigInt(r.reserve_minor||0),0n),fees=reserved>principal?reserved-principal:0n,orders=requests.reduce((n,r)=>n+Number(r.order_count||0),0),risk=requests.filter(r=>r.earliest_deadline&&+new Date(r.earliest_deadline)-now<20*60000).length;
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Pending batches",requests.length,"Awaiting Admin routing approval"),
      metric(el,"Orders",orders,"Orders inside pending batches"),
      metric(el,"Principal",money(principal),"Payout amount"),
      metric(el,"Fees reserved",money(fees),"Percentage + fixed fees"),
      metric(el,"Total reserved",money(reserved),"Merchant funds locked"),
      metric(el,"Deadline risk",risk,"Less than 20 minutes remaining")
    );
    container.append(metrics,el("p","Merchant balance is reserved at create time for principal + percentage fee + fixed payout fee. Admin approval opens only still-routable orders; if too little routing time remains, the backend fails and releases them instead of forcing a stale payout.","notice"));
    const rows=requests.map(r=>{
      const p=BigInt(r.volume_minor||0),reserve=BigInt(r.reserve_minor||0),fee=reserve>p?reserve-p:0n,actions=el("div",undefined,"admin-row-actions"),deadline=r.earliest_deadline?+new Date(r.earliest_deadline):null,left=deadline?deadline-now:null;
      actions.append(button(el,"Approve routing",()=>decide(r,"approve"),"primary"),button(el,"Reject",()=>decide(r,"reject"),"danger"));
      const ref=el("div");ref.append(el("strong",r.id),el("div",(r.merchant_name||"—")+" · "+Number(r.order_count||0)+" order"+(Number(r.order_count||0)===1?"":"s"),"small muted"));
      return [ref,money(p),money(fee),money(reserve),money(r.available_minor||0),r.earliest_deadline?new Date(r.earliest_deadline).toLocaleString("en-IN"):"—",left==null?"—":left<=0?"expired":Math.ceil(left/60000)+" min",pill(el,"pending_admin"),actions];
    });
    container.append(panelTable(el,["Batch / Merchant","Principal","Fees","Reserved","Merchant available","Earliest deadline","Time left","State","Action"],rows,"Payout approval queue",requests.length+" pending batch"+(requests.length===1?"":"es")+(data.hasMore?" · more available":"")));
    function decide(r,decision){
      dialog(el,container,decision==="approve"?"Approve payout routing":"Reject payout",(body,d)=>{
        const form=document.createElement("form"),reason=field(el,form,"reason","Reason",decision==="approve"?"Admin routing approval":"Payout rejected"),save=el("button",decision==="approve"?"Approve routing":"Reject",decision==="approve"?"primary":"danger");save.type="submit";
        form.append(el("p",decision==="approve"?"The backend rechecks remaining routing time per order before opening it to Users.":"Rejecting releases the Merchant payout reservation for pending orders.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/approval/decide",{id:r.id,action:decision,reason:reason.value});d.close();await payoutApproval(o);});};
      });
    }
  }

  async function userCommissions(o){
    const {post,el,container,title}=o;title.textContent="User commissions";container.replaceChildren();
    const data=await post("panel/admin-finance",{offset:0}),rows=data.commissionSummary||[],gross=rows.reduce((n,x)=>n+BigInt(x.gross||0),0n),held=rows.reduce((n,x)=>n+BigInt(x.held||0),0n),reserved=rows.reduce((n,x)=>n+BigInt(x.reserved||0),0n),withdrawn=rows.reduce((n,x)=>n+BigInt(x.withdrawn||0),0n),available=rows.reduce((n,x)=>n+BigInt(x.available||0),0n),deficit=rows.reduce((n,x)=>n+BigInt(x.deficit||0),0n);
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Gross commission",money(gross),"Pay-in + payout + adjustments"),
      metric(el,"Commission holds",money(held),"Active commission hold ledger"),
      metric(el,"Withdrawal reserved",money(reserved),"Open withdrawal entitlement"),
      metric(el,"Withdrawn",money(withdrawn),"Completed commission withdrawals"),
      metric(el,"Available",money(available),"Gross − holds − reserved − withdrawn"),
      metric(el,"Deficit",money(deficit),"Signed entitlement below zero")
    );
    container.append(metrics,el("p","This projection now includes commission adjustments and open withdrawal reservations. Commission holds, withdrawal reserves and completed withdrawals remain separate ledger types; rates come from the latest User commercial version.","notice"));
    container.append(panelTable(el,["User","Pay-in","Payout","Adjustments","Gross","Hold","Reserved","Withdrawn","Available","Deficit","Current rates"],rows.map(r=>[
      r.name+" · "+r.id,money(r.payin),money(r.payout),money(r.adjustments||0),money(r.gross),money(r.held),money(r.reserved||0),money(r.withdrawn),money(r.available),money(r.deficit||0),
      "Pay-in "+(r.settings?.payinCommission??"—")+"% · Payout "+(r.settings?.payoutCommission??"—")+"% · INR/USDT "+(r.settings?.inrPerUsdt??"—")
    ]),"User commission entitlement",rows.length+" Users"));
  }

  async function profitExpenses(o){
    const {post,el,container,title}=o;title.textContent="Profit & expenses";container.replaceChildren();
    const data=await post("panel/admin-finance",{offset:0}),fee=data.fees||{},n=k=>BigInt(fee[k]||0),payinFees=n("merchant_platform_fee"),payoutFees=n("merchant_payout_fee"),fees=payinFees+payoutFees,payinComm=n("user_commission"),payoutComm=n("user_payout_commission"),comm=payinComm+payoutComm,costs=BigInt(data.totalCosts||0),margin=BigInt(data.operatingMargin||0);
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Merchant fees",money(fees),"Pay-in + payout posted fees"),
      metric(el,"User commissions",money(comm),"Pay-in + payout earnings"),
      metric(el,"Salary & expenses",money(costs),"Non-void operating costs"),
      metric(el,"Operating margin",money(margin),"Fees − commissions − costs"),
      metric(el,"Pay-in margin",money(payinFees-payinComm),"Fee less commission"),
      metric(el,"Payout margin",money(payoutFees-payoutComm),"Fee less commission")
    );
    container.append(metrics,el("p","Period: "+new Date(data.from).toLocaleString("en-IN")+" → "+new Date(data.to).toLocaleString("en-IN")+". Exchange profit is shown separately using account-specific locked rates. Expense records affect reporting only.","notice"));
    const expenseTotals=data.expenseTotals||[];
    container.append(panelTable(el,["Expense category","Amount"],expenseTotals.map(x=>[x.category,money(x.amount)]),"Expense breakdown","Non-void records"));
    container.append(panelTable(el,["Date","Category","Payee","Amount","Reference","State"],(data.expenses||[]).map(e=>[new Date(e.occurred_at).toLocaleString("en-IN"),e.category,e.payee,money(e.amount_minor),e.description,e.void_reason?"voided":"recorded"]),"Recent expense records",data.hasMore?"More records available":"Current page"));
  }

  async function deposits(o){
    const {post,action,el,container,title}=o;title.textContent="User deposits";container.replaceChildren();
    const data=await post("funding/list",{state:"",offset:0});
    container.append(el("p","Standard first deposit: 2,000 USDT minimum, less a one-time non-refundable 100 USDT setup fee. Net capacity is 1,900 USDT at the locked account rate. Free Setup and previously funded accounts are exempt; later top-ups can be smaller. Admin may use manual_confirm without a transaction hash when evidence is reviewed, and may optionally enter the actual received USDT amount. Manual review remains explicitly non-blockchain-verified.","notice"));
    const quoteInr=r=>{
      if(r.credit_minor)return money(r.credit_minor);
      if(r.snapshot?.initialPolicy==="first-confirmed-2000-usdt-less-100-setup-v1")return "Calculated on confirmation";
      const raw=String(r.snapshot?.rate??"0"),[w,f=""]=raw.split("."),ratePaise=BigInt(w||0)*100n+BigInt(f.padEnd(2,"0").slice(0,2)||0),minor=BigInt(r.snapshot?.amountMinor||0);
      return money(minor*ratePaise/1000000n);
    };
    const rows=data.requests.map(r=>{
      const actions=el("div",undefined,"row-actions");
      if(!["confirmed","rejected","reversed"].includes(r.state)){
        if(data.actions.includes("approve"))actions.append(button(el,"Manual confirm",()=>manual(r,"manual_confirm"),"btn sm success"));
        if(data.actions.includes("review"))actions.append(button(el,"Recheck provider",()=>action(async()=>{await post("funding/recheck",{requestId:r.id});await deposits(o);}),"btn sm"));
        if(data.actions.includes("reject"))actions.append(button(el,"Reject",()=>manual(r,"manual_reject"),"btn sm danger"));
      }else if(r.state==="confirmed"&&data.actions.includes("approve"))actions.append(button(el,"Reverse",()=>reverse(r),"btn sm danger"));
      const user=el("div");user.append(el("strong",r.name),el("div",r.id,"small muted"));
      return [user,(BigInt(r.snapshot?.amountMinor||0)/1000000n).toLocaleString("en-IN")+" USDT",quoteInr(r),"₹"+String(r.snapshot?.rate??"—"),(r.claims||[])[0]?.tx_hash||"No hash",pill(el,r.state),pill(el,r.source||"none"),actions];
    });
    const panel=panelTable(el,["User","Requested USDT","INR credit","Rate","Tx reference","State","Source","Action"],rows);panel.style.marginTop="12px";container.append(panel);
    function manual(r,command){
      const d=document.createElement("dialog"),form=document.createElement("form"),reasonLabel=el("label","Review reason"),reason=el("input");reason.required=true;reasonLabel.append(reason);form.append(reasonLabel);
      let amount;if(command==="manual_confirm"){const l=el("label","Actual received USDT (optional)"),i=el("input");i.type="number";i.step="0.000001";l.append(i);form.append(l);amount=i;}
      const save=el("button",command==="manual_confirm"?"Manual confirm":"Reject",command==="manual_confirm"?"btn success":"btn danger");save.type="submit";form.append(el("p",command==="manual_confirm"?"No blockchain hash is required for this manual-review path. It remains marked blockchainVerified=false.":"Manual rejection remains auditable.","notice warn"),save,button(el,"Cancel",()=>d.close(),"btn"));
      form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("funding/review",{requestId:r.id,action:command,reason:reason.value,...(amount?.value?{amountUsdt:amount.value}:{})});d.close();await deposits(o);});};d.append(el("h2",command==="manual_confirm"?"Manual deposit confirmation":"Reject deposit"),form);container.append(d);d.showModal();
    }
    function reverse(r){
      const d=document.createElement("dialog"),form=document.createElement("form"),rl=el("label","Reversal reason"),reason=el("input"),refLabel=el("label","Evidence reference"),reference=el("input");reason.required=reference.required=true;reference.value="admin-reversal-"+r.id;rl.append(reason);refLabel.append(reference);form.append(rl,refLabel);
      const save=el("button","Reverse confirmed deposit","btn danger");save.type="submit";form.append(el("p","This posts an exact capacity reversal and may create a reconciliation deficit if capacity was already consumed.","notice warn"),save,button(el,"Cancel",()=>d.close(),"btn"));
      form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("funding/review",{requestId:r.id,action:"reverse",reason:reason.value,evidenceReference:reference.value,attributionReference:"",network:"",token:"",address:"",amountUsdt:"",txHash:"",eventIndex:0,reviewedFinal:false});d.close();await deposits(o);});};d.append(el("h2","Reverse deposit"),form);container.append(d);d.showModal();
    }
  }

  async function routingPage(o){
    const {request,post,action,el,container,title}=o;title.textContent="Assignments & routing";
    const [data,health]=await Promise.all([post("business/admin-upi",{offset:0,search:""}),request("business/routing")]),bankById=new Map(data.banks.map(b=>[b.id,b])),accountName=id=>data.accounts.find(a=>a.id===id)?.name||id;
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canRoute)tools.append(button(el,"+ Assign route",()=>create(),"primary"));}
    const active=data.routes.filter(r=>r.status==="active"),ready=active.filter(r=>r.readiness?.eligible===true),blocked=active.filter(r=>r.readiness?.eligible!==true),activeReservations=health.reservations.filter(r=>r.state==="active");
    const metrics=el("div",undefined,"grid analytics-metrics");
    metrics.append(
      metric(el,"UPI routes",data.routes.length,"Bank-specific Merchant bindings"),
      metric(el,"Active routes",active.length,"Enabled bindings"),
      metric(el,"Ready now",ready.length,"Backend eligibility passed"),
      metric(el,"Blocked",blocked.length,"One or more routing checks failed"),
      metric(el,"Active reservations",activeReservations.length,"Currently reserved collection capacity"),
      metric(el,"Reconciliation alerts",health.reconciliation.filter(r=>BigInt(r.deficit_minor||0)>0n).length,"User capacity deficits")
    );
    container.replaceChildren(metrics,el("p","Bank-specific routing is evaluated by the backend against account approval, funding/security readiness, UPI state, shared daily limit, ticket range and User capacity. Lower priority value is evaluated first. This is intentionally separate from the generic Merchant-to-User assignment layer.","notice"));
    const rows=data.routes.map(r=>{const bank=bankById.get(r.bank_id),readyNow=r.readiness?.eligible===true,reasons=readyNow?"Ready":(r.readiness?.reasons||["not_ready"]).join(", ").replaceAll("_"," "),actions=el("div",undefined,"admin-row-actions");if(data.canRoute)actions.append(button(el,r.status==="active"?"Disable":"Enable",()=>toggle(r),r.status==="active"?"danger":"primary"));return [r.merchant_name||r.merchant_id,(bank?.details?.upiId||r.bank_id)+" · "+(bank?.owner_name||r.user_id),r.priority,money(r.min_minor)+" – "+money(r.max_minor),r.status,readyNow?"ready":"blocked",reasons,actions];});
    container.append(panelTable(el,["Merchant","UPI / User","Priority","Payment range","State","Readiness","Reason","Action"],rows,"Merchant → UPI routes",active.length+" active · "+ready.length+" ready"));
    if(health.reservations.length){
      container.append(panelTable(el,["Reference","Merchant","User","Amount","State","Expires"],health.reservations.slice(0,25).map(r=>[r.order_reference,accountName(r.merchant_id),accountName(r.user_id),money(r.amount_minor),r.state,r.expires_at?new Date(r.expires_at).toLocaleString("en-IN"):"—"]),"Recent routing reservations","Backend reservation state"));
    }
    function create(){dialog(el,container,"Assign UPI route",(body,d)=>{const form=el("form",undefined,"form-grid"),banks=data.banks.filter(b=>!b.frozen&&["running","approved","verified","stopped"].includes(b.status)),merchants=data.accounts.filter(a=>a.account_type==="merchant"),bank=selectField(el,form,"bank","UPI account",banks.map(b=>[b.id,(b.details?.upiId||b.id)+" · "+b.owner_name])),merchant=selectField(el,form,"merchant","Merchant",merchants.map(m=>[m.id,m.name])),priority=field(el,form,"priority","Priority","50"),min=field(el,form,"min","Minimum INR","100"),max=field(el,form,"max","Maximum INR","10000"),reason=field(el,form,"reason","Reason","Merchant routing assignment"),minor=v=>{const [w,f=""]=String(v).split(".");return (BigInt(w)*100n+BigInt(f.padEnd(2,"0"))).toString();};const save=el("button","Create route","primary");save.type="submit";form.append(el("p","Creating a route does not bypass User capacity, funding, UPI state or shared-limit checks.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const selected=bankById.get(bank.value);await post("business/admin-upi/route",{id:null,bankId:bank.value,version:selected.version,merchantId:merchant.value,priority:Number(priority.value),minMinor:minor(min.value),maxMinor:minor(max.value),enabled:true,reason:reason.value});d.close();await routingPage(o);});};});}
    function toggle(r){dialog(el,container,(r.status==="active"?"Disable ":"Enable ")+"route",(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",r.status==="active"?"Operational route disabled":"Operational route enabled"),bank=bankById.get(r.bank_id),save=el("button",r.status==="active"?"Disable":"Enable",r.status==="active"?"danger":"primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/admin-upi/route",{id:r.id,bankId:r.bank_id,version:bank.version,merchantId:r.merchant_id,priority:r.priority,minMinor:r.min_minor,maxMinor:r.max_minor,enabled:r.status!=="active",reason:reason.value});d.close();await routingPage(o);});};});}
  }

  async function assignmentsPage(o){
    const {request,post,action,el,container,title}=o;title.textContent="User assignments";container.replaceChildren();
    const data=await request("business/assignments"),name=id=>data.accounts.find(a=>a.id===id)?.name||id,users=data.accounts.filter(a=>a.account_type==="user"),merchants=data.accounts.filter(a=>a.account_type==="merchant"),active=data.assignments.filter(a=>a.status==="active");
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canUpdate)tools.append(button(el,"+ Assign User",()=>create(),"primary"));}
    const totalAvailable=users.reduce((n,u)=>n+BigInt(data.capacity[u.id]?.available||0),0n),assignedUsers=new Set(active.map(a=>a.user_id)),assignedMerchants=new Set(active.map(a=>a.merchant_id));
    const metrics=el("div",undefined,"grid analytics-metrics");
    metrics.append(
      metric(el,"Active assignments",active.length,"Generic Merchant → User layer"),
      metric(el,"Assigned merchants",assignedMerchants.size,"With at least one active User"),
      metric(el,"Assigned users",assignedUsers.size,"Receiving assignment traffic"),
      metric(el,"Approved users",users.length,"Eligible account directory"),
      metric(el,"User capacity",money(totalAvailable),"Current available capacity"),
      metric(el,"Can update",data.canUpdate?"Yes":"No","Permission-enforced")
    );
    container.append(metrics,el("p","User Assignment is a generic Merchant-to-User relationship and does not select a concrete UPI. Bank-specific UPI routes are managed separately and still enforce UPI approval/state, shared daily limits, ticket limits and capacity at reservation time.","notice"));
    const rows=data.assignments.map(a=>{const actions=el("div",undefined,"admin-row-actions"),available=data.capacity[a.user_id]?.available;if(data.canUpdate&&a.status==="active")actions.append(button(el,"Release",()=>release(a),"danger"));return [name(a.merchant_id),name(a.user_id),a.priority,money(a.min_minor)+" – "+money(a.max_minor),available==null?"—":money(available),a.status,actions];});
    container.append(panelTable(el,["Merchant","User","Priority","Amount range","User available","State","Action"],rows,"Merchant → User assignments",active.length+" active · "+merchants.length+" approved merchants"));
    function create(){dialog(el,container,"Assign Merchant to User",(body,d)=>{const form=el("form",undefined,"form-grid"),merchant=selectField(el,form,"merchant","Merchant",merchants.map(a=>[a.id,a.name])),user=selectField(el,form,"user","User",users.map(a=>[a.id,a.name])),priority=field(el,form,"priority","Priority","50"),min=field(el,form,"min","Minimum INR","100"),max=field(el,form,"max","Maximum INR","10000"),minor=v=>{const [w,f=""]=String(v).split(".");return (BigInt(w)*100n+BigInt(f.padEnd(2,"0"))).toString();},save=el("button","Assign","primary");save.type="submit";form.append(el("p","This creates the generic User assignment only. It does not automatically create or approve a bank-specific UPI route.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/assignments/update",{id:null,merchantId:merchant.value,userId:user.value,priority:Number(priority.value),weight:1,minMinor:minor(min.value),maxMinor:minor(max.value),enabled:true});d.close();await assignmentsPage(o);});};});}
    function release(a){dialog(el,container,"Release assignment",(body,d)=>{const form=document.createElement("form"),save=el("button","Release","danger");save.type="submit";form.append(el("p","This disables only the generic Merchant-to-User assignment. Bank-specific UPI routes remain independently controlled.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/assignments/update",{id:a.id,merchantId:a.merchant_id,userId:a.user_id,priority:a.priority,weight:a.weight||1,minMinor:a.min_minor,maxMinor:a.max_minor,enabled:false});d.close();await assignmentsPage(o);});};});}
  }

  async function devicesPage(o){
    const {post,action,el,container,title}=o;title.textContent="Devices";container.replaceChildren();
    const data=await post("operations/device-setup",{}),linked=data.devices.filter(x=>x.linked).length,online=data.devices.filter(x=>x.status==="online").length,offline=data.devices.filter(x=>x.status==="offline").length,unavailable=data.devices.filter(x=>["unavailable","unpaired"].includes(x.status)).length,locationEnabled=data.devices.filter(x=>x.locationEnabled===true).length;
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Linked devices",linked,"Active WPay ownership links"),
      metric(el,"Online",online,"Seen within operational window"),
      metric(el,"Offline",offline,"Linked but not recently seen"),
      metric(el,"Unavailable / unpaired",unavailable,"Source or pairing state"),
      metric(el,"Location enabled",locationEnabled,"Current metadata flag"),
      metric(el,"Pairing source",data.pairingStatus||"unknown",data.sourceConnected?"Source connected":"Source unavailable")
    );
    container.append(metrics,el("p","Device ownership, source availability and diagnostics are separate states. A linked device can be offline or metadata-unavailable without losing its WPay ownership link.","notice"));
    const grid=el("div",undefined,"device-grid");container.append(grid);
    for(const d of data.devices){const card=el("article",undefined,"card device-card"),top=el("div",undefined,"device-top"),model=el("div",undefined,"device-model"),copy=el("div");copy.append(el("h3",d.model||d.device),el("p",(d.apkVersion||"APK unavailable")+" · "+(d.ownerName||"—")));model.append(copy);top.append(model,pill(el,d.status));card.append(top);const stats=el("div",undefined,"device-stats"),fact=(label,value)=>{const x=el("div",undefined,"fact");x.append(el("label",label),el("strong",String(value??"Unavailable")));return x;};stats.append(
       fact("Phone",d.phone||"Unavailable"),
       fact("Link",d.linked?"Linked":"Not linked"),
      fact("Last seen",d.lastSeenAt?new Date(d.lastSeenAt).toLocaleString("en-IN"):"Unavailable"),
      fact("Battery",d.battery==null?"Unavailable":d.battery+"% · "+(d.batteryHealth||"health unavailable")),
      fact("Network",(d.network||"Unavailable")+" · "+(d.carrier||"carrier unavailable")),
       fact("Location",d.locationLabel||(Number.isFinite(Number(d.latitude))&&Number.isFinite(Number(d.longitude))?Number(d.latitude).toFixed(5)+", "+Number(d.longitude).toFixed(5):d.locationEnabled===false?"Disabled":"Unavailable")),
      fact("Valid until",d.validUntil?new Date(d.validUntil).toLocaleString("en-IN"):"Unavailable")
    );card.append(stats);const actions=el("div",undefined,"account-card-actions");if(!d.legacyMapping)actions.append(button(el,"View details",()=>detail(d)));if(data.canRevoke&&!d.legacyMapping)actions.append(button(el,"Unlink from WPay",()=>unlink(d),"danger"));card.append(actions);grid.append(card);}if(!data.devices.length)grid.append(el("div",data.message||"No linked devices.","card admin-empty"));
    if(data.nextDeviceCursor)container.append(el("p","More devices exist beyond this page. Current Admin V5 view shows the first 100 scoped links.","notice"));
    function detail(d){action(async()=>{const info=await post("operations/device-setup/detail",{id:d.id}),dlg=document.createElement("dialog"),wrap=el("div"),facts=el("div",undefined,"kv-grid"),device=info.device||d,add=(l,v)=>{const x=el("div",undefined,"v5-fact");x.append(el("small",l),el("strong",String(v??"Unavailable")));facts.append(x);},coords=Number.isFinite(Number(device.latitude))&&Number.isFinite(Number(device.longitude))?Number(device.latitude).toFixed(5)+", "+Number(device.longitude).toFixed(5):null;add("Owner",device.ownerName);add("Device ref",device.device);add("Status",device.status);add("Phone",device.phone);add("SIM",device.simName);add("APK",device.apkVersion);add("Battery health",device.batteryHealth);add("Current location",device.locationLabel||coords);add("Last seen",device.lastSeenAt?new Date(device.lastSeenAt).toLocaleString("en-IN"):"Unavailable");add("Link valid until",device.validUntil?new Date(device.validUntil).toLocaleString("en-IN"):"Unavailable");wrap.append(facts,el("p","Last 48 hours · diagnostic metadata only. Unavailable fields are not inferred or fabricated.","notice"));wrap.append(table(el,["Time","Battery / health","Network","Location","Location permission"],(info.history||[]).map(h=>[new Date(h.at).toLocaleString("en-IN"),(h.battery==null?"—":h.battery+"%")+(h.charging===true?" · charging":"")+" / "+(h.health||"—"),(h.network||"—")+" / "+(h.carrier||"—"),h.latitude==null?"Unavailable":Number(h.latitude).toFixed(5)+", "+Number(h.longitude).toFixed(5)+(h.accuracy==null?"":" · "+h.accuracy+"m"),h.locationPermission==null?"Unavailable":h.locationPermission&&h.locationEnabled?"Enabled":"Disabled"])));if(data.canRevoke)wrap.append(button(el,"Unlink from WPay",()=>{dlg.close();unlink(d);},"danger"));dlg.append(el("h2","Device · "+(device.model||device.device)),wrap,button(el,"Close",()=>dlg.close()));container.append(dlg);dlg.showModal();});}
    function unlink(d){dialog(el,container,"Unlink device",(body,dlg)=>{body.append(el("p","This revokes only the scoped WPay device ownership link. Pairing history stays auditable and OTP-event code is not modified by this action.","notice"),button(el,"Unlink from WPay",()=>action(async()=>{await post("operations/device-setup/revoke",{id:d.id});dlg.close();await devicesPage(o);}),"danger"));});}
  }

  async function activationPage(o){
    const {post,action,el,container,title}=o;title.textContent="Activation codes";container.replaceChildren();
    const [setup,history]=await Promise.all([post("operations/device-setup",{}),post("operations/pairing-history",{offset:0})]),requests=history.requests||[],pending=requests.filter(r=>r.state==="pending"),used=requests.filter(r=>r.state==="used"),expired=requests.filter(r=>r.state==="expired"),revoked=requests.filter(r=>r.state==="revoked");
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();const generate=button(el,"Generate account-owned code",()=>issue(),"primary");generate.disabled=!setup.canCreate;tools.append(generate);}
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Pairing service",setup.pairingStatus||"unknown",setup.pairingAvailable?"Ready":"Not ready"),
      metric(el,"Pending codes",pending.length,"Waiting to be claimed"),
      metric(el,"Used",used.length,"Linked to a device"),
      metric(el,"Expired",expired.length,"No longer claimable"),
      metric(el,"Revoked",revoked.length,"Explicitly cancelled"),
      metric(el,"Linked devices",setup.devices.length,"Scoped ownership links")
    );
    container.append(metrics,el("p","Pairing code is account-owned by the current logged-in actor and is separate from sensitive OTP-event access. A secret code is shown only when issued. History never re-exposes it. Source readiness is required before a new code can be issued.","notice"));
    if(!setup.canCreate)container.append(el("p",setup.pairingStatus==="not_configured"?"Pairing source or bridge is not configured.":setup.pairingStatus==="source_unavailable"?"Pairing source is currently unavailable.":"Your current account is not permitted to generate a pairing code.","notice warn"));
    const rows=requests.map(r=>[
      el("span","Hidden after issue · "+r.id,"mono"),
      (r.owner_name||r.owner_id)+" · "+(r.owner_type||"account"),
      new Date(r.created_at).toLocaleString("en-IN"),
      new Date(r.expires_at).toLocaleString("en-IN"),
      pill(el,r.state),
      r.device_ref||"—",
      (()=>{const actions=el("div",undefined,"admin-row-actions");if(r.canCheck)actions.append(button(el,"Check pairing",()=>check(r)));if(r.canRevoke)actions.append(button(el,"Revoke code",()=>revoke(r),"danger"));return actions;})()
    ]);
    container.append(panelTable(el,["Code","Owning actor","Created","Expires","State","Device","Action"],rows,"Pairing code history",requests.length+" records"+(history.hasMore?" · more available":"")));
    function check(r){action(async()=>{const result=await post("operations/device-setup/poll",{requestId:r.id});if(result.state==="linked"){const d=document.createElement("dialog");d.append(el("h2","Device linked"),el("p","Device: "+result.device,"notice"),button(el,"Open Devices",()=>{d.close();o.navigate?.("v5.devices");}),button(el,"Close",()=>d.close()));container.append(d);d.showModal();}await activationPage(o);});}
    function revoke(r){dialog(el,container,"Revoke pairing code",(body,d)=>{body.append(el("p","This cancels the unclaimed code. A code already used to create a device link cannot be revoked from this screen.","notice"),button(el,"Revoke code",()=>action(async()=>{await post("operations/device-setup/revokeCode",{requestId:r.id});d.close();await activationPage(o);}),"danger"));});}
    function issue(){action(async()=>{const result=await post("operations/device-setup/create",{requestId:crypto.randomUUID()}),d=document.createElement("dialog"),code=el("code",result.pairingCode,"code-secret");d.append(el("h2","Enter this code in WPay Agent"),el("p","This account-owned 8-character code is displayed only now. Do not close this dialog until you have copied it.","notice"),code,el("p","Expires "+new Date(result.expiresAt).toLocaleString("en-IN")),button(el,"Copy code",()=>navigator.clipboard?.writeText(result.pairingCode),"primary"),button(el,"Close",()=>{code.textContent="Hidden";d.close();activationPage(o);}));container.append(d);d.showModal();});}
  }

  async function utrCapture(o){
    const {post,action,el,container,title}=o;title.textContent="UTR Capture";container.replaceChildren();const utr=o.state?.utr||"",utrFilter=utr?{utr}:{};
    const [sources,pending]=await Promise.all([post("operations/utr-source",{...(o.state?.afterLink?{afterLink:o.state.afterLink}:{})}),post("operations/utr/pending",{status:utr?"all":"pending",offset:0,...utrFilter})]);
    const linked=sources.links||[],sourceResults=await Promise.all(linked.map(async link=>{try{return {link,ok:true,...await post("operations/utr-source",{linkId:link.id,...utrFilter})};}catch(error){return {link,ok:false,observations:[],error:error?.message||"Source unavailable"};}}));
    const captures=sourceResults.flatMap(x=>(x.observations||[]).map(r=>({...r,sourceKind:x.link.source==="device"?"apk":"statement",deviceOrStatement:x.link.source==="device"?x.link.id:"Uploaded statement"}))).sort((a,b)=>new Date(b.capturedAt)-new Date(a.capturedAt)),failedSources=sourceResults.filter(x=>!x.ok);
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();const tabs=el("div",undefined,"section-tabs");for(const [key,label]of [["all","All"],["apk","APK captured"],["statement","Statement"],["pending","Pending review"]]){const b=button(el,label,()=>draw(key),key==="all"?"active":"");b.dataset.utrFilter=key;tabs.append(b);}tools.append(tabs);}
    const searchForm=el("form",undefined,"toolbar"),searchInput=el("input",undefined,"control grow");searchInput.placeholder="Search exact 12-digit UTR…";searchInput.setAttribute("aria-label","Search UTR");searchInput.inputMode="numeric";searchInput.pattern="[0-9]{12}";searchInput.maxLength=12;searchInput.value=utr;const searchButton=el("button","Search","btn primary");searchButton.type="submit";searchForm.append(searchInput,searchButton);searchForm.onsubmit=e=>{e.preventDefault();if(searchForm.reportValidity())action(()=>utrCapture({...o,state:{utr:searchInput.value.trim()}}));};container.append(searchForm);
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"UTR captures",captures.length,"Readable scoped observations"),
      metric(el,"APK captured",captures.filter(x=>x.sourceKind==="apk").length,"Device transaction source"),
      metric(el,"Statement captured",captures.filter(x=>x.sourceKind==="statement").length,"Scoped statement source"),
      metric(el,utr?"Matching claims":"Pending review",pending.records.length,utr?"Payment claims matching this UTR":"Submitted claims awaiting decision"),
      metric(el,"Source links",linked.length,"Verified scoped links"),
      metric(el,"Unavailable sources",failedSources.length,"Read failed without fabricating data")
    );
    container.append(metrics,el("p","APK/statement observations and submitted payment claims are separate evidence surfaces. Captured UTR alone does not post accounting. Independent verification or an explicit Admin decision remains required by the existing backend.","notice"));
    if(!sources.sourceConnected)container.append(el("p","The scoped legacy UTR reader is not currently connected. Existing claims can still be reviewed, but source observations may be unavailable.","notice warn"));
    if(failedSources.length)container.append(el("p",failedSources.length+" scoped UTR source link(s) could not be read. They are shown as unavailable rather than treated as empty proof.","notice warn"));
    const stream=el("section",undefined,"card panel"),pendingPanel=el("section",undefined,"card panel");stream.append(el("h2","Captured UTR stream"));pendingPanel.append(el("h2",utr?"Matching UTR claims":"Pending UTR decisions"));container.append(stream,pendingPanel);
    const pendingRows=()=>pending.records.map(r=>{const actions=el("div",undefined,"admin-row-actions");if(r.canReview)actions.append(button(el,"Verify evidence",()=>verify(r)));if(r.canApprove)actions.append(button(el,"Manual approve",()=>decision(r,"approve"),"primary"));if(r.canReview)actions.append(button(el,"Reject",()=>decision(r,"reject"),"danger"));return [new Date(r.submittedAt).toLocaleString("en-IN"),r.utr,r.reference,r.merchant,r.user,money(r.amountMinor),pill(el,r.paymentStatus),pill(el,r.status),actions];});
    pendingPanel.append(table(el,["Submitted","UTR","Reference","Merchant","User","Amount","Payment","Review","Actions"],pendingRows()));
    function draw(filter){
      if(tools)for(const b of tools.querySelectorAll("[data-utr-filter]"))b.classList.toggle("active",b.dataset.utrFilter===filter);
      const rows=(filter==="pending"?[]:captures.filter(x=>filter==="all"||x.sourceKind===filter)).map(x=>[new Date(x.capturedAt).toLocaleString("en-IN"),x.utr,x.amount,x.sourceKind==="apk"?"APK":"Statement",x.deviceOrStatement,x.userId||"—",x.merchantId||"—",x.bankReference||"—",x.sourceStatus||"captured",x.evidenceState||"unbound_observation",x.accountingState||"not_posted"]);
      stream.replaceChildren(el("h2","Captured UTR stream"),table(el,["Captured","UTR","Amount","Source","Device / statement","User","Merchant","Bank","Status","Evidence","Accounting"],rows));
      pendingPanel.hidden=filter!=="all"&&filter!=="pending";
    }
    function verify(r){dialog(el,container,"Verify evidence · "+r.reference,(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Review reason","Verify submitted UTR against independent evidence"),save=el("button","Verify evidence","primary");save.type="submit";form.append(el("p","This only queues/retries independent verification. It does not mark the payment successful by itself.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("operations/utr/verify",{orderId:r.orderId,utr:r.utr,reason:reason.value});d.close();await utrCapture(o);});};});}
    function decision(r,decision){dialog(el,container,(decision==="approve"?"Manual approve":"Reject")+" · "+r.reference,(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",decision==="approve"?"Admin reviewed supporting evidence":"Evidence rejected"),save=el("button",decision==="approve"?"Manual approve":"Reject",decision==="approve"?"primary":"danger");save.type="submit";form.append(el("p",decision==="approve"?"Admin approval is recorded as admin_approved and remains distinct from bank-verified evidence.":"Rejected claim closes the payment when the backend state allows it.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("operations/utr/decision",{claimId:r.claimId,action:decision,reason:reason.value});d.close();await utrCapture(o);});};});}
    draw("all");
    if(sources.afterLink)container.append(button(el,"More source links",()=>action(()=>utrCapture({...o,state:{utr,afterLink:sources.afterLink}}))));
    if(o.state?.afterLink)container.append(button(el,"First source links",()=>action(()=>utrCapture({...o,state:{utr}}))));
  }

  async function statementsPage(o){
    const {request,post,action,el,container,title}=o;title.textContent="Statements & reconciliation";container.replaceChildren();
    const [data,recovery]=await Promise.all([request("operations/statements"),post("operations/transactions",{offset:0,status:"recovery_review"})]);
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();tools.append(button(el,"+ Upload statement",()=>uploadStatement(),"primary"));}
    const accepted=data.imports.filter(i=>i.status==="accepted"),pending=data.imports.filter(i=>!["accepted","rejected","failed"].includes(i.status)),credits=data.imports.reduce((n,i)=>n+Number(i.credit_count||0),0),reconOpen=recovery.records.filter(r=>r.accountingState!=="posted").length;
    const metrics=el("div",undefined,"grid analytics-metrics");
    metrics.append(metric(el,"Bank versions",data.banks.length,"Scoped statement targets"),metric(el,"Imports",data.imports.length,"Latest parsed uploads"),metric(el,"Accepted imports",accepted.length,"Parser/import accepted"),metric(el,"Rows credited in imports",credits,"Parsed credit rows only"),metric(el,"Recovery review",recovery.records.length,"Orders in reconciliation review"),metric(el,"Accounting not posted",reconOpen,"Needs evidence decision"));
    container.append(metrics,el("p",data.message||"Statement upload creates parser/import metadata only. Uploaded files or a global matcher result alone are not financial evidence and do not authorize credit.","notice"));
    const grid=el("div",undefined,"admin-columns"),imports=el("section",undefined,"card panel"),recon=el("section",undefined,"card panel");
    const ih=el("div",undefined,"panel-head"),ihc=el("div");ihc.append(el("h2","Statement imports"),el("p","Targeted owner + bank version · financialEvidence = "+String(data.financialEvidence)));ih.append(ihc);imports.append(ih);
    imports.append(table(el,["Import","Owner / bank","Version","Rows","Credits","Status","Reason"],data.imports.map(i=>[
      i.id+" · "+new Date(i.created_at).toLocaleString("en-IN"),
      (data.banks.find(b=>b.id===i.bank_id)?.ownerName||i.owner_id)+" · "+(data.banks.find(b=>b.id===i.bank_id)?.id||i.bank_id),
      i.bank_version,i.rows_scanned,i.credit_count,i.status,i.reason||"—"
    ])));
    const rh=el("div",undefined,"panel-head"),rhc=el("div");rhc.append(el("h2","Reconciliation review"),el("p","Observation, evidence and accounting remain distinct states"));rh.append(rhc);recon.append(rh);
    const rows=recovery.records.map(r=>{
      const observation=(r.observations||[]).find(x=>!x.verified)||(r.observations||[])[0],actions=el("div",undefined,"admin-row-actions");
      if(observation?.claimId&&r.accountingState!=="posted")actions.append(button(el,"Admin approve",()=>reconcile(r,observation,"approve"),"primary"),button(el,"Reject",()=>reconcile(r,observation,"reject"),"danger"));
      return [r.reference+" · "+r.orderId,(r.userId||"—")+" · "+(r.merchantId||"—"),r.upiId||"—",observation?.utr||"—",observation?.source||"—",observation?.verified?"verified observation":"unverified observation",r.evidenceState,r.accountingState,r.callbackState||"—",actions];
    });
    recon.append(table(el,["Order","User / Merchant","UPI","UTR","Source","Observation","Evidence","Accounting","Callback","Action"],rows));
    grid.append(imports,recon);container.append(grid);

    function uploadStatement(){
      dialog(el,container,"Upload statement",(body,d)=>{
        const form=el("form",undefined,"form-grid"),owners=[...new Map(data.banks.map(b=>[b.ownerId,b.ownerName])).entries()],owner=selectField(el,form,"owner","Owner",owners),bank=selectField(el,form,"bank","Bank / UPI",[]),format=selectField(el,form,"format","Format",[["csv","CSV"],["xls","XLS"],["xlsx","XLSX"]],"csv"),fileLabel=el("label","Statement file"),file=el("input");file.type="file";file.accept=".csv,.xls,.xlsx";file.required=true;fileLabel.append(file);form.append(fileLabel);
        const refreshBanks=()=>{bank.replaceChildren();for(const b of data.banks.filter(x=>x.ownerId===owner.value)){const op=el("option",(b.ownerName||b.ownerId)+" · "+b.id+" · v"+b.version);op.value=b.id;bank.append(op);}};owner.onchange=refreshBanks;refreshBanks();
        form.append(el("p","Upload is bound to the selected owner + bank version and runs through the existing statement parser. It does not by itself establish independent ownership or post financial credit.","notice"));
        const save=el("button","Upload","primary");save.type="submit";form.append(save);body.append(form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{const selected=data.banks.find(x=>x.id===bank.value),chosen=file.files[0];if(!selected||!chosen||chosen.size>1048576)throw Error("Choose a statement up to 1 MiB");const bytes=new Uint8Array(await chosen.arrayBuffer());let raw="";for(const byte of bytes)raw+=String.fromCharCode(byte);await post("operations/statement/upload",{ownerId:selected.ownerId,bankId:selected.id,version:selected.version,requestId:crypto.randomUUID(),format:format.value,base64:btoa(raw)});d.close();await statementsPage(o);});};
      });
    }
    function reconcile(row,observation,decision){
      dialog(el,container,(decision==="approve"?"Admin approve evidence":"Reject claim")+" · "+row.reference,(body,d)=>{
        const form=document.createElement("form"),reason=field(el,form,"reason","Reason",decision==="approve"?"Admin reviewed supporting evidence":"Evidence rejected"),save=el("button",decision==="approve"?"Admin approve":"Reject",decision==="approve"?"primary":"danger");save.type="submit";
        form.append(el("p",decision==="approve"?"This creates an explicit Admin-approved decision. It must not be presented as bank-verified or independent statement evidence.":"This rejects the submitted claim when the current backend state allows it.","notice"),save);body.append(form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("operations/utr/decision",{claimId:observation.claimId,action:decision,reason:reason.value});d.close();await statementsPage(o);});};
      });
    }
  }

  async function payoutReview(o){
    const {post,action,el,container,title}=o;title.textContent="Payout review";container.replaceChildren();
    const data=await post("payout/search",{offset:0,limit:50}),orders=data.orders||[],reviewable=orders.filter(x=>["claimed","submitted","merchant_rejected_review"].includes(x.status)),submitted=orders.filter(x=>x.status==="submitted"),escalated=orders.filter(x=>x.status==="merchant_rejected_review"),successful=orders.filter(x=>x.status==="successful"),notPaid=orders.filter(x=>x.status==="not_paid");
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Reviewable",reviewable.length,"Claimed / submitted / escalated"),
      metric(el,"Submitted",submitted.length,"Waiting Merchant review / timeout"),
      metric(el,"Escalated",escalated.length,"Merchant rejected; Admin decision"),
      metric(el,"Successful",successful.length,"Settled payouts"),
      metric(el,"Not paid",notPaid.length,"Rejected payment outcome"),
      metric(el,"Loaded orders",orders.length,"Latest scoped results")
    );
    container.append(metrics,el("p","Current policy: User payment window is 10 minutes plus 5-minute submission grace. Submitted payout waits for Merchant review; timeout may auto-approve. Admin final paid/not-paid action is available only after Merchant rejection/escalation.","notice"));
    const rows=orders.filter(x=>["claimed","submitted","merchant_rejected_review","successful","not_paid","reversed"].includes(x.status)).map(p=>{
      const actions=el("div",undefined,"admin-row-actions");actions.append(button(el,"Details",()=>detail(p)));
      if(p.status==="merchant_rejected_review")actions.append(button(el,"Mark paid",()=>resolve(p,"paid"),"primary"),button(el,"Not paid",()=>resolve(p,"not_paid"),"danger"));
      else if(p.status==="submitted")actions.append(el("span","Merchant review / timeout","small muted"));
      const due=p.submittedAt?new Date(+new Date(p.submittedAt)+15*60000):null,remaining=due?+due-Date.now():null,timeout=due?(remaining>0?Math.ceil(remaining/60000)+" min remaining":"Due / worker may auto-approve"):"—";
      const ref=el("div");ref.append(el("strong",p.reference),el("div",p.id,"small muted"));
      return [ref,p.claimUserName||p.claimUserId||"—",money(p.amountMinor),p.transferMode||"—",p.utr||"—",pill(el,p.status),p.submittedAt?new Date(p.submittedAt).toLocaleString("en-IN"):"—",due?new Date(due).toLocaleString("en-IN")+" · "+timeout:"—",actions];
    });
    container.append(panelTable(el,["Reference","User","Amount","Mode","UTR","State","Submitted","15m timeout","Action"],rows,"Payout review","Admin-visible review lifecycle"));
    function detail(p){action(async()=>{const d=await post("payout/get",{id:p.id});dialog(el,container,"Payout details · "+d.reference,(body)=>{
      const facts=el("div",undefined,"kv-grid"),add=(l,v)=>{const x=el("div",undefined,"v5-fact");x.append(el("small",l),el("strong",String(v??"—")));facts.append(x);};
      add("State",d.status);add("Amount",money(d.amountMinor));add("Reserved",money(d.reserveMinor||0));add("Transfer mode",d.transferMode);add("Claim User",p.claimUserName||p.claimUserId||"—");add("Deadline",d.deadlineAt?new Date(d.deadlineAt).toLocaleString("en-IN"):"—");add("Beneficiary",d.beneficiary?.beneficiaryName||"—");add("Bank",d.beneficiary?.bankName||"—");add("Account",d.beneficiary?.accountNumber?"••••"+String(d.beneficiary.accountNumber).slice(-4):"—");add("IFSC",d.beneficiary?.ifsc||"—");add("UPI",d.beneficiary?.upiId||"—");add("Proof scan",d.proof?.scanState||"—");body.append(facts);
      if(d.proof?.downloadAllowed)body.append(button(el,"Download proof",()=>downloadProof(d),"primary"));
      if(d.audit?.length)body.append(el("h3","Audit"),table(el,["Time","State","Reason"],d.audit.slice(0,20).map(a=>[new Date(a.created_at).toLocaleString("en-IN"),a.state,a.reason||"—"])));
    });});}
    function downloadProof(d){action(async()=>{const p=await post("payout/proof",{id:d.id,proofId:d.proof.id}),bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:p.contentType||"application/octet-stream"})),a=document.createElement("a");a.href=url;a.download=p.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});}
    function resolve(p,decision){dialog(el,container,decision==="paid"?"Mark payout paid":"Mark payout not paid",(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",decision==="paid"?"Admin reviewed escalated payout evidence":"Payment not received"),save=el("button",decision==="paid"?"Mark paid":"Not paid",decision==="paid"?"primary":"danger");save.type="submit";form.append(el("p","This action is only valid for the escalated merchant_rejected_review state and remains backend-enforced.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/resolve",{id:p.id,action:decision,reason:reason.value});d.close();await payoutReview(o);});};});}
  }

  async function payoutCapabilities(o){
    const {request,post,action,el,container,title}=o;title.textContent="Payout bank capabilities";container.replaceChildren();
    const data=await request("payout/capabilities"),banks=data.banks||[],capable=banks.filter(b=>b.payout_capable),eligible=banks.filter(b=>b.approved_version===b.version&&b.verified_version===b.version&&!b.frozen&&!b.deactivated&&["verified","enabled","running","stopped"].includes(b.status)),blocked=banks.filter(b=>!eligible.includes(b));
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Bank versions",banks.length,"Scoped current versions"),
      metric(el,"Payout capable",capable.length,"Active capability records"),
      metric(el,"Eligible to enable",eligible.length,"Approved + verified + available"),
      metric(el,"Blocked",blocked.length,"Fails capability prerequisites"),
      metric(el,"Frozen",banks.filter(b=>b.frozen).length,"Operational hold"),
      metric(el,"Deactivated",banks.filter(b=>b.deactivated).length,"Unavailable")
    );
    container.append(metrics,el("p","A payout capability is version-specific. Enabling requires the current bank version to be approved, payment-verified, not frozen/deactivated and in an allowed operational state. Revoking prevents that bank version from receiving payout work.","notice"));
    const rows=banks.map(b=>{const ready=b.approved_version===b.version&&b.verified_version===b.version&&!b.frozen&&!b.deactivated&&["verified","enabled","running","stopped"].includes(b.status),actions=el("div",undefined,"admin-row-actions");actions.append(button(el,b.payout_capable?"Revoke":"Enable",()=>change(b),b.payout_capable?"danger":"primary"));if(!b.payout_capable&&!ready)actions.querySelector("button").disabled=true;const reason=b.deactivated?"deactivated":b.frozen?"frozen":b.approved_version!==b.version?"approval required":b.verified_version!==b.version?"payment verification required":!["verified","enabled","running","stopped"].includes(b.status)?"state "+b.status:"ready";return [b.id,b.owner_id,"v"+b.version,b.status,b.approved_version===b.version?"approved":"not approved",b.verified_version===b.version?"verified":"not verified",b.frozen?"frozen":b.deactivated?"deactivated":"available",b.payout_capable?"enabled":ready?"ready to enable":reason,actions];});
    container.append(panelTable(el,["Bank","Owner","Version","State","Approval","Verification","Availability","Capability readiness","Action"],rows,"Payout bank capabilities",capable.length+" enabled"));
    function change(b){dialog(el,container,b.payout_capable?"Revoke payout capability":"Enable payout capability",(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",b.payout_capable?"Payout capability revoked":"Approved for payout work"),enabled=!b.payout_capable,save=el("button",enabled?"Enable payout bank":"Revoke capability",enabled?"primary":"danger");save.type="submit";form.append(el("p",enabled?"The backend revalidates approval, verification, freeze/deactivation and bank state before enabling.":"Revocation is version-specific and takes effect for future payout routing.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/capability",{bankId:b.id,version:b.version,enabled,reason:reason.value});d.close();await payoutCapabilities(o);});};});}
  }

  async function merchantUsdt(o){
    const {request,post,action,el,container,title}=o;title.textContent="Merchant USDT";container.replaceChildren();
    const [data,defaults]=await Promise.all([request("payout/merchant-usdt-admin"),request("panel/merchant-default-rate")]),requests=data.requests||[],rates=[...new Set((defaults.tenants||[]).map(x=>x.rate))],defaultLabel=rates.length===1?"₹"+rates[0]:rates.length?"Multiple":"₹107";
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(defaults.canUpdate)tools.append(button(el,"Edit default USDT rate",()=>editDefault()));}
    const requested=requests.filter(x=>x.state==="requested").length,review=requests.filter(x=>x.state==="review").length,approved=requests.filter(x=>x.state==="approved").length,processing=requests.filter(x=>x.state==="processing").length,completed=requests.filter(x=>x.state==="completed").length,reserved=requests.filter(x=>!["completed","rejected","cancelled"].includes(x.state)).reduce((n,x)=>n+BigInt(x.inrMinor||0),0n);
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Default Admin rate",defaultLabel,"New Merchant approvals"),
      metric(el,"Requested",requested,"Awaiting review"),
      metric(el,"Review / approved",review+approved,"Decision / processing queue"),
      metric(el,"Processing",processing,"Manual settlement underway"),
      metric(el,"Completed",completed,"Recorded settlements"),
      metric(el,"INR reserved",money(reserved),"Open Merchant settlement requests")
    );
    container.append(metrics,el("p","Merchant USDT settlement is a manual Admin workflow. Completion records a reference and timestamp, releases the INR reserve and posts settlement principal. It is explicitly marked blockchainConfirmed=false; duplicate transfer references are still blocked.","notice"));
    const rows=requests.map(r=>{
      const actions=el("div",undefined,"admin-row-actions");
      if(r.state==="requested")actions.append(button(el,"Move to review",()=>transition(r,"review")),button(el,"Approve",()=>transition(r,"approve"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));
      else if(r.state==="review")actions.append(button(el,"Approve",()=>transition(r,"approve"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));
      else if(r.state==="approved")actions.append(button(el,"Process",()=>transition(r,"process"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));
      else if(r.state==="processing")actions.append(button(el,"Complete",()=>complete(r),"primary"));
      const usdt=(BigInt(r.usdtMinor||0)/1000000n).toLocaleString("en-IN")+" USDT";
      return [r.merchantName||r.merchantId,money(r.inrMinor),usdt,"₹"+r.rate,(r.network||"—")+" · "+(r.destinationSummary||"Protected destination"),r.createdAt?new Date(r.createdAt).toLocaleString("en-IN"):"—",r.completedAt?new Date(r.completedAt).toLocaleString("en-IN"):"—",pill(el,r.state),actions];
    });
    container.append(panelTable(el,["Merchant","INR reserved","USDT quote","Rate","Network / destination","Created","Completed","State","Action"],rows,"Merchant USDT settlements",requests.length+" loaded"));

    function editDefault(){dialog(el,container,"Edit default Merchant USDT rate",(body,d)=>{const form=el("form",undefined,"form-grid"),tenant=selectField(el,form,"tenant","Workspace",(defaults.tenants||[]).map(x=>[x.tenantId,x.tenantId]),defaults.tenants?.[0]?.tenantId),rate=field(el,form,"rate","INR per USDT",defaults.tenants?.[0]?.rate||"107"),save=el("button","Save default rate","primary");const current=()=>defaults.tenants.find(x=>x.tenantId===tenant.value)||defaults.tenants?.[0]||{};tenant.onchange=()=>{rate.value=current().rate||"107";};save.type="submit";form.append(el("p","This default pre-fills new Merchant approvals. Existing Merchant commercial versions are not silently rewritten.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const dflt=current();await post("panel/merchant-default-rate/update",{tenantId:tenant.value,rate:rate.value,fixedPayoutFee:dflt.fixedPayoutFee||"6",payinFee:dflt.payinFee||"1.2",payoutFee:dflt.payoutFee||"0.8",paymentLinkTtlSeconds:String(dflt.paymentLinkTtlSeconds||300),adminManagedCollections:!!dflt.adminManagedCollections});d.close();await merchantUsdt(o);});};});}
    function transition(r,command){dialog(el,container,command.replaceAll("_"," ")+" Merchant USDT",(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",command==="review"?"Manual review started":command==="approve"?"Settlement approved":command==="process"?"Settlement processing":"Settlement rejected"),save=el("button",command[0].toUpperCase()+command.slice(1),command==="reject"?"danger":"primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/merchant-usdt/transition",{id:r.id,action:command,reason:reason.value});d.close();await merchantUsdt(o);});};});}
    function complete(r){dialog(el,container,"Complete Merchant USDT",(body,d)=>{const form=el("form",undefined,"form-grid"),reference=field(el,form,"reference","TRON transaction reference / hash"),network=field(el,form,"network","Network",r.network||"TRON-TRC20"),completed=field(el,form,"completed","Completed at",new Date().toISOString()),reason=field(el,form,"reason","Reason","Manual Admin settlement completed"),save=el("button","Complete settlement","primary");network.disabled=true;save.type="submit";form.append(el("p","This records a manual Admin completion and does not claim blockchain verification. The backend validates reference format, timestamp and duplicate economic reference.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/merchant-usdt/transition",{id:r.id,action:"complete",reason:reason.value,reference:reference.value,network:network.value,completedAt:completed.value});d.close();await merchantUsdt(o);});};});}
  }

  async function withdrawals(o){
    const {post,action,el,container,title}=o;title.textContent="Commission withdrawals";container.replaceChildren();
    const data=await post("payout/withdrawal/search",{offset:0,limit:50}),requests=data.withdrawals||[],open=requests.filter(r=>!["completed","rejected","cancelled"].includes(r.state)),reserved=open.reduce((n,r)=>n+BigInt(r.entitlementMinor||0),0n),fees=requests.filter(r=>r.currency==="INR").reduce((n,r)=>n+BigInt(r.feeMinor||0),0n);
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Open withdrawals",open.length,"Requested / review / approved / processing"),
      metric(el,"Commission reserved",money(reserved),"INR entitlement locked"),
      metric(el,"INR requests",requests.filter(r=>r.currency==="INR").length,"0.5% policy fee snapshot"),
      metric(el,"USDT requests",requests.filter(r=>r.currency==="USDT").length,"Versioned User rate/network"),
      metric(el,"Displayed INR fees",money(fees),"INR withdrawal fee snapshots"),
      metric(el,"Completed",requests.filter(r=>r.state==="completed").length,"Manual Admin completion")
    );
    container.append(metrics,el("p","INR withdrawal reserves the User commission entitlement including the current fee policy; USDT converts using the versioned User commercial rate. Completion is a manual Admin record with duplicate-reference protection and blockchainConfirmed=false.","notice"));
    const rows=requests.map(r=>{const actions=el("div",undefined,"admin-row-actions");
      if(r.state==="requested")actions.append(button(el,"Review",()=>transition(r,"review")),button(el,"Approve",()=>transition(r,"approve"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));
      else if(r.state==="review")actions.append(button(el,"Approve",()=>transition(r,"approve"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));
      else if(r.state==="approved")actions.append(button(el,"Process",()=>transition(r,"process"),"primary"),button(el,"Reject",()=>transition(r,"reject"),"danger"));
      else if(r.state==="processing")actions.append(button(el,"Complete",()=>complete(r),"primary"));
      const amount=r.currency==="INR"?money(r.amountMinor):(BigInt(r.amountMinor||0)/1000000n).toLocaleString("en-IN")+" USDT",net=r.currency==="INR"?money(r.netMinor||r.amountMinor):(BigInt(r.netMinor||r.amountMinor||0)/1000000n).toLocaleString("en-IN")+" USDT";
      return [r.userId,r.currency,amount,money(r.entitlementMinor||0),money(r.feeMinor||0),net,r.rate?"₹"+r.rate:"—",r.destinationSummary||"Protected destination",pill(el,r.state),r.createdAt?new Date(r.createdAt).toLocaleString("en-IN"):"—",r.reason||"—",actions];
    });
    container.append(panelTable(el,["User","Currency","Requested","INR entitlement","Fee","Net","Rate","Destination","State","Created","Latest reason","Action"],rows,"Commission withdrawal queue",open.length+" open"+(data.hasMore?" · more available":"")));
    function transition(r,command){dialog(el,container,"Withdrawal · "+command,(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Reason",command==="review"?"Manual review started":command==="approve"?"Withdrawal approved":command==="process"?"Processing started":"Withdrawal rejected"),save=el("button",command[0].toUpperCase()+command.slice(1),command==="reject"?"danger":"primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/withdrawal/transition",{id:r.id,action:command,reason:reason.value});d.close();await withdrawals(o);});};});}
    function complete(r){dialog(el,container,"Complete withdrawal",(body,d)=>{const form=el("form",undefined,"form-grid"),reason=field(el,form,"reason","Reason","Manual Admin completion"),reference=field(el,form,"reference",r.currency==="INR"?"12-digit UTR":"Completion reference"),network=r.currency==="USDT"?field(el,form,"network","Network","TRON-TRC20"):null,completed=field(el,form,"completed","Completed at (UTC)",new Date().toISOString().replace(/\.\d{3}Z$/,"Z")),save=el("button","Complete","primary");if(network)network.disabled=true;save.type="submit";form.append(el("p",r.currency==="INR"?"INR completion requires a valid 12-digit UTR.":"USDT completion validates the configured network and transaction reference. Neither path is labeled blockchain-verified by this manual workflow.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/withdrawal/transition",{id:r.id,action:"complete",reason:reason.value,reference:reference.value,...(network?{network:network.value}:{}),completedAt:completed.value});d.close();await withdrawals(o);});};});}
  }

  async function commissionHolds(o){
    const {post,action,el,container,title}=o;title.textContent="Commission holds";container.replaceChildren();
    const [data,users]=await Promise.all([post("payout/hold/search",{offset:0,limit:50}),post("panel/directory",{type:"user",status:"approved",search:"",offset:0,limit:100})]),holds=data.holds||[],userName=id=>users.rows.find(x=>x.id===id)?.name||id,active=holds.filter(h=>!h.released_at),activeAmount=active.reduce((n,h)=>n+BigInt(h.amount_minor||0),0n);
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();tools.append(button(el,"+ Place commission hold",()=>edit(null),"primary"));}
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(metric(el,"Active holds",active.length,"Reduce withdrawable commission"),metric(el,"Held commission",money(activeAmount),"Active hold amount"),metric(el,"Released",holds.length-active.length,"Historical holds"),metric(el,"Users with holds",new Set(active.map(h=>h.user_id)).size,"Currently affected Users"));
    container.append(metrics,el("p","Commission holds are a separate entitlement domain. New holds cannot exceed current withdrawable commission; releasing a hold posts the matching hold release and keeps the history auditable.","notice"));
    const rows=holds.map(h=>{const actions=el("div",undefined,"admin-row-actions");if(!h.released_at)actions.append(button(el,"Release",()=>edit(h),"primary"));return [userName(h.user_id),money(h.amount_minor),h.reference,h.reason,new Date(h.created_at).toLocaleString("en-IN"),h.released_at?new Date(h.released_at).toLocaleString("en-IN"):"—",h.released_at?"released":"active",actions];});
    container.append(panelTable(el,["User","Amount","Reference","Reason","Created","Released","State","Action"],rows,"Commission hold ledger",active.length+" active"));
    function edit(h){dialog(el,container,h?"Release commission hold":"Place commission hold",(body,d)=>{const form=el("form",undefined,"form-grid"),user=selectField(el,form,"user","User",users.rows.map(x=>[x.id,x.name]),h?.user_id),amount=field(el,form,"amount","Amount INR",h?(BigInt(h.amount_minor)/100n).toString():"500"),reference=field(el,form,"reference","Reference",h?.reference||("COM-"+Date.now())),reason=field(el,form,"reason","Reason",h?"Commission review completed":"Commission review hold");if(h){user.disabled=true;amount.disabled=true;reference.disabled=true;}const save=el("button",h?"Release":"Place hold","primary");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();const toMinor=v=>{const [w,f=""]=String(v).split(".");return (BigInt(w||0)*100n+BigInt(f.padEnd(2,"0").slice(0,2)||0)).toString();};action(async()=>{await post("payout/hold/manage",{id:h?.id||crypto.randomUUID(),userId:h?.user_id||user.value,amountMinor:h?h.amount_minor:toMinor(amount.value),reference:h?.reference||reference.value,reason:reason.value,release:!!h});d.close();await commissionHolds(o);});};});}
  }

  async function businessHolds(o){
    const {request,post,action,el,container,title}=o;title.textContent="Holds / frozen";container.replaceChildren();
    const [data,users,merchants]=await Promise.all([request("business/holds"),post("panel/directory",{type:"user",status:"approved",search:"",offset:0,limit:100}),post("panel/directory",{type:"merchant",status:"approved",search:"",offset:0,limit:100})]),holds=data.holds||[],accounts=[...users.rows,...merchants.rows],name=id=>accounts.find(x=>x.id===id)?.name||id,active=holds.filter(h=>h.state==="active"),dispute=active.filter(h=>String(h.category||"").startsWith("payout_dispute")),generic=active.filter(h=>!String(h.category||"").startsWith("payout_dispute"));
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canManage)tools.append(button(el,"+ Place hold",()=>edit(null),"primary"));}
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Active holds",active.length,"All business/capacity domains"),
      metric(el,"Active amount",money(active.reduce((n,h)=>n+BigInt(h.amount_minor||0),0n)),"Current held amount"),
      metric(el,"Operational holds",generic.length,"Admin-managed hold / frozen"),
      metric(el,"Payout dispute holds",dispute.length,"Resolution-managed only"),
      metric(el,"Released",holds.filter(h=>h.state==="released").length,"Historical records"),
      metric(el,"Can manage",data.canManage?"Yes":"No","Permission-enforced")
    );
    container.append(metrics,el("p","Generic business holds are separate from commission holds. Payout-dispute capacity holds are included for visibility but cannot be manually released here; they are released only by dispute resolution.","notice"));
    const rows=holds.map(h=>{const isDispute=String(h.category||"").startsWith("payout_dispute"),actions=el("div",undefined,"admin-row-actions");if(data.canManage&&h.state==="active"&&!isDispute)actions.append(button(el,"Release",()=>edit(h),"primary"));return [name(h.owner_id),isDispute?"Payout dispute":String(h.category||"hold")==="frozen"?"Frozen":"Business hold",money(h.amount_minor),h.category,h.reference,h.reason,h.state,h.released_at?new Date(h.released_at).toLocaleString("en-IN"):"—",actions];});
    container.append(panelTable(el,["Owner","Domain","Amount","Category","Reference","Reason","State","Released","Action"],rows,"Business / capacity holds",active.length+" active"));
    function edit(h){dialog(el,container,h?"Release hold":"Place hold",(body,d)=>{const form=el("form",undefined,"form-grid"),owner=selectField(el,form,"owner","Owner",accounts.map(x=>[x.id,x.name+" · "+(x.accountType||x.account_type||"account")]),h?.owner_id),amount=field(el,form,"amount","Amount INR",h?(BigInt(h.amount_minor)/100n).toString():"500"),category=selectField(el,form,"category","Category",[["hold","Hold"],["frozen","Frozen"]],h?.category||"hold"),reference=field(el,form,"reference","Reference",h?.reference||("HOLD-"+Date.now())),reason=field(el,form,"reason","Reason",h?"Hold review completed":"Operational hold");if(h){owner.disabled=true;amount.disabled=true;category.disabled=true;reference.disabled=true;}const save=el("button",h?"Release":"Place hold",h?"primary":"danger");save.type="submit";form.append(el("p",h?"Release posts the matching ledger hold release.":"The backend checks current User capacity or Merchant available balance before creating the hold.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();const toMinor=v=>{const [w,f=""]=String(v).split(".");return (BigInt(w||0)*100n+BigInt(f.padEnd(2,"0").slice(0,2)||0)).toString();};action(async()=>{await post("business/holds/update",{id:h?.id||crypto.randomUUID(),ownerId:h?.owner_id||owner.value,amountMinor:h?.amount_minor||toMinor(amount.value),reference:h?.reference||reference.value,reason:reason.value,release:!!h,category:h?.category||category.value});d.close();await businessHolds(o);});};});}
  }

  async function credentialsPage(o){
    const {post,action,el,container,title}=o;title.textContent="API credentials";container.replaceChildren();
    const state=o.state||{},offset=Number(state.offset||0),[data,merchants]=await Promise.all([post("panel/credentials",{offset,limit:50}),post("panel/directory",{type:"merchant",status:"approved",search:"",offset:0,limit:100})]),rows=data.rows||[],merchantName=id=>merchants.rows.find(x=>x.id===id)?.name||id,active=rows.filter(k=>!k.revoked_at);
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canCreate)tools.append(button(el,"+ Create credential",()=>create(),"primary"));}
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Credentials",rows.length,"Current page"),
      metric(el,"Active",active.length,"Usable keys"),
      metric(el,"Revoked",rows.length-active.length,"Historical credentials"),
      metric(el,"Used before",rows.filter(k=>k.last_used_at).length,"Observed API use"),
      metric(el,"Can create",data.canCreate?"Yes":"No","Super Admin + permission"),
      metric(el,"Can revoke",data.canRevoke?"Yes":"No","Super Admin + permission")
    );
    container.append(metrics,el("p","Credential metadata is tenant-scoped. Create/revoke is Super Admin-restricted. Secret material is shown only at creation. Revocation permanently disables the key and invalidates existing Merchant sessions.","notice"));
    const tableRows=rows.map(k=>{const actions=el("div",undefined,"admin-row-actions");if(data.canRevoke&&!k.revoked_at)actions.append(button(el,"Revoke",()=>revoke(k),"danger"));return [k.prefix,k.merchant_name||merchantName(k.merchant_id),k.label,(k.scopes||[]).join(", "),k.created_at?new Date(k.created_at).toLocaleString("en-IN"):"—",pill(el,k.revoked_at?"revoked":"active"),k.last_used_at?new Date(k.last_used_at).toLocaleString("en-IN"):"Never",actions];});
    container.append(panelTable(el,["Prefix","Merchant","Label","Scopes","Created","Status","Last used","Action"],tableRows,"API credentials","Offset "+offset));
    const pager=el("div",undefined,"admin-row-actions");if(offset>0)pager.append(button(el,"Previous",()=>action(()=>credentialsPage({...o,state:{offset:Math.max(0,offset-50)}}))));if(data.nextOffset!==null)pager.append(button(el,"Next",()=>action(()=>credentialsPage({...o,state:{offset:data.nextOffset}})),"primary"));container.append(pager);
    function create(){dialog(el,container,"Create API credential",(body,d)=>{const form=el("form",undefined,"form-grid"),merchant=selectField(el,form,"merchant","Merchant",merchants.rows.map(m=>[m.id,m.name])),label=field(el,form,"label","Label","Production integration"),scope=selectField(el,form,"scope","Scopes",[["read","orders:read"],["write","orders:read + orders:write"]],"read"),save=el("button","Create credential","primary");save.type="submit";form.append(el("p","Write scope is accepted only if the target Merchant itself has gateway-create permission.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const result=await post("panel/credentials/create",{merchantId:merchant.value,label:label.value,scopes:scope.value==="write"?["orders:read","orders:write"]:["orders:read"]});d.close();const secret=document.createElement("dialog"),code=el("code",result.secret,"code-secret");secret.append(el("h2","Save credential secret"),el("p","This secret is shown once. It cannot be recovered from the credential list later.","notice"),code,button(el,"Copy",()=>navigator.clipboard?.writeText(result.secret),"primary"),button(el,"Hide",()=>{code.textContent="Hidden";secret.close();credentialsPage(o);}));container.append(secret);secret.showModal();});};});}
    function revoke(k){dialog(el,container,"Revoke API credential",(body,d)=>{body.append(el("p","Revoking this credential is permanent for this key and also increments the Merchant session epoch, invalidating existing Merchant sessions.","notice"),button(el,"Revoke",()=>action(async()=>{await post("panel/credentials/revoke",{id:k.id});d.close();await credentialsPage(o);}),"danger"));});}
  }

  async function webhooksPage(o){
    const {post,action,el,container,title}=o;title.textContent="Webhooks";container.replaceChildren();
    const state=o.state||{},offset=Number(state.offset||0),[data,merchants]=await Promise.all([post("panel/webhooks",{offset,limit:50}),post("panel/directory",{type:"merchant",status:"approved",search:"",offset:0,limit:100})]),merchantName=id=>merchants.rows.find(x=>x.id===id)?.name||id,configs=data.endpoints?.rows||[],deliveries=data.rows||[];
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canUpdate)tools.append(button(el,"Configure endpoint",()=>configure(),"primary"));}
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Endpoints",configs.length,"Current endpoint page"),
      metric(el,"Enabled",configs.filter(x=>x.enabled).length,"Delivery enabled"),
      metric(el,"Deliveries",deliveries.length,"Current outbox page"),
      metric(el,"Pending",deliveries.filter(x=>x.state==="pending").length,"Retryable queue"),
      metric(el,"Retry exhausted",deliveries.filter(x=>Number(x.attempts||0)>=8).length,"Manual retry no longer allowed"),
      metric(el,"Can update",data.canUpdate?"Yes":"No","Permission-controlled")
    );
    container.append(metrics,el("p","Changing an endpoint URL rotates webhook secret material and shows it once. Disabling an endpoint moves pending/leased deliveries to unconfigured; re-enabling requeues eligible deliveries. Manual retry is allowed only while state is pending and attempts are below 8.","notice"));
    const grid=el("div",undefined,"grid two-col"),left=el("section",undefined,"card panel"),right=el("section",undefined,"card panel"),lh=el("div",undefined,"panel-head"),lc=el("div");lc.append(el("h2","Webhook configuration"),el("p","Merchant endpoint metadata"));lh.append(lc);left.append(lh);
    left.append(table(el,["Merchant","Endpoint","Enabled","Created"],configs.map(w=>[w.merchant_name||merchantName(w.merchant_id),w.url,pill(el,w.enabled?"enabled":"disabled"),w.created_at?new Date(w.created_at).toLocaleString("en-IN"):"—"])));
    const rh=el("div",undefined,"panel-head"),rc=el("div");rc.append(el("h2","Delivery history"),el("p","Current outbox page"));rh.append(rc);right.append(rh);
    const deliveryRows=deliveries.map(r=>{const actions=el("div",undefined,"admin-row-actions");if(data.canUpdate&&r.state==="pending"&&r.attempts<8)actions.append(button(el,"Retry",()=>retry(r),"primary"));return [r.merchant_name||merchantName(r.merchant_id),r.event_type,r.order_id||"—",pill(el,r.state),r.attempts,r.last_code||"—",r.next_attempt_at?new Date(r.next_attempt_at).toLocaleString("en-IN"):"—",r.created_at?new Date(r.created_at).toLocaleString("en-IN"):"—",actions];});
    right.append(table(el,["Merchant","Event","Order","State","Attempts","HTTP","Next attempt","Created","Action"],deliveryRows));grid.append(left,right);container.append(grid);
    const pager=el("div",undefined,"admin-row-actions");if(offset>0)pager.append(button(el,"Previous",()=>action(()=>webhooksPage({...o,state:{offset:Math.max(0,offset-50)}}))));if(data.nextOffset!==null)pager.append(button(el,"Next",()=>action(()=>webhooksPage({...o,state:{offset:data.nextOffset}})),"primary"));container.append(pager);

    function configure(){
      dialog(el,container,"Configure webhook",(body,d)=>{
        const form=el("form",undefined,"form-grid"),merchant=selectField(el,form,"merchant","Merchant",merchants.rows.map(m=>[m.id,m.name])),url=field(el,form,"url","HTTPS endpoint","https://example.com/wpay","url"),enabled=selectField(el,form,"enabled","State",[["true","Enabled"],["false","Disabled"]],"true"),save=el("button","Save","primary");
        const loadCurrent=()=>{const current=configs.find(x=>x.merchant_id===merchant.value);if(current){url.value=current.url;enabled.value=String(!!current.enabled);}else{url.value="https://example.com/wpay";enabled.value="true";}};merchant.onchange=loadCurrent;loadCurrent();form.append(el("p","Changing the URL may rotate the webhook secret. Save the returned secret immediately if one is shown.","notice"),save);body.append(form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{const result=await post("panel/webhooks/configure",{merchantId:merchant.value,url:url.value,enabled:enabled.value==="true"});d.close();if(result.secret){const secret=document.createElement("dialog"),code=el("code",result.secret,"code-secret");secret.append(el("h2","Webhook secret rotated"),el("p","Save this secret now. It is shown once.","notice"),code,button(el,"Copy",()=>navigator.clipboard?.writeText(result.secret),"primary"),button(el,"Hide",()=>{code.textContent="Hidden";secret.close();webhooksPage(o);}));container.append(secret);secret.showModal();}else await webhooksPage(o);});};
      });
    }
    function retry(r){action(async()=>{await post("panel/webhooks/retry",{id:r.id});await webhooksPage(o);});}
  }

  async function apiLogsPage(o){
    const {post,action,el,container,title}=o;title.textContent="API logs";container.replaceChildren();
    const state=o.state||{},offset=Number(state.offset||0),data=await post("panel/api-logs",{offset,limit:50}),rows=data.rows||[];
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"API events",rows.length,"Current page"),
      metric(el,"Merchants",new Set(rows.map(r=>r.merchant_id)).size,"Current page"),
      metric(el,"Operations",new Set(rows.map(r=>r.operation)).size,"Current page"),
      metric(el,"More rows",data.nextOffset!==null?"Yes":"No","Server pagination")
    );
    container.append(metrics,el("p","Merchant API access audit only. Secrets, request bodies, credentials and sensitive payloads are intentionally not displayed.","notice"));
    container.append(panelTable(el,["Time","Merchant","Operation","Log ID"],rows.map(r=>[new Date(r.created_at).toLocaleString("en-IN"),r.merchant_name||r.merchant_id,r.operation,r.id]),"API access audit","Offset "+offset));
    const pager=el("div",undefined,"admin-row-actions");if(offset>0)pager.append(button(el,"Previous",()=>action(()=>apiLogsPage({...o,state:{offset:Math.max(0,offset-50)}}))));if(data.nextOffset!==null)pager.append(button(el,"Next",()=>action(()=>apiLogsPage({...o,state:{offset:data.nextOffset}})),"primary"));container.append(pager);
  }

  async function notificationsPage(o){
    const {post,action,el,container,title}=o;title.textContent="Notifications";container.replaceChildren();
    const state=o.state||{},offset=Number(state.offset||0),data=await post("panel/notifications",{offset,limit:50}),rows=data.rows||[],grid=el("div",undefined,"grid two-col"),settings=el("section",undefined,"card panel"),history=el("section",undefined,"card panel");
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Notifications",rows.length,"Current page"),
      metric(el,"Unread",rows.filter(x=>!x.read).length,"Current page"),
      metric(el,"In-app",data.preferences.in_app_notifications?"Enabled":"Disabled","Account preference"),
      metric(el,"Email delivery",data.emailDeliveryConfigured?"Configured":"Not configured","Backend capability"),
      metric(el,"Can update",data.canUpdate?"Yes":"No","Permission-controlled")
    );container.append(metrics);
    const line=el("div",undefined,"toggle-line"),copy=el("div");copy.append(el("strong","In-app notifications"),el("p","Enable or disable Admin in-app security/account-event notifications."));const label=el("label",undefined,"switch"),input=el("input"),span=el("span");input.type="checkbox";input.checked=!!data.preferences.in_app_notifications;input.disabled=!data.canUpdate;label.append(input,span);line.append(copy,label);
    settings.append(el("h2","Notification preferences"),line,el("p","Email notification delivery is not configured by the current backend.","notice"));
    if(data.canUpdate)settings.append(button(el,"Save preference",()=>action(async()=>{await post("panel/preferences",{inAppNotifications:input.checked});await notificationsPage(o);}),"primary"));
    const head=el("div",undefined,"panel-head"),headCopy=el("div");headCopy.append(el("h2","Recent notifications"),el("p","Security and account events"));head.append(headCopy);
    if(data.canUpdate&&rows.some(x=>!x.read))head.append(button(el,"Mark all read",()=>action(async()=>{await post("panel/notifications/read-all",{});await notificationsPage(o);}),"sm"));
    history.append(head);
    for(const n of rows){const row=el("div",undefined,"summary-row"),left=el("div");left.append(el("strong",n.event),el("div",new Date(n.created_at).toLocaleString("en-IN"),"small muted"));row.append(left,pill(el,n.read?"read":"unread"));history.append(row);}
    if(!rows.length)history.append(el("p",data.preferences.in_app_notifications?"No notification events.":"In-app notifications are disabled, so no events are listed.","admin-empty"));
    grid.append(settings,history);container.append(grid);
    const pager=el("div",undefined,"admin-row-actions");if(offset>0)pager.append(button(el,"Previous",()=>action(()=>notificationsPage({...o,state:{offset:Math.max(0,offset-50)}}))));if(data.nextOffset!==null)pager.append(button(el,"Next",()=>action(()=>notificationsPage({...o,state:{offset:data.nextOffset}})),"primary"));container.append(pager);
  }

  async function profilePage(o){
    const {account,request,post,action,handleStage,el,container,title}=o;title.textContent="Profile";container.replaceChildren();
    const data=await request("panel/profile"),grid=el("div",undefined,"grid two-col"),profile=el("section",undefined,"card panel"),security=el("section",undefined,"card panel");
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Account",account.name||"Admin","Current session"),
      metric(el,"Email",account.email||"—","Sign-in identity"),
      metric(el,"Profile editing",data.canEdit?"Enabled":"Read only","Permission-controlled"),
      metric(el,"Password minimum","15 characters","Client + backend policy flow"),
      metric(el,"Sensitive changes","Current password","Confirmation required")
    );
    profile.append(el("h2","Profile"),el("p","Display-name updates use the profile endpoint. Email changes use the dedicated Admin security flow and require your current password.","notice"));
    const form=el("form",undefined,"form-grid"),name=field(el,form,"name","Display name",account.name||""),email=field(el,form,"email","Email",account.email||"","email");
    name.disabled=!data.canEdit;const save=el("button","Save profile","primary");save.type="submit";form.append(save);profile.append(form);
    form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;action(async()=>{
      let changed=false;
      if(data.canEdit&&name.value.trim()!==(account.name||"")){const r=await post("panel/profile/update",{name:name.value.trim()});account.name=r.name;changed=true;}
      if(email.value.trim()!==(account.email||"")){
        await confirmCurrentPassword("Change email",async password=>{
          const result=await post("security/admin-email",{password,newEmail:email.value.trim()});
          await handleStage(result);
        });
        return;
      }
      if(changed)await profilePage(o);
    });};

    security.append(el("h2","Account security"),el("p","Password changes use the dedicated Admin security endpoint and require your current password. The security handler decides any required session/stage transition.","notice"));
    const passwordForm=el("form",undefined,"form-grid"),newPassword=field(el,passwordForm,"newPassword","New password","","password");newPassword.autocomplete="new-password";newPassword.minLength=15;newPassword.maxLength=128;
    const confirmNew=field(el,passwordForm,"confirmPassword","Confirm new password","","password");confirmNew.autocomplete="new-password";confirmNew.minLength=15;confirmNew.maxLength=128;
    const change=el("button","Change password","primary");change.type="submit";passwordForm.append(el("p","Use at least 15 characters. Both password fields must match before submission.","notice"),change);security.append(passwordForm);
    passwordForm.onsubmit=e=>{e.preventDefault();if(!passwordForm.reportValidity())return;if(newPassword.value!==confirmNew.value)throw Error("New passwords do not match");action(async()=>confirmCurrentPassword("Change password",async password=>{
      const result=await post("security/admin-password",{password,newPassword:newPassword.value});newPassword.value="";confirmNew.value="";await handleStage(result);
    }));};

    grid.append(profile,security);container.append(metrics,grid);

    function confirmCurrentPassword(labelText,submit){
      return new Promise((resolve,reject)=>{
        const d=document.createElement("dialog"),form=document.createElement("form"),wrap=el("label","Current password"),password=el("input");password.type="password";password.autocomplete="current-password";password.required=true;wrap.append(password);form.append(wrap,el("p","Confirm your current password to continue with this sensitive account change.","notice"));
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
    const metrics=el("div",undefined,"grid analytics-metrics"),items=defaults.tenants||[];
    metrics.append(
      metric(el,"Workspaces",items.length,"Commercial default scopes"),
      metric(el,"Writable",defaults.canUpdate?"Yes":"No","Merchant commercial permission"),
      metric(el,"Admin login",auth.adminLogin,"Server-enforced"),
      metric(el,"Session idle",auth.sessionIdleMinutes+" min","Server-enforced"),
      metric(el,"Payment-link TTL","30–900 sec","Backend validation range"),
      metric(el,"Security policy",auth.securityPolicyEditable?"Editable":"Read only","Platform behavior")
    );
    const grid=el("div",undefined,"grid two-col"),commercial=el("section",undefined,"card panel"),policy=el("section",undefined,"card panel");
    const head=el("div",undefined,"panel-head"),copy=el("div");copy.append(el("h2","Commercial defaults"),el("p","Used for new Merchant approvals / workspace defaults"));head.append(copy);commercial.append(head);
    if(!items.length)commercial.append(el("p","No workspace defaults are visible in your scope.","admin-empty"));
    for(const item of items){
      const form=el("form",undefined,"form-grid"),
        tenant=field(el,form,"tenant","Workspace",item.tenantId),
        rate=field(el,form,"rate","Merchant INR / USDT",item.rate||"107"),
        fixed=field(el,form,"fixed","Fixed payout fee INR",item.fixedPayoutFee||"6"),
        payin=field(el,form,"payin","Default pay-in fee %",item.payinFee||"1.2"),
        payout=field(el,form,"payout","Default payout fee %",item.payoutFee||"0.8"),
        ttl=field(el,form,"ttl","Payment link TTL sec",String(item.paymentLinkTtlSeconds||300));
      tenant.disabled=true;rate.type=fixed.type=payin.type=payout.type="number";rate.step=fixed.step=payin.step=payout.step="0.01";ttl.type="number";ttl.min="30";ttl.max="900";ttl.step="1";
      rate.disabled=fixed.disabled=payin.disabled=payout.disabled=ttl.disabled=!defaults.canUpdate;
      const line=el("div",undefined,"toggle-line full"),left=el("div"),label=el("label",undefined,"switch"),toggle=el("input"),span=el("span");left.append(el("strong","Admin-managed collections"),el("p","Capacity insufficiency can be bypassed for Admin-managed collection routing only; account, device, UPI, ticket and daily-limit checks still apply."));toggle.type="checkbox";toggle.checked=!!item.adminManagedCollections;toggle.disabled=!defaults.canUpdate;label.append(toggle,span);line.append(left,label);form.append(line);
      form.append(el("p","Source: "+(item.adminManagedCollectionsSource==="admin"?"Admin setting":"Environment fallback")+(item.updatedAt?" · Updated "+new Date(item.updatedAt).toLocaleString("en-IN"):""),"notice full"));
      if(defaults.canUpdate){
        const save=el("button","Save defaults","primary");save.type="submit";form.append(save);
        form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;action(async()=>{
          await post("panel/merchant-default-rate/update",{
            tenantId:item.tenantId,rate:rate.value,fixedPayoutFee:fixed.value,payinFee:payin.value,payoutFee:payout.value,
            paymentLinkTtlSeconds:ttl.value,adminManagedCollections:toggle.checked
          });await settingsPage(o);
        });};
      }
      commercial.append(form);
    }
    policy.append(el("h2","Platform behavior"),el("p","Authentication/security timings are server-enforced and read-only here.","notice"));
    for(const [l,v] of [
      ["Admin login",auth.adminLogin],["Customer login",auth.customerLogin],["Employee login",auth.employeeLogin],
      ["Temporary password",auth.temporaryPasswordHours+" hours"],["Password reset challenge",auth.resetChallengeMinutes+" minutes"],
      ["Session idle",auth.sessionIdleMinutes+" minutes"],["Session maximum",auth.sessionMaximumHours+" hours"],
      ["Sensitive action confirmation",auth.sensitiveActionConfirmationMinutes+" minutes"]
    ]){const row=el("div",undefined,"summary-row");row.append(el("span",l),el("strong",String(v)));policy.append(row);}
    grid.append(commercial,policy);container.append(metrics,grid);
  }

  async function ledgerPage(o){
    const {post,action,el,container,title}=o;title.textContent="Ledger";container.replaceChildren();
    const state=o.state||{},filter={ownerId:state.ownerId||null,reference:state.reference||"",type:state.type||"",offset:Number(state.offset||0)},data=await post("business/ledger/search",filter),entries=data.entries||[];
    const tools=document.getElementById("page-tools");if(tools)tools.replaceChildren();
    const metrics=el("div",undefined,"grid analytics-metrics"),credits=entries.filter(e=>e.direction==="credit").reduce((n,e)=>n+BigInt(e.amount_minor||0),0n),debits=entries.filter(e=>e.direction==="debit").reduce((n,e)=>n+BigInt(e.amount_minor||0),0n);
    metrics.append(
      metric(el,"Entries",entries.length,"Current 50-row page"),
      metric(el,"Credits",money(credits),"Displayed credit entries"),
      metric(el,"Debits",money(debits),"Displayed debit entries"),
      metric(el,"Net displayed",money(credits-debits),"Display-only page total"),
      metric(el,"Ledger types",new Set(entries.map(e=>e.ledger_type)).size,"On current page"),
      metric(el,"More rows",data.nextOffset!==null?"Yes":"No","Server pagination")
    );
    const toolbar=el("form",undefined,"toolbar"),owner=el("input"),reference=el("input"),type=el("input");owner.className=reference.className=type.className="control";owner.placeholder="Owner UUID (optional)";owner.value=filter.ownerId||"";reference.placeholder="Exact reference";reference.value=filter.reference;type.placeholder="Ledger type";type.value=filter.type;const search=el("button","Apply filters","primary");search.type="submit";toolbar.append(owner,reference,type,search);if(filter.ownerId||filter.reference||filter.type){const clear=button(el,"Clear",()=>action(()=>ledgerPage({...o,state:{}})));toolbar.append(clear);}toolbar.onsubmit=e=>{e.preventDefault();action(()=>ledgerPage({...o,state:{ownerId:owner.value.trim()||null,reference:reference.value.trim(),type:type.value.trim(),offset:0}}));};
    container.append(metrics,toolbar,el("p","Live scoped ledger projection. Journal idempotency, balancing entries and source accounting remain server authority. Page totals below are not a platform profit calculation.","notice"));
    const rows=entries.map(e=>[new Date(e.created_at).toLocaleString("en-IN"),e.owner_id,e.account_type,e.ledger_type,e.direction,money(e.amount_minor),e.currency,e.reference_type,e.reference_id,e.payout_status||"—",e.actor_source||"—",e.snapshot?.version??"—"]);
    container.append(panelTable(el,["Time","Owner","Account","Ledger type","Direction","Amount","Currency","Reference type","Reference","Payout state","Actor source","Terms version"],rows,"Ledger entries","Offset "+filter.offset));
    const pager=el("div",undefined,"admin-row-actions");if(filter.offset>0)pager.append(button(el,"Previous",()=>action(()=>ledgerPage({...o,state:{...state,offset:Math.max(0,filter.offset-50)}}))));if(data.nextOffset!==null)pager.append(button(el,"Next",()=>action(()=>ledgerPage({...o,state:{...state,offset:data.nextOffset}})),"primary"));container.append(pager);
  }

  async function reportsPage(o){
    const {post,action,el,container,title}=o;title.textContent="Reports";container.replaceChildren();
    const state=o.state||{},payload={offset:Number(state.offset||0),...(state.from?{from:state.from}:{}),...(state.to?{to:state.to}:{})},data=await post("panel/reports",payload),tools=document.getElementById("page-tools");if(tools)tools.replaceChildren();
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Rows",data.rows.length,"Current report page"),
      metric(el,"Currencies",new Set(data.rows.map(x=>x.currency)).size,"On current page"),
      metric(el,"Export",data.canExport?"Enabled":"Unavailable","Permission-controlled"),
      metric(el,"Period",new Date(data.from).toLocaleDateString("en-IN")+" – "+new Date(data.to).toLocaleDateString("en-IN"),"Selected report window"),
      metric(el,"More rows",data.nextOffset!==null?"Yes":"No","Server pagination"),
      metric(el,"Totals scope",data.pageTotalsOnly?"Current page":"Report","Backend contract")
    );
    const filter=el("form",undefined,"toolbar"),from=el("input"),to=el("input");from.type=to.type="date";from.className=to.className="control";if(state.from)from.value=String(state.from).slice(0,10);if(state.to)to.value=String(state.to).slice(0,10);const apply=el("button","Apply period","primary");apply.type="submit";filter.append(from,to,apply);if(state.from||state.to)filter.append(button(el,"Reset",()=>action(()=>reportsPage({...o,state:{}}))));filter.onsubmit=e=>{e.preventDefault();const s={offset:0};if(from.value)s.from=new Date(from.value+"T00:00:00Z").toISOString();if(to.value)s.to=new Date(to.value+"T23:59:59Z").toISOString();action(()=>reportsPage({...o,state:s}));};
    container.append(metrics,filter,el("p","Backend totals on this page are page-scoped, not full-period totals. Export uses the same selected period and permission scope.","notice"));
    const summary=el("div",undefined,"admin-summary-grid");for(const [k,v]of Object.entries(data.totals||{})){const tile=el("article",undefined,"admin-summary-tile");tile.append(el("span",k.replaceAll("_"," ")),el("strong",money(v)));summary.append(tile);}container.append(summary);
    container.append(panelTable(el,["Date","Owner","Ledger","Direction","Amount","Currency","Reference type","Reference"],data.rows.map(r=>[new Date(r.created_at).toLocaleString("en-IN"),r.owner_id||"—",r.ledger_type,r.direction,money(r.amount_minor),r.currency,r.reference_type,r.reference_id]),"Ledger report","Offset "+payload.offset));
    const pager=el("div",undefined,"admin-row-actions");if(payload.offset>0)pager.append(button(el,"Previous",()=>action(()=>reportsPage({...o,state:{...state,offset:Math.max(0,payload.offset-50)}}))));if(data.nextOffset!==null)pager.append(button(el,"Next",()=>action(()=>reportsPage({...o,state:{...state,offset:data.nextOffset}})),"primary"));container.append(pager);
    if(data.canExport&&tools)tools.append(button(el,"Export CSV",()=>action(async()=>{const out=await post("panel/reports/export",{offset:0,from:data.from,to:data.to}),url=URL.createObjectURL(new Blob([out.csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="wpay-report.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}),"primary"));
  }

  async function auditPage(o){
    const {post,action,el,container,title}=o;title.textContent="Audit log";container.replaceChildren();
    const state=o.state||{},offset=Number(state.offset||0),data=await post("panel/admin-audit",{offset}),rows=data.rows||[];
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Events",rows.length,"Current audit page"),
      metric(el,"Security",rows.filter(r=>r.source==="security").length,"Current page"),
      metric(el,"Panel",rows.filter(r=>r.source==="panel").length,"Current page"),
      metric(el,"Business",rows.filter(r=>r.source==="business").length,"Current page"),
      metric(el,"More rows",data.hasMore?"Yes":"No","Server pagination"),
      metric(el,"Period",new Date(data.from).toLocaleDateString("en-IN")+" – "+new Date(data.to).toLocaleDateString("en-IN"),"Audit window")
    );
    container.append(metrics,el("p","Security, panel and business audit sources are combined in reverse chronological order. This is an audit projection; source records remain append-only in their respective domains.","notice"),panelTable(el,["Time","Source","Action","Actor","Target"],rows.map(r=>[new Date(r.created_at).toLocaleString("en-IN"),r.source,r.action,r.actor_id,r.target_id||"—"]),"Audit events","Offset "+offset));
    const pager=el("div",undefined,"admin-row-actions");if(offset>0)pager.append(button(el,"Previous",()=>action(()=>auditPage({...o,state:{offset:Math.max(0,offset-50)}}))));if(data.hasMore)pager.append(button(el,"Next",()=>action(()=>auditPage({...o,state:{offset:offset+50}})),"primary"));container.append(pager);
  }

  async function supportPage(o){
    const {post,action,el,container,title}=o;title.textContent="Support";container.replaceChildren();
    const state=o.state||{},offset=Number(state.offset||0),data=await post("panel/support",{offset,limit:50}),rows=data.rows||[],open=rows.filter(t=>t.status==="open");
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Tickets",rows.length,"Current page"),
      metric(el,"Open",open.length,"Awaiting or continuing support"),
      metric(el,"Resolved",rows.length-open.length,"Current page"),
      metric(el,"Can reply",data.canWrite?"Yes":"No","Permission-controlled"),
      metric(el,"External delivery",data.externalDelivery?"Configured":"Not configured","Replies remain in WPay")
    );
    container.append(metrics,el("p","Support responses are stored in WPay. Current backend reports externalDelivery=false, so saving a reply does not imply email/SMS delivery.","notice"));
    const tableRows=rows.map(t=>{const actions=el("div",undefined,"admin-row-actions");if(data.canWrite)actions.append(button(el,"Reply / update",()=>reply(t),"primary"));return [new Date(t.created_at).toLocaleString("en-IN"),t.owner_name||"—",t.subject,t.message,pill(el,t.status),t.reply||"—",t.replied_at?new Date(t.replied_at).toLocaleString("en-IN"):"—",actions];});container.append(panelTable(el,["Created","Owner","Subject","Message","Status","Latest reply","Reply time","Action"],tableRows,"Support queue","Offset "+offset));
    const pager=el("div",undefined,"admin-row-actions");if(offset>0)pager.append(button(el,"Previous",()=>action(()=>supportPage({...o,state:{offset:Math.max(0,offset-50)}}))));if(data.nextOffset!==null)pager.append(button(el,"Next",()=>action(()=>supportPage({...o,state:{offset:data.nextOffset}})),"primary"));container.append(pager);
    function reply(t){dialog(el,container,"Support ticket",(body,d)=>{const form=document.createElement("form"),statusLabel=el("label","Status"),status=el("select");for(const v of ["open","resolved"]){const op=el("option",v);op.value=v;status.append(op);}status.value=t.status;statusLabel.append(status);form.append(statusLabel);const l=el("label","Reply"),message=el("textarea");message.required=true;l.append(message);form.append(l);const save=el("button","Save reply","primary");save.type="submit";form.append(el("p","This saves an internal WPay support response; external delivery is not configured by this endpoint.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("panel/support/update",{requestId:crypto.randomUUID(),id:t.id,status:status.value,message:message.value});d.close();await supportPage(o);});};});}
  }

  async function apkPage(o){
    const {request,el,container,title}=o;title.textContent="APK / Agent";container.replaceChildren();
    const data=await request("apk"),metrics=el("div",undefined,"grid analytics-metrics"),size=data.bytes?Math.round(data.bytes/1024/1024*100)/100+" MB":"—";
    metrics.append(
      metric(el,"Version",data.version||"—","Published Agent version"),
      metric(el,"Build",data.build??"—","Android versionCode"),
      metric(el,"Package",data.package||"—","Android application ID"),
      metric(el,"Artifact size",size,"Validated APK bytes"),
      metric(el,"Signing",data.signing?.verified?"Verified":"Unavailable",data.signing?.identity||"Signer identity unavailable"),
      metric(el,"Built",data.builtAt?new Date(data.builtAt).toLocaleString("en-IN"):"—",data.sourceCommit?"Commit "+String(data.sourceCommit).slice(0,12):"Build metadata")
    );
    container.append(metrics);
    const card=el("section",undefined,"card panel"),head=el("div",undefined,"panel-head"),copy=el("div");copy.append(el("h2","Published Android artifact"),el("p","Server-validated APK metadata"));head.append(copy);card.append(head);
    const line=(label,detail,state)=>{const r=el("div",undefined,"summary-row"),left=el("div");left.append(el("strong",label),el("div",detail,"small muted"));r.append(left,pill(el,state));return r;};
    card.append(
      line("Artifact validation",data.available?"APK + metadata available":"Unavailable",data.available?"verified":"unavailable"),
      line("SHA-256",data.sha256||"Unavailable",data.sha256?"verified":"unavailable"),
      line("Signing scheme",data.signing?.scheme||"Unavailable",data.signing?.verified?"verified":"unavailable"),
      line("Android API","Minimum "+(data.minimumAndroidApi??"—")+" · Target "+(data.targetAndroidApi??"—"),"metadata"),
      line("Publication source",data.source||"Unavailable","metadata"),
      line("Workflow trigger","Current repository workflow: main branch + android-app/workflow paths","configured")
    );
    const dl=el("a","Download latest APK","primary");dl.href=data.downloadPath||"/wpay-auth/apk/download";dl.download="WPAY-Agent.apk";
    card.append(el("p","Download uses the canonical artifact path returned by the APK metadata endpoint. The server validates APK hash, size, version metadata and signer evidence before reporting the artifact available. OTP capture/detection code is not modified by this Admin UI change.","notice"),dl);container.append(card);
  }

  async function financeSnapshot(o){
    return o.post("panel/admin-finance",{offset:0});
  }
  async function profitOverviewPage(o){
    const {el,container,title}=o;title.textContent="Profit overview";const d=await financeSnapshot(o),fees=d.fees||{},m=k=>BigInt(fees[k]||0),merchantPayin=m("merchant_platform_fee"),merchantPayout=m("merchant_payout_fee"),merchantFees=merchantPayin+merchantPayout,userPayin=m("user_commission"),userPayout=m("user_payout_commission"),userCommissions=userPayin+userPayout,costs=BigInt(d.totalCosts||0),margin=BigInt(d.operatingMargin||0);
    container.replaceChildren();const grid=el("div",undefined,"grid analytics-metrics");grid.append(
      metric(el,"Merchant fees",money(merchantFees),"Pay-in + payout posted fees"),
      metric(el,"User commissions",money(userCommissions),"Pay-in + payout posted commissions"),
      metric(el,"Operating costs",money(costs),"Non-void salary + expenses"),
      metric(el,"Operating margin",money(margin),"Fees − commissions − costs"),
      metric(el,"Pay-in margin",money(merchantPayin-userPayin),"Pay-in fee less commission"),
      metric(el,"Payout margin",money(merchantPayout-userPayout),"Payout fee less commission")
    );
    const period=el("p","Period: "+new Date(d.from).toLocaleString("en-IN")+" → "+new Date(d.to).toLocaleString("en-IN")+". Exchange profit uses aggregate User and Merchant USDT values at their locked account rates.","notice");
    const breakdown=panelTable(el,["Component","Amount"],[
      ["Merchant pay-in fees",money(merchantPayin)],["Merchant payout fees",money(merchantPayout)],["User pay-in commissions",money(userPayin)],["User payout commissions",money(userPayout)],["Salary & operating expenses",money(costs)],["Operating margin",money(margin)],["Exchange profit",money(d.fxProfit||0)],["Combined report result",money(margin+BigInt(d.fxProfit||0))]
    ],"Operating margin breakdown","Backend period projection");
    container.append(grid,period,breakdown);
  }

  async function financePayinPage(o){
    const {el,container,title}=o;title.textContent="Pay-in fees & commissions";const d=await financeSnapshot(o),f=d.fees||{},fees=BigInt(f.merchant_platform_fee||0),comm=BigInt(f.user_commission||0),gross=BigInt(f.merchant_gross||0),consumed=BigInt(f.capacity_consumed||0),margin=fees-comm;container.replaceChildren();
    const grid=el("div",undefined,"grid analytics-metrics");grid.append(metric(el,"Merchant pay-in fees",money(fees),"Posted platform fees"),metric(el,"User pay-in commission",money(comm),"Posted User earnings"),metric(el,"Pay-in margin",money(margin),"Fee less commission"),metric(el,"Merchant gross",money(gross),"Ledger gross in period"),metric(el,"User capacity consumed",money(consumed),"Collection-side capacity movement"),metric(el,"Period","60d max",new Date(d.from).toLocaleDateString("en-IN")+" – "+new Date(d.to).toLocaleDateString("en-IN")));container.append(grid,el("p","All figures are net ledger movements in the current report window; this page does not reconstruct transaction-level gross from UI assumptions.","notice"));
  }

  async function financePayoutPage(o){
    const {el,container,title}=o;title.textContent="Payout fees & commissions";const d=await financeSnapshot(o),f=d.fees||{},fees=BigInt(f.merchant_payout_fee||0),comm=BigInt(f.user_payout_commission||0),principal=BigInt(f.merchant_payout_principal||0),margin=fees-comm,p=d.payout||{};container.replaceChildren();
    const grid=el("div",undefined,"grid analytics-metrics");grid.append(metric(el,"Merchant payout fees",money(fees),"Net posted payout fees"),metric(el,"User payout commission",money(comm),"Net posted User earnings"),metric(el,"Payout margin",money(margin),"Fee less commission"),metric(el,"Payout principal",money(principal),"Net Merchant payout principal"),metric(el,"Net successful payouts",p.count||0,"Successful minus invalid-dispute reversals"),metric(el,"Fixed + percentage",money(BigInt(p.fixed||0)+BigInt(p.percentage||0)),"Net payout fee components"));container.append(grid,el("p","Fixed payout fees are already included in merchant payout fees. payment_invalid post-approval dispute resolutions are netted out by the backend and are not double-counted here.","notice"));
  }

  async function financeFixedPage(o){
    const {el,container,title}=o;title.textContent="Fixed payout revenue";const d=await financeSnapshot(o),p=d.payout||{},fixed=BigInt(p.fixed||0),percentage=BigInt(p.percentage||0),total=fixed+percentage;container.replaceChildren();
    const grid=el("div",undefined,"grid analytics-metrics");grid.append(metric(el,"Net successful payouts",p.count||0,"Successful less invalid-dispute reversals"),metric(el,"Fixed payout revenue",money(fixed),"Net fixed component"),metric(el,"Percentage payout fees",money(percentage),"Net percentage component"),metric(el,"Total payout fee components",money(total),"Fixed + percentage"),metric(el,"Average fixed fee",Number(p.count||0)>0?money(fixed/BigInt(p.count)):"—","Net fixed ÷ net successful count"),metric(el,"Period",new Date(d.from).toLocaleDateString("en-IN")+" – "+new Date(d.to).toLocaleDateString("en-IN"),"Current finance window"));container.append(grid,el("p","The backend subtracts fixed and percentage fees for payouts later resolved payment_invalid, so this is net revenue rather than raw successful-event count.","notice"));
  }

  async function financeUsdtPage(o){
    const {el,container,title}=o;title.textContent="USDT exchange";const d=await financeSnapshot(o),fund=d.funding||{},set=d.settlement||{},usdt=v=>{const n=BigInt(v||0),a=n<0n?-n:n,s=a.toString().padStart(7,"0");return (n<0n?"−":"")+s.slice(0,-6)+"."+s.slice(-6)+" USDT";},fundUsdt=BigInt(fund.usdt||0),settleUsdt=BigInt(set.usdt||0),fundInr=BigInt(fund.inr||0),settleInr=BigInt(set.inr||0);container.replaceChildren();
    const grid=el("div",undefined,"grid analytics-metrics");grid.append(metric(el,"Confirmed User deposits",usdt(fundUsdt),"USDT received in confirmed funding"),metric(el,"User USDT value",money(fundInr),"Received USDT × each locked User rate"),metric(el,"Completed Merchant settlements",usdt(settleUsdt),"USDT manual settlement records"),metric(el,"Merchant USDT value",money(settleInr),"Settled USDT × each locked Merchant rate"),metric(el,"USDT flow difference",usdt(fundUsdt-settleUsdt),"Operational flow only"),metric(el,"Exchange profit",money(d.fxProfit||0),"Merchant INR value − User INR cost"));container.append(grid,el("p","Exchange profit compares the two INR totals in this report period using each transaction’s locked account rate. Different received and settled USDT quantities affect this difference; unsettled USDT is shown separately. Setup deductions reduce collection capacity, not gross USDT received. Merchant settlements are manually recorded.","notice"));
  }

  async function expensePage(o,mode){
    const {post,action,el,container,title}=o,d=await financeSnapshot(o),salary=mode==="salary",records=(d.expenses||[]).filter(e=>salary?e.category==="salary":e.category!=="salary"),active=records.filter(e=>!e.void_reason),voided=records.filter(e=>e.void_reason),activeTotal=active.reduce((n,e)=>n+BigInt(e.amount_minor||0),0n);
    title.textContent=salary?"Salary management":"Expense management";container.replaceChildren();
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(d.canManage)tools.append(button(el,salary?"+ Record salary":"+ Record expense",()=>create(),"primary"));}
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,salary?"Salary records":"Expense records",records.length,"Current finance page"),
      metric(el,"Active amount",money(activeTotal),"Non-void records"),
      metric(el,"Voided",voided.length,"Retained for audit"),
      metric(el,"Period",new Date(d.from).toLocaleDateString("en-IN")+" – "+new Date(d.to).toLocaleDateString("en-IN"),"Finance window"),
      metric(el,"Can manage",d.canManage?"Yes":"No","Permission-controlled")
    );
    container.append(metrics,el("p","These are reporting records only; saving or voiding a salary/expense entry does not transfer money. Voided entries stay visible and are excluded from operating-cost totals.","notice"));
    const rows=records.map(e=>[new Date(e.occurred_at).toLocaleString("en-IN"),e.category,e.payee,money(e.amount_minor),e.description,e.void_reason?("voided · "+e.void_reason):"recorded",!e.void_reason&&d.canManage?button(el,"Void",()=>voidExpense(e),"danger"):"—"]);
    container.append(panelTable(el,["Date","Category","Payee","Amount","Reference","State","Action"],rows,salary?"Salary records":"Operating expenses",active.length+" active · "+voided.length+" voided"));
    function create(){dialog(el,container,salary?"Record salary payment":"Record expense",(body,dlg)=>{const form=el("form",undefined,"form-grid"),tenant=selectField(el,form,"tenant","Workspace",(d.tenants||[]).map(x=>[x,x]),d.tenants?.[0]),category=selectField(el,form,"category","Category",salary?[["salary","Salary"]]:[["server","Server"],["maintenance","Maintenance"],["other","Other"]],salary?"salary":"server"),payee=field(el,form,"payee",salary?"Employee name / reference":"Payee"),amount=field(el,form,"amount","Amount INR"),description=field(el,form,"description","Description / payment reference"),save=el("button","Save record","primary");save.type="submit";form.append(el("p","This creates a reporting expense record only. It does not initiate a bank or wallet transfer.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const [w,fr=""]=String(amount.value).split("."),minor=(BigInt(w||0)*100n+BigInt(fr.padEnd(2,"0").slice(0,2)||0)).toString();await post("panel/expense/create",{requestId:crypto.randomUUID(),tenantId:tenant.value,category:category.value,payee:payee.value,amountMinor:minor,occurredAt:new Date().toISOString(),description:description.value});dlg.close();await expensePage(o,mode);});};});}
    function voidExpense(e){dialog(el,container,"Void expense",(body,dlg)=>{const form=el("form"),reason=field(el,form,"reason","Reason","Incorrect expense record"),save=el("button","Confirm void","danger");save.type="submit";form.append(el("p","Void keeps the original record auditable but excludes it from active operating-cost totals.","notice"),save);body.append(form);form.onsubmit=x=>{x.preventDefault();action(async()=>{await post("panel/expense/void",{id:e.id,reason:reason.value});dlg.close();await expensePage(o,mode);});};});}
  }

  async function securityPage(o){
    const {request,el,container,title,navigate}=o;title.textContent="Security";
    const data=await request("panel/settings");container.replaceChildren();
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Admin login",data.adminLogin,"Current server policy"),
      metric(el,"Employee login",data.employeeLogin,"Current server policy"),
      metric(el,"Session idle",data.sessionIdleMinutes+" min","Idle timeout"),
      metric(el,"Session maximum",data.sessionMaximumHours+" hr","Absolute session limit"),
      metric(el,"Sensitive confirmation",data.sensitiveActionConfirmationMinutes+" min","Recent-auth window"),
      metric(el,"Policy editing",data.securityPolicyEditable?"Enabled":"Disabled","Server-controlled")
    );
    const grid=el("div",undefined,"grid two-col"),auth=el("section",undefined,"card panel"),boundaries=el("section",undefined,"card panel");
    auth.append(el("h2","Authentication policy"),el("p","These values are returned by the server and are not editable from this Admin page.","notice"));
    for(const [l,v]of [
      ["Admin login",data.adminLogin],["Customer login",data.customerLogin],["Employee login",data.employeeLogin],
      ["Temporary password",data.temporaryPasswordHours+" hours"],["Reset challenge",data.resetChallengeMinutes+" minutes"],
      ["Session idle",data.sessionIdleMinutes+" minutes"],["Session maximum",data.sessionMaximumHours+" hours"],
      ["Sensitive action confirmation",data.sensitiveActionConfirmationMinutes+" minutes"]
    ]){const row=el("div",undefined,"summary-row");row.append(el("span",l),el("strong",String(v)));auth.append(row);}
    boundaries.append(el("h2","Authority boundaries"));
    for(const [l,v]of [
      ["Tenant scoping","Required for Admin operational data access"],
      ["Recent authentication","Required for high-risk mutations"],
      ["Super Admin platform scope","Required for API credential and Admin-authority management"],
      ["Employee delegation","Cannot exceed delegating Admin grants"],
      ["OTP event access","Separate permission-controlled operational surface"],
      ["Security policy editing",data.securityPolicyEditable?"Available":"Not exposed in this Admin API"]
    ]){const row=el("div",undefined,"summary-row");row.append(el("span",l),el("strong",v));boundaries.append(row);}
    boundaries.append(el("p","Use Profile / Account security for your own email and password changes. Those flows require current-password confirmation through the existing security endpoints.","notice"),button(el,"Open Account settings",()=>navigate("v5.profile"),"primary"));
    grid.append(auth,boundaries);container.append(metrics,grid);
  }

  async function collectionAccessPage(o){
    const {request,post,action,el,container,title}=o;title.textContent="User collection access";container.replaceChildren();
    const data=await request("business/user-access"),policy=el("div",undefined,"policy-grid");
    for(const [name,copy]of [
      ["Free Setup","No setup fee or deposit requirement. Includes unlimited collection capacity; security and UPI limits still apply."],
      ["Unlimited Collection","Exempts collection routing from capacity insufficiency only. Account, device, UPI, ticket and daily limits still apply."],
      ["First deposit policy","Standard first deposit: 2,000 USDT less a one-time non-refundable 100 USDT setup fee = 1,900 USDT capacity. Existing funded accounts are not charged again."]
    ]){const card=el("article",undefined,"policy-card");card.append(el("strong",name),el("p",copy));policy.append(card);}container.append(policy);
    const rows=data.users.map(u=>{
      const available=BigInt(u.available_minor||0),setup=u.free_setup||available>0n,actions=el("div",undefined,"row-actions"),user=el("div"),name=el("strong",u.name),id=el("div",u.id,"small muted");
      user.append(name,id);actions.append(button(el,"Manage access",()=>edit(u),"btn sm"));
      return [user,money(available),pill(el,u.free_setup?"enabled":"disabled"),pill(el,u.unlimited_collection?"enabled":"disabled"),pill(el,setup?"setup allowed":"funding required"),pill(el,u.unlimited_collection?"Capacity exempt":"Capacity backed"),actions];
    });
    const panel=panelTable(el,["User","Capacity","Free setup","Unlimited collection","Setup status","Collection mode","Action"],rows);panel.style.marginTop="12px";
    const warning=el("p",undefined,"notice warn");warning.innerHTML="<b>Unlimited Collection capacity ko bypass karta hai, security ko nahi:</b> User active/approved, device eligibility, UPI approval/verification, route min/max aur per-UPI daily limit checks phir bhi apply hote hain.";warning.style.marginTop="12px";
    container.append(panel,warning);
    function edit(u){
      dialog(el,container,"Collection access · "+u.name,(body,d)=>{
        const form=document.createElement("form"),toggle=(labelText,description,checked)=>{
          const line=el("div",undefined,"toggle-line"),copy=el("div"),wrap=el("label",undefined,"switch"),input=el("input"),span=el("span");
          copy.append(el("strong",labelText),el("p",description));input.type="checkbox";input.checked=checked;wrap.append(input,span);line.append(copy,wrap);form.append(line);return input;
        },free=toggle("Free Setup","No setup fee or deposit requirement; includes unlimited collection capacity.",u.free_setup),unlimited=toggle("Unlimited Collection","Ignore capacity-insufficient routing only; all other eligibility and UPI limits remain enforced.",u.unlimited_collection),reason=field(el,form,"reason","Reason",u.reason||"Admin collection policy update","text",true),save=el("button","Save access","btn primary");
        const syncFreeSetup=()=>{if(free.checked)unlimited.checked=true;unlimited.disabled=free.checked;};free.onchange=syncFreeSetup;syncFreeSetup();save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/user-access/update",{userId:u.id,freeSetup:free.checked,unlimitedCollection:unlimited.checked,reason:reason.value});d.close();await collectionAccessPage(o);});};
      });
    }
  }

  async function transactionsPage(o){
    const {post,el,container,title}=o;title.textContent="Transactions";container.replaceChildren();
    const tools=document.getElementById("page-tools");if(tools)tools.replaceChildren();
    const [payins,payouts]=await Promise.all([post("operations/transactions",{offset:0,status:""}),post("payout/search",{offset:0,limit:50})]);
    const records=[
      ...payins.records.map(t=>({at:t.createdAt,reference:t.reference,id:t.orderId,type:"Pay-in",merchant:t.merchantId||"—",user:t.userId||"—",amount:t.amountMinor,utr:(t.observations||[]).map(x=>x.utr).join(", ")||"—",status:t.status,evidence:t.evidenceState||"—",accounting:t.accountingState||"—",callback:t.callbackState||"—",verified:(t.observations||[]).some(x=>x.verified)})),
      ...payouts.orders.map(t=>({at:t.createdAt,reference:t.reference,id:t.id,type:"Payout",merchant:t.merchantId||"—",user:t.claimUserId||t.userId||"—",amount:t.amountMinor,utr:t.utr||"—",status:t.status,evidence:"payout workflow",accounting:t.status==="successful"?"posted":"workflow",callback:"—",verified:t.status==="successful"}))
    ].sort((a,b)=>+new Date(b.at||0)-+new Date(a.at||0));
    const metrics=el("div",undefined,"grid analytics-metrics"),payinCount=records.filter(x=>x.type==="Pay-in").length,payoutCount=records.length-payinCount,success=records.filter(x=>x.status==="successful").length,pending=records.filter(x=>["pending_payment","verification_pending","recovery_review","claimed","submitted","pending_admin","open"].includes(x.status)).length,totalVolume=records.reduce((n,x)=>n+BigInt(x.amount||0),0n);
    metrics.append(metric(el,"Transactions",records.length,"Latest scoped pay-in + payout"),metric(el,"Pay-ins",payinCount,"Collection orders"),metric(el,"Payouts",payoutCount,"Payout workflow"),metric(el,"Successful",success,"Completed records"),metric(el,"Pending / review",pending,"Open workflow states"),metric(el,"Displayed volume",money(totalVolume),"Latest loaded records"));
    const toolbar=el("div",undefined,"toolbar"),search=el("input"),status=el("select"),kind=el("select");search.className="control grow";search.placeholder="Search reference, UTR, merchant, user…";for(const v of ["","successful","verification_pending","recovery_review","failed","expired","cancelled","submitted","claimed","not_paid"]){const op=el("option",v||"All status");op.value=v;status.append(op);}for(const v of ["","Pay-in","Payout"]){const op=el("option",v||"All types");op.value=v;kind.append(op);}status.className=kind.className="control";toolbar.append(search,kind,status);const panel=el("section",undefined,"card panel");container.append(metrics,toolbar,el("p",payins.note||"Submitted UTRs remain observations until independently verified evidence establishes accounting.","notice"),panel);
    let visible=records;const draw=()=>{const q=search.value.trim().toLowerCase(),st=status.value,kt=kind.value;visible=records.filter(t=>(!st||t.status===st)&&(!kt||t.type===kt)&&[t.reference,t.utr,t.merchant,t.user,t.id,t.type].join(" ").toLowerCase().includes(q));const rows=visible.map(t=>[t.at?new Date(t.at).toLocaleString("en-IN"):"—",t.reference+" · "+t.id,t.type,t.merchant+" · "+t.user,money(t.amount),t.utr,t.status,t.evidence,t.accounting,t.callback]);panel.replaceChildren(table(el,["Time","Reference","Type","Merchant / User","Amount","UTR","Status","Evidence","Accounting","Callback"],rows));};search.oninput=draw;status.onchange=draw;kind.onchange=draw;
    if(tools)tools.append(button(el,"Export CSV",()=>{const fields=["id","reference","type","merchant","user","amount_minor","utr","status","evidence","accounting","callback","at"],lines=[fields,...visible.map(t=>[t.id,t.reference,t.type,t.merchant,t.user,t.amount,t.utr,t.status,t.evidence,t.accounting,t.callback,t.at])],csv=lines.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\r\n"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download="wpay-transactions.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},"primary"));draw();
  }

  async function payoutDisputes(o){
    const {post,action,el,container,title}=o;title.textContent="Post-approval disputes";container.replaceChildren();
    const data=await post("payout/dispute/search",{offset:0,limit:25}),orders=data.orders||[],open=orders.filter(d=>d.status==="pending"),valid=orders.filter(d=>d.status==="payment_valid"),invalid=orders.filter(d=>d.status==="payment_invalid"),held=open.reduce((n,d)=>n+BigInt(d.amountMinor||0),0n),commission=open.reduce((n,d)=>n+BigInt(d.commissionMinor||0),0n);
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Open disputes",open.length,"Pending Admin resolution"),
      metric(el,"Capacity held",money(held),"User exposure on pending disputes"),
      metric(el,"Commission held",money(commission),"User payout commission hold"),
      metric(el,"Payment valid",valid.length,"Resolved valid"),
      metric(el,"Payment invalid",invalid.length,"Exact reversal outcome"),
      metric(el,"Loaded disputes",orders.length,"Latest scoped records")
    );
    container.append(metrics,el("p","Post-approval dispute is available for recent successful payouts. While pending, User capacity and payout commission are held. payment_invalid reverses the exact reversible settlement entries; payment_valid releases the holds without rewriting history.","notice"));
    const rows=orders.map(d=>{
      const actions=el("div",undefined,"admin-row-actions"),proofs=el("div",undefined,"admin-row-actions");
      if(d.statementId)proofs.append(button(el,"Merchant statement",()=>download(d,d.statementId)));
      if(d.responseProofId)proofs.append(button(el,"User response",()=>download(d,d.responseProofId)));
      if(d.status==="pending")actions.append(button(el,"Payment valid",()=>resolve(d,"payment_valid"),"primary"),button(el,"Payment invalid",()=>resolve(d,"payment_invalid"),"danger"));
      const identity=el("div");identity.append(el("strong",d.reference),el("div",d.id,"small muted"));
      const coverage=(d.coverageFrom?new Date(d.coverageFrom).toLocaleString("en-IN"):"—")+" → "+(d.coverageThrough?new Date(d.coverageThrough).toLocaleString("en-IN"):"—");
      return [identity,(d.merchantName||d.merchantId)+" · "+(d.userName||d.userId),money(d.amountMinor),money(d.commissionMinor||0),coverage,d.reason,proofs,pill(el,d.status),actions];
    });
    container.append(panelTable(el,["Payout","Merchant / User","Amount","Commission hold","Statement coverage","Reason","Proofs","Status","Action"],rows,"Post-approval disputes",open.length+" pending"+(data.hasMore?" · more available":"")));
    function download(d,proofId){action(async()=>{const p=await post("payout/proof",{id:d.id,proofId}),bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:p.contentType||"application/octet-stream"})),a=document.createElement("a");a.href=url;a.download=p.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});}
    function resolve(d,decision){dialog(el,container,decision==="payment_valid"?"Resolve as payment valid":"Resolve as payment invalid",(body,dlg)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Resolution reason","Reviewed Merchant statement and User response"),save=el("button",decision==="payment_valid"?"Payment valid":"Payment invalid",decision==="payment_valid"?"primary":"danger");save.type="submit";form.append(el("p",decision==="payment_invalid"?"This exact-reverses the reversible settlement accounting path and releases dispute holds.":"This releases dispute holds and leaves the successful settlement intact.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("payout/dispute/resolve",{id:d.id,action:decision,reason:reason.value});dlg.close();await payoutDisputes(o);});};});}
  }

  async function lateReviews(o){
    const {post,action,el,container,title}=o;title.textContent="Late payment reviews";container.replaceChildren();
    const [payoutData,parkingData]=await Promise.all([post("payout/late/search",{offset:0}),post("parking/late/search",{offset:0})]);
    const records=[
      ...(payoutData.requests||[]).map(r=>({...r,kind:"payout"})),
      ...(parkingData.requests||[]).map(r=>({...r,kind:"parking"}))
    ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const pending=records.filter(r=>r.status==="pending"),held=pending.reduce((n,r)=>n+BigInt(r.held_minor||0),0n),conflicts=pending.filter(r=>r.conflict).length,flagged=pending.filter(r=>r.scan_state&&r.scan_state!=="clean").length;
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Pending reviews",pending.length,"Awaiting explicit Admin decision"),
      metric(el,"Held amount",money(held),"Queue hold only"),
      metric(el,"Conflicts",conflicts,"Existing state/balance conflicts"),
      metric(el,"Scan flagged",flagged,"Non-clean proof scans"),
      metric(el,"Payout late reviews",records.filter(r=>r.kind==="payout").length,"All loaded"),
      metric(el,"Parking late reviews",records.filter(r=>r.kind==="parking").length,"All loaded")
    );
    container.append(metrics,el("p","Late proof is review-only until explicit approval. Existing assignments/tasks are not silently changed. Payout reviews may use an existing reservation hold or an extra reserve; Parking holds only the amount still safely available.","notice"));
    const rows=records.map(r=>{
      const proofCell=el("div",undefined,"admin-row-actions");proofCell.append(button(el,"View proof",()=>proof(r)));
      const actions=el("div",undefined,"admin-row-actions");
      if(r.status==="pending")actions.append(button(el,"Approve",()=>decide(r,"approve"),"primary"),button(el,"Reject",()=>decide(r,"reject"),"danger"));
      return [pill(el,r.kind),r.resource_id+" · "+r.user_name,money(r.amount_minor),money(r.held_minor),r.reserve_mode||"none",r.scan_state||"—",r.reason,r.conflict||"—",pill(el,r.status),proofCell,actions];
    });
    container.append(panelTable(el,["Kind","Resource / User","Amount","Held","Reserve mode","Proof scan","Reason","Conflict","Status","Proof","Action"],rows,"Late payment review queue",pending.length+" pending"));
    function proof(r){action(async()=>{const route=r.kind==="parking"?"parking/late/proof":"payout/late/proof",p=await post(route,{id:r.id}),d=document.createElement("dialog"),bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:"application/octet-stream"})),link=el("a","Download proof","primary");link.href=url;link.download=p.name;d.append(el("h2",(r.kind==="parking"?"Parking":"Payout")+" late proof"),el("p","UTR: "+p.utr+" · Scan: "+p.scanState,"notice"),link,button(el,"Close",()=>{URL.revokeObjectURL(url);d.close();}));container.append(d);d.showModal();});}
    function decide(r,decision){dialog(el,container,(decision==="approve"?"Approve ":"Reject ")+(r.kind==="parking"?"Parking":"Payout")+" late proof",(body,d)=>{const form=document.createElement("form"),reason=field(el,form,"reason","Decision reason",decision==="approve"?"Late payment evidence accepted":"Late payment evidence rejected"),save=el("button",decision==="approve"?"Approve payment":"Reject request",decision==="approve"?"primary":"danger");save.type="submit";form.append(el("p",decision==="approve"?"Backend rechecks state, held amount and conflicts atomically before settling.":"Rejecting releases any extra payout reserve created for this late review.","notice"),save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post(r.kind==="parking"?"parking/late/decide":"payout/late/decide",{id:r.id,action:decision,reason:reason.value});d.close();await lateReviews(o);});};});}
  }

  async function pairingHistory(o){
    const {post,action,el,container,title}=o;title.textContent="Pairing History";
    const [history,setup]=await Promise.all([post("operations/pairing-history",{offset:o.state?.offset||0}),post("operations/device-setup",{})]),requests=history.requests||[],pending=requests.filter(x=>x.state==="pending");
    container.replaceChildren();
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Pairing requests",requests.length,"Account-owned pairing codes"),
      metric(el,"Pending",pending.length,"Waiting for Agent claim"),
      metric(el,"Used",requests.filter(x=>x.state==="used").length,"Linked to devices"),
      metric(el,"Expired / revoked",requests.filter(x=>["expired","revoked"].includes(x.state)).length,"Closed requests"),
      metric(el,"Linked devices",setup.devices.length,"Scoped active links"),
      metric(el,"Pairing source",setup.pairingStatus||"unknown",setup.pairingAvailable?"Ready":"Unavailable")
    );
    container.append(metrics,el("p","Pairing history stores request state and device-link association, but never re-exposes the secret pairing code. Only pending codes owned by the current actor can be polled; revocation remains permission-scoped.","notice"));
    const rows=requests.map(r=>{const actions=el("div",undefined,"admin-row-actions");if(r.canCheck)actions.append(button(el,"Check pairing",()=>action(async()=>{await post("operations/device-setup/poll",{requestId:r.id});await pairingHistory(o);})));if(r.canRevoke)actions.append(button(el,"Revoke code",()=>action(async()=>{await post("operations/device-setup/revokeCode",{requestId:r.id});await pairingHistory(o);}),"danger"));return ["Hidden · "+r.id,(r.owner_name||r.owner_id)+" · "+(r.owner_type||"account"),new Date(r.created_at).toLocaleString("en-IN"),new Date(r.expires_at).toLocaleString("en-IN"),pill(el,r.state),r.device_ref||"—",actions];});
    container.append(panelTable(el,["Code / request","Owner / actor","Created","Expires","State","Device","Action"],rows,"Pairing audit history",requests.length+" records"+(history.hasMore?" · more available":"")));
  }

  async function directory(o,type){
    const {post,request,action,el,container,title}=o,isUser=type==="user",state=o.state||{},status=state.status||"",search=state.search||"",offset=Number(state.offset||0);
    title.textContent=isUser?"Users":"Merchants";
    const [data,access]=await Promise.all([
      post("panel/directory",{type,status:status||"all",search,offset}),
      isUser?request("business/user-access").catch(()=>({users:[]})):Promise.resolve({users:[]})
    ]);
    const accessMap=new Map((access.users||[]).map(x=>[x.id,x]));
    container.replaceChildren();
    const intro=el("p",isUser?"Admin-created User supports an Admin-set password. “Create & approve now” is represented as two logical events: account creation, then approval/commercial-policy activation. Free Setup and Unlimited Collection are managed separately.":"Admin-created Merchant supports an Admin-set password. “Create & approve now” represents creation first, then approval/commercial terms.","notice ok");intro.style.marginBottom="10px";container.append(intro);
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canCreate)tools.append(button(el,"+ Create "+(isUser?"User":"Merchant"),()=>createAccount(),"btn primary"));}
    const filters=el("div",undefined,"toolbar"),q=el("input"),st=el("select");
    q.className="control grow";q.placeholder="Search name, email or account ID…";q.value=search;
    for(const [v,t]of [["","All accounts"],["pending","Pending approval"],["approved","Approved"],["rejected","Rejected"],["suspended","Suspended"]]){const op=el("option",t);op.value=v;st.append(op);}st.className="control";st.value=status;
    filters.append(q,st);container.append(filters);
    let filterTimer;q.oninput=()=>{clearTimeout(filterTimer);filterTimer=setTimeout(()=>action(()=>directory({...o,state:{search:q.value.trim(),status:st.value,offset:0}},type)),300);};st.onchange=()=>action(()=>directory({...o,state:{search:q.value.trim(),status:st.value,offset:0}},type));
    const grid=el("div",undefined,"account-card-grid");container.append(grid);
    for(const a of data.rows){
      const accessRow=accessMap.get(a.id)||{},settings=a.settings||{},cardNode=el("article",undefined,"card account-card"),top=el("div",undefined,"account-card-top"),identity=el("div",undefined,"account-identity"),avatar=el("div",(a.name||"?").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase(),"avatar"),copy=el("div");
      copy.append(el("h3",a.name),el("p",a.email+" · "+a.id));identity.append(avatar,copy);top.append(identity,pill(el,a.status==="active"?a.approvalStatus:a.status));cardNode.append(top);
      const stats=el("div",undefined,"account-card-stats");
      const stat=(label,value)=>{const x=el("div",undefined,"fact");x.append(el("label",label),el("strong",value));return x;};
      stats.append(stat(isUser?"Available capacity":"Available balance",money(a.availableMinor||0)),stat(isUser?"Held":"Reserved / held",money(a.heldMinor||a.reservedMinor||0)),stat(isUser?"UPI accounts":"Active routes",a.routeCount||0));cardNode.append(stats);
      const terms=el("div",undefined,"summary-row");terms.append(el("span","Current terms"),el("strong",isUser?`Pay-in ${settings.payinCommission??"—"}% · Payout ${settings.payoutCommission??"—"}% · USDT ₹${settings.inrPerUsdt??"—"}`:`Pay-in ${settings.payinFee??"—"}% · Payout ${settings.payoutFee??"—"}% · Fixed ₹${settings.fixedPayoutFee??"—"} · USDT ₹${settings.inrPerUsdt??"—"}`));cardNode.append(terms);const meta=el("div",undefined,"summary-row");meta.append(el("span","Created / activity"),el("strong",(a.created_at?new Date(a.created_at).toLocaleDateString("en-IN"):"—")+" · "+(a.transactionCount||0)+" tx"));cardNode.append(meta);
      if(isUser){const badges=el("div",undefined,"access-badges");const f=el("span","Free setup "+(accessRow.free_setup?"ON":"OFF"),"access-pill"+(accessRow.free_setup?"":" off")),u=el("span","Unlimited collection "+(accessRow.unlimited_collection?"ON":"OFF"),"access-pill"+(accessRow.unlimited_collection?"":" off"));badges.append(f,u);cardNode.append(badges);}
      const actions=el("div",undefined,"account-card-actions");actions.append(button(el,"View / manage",()=>manage(a,accessRow),"btn sm"));
      if(a.approvalStatus==="pending"){if(data.actions.includes("approve"))actions.append(button(el,"Approve",()=>approve(a,true),"btn sm success"));if(data.actions.includes("reject"))actions.append(button(el,"Reject",()=>approve(a,false),"btn sm danger"));}
      if(a.approvalStatus==="approved"&&data.actions.includes("commercial.update"))actions.append(button(el,"Edit rates",()=>editTerms(a),"btn sm"));
      if(isUser&&data.actions.includes("commercial.update"))actions.append(button(el,"Collection access",()=>editAccess(a,accessRow),"btn sm"));
      if(a.status==="active"&&data.actions.includes("suspend"))actions.append(button(el,"Suspend",()=>suspend(a),"btn sm danger"));
      else if(a.status==="suspended"&&a.approvalStatus==="approved"&&data.actions.includes("reactivate"))actions.append(button(el,"Reactivate",()=>reactivate(a),"btn sm success"));
      cardNode.append(actions);grid.append(cardNode);
    }
    if(!data.rows.length)grid.append(el("div","No matching accounts.","empty card"));const pager=el("div",undefined,"admin-pagination");if(offset>0)pager.append(button(el,"Previous",()=>action(()=>directory({...o,state:{search,status,offset:Math.max(0,offset-25)}},type))));if(data.nextOffset!==null&&data.nextOffset!==undefined)pager.append(button(el,"Next",()=>action(()=>directory({...o,state:{search,status,offset:data.nextOffset}},type)),"primary"));if(pager.children.length)container.append(pager);

    async function createAccount(){
      const opts=await request("approval-options");
      dialog(el,container,"Create "+(isUser?"User":"Merchant"),(body,d)=>{
        const form=el("form",undefined,"form-grid"),name=field(el,form,"name","Name"),email=field(el,form,"email","Email","","email"),password=field(el,form,"password","Set login password","","password"),approveNow=selectField(el,form,"approveNow","Account approval",[["yes","Create & approve now"],["no","Create as pending"]],"yes");
        const controls={};
        if(isUser){
          controls.payin=field(el,form,"payin","Pay-in commission %","0.45");controls.payout=field(el,form,"payout","Payout commission %","0.30");controls.rate=field(el,form,"rate","INR per USDT","107.00");controls.address=field(el,form,"address","USDT address");controls.free=selectField(el,form,"freeSetup","Free setup",[["false","Require deposit for setup"],["true","No fee / deposit · unlimited collection"]],"false");controls.unlimited=selectField(el,form,"unlimited","Collection capacity policy",[["false","Capacity backed"],["true","Unlimited collection (capacity exempt)"]],"false");
        }else{
          controls.payin=field(el,form,"payin","Pay-in fee %",opts.defaultMerchantPayinFee||"1.2");controls.payout=field(el,form,"payout","Payout fee %",opts.defaultMerchantPayoutFee||"0.8");controls.fixed=field(el,form,"fixed","Fixed payout fee INR",opts.defaultMerchantFixedPayoutFee||"6");controls.ttl=field(el,form,"ttl","Payment link TTL sec",opts.defaultMerchantPaymentLinkTtlSeconds||"300");controls.rate=field(el,form,"rate","INR per USDT",opts.defaultMerchantInrPerUsdt||"107");
        }
        const ready=el("div",undefined,"password-ready");ready.style.marginTop="12px";ready.innerHTML=(globalThis.WPayAdminUi?.icon?.("password")||"")+" Admin sets the initial password. User/Merchant backend creation already accepts an Admin-supplied password; approval is a separate server state.";form.append(ready);
        const save=el("button","Create account","btn primary");save.type="submit";form.append(save);body.append(form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{const requestId=crypto.randomUUID(),created=await post("panel/directory/create",{requestId,type,name:name.value,email:email.value,password:password.value});password.value="";if(approveNow.value==="yes"){const settings=isUser?{payinCommission:controls.payin.value,payoutCommission:controls.payout.value,inrPerUsdt:controls.rate.value,depositNetwork:opts.depositNetworks?.[0]||"TRON-TRC20",depositAddress:controls.address.value}:{payinFee:controls.payin.value,payoutFee:controls.payout.value,fixedPayoutFee:controls.fixed.value,fixedFeeCurrency:opts.fixedFeeCurrency||"INR",paymentLinkTtlSeconds:controls.ttl.value,inrPerUsdt:controls.rate.value};await post("approval",{requestId:crypto.randomUUID(),accountId:created.id,decision:"approve",settings,reason:""});if(isUser)await post("business/user-access/update",{userId:created.id,freeSetup:controls.free.value==="true",unlimitedCollection:controls.unlimited.value==="true",reason:"Configured during Admin account creation"});}d.close();await directory(o,type);});};
      });
    }
    function manage(a,accessRow){
      dialog(el,container,(isUser?"User":"Merchant")+" · "+a.name,(body)=>{
        const layout=el("div",undefined,"grid two-col"),left=el("div"),right=el("div"),dl=el("dl",undefined,"dl"),settings=a.settings||{};
        const add=(k,v)=>{dl.append(el("dt",k),el("dd",String(v??"—")));};add("Account ID",a.id);add("Email",a.email);add("Status",a.status);add("Approval",a.approvalStatus);add("Login password",a.passwordConfigured?"Admin configured":"Not configured");add("Login readiness",a.passwordConfigured&&a.approvalStatus==="approved"&&a.status==="active"?"Direct login ready":"Login / operations limited by account state");add("Created",a.created_at?new Date(a.created_at).toLocaleString("en-IN"):"—");add("Commercial version",a.commercialVersion||"—");add(isUser?"Available capacity":"Available balance",money(a.availableMinor||0));add("Held",money(a.heldMinor||0));add("Reserved",money(a.reservedMinor||0));if(isUser){add("Pay-in commission",(settings.payinCommission??"—")+"%");add("Payout commission",(settings.payoutCommission??"—")+"%");add("USDT rate","₹"+(settings.inrPerUsdt??"—"));add("USDT address",settings.depositAddress||"—");add("Free setup",accessRow.free_setup?"Enabled":"Disabled");add("Unlimited collection",accessRow.unlimited_collection?"Enabled":"Disabled");}else{add("Pay-in fee",(settings.payinFee??"—")+"%");add("Payout fee",(settings.payoutFee??"—")+"%");add("Fixed payout fee","₹"+(settings.fixedPayoutFee??"—"));add("USDT rate","₹"+(settings.inrPerUsdt??"—"));}
        left.append(dl);right.append(el("h4","Operational links"));const summary=(label,value)=>{const row=el("div",undefined,"summary-row");row.append(el("span",label),el("strong",String(value)));return row;};right.append(summary(isUser?"UPI accounts":"Active routes",a.routeCount||0),summary("Recent transactions",a.transactionCount||0));if(isUser)right.append(summary("Linked devices",a.linkedDeviceCount||0),summary("Confirmed deposits",a.confirmedDepositCount||0));else right.append(summary("Payout requests",a.payoutRequestCount||0));layout.append(left,right);body.append(layout,el("h4","Recent transactions"));
        body.append(table(el,["Reference","Type","Amount","Status"],(a.recentActivity||[]).map(x=>[x.reference,x.type,money(x.amountMinor),pill(el,x.status)])));
        const footer=el("div",undefined,"account-card-actions");footer.style.marginTop="14px";
        if(a.approvalStatus==="pending"){if(data.actions.includes("approve"))footer.append(button(el,"Approve",()=>approve(a,true),"btn success"));if(data.actions.includes("reject"))footer.append(button(el,"Reject",()=>approve(a,false),"btn danger"));}
        if(a.approvalStatus==="approved"&&data.actions.includes("commercial.update"))footer.append(button(el,"Edit rates / fees",()=>editTerms(a),"btn"));
        if(isUser&&data.actions.includes("commercial.update"))footer.append(button(el,"Collection access",()=>editAccess(a,accessRow),"btn"));
        if(a.status==="active"&&data.actions.includes("suspend"))footer.append(button(el,"Suspend",()=>suspend(a),"btn danger"));
        body.append(footer);
      });
    }

    async function approve(a,ok){
      const opts=await request("approval-options"),settings=a.settings||{};
      dialog(el,container,(ok?"Approve ":"Reject ")+a.name,(body,d)=>{
        const notice=el("p",ok?"Approval activates the account after commercial terms are confirmed.":"Rejecting keeps the account unavailable for operations.","notice "+(ok?"ok":"danger"));body.append(notice);const form=el("form",undefined,"form-grid"),reason=field(el,form,"reason","Reason",ok?"KYC and profile reviewed":"Unable to approve"),controls={};
        if(isUser){controls.payin=field(el,form,"payin","Pay-in commission %",settings.payinCommission||"0.45");controls.payout=field(el,form,"payout","Payout commission %",settings.payoutCommission||"0.30");controls.rate=field(el,form,"rate","INR per USDT",settings.inrPerUsdt||"107.00");controls.address=field(el,form,"address","USDT address",settings.depositAddress||"");controls.free=selectField(el,form,"freeSetup","Free setup",[["false","Require deposit"],["true","No fee / deposit · unlimited collection"]],String(!!accessMap.get(a.id)?.free_setup));controls.unlimited=selectField(el,form,"unlimited","Collection capacity",[["false","Capacity backed"],["true","Unlimited collection"]],String(!!accessMap.get(a.id)?.unlimited_collection));}
        else{controls.payin=field(el,form,"payin","Pay-in fee %",settings.payinFee||opts.defaultMerchantPayinFee||"1.2");controls.payout=field(el,form,"payout","Payout fee %",settings.payoutFee||opts.defaultMerchantPayoutFee||"0.8");controls.fixed=field(el,form,"fixed","Fixed payout fee INR",settings.fixedPayoutFee||opts.defaultMerchantFixedPayoutFee||"6");controls.ttl=field(el,form,"ttl","Payment link TTL sec",String(settings.paymentLinkTtlSeconds||opts.defaultMerchantPaymentLinkTtlSeconds||"300"));controls.rate=field(el,form,"rate","INR per USDT",settings.inrPerUsdt||opts.defaultMerchantInrPerUsdt||"107");}
        const save=el("button",ok?"Approve":"Reject",ok?"btn success":"btn danger");save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{const commercial=ok?(isUser?{payinCommission:controls.payin.value,payoutCommission:controls.payout.value,inrPerUsdt:controls.rate.value,depositNetwork:opts.depositNetworks?.[0]||"TRON-TRC20",depositAddress:controls.address.value}:{payinFee:controls.payin.value,payoutFee:controls.payout.value,fixedPayoutFee:controls.fixed.value,fixedFeeCurrency:opts.fixedFeeCurrency||"INR",paymentLinkTtlSeconds:controls.ttl.value,inrPerUsdt:controls.rate.value}):null;await post("approval",{requestId:crypto.randomUUID(),accountId:a.id,decision:ok?"approve":"reject",settings:commercial,reason:ok?"":reason.value});if(ok&&isUser)await post("business/user-access/update",{userId:a.id,freeSetup:controls.free.value==="true",unlimitedCollection:controls.unlimited.value==="true",reason:"Configured during Admin approval"});d.close();await directory(o,type);});};
      });
    }
    function editTerms(a){
      const settings=a.settings||{};
      dialog(el,container,"Update commercials · "+a.name,(body,d)=>{
        const form=el("form",undefined,"form-grid"),controls={};
        if(isUser){controls.payin=field(el,form,"payin","Pay-in commission %",settings.payinCommission||"0.45");controls.payout=field(el,form,"payout","Payout commission %",settings.payoutCommission||"0.30");controls.rate=field(el,form,"rate","INR per USDT",settings.inrPerUsdt||"107.00");controls.address=field(el,form,"address","USDT address",settings.depositAddress||"");}
        else{controls.payin=field(el,form,"payin","Pay-in fee %",settings.payinFee||"1.20");controls.payout=field(el,form,"payout","Payout fee %",settings.payoutFee||"0.80");controls.fixed=field(el,form,"fixed","Fixed payout fee INR",settings.fixedPayoutFee||"6");controls.rate=field(el,form,"rate","INR per USDT",settings.inrPerUsdt||"107.00");}
        const reason=field(el,form,"reason","Change reason","Commercial terms updated"),save=el("button","Save terms","btn primary");save.type="submit";form.append(save);body.append(el("p","A live system creates a new versioned commercial snapshot and invalidates affected sessions/permissions where required.","notice"),form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{const next=isUser?{payinCommission:controls.payin.value,payoutCommission:controls.payout.value,inrPerUsdt:controls.rate.value,depositNetwork:settings.depositNetwork||"TRON-TRC20",depositAddress:controls.address.value}:{payinFee:controls.payin.value,payoutFee:controls.payout.value,fixedPayoutFee:controls.fixed.value,fixedFeeCurrency:settings.fixedFeeCurrency||"INR",paymentLinkTtlSeconds:settings.paymentLinkTtlSeconds||"300",inrPerUsdt:controls.rate.value};await post("panel/directory/update",{requestId:crypto.randomUUID(),id:a.id,action:"commercial.update",reason:reason.value,settings:next,expectedVersion:a.commercialVersion||0});d.close();await directory(o,type);});};
      });
    }
    function editAccess(a,accessRow){
      dialog(el,container,"Collection access · "+a.name,(body,d)=>{
        const form=document.createElement("form"),toggle=(labelText,description,checked)=>{const line=el("div",undefined,"toggle-line"),copy=el("div"),wrap=el("label",undefined,"switch"),input=el("input"),span=el("span");copy.append(el("strong",labelText),el("p",description));input.type="checkbox";input.checked=checked;wrap.append(input,span);line.append(copy,wrap);form.append(line);return input;},free=toggle("Free Setup","No setup fee or deposit requirement; includes unlimited collection capacity.",!!accessRow.free_setup),unlimited=toggle("Unlimited Collection","Ignore capacity-insufficient routing only; all other eligibility and UPI limits remain enforced.",!!accessRow.unlimited_collection),reason=field(el,form,"reason","Reason",accessRow.reason||"Admin collection policy update"),save=el("button","Save access","btn primary");const syncFreeSetup=()=>{if(free.checked)unlimited.checked=true;unlimited.disabled=free.checked;};free.onchange=syncFreeSetup;syncFreeSetup();save.type="submit";form.append(save);body.append(form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("business/user-access/update",{userId:a.id,freeSetup:free.checked,unlimitedCollection:unlimited.checked,reason:reason.value});d.close();await directory(o,type);});};
      });
    }

    function reactivate(a){
      dialog(el,container,"Reactivate "+a.name,(body,d)=>{const form=el("form"),reason=field(el,form,"reason","Reason","Reviewed account reactivation"),save=el("button","Reactivate","btn primary");save.type="submit";form.append(save);body.append(el("p","Existing rates, access and UPI verification are retained. Routing stays stopped until Admin starts it.","notice"),form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("panel/directory/update",{requestId:crypto.randomUUID(),id:a.id,action:"reactivate",reason:reason.value,settings:null,expectedVersion:a.commercialVersion||0});d.close();await directory(o,type);});};});
    }
    function suspend(a){
      dialog(el,container,"Suspend "+a.name,(body,d)=>{const form=el("form"),reason=field(el,form,"reason","Reason","Operational suspension"),save=el("button","Suspend","btn danger");save.type="submit";form.append(save);body.append(el("p","Suspension blocks operational use and invalidates sessions.","notice"),form);form.onsubmit=e=>{e.preventDefault();action(async()=>{await post("panel/directory/update",{requestId:crypto.randomUUID(),id:a.id,action:"suspend",reason:reason.value,settings:null,expectedVersion:a.commercialVersion||0});d.close();await directory(o,type);});};});
    }
  }

  // One page/module selection expands into every action the current Admin may delegate.
  // The server remains authoritative for restricted actions, dependencies and tenant scope.
  const employeePageLabels={overview:"Overview & analytics",users:"Users",merchants:"Merchants",bank_upi:"Bank & UPI",routing:"Assignments & routing",assignments:"User assignments",transactions:"Transactions",statement_reconciliation:"Statements & reconciliation",payin_dispute:"Pay-in disputes",deposits:"User deposits",payout_operations:"Payout management",commission_withdrawal:"Commission withdrawals",commission_hold:"Commission holds",holds:"Holds / frozen",parking:"Parking",devices:"Device setup & pairing",apk:"APK / Agent",apk_otp_events:"OTP Events",utr_center:"UTR Capture",ledger:"Ledger",reports:"Reports",api_credentials:"API credentials",webhooks:"Webhooks",api_logs:"API logs",support:"Support",notifications:"Notifications",profile:"Profile",account_security:"Account security",settings:"Settings"};
  function employeePageAccess(data,existing=[]){
    const required=new Set(data.requiredPermissions||[]),allowed=new Map((data.permissions||[]).map(p=>[p.id,p])),groups=new Map();
    const catalog=(data.permissionGroups||[]).flatMap(g=>g.permissions.map(p=>({...p,groupLabel:g.label})));
    const listed=new Set(catalog.map(p=>p.id));
    for(const p of [...catalog,...[...allowed.values()].filter(p=>!listed.has(p.id))]){
      const module=p.module||p.id.split('.')[0];
      if(!groups.has(module))groups.set(module,{id:module,label:employeePageLabels[module]||module.replaceAll('_',' '),group:p.groupLabel||"Page access",permissions:[],restricted:[]});
      const page=groups.get(module);
      if(allowed.has(p.id)&&p.selectable!==false&&!p.restricted)page.permissions.push(p.id);else page.restricted.push(p.id);
    }
    // Required account access must never disappear even with a partial catalog response.
    for(const id of required)if(!allowed.has(id))throw Error("Required account access is unavailable. Refresh before editing Employee access.");
    const selected=new Set(existing.length?existing:required);
    for(const id of selected)if(!allowed.has(id))throw Error("This Employee has access outside your delegable scope. Ask the supervising Admin to edit it.");
    function expand(ids){const out=new Set(ids),queue=[...ids];while(queue.length){const id=queue.shift(),p=allowed.get(id);if(!p)throw Error("A required page permission is not available from this Admin");for(const dep of p.dependencies||[]){if(!allowed.has(dep))throw Error("A required page permission is not available from this Admin");if(!out.has(dep)){out.add(dep);queue.push(dep);}}}return [...out].sort();}
    const pages=[...groups.values()].map(page=>{
      let unavailable=!page.permissions.length;try{expand(page.permissions);}catch{unavailable=true;}
      const assigned=page.permissions.filter(id=>selected.has(id)),optional=page.permissions.filter(id=>!required.has(id));
      return {...page,checked:page.permissions.length>0&&assigned.length===page.permissions.length,partial:assigned.length>0&&assigned.length<page.permissions.length,mandatory:optional.length===0&&page.permissions.some(id=>required.has(id)),unavailable,changed:false};
    });
    function selection(){const out=new Set(required);for(const page of pages){const chosen=page.changed?(page.checked?page.permissions:[]):page.permissions.filter(id=>selected.has(id));for(const id of chosen)out.add(id);}return expand(out);}
    return {pages,selection};
  }

  async function employees(o){
    const {post,action,el,container,title}=o;title.textContent="Employees";
    const data=await post("operations/employees",{offset:0,limit:100}),employees=data.employees||[],active=employees.filter(e=>e.status==="active").length,suspended=employees.filter(e=>e.status==="suspended").length;
    container.replaceChildren();
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();if(data.canCreate)tools.append(button(el,"+ Create employee",()=>editor(null),"primary"));}
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Employees",employees.length,"Scoped operational staff"),
      metric(el,"Active",active,"Can sign in subject to security policy"),
      metric(el,"Suspended",suspended,"Operational access blocked"),
      metric(el,"Delegable permissions",(data.permissions||[]).length,"Available from current Admin scope"),
      metric(el,"Required self permissions",(data.requiredPermissions||[]).length,"Always retained"),
      metric(el,"Can update",data.canUpdate?"Yes":"No","Permission-enforced")
    );
    container.append(metrics,el("p","Employee permissions are tenant-scoped and cannot exceed the current Admin's grants. Required self/account-security permissions stay enabled. Saving access, status or password changes invalidates existing Employee sessions. Employee MFA remains backend-required.","notice"));
    const rows=employees.map(e=>[
      e.name+" · "+e.email,
      pill(el,e.status),
      (e.admin_scope?.tenantIds||[]).join(", "),
      String(e.permissions.length)+" permissions",
      e.permission_version,
      data.canUpdate?button(el,"Edit access",()=>editor(e)):"Read only"
    ]);
    container.append(panelTable(el,["Employee","Status","Tenant scope","Permission access","Version","Action"],rows,"Employee access",employees.length+" records"+(data.hasMore?" · more available":"")));

    function editor(emp){
      dialog(el,container,emp?"Edit Employee · "+emp.name:"Create Employee",(body,d)=>{
        const form=el("form",undefined,"form-grid"),name=field(el,form,"name","Name",emp?.name||""),email=field(el,form,"email","Email",emp?.email||"","email"),password=field(el,form,"password",emp?"Reset / set login password":"Login password (optional)","","password"),status=selectField(el,form,"status","Status",[["active","Active"],["suspended","Suspended"],["disabled","Disabled"]],emp?.status||"active");
        if(!emp)form.append(el("p","Leave password blank to generate a one-time temporary credential valid for 24 hours. If you set a password now, no temporary password is created.","notice full"));
        const tenantWrap=el("div",undefined,"permission-group full");tenantWrap.append(el("h4","Operational tenants"));const tenantChecks=[];for(const t of data.tenantIds){const l=el("label",undefined,"permission-option"),i=el("input");i.type="checkbox";i.checked=emp?(emp.admin_scope?.tenantIds||[]).includes(t):data.tenantIds.length===1;l.append(i,el("span",t));tenantWrap.append(l);tenantChecks.push([t,i]);}form.append(tenantWrap);
        const access=employeePageAccess(data,emp?.permissions||[]),matrix=el("div",undefined,"permission-matrix full"),sections=new Map();
        for(const page of access.pages){
          if(!sections.has(page.group)){const section=el("section",undefined,"permission-group-v5");section.append(el("h4",page.group));sections.set(page.group,section);matrix.append(section);}
          const label=el("label",undefined,"permission-option permission-page"+(page.unavailable?" restricted":"")),check=el("input"),copy=el("span");
          check.type="checkbox";check.dataset.pageAccess=page.id;check.checked=page.checked;check.indeterminate=page.partial;check.disabled=page.unavailable||page.mandatory;
          const help=page.unavailable?"Not available for Employee delegation":page.mandatory?"Required account page · always available":page.partial?"Existing limited access · select to enable all available page actions":page.restricted.length?"All delegable page actions · restricted Admin-only actions excluded":"Full page access · all available actions included";
          copy.append(document.createTextNode(page.label),el("small",help));label.append(check,copy);sections.get(page.group).append(label);
          check.onchange=()=>{page.checked=check.checked;page.changed=true;check.indeterminate=false;};
        }
        form.append(matrix,el("p","Select a page once to include its available actions and required dependencies. Related screens sharing one backend access scope are grouped together. Existing limited access is preserved until you change that page. Admin-only actions remain restricted.","notice full"));
        const save=el("button",emp?"Save access":"Create Employee","primary");save.type="submit";form.append(save);body.append(form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{
          const permissions=access.selection(),tenantIds=tenantChecks.filter(([,i])=>i.checked).map(([id])=>id);
          if(!tenantIds.length)throw Error("Select at least one operational tenant");
          const payload={name:name.value,email:email.value,permissions,tenantIds,...(emp?{id:emp.id,status:status.value}:{}),...(password.value?{password:password.value}:{})};
          const result=await post(emp?"operations/employee/update":"operations/employee/create",payload);password.value="";
          if(!emp&&result.oneTimePassword){
            body.replaceChildren(
              el("h3","Employee created"),
              el("p","Save this one-time password now. It is shown only once and expires in 24 hours.","notice"),
              el("code",result.oneTimePassword,"code-secret"),
              el("p","Login: "+(result.loginPath||"/employee")+" · MFA required: "+String(result.mfaRequired===true),"small muted")
            );
          }else{d.close();await employees(o);}
        });};
      });
    }
  }

  async function admins(o){
    const {post,action,el,container,title}=o;title.textContent="Admin authority";
    const data=await post("operations/admins",{offset:0,limit:100}),admins=data.admins||[],active=admins.filter(a=>a.status==="active").length;
    container.replaceChildren();
    const tools=document.getElementById("page-tools");if(tools){tools.replaceChildren();tools.append(button(el,"+ Create admin",()=>editor(null),"primary"));}
    const metrics=el("div",undefined,"grid analytics-metrics");metrics.append(
      metric(el,"Scoped Admins",admins.length,"Tenant-scoped Admin accounts"),
      metric(el,"Active",active,"Enabled Admin authority"),
      metric(el,"Available permissions",(data.permissions||[]).length,"Grantable from platform scope"),
      metric(el,"Required self permissions",(data.requiredPermissions||[]).length,"Cannot be removed"),
      metric(el,"Platform grants","Disabled","Tenant-scoped Admins only"),
      metric(el,"Security policy edit","Disabled","Not delegated here")
    );
    container.append(metrics,el("p","Only Super Admin platform authority can create or modify scoped Admin authority. Tenant-scoped Admins never inherit platform authority. New Admins receive a one-time temporary credential and must reset it on first sign-in; current backend reports MFA not required for this Admin creation flow.","notice"));
    const rows=admins.map(a=>[
      a.name+" · "+a.email,
      pill(el,a.status),
      (a.admin_scope?.tenantIds||[]).join(", "),
      String(a.permissions.length)+" permissions",
      a.permission_version,
      button(el,"Edit access",()=>editor(a))
    ]);
    container.append(panelTable(el,["Admin","Status","Tenant scope","Delegated permissions","Version","Action"],rows,"Admin authority",admins.length+" records"+(data.hasMore?" · more available":"")));

    function editor(admin){
      dialog(el,container,admin?"Edit Admin authority · "+admin.name:"Create tenant-scoped Admin",(body,d)=>{
        const form=el("form",undefined,"form-grid"),name=field(el,form,"name","Name",admin?.name||""),email=field(el,form,"email","Email",admin?.email||"","email"),status=selectField(el,form,"status","Status",[["active","Active"],["suspended","Suspended"],["disabled","Disabled"]],admin?.status||"active");if(admin){name.disabled=true;email.disabled=true;}
        const tenantWrap=el("div",undefined,"permission-group full");tenantWrap.append(el("h4","Operational tenants"));const tenants=[];for(const t of data.tenantIds){const l=el("label",undefined,"permission-option"),i=el("input");i.type="checkbox";i.checked=admin?(admin.admin_scope?.tenantIds||[]).includes(t):data.tenantIds.length===1;l.append(i,el("span",t));tenantWrap.append(l);tenants.push([t,i]);}form.append(tenantWrap);
        const group=el("div",undefined,"permission-group full"),checks=[];group.append(el("h4","Explicit permissions"));for(const p of data.permissions){const l=el("label",undefined,"permission-option"),i=el("input"),deps=(p.dependencies||[]).length?" · requires "+p.dependencies.join(", "):"";i.type="checkbox";i.checked=(admin?.permissions||data.requiredPermissions).includes(p.id);i.disabled=data.requiredPermissions.includes(p.id);l.append(i,el("span",p.label+deps));group.append(l);checks.push([p.id,i]);}form.append(group,el("p","Required profile/account-security permissions cannot be removed. Changing status, tenant scope or permissions invalidates existing Admin sessions.","notice"));
        const save=el("button",admin?"Save Admin authority":"Create Admin","primary");save.type="submit";form.append(save);body.append(form);
        form.onsubmit=e=>{e.preventDefault();action(async()=>{
          const tenantIds=tenants.filter(([,i])=>i.checked).map(([id])=>id);if(!tenantIds.length)throw Error("Select at least one operational tenant");
          const payload={requestId:crypto.randomUUID(),permissions:checks.filter(([,i])=>i.checked).map(([id])=>id),tenantIds,...(admin?{id:admin.id,status:status.value,expectedVersion:admin.permission_version}:{name:name.value,email:email.value})},result=await post(admin?"operations/admin/update":"operations/admin/create",payload);
          if(!admin&&result.oneTimePassword){body.replaceChildren(
            el("h3","Admin created"),
            el("p","Save this one-time password privately. It is shown only once and expires at the time below.","notice"),
            el("code",result.oneTimePassword,"code-secret"),
            el("p","Expires: "+(result.temporaryExpiresAt?new Date(result.temporaryExpiresAt).toLocaleString("en-IN"):"24 hours")+" · Login: "+(result.loginPath||"/admin")+" · MFA required: "+String(result.mfaRequired===true),"small muted")
          );}else{d.close();await admins(o);}
        });};
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
  root.WPayAdminV5Pages={render,employeePageAccess};
})(globalThis);
