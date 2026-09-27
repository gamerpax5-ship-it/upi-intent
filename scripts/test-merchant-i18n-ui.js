'use strict';
// Run with WPAY_TEST_DOM_MODULE pointing to linkedom. No server or real accounts.
const {parseHTML}=require(process.env.WPAY_TEST_DOM_MODULE||'linkedom');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base='dev/wpay-auth/web/';
const account={id:'locale-test',accountType:'merchant',name:'Dashboard',email:'fixture@example.invalid',locale:'ru',approvalStatus:'approved',operationsEnabled:true};
const order={id:'order-id',reference:'Dashboard',amountMinor:'125050',status:'pending_payment',origin:'manual',createdAt:'2026-09-27T00:00:00Z',expiresAt:'2026-09-28T00:00:00Z',paymentUrl:'https://merchant.example.invalid/wpay-pay/test',callbackStatus:'pending'};
const fixtures={
 me:account,'gateway/summary':{available:'100000',successfulVolumeMinor:'120000',counts:{successful:3},successRate:.75,held:'100'},
 'payout/summary':{available:'100000',orderCount:1,openCount:1,counts:{},merchantUsdt:{}},
 'gateway/search':{orders:[order],hasMore:false},'payout/search':{orders:[],hasMore:false},
 'gateway/analytics':{channels:[],days:[]},'business/holds':{holds:[]},
 'business/summary':{gross:'120000',fees:'1200',payoutFees:'600',held:'100',available:'100000'},
 'business/ledger/search':{entries:[],nextOffset:null},'panel/fees':{rows:[],nextOffset:null},
 'payout/merchant-usdt':{creationDisabled:false,available:'100000',maxUsdtMinor:'10000000',rate:'100',rateVersion:1,network:'TRON-TRC20',requests:[]},
 'gateway/keys':{keys:[]},'gateway/webhooks':{endpoint:null,events:[]},'gateway/logs':{rows:[]},
 'panel/notifications':{rows:[],preferences:{in_app_notifications:true},nextOffset:null},
 'panel/support':{rows:[],canWrite:true,nextOffset:null},security:{enabled:false,sessions:[]},
 'panel/profile':{canEdit:true},'gateway/get':order,'panel/preferences':{ok:true},logout:{ok:true}
};
const tick=()=>new Promise(r=>setTimeout(r,30));
function setup(){
 const {document,window}=parseHTML(fs.readFileSync(base+'merchant.html','utf8'));
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){const n=this.querySelector('option[selected]')||this.querySelector('option');return n?.getAttribute('value')??n?.textContent??'';},set(v){for(const n of this.querySelectorAll('option'))n.toggleAttribute('selected',(n.getAttribute('value')??n.textContent)===v);}});
 Object.defineProperty(window.HTMLSelectElement.prototype,'selectedIndex',{configurable:true,get(){return Math.max(0,[...this.querySelectorAll('option')].findIndex(n=>n.hasAttribute('selected')));}});
 const calls=[],errors=[];let failLocale=false;
 const context={document,window:{addEventListener(){}},MutationObserver:window.MutationObserver,navigator:{clipboard:{writeText:async()=>{}}},location:{origin:'https://merchant.example.invalid',hash:''},history:{replaceState(){}},localStorage:{getItem(){return null},setItem(){}},crypto,URL,Blob,AbortController,TextEncoder,atob,btoa,setTimeout,clearTimeout,setInterval:()=>0,console,fetch:async(url,opts)=>{
  const route=url.replace('/wpay-auth/roles/merchant/','');calls.push({route,body:opts.body&&JSON.parse(opts.body)});
  if(route==='locale'){await tick();if(failLocale)return {ok:false,json:async()=>({error:'UNAVAILABLE'})};account.locale=JSON.parse(opts.body).locale;return {ok:true,json:async()=>({ok:true})};}
  if(route==='csrf')return {ok:true,json:async()=>({csrfToken:'test'})};
  if(!Object.hasOwn(fixtures,route)){errors.push(route);throw Error('Unknown fixture '+route);}
  return {ok:true,json:async()=>structuredClone(fixtures[route])};
 }};
 vm.createContext(context);
 for(const file of ['password-policy.js','role-dashboard.js','merchant-premium.js','app.js'])vm.runInContext(fs.readFileSync(base+file,'utf8'),context);
 return {document,window,context,calls,errors,failLocale(v){failLocale=v;}};
}
(async()=>{
 const a=setup();await tick();const {document:d,window:w,context:c,calls}=a;
 const change=async(locale,id='merchantLanguage')=>{d.getElementById(id).value=locale;d.getElementById(id).dispatchEvent(new w.Event('change'));await tick();await tick();};
 assert.equal(d.documentElement.lang,'ru');assert.equal(d.querySelector('[data-page="dashboard"]').textContent.trim(),'Обзор');
 assert.equal(d.querySelector('.merchant-chip strong').textContent,'Dashboard','Account names must not be translated');
 assert.equal(d.querySelector('#dashOrders [data-action="order"]').textContent,'Dashboard','Order references must not be translated');
 assert.equal(d.querySelector('#txFilter option:nth-child(2)').value,'Order','Filter values must remain canonical');
 assert.equal(d.querySelector('#txFilter option:nth-child(2)').textContent,'Заказ');
 for(const n of d.querySelectorAll('[data-page]')){n.click();await tick();assert.equal(d.querySelector('#pageStatus').classList.contains('error'),false,n.dataset.page);}
 d.getElementById('poRef').value='Keep <reference>';d.getElementById('poAmount').value='12.34';
 await change('zh-CN');assert.equal(d.documentElement.lang,'zh-CN');assert.equal(d.querySelector('[data-page="dashboard"]').textContent.trim(),'仪表盘');
 assert.equal(d.getElementById('locale').value,'zh-CN');assert.equal(d.getElementById('poRef').value,'Keep <reference>');assert.equal(d.getElementById('poAmount').value,'12.34');
 assert.equal(d.querySelector('#globalSearch').getAttribute('placeholder'),'搜索支付订单或参考编号…');
 d.querySelector('[data-page="payouts"]').click();await tick();assert.equal(d.querySelector('#payoutRows .empty').textContent,'未找到记录');
 d.querySelector('[data-page="profile"]').click();await tick();await change('en','locale');
 assert.equal(d.getElementById('merchantLanguage').value,'en');assert.equal(d.querySelector('[data-page="dashboard"]').textContent.trim(),'Dashboard');
 for(const locale of ['ru','zh-CN','en']){d.getElementById('merchantLanguage').value=locale;d.getElementById('merchantLanguage').dispatchEvent(new w.Event('change'));}
 await new Promise(r=>setTimeout(r,180));assert.equal(account.locale,'en');assert.deepEqual(calls.filter(x=>x.route==='locale').slice(-3).map(x=>x.body.locale),['ru','zh-CN','en']);
 await change('zh-CN');const b=setup();await tick();assert.equal(b.document.documentElement.lang,'zh-CN','Fresh login restores server preference');
 a.failLocale(true);await change('ru');assert.equal(d.documentElement.lang,'zh-CN','Failed save rolls back');assert.match(d.querySelector('#toast').textContent,/服务暂时不可用/);a.failLocale(false);
 d.querySelector('#newTicket').click();await tick();assert.equal(d.querySelector('#modalTitle').textContent,'新建支持工单');d.getElementById('ticketSubject').value='Do not translate';
 await change('ru');assert.equal(d.querySelector('#modalTitle').textContent,'Новое обращение');assert.equal(d.getElementById('ticketSubject').value,'Do not translate');
 d.getElementById('modalClose').click();
 d.getElementById('txFilter').value='Fee';d.getElementById('txFilter').dispatchEvent(new w.Event('change'));await tick();assert.equal(calls.filter(x=>x.route==='business/ledger/search').at(-1).body.type,'merchant_platform_fee');
 assert.equal(d.querySelector('#txFilter').value,'Fee');
 const api=c.WPayMerchantI18n;for(const [key,values]of Object.entries(api.catalog)){assert.equal(values.length,2,key);for(const val of values){assert.ok(val.trim(),key);assert.deepEqual((val.match(/\{\w+\}/g)||[]).sort(),(key.match(/\{\w+\}/g)||[]).sort(),key);}}
 const injection=api.html('Welcome, {name}',{name:'<img src=x onerror=alert(1)>'});assert.ok(!injection.includes('<img'));
 api.setLocale('unsupported');assert.equal(d.documentElement.lang,'en');assert.equal(api.t('Unknown key'),'Unknown key');
 assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
 console.log('PASS: 3 locales, all 20 pages, API persistence/reload, rapid changes, rollback, dynamic dialogs/rows, filters, inputs, injection and dictionary parity ('+Object.keys(api.catalog).length+' keys).');
})().catch(e=>{console.error(e);process.exitCode=1;});
