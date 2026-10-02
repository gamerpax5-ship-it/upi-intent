'use strict';
/* Merchant-only presentation. All permissions, routing, balances and posting stay server-owned. */
globalThis.WPayMerchantPremium = { start() {
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)], root='/wpay-auth/roles/merchant/';
const i18n=globalThis.WPayMerchantI18n; i18n.init(document);
const t=(key,params)=>i18n.t(key,params), ui=(key,params)=>i18n.html(key,params), uiText=(selector,key,params)=>i18n.text($(selector),key,params);
const state={account:null,page:'dashboard',csrf:null,cache:new Map(),pending:new Map(),epoch:0,offsets:{},bulk:null,security:null,apiSecret:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString(i18n.locale==='en'?'en-IN':i18n.locale,{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})+' IST':'—';
function decimal(v,scale=2){if(v===null||v===undefined)return '—';const b=BigInt(v),s=(b<0n?-b:b).toString().padStart(scale+1,'0');return (b<0n?'-':'')+s.slice(0,-scale)+'.'+s.slice(-scale);}
const money=(v,c='INR')=>v===undefined||v===null?'—':(c==='INR'?globalThis.WPayRoleDashboard.money(v):decimal(v,c==='USDT'?6:2)+' '+c);
function minor(v,scale=2){if(!new RegExp('^(0|[1-9][0-9]*)(\\.[0-9]{1,'+scale+'})?$').test(String(v)))throw Error(t('Enter a valid amount with up to {scale} decimal places.',{scale}));const [a,b='']=String(v).split('.');return (BigInt(a)*10n**BigInt(scale)+BigInt(b.padEnd(scale,'0'))).toString();}
const human=v=>String(v??'—').replaceAll('_',' ');
const pill=v=>'<span class="pill '+(['successful','completed','delivered','approved','active'].includes(v)?'ok':['failed','rejected','expired','cancelled'].includes(v)?'bad':'info')+'">'+ui(human(v))+'</span>';
const button=(label,action,id='',extra='',raw=false)=>'<button type="button" class="btn sm ghost" data-action="'+esc(action)+'" data-id="'+esc(id)+'" '+extra+'>'+(raw?esc(label):ui(label))+'</button>';
const cells=a=>'<tr>'+a.map(v=>'<td>'+v+'</td>').join('')+'</tr>';
// Expense/reservation books grow by credit internally, but reduce Merchant available funds.
function balanceDirection(r){const expense=['merchant_platform_fee','merchant_payout_fee','merchant_hold','merchant_payout_reserved','merchant_payout_principal','merchant_settlement_reserved','merchant_settlement_principal'].includes(r.ledger_type);return expense?(r.direction==='credit'?'debit':'credit'):r.direction;}
function rows(id,data,render){$('#'+id).innerHTML=data.length?data.map(render).join(''):'<tr><td colspan="12"><div class="empty"><span data-i18n="No records found">No records found</span></div></td></tr>';}
function text(s,v){const n=$(s);if(n)n.textContent=v??'—';}
function facts(obj){return '<div class="facts">'+Object.entries(obj).map(([k,v])=>'<div class="fact"><label>'+ui(k)+'</label><strong>'+(['Status','Origin','Webhook','Payout destination'].includes(k)?ui(v??'—'):esc(v??'—'))+'</strong></div>').join('')+'</div>';}
function toast(v){uiText('#toast',v);$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),5000);}
const apiCopyIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="10" height="10" rx="2"/><rect x="5" y="5" width="10" height="10" rx="2"/></svg>';
const apiEyeIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
const apiEyeOffIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 6.2A11.8 11.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.1 3.8M6.2 6.2C3.5 8.2 2 12 2 12s3.5 6 10 6a11 11 0 0 0 4.1-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function bindApiSecretControls(id){const input=$('#'+id),copy=$('#'+id+'Copy'),toggle=$('#'+id+'Toggle');if(!input||!copy||!toggle)return;copy.innerHTML=apiCopyIcon;copy.onclick=async()=>{await navigator.clipboard.writeText(input.value);toast('API key copied.');};toggle.onclick=()=>{const visible=input.type==='text';input.type=visible?'password':'text';toggle.innerHTML=visible?apiEyeIcon:apiEyeOffIcon;toggle.title=visible?'Show API key':'Hide API key';toggle.setAttribute('aria-label',toggle.title);};}
function apiSecretMarkup(id,secret){return '<div class="field"><label for="'+id+'">'+ui('Full API key')+'</label><div style="display:flex;align-items:center;gap:8px"><input class="control mono" id="'+id+'" type="text" readonly autocomplete="off" value="'+esc(secret)+'" style="flex:1;min-width:0"><button class="icon-btn" id="'+id+'Copy" type="button" aria-label="Copy API key" title="Copy API key" style="width:38px;height:38px">'+apiCopyIcon+'</button><button class="icon-btn" id="'+id+'Toggle" type="button" aria-label="Hide API key" title="Hide API key" style="width:38px;height:38px">'+apiEyeOffIcon+'</button></div></div>';}
function showApiSecret(secret){state.apiSecret=secret;const card=$('#apiKeySecretCard'),input=$('#apiKeySecretValue');if(!card||!input)return;input.value=secret;input.type='text';card.hidden=false;bindApiSecretControls('apiKeySecretValue');}
function clearApiSecret(){state.apiSecret=null;const card=$('#apiKeySecretCard'),input=$('#apiKeySecretValue');if(input){input.value='';input.type='text';}if(card)card.hidden=true;}
const errors={AUTH_FAILED:'Your session expired or the sign-in details are incorrect. Please sign in again.',FORBIDDEN:'This action is not available for your account. Check approval and permissions with Admin.',UNAVAILABLE:'The service is temporarily unavailable. Please retry.',RATE_LIMITED:'Too many attempts. Please wait before retrying.',MFA_FAILED:'Authenticator code was not accepted. Use a fresh code.',INVALID_INPUT:'Check the form values and try again.',CONFLICT:'The record changed or the reference is already used. Refresh and check before retrying.',INSUFFICIENT_BALANCE:'Available balance is insufficient, including fees and reserved funds.',NO_ROUTE:'No eligible assigned route is available for this amount. No payment link was created.',RECENT_MFA_REQUIRED:'Please confirm your identity to continue.',MERCHANT_FX_UNCONFIGURED:'Admin has not configured your USDT rate.',TIMEOUT:'The response timed out. Retry the same form to safely check the original request.'};
function message(e){return errors[e.code]||e.message||'Request failed. Please retry.';}
async function request(route,method='GET',body,token){const owner=state.account?.id,abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);try{const r=await fetch(root+route,{method,credentials:'same-origin',cache:'no-store',signal:abort.signal,headers:method==='POST'?{'Content-Type':'application/json',...(token?{'X-WPay-CSRF-Token':token}:{})}:{},...(body===undefined?{}:{body:JSON.stringify(body)})});let d;try{d=await r.json();}catch{throw Object.assign(Error('Service returned an invalid response.'),{code:'UNAVAILABLE'});}if(owner&&state.account?.id!==owner)throw Object.assign(Error('Account changed; response discarded.'),{code:'STALE_RESPONSE'});if(!r.ok||d.failure||d.error)throw Object.assign(Error(d.error||d.failure||'UNAVAILABLE'),{code:d.error||d.failure||'UNAVAILABLE'});return d;}catch(e){if(e.name==='AbortError')throw Object.assign(Error('TIMEOUT'),{code:'TIMEOUT'});throw e;}finally{clearTimeout(timer);}}
async function post(route,body={}){for(let attempt=0;attempt<2;attempt++){if(!state.csrf)state.csrf=request('csrf','POST',{});try{const token=await state.csrf,d=await request(route,'POST',body,token.csrfToken);if(d.stage||/^(login|register|logout|refresh|mfa\/|password\/)/.test(route))state.csrf=null;return d;}catch(e){state.csrf=null;if(e.code!=='CSRF_FAILED'||attempt)throw e;}}}
function cached(route){let p=state.cache.get(route);if(!p){p=request(route).catch(e=>{state.cache.delete(route);throw e;});state.cache.set(route,p);p.finally(()=>{if(state.cache.get(route)===p)state.cache.delete(route);}).catch(()=>{});}return p;}
function invalidate(){state.cache.clear();}
async function mutate(route,body){try{const d=await post(route,body);invalidate();return d;}catch(e){if(e.code!=='RECENT_PASSWORD_REQUIRED')throw e;await reauthenticate();const d=await post(route,body);invalidate();return d;}}
// Retain a key after errors/timeouts; replace only on success or changed payload.
async function idempotent(route,body,key='idempotencyKey'){const signature=JSON.stringify(body),previous=state.pending.get(route);const entry=previous?.signature===signature?previous:{signature,id:crypto.randomUUID()};state.pending.set(route,entry);const d=await mutate(route,{...body,[key]:entry.id});state.pending.delete(route);return d;}
async function run(node,fn){if(node?.dataset.busy)return;const controls=node?.matches('form')?[...node.querySelectorAll('button')]:node?[node]:[];const before=controls.map(x=>x.disabled);if(node)node.dataset.busy='true';controls.forEach(x=>x.disabled=true);let errorBox=node?.matches('form')?node.querySelector('.form-error'):null;if(node?.matches('form')&&!errorBox){errorBox=document.createElement('p');errorBox.className='form-error';errorBox.setAttribute('role','alert');node.append(errorBox);}if(errorBox)i18n.text(errorBox,'');try{return await fn();}catch(e){if(errorBox)i18n.text(errorBox,message(e));toast(message(e));if(e.code==='AUTH_FAILED'&&state.account)showLogin();}finally{controls.forEach((x,i)=>x.disabled=before[i]);if(node)delete node.dataset.busy;}}
function bindForm(id,fn){$('#'+id).addEventListener('submit',e=>{e.preventDefault();run(e.currentTarget,fn);});}
let modalResolve=null,previousFocus=null;
function closeModal(){if(modalResolve){modalResolve.reject(Error('Confirmation cancelled.'));modalResolve=null;}$('#modalBg').classList.remove('open');$('#modalBody').replaceChildren();previousFocus?.focus();}
function modal(title,subtitle,body){previousFocus=document.activeElement;uiText('#modalTitle',title);text('#modalSubtitle',subtitle);$('#modalBody').innerHTML=body;$('#modalBg').classList.add('open');$('#modalBody input, #modalBody button, #modalClose')?.focus();}
function field(id,label,type='text',required=true,value=''){return '<div class="field"><label for="'+id+'">'+ui(label)+'</label><input class="control" id="'+id+'" type="'+type+'" '+(required?'required':'')+' value="'+esc(value)+'" autocomplete="'+(type==='password'?'current-password':'off')+'"></div>';}
function promptForm(title,body,fn,label='Confirm'){modal(title,'', '<form id="modalForm">'+body+'<p class="form-error" role="alert"></p><button class="btn primary" style="margin-top:14px">'+ui(label)+'</button></form>');bindForm('modalForm',fn);}
async function reauthenticate(){return new Promise((resolve,reject)=>{promptForm('Confirm password',field('stepPassword','Current password','password'),async()=>{const password=$('#stepPassword').value;$('#stepPassword').value='';await post('security/stepup',{password});modalResolve=null;closeModal();resolve();});modalResolve={reject};});}
function download(name,data,type='text/csv;charset=utf-8'){const u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
const csvCell=v=>'"'+String(v??'').replace(/^[\s]*[=+\-@]/,m=>"'"+m).replaceAll('"','""')+'"';
function csv(data){if(!data.length)return 'No records\r\n';const keys=Object.keys(data[0]);return [keys,...data.map(r=>keys.map(k=>r[k]))].map(r=>r.map(csvCell).join(',')).join('\r\n');}
function showLogin(){document.body.classList.remove("auth-pending");clearApiSecret();state.account=null;state.csrf=null;state.security=null;state.bulk=null;state.settlement=null;state.analytics=null;state.tickets=[];state.notifications=[];state.pending.clear();state.offsets={};invalidate();state.epoch++;$$('#workspace tbody').forEach(n=>n.innerHTML='<tr><td colspan="12"><span data-i18n="Loading…">Loading…</span></td></tr>');for(const id of ['linkPreview','reviewDetail','ticketThread','notificationList','ticketList','sessionList'])$('#'+id).replaceChildren();$$('#workspace input').forEach(n=>{if(n.type!=='checkbox')n.value='';});$('#workspace').hidden=true;$('#workspace').classList.add('hidden');$('#loginView').classList.remove('hidden');$('#authStage').classList.add('hidden');$('#authStage').replaceChildren();$('#loginForm').classList.remove('hidden');$('#loginPassword').value='';closeModal();}
async function authStage(d){if(d.stage==='authenticated'){closeModal();return start();}$('#workspace').hidden=true;$('#workspace').classList.add('hidden');$('#loginView').classList.remove('hidden');$('#loginForm').classList.add('hidden');const host=$('#authStage');host.classList.remove('hidden');host.replaceChildren();if(d.stage==='enroll'){const setup=await post('mfa/setup');host.innerHTML='<h3><span data-i18n="Set up authenticator">Set up authenticator</span></h3><img alt="Authenticator setup QR" src="'+esc(setup.qrDataUrl)+'"><p class="secret">'+esc(setup.setupKey)+'</p>';}if(['save-recovery','recovery-codes'].includes(d.stage)){host.innerHTML='<h3><span data-i18n="Save your recovery codes">Save your recovery codes</span></h3><p><span data-i18n="Each code can be used once. Store them securely.">Each code can be used once. Store them securely.</span></p><pre class="secret">'+esc((d.recoveryCodes||[]).join('\n'))+'</pre><form id="recoveryAck"><label><input type="checkbox" required> <span data-i18n="I saved these codes securely">I saved these codes securely</span></label><button class="btn primary"><span data-i18n="Continue">Continue</span></button></form>';bindForm('recoveryAck',async()=>d.stage==='save-recovery'?authStage(await post('mfa/complete',{saved:true})):start());return;}
if(d.stage==='password-reset'){host.innerHTML='<h3><span data-i18n="Set your new password">Set your new password</span></h3><form id="resetForm">'+field('resetPassword','New password','password')+field('resetConfirm','Confirm new password','password')+'<button class="btn primary"><span data-i18n="Save password">Save password</span></button></form>';bindForm('resetForm',async()=>{checkPassword($('#resetPassword').value,$('#resetConfirm').value);await authStage(await post('password/reset',{password:$('#resetPassword').value}));});return;}
host.insertAdjacentHTML('beforeend','<form id="factorForm">'+field('factorCode',d.stage==='recover'?'Recovery code':'Authenticator code')+'<button class="btn primary"><span data-i18n="Verify">Verify</span></button></form><div class="actions">'+button('Use recovery code','recovery')+button('Back to sign in','back-login')+'</div>');bindForm('factorForm',async()=>authStage(await post(d.stage==='recover'?'mfa/recover':'mfa/verify',d.stage==='recover'?{recoveryCode:$('#factorCode').value}:{code:$('#factorCode').value})));
}
function checkPassword(p,confirmation=p){if(p!==confirmation)throw Error('Passwords must match.');if(!globalThis.WPayPasswordPolicy.valid(p,'establish'))throw Error(globalThis.WPayPasswordPolicy.text(i18n.locale,'establish'));}
async function start(){const account=await request('me');if(account.accountType!=='merchant')throw Error('Please sign in with a Merchant account.');state.account=account;i18n.setLocale(account.locale);syncLanguage();invalidate();$('#loginPassword').value='';$('#authStage').replaceChildren();$('#loginView').classList.add('hidden');$('#workspace').hidden=false;$('#workspace').classList.remove('hidden');document.body.classList.remove('auth-pending');const initials=account.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();text('.sidebar-foot strong',account.name);uiText('.sidebar-foot small','Merchant · {status}',{status:t(human(account.approvalStatus))});text('.sidebar-foot .avatar',initials);text('.merchant-chip strong',account.name);text('.merchant-chip-avatar',initials);uiText('.hero-kicker','Welcome, {name}',{name:account.name});const page=location.hash.slice(1);await navigate($('#page-'+page)?page:'dashboard');}
async function navigate(page,force=false){if(!state.account)return;if(!$('#page-'+page))return;if(state.page==='api'&&page!=='api')clearApiSecret();state.page=page;const epoch=++state.epoch;if(force)invalidate();$$('.page').forEach(n=>n.classList.toggle('active',n.id==='page-'+page));$$('.nav-item').forEach(n=>{n.classList.toggle('active',n.dataset.page===page);n.setAttribute('aria-current',n.dataset.page===page?'page':'false');});$('#sidebar').classList.remove('open');$('#mobileMenuBtn').setAttribute('aria-expanded','false');history.replaceState(null,'','#'+page);const host=$('#page-'+page);host.setAttribute('aria-busy','true');uiText('#pageStatus','Loading…');$('#pageStatus').classList.remove('error');try{await loaders[page]();if(epoch===state.epoch)uiText('#pageStatus',state.account.approvalStatus!=='approved'?'Updated {date} · Account {status}':'Updated {date}',{date:date(new Date()),status:t(human(state.account.approvalStatus))});}catch(e){if(epoch===state.epoch){uiText('#pageStatus',message(e));$('#pageStatus').classList.add('error');}if(e.code==='AUTH_FAILED')showLogin();}finally{host.removeAttribute('aria-busy');}}
function pager(id,offset,more,fn,step=50){let p=$('#'+id+'Pager');if(!p){p=document.createElement('div');p.id=id+'Pager';p.className='pager';$('#'+id).closest('.table-card')?.append(p);}p.replaceChildren();for(const [label,next,enabled]of [['Previous',Math.max(0,offset-step),offset>0],['Next',offset+step,more]]){const b=document.createElement('button');b.className='btn sm ghost';i18n.text(b,label);b.disabled=!enabled;b.onclick=()=>run(b,()=>fn(next));p.append(b);}}
function metrics(page,values,notes=[]){$$('#page-'+page+' .metric-value').forEach((n,i)=>n.textContent=values[i]??'—');$$('#page-'+page+' .metric-foot').forEach((n,i)=>i18n.text(n,notes[i]||''));}
function chart(id,data){const svg=$('#'+id);if(!data.length){svg.innerHTML='<text x="380" y="140" text-anchor="middle" fill="currentColor" data-i18n="No successful payment volume in this period">No successful payment volume in this period</text>';return;}const max=data.reduce((m,d)=>BigInt(d.volume)>m?BigInt(d.volume):m,1n),points=data.map((d,i)=>[50+(data.length===1?330:i*650/(data.length-1)),225-Number(BigInt(d.volume)*18000n/max)/100]);svg.innerHTML='<path d="M50 35V225H715" fill="none" stroke="currentColor" opacity=".2"/><polyline fill="none" stroke="#c982a2" stroke-width="3" points="'+points.map(p=>p.join(',')).join(' ')+'"/>'+points.map((p,i)=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4" fill="#E8CA7D"><title>'+esc(data[i].day+' · '+money(data[i].volume))+'</title></circle>').join('')+'<text x="50" y="260" fill="currentColor" font-size="12">'+esc(data[0].day)+'</text><text x="715" y="260" text-anchor="end" fill="currentColor" font-size="12">'+esc(data.at(-1).day)+'</text><text x="50" y="24" fill="currentColor" font-size="12">' +esc(t('Peak {amount}',{amount:money(max)}))+'</text>';}
async function dashboard(){const settled=await Promise.allSettled([cached('gateway/summary'),cached('payout/summary'),post('gateway/search',{offset:0}),post('payout/search',{offset:0,limit:5,state:'submitted'}),post('gateway/analytics',{days:30})]);const [g,p,o,q,a]=settled.map(r=>r.status==='fulfilled'?r.value:null);if(g){text('#dashAvailable',money(g.available));text('#dashVolume',money(g.successfulVolumeMinor));const strong=$$('.dashboard-primary-metrics strong');strong[2].textContent=String(g.counts.successful||0);strong[3].textContent=g.successRate===null?'—':(g.successRate*100).toFixed(1)+'%';text('#dashHold',money(g.held));}if(p){text('#dashPayoutOrders',p.orderCount);text('[data-page="payout-review"] .tag',p.counts.submitted||0);}if(g){const frozen=BigInt(g.frozenMinor||0);text('#dashFrozen',money(frozen));if(p)text('#dashHold',money(BigInt(g.held)-frozen+BigInt(p.reserved||0)+BigInt(p.merchantUsdt?.reserved||0)));}if(o)rows('dashOrders',o.orders.slice(0,5),r=>cells([button(r.reference,'order',r.id,'',true),money(r.amountMinor),pill(r.status),ui(r.origin)]));if(q)rows('dashPayoutReviews',q.orders,r=>cells([button(r.reference,'payout',r.id,'',true),money(r.amountMinor),ui('Submitted'),pill(r.status)]));if(a)chart('dashChart',a.days);$('#healthList').innerHTML=[['Payments',g?ui('Connected to your payment gateway'):ui('Unavailable')],['Payouts',p?ui('{count} open requests',{count:p.openCount}):ui('Unavailable')],['USDT withdrawal',p?.merchantUsdt?.rate?ui('Admin rate: ₹{rate}',{rate:p.merchantUsdt.rate}):ui('Admin rate not configured')],['Account',state.account.operationsEnabled?ui('{status} · Operations enabled',{status:t(human(state.account.approvalStatus))}):ui(human(state.account.approvalStatus))]].map(([title,description])=>'<div class="item"><div class="item-main"><strong>'+ui(title)+'</strong><small>'+description+'</small></div></div>').join('');const bad=settled.find(r=>r.status==='rejected');if(bad)throw bad.reason;}
async function analytics(){const days=[1,7,30][$('#analyticsWindow').selectedIndex],a=await post('gateway/analytics',{days});state.analytics=a;$('#analyticsTotals').innerHTML=facts({'Successful orders':a.channels.reduce((n,c)=>n+Number(c.successful),0),'Successful volume':money(a.channels.reduce((n,c)=>n+BigInt(c.volume),0n)),'Period':t('{days} days · IST',{days})});const totals=a.channels.reduce((t,c)=>{for(const k of ['successful','pending','failed','expired'])t[k]+=c[k];return t;},{successful:0,pending:0,failed:0,expired:0});const denominator=totals.successful+totals.failed;metrics('analytics',[denominator?(totals.successful/denominator*100).toFixed(1)+'%':'—',totals.pending,totals.failed,totals.expired],['Successful / successful + failed','Awaiting confirmation','Failed payments','Expired payment links']);uiText('#page-analytics .metrics .metric:last-child .metric-top','Expired');chart('analyticsChart',a.days);rows('channelRows',a.channels,c=>cells([ui(c.origin),c.total,c.successful,c.pending,c.failed,money(c.volume),c.successful+c.failed?(c.successful/(c.successful+c.failed)*100).toFixed(1)+'%':'—']));}
const historyVersions={};
async function orderHistory(page,offset=state.offsets[page]||0){const version=historyVersions[page]=(historyVersions[page]||0)+1;state.offsets[page]=offset;const d=await post('gateway/search',{search:page==='orders'?$('#orderSearch').value.trim():'',status:'',offset});if(historyVersions[page]!==version)return;if(page==='links')rows('linkRows',d.orders,r=>cells([esc(r.reference)+'<small class="muted"> · '+ui(r.origin)+'</small>',money(r.amountMinor),date(r.createdAt),date(r.expiresAt),pill(r.status),button('Open / QR','order',r.id)]));else rows('orderRows',d.orders,r=>cells([button(r.id,'order',r.id,'',true),esc(r.reference),money(r.amountMinor),ui(r.origin),pill(r.status),ui(human(r.evidenceStatus)),pill(r.callbackStatus)]));pager(page==='links'?'linkRows':'orderRows',offset,d.hasMore,n=>orderHistory(page,n));}
async function linkPage(){await Promise.all([orderHistory('links'),cached('gateway/summary').then(g=>text('#adminLinkTtlText',g.linkTtlSeconds+' seconds'))]);}
function linkDetails(r){let url;try{url=new URL(r.paymentUrl);if(url.origin!==location.origin||!url.pathname.startsWith('/wpay-pay/'))throw Error();}catch{throw Error('The gateway did not return a valid payment link.');}return facts({Reference:r.reference,Amount:money(r.amountMinor),Status:human(r.status),Created:date(r.createdAt),Expires:date(r.expiresAt),Origin:r.origin,Webhook:human(r.callbackStatus)})+'<p class="link-url">'+esc(url.href)+'</p>'+(r.paymentQr?.startsWith('data:image/png;base64,')?'<img class="live-qr" alt="Payment link QR" src="'+esc(r.paymentQr)+'">':'')+'<div class="actions" style="margin-top:14px"><a class="btn primary" href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer"><span data-i18n="Open checkout">Open checkout</span></a>'+button('Copy link','copy-link',url.href)+'</div>';}
async function orderDetail(id){const r=await post('gateway/get',{id});modal('Payment link',r.reference,linkDetails(r));}
async function ledger(page='ledger',offset=state.offsets[page]||0){state.offsets[page]=offset;const filter=$('#txFilter').value;const d=await post('business/ledger/search',{ownerId:null,reference:'',type:page==='transactions'?({Fee:'merchant_platform_fee',Payout:'merchant_payout_principal',Order:'merchant_gross'}[filter]||''):'',offset});rows(page==='ledger'?'ledgerRows':'txRows',d.entries,r=>page==='ledger'?cells([date(r.created_at),esc(r.reference_id),ui(human(r.ledger_type)),balanceDirection(r)==='debit'?money(r.amount_minor,r.currency):'—',balanceDirection(r)==='credit'?money(r.amount_minor,r.currency):'—',r.payout_status?pill(r.payout_status):ui('Posted')]):cells([date(r.created_at),ui(human(r.ledger_type)),esc(r.reference_id),balanceDirection(r)==='debit'?money(r.amount_minor,r.currency):'—',balanceDirection(r)==='credit'?money(r.amount_minor,r.currency):'—',esc(r.currency),r.payout_status?pill(r.payout_status):ui('Posted')]));pager(page==='ledger'?'ledgerRows':'txRows',offset,d.nextOffset!==null,n=>ledger(page,n));if(page==='ledger'){const [b,p]=await Promise.all([cached('business/summary'),cached('payout/summary')]);metrics('ledger',[money(b.gross),money((BigInt(b.fees)+BigInt(b.payoutFees)).toString()),money(b.held),money(p.available)]);$('#payoutBalanceSummary').innerHTML=facts({'Pending payout amount + fees':money(p.reserved),'Completed payout principal':money(p.principal),'Payout fees charged':money(p.fees),'Pending USDT withdrawals (INR)':money(p.merchantUsdt?.reserved),'Completed USDT withdrawals (INR)':money(p.merchantUsdt?.principal),'Awaiting Admin':p.counts?.pending_admin||0,'Awaiting Merchant review':p.counts?.submitted||0});}}
async function payouts(offset=state.offsets.payouts||0){state.offsets.payouts=offset;const [s,d]=await Promise.all([cached('payout/summary'),post('payout/search',{offset,limit:25})]);text('#payoutAvailableBalance',money(s.available));text('#bulkAvailableBalance',money(s.available));rows('payoutRows',d.orders,r=>cells([button(r.id,'payout',r.id,'',true),button('View beneficiary','payout',r.id),money(r.amountMinor),esc(r.reference),pill(r.status),date(r.createdAt)]));pager('payoutRows',offset,d.hasMore,n=>payouts(n),25);}
async function reviewPage(offset=state.offsets.review||0){state.offsets.review=offset;const d=await post('payout/search',{offset,limit:25,state:'submitted'});uiText('#reviewCount','{count} pending',{count:d.orders.length+(d.hasMore?'+':'')});$('#reviewList').innerHTML=d.orders.length?d.orders.map(r=>'<div class="item"><div class="item-main"><strong>'+esc(r.reference)+'</strong><small>'+money(r.amountMinor)+' · '+date(r.submittedAt)+'</small></div>'+button('Review','review',r.id)+'</div>').join(''):'<div class="empty"><span data-i18n="No payouts awaiting review">No payouts awaiting review</span></div>';if(offset||d.hasMore)$('#reviewList').insertAdjacentHTML('beforeend',button('Previous','review-prev','',offset?'':'disabled')+button('Next','review-next','',d.hasMore?'':'disabled'));}
async function payoutDetail(id,inline=false){const r=await post('payout/get',{id});const body=facts({Reference:r.reference,Amount:money(r.amountMinor),Fees:money(BigInt(r.percentageFeeMinor)+BigInt(r.fixedFeeMinor)),Reserved:money(r.reserveMinor),Status:human(r.status),Beneficiary:r.beneficiary?.beneficiaryName,Bank:r.beneficiary?.bankName,Account:r.beneficiary?.accountNumber,IFSC:r.beneficiary?.ifsc,UPI:r.beneficiary?.upiId,UTR:r.evidence?.utr,Proof:r.proof?r.proof.name+' · '+human(r.proof.scanState):'Not submitted',Created:date(r.createdAt),'Payout destination':human(r.transferMode),'Deadline (IST)':date(r.deadlineAt),Completed:date(r.completedAt)})+(r.status==='submitted'?'<p class="notice"><span data-i18n="Review the submitted evidence. Approval is processed by the server under the existing verification rules.">Review the submitted evidence. Approval is processed by the server under the existing verification rules.</span></p>'+button('Approve','payout-approve',id)+button('Reject','payout-reject',id):['pending_admin','open'].includes(r.status)?button('Cancel payout','payout-cancel',id):'');const dispute=r.dispute?'<h3><span data-i18n="Post-approval dispute">Post-approval dispute</span></h3>'+facts({Status:human(r.dispute.status),Reason:r.dispute.reason,Decision:r.dispute.resolutionReason||'Awaiting review'}):r.disputable?'<p class="notice"><span data-i18n="Report a missing payment within 48 hours of approval. A fresh receiving bank/UPI statement is required.">Report a missing payment within 48 hours of approval. A fresh receiving bank/UPI statement is required.</span></p>'+button('Dispute payment','payout-dispute',id):'';if(inline)$('#reviewDetail').innerHTML=body+dispute;else modal('Payout details',r.reference,body+dispute);}
async function fees(offset=state.offsets.fees||0){const b=await cached('business/summary');$('#chargedFeeSummary').innerHTML=facts({'Pay-in fees charged':money(b.fees),'Payout fees charged (including fixed)':money(b.payoutFees),'Total fees charged':money(BigInt(b.fees)+BigInt(b.payoutFees))});state.offsets.fees=offset;const d=await post('panel/fees',{offset,limit:25});if(offset===0){const r=d.rows[0];metrics('fees',r?[r.payinFee+'%',r.payoutFee+'%',String(r.fixedPayoutFee)+' '+r.fixedFeeCurrency,'v'+r.version]:['—','—','—','—'],['Current version','Current version','Per successful payout',r?date(r.effectiveAt):'Not configured']);}rows('feeRows',d.rows,(r,i)=>cells(['v'+r.version,esc(r.payinFee)+'%',esc(r.payoutFee)+'%',esc(r.fixedPayoutFee)+' '+esc(r.fixedFeeCurrency),date(r.effectiveAt),pill(offset===0&&i===0?'active':'historical')]));pager('feeRows',offset,d.nextOffset!==null,n=>fees(n),25);}
async function holds(){const h=await cached('business/holds');rows('holdRows',h.holds,r=>cells([esc(r.id),esc(r.reference),money(r.amount_minor,r.currency),esc(r.reason)+' · '+esc(human(r.category)),pill(r.state)]));}
async function settlement(){const d=await cached('payout/merchant-usdt');state.settlement=d;text('#usdtAvailableInr',money(d.available));uiText('#adminUsdtRate',d.rate?'₹'+d.rate+' / USDT':'Not configured');text('#maxUsdtQuote',money(d.maxUsdtMinor,'USDT'));uiText('#rateVersion',d.rateVersion?'Rate v{version}':'Not configured',{version:d.rateVersion});const fs=$$('#page-settlement .facts .fact strong');fs[3].textContent=d.network||'—';fs[4].textContent=d.rate?'₹'+d.rate+' / USDT':'—';$('#merchantUsdtWithdrawForm button[type="submit"], #merchantUsdtWithdrawForm button:not([type])').disabled=!!d.creationDisabled;rows('merchantUsdtRows',d.requests||[],r=>cells([esc(r.id),money(r.inrMinor),esc(r.rate),money(r.usdtMinor,'USDT'),button('View destination','usdt-detail',r.id),pill(r.state)+(['requested','review'].includes(r.state)?button('Cancel','usdt-cancel',r.id):'')]));pager('merchantUsdtRows',d.offset||0,d.hasMore,n=>settlementHistory(n));if($('#merchantUsdtAmount').value)quoteFromUsdt();else quoteUsdt();}
async function settlementHistory(offset){const d=await post('payout/merchant-usdt/search',{offset,limit:50});rows('merchantUsdtRows',d.requests,r=>cells([esc(r.id),money(r.inrMinor),esc(r.rate),money(r.usdtMinor,'USDT'),button('View destination','usdt-detail',r.id),pill(r.state)+(['requested','review'].includes(r.state)?button('Cancel','usdt-cancel',r.id):'')]));pager('merchantUsdtRows',offset,d.hasMore,n=>settlementHistory(n));}
function quoteUsdt(){try{const d=state.settlement;if(!d?.rate)throw Error();const rate=BigInt(minor(String(d.rate),6));text('#merchantUsdtQuote',money(BigInt(minor($('#merchantUsdtInr').value||'0'))*10000000000n/rate,'USDT'));}catch{text('#merchantUsdtQuote','—');}}
async function keys(){const d=await cached('gateway/keys');rows('apiKeyRows',d.keys,r=>cells([esc(r.label),esc(r.prefix),esc(r.scopes.join(', ')),date(r.created_at),date(r.last_used_at),pill(r.status||(r.revoked_at?'revoked':'active')),r.revoked_at?'—':button('Revoke','revoke-key',r.id)]));}
async function webhooks(){const d=await cached('gateway/webhooks');$('#webhookUrl').value=d.endpoint?.url||'';rows('webhookRows',d.events,r=>cells([esc(r.id),esc(r.event_type),esc(r.order_id||'—'),pill(r.state),r.attempts,r.last_code??'—',r.state==='pending'&&r.attempts<8?button('Retry now','retry-webhook',r.id):'—']));$('#deliveryList').innerHTML=d.events.length?d.events.slice(0,4).map(r=>'<div class="item"><div class="item-main"><strong>'+esc(r.event_type)+'</strong><small>'+date(r.created_at)+(r.last_code?' · HTTP '+esc(r.last_code):'')+'</small></div>'+pill(r.state)+'</div>').join(''):'<div class="empty"><span data-i18n="No webhook events">No webhook events</span></div>';}
async function logs(){const d=await cached('gateway/logs');rows('logRows',d.rows,r=>cells([date(r.created_at),esc(human(r.operation)),esc(r.id)]));}
async function notifications(offset=0){const d=await post('panel/notifications',{offset,limit:100});state.notifications=d.rows;let seen=0;try{seen=Number(localStorage.getItem('wpay:merchant:'+state.account.id+':read')||0);}catch{}$('#notificationList').innerHTML=d.rows.length?d.rows.map(r=>'<div class="item '+(+new Date(r.created_at)>seen?'unread':'')+'"><div class="item-main"><strong>'+ui(human(r.event))+'</strong><small>'+date(r.created_at)+'</small></div>'+pill(+new Date(r.created_at)>seen?'new':'read')+'</div>').join(''):'<div class="empty">'+ui(d.preferences.in_app_notifications?'No account notifications':'Notifications are disabled in Preferences')+'</div>';if(offset||d.nextOffset!==null)$('#notificationList').insertAdjacentHTML('beforeend',button('Previous','notifications-page',Math.max(0,offset-100),offset?'':'disabled')+button('Next','notifications-page',d.nextOffset??'',d.nextOffset===null?'disabled':''));}
async function support(offset=0){const d=await post('panel/support',{offset,limit:25});state.tickets=d.rows;$('#newTicket').disabled=!d.canWrite;$('#ticketList').innerHTML=d.rows.length?d.rows.map(r=>'<div class="item"><div class="item-main"><strong>'+esc(r.subject)+'</strong><small>'+date(r.created_at)+'</small></div>'+pill(r.status)+button('Open','ticket',r.id)+'</div>').join(''):'<div class="empty"><span data-i18n="No support tickets">No support tickets</span></div>';if(offset||d.nextOffset!==null)$('#ticketList').insertAdjacentHTML('beforeend',button('Previous','support-page',Math.max(0,offset-25),offset?'':'disabled')+button('Next','support-page',d.nextOffset??'',d.nextOffset===null?'disabled':''));}
async function security(){const s=await request('security');state.security=s;uiText('#mfaStatus',s.enabled?'Enabled':'Optional · Off');uiText('#mfaDescription',s.enabled?'Authenticator protects your account':'Sign in with email and password');$('#mfaActions').innerHTML=s.enabled?button('Disable','security-disable')+button('Replace authenticator','security-replace')+button('New recovery codes','security-regenerate'):button('Enable authenticator','security-enable');$('#sessionList').innerHTML=s.sessions.map(r=>'<div class="item"><div class="item-main"><strong>'+ui(r.current?'Current session':'Active session')+'</strong><small>'+ui('Created {created} · Last active {last} · Expires {expires}',{created:date(r.createdAt),last:date(r.lastSeenAt),expires:date(r.expiresAt)})+'</small></div>'+pill(r.current?'current':'active')+'</div>').join('');$('#passwordCodeField')?.remove();}
async function profile(){const [p,n]=await Promise.all([request('panel/profile'),request('panel/notifications')]);$('#businessName').value=state.account.name;$('#profileEmail').value=state.account.email;$('#profileId').value=state.account.id;$('#profileForm button').disabled=!p.canEdit;syncLanguage();$('#inAppNotifications').checked=n.preferences.in_app_notifications;}
function range(){const from=$('#reportFrom').value,to=$('#reportTo').value;const start=new Date(from+'T00:00:00+05:30'),end=new Date(new Date(to+'T00:00:00+05:30').getTime()+86400000);if(!from||!to||!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||end-start>31*86400000)throw Error('Select a valid date range of up to 31 days.');return {from:start.toISOString(),to:end.toISOString()};}
async function exportReport(kind){const dates=range();if(kind==='ledger'||kind==='fees'){let offset=0,parts=[];do{const d=await post('panel/reports/export',{...dates,offset,limit:100});parts.push(offset?d.csv.split('\r\n').slice(1).join('\r\n'):d.csv);offset=d.nextOffset;if(offset>10000)throw Error('Too many records. Select a smaller date range.');}while(offset!==null);const all=parts.filter(Boolean).join('\r\n');if(kind==='fees'){// Use structured entries for safe filtering; CSV parsing is deliberately avoided.
let offset=0,entries=[];do{const d=await post('panel/reports',{...dates,offset,limit:100});entries.push(...d.rows.filter(r=>/fee/.test(r.ledger_type)));offset=d.nextOffset;if(offset>10000)throw Error('Select a smaller date range.');}while(offset!==null);download('wpay-fees.csv',csv(entries));}else download('wpay-ledger.csv',all);return;}
let offset=0,all=[],more=true;while(more){const d=kind==='orders'?await post('gateway/search',{offset}):await post('payout/search',{offset,limit:100});all.push(...d.orders.filter(r=>+new Date(r.createdAt)>=+new Date(dates.from)&&+new Date(r.createdAt)<+new Date(dates.to)));more=d.hasMore;offset+=kind==='orders'?50:100;if(offset>10000&&more)throw Error('Export exceeds 10,000 history records. Contact Admin for a larger export.');}download('wpay-'+kind+'.csv',csv(all));}
const loaders={dashboard,analytics,links:linkPage,orders:()=>orderHistory('orders'),transactions:()=>ledger('transactions'),payouts,'payout-review':reviewPage,api:keys,webhooks,logs,docs:async()=>{},fees,ledger,holds,settlement,reports:async()=>{},notifications,support,security,profile};
const actions={
 'usdt-detail':async id=>{const r=await post('payout/merchant-usdt/get',{id});modal('USDT withdrawal',r.id,facts({Amount:money(r.inrMinor),USDT:money(r.usdtMinor,'USDT'),Rate:r.rate,Network:r.network,Address:r.destination?.address,Status:human(r.state),Created:date(r.createdAt),Completed:date(r.completedAt)}));},
 'order':orderDetail,'payout':id=>payoutDetail(id),'review':id=>payoutDetail(id,true),
 'copy-link':async url=>{await navigator.clipboard.writeText(url);toast('Payment link copied.');},
 'recovery':()=>authStage({stage:'recover'}),'back-login':showLogin,
 'review-prev':()=>reviewPage(Math.max(0,(state.offsets.review||0)-25)), 'review-next':()=>reviewPage((state.offsets.review||0)+25),
 'notifications-page':id=>notifications(Number(id)),'support-page':id=>support(Number(id)),
 'ticket':id=>{const r=state.tickets.find(r=>r.id===id);if(!r)return;$('#ticketThread').innerHTML='<h3>'+esc(r.subject)+'</h3>'+pill(r.status)+'<p style="white-space:pre-wrap">'+esc(r.message)+'</p><small>'+date(r.created_at)+'</small>'+(r.reply?'<hr><strong><span data-i18n="Support response">Support response</span></strong><p style="white-space:pre-wrap">'+esc(r.reply)+'</p><small>'+date(r.replied_at)+'</small>':'<p class="muted"><span data-i18n="Awaiting a support response.">Awaiting a support response.</span></p>');},
 'revoke-key':id=>promptForm('Revoke API credential','<p><span data-i18n="This credential will stop accepting new API requests.">This credential will stop accepting new API requests.</span></p>',async()=>{await mutate('gateway/keys/revoke',{id});closeModal();await keys();toast('API credential revoked.');},'Revoke'),
 'retry-webhook':async id=>{await mutate('gateway/webhooks/retry',{id});await webhooks();toast('Webhook retry queued.');},
 'usdt-cancel':id=>promptForm('Cancel USDT withdrawal',field('cancelReason','Reason'),async()=>{await mutate('payout/merchant-usdt/transition',{id,action:'cancel',reason:$('#cancelReason').value});closeModal();await settlement();toast('Withdrawal cancelled.');}),
};
actions['payout-dispute']=id=>promptForm('Dispute approved payout',field('disputeReason','Reason')+field('disputeFrom','Statement coverage starts (your local time)','datetime-local')+field('disputeThrough','Statement coverage ends (your local time)','datetime-local')+field('disputeStatement','Fresh receiving bank / UPI statement','file')+'<p class="muted"><span data-i18n="Upload a PDF, PNG or JPG up to 1 MB. Cover the payment time through now. Admin will verify the document before deciding.">Upload a PDF, PNG or JPG up to 1 MB. Cover the payment time through now. Admin will verify the document before deciding.</span></p>',async()=>{const f=$('#disputeStatement').files[0];if(!f||f.size>1048576)throw Error('Select a statement up to 1 MB.');const bytes=new Uint8Array(await f.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));await mutate('payout/dispute/open',{id,reason:$('#disputeReason').value,coverageFrom:new Date($('#disputeFrom').value).toISOString(),coverageThrough:new Date($('#disputeThrough').value).toISOString(),statement:{name:f.name,data:btoa(raw)}});closeModal();await payouts();toast('Dispute submitted for review.');},'Submit dispute');
for(const action of ['approve','reject','cancel'])actions['payout-'+action]=id=>promptForm(human(action)+' payout',field('reviewReason','Reason'),async()=>{await mutate('payout/review',{id,action,reason:$('#reviewReason').value});closeModal();uiText('#reviewDetail','Select a payout');await navigate(state.page,true);toast('Payout updated.');});
for(const action of ['enable','disable','replace','regenerate'])actions['security-'+action]=async()=>{promptForm(human(action)+' authenticator',field('securityPassword','Current password','password'),async()=>{const password=$('#securityPassword').value;$('#securityPassword').value='';const d=await post('security/'+action,{password});closeModal();invalidate();if(d.stage)await authStage(d);else await security();});};
document.addEventListener('click',e=>{const n=e.target.closest('[data-action],[data-page],[data-go],[data-report]');if(!n||n.disabled)return;if(n.dataset.action){e.preventDefault();if(actions[n.dataset.action])run(n,()=>actions[n.dataset.action](n.dataset.id));}else if(n.dataset.report)run(n,()=>exportReport(n.dataset.report));else if(state.account)navigate(n.dataset.page||n.dataset.go);else if(n.dataset.go==='support')modal('Merchant sign-in support','', '<p><span data-i18n="Contact your WPay administrator for account approval or a temporary password reset. Sign in to access your support tickets.">Contact your WPay administrator for account approval or a temporary password reset. Sign in to access your support tickets.</span></p>');});
$$('.quick[data-go]').forEach(n=>{n.tabIndex=0;n.setAttribute('role','button');n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();n.click();}};});
$('#modalClose').onclick=closeModal;$('#modalBg').onclick=e=>{if(e.target.id==='modalBg')closeModal();};document.addEventListener('keydown',e=>{if(!$('#modalBg').classList.contains('open'))return;if(e.key==='Escape')closeModal();if(e.key==='Tab'){const nodes=[...$('#modalBg').querySelectorAll('button,a,input,select,textarea')].filter(n=>!n.disabled&&n.offsetParent!==null);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
bindForm('loginForm',async()=>{uiText('#loginMessage','Signing in…');try{await authStage(await post('login',{email:$('#loginEmail').value.trim(),password:$('#loginPassword').value}));uiText('#loginMessage','');}finally{$('#loginPassword').value='';}});
$('#forgotPassword').onclick=e=>{e.preventDefault();modal('Reset your password','', '<p><span data-i18n="Contact your WPay administrator for a temporary password. Sign in with that password to securely set a new one.">Contact your WPay administrator for a temporary password. Sign in with that password to securely set a new one.</span></p>');};
$('#registerMerchant').onclick=()=>promptForm('Create Merchant account',field('registerName','Business name')+field('registerEmail','Email address','email')+field('registerPassword','Password','password')+field('registerConfirm','Confirm password','password')+'<p class="muted">'+esc(globalThis.WPayPasswordPolicy.text(i18n.locale,'establish'))+'</p>',async()=>{checkPassword($('#registerPassword').value,$('#registerConfirm').value);await post('register',{accountType:'merchant',name:$('#registerName').value.trim(),email:$('#registerEmail').value.trim(),password:$('#registerPassword').value});modal('Registration submitted','','<p><span data-i18n="Your Merchant account is pending Admin approval. Sign in after approval.">Your Merchant account is pending Admin approval. Sign in after approval.</span></p>');});
$('#logoutBtn').onclick=()=>run($('#logoutBtn'),async()=>{await post('logout');state.pending.clear();showLogin();});
$('#logoutAll').onclick=()=>promptForm('Logout all sessions','<p><span data-i18n="This signs you out on all devices, including this one.">This signs you out on all devices, including this one.</span></p>',async()=>{await post('logout-all');state.pending.clear();showLogin();},'Logout all');
$('#refreshPage').onclick=()=>navigate(state.page,true);
$('#mobileMenuBtn').onclick=()=>{const open=$('#sidebar').classList.toggle('open');$('#mobileMenuBtn').setAttribute('aria-expanded',String(open));};
$('#themeBtn').onclick=()=>{const light=document.documentElement.classList.toggle('light');try{localStorage.setItem('merchant-theme',light?'light':'dark');}catch{}};
try{document.documentElement.classList.toggle('light',localStorage.getItem('merchant-theme')==='light');}catch{}
$('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#orderSearch').value=e.target.value.trim();state.offsets.orders=0;navigate('orders');}});
let searchTimer;$('#orderSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>run(null,()=>orderHistory('orders',0)),300);});
$('#analyticsWindow').onchange=()=>run(null,analytics);$('#analyticsCsv').onclick=()=>run($('#analyticsCsv'),async()=>{if(!state.analytics)await analytics();download('wpay-analytics.csv',csv(state.analytics.channels));});
$('#txFilter').onchange=()=>run(null,()=>ledger('transactions',0));
$('#openCreateLink').onclick=()=>{$('#linkRef').focus();$('#linkForm').scrollIntoView({behavior:'smooth',block:'center'});};
bindForm('linkForm',async()=>{const body={reference:$('#linkRef').value.trim(),amountMinor:minor($('#linkAmount').value),currency:'INR',description:$('#linkDescription').value.trim()};try{const r=await idempotent('gateway/create',body),detail=await post('gateway/get',{id:r.id});$('#linkPreview').innerHTML=linkDetails(detail);await orderHistory('links',0);toast('Payment link created.');}catch(e){if(e.code==='NO_ROUTE'){const d=await post('gateway/route-status',{amountMinor:body.amountMinor});throw Error(errors.NO_ROUTE+' '+d.reasons.map(human).join(', '));}throw e;}});
$('#payoutTabs').onclick=e=>{const n=e.target.closest('[data-payout-tab]');if(!n)return;$$('[data-payout-tab]').forEach(b=>b.classList.toggle('active',b===n));const bulk=n.dataset.payoutTab==='bulk';$('#singlePayoutPanel').classList.toggle('hidden',bulk);$('#bulkPayoutPanel').classList.toggle('hidden',!bulk);};
function payoutMode(){const upi=$('#poMode').value==='upi';for(const id of ['poBank','poAccount','poIfsc','poUpi']){const n=$('#'+id),show=id==='poUpi'?upi:!upi;n.closest('.field').hidden=!show;n.required=show;n.disabled=!show;}}
$('#poMode').onchange=payoutMode;payoutMode();
bindForm('payoutForm',async()=>{const transferMode=$('#poMode').value;await idempotent('payout/create',{transferMode,durationMinutes:Number($('#poDuration').value),reference:$('#poRef').value.trim(),beneficiaryName:$('#poName').value.trim(),...(transferMode==='upi'?{upiId:$('#poUpi').value.trim()}:{bankName:$('#poBank').value.trim(),accountNumber:$('#poAccount').value.trim(),ifsc:$('#poIfsc').value.trim().toUpperCase()}),amountMinor:minor($('#poAmount').value),note:''});$('#payoutForm').reset();payoutMode();await payouts(0);toast('Awaiting Admin approval; amount and fees reserved.');});
$('#downloadBulkTemplate').onclick=()=>run($('#downloadBulkTemplate'),async()=>{const d=await post('payout/template',{transferMode:$('#bulkMode').value});download(d.name,Uint8Array.from(atob(d.data),c=>c.charCodeAt(0)),'application/octet-stream');});
$('#bulkMode').onchange=()=>{state.bulk=null;$('#bulkPayoutFile').value='';$('#createBulkPayouts').disabled=true;uiText('#bulkUploadStatus','Download the selected template and upload the completed file.');};
$('#bulkPayoutFile').onchange=()=>run(null,async()=>{state.bulk=null;$('#createBulkPayouts').disabled=true;const file=$('#bulkPayoutFile').files[0];if(!file)return;if(file.size>1048576)throw Error('The file must be 1 MB or smaller.');uiText('#bulkUploadStatus','Validating all rows and current balance…');const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));const body={idempotencyKey:crypto.randomUUID(),transferMode:$('#bulkMode').value,file:{name:file.name,data:btoa(raw)}};const d=await post('payout/bulk/validate',body);state.bulk=d.valid?body:null;text('#bulkRowCount',d.rows.length);text('#bulkTotal',money(d.batchReserveMinor));text('#bulkAvailableBalance',money(d.availableMinor));uiText('#bulkBalanceBadge',d.valid?'Validated · fees included':'Fix errors before creating');uiText('#bulkUploadStatus',d.valid?t('All rows valid. Remaining balance after reservation: {balance}',{balance:money(d.remainingMinor)}):[...d.errors.map(r=>t('Row {row}: {error}',{row:r.row||'—',error:t(human(r.error))})),...(d.exceedsAvailable?[t('Insufficient available balance including fees.')]:[])].join('\n'));rows('bulkPreviewRows',d.rows,(r)=>cells([esc(r.row??'—'),esc(r.beneficiaryName),esc(r.bankName),esc(r.accountNumber),esc(r.ifsc),esc(r.upiId),money(r.amountMinor),esc(r.reference),r.existingReference?ui('Existing reference'):ui('Reserve {amount}',{amount:money(r.reserveMinor)})]));$('#createBulkPayouts').disabled=!d.valid;});
$('#createBulkPayouts').onclick=()=>run($('#createBulkPayouts'),async()=>{if(!state.bulk)throw Error('Validate the file first.');const d=await mutate('payout/bulk',state.bulk);if(d.errors?.length)throw Error(d.errors.map(r=>t('Row {row}: {error}',{row:r.row,error:t(human(r.error))})).join('\n'));state.bulk=null;$('#bulkPayoutFile').value='';uiText('#bulkUploadStatus','Bulk payout requests created.');await payouts(0);toast('Bulk payout requests created.');}).then(()=>{$('#createBulkPayouts').disabled=!state.bulk;});
$('#createApiKey').onclick=()=>promptForm('Create API credential',field('keyLabel','Label')+'<label><input id="keyRead" type="checkbox" checked> <span data-i18n="Read orders">Read orders</span></label><br><label><input id="keyWrite" type="checkbox"> <span data-i18n="Create orders">Create orders</span></label>',async()=>{const scopes=[$('#keyRead').checked?'orders:read':null,$('#keyWrite').checked?'orders:write':null].filter(Boolean);if(!scopes.length)throw Error('Select at least one scope.');const d=await mutate('gateway/keys/create',{label:$('#keyLabel').value.trim(),scopes}),secret=d.key||d.secret;showApiSecret(secret);modal('Save API credential','Shown once. Store it on your server.',apiSecretMarkup('modalApiKeySecret',secret));bindApiSecretControls('modalApiKeySecret');await keys();});
bindForm('webhookForm',async()=>{const d=await mutate('gateway/webhooks/configure',{url:$('#webhookUrl').value.trim()});modal('Save webhook signing secret','Shown once. Update your webhook signature verifier.', '<pre class="secret">'+esc(d.secret)+'</pre>');await webhooks();});
function quoteFromUsdt(){try{const rate=BigInt(minor(String(state.settlement.rate),6)),usdt=BigInt(minor($('#merchantUsdtAmount').value,6)),inr=(usdt*rate+9999999999n)/10000000000n;$('#merchantUsdtInr').value=decimal(inr);text('#merchantUsdtQuote',money(usdt,'USDT'));}catch{$('#merchantUsdtInr').value='';text('#merchantUsdtQuote','—');}}
$('#merchantUsdtAmount').oninput=quoteFromUsdt;
$('#merchantUsdtInr').oninput=()=>{$('#merchantUsdtAmount').value='';quoteUsdt();};$('#useFullBalance').onclick=()=>{if(state.settlement?.maxUsdtMinor!==undefined){$('#merchantUsdtAmount').value=decimal(state.settlement.maxUsdtMinor,6);quoteFromUsdt();}};
bindForm('merchantUsdtWithdrawForm',async()=>{if(state.settlement?.creationDisabled)throw Error('Admin must configure your USDT rate first.');await idempotent('payout/merchant-usdt/create',{...($('#merchantUsdtAmount').value?{usdtMinor:minor($('#merchantUsdtAmount').value,6),rateVersion:state.settlement.rateVersion}:{amountMinor:minor($('#merchantUsdtInr').value)}),network:state.settlement.network,address:$('#merchantUsdtAddress').value.trim()});$('#merchantUsdtWithdrawForm').reset();await settlement();toast('Withdrawal requested; INR reserved.');});
$('#downloadReport').onclick=()=>run($('#downloadReport'),()=>exportReport('ledger'));
$('#markAllRead').onclick=()=>run($('#markAllRead'),async()=>{const latest=Math.max(0,...(state.notifications||[]).map(r=>+new Date(r.created_at)));localStorage.setItem('wpay:merchant:'+state.account.id+':read',String(latest));await notifications();toast('Marked read on this browser.');});
$('#newTicket').onclick=()=>promptForm('New support ticket',field('ticketSubject','Subject')+'<div class="field"><label for="ticketMessage"><span data-i18n="Message">Message</span></label><textarea id="ticketMessage" class="control" maxlength="2000" required></textarea></div>',async()=>{await idempotent('panel/support/create',{subject:$('#ticketSubject').value.trim(),message:$('#ticketMessage').value.trim()},'requestId');closeModal();await support();toast('Support ticket created.');},'Create ticket');
bindForm('passwordForm',async()=>{checkPassword($('#newPassword').value);const d=await post('security/password',{password:$('#currentPassword').value,newPassword:$('#newPassword').value});$('#passwordForm').reset();invalidate();if(d.stage)await authStage(d);else await security();toast('Password changed. Other sessions were invalidated.');});
bindForm('profileForm',async()=>{const d=await mutate('panel/profile/update',{name:$('#businessName').value.trim()});state.account.name=d.name;text('.sidebar-foot strong',d.name);text('.merchant-chip strong',d.name);toast('Profile saved.');});
function syncLanguage(){for(const id of ['locale','merchantLanguage']){const n=$('#'+id);if(n)n.value=i18n.locale;}}
let languageSave=Promise.resolve();
async function changeLanguage(locale){
  if(!i18n.supported.includes(locale))return;
  i18n.setLocale(locale);syncLanguage();
  // Serialize preference writes so rapid selections cannot persist out of order.
  const owner=state.account;
  const save=languageSave.catch(()=>{}).then(async()=>{if(!owner||state.account!==owner)return;await post('locale',{locale});if(state.account===owner)owner.locale=locale;});
  languageSave=save;
  try{await save;}catch(e){if(state.account===owner&&i18n.locale===locale){i18n.setLocale(state.account?.locale);syncLanguage();}throw e;}
}
for(const id of ['locale','merchantLanguage']){const n=$('#'+id);if(n)n.addEventListener('change',()=>{const locale=n.value;changeLanguage(locale).catch(e=>toast(message(e)));});}
bindForm('prefsForm',async()=>{await languageSave;await post('panel/preferences',{inAppNotifications:$('#inAppNotifications').checked});if(state.account.locale!==i18n.locale)await changeLanguage(i18n.locale);invalidate();toast('Preferences saved.');});
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});$('#reportTo').value=today;$('#reportFrom').value=new Date(Date.now()-6*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
window.addEventListener('hashchange',()=>{const p=location.hash.slice(1);if(p!==state.page&&$('#page-'+p))navigate(p);});
let lastActivity=Date.now();for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{lastActivity=Date.now();},{passive:true});setInterval(()=>{if(state.account&&document.visibilityState==='visible'&&Date.now()-lastActivity<300000)post('refresh').catch(e=>{if(e.code==='AUTH_FAILED')showLogin();});},300000);
start().catch(e=>{showLogin();if(e.code!=='AUTH_FAILED')uiText('#loginMessage',message(e));});
}};

