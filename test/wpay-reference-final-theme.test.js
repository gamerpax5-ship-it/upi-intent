'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const read=name=>fs.readFileSync(require('node:path').join(__dirname,'../dev/wpay-auth/web',name),'utf8').replace(/\r\n/g,'\n');
test('FINAL HTML reference stylesheet is retained exactly, with only hidden safety appended',()=>{
 const css=read('user-burgundy.css').replace(/\n\n\[hidden\]\{display:none!important\}\s*$/,'').trim();
 assert.equal(createHash('sha256').update(css).digest('hex'),'7bcd274f5ff3d6547f1ad7bbee86b689581e38978422921a0311d50b28898afe');
 const adapter=read('user-burgundy-live.css');assert.match(adapter,/@import url\('\/wpay-auth\/reference-live.css'\) layer\(live-defaults\)/);assert.match(adapter,/@layer live-defaults/);assert.doesNotMatch(adapter,/Segoe UI Variable|Shared User sizing contract/);
});
test('Reference cards continue to use live account data and existing page routes',()=>{
 const js=read('user-burgundy-dashboard.js'),html=read('user-live.html');assert.match(js,/request\('business\/user-dashboard'\)/);assert.match(js,/class="dash-kpi /);assert.match(js,/class="mini-stat"/);assert.doesNotMatch(js,/DEMO_TRC20|store\.balances|Math\.random/);
 for(const page of ['activation','devices','otp','usdt-deposit','withdraw','bank-upi','analytics','commission'])assert.ok(html.includes('data-page="'+page+'"'));
 assert.match(read('payouts.js'),/upiDetails:\{beneficiaryName:holder.value,upiId:upi.value.trim\(\)\}/);assert.match(read('payouts.js'),/input.disabled=method.value!=='bank'/);assert.match(read('funding.js'),/history.open=true/);
});
