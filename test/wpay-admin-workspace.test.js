'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const finance=require('../lib/wpay/panels/admin-finance');
test('Admin topbar stays on V5 Notifications and Profile pages',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-ui.js'),'utf8');
 assert.match(ui,/notifications\.view'[\s\S]*?api\.navigate\('v5\.notifications'\)/);
 assert.match(ui,/profile\.view'[\s\S]*?api\.navigate\('v5\.profile'\)/);
 assert.doesNotMatch(ui,/notifications\.view'[\s\S]*?api\.navigate\(p\.destinationId\)/);
 assert.doesNotMatch(ui,/profile\.view'[\s\S]*?api\.navigate\(p\.destinationId\)/);
 assert.ok(ui.includes("['Analytics',can('overview.view')?'v5.analytics':null,'analytics']"));
 for(const destination of ['v5.approvals','v5.bank-upi','v5.deposits','v5.payout-approval','v5.payout-disputes','v5.late-reviews','v5.withdrawals'])assert.ok(ui.includes(destination));
 const v5=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8');
 assert.match(v5,/Open Account settings[\s\S]*?navigate\("v5\.profile"\)/);
 assert.doesNotMatch(v5,/Open Account settings[\s\S]*?administration\.account-security/);
});
test('Admin V5 Employee page only defaults the sole available tenant and respects create/update capabilities',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8'),backend=fs.readFileSync(require.resolve('../lib/wpay/operations/employees.js'),'utf8');
 assert.match(backend,/canCreate:[\s\S]*?employee_management\.create/);
 assert.match(backend,/canUpdate:[\s\S]*?employee_management\.update/);
 assert.match(ui,/if\(data\.canCreate\)tools\.append\(button\(el,"\+ Create employee"/);
 assert.match(ui,/data\.canUpdate\?button\(el,"Edit access"/);
 assert.match(ui,/i\.checked=emp\?\(emp\.admin_scope\?\.tenantIds\|\|\[\]\)\.includes\(t\):data\.tenantIds\.length===1/);
 assert.ok(ui.includes('tenantChecks.filter(([,i])=>i.checked).map(([id])=>id)'));
 assert.ok(ui.includes('if(!tenantIds.length)throw Error("Select at least one operational tenant")'));
 assert.doesNotMatch(ui,/emp\?\.admin_scope\?\.tenantIds\|\|data\.tenantIds/);
});
test('Admin V5 Parking actions match backend review state transitions',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8');
 assert.match(ui,/if\(r\.state==="submitted"\)actions\.append\(button\(el,"Review"/);
 assert.match(ui,/if\(\["submitted","review"\]\.includes\(r\.state\)\)actions\.append\(button\(el,"Dispute"/);
 assert.match(ui,/if\(\["submitted","review","disputed"\]\.includes\(r\.state\)\)actions\.append\(button\(el,"Approve paid"/);
 assert.match(ui,/if\(\["submitted","review","disputed"\]\.includes\(r\.state\)\)actions\.append\(button\(el,"Not paid"/);
});
test('Admin navigation never leaves a blank content shell while modules load',()=>{
 const fs=require('node:fs'),app=fs.readFileSync(require.resolve('../dev/wpay-auth/web/app.js'),'utf8');
 assert.ok(app.includes('Loading module…'));
 assert.ok(app.includes('admin-module-loading'));
 assert.ok(app.includes('globalThis.WPayAdminUi&&["admin","super_admin","employee"].includes(account.accountType)'));
});
test('Admin live shell keeps the V5 login and a single Overview navigation entry',()=>{
 const fs=require('node:fs'),app=fs.readFileSync(require.resolve('../dev/wpay-auth/web/app.js'),'utf8'),css=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-ui.css'),'utf8'),html=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin.html'),'utf8');
 assert.match(app,/function renderAdminLogin\(root\)/);
 assert.match(app,/Sign in to workspace/);
 assert.match(app,/Open Admin Workspace/);
 assert.match(app,/entryRole==='admin'&&mode==='login'\)return renderAdminLogin\(root\)/);
 assert.match(css,/\.wpay-admin #account-home\{display:none!important\}/);
 assert.match(html,/id="account-home"/);
});
test('Admin V5 navigation preserves the uploaded HTML flow and page metadata',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-ui.js'),'utf8');
 for(const label of ['DASHBOARD','ACCOUNTS & APPROVALS','COLLECTIONS & ROUTING','PARKING','PAYOUTS & TREASURY','APK SETUP','TEAM & ACCESS','FINANCE & REPORTS','DEVELOPER','SUPPORT & PLATFORM'])assert.ok(ui.includes(label));
 for(const page of ['UPI daily limits','User assignments','Payout bank capabilities','Commission holds','Profit overview','Pay-in fees & commissions','Payout fees & commissions','Fixed payout revenue','USDT exchange','Salary management','Expense management'])assert.ok(ui.includes(page));
 assert.ok(ui.includes("'Pay-in disputes':['DISPUTES','Live 48-hour Merchant pay-in dispute workflow"));
 assert.ok(ui.includes("Profile:['ACCOUNT','Admin account and security controls.']"));
});
test('Admin Accounts and Collections use the final V5 hierarchy',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8');
 assert.ok(ui.includes('const panelTable=(el,headers,rows,titleText="",subtitle="")=>'));
 assert.ok(ui.includes('Admin-created User supports an Admin-set password.'));
 assert.ok(ui.includes('Admin-created Merchant supports an Admin-set password.'));
 assert.ok(ui.includes('Standard first deposit: 2,000 USDT minimum, less a one-time non-refundable 100 USDT setup fee.'));
 assert.ok(ui.includes('Daily limit ownership remains with the User.'));
 assert.ok(ui.includes('panelTable(el,["Merchant","UPI / User","Priority","Payment range","State","Readiness","Reason","Action"]'));
 assert.ok(ui.includes('panelTable(el,["Merchant","User","Priority","Amount range","User available","State","Action"]'));
 const bankPage=ui.slice(ui.indexOf('async function bankUpi(o)'),ui.indexOf('async function upiAnalytics(o)'));
 assert.ok(bankPage.includes('UPI directory'));
 assert.doesNotMatch(bankPage,/metric\(el,"Configured UPI"/);
 // The separate utilization page intentionally summarizes the scoped bank count.
 assert.ok(ui.includes('metric(el,"Configured UPI",data.banks.length,"Current scoped bank versions")'));
 assert.doesNotMatch(ui,/metric\(el,"Confirmed deposit"/);
});
test('Admin Parking and Treasury preserve final V5 density and panel hierarchy',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8');
 for(const sig of [
  'panelTable(el,["Beneficiary","Workspace","Bank details","UPI","Created by","User confirmations","Open orders","State"]',
  'panelTable(el,["Reference","Beneficiary","Workspace","Total","Per txn range","Locked","Remaining","Confirmed Users","State"]',
  'panelTable(el,["Order","User","Beneficiary","Amount","UTR","Proof scan","Submitted","State","Reviewer","Action"]',
  'panelTable(el,["Reference","User","Amount","Mode","UTR","State","Submitted","15m timeout","Action"]',
  'panelTable(el,["Merchant","INR reserved","USDT quote","Rate","Network / destination","Created","Completed","State","Action"]',
  'panelTable(el,["Payout","Merchant / User","Amount","Commission hold","Statement coverage","Reason","Proofs","Status","Action"]',
  'panelTable(el,["Kind","Resource / User","Amount","Held","Reserve mode","Proof scan","Reason","Conflict","Status","Proof","Action"]'
 ])assert.ok(ui.includes(sig));
 assert.doesNotMatch(ui,/metric\(el,"Banks"[\s\S]*Payout capable/);
 assert.doesNotMatch(ui,/metric\(el,"Requests"[\s\S]*Commission withdrawals/);
 assert.doesNotMatch(ui,/metric\(el,"Holds"[\s\S]*Commission hold history/);
});
test('Admin APK Setup and Team pages preserve final V5 flow without changing OTP renderer',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8'),nav=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-ui.js'),'utf8'),ops=fs.readFileSync(require.resolve('../dev/wpay-auth/web/operations.js'),'utf8');
 assert.ok(ui.includes('Generate account-owned code'));
 assert.ok(ui.includes('panelTable(el,["Code","Owning actor","Created","Expires","State","Device","Action"]'));
 assert.ok(ui.includes('panelTable(el,["Code / request","Owner / actor","Created","Expires","State","Device","Action"]'));
 assert.ok(ui.includes('const grid=el("div",undefined,"device-grid")'));
 assert.ok(ui.includes('panelTable(el,["Employee","Status","Tenant scope","Permission access","Version","Action"]'));
 assert.ok(ui.includes('panelTable(el,["Admin","Status","Tenant scope","Delegated permissions","Version","Action"]'));
 assert.ok(nav.includes("['OTP Events',dest('apk_otp_events.view_all','operations.otp'),'otp']"));
 assert.ok(ops.includes("if(page==='otp')"));
});
test('Admin Finance Developer and Support pages follow final V5 hierarchy with live owner context',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8'),backend=fs.readFileSync(require.resolve('../lib/wpay/panels/api.js'),'utf8');
 assert.ok(ui.includes('panelTable(el,["Time","Owner","Account","Ledger type","Direction","Amount","Currency","Reference type","Reference","Payout state","Actor source","Terms version"]'));
 assert.ok(ui.includes('panelTable(el,["Date","Owner","Ledger","Direction","Amount","Currency","Reference type","Reference"]'));
 assert.ok(ui.includes('panelTable(el,["Time","Source","Action","Actor","Target"]'));
 assert.ok(ui.includes('panelTable(el,["Time","Merchant","Operation","Log ID"]'));
 assert.ok(ui.includes('panelTable(el,["Prefix","Merchant","Label","Scopes","Created","Status","Last used","Action"]'));
 assert.ok(ui.includes('panelTable(el,["Created","Owner","Subject","Message","Status","Latest reply","Reply time","Action"]'));
 assert.ok(backend.includes('a.name AS owner_name'));
 assert.doesNotMatch(ui,/metric\(el,"Entries"[\s\S]*Current ledger page/);
 assert.doesNotMatch(ui,/metric\(el,"Tickets"[\s\S]*Visible support queue/);
});
test('Admin final V5 parity audit has 55 visible pages and no V5 renderer gaps',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-ui.js'),'utf8'),v5=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8'),ops=fs.readFileSync(require.resolve('../dev/wpay-auth/web/operations.js'),'utf8');
 const labels=[...ui.matchAll(/\['([^']+)',(?:can\([^\n]+\?|dest\(|byDest\()[^\n]*\]/g)].map(m=>m[1]);
 for(const label of ['Overview','Analytics','Users','Merchants','Pending approvals','User collection access','User deposits','Bank & UPI','UPI Analytics','UPI daily limits','Assignments & routing','User assignments','Transactions','Pay-in disputes','Statements & reconciliation','Beneficiaries','Orders','Review queue','Payout approval','Payout review','Payout bank capabilities','Post-approval disputes','Late payment reviews','Merchant USDT','Commission withdrawals','User commissions','Commission holds','Holds / frozen','Activation codes','Devices','Pairing history','OTP Events','UTR Capture','APK / Agent','Employees','Admin authority','Ledger','Profit overview','Pay-in fees & commissions','Payout fees & commissions','Fixed payout revenue','USDT exchange','Salary management','Expense management','Profit & expenses','Reports','Audit log','API credentials','Webhooks','API logs','Support','Notifications','Security','Settings','Profile'])assert.ok(ui.includes("['"+label+"'"));
 const destinations=[...ui.matchAll(/'(v5\.[a-z0-9.-]+)'/g)].map(m=>m[1]);
 for(const d of new Set(destinations))assert.ok(v5.includes('destination==="'+d+'"')||['v5.notifications','v5.profile','v5.reports','v5.approvals','v5.bank-upi','v5.deposits','v5.payout-approval','v5.payout-disputes','v5.late-reviews','v5.withdrawals'].includes(d));
 assert.doesNotMatch(v5,/prototype|demo|backend pending|not implemented/i);
 assert.ok(ui.includes("['OTP Events',dest('apk_otp_events.view_all','operations.otp'),'otp']"));
 assert.ok(ops.includes("if(page==='otp')"));
 assert.ok(ui.includes("Recent financial activity"));
 assert.ok(ui.includes("command-strip"));
});
test('Admin creation metadata matches password-only Admin login policy',()=>{
 const fs=require('node:fs'),authority=fs.readFileSync(require.resolve('../lib/wpay/operations/admin-authority.js'),'utf8'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8');
 assert.ok(authority.includes('passwordResetRequired:true,mfaRequired:false'));
 assert.ok(ui.includes('must reset it on first sign-in; current backend reports MFA not required for this Admin creation flow.'));
 assert.doesNotMatch(ui,/New Admins receive a one-time temporary credential and must complete reset \+ MFA/);
});
test('Admin exact V5 shell keeps reference icon vocabulary and topbar composition',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-ui.js'),'utf8'),css=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-ui.css'),'utf8'),html=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin.html'),'utf8');
 for(const iconName of ['overview','analytics','users','merchant','approvals','bank','routing','transactions','statements','dispute','payout','usdt','withdraw','hold','parking','activation','device','otp','utr','apk','employees','admin','ledger','finance','reports','audit','key','webhook','logs','support','bell','security','settings','profile','location','battery','network','volume','fee','capacity','deposit','upianalytics','beneficiary','orders','commission','access','history','late','dispute2','password','success'])assert.ok(ui.includes(iconName+":'"));
 assert.ok(ui.includes('class="svg-icon"'));
 assert.doesNotMatch(ui,/admin-svg-icon/);
 assert.doesNotMatch(html,/admin-svg-icon/);
 assert.match(css,/\.admin-language-hidden\{display:none!important\}/);
 for(const mapping of ["['Analytics',can('overview.view')?'v5.analytics':null,'analytics']","['Pending approvals',(can('users.view')||can('merchants.view'))?'v5.approvals':null,'approvals']","['OTP Events',dest('apk_otp_events.view_all','operations.otp'),'otp']","['Notifications',can('notifications.view')?'v5.notifications':null,'bell']"])assert.ok(ui.includes(mapping));
});
test('Admin Overview uses exact V5 SVG icons instead of placeholder dots',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-ui.js'),'utf8');
 assert.ok(ui.includes("['volume','Total volume'"));
 assert.ok(ui.includes("['deposit','Today collection'"));
 assert.ok(ui.includes("['merchant','Merchant available'"));
 assert.ok(ui.includes("['capacity','User capacity'"));
 assert.ok(ui.includes("['fee','Platform fees'"));
 assert.ok(ui.includes("['approvals','Pending actions'"));
 assert.ok(ui.includes("ico.innerHTML=icon(iconName)"));
 assert.ok(ui.includes("ico.innerHTML=icon(iconName);body.append"));
});
test('Admin Dashboard keeps exact V5 Overview structure with live read-only health data',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-ui.js'),'utf8'),backend=fs.readFileSync(require.resolve('../lib/wpay/panels/admin-overview.js'),'utf8');
 for(const marker of ['OPERATIONS COMMAND CENTER','WPay platform at a glance','primary-kpis','secondary-kpis','Collection & payout trend','Last 14 days · INR','Deep analytics','Action center','Recent financial activity','Operational health','UPI shared limit used','Active devices','Parking open orders','UTR review','USDT rate','Unread notifications'])assert.ok(ui.includes(marker),marker);
 for(const field of ['todayFees','todayUserCommission','pendingPayouts','transactionHealth','overallSuccessRate','topMerchants'])assert.ok(backend.includes(field));
 assert.ok(backend.includes('[7,14,30,60]'));
 assert.doesNotMatch(ui,/admin-bottom/);
});
test('Admin Analytics matches exact V5 metrics chart donut and utilization layout',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8');
 for(const marker of ['grid analytics-metrics','Today volume','Success rate','Running UPI','Active users','Today collection','Successful payout','Platform fees','User commission','Today payout volume','Pending payouts','Active devices','UTR captured today','Volume trend','Transaction health','donut-wrap','Top merchants by volume','UPI shared-limit usage','mini-bar-list'])assert.ok(ui.includes(marker));
 assert.ok(ui.includes('post("panel/admin-overview",{days:14})'));
 assert.ok(ui.includes('post("business/upi-analytics",{days:1})'));
 assert.ok(ui.includes('post("operations/device-setup",{})'));
 assert.ok(ui.includes('post("operations/utr-source",{})'));
});
test('Admin Accounts and Approvals section keeps exact V5 account-card and modal structure',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8');
 for(const marker of ['account-card-grid','account-card-top','account-identity','account-card-stats','Current terms','access-badges','View / manage','Edit rates','Collection access','data.actions.includes("reactivate")','password-ready','Create & approve now','grid two-col','Operational links','Recent transactions','Edit rates / fees'])assert.ok(ui.includes(marker),marker);
 assert.ok(ui.includes('action:"reactivate"'));assert.ok(ui.includes('expectedVersion:a.commercialVersion||0'));
 assert.ok(ui.includes('q.oninput=()=>{clearTimeout(filterTimer)'));
 assert.ok(ui.includes('st.onchange=()=>action(()=>directory'));
 assert.ok(ui.includes('post("panel/directory/create"'));
 assert.ok(ui.includes('post("approval"'));
 assert.ok(ui.includes('post("panel/directory/update"'));
 assert.ok(ui.includes('post("business/user-access/update"'));
});
test('Admin Pending approvals Collection access and Deposits match exact V5 section flow',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8');
 for(const marker of ['Total pending','Unified action queue','Free Setup','Unlimited Collection','First deposit policy','Unlimited Collection capacity ko bypass karta hai, security ko nahi','Standard first deposit: 2,000 USDT minimum, less a one-time non-refundable 100 USDT setup fee.','Requested USDT','INR credit','Tx reference','Manual confirm','Recheck provider','Reverse confirmed deposit'])assert.ok(ui.includes(marker));
 assert.ok(ui.includes('post("funding/list"'));
 assert.ok(ui.includes('post("funding/recheck"'));
 assert.ok(ui.includes('post("funding/review"'));
 assert.doesNotMatch(ui,/Confirmed deposit[\s\S]{0,300}Needs review[\s\S]{0,300}USDT requested/);
});
test('operating margin excludes double counting and unsupported FX',()=>{
 assert.equal(finance.margin({merchant_platform_fee:'1000',merchant_payout_fee:'600',user_commission:'200',user_payout_commission:'100'},'500'),'800');
 assert.equal(finance.margin({},'500'),'-500');
});
test('customer and employee cannot access admin finance',async()=>{
 for(const account_type of ['user','merchant','employee'])await assert.rejects(finance.run({query(){throw Error('should not query');}},{account_type},{},'panel/admin-finance',{}),{code:'FORBIDDEN'});
});
test('Admin account creation, profit, expenses, voids and audit use scoped real rows',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires disposable local PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='admin_workspace_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 const {migrate,transaction}=require('../lib/wpay/db/migrations');await migrate(pool);
 const {SecurityRepository}=require('../lib/wpay/db/security-repository'),{AuthService}=require('../lib/wpay/auth/runtime/service'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa');
 const repo=new SecurityRepository(pool),service=new AuthService(repo,{mfaCrypto:new MfaCrypto(randomBytes(32))}),password='Testing-admin-password-2026';
 await service.bootstrap({name:'Workspace Admin',email:'admin@workspace.invalid',password});
 const session=(await service.login({email:'admin@workspace.invalid',password},'127.0.0.1','admin')).sessionToken;
 const call=(op,b={})=>service.authenticated(session,op,0,b,'admin');
 const merchantBody={requestId:randomUUID(),type:'merchant',name:'Test Merchant',email:'merchant@workspace.invalid',password};
 const merchant=await call('panel/directory/create',merchantBody),user=await call('panel/directory/create',{...merchantBody,requestId:randomUUID(),type:'user',name:'Test User',email:'user@workspace.invalid'});
 assert.equal(merchant.approvalStatus,'pending');assert.equal((await call('panel/directory/create',merchantBody)).id,merchant.id);
 await assert.rejects(call('panel/directory/create',{...merchantBody,name:'Different name'}),{code:'CONFLICT'});
 await assert.rejects(service.login({email:merchantBody.email,password},'127.0.0.1','merchant'),{code:'APPROVAL_PENDING'});
 const ledger=require('../lib/wpay/business/ledger');await transaction(pool,c=>ledger.post(c,{key:'synthetic-admin-report',referenceType:'test',referenceId:'test',entries:[...ledger.pair(merchant.id,'merchant_platform_fee','1000'),...ledger.pair(merchant.id,'merchant_payout_fee','200'),...ledger.pair(user.id,'user_commission','300')]}));
 const cost={requestId:randomUUID(),tenantId:'wpay-auth-development',category:'salary',payee:'Test employee',amountMinor:'500',occurredAt:new Date().toISOString(),description:'Synthetic salary reference'};
 const expense=await call('panel/expense/create',cost);assert.equal((await call('panel/expense/create',cost)).id,expense.id);
 await assert.rejects(call('panel/expense/create',{...cost,requestId:randomUUID(),tenantId:'foreign-tenant'}),e=>['FORBIDDEN','INVALID_INPUT'].includes(e.code));
 const report=await call('panel/admin-finance');assert.equal(report.operatingMargin,'400');assert.equal(report.totalCosts,'500');assert.equal(report.canManage,true);assert.equal(report.fxProfit,'0');assert.equal(report.fxBasis,'aggregate-locked-account-rates');
 assert.ok(report.rows.some(r=>r.id===merchant.id));assert.equal(report.expenses.length,1);
 await call('panel/expense/void',{id:expense.id,reason:'Synthetic reversal'});const updated=await call('panel/admin-finance');assert.equal(updated.operatingMargin,'900');assert.equal(updated.expenses[0].void_reason,'Synthetic reversal');
 const audit=await call('panel/admin-audit');assert.ok(audit.rows.some(r=>r.action==='account_created_by_admin'));
 const nav=await call('navigation');assert.ok(nav.groups.flatMap(g=>g.children).some(p=>p.destinationId==='admin-finance.salary'));
 await assert.rejects(call('panel/admin-finance',{from:'2020-01-01',to:'2026-01-01'}),{code:'INVALID_INPUT'});
});