/* Merchant i18n: English source keys, explicit Russian/Chinese dictionaries.
   Only initial authored UI and explicit dynamic UI bindings are translated.
   API records, credentials, input values and protocol examples are never scanned. */
globalThis.WPayMerchantI18n = (() => {
  const catalog = {
  "Dashboard": [
    "Обзор",
    "仪表盘"
  ],
  "Merchant": [
    "Мерчант",
    "商户"
  ],
  "Merchant Portal": [
    "Портал мерчанта",
    "商户门户"
  ],
  "WPay Merchant": [
    "Мерчант WPay",
    "WPay 商户"
  ],
  "Workspace": [
    "Рабочее пространство",
    "工作区"
  ],
  "Collections": [
    "Приём платежей",
    "收款"
  ],
  "Payment Links": [
    "Платёжные ссылки",
    "支付链接"
  ],
  "Orders & Payments": [
    "Заказы и платежи",
    "订单与支付"
  ],
  "Transactions": [
    "Транзакции",
    "交易"
  ],
  "Payouts": [
    "Выплаты",
    "付款"
  ],
  "Payout Requests": [
    "Запросы на выплату",
    "付款申请"
  ],
  "Payout Review": [
    "Проверка выплат",
    "付款审核"
  ],
  "Finance": [
    "Финансы",
    "财务"
  ],
  "Platform Fees": [
    "Комиссии платформы",
    "平台费用"
  ],
  "Balance & Ledger": [
    "Баланс и проводки",
    "余额与账本"
  ],
  "Held / Frozen Funds": [
    "Удержанные / замороженные средства",
    "保留／冻结资金"
  ],
  "USDT Withdrawal": [
    "Вывод USDT",
    "USDT 提现"
  ],
  "Developer": [
    "Разработчикам",
    "开发者"
  ],
  "API Credentials": [
    "Учётные данные API",
    "API 凭证"
  ],
  "Webhooks": [
    "Вебхуки",
    "Webhook"
  ],
  "API Logs": [
    "Журнал API",
    "API 日志"
  ],
  "API Documentation": [
    "Документация API",
    "API 文档"
  ],
  "Reporting": [
    "Отчётность",
    "报表"
  ],
  "Reports": [
    "Отчёты",
    "报告"
  ],
  "Account": [
    "Аккаунт",
    "账户"
  ],
  "Notifications": [
    "Уведомления",
    "通知"
  ],
  "Support": [
    "Поддержка",
    "支持"
  ],
  "Security": [
    "Безопасность",
    "安全"
  ],
  "Profile & Settings": [
    "Профиль и настройки",
    "资料与设置"
  ],
  "Refresh": [
    "Обновить",
    "刷新"
  ],
  "Merchant Account": [
    "Аккаунт мерчанта",
    "商户账户"
  ],
  "Business identity, notification preferences and language.": [
    "Данные компании, настройки уведомлений и язык.",
    "企业资料、通知偏好与语言。"
  ],
  "Business Profile": [
    "Профиль компании",
    "企业资料"
  ],
  "Business name": [
    "Название компании",
    "企业名称"
  ],
  "Merchant email": [
    "Email мерчанта",
    "商户邮箱"
  ],
  "Merchant ID": [
    "ID мерчанта",
    "商户编号"
  ],
  "Save profile": [
    "Сохранить профиль",
    "保存资料"
  ],
  "Preferences": [
    "Настройки",
    "偏好设置"
  ],
  "Account language preference": [
    "Язык аккаунта",
    "账户语言"
  ],
  "In-app notifications": [
    "Уведомления в приложении",
    "应用内通知"
  ],
  "Security and account events.": [
    "События безопасности и аккаунта.",
    "安全与账户事件。"
  ],
  "Save preferences": [
    "Сохранить настройки",
    "保存偏好"
  ],
  "Language": [
    "Язык",
    "语言"
  ],
  "Built for modern commerce": [
    "Для современной торговли",
    "为现代商业打造"
  ],
  "Payments": [
    "Платежи",
    "支付"
  ],
  "without": [
    "без",
    "没有"
  ],
  "limits.": [
    "границ.",
    "界限。"
  ],
  "FAST": [
    "БЫСТРО",
    "快速"
  ],
  "SECURE": [
    "БЕЗОПАСНО",
    "安全"
  ],
  "RELIABLE": [
    "НАДЁЖНО",
    "可靠"
  ],
  "Empowering merchants to move money, manage growth and stay in control.": [
    "Помогаем мерчантам управлять платежами, ростом и своим бизнесом.",
    "帮助商户转移资金、管理增长并掌控业务。"
  ],
  "PAYMENTS": [
    "ПЛАТЕЖИ",
    "支付"
  ],
  "PEOPLE": [
    "ЛЮДИ",
    "人们"
  ],
  "POSSIBILITIES": [
    "ВОЗМОЖНОСТИ",
    "机遇"
  ],
  "POWER": [
    "СИЛА",
    "力量"
  ],
  "Payments. Growth. A brighter tomorrow.": [
    "Платежи. Рост. Уверенное будущее.",
    "支付。增长。更美好的明天。"
  ],
  "“Building a more open and prosperous commerce world.”": [
    "«Создаём более открытый и процветающий мир торговли».",
    "“共建更加开放繁荣的商业世界。”"
  ],
  "TRUSTED PAYMENTS. BRIGHTER BUSINESS.": [
    "НАДЁЖНЫЕ ПЛАТЕЖИ. УСПЕШНЫЙ БИЗНЕС.",
    "可信支付，成就更好业务。"
  ],
  "Secure global merchant infrastructure": [
    "Безопасная глобальная инфраструктура для мерчантов",
    "安全的全球商户基础设施"
  ],
  "Premium merchant access": [
    "Премиальный доступ для мерчантов",
    "优质商户服务"
  ],
  "Welcome back": [
    "С возвращением",
    "欢迎回来"
  ],
  "Sign in to your merchant workspace.": [
    "Войдите в рабочее пространство мерчанта.",
    "登录您的商户工作区。"
  ],
  "Email address": [
    "Электронная почта",
    "电子邮箱"
  ],
  "Password": [
    "Пароль",
    "密码"
  ],
  "Forgot password?": [
    "Забыли пароль?",
    "忘记密码？"
  ],
  "Sign in": [
    "Войти",
    "登录"
  ],
  "Create a Merchant account": [
    "Создать аккаунт мерчанта",
    "创建商户账户"
  ],
  "Secure merchant workspace": [
    "Безопасное рабочее пространство",
    "安全的商户工作区"
  ],
  "Protected access for your business.": [
    "Защищённый доступ для вашего бизнеса.",
    "为您的企业提供安全访问。"
  ],
  "Need help?": [
    "Нужна помощь?",
    "需要帮助？"
  ],
  "Contact support →": [
    "Связаться с поддержкой →",
    "联系支持 →"
  ],
  "Authenticator MFA": [
    "Двухфакторная аутентификация",
    "身份验证器多重验证"
  ],
  "Checking account…": [
    "Проверка аккаунта…",
    "正在检查账户…"
  ],
  "Connecting…": [
    "Подключение…",
    "正在连接…"
  ],
  "Good morning,": [
    "Доброе утро,",
    "早上好，"
  ],
  "Let’s grow your business today.": [
    "Развивайте свой бизнес уже сегодня.",
    "今天一起推动业务增长。"
  ],
  "Total Payment Volume": [
    "Общий объём платежей",
    "支付总额"
  ],
  "Available Balance": [
    "Доступный баланс",
    "可用余额"
  ],
  "Successful Payments": [
    "Успешные платежи",
    "成功支付"
  ],
  "Success Rate": [
    "Доля успешных платежей",
    "成功率"
  ],
  "Frozen Balance": [
    "Замороженный баланс",
    "冻结余额"
  ],
  "Hold Balance": [
    "Удержанный баланс",
    "保留余额"
  ],
  "Payout Orders": [
    "Платёжные поручения",
    "付款订单"
  ],
  "Current available balance": [
    "Текущий доступный баланс",
    "当前可用余额"
  ],
  "Confirmed successful payments": [
    "Подтверждённые успешные платежи",
    "已确认的成功支付"
  ],
  "Create Payment Link →": [
    "Создать платёжную ссылку →",
    "创建支付链接 →"
  ],
  "View reports →": [
    "Посмотреть отчёты →",
    "查看报告 →"
  ],
  "Quick Actions": [
    "Быстрые действия",
    "快捷操作"
  ],
  "Common tasks to manage your business": [
    "Частые задачи управления бизнесом",
    "常用业务管理操作"
  ],
  "Create Payment Link": [
    "Создать платёжную ссылку",
    "创建支付链接"
  ],
  "Start accepting payments in minutes.": [
    "Начните принимать платежи за несколько минут.",
    "几分钟内开始收款。"
  ],
  "Request Payout": [
    "Запросить выплату",
    "申请付款"
  ],
  "Create single or bulk payout orders.": [
    "Создавайте одиночные или пакетные выплаты.",
    "创建单笔或批量付款订单。"
  ],
  "Withdraw USDT": [
    "Вывести USDT",
    "提取 USDT"
  ],
  "Withdraw available INR balance as USDT using the current Admin-set Merchant rate. Merchant cannot edit the rate.": [
    "Выводите доступный баланс INR в USDT по текущему курсу, заданному администратором. Мерчант не может менять курс.",
    "按管理员当前设定的商户汇率将可用 INR 余额提取为 USDT。商户无法修改汇率。"
  ],
  "Manage Webhooks": [
    "Управление вебхуками",
    "管理 Webhook"
  ],
  "Configure delivery and retry status.": [
    "Настройка доставки и повторных попыток.",
    "配置投递与重试状态。"
  ],
  "View Analytics": [
    "Посмотреть аналитику",
    "查看分析"
  ],
  "Review detailed merchant insights.": [
    "Подробная аналитика мерчанта.",
    "查看详细商户分析。"
  ],
  "Help Center": [
    "Центр помощи",
    "帮助中心"
  ],
  "Open a support thread.": [
    "Создать обращение в поддержку.",
    "发起支持会话。"
  ],
  "Payment Volume": [
    "Объём платежей",
    "支付金额"
  ],
  "Confirmed collection volume for the selected period.": [
    "Подтверждённый объём поступлений за выбранный период.",
    "所选期间的已确认收款金额。"
  ],
  "Last 7 days": [
    "Последние 7 дней",
    "最近 7 天"
  ],
  "Last 30 days": [
    "Последние 30 дней",
    "最近 30 天"
  ],
  "Last 24 hours": [
    "Последние 24 часа",
    "最近 24 小时"
  ],
  "30 days": [
    "30 дней",
    "30 天"
  ],
  "Recent Orders": [
    "Последние заказы",
    "最近订单"
  ],
  "Status, amount, origin, webhook state.": [
    "Статус, сумма, источник и состояние вебхука.",
    "状态、金额、来源与 Webhook 状态。"
  ],
  "View all": [
    "Показать все",
    "查看全部"
  ],
  "Reference": [
    "Номер заказа",
    "参考编号"
  ],
  "Amount": [
    "Сумма",
    "金额"
  ],
  "Status": [
    "Статус",
    "状态"
  ],
  "Origin": [
    "Источник",
    "来源"
  ],
  "Payout Review Queue": [
    "Очередь проверки выплат",
    "待审核付款队列"
  ],
  "Proof available; financial posting remains once-only and auditable.": [
    "Подтверждение доступно; проводки выполняются однократно и доступны для аудита.",
    "凭证已就绪；财务入账保持唯一且可审计。"
  ],
  "Open review": [
    "Открыть проверку",
    "打开审核"
  ],
  "User proof": [
    "Подтверждение пользователя",
    "用户凭证"
  ],
  "Operational Health": [
    "Состояние систем",
    "运行状况"
  ],
  "Merchant-facing systems only.": [
    "Только системы мерчанта.",
    "仅显示商户侧系统。"
  ],
  "Performance": [
    "Эффективность",
    "表现"
  ],
  "Analytics": [
    "Аналитика",
    "分析"
  ],
  "Merchant collection performance": [
    "Эффективность приёма платежей",
    "商户收款表现"
  ],
  "Order conversion, successful volume, pending/failed states, recovery and fees.": [
    "Конверсия заказов, успешные платежи, ожидающие и неуспешные операции, восстановление и комиссии.",
    "订单转化、成功金额、待处理／失败状态、恢复情况与费用。"
  ],
  "Download CSV": [
    "Скачать CSV",
    "下载 CSV"
  ],
  "Successful volume": [
    "Успешный объём",
    "成功金额"
  ],
  "Orders": [
    "Заказы",
    "订单"
  ],
  "Success rate": [
    "Доля успешных",
    "成功率"
  ],
  "Recovered": [
    "Восстановлено",
    "已恢复"
  ],
  "Order Success Trend": [
    "Динамика успешных заказов",
    "订单成功趋势"
  ],
  "Successful vs pending order trend.": [
    "Динамика успешных и ожидающих заказов.",
    "成功与待处理订单趋势。"
  ],
  "Channel breakdown": [
    "По каналам",
    "渠道明细"
  ],
  "Channel": [
    "Канал",
    "渠道"
  ],
  "Volume": [
    "Объём",
    "金额"
  ],
  "Fees": [
    "Комиссии",
    "费用"
  ],
  "Pending": [
    "В ожидании",
    "待处理"
  ],
  "Failed": [
    "Неуспешно",
    "失败"
  ],
  "Generate Payment Link": [
    "Создать платёжную ссылку",
    "生成支付链接"
  ],
  "Create canonical Merchant payment links without exposing User bank/device/routing details.": [
    "Создавайте платёжные ссылки мерчанта без раскрытия банковских данных, устройств или маршрутизации пользователей.",
    "创建标准商户支付链接，不暴露用户银行、设备或路由信息。"
  ],
  "Routing": [
    "Маршрутизация",
    "路由"
  ],
  "Auto · WPay assigned eligible route": [
    "Авто · Подходящий маршрут WPay",
    "自动 · WPay 分配的合适路由"
  ],
  "Amount type": [
    "Тип суммы",
    "金额类型"
  ],
  "Fixed INR amount": [
    "Фиксированная сумма INR",
    "固定 INR 金额"
  ],
  "Customer enters amount (not supported)": [
    "Сумма вводится клиентом (не поддерживается)",
    "客户输入金额（不支持）"
  ],
  "Merchant reference": [
    "Номер заказа мерчанта",
    "商户参考编号"
  ],
  "Amount (INR)": [
    "Сумма (INR)",
    "金额（INR）"
  ],
  "Description": [
    "Описание",
    "描述"
  ],
  "Create link": [
    "Создать ссылку",
    "创建链接"
  ],
  "Link creation uses your assigned routes and current Admin policy.": [
    "Ссылки создаются по назначенным маршрутам и действующим правилам администратора.",
    "使用已分配路由及当前管理员策略创建链接。"
  ],
  "Merchant cannot select expiry or underlying User/UPI route. WPay uses the Admin-configured TTL and an eligible assigned route without exposing User bank/device details.": [
    "Мерчант не выбирает срок действия или маршрут пользователя/UPI. WPay использует срок администратора и подходящий назначенный маршрут без раскрытия банковских данных и устройств.",
    "商户无法选择有效期或底层用户／UPI 路由。WPay 使用管理员设定的有效期和适用路由，不暴露用户银行或设备信息。"
  ],
  "Generated link": [
    "Созданная ссылка",
    "已生成链接"
  ],
  "Share, copy or open checkout.": [
    "Поделитесь, скопируйте или откройте оплату.",
    "分享、复制或打开收银台。"
  ],
  "No generated link yet": [
    "Ссылка ещё не создана",
    "尚未生成链接"
  ],
  "Create a link to preview QR, URL and expiry.": [
    "Создайте ссылку для просмотра QR-кода, URL и срока действия.",
    "创建链接以预览二维码、网址和有效期。"
  ],
  "Payment Link History": [
    "История платёжных ссылок",
    "支付链接历史"
  ],
  "Expiry": [
    "Срок действия",
    "有效期"
  ],
  "Webhook": [
    "Вебхук",
    "Webhook"
  ],
  "Merchant-facing order status only — no User bank/device/OTP/private route details.": [
    "Только статус заказа мерчанта — без банковских данных, устройств, OTP и закрытых маршрутов пользователей.",
    "仅显示商户侧订单状态，不包含用户银行、设备、OTP 或私有路由信息。"
  ],
  "Manual INR order using the same gateway contract.": [
    "Ручной заказ INR по тому же протоколу шлюза.",
    "使用相同网关协议手动创建 INR 订单。"
  ],
  "Create order": [
    "Создать заказ",
    "创建订单"
  ],
  "UTR/Evidence": [
    "UTR/Подтверждение",
    "UTR／凭证"
  ],
  "Unified Merchant order, payout, fee and settlement history.": [
    "Единая история заказов, выплат, комиссий и расчётов мерчанта.",
    "统一的商户订单、付款、费用与结算历史。"
  ],
  "All types": [
    "Все типы",
    "全部类型"
  ],
  "Order": [
    "Заказ",
    "订单"
  ],
  "Payout": [
    "Выплата",
    "付款"
  ],
  "Fee": [
    "Комиссия",
    "费用"
  ],
  "Date": [
    "Дата",
    "日期"
  ],
  "Type": [
    "Тип",
    "类型"
  ],
  "Debit": [
    "Списание",
    "借记"
  ],
  "Credit": [
    "Зачисление",
    "贷记"
  ],
  "Currency": [
    "Валюта",
    "币种"
  ],
  "Entry status": [
    "Статус проводки",
    "分录状态"
  ],
  "Merchant payouts": [
    "Выплаты мерчанта",
    "商户付款"
  ],
  "Create a single payout or upload a validated Excel batch. Payout creation is capped by your current available balance.": [
    "Создайте выплату или загрузите проверенный пакет Excel. Сумма ограничена доступным балансом.",
    "创建单笔付款或上传经校验的 Excel 批次。付款金额受当前可用余额限制。"
  ],
  "Available:": [
    "Доступно:",
    "可用："
  ],
  "Single Payout": [
    "Одиночная выплата",
    "单笔付款"
  ],
  "Bulk Payout · Excel": [
    "Пакетная выплата · Excel",
    "批量付款 · Excel"
  ],
  "Payout destination": [
    "Способ выплаты",
    "付款方式"
  ],
  "Bank account": [
    "Банковский счёт",
    "银行账户"
  ],
  "Beneficiary name": [
    "Имя получателя",
    "收款人姓名"
  ],
  "Bank name": [
    "Название банка",
    "银行名称"
  ],
  "Account number": [
    "Номер счёта",
    "账号"
  ],
  "UPI ID": [
    "UPI ID",
    "UPI ID"
  ],
  "Complete within (minutes from submission)": [
    "Выполнить за (минут с подачи)",
    "完成时限（提交后的分钟数）"
  ],
  "Submit for Admin approval": [
    "Отправить администратору",
    "提交管理员审批"
  ],
  "What happens next": [
    "Следующие шаги",
    "后续流程"
  ],
  "Merchant-originated review path.": [
    "Проверка выплат, созданных мерчантом.",
    "商户发起的审核流程。"
  ],
  "1. Admin approves request": [
    "1. Администратор одобряет запрос",
    "1. 管理员批准申请"
  ],
  "2. User creates payout": [
    "2. Пользователь выполняет выплату",
    "2. 用户创建付款"
  ],
  "3. Proof returns to Merchant review": [
    "3. Подтверждение поступает мерчанту",
    "3. 凭证返回商户审核"
  ],
  "Admin approves once per request or Excel batch. At least 15 minutes must remain before a User can claim an order.": [
    "Администратор одобряет запрос или пакет Excel один раз. До срока заказа должно оставаться не менее 15 минут для принятия пользователем.",
    "管理员按单个申请或 Excel 批次审批。用户领取订单时必须至少剩余 15 分钟。"
  ],
  "10-minute lock, then 5-minute cooldown if unpaid.": [
    "Блокировка на 10 минут, затем 5 минут ожидания при неоплате.",
    "锁定 10 分钟，未支付时再冷却 5 分钟。"
  ],
  "Merchant reviews UTR/proof because the payout originated here.": [
    "Мерчант проверяет UTR и подтверждение по своей выплате.",
    "付款由商户发起，因此由商户审核 UTR／凭证。"
  ],
  "1. Download & fill Excel template": [
    "1. Скачайте и заполните шаблон Excel",
    "1. 下载并填写 Excel 模板"
  ],
  "Choose Bank or UPI. Every row has its own duration in minutes, counted from batch submission. Admin reviews the whole batch once; Users receive individual orders.": [
    "Выберите банк или UPI. У каждой строки свой срок в минутах с подачи пакета. Администратор проверяет весь пакет, пользователи получают отдельные заказы.",
    "选择银行或 UPI。每行自批次提交起单独计时。管理员统一审核批次，用户接收各自订单。"
  ],
  "Excel payout destination": [
    "Способ выплаты в Excel",
    "Excel 付款方式"
  ],
  "Download Excel Template (.xlsx)": [
    "Скачать шаблон Excel (.xlsx)",
    "下载 Excel 模板（.xlsx）"
  ],
  "Use the exact WPay columns.": [
    "Используйте точные столбцы WPay.",
    "请使用 WPay 指定的列。"
  ],
  "2. Upload completed Excel": [
    "2. Загрузите заполненный Excel",
    "2. 上传已填写的 Excel"
  ],
  ".xlsx preferred; CSV accepted as fallback.": [
    "Предпочтителен .xlsx; также принимается CSV.",
    "推荐 .xlsx，也支持 CSV。"
  ],
  "No file loaded.": [
    "Файл не загружен.",
    "未加载文件。"
  ],
  "Create Bulk Payouts": [
    "Создать пакет выплат",
    "创建批量付款"
  ],
  "Bulk Upload Preview": [
    "Предпросмотр пакета",
    "批量上传预览"
  ],
  "Balance validation pending": [
    "Ожидается проверка баланса",
    "等待余额校验"
  ],
  "Batch total": [
    "Итого по пакету",
    "批次总额"
  ],
  "Valid rows": [
    "Корректные строки",
    "有效行数"
  ],
  "The combined upload cannot exceed this amount.": [
    "Общая сумма загрузки не может превышать эту сумму.",
    "上传总额不得超过此金额。"
  ],
  "Beneficiary": [
    "Получатель",
    "收款人"
  ],
  "Bank": [
    "Банк",
    "银行"
  ],
  "Validation": [
    "Проверка",
    "校验"
  ],
  "Created Payout Requests": [
    "Созданные запросы на выплату",
    "已创建付款申请"
  ],
  "Created requests and review outcomes.": [
    "Созданные запросы и результаты проверки.",
    "已创建申请与审核结果。"
  ],
  "Created": [
    "Создано",
    "创建时间"
  ],
  "Risk & Review": [
    "Риски и проверка",
    "风险与审核"
  ],
  "Review UTR/proof submitted by Users only for Merchant-originated payout requests.": [
    "Проверяйте UTR и подтверждения пользователей только по выплатам мерчанта.",
    "仅审核用户为商户付款申请提交的 UTR／凭证。"
  ],
  "Awaiting review": [
    "Ожидает проверки",
    "待审核"
  ],
  "Select a payout": [
    "Выберите выплату",
    "选择付款"
  ],
  "Review Merchant reference, beneficiary, amount, UTR and submitted proof.": [
    "Проверьте номер заказа, получателя, сумму, UTR и подтверждение.",
    "审核商户参考编号、收款人、金额、UTR 和提交的凭证。"
  ],
  "Selected proof": [
    "Выбранное подтверждение",
    "已选凭证"
  ],
  "User private routing/bank/device details are never shown.": [
    "Закрытые данные маршрутизации, банков и устройств пользователей не отображаются.",
    "不显示用户私有路由、银行或设备信息。"
  ],
  "Create scoped server credentials. Secrets are shown once and never displayed again.": [
    "Создавайте серверные ключи с ограниченными правами. Секреты показываются только один раз.",
    "创建具有权限范围的服务器凭证。密钥仅显示一次。"
  ],
  "＋ Create API Key": [
    "＋ Создать ключ API",
    "＋ 创建 API 密钥"
  ],
  "Label": [
    "Название",
    "标签"
  ],
  "Prefix": [
    "Префикс",
    "前缀"
  ],
  "Scopes": [
    "Права доступа",
    "权限范围"
  ],
  "Last used": [
    "Последнее использование",
    "上次使用"
  ],
  "Actions": [
    "Действия",
    "操作"
  ],
  "Configure HTTPS delivery, rotate HMAC secret and monitor retry state.": [
    "Настройте доставку HTTPS, смену секрета HMAC и контроль повторов.",
    "配置 HTTPS 投递、轮换 HMAC 密钥并监控重试状态。"
  ],
  "Endpoint": [
    "Адрес",
    "端点"
  ],
  "HTTPS callback URL": [
    "URL обратного вызова HTTPS",
    "HTTPS 回调网址"
  ],
  "Save endpoint / Rotate secret": [
    "Сохранить адрес / Сменить секрет",
    "保存端点／轮换密钥"
  ],
  "Webhook Events": [
    "События вебхуков",
    "Webhook 事件"
  ],
  "Event ID": [
    "ID события",
    "事件编号"
  ],
  "Order/Payout": [
    "Заказ/Выплата",
    "订单／付款"
  ],
  "State": [
    "Состояние",
    "状态"
  ],
  "Attempts": [
    "Попытки",
    "尝试次数"
  ],
  "Last code": [
    "Последний код",
    "最近状态码"
  ],
  "Merchant API access history. Secrets and request bodies are not exposed.": [
    "История доступа к API мерчанта. Секреты и тела запросов не раскрываются.",
    "商户 API 访问历史。不暴露密钥和请求正文。"
  ],
  "Time": [
    "Время",
    "时间"
  ],
  "Operation": [
    "Операция",
    "操作"
  ],
  "Server-to-server INR order creation, idempotency and webhook verification.": [
    "Создание заказов INR между серверами, идемпотентность и проверка вебхуков.",
    "服务器间 INR 订单创建、幂等性与 Webhook 验证。"
  ],
  "Create payout": [
    "Создать выплату",
    "创建付款"
  ],
  "Never expose Merchant API keys in a browser, mobile app, URL or client-side JavaScript. Use them from your server.": [
    "Не раскрывайте ключи API в браузере, приложении, URL или клиентском JavaScript. Используйте их только на сервере.",
    "切勿在浏览器、移动应用、网址或客户端 JavaScript 中暴露商户 API 密钥。请在服务器端使用。"
  ],
  "Repeat the same idempotency key + payload after timeout. NO_ROUTE creates no order/payment link. Submitted UTR is never proof of success.": [
    "После тайм-аута повторите тот же ключ идемпотентности и данные. NO_ROUTE не создаёт заказ или ссылку. Отправленный UTR не подтверждает успех.",
    "超时后重试相同幂等键和请求内容。NO_ROUTE 不创建订单或支付链接。已提交的 UTR 不代表支付成功。"
  ],
  "Webhook signature": [
    "Подпись вебхука",
    "Webhook 签名"
  ],
  "HMAC-SHA256(secret, timestamp + \".\" + eventId + \".\" + exactBodyBytes). Verify in constant time and reject replayed event IDs.": [
    "HMAC-SHA256(secret, timestamp + \".\" + eventId + \".\" + exactBodyBytes). Проверяйте за постоянное время и отклоняйте повторные ID событий.",
    "HMAC-SHA256(secret, timestamp + \".\" + eventId + \".\" + exactBodyBytes)。请使用恒定时间比较，并拒绝重复事件编号。"
  ],
  "Commercials": [
    "Тарифы",
    "商务条款"
  ],
  "Versioned Merchant fee terms and immutable order snapshots.": [
    "Версии тарифов мерчанта и неизменяемые данные заказов.",
    "版本化商户费用条款与不可更改的订单快照。"
  ],
  "Pay-in fee": [
    "Комиссия за приём",
    "收款费"
  ],
  "Payout fee": [
    "Комиссия за выплату",
    "付款费"
  ],
  "Fixed fee": [
    "Фиксированная комиссия",
    "固定费用"
  ],
  "Commercial version": [
    "Версия тарифов",
    "商务条款版本"
  ],
  "Fee Version History": [
    "История тарифов",
    "费用版本历史"
  ],
  "Version": [
    "Версия",
    "版本"
  ],
  "Pay-in": [
    "Приём платежей",
    "收款"
  ],
  "Fixed": [
    "Фиксированная",
    "固定"
  ],
  "Effective": [
    "Действует с",
    "生效时间"
  ],
  "Immutable Merchant accounting view: gross, fees, holds and available INR.": [
    "Неизменяемый учёт мерчанта: оборот, комиссии, удержания и доступные INR.",
    "不可更改的商户账目：总额、费用、保留金额和可用 INR。"
  ],
  "Gross successful": [
    "Успешный оборот",
    "成功总额"
  ],
  "Available": [
    "Доступно",
    "可用"
  ],
  "Held": [
    "Удержано",
    "保留"
  ],
  "Held / Frozen": [
    "Удержано / Заморожено",
    "保留／冻结"
  ],
  "Merchant-scoped hold records and release reasons.": [
    "Удержания мерчанта и причины разблокировки.",
    "商户范围内的保留记录与释放原因。"
  ],
  "Hold": [
    "Удержание",
    "保留"
  ],
  "Reason": [
    "Причина",
    "原因"
  ],
  "Merchant withdrawal": [
    "Вывод мерчанта",
    "商户提现"
  ],
  "Available INR": [
    "Доступные INR",
    "可用 INR"
  ],
  "Admin USDT rate": [
    "Курс USDT администратора",
    "管理员 USDT 汇率"
  ],
  "Admin rate": [
    "Курс администратора",
    "管理员汇率"
  ],
  "Max USDT now": [
    "Максимум USDT сейчас",
    "当前最大 USDT"
  ],
  "Request USDT Withdrawal": [
    "Запросить вывод USDT",
    "申请 USDT 提现"
  ],
  "Request USDT withdrawal": [
    "Запросить вывод USDT",
    "申请 USDT 提现"
  ],
  "The requested INR is reserved immediately. Completion is recorded after the transfer is confirmed.": [
    "Запрошенная сумма INR резервируется сразу. Завершение фиксируется после подтверждения перевода.",
    "申请的 INR 将立即预留。转账确认后记录完成状态。"
  ],
  "INR balance to reserve": [
    "Зарезервировать INR",
    "预留 INR 余额"
  ],
  "USDT destination address": [
    "Адрес получения USDT",
    "USDT 收款地址"
  ],
  "You receive": [
    "Вы получите",
    "您将收到"
  ],
  "Admin-set rate": [
    "Курс администратора",
    "管理员设定汇率"
  ],
  "Use Full Available Balance": [
    "Использовать весь доступный баланс",
    "使用全部可用余额"
  ],
  "Read-only Merchant rate snapshot.": [
    "Курс мерчанта только для просмотра.",
    "商户汇率快照，仅供查看。"
  ],
  "Rate": [
    "Курс",
    "汇率"
  ],
  "Network": [
    "Сеть",
    "网络"
  ],
  "Address": [
    "Адрес",
    "地址"
  ],
  "USDT Withdrawal History": [
    "История вывода USDT",
    "USDT 提现历史"
  ],
  "Request": [
    "Запрос",
    "申请"
  ],
  "INR debited": [
    "Списано INR",
    "扣除 INR"
  ],
  "USDT quoted": [
    "Расчёт USDT",
    "USDT 报价"
  ],
  "Merchant-scoped exports for orders, transactions, fees and payouts.": [
    "Выгрузка заказов, транзакций, комиссий и выплат мерчанта.",
    "导出商户订单、交易、费用与付款数据。"
  ],
  "From": [
    "С",
    "从"
  ],
  "To": [
    "По",
    "至"
  ],
  "Export CSV": [
    "Экспорт CSV",
    "导出 CSV"
  ],
  "Orders Report": [
    "Отчёт по заказам",
    "订单报告"
  ],
  "Up to 31 days per export.": [
    "До 31 дня на одну выгрузку.",
    "每次最多导出 31 天。"
  ],
  "Fees Report": [
    "Отчёт по комиссиям",
    "费用报告"
  ],
  "Commercial snapshot and posted fee entries.": [
    "Тарифы и проведённые комиссии.",
    "商务条款快照与已入账费用。"
  ],
  "Payout Report": [
    "Отчёт по выплатам",
    "付款报告"
  ],
  "Inbox": [
    "Входящие",
    "收件箱"
  ],
  "Account and security activity. Read status is saved on this browser.": [
    "События аккаунта и безопасности. Статус прочтения сохраняется в этом браузере.",
    "账户与安全活动。已读状态保存在此浏览器。"
  ],
  "Mark all read": [
    "Отметить всё прочитанным",
    "全部标为已读"
  ],
  "Create support tickets and read responses from your support team.": [
    "Создавайте обращения и читайте ответы поддержки.",
    "创建工单并阅读支持团队回复。"
  ],
  "＋ New Ticket": [
    "＋ Новое обращение",
    "＋ 新建工单"
  ],
  "Tickets": [
    "Обращения",
    "工单"
  ],
  "Conversation": [
    "Переписка",
    "会话"
  ],
  "Select a ticket": [
    "Выберите обращение",
    "选择工单"
  ],
  "Account Security": [
    "Безопасность аккаунта",
    "账户安全"
  ],
  "Authenticator MFA, password policy, recovery acknowledgement and sessions.": [
    "Двухфакторная аутентификация, правила пароля, коды восстановления и сеансы.",
    "身份验证器、密码规则、恢复确认与会话。"
  ],
  "Optional. Enable it for additional account protection.": [
    "Необязательно. Включите для дополнительной защиты.",
    "可选。启用可增强账户安全。"
  ],
  "Loading security settings…": [
    "Загрузка настроек безопасности…",
    "正在加载安全设置…"
  ],
  "Change password": [
    "Изменить пароль",
    "修改密码"
  ],
  "Current password": [
    "Текущий пароль",
    "当前密码"
  ],
  "New password": [
    "Новый пароль",
    "新密码"
  ],
  "Sessions": [
    "Сеансы",
    "会话"
  ],
  "Active Merchant sessions.": [
    "Активные сеансы мерчанта.",
    "当前商户会话。"
  ],
  "Logout all sessions": [
    "Завершить все сеансы",
    "退出全部会话"
  ],
  "Loading…": [
    "Загрузка…",
    "加载中…"
  ],
  "Success": [
    "Успешно",
    "成功"
  ],
  "Live": [
    "Онлайн",
    "实时"
  ],
  "Prepare": [
    "Подготовить",
    "准备"
  ],
  "Delivery status": [
    "Статус доставки",
    "投递状态"
  ],
  "Expires": [
    "Истекает",
    "到期时间"
  ],
  "Request ID": [
    "ID запроса",
    "申请编号"
  ],
  "Action": [
    "Действие",
    "操作"
  ],
  "View Reports": [
    "Посмотреть отчёты",
    "查看报告"
  ],
  "Available for payouts / USDT": [
    "Доступно для выплат / USDT",
    "可用于付款／USDT"
  ],
  "· Admin controlled": [
    "· Управляется администратором",
    "· 由管理员控制"
  ],
  "＋ Create Payment Link": [
    "＋ Создать платёжную ссылку",
    "＋ 创建支付链接"
  ],
  "Review": [
    "Проверить",
    "审核"
  ],
  "No records found": [
    "Записей не найдено",
    "未找到记录"
  ],
  "Previous": [
    "Назад",
    "上一页"
  ],
  "Next": [
    "Далее",
    "下一页"
  ],
  "Confirm": [
    "Подтвердить",
    "确认"
  ],
  "Cancel": [
    "Отмена",
    "取消"
  ],
  "Approve": [
    "Одобрить",
    "批准"
  ],
  "Reject": [
    "Отклонить",
    "拒绝"
  ],
  "Revoke": [
    "Отозвать",
    "撤销"
  ],
  "Disable": [
    "Отключить",
    "禁用"
  ],
  "View destination": [
    "Посмотреть реквизиты",
    "查看收款信息"
  ],
  "View beneficiary": [
    "Посмотреть получателя",
    "查看收款人"
  ],
  "Cancel payout": [
    "Отменить выплату",
    "取消付款"
  ],
  "Dispute payment": [
    "Оспорить выплату",
    "申诉付款"
  ],
  "Submitted": [
    "Отправлено",
    "已提交"
  ],
  "Posted": [
    "Проведено",
    "已入账"
  ],
  "Not configured": [
    "Не настроено",
    "未配置"
  ],
  "Not submitted": [
    "Не отправлено",
    "未提交"
  ],
  "No payouts awaiting review": [
    "Нет выплат на проверке",
    "没有待审核付款"
  ],
  "Payout details": [
    "Детали выплаты",
    "付款详情"
  ],
  "Order details": [
    "Детали заказа",
    "订单详情"
  ],
  "USDT withdrawal": [
    "Вывод USDT",
    "USDT 提现"
  ],
  "Payment link copied.": [
    "Платёжная ссылка скопирована.",
    "支付链接已复制。"
  ],
  "Payment link created.": [
    "Платёжная ссылка создана.",
    "支付链接已创建。"
  ],
  "Preferences saved.": [
    "Настройки сохранены.",
    "偏好已保存。"
  ],
  "Language saved.": [
    "Язык сохранён.",
    "语言已保存。"
  ],
  "Profile saved.": [
    "Профиль сохранён.",
    "资料已保存。"
  ],
  "Payout updated.": [
    "Выплата обновлена.",
    "付款已更新。"
  ],
  "Withdrawal cancelled.": [
    "Вывод отменён.",
    "提现已取消。"
  ],
  "Withdrawal requested; INR reserved.": [
    "Вывод запрошен; INR зарезервированы.",
    "提现已申请；INR 已预留。"
  ],
  "Bulk payout requests created.": [
    "Пакет выплат создан.",
    "批量付款申请已创建。"
  ],
  "Awaiting Admin approval; amount and fees reserved.": [
    "Ожидается одобрение администратора; сумма и комиссии зарезервированы.",
    "等待管理员审批；金额和费用已预留。"
  ],
  "API credential revoked.": [
    "Ключ API отозван.",
    "API 凭证已撤销。"
  ],
  "Webhook retry queued.": [
    "Повторная доставка вебхука поставлена в очередь.",
    "Webhook 重试已加入队列。"
  ],
  "Support ticket created.": [
    "Обращение в поддержку создано.",
    "支持工单已创建。"
  ],
  "Dispute submitted for review.": [
    "Спор отправлен на проверку.",
    "申诉已提交审核。"
  ],
  "Marked read on this browser.": [
    "Отмечено прочитанным в этом браузере.",
    "已在此浏览器标为已读。"
  ],
  "Password changed. Other sessions were invalidated.": [
    "Пароль изменён. Остальные сеансы завершены.",
    "密码已修改，其他会话已失效。"
  ],
  "Signing in…": [
    "Вход…",
    "正在登录…"
  ],
  "Your session expired or the sign-in details are incorrect. Please sign in again.": [
    "Сеанс истёк или данные входа неверны. Войдите снова.",
    "会话已过期或登录信息错误，请重新登录。"
  ],
  "This action is not available for your account. Check approval and permissions with Admin.": [
    "Действие недоступно. Уточните статус одобрения и права у администратора.",
    "您的账户无法执行此操作，请向管理员确认审批和权限。"
  ],
  "The service is temporarily unavailable. Please retry.": [
    "Сервис временно недоступен. Повторите попытку.",
    "服务暂时不可用，请重试。"
  ],
  "Too many attempts. Please wait before retrying.": [
    "Слишком много попыток. Подождите перед повтором.",
    "尝试次数过多，请稍后重试。"
  ],
  "Authenticator code was not accepted. Use a fresh code.": [
    "Код аутентификатора не принят. Используйте новый код.",
    "验证器代码无效，请使用新代码。"
  ],
  "Check the form values and try again.": [
    "Проверьте поля формы и повторите попытку.",
    "请检查表单内容后重试。"
  ],
  "The record changed or the reference is already used. Refresh and check before retrying.": [
    "Запись изменилась или номер уже использован. Обновите данные перед повтором.",
    "记录已变更或参考编号已使用，请刷新检查后重试。"
  ],
  "Available balance is insufficient, including fees and reserved funds.": [
    "Недостаточно доступных средств с учётом комиссий и резервов.",
    "可用余额不足，需计入费用与预留资金。"
  ],
  "No eligible assigned route is available for this amount. No payment link was created.": [
    "Для этой суммы нет подходящего назначенного маршрута. Ссылка не создана.",
    "此金额无适用的已分配路由，未创建支付链接。"
  ],
  "Please confirm your identity to continue.": [
    "Подтвердите личность для продолжения.",
    "请验证身份以继续。"
  ],
  "Admin has not configured your USDT rate.": [
    "Администратор не настроил курс USDT.",
    "管理员尚未配置您的 USDT 汇率。"
  ],
  "The response timed out. Retry the same form to safely check the original request.": [
    "Время ожидания истекло. Повторите ту же форму для безопасной проверки исходного запроса.",
    "响应超时，请重试同一表单以安全检查原请求。"
  ],
  "Request failed. Please retry.": [
    "Ошибка запроса. Повторите попытку.",
    "请求失败，请重试。"
  ],
  "Confirmation cancelled.": [
    "Подтверждение отменено.",
    "确认已取消。"
  ],
  "Confirm your identity": [
    "Подтвердите личность",
    "验证身份"
  ],
  "Authenticator code": [
    "Код аутентификатора",
    "身份验证器代码"
  ],
  "Set up authenticator": [
    "Настроить аутентификатор",
    "设置身份验证器"
  ],
  "Authenticator setup QR": [
    "QR-код настройки аутентификатора",
    "身份验证器设置二维码"
  ],
  "Save your recovery codes": [
    "Сохраните коды восстановления",
    "保存恢复代码"
  ],
  "Each code can be used once. Store them securely.": [
    "Каждый код можно использовать один раз. Храните их безопасно.",
    "每个代码只能使用一次，请安全保存。"
  ],
  "I saved these codes securely": [
    "Я сохранил коды в безопасном месте",
    "我已安全保存这些代码"
  ],
  "Continue": [
    "Продолжить",
    "继续"
  ],
  "Set your new password": [
    "Установите новый пароль",
    "设置新密码"
  ],
  "Confirm new password": [
    "Подтвердите новый пароль",
    "确认新密码"
  ],
  "Save password": [
    "Сохранить пароль",
    "保存密码"
  ],
  "Recovery code": [
    "Код восстановления",
    "恢复代码"
  ],
  "Verify": [
    "Проверить",
    "验证"
  ],
  "Use recovery code": [
    "Использовать код восстановления",
    "使用恢复代码"
  ],
  "Back to sign in": [
    "Вернуться ко входу",
    "返回登录"
  ],
  "Passwords must match.": [
    "Пароли должны совпадать.",
    "两次密码必须一致。"
  ],
  "Please sign in with a Merchant account.": [
    "Войдите с аккаунтом мерчанта.",
    "请使用商户账户登录。"
  ],
  "Enabled": [
    "Включено",
    "已启用"
  ],
  "Optional · Off": [
    "Необязательно · Выключено",
    "可选 · 已关闭"
  ],
  "Authenticator protects your account": [
    "Аутентификатор защищает ваш аккаунт",
    "身份验证器保护您的账户"
  ],
  "Sign in with email and password": [
    "Вход по email и паролю",
    "使用邮箱和密码登录"
  ],
  "Replace authenticator": [
    "Заменить аутентификатор",
    "更换身份验证器"
  ],
  "New recovery codes": [
    "Новые коды восстановления",
    "新的恢复代码"
  ],
  "Enable authenticator": [
    "Включить аутентификатор",
    "启用身份验证器"
  ],
  "Current session": [
    "Текущий сеанс",
    "当前会话"
  ],
  "Active session": [
    "Активный сеанс",
    "活跃会话"
  ],
  "Select a valid date range of up to 31 days.": [
    "Выберите корректный период до 31 дня.",
    "请选择不超过 31 天的有效日期范围。"
  ],
  "Too many records. Select a smaller date range.": [
    "Слишком много записей. Выберите меньший период.",
    "记录过多，请缩小日期范围。"
  ],
  "Select a smaller date range.": [
    "Выберите меньший период.",
    "请选择更小的日期范围。"
  ],
  "Export exceeds 10,000 history records. Contact Admin for a larger export.": [
    "Выгрузка превышает 10 000 записей. Обратитесь к администратору.",
    "导出超过 10,000 条历史记录，请联系管理员扩大导出范围。"
  ],
  "Support response": [
    "Ответ поддержки",
    "支持回复"
  ],
  "Awaiting a support response.": [
    "Ожидается ответ поддержки.",
    "等待支持回复。"
  ],
  "Revoke API credential": [
    "Отозвать ключ API",
    "撤销 API 凭证"
  ],
  "This credential will stop accepting new API requests.": [
    "Этот ключ перестанет принимать новые запросы API.",
    "此凭证将不再接受新的 API 请求。"
  ],
  "Cancel USDT withdrawal": [
    "Отменить вывод USDT",
    "取消 USDT 提现"
  ],
  "Dispute approved payout": [
    "Оспорить одобренную выплату",
    "申诉已批准付款"
  ],
  "Statement coverage starts (your local time)": [
    "Начало периода выписки (местное время)",
    "账单起始时间（本地时间）"
  ],
  "Statement coverage ends (your local time)": [
    "Конец периода выписки (местное время)",
    "账单结束时间（本地时间）"
  ],
  "Fresh receiving bank / UPI statement": [
    "Актуальная выписка банка / UPI получателя",
    "最新收款银行／UPI 账单"
  ],
  "Upload a PDF, PNG or JPG up to 1 MB. Cover the payment time through now. Admin will verify the document before deciding.": [
    "Загрузите PDF, PNG или JPG до 1 МБ за период с момента платежа до текущего времени. Администратор проверит документ.",
    "上传不超过 1 MB 的 PDF、PNG 或 JPG，覆盖付款时刻至今。管理员将核验文件后处理。"
  ],
  "Select a statement up to 1 MB.": [
    "Выберите выписку до 1 МБ.",
    "请选择不超过 1 MB 的账单。"
  ],
  "Submit dispute": [
    "Отправить спор",
    "提交申诉"
  ],
  "Merchant sign-in support": [
    "Помощь со входом мерчанта",
    "商户登录支持"
  ],
  "Contact your WPay administrator for account approval or a temporary password reset. Sign in to access your support tickets.": [
    "Обратитесь к администратору WPay для одобрения аккаунта или сброса пароля. Войдите для доступа к обращениям.",
    "请联系 WPay 管理员审批账户或获取临时重置密码。登录后可查看支持工单。"
  ],
  "Reset your password": [
    "Сбросить пароль",
    "重置密码"
  ],
  "Contact your WPay administrator for a temporary password. Sign in with that password to securely set a new one.": [
    "Запросите временный пароль у администратора WPay. Войдите с ним и установите новый пароль.",
    "请向 WPay 管理员获取临时密码，然后登录并安全设置新密码。"
  ],
  "Create Merchant account": [
    "Создать аккаунт мерчанта",
    "创建商户账户"
  ],
  "Confirm password": [
    "Подтвердите пароль",
    "确认密码"
  ],
  "Registration submitted": [
    "Регистрация отправлена",
    "注册已提交"
  ],
  "Your Merchant account is pending Admin approval. Sign in after approval.": [
    "Аккаунт ожидает одобрения администратора. Войдите после одобрения.",
    "您的商户账户等待管理员审批，请获批后登录。"
  ],
  "This signs you out on all devices, including this one.": [
    "Вы выйдете на всех устройствах, включая это.",
    "这将退出所有设备上的会话，包括当前设备。"
  ],
  "Logout all": [
    "Выйти везде",
    "全部退出"
  ],
  "Download the selected template and upload the completed file.": [
    "Скачайте выбранный шаблон и загрузите заполненный файл.",
    "下载所选模板并上传填写完成的文件。"
  ],
  "The file must be 1 MB or smaller.": [
    "Размер файла не должен превышать 1 МБ.",
    "文件大小不得超过 1 MB。"
  ],
  "Validating all rows and current balance…": [
    "Проверка всех строк и текущего баланса…",
    "正在校验所有行及当前余额…"
  ],
  "Validated · fees included": [
    "Проверено · Комиссии учтены",
    "已校验 · 含费用"
  ],
  "Fix errors before creating": [
    "Исправьте ошибки перед созданием",
    "请先修正错误再创建"
  ],
  "Insufficient available balance including fees.": [
    "Недостаточно доступных средств с учётом комиссий.",
    "可用余额不足以支付金额与费用。"
  ],
  "Existing reference": [
    "Существующий номер",
    "已有参考编号"
  ],
  "Validate the file first.": [
    "Сначала проверьте файл.",
    "请先校验文件。"
  ],
  "Create API credential": [
    "Создать ключ API",
    "创建 API 凭证"
  ],
  "Read orders": [
    "Чтение заказов",
    "读取订单"
  ],
  "Create orders": [
    "Создание заказов",
    "创建订单"
  ],
  "Select at least one scope.": [
    "Выберите хотя бы одно право доступа.",
    "请至少选择一个权限范围。"
  ],
  "Save API credential": [
    "Сохраните ключ API",
    "保存 API 凭证"
  ],
  "Shown once. Store it on your server.": [
    "Показывается один раз. Сохраните на сервере.",
    "仅显示一次，请保存在服务器上。"
  ],
  "Save webhook signing secret": [
    "Сохраните секрет подписи вебхука",
    "保存 Webhook 签名密钥"
  ],
  "Shown once. Update your webhook signature verifier.": [
    "Показывается один раз. Обновите проверку подписи вебхука.",
    "仅显示一次，请更新 Webhook 签名验证器。"
  ],
  "Admin must configure your USDT rate first.": [
    "Администратор должен сначала настроить курс USDT.",
    "管理员须先配置您的 USDT 汇率。"
  ],
  "New support ticket": [
    "Новое обращение",
    "新建支持工单"
  ],
  "Subject": [
    "Тема",
    "主题"
  ],
  "Message": [
    "Сообщение",
    "消息"
  ],
  "Create ticket": [
    "Создать обращение",
    "创建工单"
  ],
  "Review the submitted evidence. Approval is processed by the server under the existing verification rules.": [
    "Проверьте подтверждение. Одобрение обрабатывается сервером по действующим правилам.",
    "请审核已提交凭证，服务器将按现有验证规则处理批准操作。"
  ],
  "Post-approval dispute": [
    "Спор после одобрения",
    "批准后申诉"
  ],
  "Report a missing payment within 48 hours of approval. A fresh receiving bank/UPI statement is required.": [
    "Сообщите о неполучении в течение 48 часов после одобрения. Нужна актуальная выписка банка/UPI получателя.",
    "请在批准后 48 小时内报告未到账问题，并提供最新收款银行／UPI 账单。"
  ],
  "Decision": [
    "Решение",
    "处理结果"
  ],
  "Reserved": [
    "Зарезервировано",
    "已预留"
  ],
  "Proof": [
    "Подтверждение",
    "凭证"
  ],
  "Completed": [
    "Завершено",
    "完成时间"
  ],
  "Deadline (IST)": [
    "Срок (IST)",
    "截止时间（IST）"
  ],
  "Connected to your payment gateway": [
    "Подключено к платёжному шлюзу",
    "已连接支付网关"
  ],
  "Unavailable": [
    "Недоступно",
    "不可用"
  ],
  "Admin rate not configured": [
    "Курс администратора не настроен",
    "管理员汇率未配置"
  ],
  "Current version": [
    "Текущая версия",
    "当前版本"
  ],
  "Per successful payout": [
    "За успешную выплату",
    "每笔成功付款"
  ],
  "Pay-in fees charged": [
    "Комиссии за приём",
    "已收取的收款费"
  ],
  "Payout fees charged (including fixed)": [
    "Комиссии за выплаты (включая фиксированные)",
    "已收取付款费（含固定费用）"
  ],
  "Total fees charged": [
    "Всего комиссий",
    "已收取费用总额"
  ],
  "Pending payout amount + fees": [
    "Ожидающая сумма выплат + комиссии",
    "待付款金额＋费用"
  ],
  "Completed payout principal": [
    "Сумма завершённых выплат",
    "已完成付款本金"
  ],
  "Payout fees charged": [
    "Комиссии за выплаты",
    "已收取付款费"
  ],
  "Pending USDT withdrawals (INR)": [
    "Ожидающий вывод USDT (INR)",
    "待处理 USDT 提现（INR）"
  ],
  "Completed USDT withdrawals (INR)": [
    "Завершённый вывод USDT (INR)",
    "已完成 USDT 提现（INR）"
  ],
  "Awaiting Admin": [
    "Ожидает администратора",
    "等待管理员"
  ],
  "Awaiting Merchant review": [
    "Ожидает проверки мерчанта",
    "等待商户审核"
  ],
  "successful": [
    "успешно",
    "成功"
  ],
  "completed": [
    "завершено",
    "已完成"
  ],
  "delivered": [
    "доставлено",
    "已投递"
  ],
  "approved": [
    "одобрено",
    "已批准"
  ],
  "active": [
    "активно",
    "有效"
  ],
  "failed": [
    "ошибка",
    "失败"
  ],
  "rejected": [
    "отклонено",
    "已拒绝"
  ],
  "expired": [
    "истекло",
    "已过期"
  ],
  "cancelled": [
    "отменено",
    "已取消"
  ],
  "pending": [
    "в ожидании",
    "待处理"
  ],
  "pending payment": [
    "ожидает оплаты",
    "等待支付"
  ],
  "pending admin": [
    "ожидает администратора",
    "等待管理员"
  ],
  "submitted": [
    "отправлено",
    "已提交"
  ],
  "open": [
    "открыто",
    "处理中"
  ],
  "requested": [
    "запрошено",
    "已申请"
  ],
  "review": [
    "на проверке",
    "审核中"
  ],
  "revoked": [
    "отозвано",
    "已撤销"
  ],
  "historical": [
    "архивный",
    "历史"
  ],
  "current": [
    "текущий",
    "当前"
  ],
  "none": [
    "нет",
    "无"
  ],
  "manual": [
    "вручную",
    "手动"
  ],
  "api": [
    "API",
    "API"
  ],
  "bank": [
    "банк",
    "银行"
  ],
  "upi": [
    "UPI",
    "UPI"
  ],
  "approve payout": [
    "Одобрить выплату",
    "批准付款"
  ],
  "reject payout": [
    "Отклонить выплату",
    "拒绝付款"
  ],
  "cancel payout": [
    "Отменить выплату",
    "取消付款"
  ],
  "enable authenticator": [
    "Включить аутентификатор",
    "启用身份验证器"
  ],
  "disable authenticator": [
    "Отключить аутентификатор",
    "禁用身份验证器"
  ],
  "replace authenticator": [
    "Заменить аутентификатор",
    "更换身份验证器"
  ],
  "regenerate authenticator": [
    "Обновить коды восстановления",
    "重新生成恢复代码"
  ],
  "Search orders, transactions, references...": [
    "Поиск заказов, транзакций, номеров…",
    "搜索订单、交易和参考编号…"
  ],
  "8+ upper/lower/number/symbol": [
    "8+ символов: заглавные, строчные, цифры, спецсимволы",
    "至少 8 位：含大小写字母、数字和符号"
  ],
  "Logout": [
    "Выйти",
    "退出"
  ],
  "Open navigation": [
    "Открыть меню",
    "打开导航"
  ],
  "Theme": [
    "Тема",
    "主题"
  ],
  "Profile": [
    "Профиль",
    "资料"
  ],
  "Search payment orders or references…": [
    "Поиск заказов или номеров…",
    "搜索支付订单或参考编号…"
  ],
  "Order payment": [
    "Оплата заказа",
    "订单支付"
  ],
  "Search order/reference": [
    "Поиск заказа/номера",
    "搜索订单／参考编号"
  ],
  "Welcome, {name}": [
    "Добро пожаловать, {name}",
    "欢迎，{name}"
  ],
  "Merchant · {status}": [
    "Мерчант · {status}",
    "商户 · {status}"
  ],
  "Updated {date}": [
    "Обновлено {date}",
    "更新于 {date}"
  ],
  "Updated {date} · Account {status}": [
    "Обновлено {date} · Аккаунт {status}",
    "更新于 {date} · 账户 {status}"
  ],
  "{count} pending": [
    "Ожидают: {count}",
    "{count} 笔待处理"
  ],
  "{count} open requests": [
    "Открытых запросов: {count}",
    "{count} 个待处理申请"
  ],
  "Admin rate: ₹{rate}": [
    "Курс администратора: ₹{rate}",
    "管理员汇率：₹{rate}"
  ],
  "{status} · Operations enabled": [
    "{status} · Операции разрешены",
    "{status} · 操作已启用"
  ],
  "Rate v{version}": [
    "Курс v{version}",
    "汇率版本 {version}"
  ],
  "Created {created} · Last active {last} · Expires {expires}": [
    "Создан {created} · Активен {last} · Истекает {expires}",
    "创建于 {created} · 上次活跃 {last} · 到期于 {expires}"
  ],
  "All rows valid. Remaining balance after reservation: {balance}": [
    "Все строки корректны. Остаток после резервирования: {balance}",
    "所有行均有效。预留后剩余余额：{balance}"
  ],
  "Reserve {amount}": [
    "Резерв {amount}",
    "预留 {amount}"
  ],
  "Enter a valid amount with up to {scale} decimal places.": [
    "Введите корректную сумму, не более {scale} знаков после запятой.",
    "请输入有效金额，最多 {scale} 位小数。"
  ],
  "No successful payment volume in this period": [
    "Нет успешных платежей за этот период",
    "此期间无成功支付金额"
  ],
  "Peak {amount}": [
    "Максимум {amount}",
    "峰值 {amount}"
  ],
  "Successful orders": [
    "Успешные заказы",
    "成功订单"
  ],
  "Period": [
    "Период",
    "期间"
  ],
  "{days} days · IST": [
    "{days} дней · IST",
    "{days} 天 · IST"
  ],
  "Successful / successful + failed": [
    "Успешные / (успешные + неуспешные)",
    "成功／（成功＋失败）"
  ],
  "Awaiting confirmation": [
    "Ожидает подтверждения",
    "等待确认"
  ],
  "Failed payments": [
    "Неуспешные платежи",
    "失败支付"
  ],
  "Expired payment links": [
    "Просроченные платёжные ссылки",
    "已过期支付链接"
  ],
  "Expired": [
    "Истекло",
    "已过期"
  ],
  "The gateway did not return a valid payment link.": [
    "Шлюз не вернул корректную платёжную ссылку.",
    "网关未返回有效支付链接。"
  ],
  "Payment link QR": [
    "QR-код платёжной ссылки",
    "支付链接二维码"
  ],
  "Open checkout": [
    "Открыть оплату",
    "打开收银台"
  ],
  "Copy link": [
    "Скопировать ссылку",
    "复制链接"
  ],
  "Payment link": [
    "Платёжная ссылка",
    "支付链接"
  ],
  "No account notifications": [
    "Нет уведомлений аккаунта",
    "暂无账户通知"
  ],
  "Notifications are disabled in Preferences": [
    "Уведомления отключены в настройках",
    "已在偏好设置中禁用通知"
  ],
  "No support tickets": [
    "Нет обращений в поддержку",
    "暂无支持工单"
  ],
  "Open": [
    "Открыть",
    "打开"
  ],
  "Retry": [
    "Повторить",
    "重试"
  ],
  "new": [
    "новое",
    "新消息"
  ],
  "read": [
    "прочитано",
    "已读"
  ],
  "Row {row}: {error}": [
    "Строка {row}: {error}",
    "第 {row} 行：{error}"
  ],
  "Open / QR": [
    "Открыть / QR",
    "打开／二维码"
  ],
  "Retry now": [
    "Повторить сейчас",
    "立即重试"
  ],
  "No webhook events": [
    "Нет событий вебхуков",
    "暂无 Webhook 事件"
  ],
  "merchant gross": [
    "Валовые поступления мерчанта",
    "商户总收款"
  ],
  "merchant platform fee": [
    "Комиссия платформы",
    "商户平台费"
  ],
  "merchant payout fee": [
    "Комиссия за выплату",
    "商户付款费"
  ],
  "merchant payout principal": [
    "Сумма выплат мерчанта",
    "商户付款本金"
  ],
  "merchant payout reserved": [
    "Резерв выплат мерчанта",
    "商户付款预留"
  ],
  "merchant settlement reserved": [
    "Резерв расчётов мерчанта",
    "商户结算预留"
  ],
  "merchant settlement principal": [
    "Сумма расчётов мерчанта",
    "商户结算本金"
  ],
  "merchant hold": [
    "Удержание мерчанта",
    "商户保留资金"
  ],
  "merchant adjustment": [
    "Корректировка мерчанта",
    "商户调账"
  ],
  "unconfigured": [
    "не настроено",
    "未配置"
  ],
  "processing": [
    "в обработке",
    "处理中"
  ],
  "paid": [
    "оплачено",
    "已支付"
  ],
  "closed": [
    "закрыто",
    "已关闭"
  ],
  "resolved": [
    "решено",
    "已解决"
  ],
  "held": [
    "удержано",
    "已保留"
  ],
  "frozen": [
    "заморожено",
    "已冻结"
  ],
  "released": [
    "разблокировано",
    "已释放"
  ],
  "pending approval": [
    "ожидает одобрения",
    "等待审批"
  ],
  "gateway order created": [
    "Создан платёжный заказ",
    "已创建支付订单"
  ],
  "gateway key created": [
    "Создан ключ API",
    "已创建 API 密钥"
  ],
  "gateway key revoked": [
    "Отозван ключ API",
    "已撤销 API 密钥"
  ],
  "gateway webhook rotated": [
    "Обновлён секрет вебхука",
    "已轮换 Webhook 密钥"
  ]
};
  const supported = ['en','ru','zh-CN'];
  let locale='en', documentRef, observer;
  const bindings=new Map(), attributes=new Map();
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function t(key,params={}){const source=String(key??'');const value=locale==='en'?source:(catalog[source]?.[locale==='ru'?0:1]??source);return value.replace(/\{(\w+)\}/g,(all,k)=>Object.hasOwn(params,k)?String(params[k]):all);}
  function html(key,params={}){return '<span data-i18n="'+escape(key)+'" data-i18n-params="'+escape(JSON.stringify(params))+'">'+escape(t(key,params))+'</span>';}
  function text(node,key,params={}){if(!node)return;const value=t(key,params);node.textContent=value;bindings.set(node,{key,params,last:value});}
  function explicit(root){if(root.nodeType!==1&&root.nodeType!==9)return;const nodes=[...(root.matches?.('[data-i18n]')?[root]:[]),...root.querySelectorAll('[data-i18n]')];for(const node of nodes){let params={};try{params=JSON.parse(node.getAttribute('data-i18n-params')||'{}');}catch{}const key=node.getAttribute('data-i18n'),value=t(key,params);if(node.textContent!==value)node.textContent=value;bindings.set(node,{key,params,last:value});}}
  function apply(){
    for(const [node,b] of bindings){if(!node.isConnected){bindings.delete(node);continue;}if(node.textContent!==b.last){bindings.delete(node);continue;}const value=(b.prefix||'')+t(b.key,b.params)+(b.suffix||'');if(node.textContent!==value)node.textContent=value;b.last=value;}
    for(const [node,attrs] of attributes){if(!node.isConnected){attributes.delete(node);continue;}for(const [name,key] of attrs)node.setAttribute(name,t(key));}
    if(documentRef){documentRef.documentElement.lang=locale;explicit(documentRef);}
  }
  function setLocale(value){locale=supported.includes(value)?value:'en';apply();}
  function init(doc){if(documentRef)return;documentRef=doc;
    // Snapshot authored strings before any account response arrives.
    function walk(node){if(node.nodeType===3){const key=node.textContent.trim();if(Object.hasOwn(catalog,key)){const raw=node.textContent;bindings.set(node,{key,params:{},last:raw,prefix:raw.match(/^\s*/)[0],suffix:raw.match(/\s*$/)[0]});}return;}
      if(node.nodeType!==1&&node.nodeType!==9)return;
      if(node.matches?.('script,style,pre,code,textarea,svg,select#locale,select#merchantLanguage'))return;
      // Preserve implicit option values before translating their labels.
      if(node.tagName==='OPTION'&&!node.hasAttribute('value'))node.setAttribute('value',node.textContent);
      const attrs=[];for(const name of ['placeholder','title','aria-label','alt']){const key=node.getAttribute?.(name);if(Object.hasOwn(catalog,key))attrs.push([name,key]);}if(attrs.length)attributes.set(node,attrs);
      for(const child of node.childNodes)walk(child);
    }
    walk(doc);apply();
    if(typeof MutationObserver!=='undefined'){observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)explicit(node);});observer.observe(doc.body,{childList:true,subtree:true});}
  }
  return {supported,catalog,t,html,text,init,setLocale,apply,get locale(){return locale;}};
})();
