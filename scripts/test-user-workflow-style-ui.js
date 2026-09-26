'use strict';
const {parseHTML}=require(process.env.WPAY_TEST_DOM_MODULE||'linkedom'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {document}=parseHTML('<html><body><main><dl class="facts"><dt>Balance</dt><dd><button type="button">Use available balance</button></dd></dl><article class="business-row"><form><label>Amount<input name="amount"></label><button type="submit">Submit</button></form><table><tbody><tr><td>Pending</td></tr></tbody></table></article></main></body></html>');
const context={document};vm.createContext(context);vm.runInContext(fs.readFileSync('dev/wpay-auth/web/user-burgundy-pages.js','utf8'),context);
const host=document.querySelector('main'),button=host.querySelector('dd button'),form=host.querySelector('form'),input=host.querySelector('input');let clicks=0,submits=0;button.onclick=()=>clicks++;form.onsubmit=()=>submits++;input.value='150.25';
for(let i=0;i<2;i++)context.WPayUserBurgundyPages.enhance(host,{title:'Withdraw',description:'Available balance'},{name:'Test User'},'withdraw');
assert.equal(host.querySelectorAll('.page-hero').length,1);assert.equal(host.querySelectorAll('.table-wrap').length,1);assert.equal(host.querySelector('.fact strong button'),button);button.onclick();form.onsubmit();assert.equal(clicks,1);assert.equal(submits,1);assert.equal(input.value,'150.25');assert.ok(form.classList.contains('workflow-form'));
const otp=document.createElement('main');otp.innerHTML='<button>Existing OTP section</button>';const before=otp.innerHTML;context.WPayUserBurgundyPages.enhance(otp,{title:'OTP'},{},'otp');assert.equal(otp.innerHTML,before);
console.log('User theme preserves working handlers, values and table rows; repeated enhancement and OTP exclusion PASS');
