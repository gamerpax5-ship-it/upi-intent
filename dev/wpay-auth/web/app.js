"use strict";
const $ = id => document.getElementById(id), L = globalThis.WPayLocales;
const entryRole=document.querySelector('meta[name="wpay-entry-role"]')?.content;
const apiRoot='/wpay-auth/'+(entryRole?'roles/'+entryRole+'/':'');
let explicitLocale;
try { explicitLocale = localStorage.getItem("wpay-locale"); } catch { /* Preference only. */ }
let locale = L.choose(explicitLocale,null,navigator.language), mode = "login", stage = null, account = null, busy = false, destination, lastActivity = Date.now(), pendingNavigation = null;
const tr = key => ['admin','super_admin'].includes(account?.accountType) && key==='error.RECENT_MFA_REQUIRED' ? 'Open Account settings and confirm your password, then retry.' : globalThis.WPayPayoutLocales?.error(locale,key) || L.translate(locale,key);
function el(tag,text,className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function button(key,callback,className) { const node = el("button",tr(key),className); node.type = "button"; node.onclick = callback; return node; }
function field(form,key,type = "text",options) {
  const label = el("label",tr(key)), input = el(options ? "select" : "input"); input.name = key; input.required = true;
  if (options) for (const [value,title] of options) { const option = el("option",title); option.value = value; input.append(option); } else input.type = type;
  if (type === "password") input.autocomplete = "current-password";
  if (key === "code") { input.inputMode = "numeric"; input.pattern = "[0-9]{6}"; input.maxLength = 6; input.autocomplete = "one-time-code"; }
  label.append(input); form.append(label); return input;
}
function message(key = "") {
  $("message").textContent = key ? tr(key) : "";
  const dialog = $("approval-dialog");
  if (dialog.open) { let status = dialog.querySelector('[role="status"]'); if (!status) { status = el("p",undefined,"notice"); status.setAttribute("role","status"); dialog.append(status); } status.textContent = key ? tr(key) : ""; }
}
function applyLocale() { document.documentElement.lang = locale; $("language").value = locale; $("language").setAttribute("aria-label",tr("language")); document.querySelectorAll("[data-i18n]").forEach(node => { node.textContent = tr(node.dataset.i18n); }); }
function showLogin() { globalThis.WPayReferenceUi?.lock(); account = null; stage = null; destination = undefined; load.session = null; post.csrf = null; pendingNavigation = null; $("auth").hidden = false; $("workspace").hidden = true; $("navigation").replaceChildren(); $("page-content").replaceChildren(); renderAccess(); }
async function request(route,method = "GET",body,csrf) {
  let response,value;
  const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 20000);
  try { response = await fetch(apiRoot + route,{signal:abort.signal,method,credentials:"same-origin",cache:"no-store",headers:method === "POST" ? {"Content-Type":"application/json",...(csrf ? {"X-WPay-CSRF-Token":csrf} : {})} : {},...(body === undefined ? {} : {body:JSON.stringify(body)})}); value=await response.json(); }
  catch { throw new Error("error.UNAVAILABLE"); }
  finally { clearTimeout(timeout); }
  if (!response.ok) { if (value.error === "AUTH_FAILED" && account) showLogin(); throw new Error("error." + (Object.hasOwn(L.dictionaries.en,"error." + value.error) || globalThis.WPayPayoutLocales?.hasError(value.error) ? value.error : "UNAVAILABLE")); }
  return value;
}
async function post(route,body = {}) {
  for(let attempt=0;attempt<2;attempt++){
    if(!post.csrf||post.csrf.until<Date.now())post.csrf={until:Date.now()+300000,promise:request("csrf","POST",{})};
    try{
      const csrf=await post.csrf.promise,result=await request(route,"POST",body,csrf.csrfToken);
      if(result.stage || /^(login|register|logout|logout-all|refresh|mfa\/|password\/)/.test(route))post.csrf=null;
      return result;
    }catch(error){post.csrf=null;if(error.message!=="error.CSRF_FAILED"||attempt)throw error;}
  }
}
async function action(callback) {
  if (busy) return; busy = true; message("loading"); $("workspace").setAttribute("aria-busy","true"); $("language").disabled = true;
  try { await callback(); } catch(error) { message(error.message.startsWith("error.") ? error.message : "error.UNAVAILABLE"); }
  finally { busy = false; $("workspace").setAttribute("aria-busy","false"); globalThis.WPayReferenceUi?.restoreAvailability(); $("language").disabled = false; if ($("message").textContent === tr("loading")) message(); globalThis.WPayReferencePresentation?.refresh(); if(pendingNavigation!==null){const next=pendingNavigation;pendingNavigation=null;navigate(next);} }
}
function renderAccess() {
  const root = $("access-card"); root.replaceChildren(); if (stage) return renderMfa(root);
  if(entryRole)root.append(el('p',tr(entryRole),'eyebrow'));
  root.append(el("h2",tr(mode === "register" ? "registerTitle" : "loginTitle"))); const form = el("form");
  if (mode === "register") { const input = field(form,"name"); input.maxLength = 100; input.autocomplete = "name"; }
  const email = field(form,"email","email"); email.autocomplete = "username"; email.maxLength = 254;
  const password = field(form,"password","password"); password.autocomplete = mode === "register" ? "new-password" : "current-password";
  const passwordKind=mode === "register" ? "establish" : "login"; globalThis.WPayPasswordPolicy.bind(password,locale,passwordKind);
  form.append(el("p",globalThis.WPayPasswordPolicy.text(locale,passwordKind),"hint"));
  if (mode === "register") { field(form,"accountType","text",entryRole?[[entryRole,tr(entryRole)]]:[["user",tr("user")],["merchant",tr("merchant")]]); form.append(el("p",tr("emailNote"),"hint")); }
  const submit = el("button",tr(mode === "register" ? "createAccount" : "login"),"primary"); submit.type = "submit"; form.append(submit);
  form.onsubmit = event => { event.preventDefault(); action(async () => {
    const data = Object.fromEntries(new FormData(form));
    try { const result = await post(mode,data); if (mode === "register") { mode = "login"; renderAccess(); message("registered"); } else await handleStage(result); }
    finally { password.value = ""; data.password = ""; }
  }); };
  root.append(form);if(!['admin','employee'].includes(entryRole))root.append(button(mode === "register" ? "switchLogin" : "switchRegister",() => { mode = mode === "register" ? "login" : "register"; renderAccess(); message(); },"text-button"));
  globalThis.WPayReferencePresentation?.login(root,mode,locale);
}
async function handleStage(result) {
  if (result.stage === "authenticated") { stage = null; $("access-card").replaceChildren(); return load(); }
  stage = {kind:result.stage,codes:result.recoveryCodes,requiresIst:result.requiresIst ?? stage?.requiresIst ?? entryRole==='admin'}; if (result.stage === "enroll") stage.setup = await post("mfa/setup");
  $("workspace").hidden = true; $("auth").hidden = false; renderAccess();
}
function renderMfa(root) {
  if(stage.kind==='password-reset'){
    const t=k=>globalThis.WPayCompletionLocales.text(locale,k),form=el('form');root.append(el('h2',t('resetTitle')),el('p',t('resetHelp'),'notice'));
    const inputs=[];for(const key of ['newPassword','confirmPassword']){const label=el('label',t(key)),input=el('input');input.type='password';input.autocomplete='new-password';input.required=true;globalThis.WPayPasswordPolicy.bind(input,locale,"privileged");label.append(input);form.append(label);inputs.push(input);}
    const submit=el('button',t('save'),'primary');submit.type='submit';form.append(submit);form.onsubmit=e=>{e.preventDefault();action(async()=>{if(inputs[0].value!==inputs[1].value){inputs[1].setCustomValidity(t('passwordMismatch'));inputs[1].reportValidity();inputs[1].oninput=()=>inputs[1].setCustomValidity('');return;}const body={password:inputs[0].value};inputs.forEach(i=>i.value='');try{await handleStage(await post('password/reset',body));}finally{body.password='';}});};root.append(form,button('backLogin',showLogin,'text-button'));return;
  }
  root.append(el("h2",tr(stage.kind === "enroll" ? "enrollTitle" : ["save-recovery","recovery-codes"].includes(stage.kind) ? "recoveryTitle" : "mfaTitle")));
  if (["save-recovery","recovery-codes"].includes(stage.kind)) {
    root.append(el("p",tr("recoverySave"),"notice")); const codes = el("pre",stage.codes.join("\n"),"recovery-codes"); codes.setAttribute("data-secret","true"); root.append(codes);
    root.append(button("saved",() => action(async () => { const kind = stage.kind; stage.codes.fill(""); codes.textContent = "";
      if (kind === "save-recovery") await handleStage(await post("mfa/complete",{saved:true})); else { stage = null; await load("security"); }
    }),"primary")); return;
  }
  if (stage.kind === "enroll") {
    root.append(el("p",tr("enrollHelp"))); const image = el("img"); image.src = stage.setup.qrDataUrl; image.alt = tr("qrAlt"); image.setAttribute("data-secret","true");
    const key = el("code",stage.setup.setupKey,"setup-key"); key.setAttribute("data-secret","true"); root.append(image,el("p",tr("setupKey")),key);
  }
  const recover = stage.kind === "recover", form = el("form"); if (recover) root.append(el("p",tr("recoveryHelp")));
  const code = field(form,recover ? "recoveryCode" : "code",recover ? "password" : "text");
  let istCode;
  if(stage.requiresIst){const label=el('label','Indian time code (HHmm)'),input=el('input');input.name='istCode';input.type='text';input.inputMode='numeric';input.pattern='[0-9]{4}';input.maxLength=4;input.required=true;input.autocomplete='off';input.placeholder='e.g. 1901';label.append(input);form.append(label,el('p','Enter current Indian time in 24-hour format. 7:01 PM = 1901. If the minute changes, enter the new minute. This check does not replace your authenticator.','hint'));istCode=input;}
  const submit = el("button",tr(recover ? "recover" : "verify"),"primary"); submit.type = "submit"; form.append(submit);
  form.onsubmit = event => { event.preventDefault(); action(async () => { const value = code.value,timeValue=istCode?.value; code.value = ""; if(istCode)istCode.value=""; await handleStage(await post(recover ? "mfa/recover" : "mfa/verify",{[recover ? "recoveryCode" : "code"]:value,...(istCode?{istCode:timeValue}:{})})); }); }; root.append(form);
  if (stage.kind === "challenge") root.append(button("recovery",() => { stage = {kind:"recover",requiresIst:stage.requiresIst}; renderAccess(); },"text-button"));
  root.append(button("backLogin",showLogin,"text-button"));
}
function profile() {return globalThis.WPayCompletionPage.render({permission:'profile.view',account,locale,request,post,action,el,container:$("page-content"),title:$("page-title")});}
async function adminAccountSettings(){
 const value=await request('security'),root=el('section',undefined,'card');$('page-title').textContent='Account settings';
 root.append(el('h2','Email & password'),el('p',`Signed in as ${account.email}`),el('p','Confirm your current password to make changes. Other sessions will be signed out.','notice'));
 const input=(form,label,type,autocomplete)=>{const wrap=el('label',label),i=el('input');i.type=type;i.required=true;i.autocomplete=autocomplete;wrap.append(i);form.append(wrap);return i;};
 for(const kind of ['email','password','reauth']){
  const form=el('form');form.append(el('h3',kind==='reauth'?'Confirm password for sensitive actions':`Change ${kind}`));
  const current=input(form,'Current password','password','current-password');let next,confirm;
  if(kind!=='reauth'){
   next=input(form,kind==='email'?'New email':'New password',kind==='email'?'email':'password',kind==='email'?'email':'new-password');
   confirm=input(form,kind==='email'?'Confirm new email':'Confirm new password',kind==='email'?'email':'password',kind==='email'?'email':'new-password');
   if(kind==='password'){next.minLength=15;next.maxLength=128;form.append(el('p','Use at least 15 characters.','hint'));}
   confirm.oninput=()=>confirm.setCustomValidity('');next.oninput=()=>confirm.setCustomValidity('');
  }
  const submit=el('button',kind==='reauth'?'Confirm password':`Update ${kind}`,'primary');submit.type='submit';form.append(submit);
  form.onsubmit=e=>{e.preventDefault();action(async()=>{
   if(next&&next.value!==confirm.value){confirm.setCustomValidity('Values must match.');confirm.reportValidity();return;}
   if(!form.reportValidity())return;
   const body={password:current.value,...(next?{[kind==='email'?'newEmail':'newPassword']:next.value}:{})};
   current.value='';if(next)next.value=confirm.value='';
   try{const result=await post('security/admin-'+kind,body);if(result.stage)await handleStage(result);await load('security');message('decisionSaved');}finally{for(const key of Object.keys(body))body[key]='';}
  });};root.append(form);
 }
 root.append(el('h3','Active sessions'));for(const s of value.sessions)root.append(el('p',`${s.current?'This session · ':''}Created: ${s.createdAt} · Expires: ${s.expiresAt}`));
 root.append(button('logoutAll',()=>action(logoutAll)));$('page-content').replaceChildren(root);
}
async function security() {
  if(['admin','super_admin'].includes(account.accountType))return adminAccountSettings();
  const value = await request("security"), root = el("section",undefined,"card"); $("page-title").textContent = tr("security"); root.append(el("p",tr(value.enabled ? "securityEnabled" : "enrollTitle")),el("p",tr("freshHelp"),"notice"));
  const form = el("form"), password = field(form,"password","password"), code = field(form,"code");
  for (const route of ["replace","regenerate","stepup"]) form.append(button(route,() => action(async () => {
    if (!form.reportValidity()) return; const body = {password:password.value,code:code.value}; password.value = code.value = "";
    try { const result = await post("security/" + route,body); if (result.stage) await handleStage(result); else { await load("security"); message("decisionSaved"); } } finally { body.password = body.code = ""; }
  })));
  root.append(form,el("h3",tr("sessions"))); for (const session of value.sessions) root.append(el("p",`${session.current ? tr("current") + " · " : ""}${tr("created")}: ${session.createdAt} · ${tr("expires")}: ${session.expiresAt}`));
  if (["user","merchant"].includes(account.accountType)) {
    const P=globalThis.WPayPasswordPolicy,change=el('form');change.append(el('h3',P.text(locale,'change')),el('p',P.text(locale,'changeHelp'),'notice'));
    const current=field(change,'password','password'),fresh=field(change,'code');P.bind(current,locale,'login');const inputs=[];
    for(const key of ['newPassword','confirmPassword']){const label=el('label',P.text(locale,key)),input=el('input');input.type='password';input.required=true;input.autocomplete='new-password';P.bind(input,locale,'establish');label.append(input);change.append(label);inputs.push(input);}
    change.append(el('p',P.text(locale,'establish'),'hint'));const submit=el('button',P.text(locale,'change'));submit.type='submit';change.append(submit);
    change.onsubmit=e=>{e.preventDefault();action(async()=>{if(inputs[0].value!==inputs[1].value){inputs[1].setCustomValidity(P.text(locale,'mismatch'));inputs[1].reportValidity();return;}if(!change.reportValidity())return;const body={password:current.value,code:fresh.value,newPassword:inputs[0].value};current.value=fresh.value='';inputs.forEach(i=>i.value='');try{await handleStage(await post('security/password',body));}finally{body.password=body.code=body.newPassword='';}});};root.append(change);
  }
  root.append(button("logoutAll",() => action(logoutAll))); $("page-content").replaceChildren(root);
}
async function apk() {
  const data=await request("apk"),root=el("section",undefined,"card");$("page-title").textContent=tr("apkTitle");
  const facts=el("dl",undefined,"facts");
  for(const [key,value] of [["version",data.version+" / "+data.build],["package",data.package],["minimumAndroid",data.minimumAndroidApi],
    ["fileSize",data.bytes],["sha256",data.sha256],["apkSigner",data.signing.identity],["refreshedAt",data.refreshedAt]]){
    const group=el("div");group.append(el("dt",tr(key)),el("dd",String(value)));facts.append(group);
  }
  const download=el("a",tr("downloadApk"),"primary");download.href=apiRoot+"apk/download";download.download="WPAY-Agent.apk";
  root.append(facts,el("p",tr("apkEvidence"),"notice"),download);$("page-content").replaceChildren(root);
}
async function sources() {
  const data=await request("resources"),root=el("section",undefined,"card");$("page-title").textContent=tr(account.accountType==="user"?"linkedSources":"mappedOrders");
  const sourceState=data.otpState==='no_linked_device'?'noLinkedDevice':data.otpState==='source_unavailable'?'otpSourceUnavailable':data.sourceConnected?'sourceScopeRequired':'sourceDisconnected';
  root.append(el("p",tr(sourceState),"notice"),el("p",tr("observationOnly")));
  const kinds=account.accountType==="user"?["device","receiving_account","statement_import"]:["order","payment_link","merchant_assignment"];
  const form=el("form"),kind=field(form,"resourceKind","text",kinds.map(value=>[value,tr("kind."+value)])),reference=field(form,"resourceReference");
  reference.maxLength=100;reference.pattern="[A-Za-z0-9_-]{1,100}";
  const label=el("label"),consent=el("input");consent.type="checkbox";consent.required=true;label.append(consent,document.createTextNode(tr("sourceConsent")));form.append(label);
  const submit=el("button",tr("requestLink"));submit.type="submit";form.append(submit);
  form.onsubmit=event=>{event.preventDefault();action(async()=>{await post("resources/request",{requestId:crypto.randomUUID(),kind:kind.value,reference:reference.value,consent:consent.checked});await sources();message("linkPending");});};
  root.append(form);
  for(const link of data.links){const item=el("article",undefined,"application-row");item.append(el("h3",tr("kind."+link.kind)),el("p",link.reference),el("p",tr("link."+link.status)));
    item.append(button("revokeLink",()=>action(async()=>{await post("resources/revoke",{linkId:link.id});await sources();})));
    if(link.readable&&data.sourceConnected){const views={device:["device","otp","transactions"],statement_import:["statement"],order:["order"],payment_link:["order"]};
      for(const view of views[link.kind]||[])item.append(button("view."+view,()=>action(()=>sourceView(link,view))));
    }
    root.append(item);
  }
  $("page-content").replaceChildren(root);
}
async function sourceView(link,view,before=null){
  const data=await post("resources/read",{linkId:link.id,view,before}),root=el("section",undefined,"card");
  $("page-title").textContent=tr("view."+view);root.append(el("p",tr("observationOnly"),"notice"));
  if(data.device){root.append(el("p",tr("lastSeen")+": "+data.device.last_seen_at),el("p",tr("deviceStatus")+": "+data.device.status));}
  for(const row of data.rows||[]){const item=el("article",undefined,"application-row");
    // Server returns an explicit projection; render text only, never HTML.
    for(const key of ["id","code","sms_received_at","created_at","amount","utr","submitted_utr","legacy_status","matched_at","verified_at"]){
      if(row[key]!==undefined&&row[key]!==null)item.append(el("p",tr("event."+key)+": "+row[key]));
    }
    root.append(item);
  }
  if(!data.device&&!data.rows?.length)root.append(el("p",tr("noSourceRows")));
  if(data.nextCursor)root.append(button("next",()=>action(()=>sourceView(link,view,data.nextCursor))));
  root.append(button("backSources",()=>action(sources)));$("page-content").replaceChildren(root);
}
async function pending(page,offset = 0) {
  const users = page.permissionId === "users.view", route = users ? "pending-users" : "pending-merchants", result = await request(route + "?offset=" + offset), root = el("section",undefined,"card");
  $("page-title").textContent = tr(users ? "pendingUsers" : "pendingMerchants"); root.append(el("p",tr("pendingList"),"notice")); if (!result.accounts.length) root.append(el("p",tr("noAccounts")));
  for (const item of result.accounts) { const row = el("article",undefined,"application-row"); row.append(el("h3",item.name),el("p",item.email),el("span",tr(item.approvalStatus),"badge"),button("review",() => action(() => review(item,page,offset)))); root.append(row); }
  if (offset) root.append(button("previous",() => action(() => pending(page,Math.max(0,offset-100))))); if (result.nextOffset !== null) root.append(button("next",() => action(() => pending(page,result.nextOffset)))); $("page-content").replaceChildren(root);
}
async function review(item,page,offset) {
  const options = await request("approval-options"), dialog = $("approval-dialog"); dialog.replaceChildren(el("h2",tr("review")),el("p",item.name));
  const form = el("form"), fields = item.accountType === "user" ? ["payinCommission","payoutCommission","inrPerUsdt","depositNetwork","depositAddress"] : ["payinFee","payoutFee","fixedPayoutFee","fixedFeeCurrency","inrPerUsdt"];
  for (const key of fields) { const choices = key === "depositNetwork" ? options.depositNetworks.map(network => [network,network]) : key === "fixedFeeCurrency" ? [[options.fixedFeeCurrency || "",options.fixedFeeCurrency || tr("unavailable")]] : undefined;
    const input = field(form,key,"text",choices); if (!choices && key !== "depositAddress") input.inputMode = "decimal"; if(key==="fixedPayoutFee")input.value="6";
  }
  if (item.accountType === "merchant" && !options.fixedFeeCurrency) dialog.append(el("p",tr("currencyMissing"),"notice"));
  let requestId = crypto.randomUUID(), previousPayload;
  async function decide(decision) {
    const data = Object.fromEntries(new FormData(form)), body = {requestId,accountId:item.id,decision,settings:decision === "approve" ? Object.fromEntries(fields.map(key => [key,data[key]])) : null,reason:decision === "reject" ? data.reason : ""};
    const payload = JSON.stringify({...body,requestId:null}); if (previousPayload && previousPayload !== payload) requestId = crypto.randomUUID(); body.requestId = requestId; previousPayload = payload;
    await post("approval",body); dialog.close(); await load(page.destinationId); message("decisionSaved");
  }
  form.append(button("saveApproval",() => action(async () => { for (const key of fields) if (!form.elements[key].reportValidity()) return; await decide("approve"); }),"primary"));
  const reason = field(form,"reason"); reason.required = false; reason.maxLength = 500; form.append(button("reject",() => action(() => decide("reject"))),button("cancel",() => dialog.close())); dialog.append(form); dialog.showModal();
}
function navigate(selected) {
  if(busy){pendingNavigation=selected;message('loading');return;}
  return action(()=>load(selected,true));
}
async function load(selected = destination, reuseSession = false) {
  let navigation;
  if(reuseSession && typeof account !== 'undefined' && account && load.session && Date.now()<load.session.until){
    navigation=load.session.navigation;
  }else{
    const values=await Promise.all([request("me"),request("navigation")]);account=values[0];navigation=values[1];
    load.session={navigation,until:Date.now()+15000};
  }
  locale = L.choose(explicitLocale,account.accountType === "merchant" ? account.locale : null,navigator.language);
  if (account.accountType === "merchant" && L.supported.includes(explicitLocale) && account.locale !== explicitLocale) { await post("locale",{locale:explicitLocale}); account.locale = explicitLocale; }
  applyLocale();
  stage = null; $("access-card").replaceChildren(); $("auth").hidden = true; $("workspace").hidden = false; $("account-type").textContent = tr(account.accountType); $("approval-badge").textContent = tr(["user","merchant"].includes(account.accountType) ? account.approvalStatus : account.status); $("navigation").replaceChildren();
  for (const group of navigation.groups) { const node = el("details"); node.open = true; node.append(el("summary",(group.id.startsWith("operations.group.") || group.id.startsWith("parking.group.") || group.id.endsWith(".transactions")) ? group.label : group.id === "payout.group.operations" ? globalThis.WPayPayoutLocales.text(locale,"group") : tr("group." + group.id.split(".").at(-1)))); for (const page of group.children) {const item=button("nav." + page.permissionId,() => action(() => load(page.destinationId)),"nav-item");if(page.destinationId.startsWith('user.onboarding-'))item.textContent=globalThis.WPayOnboardingPage.label(locale,page.destinationId);if(page.destinationId==='gateway.orders')item.textContent=globalThis.WPayGatewayPage.text(locale,account.accountType==='merchant'?'entry':'title');if(page.destinationId.startsWith('payout.'))item.textContent=globalThis.WPayPayoutLocales.text(locale,page.destinationId.split('.').at(-1));if(page.destinationId.startsWith('operations.')||page.destinationId.startsWith('parking.'))item.textContent=page.label;node.append(item);} $("navigation").append(node); }
  globalThis.WPayAdminUi?.sync(account,navigation,selected);
  if(globalThis.WPayAdminUi && (!selected || navigation.groups.flatMap(g=>g.children).find(p=>p.destinationId===selected)?.permissionId==='overview.view')){destination=selected;return globalThis.WPayAdminUi.overview({account,request,post,action,el,container:$('page-content'),title:$('page-title'),navigate});}
  if(globalThis.WPayReferenceUi) selected=globalThis.WPayReferenceUi.sync(account,navigation,selected);
  destination = globalThis.WPayReferenceUi ? "ui:"+globalThis.WPayReferenceUi.section : selected; const page = navigation.groups.flatMap(group => group.children).find(page => page.destinationId === selected);
  const referenceSection=globalThis.WPayReferenceUi?.section;
  if(globalThis.WPayReferencePresentation)globalThis.WPayReferencePresentation.begin(account,referenceSection);
  if(page?.destinationId==='administration.admin-upi')return globalThis.WPayAdminUpi.render({post,action,el,container:$('page-content'),title:$('page-title')});
  if(referenceSection==='fees'&&account.accountType==='merchant')return globalThis.WPayReferencePresentation.fees({request,post,action,el,container:$("page-content")});
  if(referenceSection==='transactions'&&account.accountType==='user')return globalThis.WPayReferenceHistory.render({groups:navigation.groups,request,post,action,el,container:$("page-content"),title:$("page-title")});
  if(referenceSection==='settings')return globalThis.WPayReferenceUi.settings();
  if(page && ["user.overview.view","merchant.overview.view"].includes(page.permissionId))return (globalThis.WPayReferenceDashboard||globalThis.WPayRoleDashboard).render({account,locale,request,post,action,el,groups:navigation.groups,container:$("page-content"),title:$("page-title")});
  if (selected === "security" || page?.permissionId === "account_security.view") return security(); if(page && globalThis.WPayAdminPages?.supports(page.permissionId,account))return globalThis.WPayAdminPages.render({permission:page.permissionId,account,locale,request,post,action,el,container:$('page-content'),title:$('page-title'),review:item=>review(item,page,0),navigate}); if(page && !page.destinationId.startsWith('operations.') && globalThis.WPayCompletionPage.pages[page.permissionId])return globalThis.WPayCompletionPage.render({permission:page.permissionId,destination:page.destinationId,account,locale,request,post,action,el,container:$("page-content"),title:$("page-title"),review:item=>review(item,page,0)});
  if(page && ["user.apk.view","apk.view"].includes(page.permissionId))return apk();
  if(page?.permissionId.endsWith(".source_events.view"))return sources();
  if(page?.permissionId==='user.activation_codes.view')return globalThis.WPayOperationsPage.render({destination:'operations.activation',account,locale,request,post,action,el,container:$('page-content'),title:$('page-title')});
  if(page?.destinationId.startsWith('operations.'))return globalThis.WPayOperationsPage.render({destination:page.destinationId,account,locale,request,post,action,el,container:$('page-content'),title:$('page-title')});
  if(page?.destinationId==='gateway.orders'||page?.permissionId==='transactions.view')return globalThis.WPayGatewayPage.render({view:referenceSection,account,locale,request,post,action,el,container:$("page-content"),title:$("page-title")});
  if(page?.destinationId.startsWith('payout.'))return globalThis.WPayPayoutPage.render({view:referenceSection,destination:page.destinationId,account,locale,request,post,action,el,container:$("page-content"),title:$("page-title")});
  if(page?.destinationId.startsWith('parking.'))return globalThis.WPayParkingPage.render({destination:page.destinationId,account,locale,request,post,action,el,container:$("page-content"),title:$("page-title")});
  if(page?.permissionId==='merchant.api_docs.view')return globalThis.WPayGatewayPage.docs({locale,el,container:$("page-content"),title:$("page-title")});
  if(page?.destinationId.startsWith('user.onboarding-'))return globalThis.WPayOnboardingPage.render({destination:page.destinationId,locale,request,post,action,el,container:$("page-content"),title:$("page-title")});
  if(page && globalThis.WPayFundingPage.pages[page.permissionId]) return globalThis.WPayFundingPage.render({permission:page.permissionId,account,locale,request,post,action,el,container:$("page-content"),title:$("page-title")});
  if(page && globalThis.WPayBusinessPage.pages[page.permissionId]) return globalThis.WPayBusinessPage.render({permission:page.permissionId,account,locale,request,post,action,el,container:$("page-content"),title:$("page-title")});
  if((!page||["user.overview.view","merchant.overview.view"].includes(page.permissionId))&&["user","merchant"].includes(account?.accountType)&&globalThis.WPayRoleDashboard?.render)return (globalThis.WPayReferenceDashboard||globalThis.WPayRoleDashboard).render({account,locale,request,post,action,el,groups:navigation.groups,container:$("page-content"),title:$("page-title")});
  if (!page || ["profile.view","overview.view"].includes(page.permissionId)) return profile();
  throw new Error("error.NOT_FOUND");
}
async function changeLocale(value) {
  if (!L.supported.includes(value)) return; explicitLocale = locale = value; try { localStorage.setItem("wpay-locale",value); } catch { /* Preference only. */ } applyLocale();
  if (account?.accountType === "merchant" && !stage) { await post("locale",{locale:value}); await load(); message("languageSaved"); } else if (account && !stage) await load(); else renderAccess();
}
async function logoutAll() { await post("logout-all"); showLogin(); message("loggedOut"); }
$("language").onchange = () => action(() => changeLocale($("language").value)); $("account-home").onclick = () => action(() => load(null));
const roleTheme=document.getElementById('role-theme'),roleNotifications=document.getElementById('role-notifications'),roleProfile=document.getElementById('role-profile');
if(roleTheme){let saved;try{saved=localStorage.getItem('wpay-role-theme');}catch{/* Preference only. */}if(saved==='light')document.documentElement.classList.add(globalThis.WPayReferenceUi?'light':'role-light');roleTheme.onclick=()=>{const themeClass=globalThis.WPayReferenceUi?'light':'role-light';document.documentElement.classList.toggle(themeClass);try{localStorage.setItem('wpay-role-theme',document.documentElement.classList.contains(themeClass)?'light':'dark');}catch{/* Preference only. */}};}
if(roleNotifications)roleNotifications.onclick=()=>navigate((entryRole||account?.accountType)+'.notifications');
if(roleProfile)roleProfile.onclick=()=>navigate((entryRole||account?.accountType)+'.profile');
$("logout").onclick = () => action(async () => { await post("logout"); showLogin(); message("loggedOut"); }); $("logout-all").onclick = () => action(logoutAll);
for (const event of ["pointerdown","keydown"]) document.addEventListener(event,() => { lastActivity = Date.now(); },{passive:true});
setInterval(() => { if (account && !stage && !busy && document.visibilityState === "visible" && Date.now()-lastActivity < 300000) action(() => post("refresh")); },300000);
globalThis.WPayReferenceUi?.connect({load,action,navigate});
globalThis.WPayAdminUi?.connect({load,action,navigate});
applyLocale(); renderAccess(); action(async()=>{try{await load();}catch(error){showLogin();if(error.message!=="error.AUTH_FAILED")message(error.message);}});
