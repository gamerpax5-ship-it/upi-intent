
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

const ICONS={
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 chart:'<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/>',
 bank:'<path d="M3 10h18M5 10v8m5-8v8m4-8v8m5-8v8M2 21h20M12 3l9 5H3l9-5Z"/>',
 upi:'<path d="m5 7 4 5-4 5m7-10 4 5-4 5m7-10 2 5-2 5"/>',
 shield:'<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/>',
 file:'<path d="M6 3h9l3 3v15H6V3Zm9 0v4h4M9 12h6m-6 4h6"/>',
 wallet:'<path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12"/><path d="M16 11h6v4h-6a2 2 0 0 1 0-4Z"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-7 9 7 4 7-4m-14 5 7 4 7-4"/>',
 coins:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
 withdraw:'<path d="M12 3v13m0 0 5-5m-5 5-5-5M5 21h14"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 history:'<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8"/><path d="M4 3v5h5M12 8v5l3 2"/>',
 payout:'<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8m-8 4h5"/>',
 transactions:'<path d="M4 7h16m-13-3L4 7l3 3m10 4 3 3-3 3M4 17h16"/>',
 parking:'<path d="M7 21V3h7a5 5 0 0 1 0 10H7m0 0h7"/>',
 phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4m-3 14h2"/>',
 device:'<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M9 20h6m-3-4v4"/>',
 qr:'<path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
 trade:'<path d="m5 8 4-4 4 4m-4-4v12m10 0-4 4-4-4m4 4V8"/>',
 guide:'<circle cx="12" cy="12" r="9"/><path d="M12 10v6m0-9h.01"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 support:'<path d="M4 5h16v12H9l-5 4V5Z"/><path d="M8 9h8m-8 4h5"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.3 3.1h5l.3-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4L18.9 13a7 7 0 0 0 .1-1Z"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
 send:'<path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 refresh:'<path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 11m16 2-2 4a7 7 0 0 1-12.5.5"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 review:'<path d="M9 4h6m-8 3h10a2 2 0 0 1 2 2v11H5V9a2 2 0 0 1 2-2Zm2 5h6m-6 4h4"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
 moon:'<path d="M20.5 15.5A8 8 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 logout:'<path d="M10 17l5-5-5-5m5 5H3m12-9h5v18h-5"/>'
};
const PAGE_ICON={overview:'dashboard',analytics:'chart','bank-upi':'bank','upi-analytics':'chart','upi-verification':'shield',statements:'file','usdt-deposit':'wallet',commission:'coins',withdraw:'withdraw',holds:'lock',payins:'history',payouts:'payout',transactions:'transactions','parking-beneficiaries':'user','parking-orders':'parking',agent:'phone',activation:'qr',devices:'device',otp:'support',trade:'trade',guide:'guide',notifications:'bell',support:'support',security:'shield',settings:'settings',profile:'user'};
function svgIcon(name,cls=''){return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||ICONS.dashboard}</svg>`}
function hydrateIcons(){
  $$('.nav-item').forEach(el=>{const slot=el.querySelector('.ico');if(slot)slot.innerHTML=svgIcon(PAGE_ICON[el.dataset.page]||'dashboard')});
  $$('[data-icon]').forEach(el=>el.innerHTML=svgIcon(el.dataset.icon));
}

const DEMO={CLAIM_MS:10*60*1000,COOLDOWN_MS:5*60*1000};
const store={
 banks:[
  {id:"BK1",holder:"Rahul Singh",bank:"HDFC Bank",account:"5012342384",ifsc:"HDFC0001842",upi:"rahulstore@upi",bankMobile:"+91 98••• 12044",apkMobile:"+91 97••• 48210",perTxn:100000,daily:500000,notes:"Primary collections",version:3,status:"Running",verified:true},
  {id:"BK2",holder:"Rahul Singh",bank:"Axis Bank",account:"9123409041",ifsc:"UTIB0000612",upi:"rahul.pay@upi",bankMobile:"+91 99••• 41120",apkMobile:"+91 97••• 48210",perTxn:75000,daily:300000,notes:"Secondary UPI",version:1,status:"Verification required",verified:false}
 ],
 upiStats:{
  "rahulstore@upi":{bank:"HDFC Bank",running:true,success:482,pending:11,failed:9,volume:624500,series:[97,98,96,99,98,97,98,99,98,98]},
  "rahul.pay@upi":{bank:"Axis Bank",running:false,success:74,pending:8,failed:6,volume:98100,series:[88,90,91,89,92,91,90,92,93,92]}
 },
 payins:[
  {ref:"WP8J4M2X9Q",merchant:"Nova Retail",upi:"rahulstore@upi",amount:"₹12,500",status:"Successful",evidence:"UTR verified",commission:"+₹125",time:"2 min ago"},
  {ref:"WPT7K1P5LA",merchant:"Urban Cart",upi:"rahulstore@upi",amount:"₹7,250",status:"Pending",evidence:"Awaiting verification",commission:"—",time:"18 min ago"},
  {ref:"WPH4Q9C6MX",merchant:"Orbit Mart",upi:"rahulstore@upi",amount:"₹18,900",status:"Recovered",evidence:"Statement recovery",commission:"₹0",time:"42 min ago"},
  {ref:"WP3P8V2NKA",merchant:"Mono Store",upi:"rahulstore@upi",amount:"₹5,600",status:"Successful",evidence:"Verified payment",commission:"+₹56",time:"1 hr ago"}
 ],
 payouts:[
  {id:"PO-4402",source:"Merchant",createdBy:"Nova Retail",amount:18500,holder:"Aman Verma",bank:"ICICI Bank",account:"0847012218",ifsc:"ICIC0000847",upi:"amanverma@upi",commission:48,state:"available"},
  {id:"PO-4408",source:"Admin",createdBy:"WPay Admin",amount:27000,holder:"Neha Traders",bank:"State Bank of India",account:"7210451403",ifsc:"SBIN0007210",upi:"nehatraders@upi",commission:72,state:"available"},
  {id:"PO-4413",source:"Employee",createdBy:"Ops Employee",amount:9600,holder:"Ravi Kumar",bank:"HDFC Bank",account:"0114426381",ifsc:"HDFC0000114",upi:"ravik@upi",commission:26,state:"available"}
 ],
 activePayout:null,
 cooldowns:{},
 beneficiaries:[
  {id:"BEN-101",name:"Aman ICICI",holder:"Aman Verma",bank:"ICICI Bank",ifsc:"ICIC0000847",account:"0847012218",upi:"amanverma@upi",createdBy:"Admin",confirmed:false},
  {id:"BEN-102",name:"Neha SBI",holder:"Neha Traders",bank:"State Bank of India",ifsc:"SBIN0007210",account:"7210451403",upi:"nehatraders@upi",createdBy:"Employee",confirmed:true},
  {id:"BEN-103",name:"Ravi HDFC",holder:"Ravi Kumar",bank:"HDFC Bank",ifsc:"HDFC0000114",account:"0114426381",upi:"ravik@upi",createdBy:"Employee",confirmed:false}
 ],
 parkingOrders:[
  {id:"PK-5001",beneficiaryId:"BEN-101",source:"Admin",createdBy:"WPay Admin",total:500000,remaining:500000,minTxn:100000,status:"available"},
  {id:"PK-5002",beneficiaryId:"BEN-102",source:"Employee",createdBy:"Ops Employee",total:300000,remaining:300000,minTxn:50000,status:"available"},
  {id:"PK-5003",beneficiaryId:"BEN-103",source:"Admin",createdBy:"WPay Admin",total:800000,remaining:800000,minTxn:200000,status:"available"}
 ],
 parkingLocks:{},
 activeParking:null,
 parkingReviews:[],
 withdrawals:[{id:"WD-5512",type:"INR",amount:"₹5,000",destination:"HDFC ••••2384",status:"Completed"}],
 commissions:[
  {date:"20 Sep",kind:"payin",source:"Pay-in",ref:"WP8J4M2X9Q",amount:"+₹125",status:"Posted"},
  {date:"20 Sep",kind:"payout",source:"Payout",ref:"PO-4388",amount:"+₹48",status:"Posted"},
  {date:"19 Sep",kind:"payin",source:"Recovered pay-in",ref:"WPH4Q9C6MX",amount:"₹0",status:"Zero commission"},
  {date:"19 Sep",kind:"payout",source:"Payout",ref:"PO-4322",amount:"+₹62",status:"Posted"}
 ],
 tx:[
  ["20 Sep 16:42","Pay-in","WP8J4M2X9Q","₹12,500","Successful"],
  ["20 Sep 15:30","Payout","PO-4388","₹9,500","Completed"],
  ["19 Sep 18:10","USDT Deposit","DEP-2041","2,500 USDT","Confirmed"],
  ["18 Sep 14:20","Withdrawal","WD-5512","₹5,000","Completed"]
 ],
 tickets:[{id:"SP-1042",subject:"UPI verification help",status:"Resolved",messages:[["You","My Axis UPI is still waiting for verification."],["Admin","We checked the approved version. Please run verification again from the Verification page."],["System","Ticket resolved."]]}]
};
function esc(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}
function money(n){return "₹"+Number(n).toLocaleString("en-IN")}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove("show"),1900)}
function modal(title,subtitle,body){$("#modalTitle").textContent=title;$("#modalSubtitle").textContent=subtitle||"";$("#modalBody").innerHTML=body;$("#modalBackdrop").classList.add("open")}
function closeModal(){$("#modalBackdrop").classList.remove("open")}$("#modalClose").onclick=closeModal;$("#modalBackdrop").onclick=e=>{if(e.target.id==="modalBackdrop")closeModal()}
function pill(s){const c=/running|verified|completed|confirmed|resolved|accepted|posted|successful|added/i.test(s)?"ok":/failed|rejected|revoked|expired/i.test(s)?"bad":/available|new|info/i.test(s)?"info":"pending";return `<span class="pill ${c}">${esc(s)}</span>`}
function maskAccount(a){return "••••"+String(a).slice(-4)}
function go(page){$$(".page").forEach(p=>p.classList.remove("active"));$("#page-"+page)?.classList.add("active");$$(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.page===page));history.replaceState(null,"","#"+page);$("#sidebar").classList.remove("open");$("#overlay").classList.remove("show");scrollTo({top:0,behavior:"smooth"});if(page==="payouts")renderPayouts();if(page==="parking-beneficiaries")renderParkingBeneficiaries();if(page==="parking-orders")renderParkingOrders();if(page==="upi-analytics")renderUpiAnalytics()}
$$("[data-page]").forEach(n=>n.onclick=()=>go(n.dataset.page));$$("[data-go]").forEach(x=>x.onclick=()=>go(x.dataset.go));
$("#menuBtn").onclick=()=>{$("#sidebar").classList.add("open");$("#overlay").classList.add("show")};$("#overlay").onclick=()=>{$("#sidebar").classList.remove("open");$("#overlay").classList.remove("show")};
function updateThemeIcon(){
 const isLight=document.documentElement.classList.contains("light");
 const icon=document.getElementById("themeIcon");
 if(icon){icon.dataset.icon=isLight?"moon":"sun";icon.innerHTML=svgIcon(isLight?"moon":"sun")}
 const btn=document.getElementById("themeBtn");
 if(btn){btn.title=isLight?"Switch to dark theme":"Switch to light theme";btn.setAttribute("aria-label",btn.title)}
}
const savedTheme=localStorage.getItem("wpay-demo-theme");
if(savedTheme==="light")document.documentElement.classList.add("light");
if(savedTheme==="dark")document.documentElement.classList.remove("light");
$("#themeBtn").onclick=()=>{
 document.documentElement.classList.toggle("light");
 localStorage.setItem("wpay-demo-theme",document.documentElement.classList.contains("light")?"light":"dark");
 updateThemeIcon();
 toast(document.documentElement.classList.contains("light")?"Light theme":"Dark theme");
};
updateThemeIcon();

/* Login */
$("#togglePassword").onclick=()=>{const i=$("#loginPassword");i.type=i.type==="password"?"text":"password";$("#togglePassword").textContent=i.type==="password"?"Show":"Hide"};
function completeLogin(){
 sessionStorage.setItem("wpay-final-demo","1");
 $("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");
 renderAll();drawAll();hydrateIcons();hydrateIcons();
}
function openMfaStep(){
 modal("Authenticator verification","Enter your WPay authenticator code",`<form class="form-grid" id="loginMfaStep"><div class="field"><label>6-digit authenticator code</label><input class="control mono" id="loginMfa" inputmode="numeric" maxlength="6" value="123456" required></div><button class="btn primary">Verify & continue</button></form>`);
 $("#loginMfaStep").onsubmit=e=>{e.preventDefault();if($("#loginMfa").value!=="123456"){toast("Use prototype code 123456");return}closeModal();completeLogin()};
}
$("#loginForm").onsubmit=e=>{
 e.preventDefault();
 if($("#loginEmail").value!=="user@wpay.demo"||$("#loginPassword").value!=="WPay@1234"){toast("Use the prototype email/password shown below");return}
 openMfaStep();
};
$("#authenticatorLogin").onclick=()=>{if($("#loginEmail").value!=="user@wpay.demo"||$("#loginPassword").value!=="WPay@1234"){toast("Enter the prototype email/password first");return}openMfaStep()};
$("#forgotPassword").onclick=e=>{e.preventDefault();modal("Password recovery","Prototype only",`<div class="notice">Production recovery must use the supported secure account-recovery flow. No credential is reset by this standalone HTML.</div>`)};
$("#createAccountBtn").onclick=()=>{modal("Create User account","Prototype registration",`<form class="form-grid" id="createAccountForm"><div class="field"><label>Full name</label><input class="control" id="regName" required></div><div class="field"><label>Email</label><input class="control" id="regEmail" type="email" required></div><div class="field"><label>Password</label><input class="control" id="regPassword" type="password" placeholder="8+ upper/lower/number/symbol" required></div><button class="btn primary">Submit application</button></form>`);$("#createAccountForm").onsubmit=e=>{e.preventDefault();if(!validPassword($("#regPassword").value)){toast("Password needs upper, lower, number and symbol");return}closeModal();toast("Prototype User application submitted for Admin approval")}};
$("#logoutBtn").onclick=()=>{sessionStorage.removeItem("wpay-final-demo");$("#appView").classList.add("hidden");$("#loginView").classList.remove("hidden");location.hash=""};
if(sessionStorage.getItem("wpay-final-demo")==="1"){$("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden")}

/* Charts */
const series={7:[64,68,66,73,77,81,86],30:[49,52,51,55,59,61,58,63,66,70,68,72,75,73,78,81,80,84,83,87,90,88,91,92,89,93,94,92,95,96],90:Array.from({length:90},(_,i)=>Math.min(99,43+i*.58+Math.sin(i/4)*3))};
function draw(svgId,data){const svg=$("#"+svgId);if(!svg)return;const W=760,H=290,p={l:36,r:16,t:15,b:30},min=Math.min(35,Math.floor(Math.min(...data)/10)*10-5),max=100,x=i=>p.l+(i/(data.length-1||1))*(W-p.l-p.r),y=v=>p.t+(1-(v-min)/(max-min))*(H-p.t-p.b);const pts=data.map((v,i)=>[x(i),y(v)]);let d=`M ${pts[0][0]} ${pts[0][1]}`;for(let i=1;i<pts.length;i++)d+=` L ${pts[i][0]} ${pts[i][1]}`;let a=d+` L ${pts.at(-1)[0]} ${H-p.b} L ${pts[0][0]} ${H-p.b} Z`;const grid=[40,55,70,85,100].map(v=>`<line class="gridline" x1="${p.l}" y1="${y(v)}" x2="${W-p.r}" y2="${y(v)}"/><text class="axis" x="2" y="${y(v)+4}">${v}</text>`).join("");svg.innerHTML=`<defs><linearGradient id="grad" x1="0" x2="1"><stop offset="0" stop-color="#835eff"/><stop offset="1" stop-color="#5f8fff"/></linearGradient><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".24"/><stop offset="1" stop-color="#67e7ae" stop-opacity="0"/></linearGradient></defs>${grid}<path class="area" d="${a}"/><path class="line" d="${d}"/>${pts.filter((_,i)=>data.length<=10||i===data.length-1).map(p=>`<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="4"/>`).join("")}`}
$$("[data-range]").forEach(b=>b.onclick=()=>{$$("[data-range]").forEach(x=>x.classList.remove("active"));b.classList.add("active");draw("overviewChart",series[+b.dataset.range])});

/* Overview */
function renderOverview(){
 const running=store.banks.filter(b=>b.status==="Running");
 $("#overviewUpiHealth").innerHTML=running.map(b=>{const s=store.upiStats[b.upi];const total=s.success+s.pending+s.failed,rate=((s.success/total)*100).toFixed(1);return `<div class="item"><div class="item-main"><strong>${esc(b.upi)}</strong><small>${esc(b.bank)} · ${total} tx · ${money(s.volume)}</small></div><span class="pill ok">${rate}%</span></div>`}).join("")||`<div class="empty"><strong>No running UPI</strong></div>`;
 $("#overviewPayouts").innerHTML=store.payouts.filter(p=>p.state==="available"&&!store.cooldowns[p.id]).slice(0,2).map(p=>`<div class="item"><div class="item-main"><strong>${p.id} · ${money(p.amount)}</strong><small>${p.source} · ${p.createdBy}</small></div><span class="pill info">Available</span></div>`).join("")||`<div class="empty"><strong>No payout orders</strong></div>`;
 $("#recentPayins").innerHTML=store.payins.slice(0,4).map(x=>`<tr><td>${x.ref}<small>${x.evidence}</small></td><td>${x.merchant}</td><td>${pill(x.status)}</td><td>${x.amount}</td><td class="${x.commission.startsWith("+")?"green":""}">${x.commission}</td></tr>`).join("")
}

/* Bank */
function renderBanks(){
 $("#bankCards").innerHTML=store.banks.map((b,i)=>`<div class="card pad">
   <div class="card-head"><div style="display:flex;gap:11px;align-items:center"><div class="summary-icon">${svgIcon('bank')}</div><div><span class="account-badge">${i===0?'PRIMARY ACCOUNT':'SECONDARY ACCOUNT'}</span><h2 style="margin-top:8px">${esc(b.bank)}</h2><p>${esc(b.holder)} · Version ${b.version}</p></div></div>${pill(b.status)}</div>
   <div class="facts">
    <div class="fact"><label>Account Number</label><strong class="mono">${maskAccount(b.account)}</strong></div>
    <div class="fact"><label>IFSC Code</label><strong class="mono">${esc(b.ifsc)}</strong></div>
    <div class="fact"><label>UPI ID</label><strong>${esc(b.upi)}</strong></div>
    <div class="fact"><label>Account Holder</label><strong>${esc(b.holder)}</strong></div>
    <div class="fact"><label>Bank Mobile</label><strong>${esc(b.bankMobile)}</strong></div>
    <div class="fact"><label>APK Mobile</label><strong>${esc(b.apkMobile)}</strong></div>
    <div class="fact"><label>Per Transaction Limit</label><strong>${money(b.perTxn)}</strong></div>
    <div class="fact"><label>Daily Limit</label><strong>${money(b.daily)}</strong></div>
   </div>
   <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:13px"><button class="btn sm ghost" data-go="statements">View Statement</button><button class="btn sm ghost edit-bank" data-i="${i}">Edit Details</button><button class="btn sm ghost manage-limit" data-i="${i}">Manage Limits</button><button class="btn sm ${b.status==="Running"?"":"primary"} toggle-bank" data-i="${i}">${b.status==="Running"?"Stop Routing":"Start Routing"}</button></div>
 </div>`).join("")+`<div class="card pad add-bank-card"><div><div class="add-bank-icon">${svgIcon('bank')}</div><h2>Add Bank Account</h2><p class="muted">Link another receiving bank and UPI configuration.</p><button class="btn primary" id="addBankInline">${svgIcon('plus')} Add New Bank Account</button></div></div>`;
 $$(".edit-bank").forEach(x=>x.onclick=()=>openBankEdit(+x.dataset.i));
 $$(".manage-limit").forEach(x=>x.onclick=()=>{const b=store.banks[+x.dataset.i];modal("Manage limits",b.bank,`<form class="form-grid" id="limitForm"><div class="field"><label>Per transaction limit</label><input class="control" id="newPerTxn" type="number" value="${b.perTxn}"></div><div class="field"><label>Daily limit</label><input class="control" id="newDaily" type="number" value="${b.daily}"></div><button class="btn primary">Submit new limits for review</button></form>`);$("#limitForm").onsubmit=e=>{e.preventDefault();b.perTxn=+$("#newPerTxn").value;b.daily=+$("#newDaily").value;b.version++;b.status="Pending review";closeModal();renderBanks();toast("Limit change submitted for review")}}); 
 $$(".toggle-bank").forEach(x=>x.onclick=()=>{const b=store.banks[+x.dataset.i];if(!b.verified&&b.status!=="Running"){toast("Complete UPI verification before starting routing");return}b.status=b.status==="Running"?"Stopped":"Running";renderBanks();renderOverview();renderUpiAnalytics();toast("Routing status updated in prototype")});
 const inline=$("#addBankInline");if(inline)inline.onclick=()=>$("#openAddBank").click();
 hydrateIcons();
}
function bankFormBody(b={}){return `<form class="form-grid" id="bankForm">
 <div class="form-row"><div class="field"><label>Account holder name</label><input class="control" id="bfHolder" value="${esc(b.holder||"")}" required></div><div class="field"><label>Bank name</label><input class="control" id="bfBank" value="${esc(b.bank||"")}" required></div></div>
 <div class="form-row"><div class="field"><label>Account number</label><input class="control mono" id="bfAccount" value="${esc(b.account||"")}" required></div><div class="field"><label>IFSC</label><input class="control mono" id="bfIfsc" value="${esc(b.ifsc||"")}" required></div></div>
 <div class="field"><label>UPI ID</label><input class="control" id="bfUpi" value="${esc(b.upi||"")}" required></div>
 <div class="form-row"><div class="field"><label>Bank registered mobile</label><input class="control" id="bfBankMobile" value="${esc(b.bankMobile||"")}" required></div><div class="field"><label>APK mobile number</label><input class="control" id="bfApkMobile" value="${esc(b.apkMobile||"")}" required></div></div>
 <div class="form-row"><div class="field"><label>Per transaction limit (INR)</label><input class="control" id="bfPerTxn" type="number" min="1" value="${b.perTxn||50000}" required></div><div class="field"><label>Daily limit (INR)</label><input class="control" id="bfDaily" type="number" min="1" value="${b.daily||250000}" required></div></div>
 <div class="field"><label>Other details / notes</label><textarea class="control" id="bfNotes">${esc(b.notes||"")}</textarea></div>
 <button class="btn primary">Submit for Admin review</button></form>`}
$("#openAddBank").onclick=()=>{modal("Add Bank / UPI","Complete receiving-account details",bankFormBody());$("#bankForm").onsubmit=e=>{e.preventDefault();const obj={id:"BK"+Date.now(),holder:$("#bfHolder").value,bank:$("#bfBank").value,account:$("#bfAccount").value,ifsc:$("#bfIfsc").value.toUpperCase(),upi:$("#bfUpi").value,bankMobile:$("#bfBankMobile").value,apkMobile:$("#bfApkMobile").value,perTxn:+$("#bfPerTxn").value,daily:+$("#bfDaily").value,notes:$("#bfNotes").value,version:1,status:"Pending review",verified:false};store.banks.push(obj);store.upiStats[obj.upi]={bank:obj.bank,running:false,success:0,pending:0,failed:0,volume:0,series:[0,0,0,0,0,0,0,0,0,0]};renderBanks();renderUpiAnalytics();closeModal();toast("Bank / UPI submitted for review")}}
function openBankEdit(i){const b=store.banks[i];modal("Edit Bank / UPI","Changes create a new pending version",bankFormBody(b));$("#bankForm").onsubmit=e=>{e.preventDefault();const oldUpi=b.upi;b.holder=$("#bfHolder").value;b.bank=$("#bfBank").value;b.account=$("#bfAccount").value;b.ifsc=$("#bfIfsc").value.toUpperCase();b.upi=$("#bfUpi").value;b.bankMobile=$("#bfBankMobile").value;b.apkMobile=$("#bfApkMobile").value;b.perTxn=+$("#bfPerTxn").value;b.daily=+$("#bfDaily").value;b.notes=$("#bfNotes").value;b.version++;b.status="Pending review";b.verified=false;if(oldUpi!==b.upi){store.upiStats[b.upi]=store.upiStats[oldUpi]||{bank:b.bank,running:false,success:0,pending:0,failed:0,volume:0,series:[0,0,0,0,0,0,0,0,0,0]};delete store.upiStats[oldUpi]}renderBanks();renderUpiAnalytics();closeModal();toast("New version submitted for review")}}

/* UPI analytics */
function sparkSvg(vals){const W=105,H=28,min=Math.min(...vals),max=Math.max(...vals),x=i=>i/(vals.length-1||1)*W,y=v=>H-3-((v-min)/(max-min||1))*(H-6);return `<svg class="spark" viewBox="0 0 ${W} ${H}"><line x1="0" y1="${H-2}" x2="${W}" y2="${H-2}"/><polyline points="${vals.map((v,i)=>`${x(i)},${y(v)}`).join(" ")}"/></svg>`}
function renderUpiAnalytics(){
 const w=+$("#upiWindow").value,bucket=+$("#upiBucket").value,mode=$("#upiStatusFilter").value;const arr=Object.entries(store.upiStats).filter(([id,s])=>mode==="all"||store.banks.find(b=>b.upi===id)?.status==="Running");
 let sumS=0,sumP=0,sumF=0,sumV=0;arr.forEach(([,s])=>{sumS+=s.success;sumP+=s.pending;sumF+=s.failed;sumV+=s.volume});
 const total=sumS+sumP+sumF,rate=total?sumS/total*100:0;
 $("#upiMetricCards").innerHTML=`<div class="card metric"><div class="metric-top">Success</div><div class="metric-value">${sumS}</div><div class="metric-foot green">${rate.toFixed(1)}% rate</div></div><div class="card metric"><div class="metric-top">Pending</div><div class="metric-value">${sumP}</div><div class="metric-foot amber">Needs follow-up</div></div><div class="card metric"><div class="metric-top">Failed</div><div class="metric-value">${sumF}</div><div class="metric-foot red">Failed transactions</div></div><div class="card metric"><div class="metric-top">Total</div><div class="metric-value">${total}</div><div class="metric-foot">Selected window</div></div><div class="card metric"><div class="metric-top">Volume</div><div class="metric-value">${money(sumV)}</div><div class="metric-foot">${w} minute window demo</div></div>`;
 $("#upiAnalyticsRows").innerHTML=arr.map(([id,s])=>{const t=s.success+s.pending+s.failed,r=t?s.success/t*100:0,b=store.banks.find(x=>x.upi===id);return `<tr><td>${esc(id)}</td><td>${esc(s.bank)}</td><td>${pill(b?.status||"Unknown")}</td><td>${s.success}</td><td>${s.pending}</td><td>${s.failed}</td><td>${t}</td><td>${money(s.volume)}</td><td class="${r>=95?"green":r>=90?"amber":"red"}">${r.toFixed(1)}%</td><td>${sparkSvg(s.series)}</td></tr>`}).join("")||`<tr><td colspan="10"><div class="empty"><strong>No matching UPI</strong></div></td></tr>`;
 $("#upiChartTitle").textContent=`${bucket}-minute success rate · last ${w} minutes`;
 const chartData=arr[0]?.[1]?.series||[0,0,0,0,0];draw("upiChart",chartData)
}
$("#upiWindow").onchange=renderUpiAnalytics;$("#upiBucket").onchange=renderUpiAnalytics;$("#upiStatusFilter").onchange=renderUpiAnalytics;$("#refreshUpiAnalytics").onclick=()=>{Object.values(store.upiStats).forEach(s=>{s.series=s.series.map(v=>Math.max(0,Math.min(100,v+(Math.random()*3-1.5))))});renderUpiAnalytics();toast("Analytics refreshed")}

/* Dummy verification */
function renderVerification(){ $("#verificationQueue").innerHTML=store.banks.map((b,i)=>`<div class="item"><div class="item-main"><strong>${esc(b.upi)}</strong><small>${esc(b.bank)} · Version ${b.version} · ${maskAccount(b.account)}</small></div>${b.verified?pill("Verified"):`<button class="btn sm primary demo-verify" data-i="${i}">Run dummy verification</button>`}</div>`).join("");$$(".demo-verify").forEach(x=>x.onclick=()=>startDummyVerification(+x.dataset.i))}
function startDummyVerification(i){const b=store.banks[i];modal("Dummy UPI verification",b.upi,`<div class="notice warn">DEMO ONLY — this does not contact a bank or provider.</div><div class="item-list" style="margin-top:12px" id="verifySteps"><div class="item"><div class="item-main"><strong>1. Account version</strong><small>Checking approved version…</small></div><span class="pill pending">Running</span></div><div class="item"><div class="item-main"><strong>2. Provider evidence</strong><small>Simulated provider response</small></div><span class="pill pending">Waiting</span></div><div class="item"><div class="item-main"><strong>3. Routing eligibility</strong><small>Will remain demo-only</small></div><span class="pill pending">Waiting</span></div></div><button class="btn primary w100" id="finishDummyVerify" style="margin-top:12px">Complete dummy verification</button>`);$("#finishDummyVerify").onclick=()=>{b.verified=true;b.status="Running";store.upiStats[b.upi].running=true;closeModal();renderBanks();renderVerification();renderUpiAnalytics();renderOverview();toast("Dummy verification completed — prototype only")}}

/* Statements */
$("#statementFile").onchange=e=>{const f=e.target.files[0];if(!f)return;$("#statementRows").insertAdjacentHTML("afterbegin",`<tr><td>${esc(f.name)}</td><td>HDFC v3</td><td>••••2384</td><td>Uploaded now</td><td>${pill("Processing")}</td><td>—</td></tr>`);toast("Statement queued in prototype");e.target.value=""}

/* USDT deposit */
$("#depositRequestForm").onsubmit=e=>{e.preventDefault();const amt=+$("#depositAmount").value;if(amt<2000){toast("Minimum deposit request is 2,000 USDT");return}const id="DEP-"+Math.floor(3000+Math.random()*6000),addr="TDEMO"+Math.random().toString(36).slice(2,10).toUpperCase()+"WPAYTRC20NOTREAL";$("#depositInstruction").innerHTML=`<div class="grid two-col" style="align-items:center"><div><div class="qr"></div><div class="pill pending" style="margin-top:10px">DEMO QR · NOT A PAYMENT DESTINATION</div></div><div><div class="facts" style="grid-template-columns:1fr"><div class="fact"><label>Request</label><strong>${id}</strong></div><div class="fact"><label>Amount</label><strong>${amt.toLocaleString()} USDT</strong></div><div class="fact"><label>Network</label><strong>TRON (TRC20)</strong></div></div><div class="field" style="margin-top:10px"><label>Demo address</label><input class="control mono" id="demoDepositAddress" readonly value="${addr}"></div><button class="btn ghost w100" id="copyDemoDeposit" style="margin-top:8px">Copy address</button></div></div>`;$("#copyDemoDeposit").onclick=async()=>{await navigator.clipboard?.writeText(addr);toast("Demo address copied")};$("#depositHistory").insertAdjacentHTML("afterbegin",`<tr><td>${id}</td><td>${amt.toLocaleString()} USDT</td><td>TRC20</td><td>${pill("Awaiting provider")}</td><td>Not created</td></tr>`);store.tx.unshift([new Date().toLocaleString(),"USDT Deposit",id,amt+" USDT","Awaiting provider"]);renderTx();toast("Demo USDT deposit request created")}

/* Commissions */
function renderCommission(kind="payin"){const rows=store.commissions.filter(c=>kind==="all"||c.kind===kind);$("#commissionRows").innerHTML=rows.map(c=>`<tr><td>${c.date}</td><td>${c.source}</td><td>${c.ref}</td><td class="${c.amount.startsWith("+")?"green":""}">${c.amount}</td><td>${pill(c.status)}</td></tr>`).join("")}
$$("[data-commission]").forEach(b=>b.onclick=()=>{$$("[data-commission]").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderCommission(b.dataset.commission)});

/* Withdrawals */
function renderWithdrawals(){$("#withdrawList").innerHTML=store.withdrawals.map(w=>`<div class="item"><div class="item-main"><strong>${esc(w.amount)} · ${esc(w.type)}</strong><small>${esc(w.destination)}</small></div>${pill(w.status)}</div>`).join("")}
$$("[data-withdraw]").forEach(b=>b.onclick=()=>{$$("[data-withdraw]").forEach(x=>x.classList.remove("active"));b.classList.add("active");const usdt=b.dataset.withdraw==="USDT";$("#inrWithdrawForm").classList.toggle("hidden",usdt);$("#usdtWithdrawForm").classList.toggle("hidden",!usdt)});
$("#inrMethod").onchange=()=>{const upi=$("#inrMethod").value==="upi";$("#bankWithdrawFields").classList.toggle("hidden",upi);$("#upiWithdrawFields").classList.toggle("hidden",!upi);["wdHolder","wdBank","wdAccount","wdIfsc"].forEach(id=>$("#"+id).required=!upi);["wdUpi","wdUpiName"].forEach(id=>$("#"+id).required=upi)};
$("#inrWithdrawForm").onsubmit=e=>{e.preventDefault();const method=$("#inrMethod").value,amt=+$("#wdInrAmount").value;const dest=method==="bank"?`${$("#wdBank").value} · ${maskAccount($("#wdAccount").value)} · ${$("#wdIfsc").value}`:`${$("#wdUpi").value} · ${$("#wdUpiName").value}`;const id="WD-"+Math.floor(6000+Math.random()*3000);store.withdrawals.unshift({id,type:"INR",amount:money(amt),destination:dest,status:"Pending review"});store.tx.unshift([new Date().toLocaleString(),"Withdrawal",id,money(amt),"Pending review"]);renderWithdrawals();renderTx();e.target.reset();toast("INR withdrawal submitted")};
$("#usdtWithdrawForm").onsubmit=e=>{e.preventDefault();const amt=+$("#wdUsdtAmount").value,addr=$("#wdUsdtAddress").value,id="WD-"+Math.floor(6000+Math.random()*3000);store.withdrawals.unshift({id,type:"USDT",amount:amt+" USDT",destination:"TRC20 · "+addr.slice(0,7)+"…"+addr.slice(-5),status:"Pending review"});store.tx.unshift([new Date().toLocaleString(),"Withdrawal",id,amt+" USDT","Pending review"]);renderWithdrawals();renderTx();e.target.reset();toast("USDT withdrawal submitted")}

/* Pay-ins */
function renderPayins(){const q=($("#payinSearch")?.value||"").toLowerCase();$("#payinRows").innerHTML=store.payins.filter(x=>(x.ref+x.merchant+x.upi+x.status).toLowerCase().includes(q)).map(x=>`<tr><td>${x.ref}<small>${x.time}</small></td><td>${x.merchant}</td><td>${x.upi}</td><td>${x.amount}</td><td>${pill(x.status)}</td><td>${x.evidence}</td><td class="${x.commission.startsWith("+")?"green":""}">${x.commission}</td></tr>`).join("");}$("#payinSearch").oninput=renderPayins;

/* Payout claim + timers */
function payoutAvailable(p){return p.state==="available"&&!store.cooldowns[p.id]}
function renderPayouts(){
 const now=Date.now();Object.keys(store.cooldowns).forEach(id=>{if(store.cooldowns[id]<=now){delete store.cooldowns[id];const p=store.payouts.find(x=>x.id===id);if(p)p.state="available"}});
 const avail=store.payouts.filter(payoutAvailable);
 const cnt=$("#payoutAvailableCount");if(cnt)cnt.textContent=avail.length;
 const claimed=$("#payoutClaimedCount");if(claimed)claimed.textContent=store.activePayout?1:0;
 $("#payoutPool").innerHTML=avail.map((p,i)=>`<div class="payout-row"><span>${i+1}</span><span><strong>${p.id}</strong><small style="display:block;color:var(--muted2)">${esc(p.holder)} · ${esc(p.bank)}</small></span><span>${pill(p.source)}</span><span>${money(p.amount)}</span><span class="green">+₹${p.commission}</span><span>${pill("Available")}</span><span><button class="btn sm primary claim-payout" data-id="${p.id}">Create Payout</button></span></div>`).join("")||`<div class="empty"><strong>No payout requests currently visible</strong>Locked/cooldown requests return automatically when eligible.</div>`;
 $$(".claim-payout").forEach(b=>b.onclick=()=>claimPayout(b.dataset.id));
 if(store.activePayout)renderActivePayout();else $("#activePayout").innerHTML=`<div class="empty"><strong>No active payout order</strong>Create a payout from an eligible request to begin.</div>`;
 renderOverview();hydrateIcons();
}
function claimPayout(id){if(store.activePayout){toast("Finish or release your current payout order first");return}const p=store.payouts.find(x=>x.id===id);if(!p||!payoutAvailable(p)){toast("This payout is no longer available");renderPayouts();return}p.state="locked";store.activePayout={id,endAt:Date.now()+DEMO.CLAIM_MS};renderPayouts();toast("Payout created and locked to you for 10 minutes")}
function renderActivePayout(){const a=store.activePayout,p=store.payouts.find(x=>x.id===a.id);if(!p)return;$("#activePayout").innerHTML=`<div class="notice ok">Created and locked to you for 10 minutes. Other Users cannot see this order during the active claim.</div><div class="countdown-box" style="margin-top:12px"><div class="muted2">Minutes remaining</div><div class="timer" id="payoutTimer">10:00</div></div><div class="facts" style="grid-template-columns:1fr 1fr;margin-top:12px"><div class="fact"><label>Beneficiary</label><strong>${esc(p.holder)}</strong></div><div class="fact"><label>Bank</label><strong>${esc(p.bank)}</strong></div><div class="fact"><label>Account Number</label><strong class="mono">${esc(p.account)}</strong></div><div class="fact"><label>IFSC</label><strong class="mono">${esc(p.ifsc)}</strong></div><div class="fact"><label>UPI ID</label><strong>${esc(p.upi)}</strong></div><div class="fact"><label>Amount</label><strong>${money(p.amount)}</strong></div><div class="fact"><label>Source</label><strong>${esc(p.source)}</strong></div><div class="fact"><label>Review goes to</label><strong>${esc(reviewerFor(p.source))}</strong></div></div><form class="form-grid" id="payoutProofForm" style="margin-top:12px"><div class="field"><label>UTR / payment reference</label><input class="control" id="payoutUtr" required></div><div class="field"><label>Payment proof</label><input class="control" type="file" id="payoutProof" required></div><button class="btn primary">I paid · Submit for review</button><button class="btn ghost" type="button" id="releasePayout">Release Order</button><button class="btn danger sm" type="button" id="simulateExpiry">Prototype: simulate timer expiry</button></form><div class="notice warn" style="margin-top:12px">On expiry/release: 5-minute cooldown, then the order returns to the eligible pool.</div>`;
 $("#payoutProofForm").onsubmit=e=>{e.preventDefault();p.state="submitted";store.tx.unshift([new Date().toLocaleString(),"Payout",p.id,money(p.amount),"Under review · "+reviewerFor(p.source)]);store.activePayout=null;renderPayouts();renderTx();toast("Payout submitted to "+reviewerFor(p.source)+" review")};
 $("#releasePayout").onclick=()=>expirePayout("released");
 $("#simulateExpiry").onclick=()=>expirePayout("expired");
 updatePayoutTimer();hydrateIcons()
}
function updatePayoutTimer(){if(!store.activePayout)return;const el=$("#payoutTimer");if(!el)return;const remain=store.activePayout.endAt-Date.now();if(remain<=0){expirePayout("expired");return}const s=Math.ceil(remain/1000),m=Math.floor(s/60),ss=String(s%60).padStart(2,"0");el.textContent=`${m}:${ss}`}
function expirePayout(reason){if(!store.activePayout)return;const p=store.payouts.find(x=>x.id===store.activePayout.id);if(p){p.state="cooldown";store.cooldowns[p.id]=Date.now()+DEMO.COOLDOWN_MS}store.activePayout=null;renderPayouts();toast(`Payout ${reason}; 5-minute cooldown started`)}
$("#refreshPayouts").onclick=()=>{renderPayouts();toast("Payout pool refreshed")};
setInterval(()=>{updatePayoutTimer();updateParkingTimer();const now=Date.now();let changed=false;Object.keys(store.cooldowns).forEach(id=>{if(store.cooldowns[id]<=now){delete store.cooldowns[id];const p=store.payouts.find(x=>x.id===id);if(p)p.state="available";changed=true}});if(changed)renderPayouts()},1000);

/* Parking */
function parkingBeneficiary(id){return store.beneficiaries.find(b=>b.id===id)}
function activeConfirmedBeneficiaries(){return new Set(store.beneficiaries.filter(b=>b.confirmed).map(b=>b.id))}
function reviewerFor(source){return source==="Merchant"?"Merchant":"Admin / Employee"}

function renderParkingBeneficiaries(){
 $("#beneficiaryList").innerHTML=store.beneficiaries.map((b,i)=>`<div class="card pad">
   <div class="card-head"><div><h2>${esc(b.name)}</h2><p>Added to WPay by ${esc(b.createdBy)}</p></div>${pill(b.confirmed?"I added":"Not confirmed")}</div>
   <div class="facts">
    <div class="fact"><label>Account holder</label><strong>${esc(b.holder)}</strong></div>
    <div class="fact"><label>Bank</label><strong>${esc(b.bank)}</strong></div>
    <div class="fact"><label>Account number</label><strong class="mono">${esc(b.account)}</strong></div>
    <div class="fact"><label>IFSC</label><strong class="mono">${esc(b.ifsc)}</strong></div>
    <div class="fact"><label>UPI ID</label><strong>${esc(b.upi||"—")}</strong></div>
    <div class="fact"><label>Source</label><strong>${esc(b.createdBy)}</strong></div>
   </div>
   ${b.confirmed
      ? `<div class="notice ok" style="margin-top:12px">Confirmed by you. Matching Parking orders may now appear in Parking Orders.</div>`
      : `<button class="btn primary confirm-beneficiary" data-i="${i}" style="margin-top:12px">I added this beneficiary</button>`}
 </div>`).join("");

 $$(".confirm-beneficiary").forEach(x=>x.onclick=()=>{
   const b=store.beneficiaries[+x.dataset.i];
   modal("Confirm beneficiary",b.name,`<div class="notice warn">Use “I added” only after you actually add this exact beneficiary in your own banking app. WPay does not add it to your bank for you.</div><div class="facts" style="grid-template-columns:1fr 1fr;margin-top:12px"><div class="fact"><label>Account</label><strong class="mono">${esc(b.account)}</strong></div><div class="fact"><label>IFSC</label><strong class="mono">${esc(b.ifsc)}</strong></div></div><button class="btn primary w100" id="confirmAddedBeneficiary" style="margin-top:12px">Yes, I added it</button>`);
   $("#confirmAddedBeneficiary").onclick=()=>{
     b.confirmed=true;
     closeModal();
     renderParkingBeneficiaries();
     renderParkingOrders();
     toast("Beneficiary confirmed; matching Parking orders are now visible");
   };
 });
}

function parkingVisibleRemaining(order){
 const locked = Object.values(store.parkingLocks).filter(l=>l.orderId===order.id && (l.state==="active"||l.state==="cooldown"||l.state==="review")).reduce((s,l)=>s+l.amount,0);
 return Math.max(0,order.remaining-locked);
}

function renderParkingOrders(){
 const confirmed=activeConfirmedBeneficiaries();
 const now=Date.now();
 Object.values(store.parkingLocks).forEach(lock=>{if(lock.state==="cooldown" && lock.cooldownUntil<=now){lock.state="released"}});
 const eligible=store.parkingOrders.filter(o=>confirmed.has(o.beneficiaryId) && parkingVisibleRemaining(o)>0);
 $("#parkingOrderPool").innerHTML=eligible.map((o,idx)=>{
   const b=parkingBeneficiary(o.beneficiaryId),visible=parkingVisibleRemaining(o);
   const locked=o.total-visible;
   return `<div class="parking-order-card ${idx===0?'selected':''}"><div><div style="display:flex;gap:10px;align-items:center"><div class="quick-icon">${svgIcon('parking')}</div><div><strong>${o.id} · ${esc(b.name)}</strong><small style="display:block;color:var(--muted2)">${esc(b.bank)} · ${maskAccount(b.account)} · source ${esc(o.source)}</small></div></div><div class="facts" style="grid-template-columns:1fr 1fr;margin-top:12px"><div class="fact"><label>Minimum transaction</label><strong>${money(o.minTxn)}</strong></div><div class="fact"><label>Already locked</label><strong>${money(locked)}</strong></div></div></div><div><div class="fact"><label>Total order</label><strong>${money(o.total)}</strong></div><div class="fact" style="margin-top:8px"><label>Remaining for others</label><strong class="green">${money(visible)}</strong></div><button class="btn sm primary lock-parking" data-id="${o.id}" style="margin-top:10px;width:100%">Lock Amount</button></div></div>`;
 }).join("")||`<div class="empty"><strong>No eligible Parking orders</strong>Only confirmed beneficiaries appear here. Add/confirm another beneficiary or wait until a locked amount becomes available again.</div>`;
 $$(".lock-parking").forEach(btn=>btn.onclick=()=>openParkingLock(btn.dataset.id));
 if(store.activeParking){renderActiveParking()}else{$("#activeParkingOrder").innerHTML=`<div class="empty"><strong>No active Parking payment</strong>Lock an eligible partial amount from an order.</div>`}
 $("#parkingReviewRows").innerHTML=store.parkingReviews.map(r=>{const b=parkingBeneficiary(r.beneficiaryId);return `<tr><td>${r.id}</td><td>${r.orderId}</td><td>${esc(b?.name||"—")}</td><td>${money(r.amount)}</td><td>${esc(r.reviewer)}</td><td>${pill(r.status)}</td></tr>`}).join("")||`<tr><td colspan="6"><div class="empty"><strong>No Parking payments submitted yet</strong></div></td></tr>`;
 hydrateIcons();
}

function openParkingLock(orderId){
 if(store.activeParking){toast("Finish or release your current Parking payment first");return}
 const o=store.parkingOrders.find(x=>x.id===orderId);
 const b=parkingBeneficiary(o.beneficiaryId);
 const visible=parkingVisibleRemaining(o);
 if(!o||!b||!b.confirmed||visible<=0){toast("Order is no longer available");renderParkingOrders();return}
 modal("Lock Parking amount",`${o.id} · ${b.name}`,`<div class="notice ok">Original order: ${money(o.total)} · currently visible to eligible Users: ${money(visible)} · minimum per transaction: ${money(o.minTxn)}</div><div class="facts" style="grid-template-columns:1fr 1fr;margin-top:12px"><div class="fact"><label>Beneficiary</label><strong>${esc(b.holder)}</strong></div><div class="fact"><label>Bank</label><strong>${esc(b.bank)}</strong></div><div class="fact"><label>Account</label><strong class="mono">${esc(b.account)}</strong></div><div class="fact"><label>IFSC</label><strong class="mono">${esc(b.ifsc)}</strong></div></div><form class="form-grid" id="parkingLockForm" style="margin-top:12px"><div class="field"><label>Amount to lock (INR)</label><input class="control" id="parkingLockAmount" type="number" min="${o.minTxn}" max="${visible}" step="1" value="${Math.min(o.minTxn,visible)}" required></div><button class="btn primary">Lock for payment · 10 minutes</button></form>`);
 $("#parkingLockForm").onsubmit=e=>{
   e.preventDefault();
   const amount=+$("#parkingLockAmount").value;
   const currentVisible=parkingVisibleRemaining(o);
   if(amount<o.minTxn){toast(`Minimum amount is ${money(o.minTxn)}`);return}
   if(amount>currentVisible){toast(`Only ${money(currentVisible)} is currently available`);return}
   const lockId="PKL-"+Math.floor(10000+Math.random()*80000);
   store.parkingLocks[lockId]={id:lockId,orderId:o.id,beneficiaryId:o.beneficiaryId,amount,state:"active",endAt:Date.now()+DEMO.CLAIM_MS,cooldownUntil:null};
   store.activeParking=lockId;
   closeModal();
   renderParkingOrders();
   toast(`${money(amount)} locked for 10 minutes; other Users now see less remaining`);
 };
}

function renderActiveParking(){
 const lock=store.parkingLocks[store.activeParking];
 if(!lock){store.activeParking=null;return renderParkingOrders()}
 const o=store.parkingOrders.find(x=>x.id===lock.orderId),b=parkingBeneficiary(lock.beneficiaryId);
 if(lock.state==="cooldown"){
   $("#activeParkingOrder").innerHTML=`<div class="notice warn">Payment timer expired. Your ${money(lock.amount)} lock is in a 5-minute cooldown and is still hidden from other Users.</div><div class="timer" id="parkingCooldownTimer" style="margin-top:12px">05:00</div><button class="btn ghost" id="clearCooldownView" style="margin-top:12px">Close this view</button>`;
   $("#clearCooldownView").onclick=()=>{store.activeParking=null;renderParkingOrders()};
   updateParkingTimer();
   return;
 }
 $("#activeParkingOrder").innerHTML=`<div class="notice ok">${money(lock.amount)} is reserved to you. Other eligible Users see only ${money(parkingVisibleRemaining(o))} currently available from this order.</div><div class="timer" id="parkingTimer" style="margin:12px 0">10:00</div><div class="facts" style="grid-template-columns:1fr 1fr"><div class="fact"><label>Beneficiary</label><strong>${esc(b.holder)}</strong></div><div class="fact"><label>Bank</label><strong>${esc(b.bank)}</strong></div><div class="fact"><label>Account number</label><strong class="mono">${esc(b.account)}</strong></div><div class="fact"><label>IFSC</label><strong class="mono">${esc(b.ifsc)}</strong></div><div class="fact"><label>UPI ID</label><strong>${esc(b.upi||"—")}</strong></div><div class="fact"><label>Locked amount</label><strong>${money(lock.amount)}</strong></div></div><form class="form-grid" id="parkingProofForm" style="margin-top:12px"><div class="field"><label>UTR / payment reference</label><input class="control" id="parkingUtr" required></div><div class="field"><label>Payment proof</label><input class="control" type="file" id="parkingProof" required></div><button class="btn primary">I paid · Send to review</button><button class="btn ghost" type="button" id="releaseParking">Release lock</button><button class="btn danger sm" type="button" id="simulateParkingExpiry">Prototype: simulate timer expiry</button></form>`;
 $("#parkingProofForm").onsubmit=e=>{
   e.preventDefault();
   lock.state="review";
   o.remaining=Math.max(0,o.remaining-lock.amount);
   const reviewId="PKR-"+Math.floor(10000+Math.random()*80000);
   store.parkingReviews.unshift({id:reviewId,orderId:o.id,beneficiaryId:o.beneficiaryId,amount:lock.amount,reviewer:reviewerFor(o.source),status:"Under review"});
   store.tx.unshift([new Date().toLocaleString(),"Parking",reviewId,money(lock.amount),"Under review"]);
   store.activeParking=null;
   renderParkingOrders();renderTx();
   toast(`Parking payment sent to ${reviewerFor(o.source)} review`);
 };
 $("#releaseParking").onclick=()=>startParkingCooldown("released");
 $("#simulateParkingExpiry").onclick=()=>startParkingCooldown("expired");
 updateParkingTimer();
}

function startParkingCooldown(reason){
 if(!store.activeParking)return;
 const lock=store.parkingLocks[store.activeParking];
 if(!lock)return;
 lock.state="cooldown";
 lock.cooldownUntil=Date.now()+DEMO.COOLDOWN_MS;
 renderActiveParking();
 renderParkingOrders();
 toast(`Parking lock ${reason}; 5-minute cooldown started`);
}

function updateParkingTimer(){
 if(!store.activeParking)return;
 const lock=store.parkingLocks[store.activeParking];
 if(!lock)return;
 if(lock.state==="active"){
   const remain=lock.endAt-Date.now();
   const el=$("#parkingTimer");
   if(remain<=0){startParkingCooldown("expired");return}
   if(el){const s=Math.ceil(remain/1000);el.textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`}
 }else if(lock.state==="cooldown"){
   const remain=lock.cooldownUntil-Date.now();
   const el=$("#parkingCooldownTimer");
   if(remain<=0){
     lock.state="released";
     if(store.activeParking===lock.id)store.activeParking=null;
     renderParkingOrders();
     toast("Parking cooldown finished; amount returned to shared order");
     return;
   }
   if(el){const s=Math.ceil(remain/1000);el.textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`}
 }
}
$("#refreshParkingOrders").onclick=()=>{renderParkingOrders();toast("Parking pool refreshed")};

/* Transactions */
function renderTx(){const f=$("#txFilter").value;$("#txRows").innerHTML=store.tx.filter(x=>f==="all"||x[1]===f).map(x=>`<tr><td>${x[0]}</td><td>${x[1]}</td><td>${x[2]}</td><td>${x[3]}</td><td>${pill(x[4])}</td></tr>`).join("")}$("#txFilter").onchange=renderTx;

/* Devices */
function renderDevices(){$("#deviceList").innerHTML=`<div class="item"><div class="avatar">A</div><div class="item-main"><strong>Samsung Galaxy A54</strong><small>APK mobile +91 ••••• 48210 · Android 15 · Agent 0.10.5 · Last seen 2 min ago</small></div><span class="pill ok">Online</span><button class="btn sm danger" id="revokeDevice">Revoke</button></div>`;$("#revokeDevice").onclick=()=>{store.banks.forEach(b=>{if(b.apkMobile.includes("48210"))b.status="Stopped"});$("#deviceList").innerHTML=`<div class="empty"><strong>No linked devices</strong>Pair again with an activation code.</div>`;renderBanks();renderOverview();toast("Device revoked in prototype")}}
$("#downloadApk").onclick=()=>{const blob=new Blob(["WPay Agent prototype placeholder — not a real APK."],{type:"text/plain"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="WPay-Agent-PROTOTYPE.txt";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),800);toast("Prototype download started")};
$("#generateCode").onclick=()=>{const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let c="";for(let i=0;i<8;i++)c+=chars[Math.floor(Math.random()*chars.length)];$("#activationCodeBox").innerHTML=`<div class="code">${c}</div><p class="muted">Expires in 10 minutes · owner pairing only</p><div class="qr" style="width:150px;height:150px"></div>`;toast("Activation code generated")};
$("#revealOtp").onclick=()=>{modal("Recent MFA required","Prototype confirmation",`<form class="form-grid" id="otpMfaForm"><div class="field"><label>Authenticator code</label><input class="control mono" id="otpMfaInput" value="123456" maxlength="6"></div><button class="btn primary">Confirm</button></form>`);$("#otpMfaForm").onsubmit=e=>{e.preventDefault();if($("#otpMfaInput").value==="123456"){$("#otpValue").textContent="482913";closeModal();toast("OTP revealed for 30 seconds");setTimeout(()=>$("#otpValue").textContent="••••••",30000)}else toast("Invalid demo MFA code")}};

/* Support */
function renderTickets(){$("#ticketList").innerHTML=store.tickets.map((t,i)=>`<button class="item" style="width:100%;text-align:left;color:inherit" data-ticket="${i}"><div class="item-main"><strong>${t.id} · ${esc(t.subject)}</strong><small>${t.messages.length} messages</small></div>${pill(t.status)}</button>`).join("");$$("[data-ticket]").forEach(b=>b.onclick=()=>showTicket(+b.dataset.ticket))}
function showTicket(i){const t=store.tickets[i];$("#ticketThread").innerHTML=`<div class="item-list">${t.messages.map(m=>`<div class="item"><div class="item-main"><strong>${esc(m[0])}</strong><small>${esc(m[1])}</small></div></div>`).join("")}</div><form class="form-grid" id="replyForm" style="margin-top:12px"><div class="field"><label>Reply</label><textarea class="control" id="replyText" required></textarea></div><button class="btn primary">Send reply</button></form>`;$("#replyForm").onsubmit=e=>{e.preventDefault();t.messages.push(["You",$("#replyText").value]);showTicket(i);renderTickets();toast("Reply added")}}
$("#openTicketModal").onclick=()=>{modal("New support ticket","Create a support request",`<form class="form-grid" id="ticketForm"><div class="field"><label>Subject</label><input class="control" id="ticketSubject" required></div><div class="field"><label>Message</label><textarea class="control" id="ticketMessage" required></textarea></div><button class="btn primary">Create ticket</button></form>`);$("#ticketForm").onsubmit=e=>{e.preventDefault();const t={id:"SP-"+Math.floor(1000+Math.random()*8000),subject:$("#ticketSubject").value,status:"Open",messages:[["You",$("#ticketMessage").value]]};store.tickets.unshift(t);closeModal();renderTickets();showTicket(0);toast("Support ticket created")}}

/* Security / profile / settings */
function validPassword(p){return p.length>=8&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/[0-9]/.test(p)&&/[^A-Za-z0-9\s]/.test(p)}
$("#passwordForm").onsubmit=e=>{e.preventDefault();if($("#currentPassword").value!=="WPay@1234"){toast("Current prototype password is incorrect");return}if(!validPassword($("#newPassword").value)){toast("Use 8+ chars with upper, lower, number and symbol");return}toast("New User password meets requested policy");e.target.reset()}
$("#logoutAll").onclick=()=>toast("All other prototype sessions revoked");
$("#profileForm").onsubmit=e=>{e.preventDefault();const n=$("#profileName").value.trim();if(n.length<2)return toast("Enter a valid display name");localStorage.setItem("wpay-final-name",n);$("#miniName").textContent=n;$("#overviewName").textContent=n.split(/\s+/)[0];toast("Profile saved")}
$("#prefsForm").onsubmit=e=>{e.preventDefault();toast("Preferences saved")};$("#settingsForm").onsubmit=e=>{e.preventDefault();const v=$("#themeSetting").value;if(v==="Dark")document.documentElement.classList.remove("light");if(v==="Light")document.documentElement.classList.add("light");toast("Settings saved")};
$("#markAllRead").onclick=()=>{$$("#notificationList .unread").forEach(x=>x.classList.remove("unread"));toast("Notifications marked read")};

/* Search & export */
$("#globalSearch").onkeydown=e=>{if(e.key!=="Enter")return;const q=e.target.value.toLowerCase().trim();const nav=$$(".nav-item").find(n=>n.textContent.toLowerCase().includes(q));if(nav){go(nav.dataset.page);toast("Opened "+nav.textContent.trim());return}const p=store.payins.find(x=>(x.ref+x.merchant+x.upi).toLowerCase().includes(q));if(p){go("payins");$("#payinSearch").value=q;renderPayins();return}toast("No matching module or transaction")};
$("#exportAnalytics").onclick=()=>{const csv="metric,value\n30-day pay-in volume,1842000\nsuccess rate,96.8%\ncapacity utilization,73%\npay-in commission,12840\npayout commission,5800\n",blob=new Blob([csv],{type:"text/csv"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="wpay-user-analytics-prototype.csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),800);toast("CSV download started")};

/* Render all */
function renderAll(){renderOverview();renderBanks();renderUpiAnalytics();renderVerification();renderCommission();renderWithdrawals();renderPayins();renderPayouts();renderParkingBeneficiaries();renderParkingOrders();renderTx();renderDevices();renderTickets();hydrateIcons()}
function drawAll(){draw("overviewChart",series[7]);draw("analyticsChart",series[30]);draw("upiChart",store.upiStats["rahulstore@upi"].series)}
const savedName=localStorage.getItem("wpay-final-name");if(savedName){$("#profileName").value=savedName;$("#miniName").textContent=savedName;$("#overviewName").textContent=savedName.split(/\s+/)[0]}
renderAll();drawAll();hydrateIcons();
const initial=location.hash.replace("#","");if(initial&&$("#page-"+initial))go(initial);
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeModal();$("#sidebar").classList.remove("open");$("#overlay").classList.remove("show")}});
