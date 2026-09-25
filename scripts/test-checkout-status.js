'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseHTML}=require(process.env.WPAY_TEST_DOM_MODULE||'linkedom');
(async()=>{
 const {document}=parseHTML('<html><body><div><b id="timer">Expired</b></div><div id="verificationState">Old status</div><button id="submitUtr">Verify</button><input id="utrInput"></body></html>');
 let state={status:'pending_payment',verified:false},poll;
 vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/checkout-status.js','utf8'),{document,location:{pathname:'/pay/WP1234abcd'},fetch:async()=>({ok:true,json:async()=>state}),AbortSignal,setInterval:fn=>{poll=fn;}});
 await new Promise(r=>setImmediate(r));assert.match(document.getElementById('gatewayPaymentStatus').textContent,/^Pending/);
 for(const [status,label] of [['pending','Pending'],['failed','Failed'],['expired','Expired'],['success','Successful']]){
  state={status,verified:status==='success'};await poll();assert.match(document.getElementById('gatewayPaymentStatus').textContent,new RegExp('^'+label));assert.equal(document.getElementById('verificationState').hidden,true);
 }
 state={status:'success',verified:false};await poll();assert.match(document.getElementById('gatewayPaymentStatus').textContent,/^Pending/);
 console.log('PASS checkout pending / failed / expired / verified success, no success from unverified status');
})();
