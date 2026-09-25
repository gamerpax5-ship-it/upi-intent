'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require(process.env.WPAY_TEST_DOM_MODULE||'linkedom');
(async()=>{
 const {document}=parseHTML('<html><head></head><body><main id="checkout"><div><b id="timer">00:00</b></div><div id="verificationState">Old status</div><button id="submitUtr">Pay</button></main><section id="success">Old receipt</section></body></html>');
 let state={status:'failed',verified:false},poll;vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/checkout-status.js','utf8'),{document,location:{pathname:'/pay/WP1234abcd'},fetch:async()=>({ok:true,json:async()=>state}),AbortSignal,setInterval:f=>poll=f});
 await new Promise(r=>setImmediate(r));
 for(const status of ['failed','expired','success']){state={status,verified:status==='success'};await poll();assert.equal(document.getElementById('gatewayFinalStatus').textContent,{failed:'Failed',expired:'Expired',success:'Successful'}[status]);assert.equal(document.body.classList.contains('gateway-terminal'),true);assert.equal(document.getElementById('gatewayFinalStatus').hidden,false);}
 assert.match(document.head.textContent,/body.gateway-terminal>\*:not\(#gatewayFinalStatus\)\{display:none!important\}/);
 const sandbox={globalThis:{},document,crypto};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/admin-utr.js','utf8'),sandbox);
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(tag==='select')Object.defineProperty(e,'value',{writable:true,value:''});if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const container=el('div'),title=el('h1'),calls=[];const post=async(path)=>{calls.push(path);if(path==='operations/utr/pending')return {records:[{claimId:'claim',orderId:'order',utr:'123456789012',reference:'<img src=x>',merchant:'M',user:'U',submittedAt:new Date().toISOString(),amountMinor:'100',paymentStatus:'failed',status:'pending',canReview:true}],offset:0,hasMore:false};if(calls.filter(p=>p==='operations/utr-source').length===1)return {links:[{id:'source',source:'device',ownerId:'user',bankReference:'bank'}]};return {observations:[{utr:'123456789123',amount:'1.00',source:'transactions',sourceStatus:'captured'}]};};
 const opts={post,action:f=>f(),el,container,title,destination:'operations.pending-utrs'};
 await sandbox.globalThis.WPayAdminUtr.render(opts);assert.equal(container.querySelectorAll('tbody tr').length,1);assert.equal(container.querySelector('img'),null);assert.match(container.textContent,/Verify/);assert.match(container.textContent,/Reject/);
 calls.length=0;await sandbox.globalThis.WPayAdminUtr.render({...opts,destination:'operations.transactions'});assert.equal(container.querySelectorAll('tbody tr').length,1);assert.deepEqual(calls,['operations/utr-source','operations/utr-source']);assert.equal(container.textContent.includes('123456789012'),false);
 console.log('PASS terminal-only checkout, compact captured UTR table, separate pending review table and escaped reference');
})();
