'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('dev/wpay-auth/web/user-burgundy-dashboard.js','utf8');
const sample=()=>({payins:{total:10,successful:4,failed:2,pending:3,today_orders:2,volume:'100000',today_volume:'1200'},payouts:{successful:2,review:1,volume:'9000'},parking:{volume:'500'},commission:{gross:'450',available:'400'},banks:[],trend:[{day:'2026-09-29',payin:'1200',payout:'0'}],totalVolumeMinor:'109500'});
async function render(data){const context={};vm.runInNewContext(source,context);const calls=[],el=()=>({isConnected:true,querySelector:()=>({})}),container={replaceChildren(n){this.node=n;}};await context.WPayUserBurgundyDashboard.analytics({el,container,title:{},request:async route=>{calls.push(route);return data;},action:fn=>fn()});return {html:container.node.innerHTML,calls};}
test('User analytics uses scoped summary and clear success-rate denominator, not ledger rows',async()=>{
 const {html,calls}=await render(sample());assert.deepEqual(calls,['business/user-dashboard']);
 for(const label of ['40.0%','Successful orders','Failed orders','Pending orders','Today collection','₹12.00','Average successful payment','₹250.00','Order outcomes','Expired / other','rolling last 7 days'])assert.ok(html.includes(label),label);
 assert.ok(!html.includes('RECORD ID'));assert.match(html,/aria-label="Successful orders"/);assert.match(html,/aria-label="Daily collection and payout amounts/);
});
test('empty User analytics has no invented success rate or division by zero',async()=>{
 const data=sample();data.payins={total:0,successful:0,failed:0,pending:0,today_orders:0,volume:'0',today_volume:'0'};data.trend=[];data.commission=null;
 const {html}=await render(data);assert.ok(html.includes('No pay-in orders yet.'));assert.ok(html.includes('No successful collections or payouts'));assert.doesNotMatch(html,/NaN|Infinity|undefined/);
});
test('User performance presentation retains responsive separated cards and user-only dispatch',()=>{
 const css=fs.readFileSync('dev/wpay-auth/web/user-burgundy-live.css','utf8'),app=fs.readFileSync('dev/wpay-auth/web/app.js','utf8');
 assert.match(css,/analytics-kpis\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);gap:20px/);
 assert.ok(css.includes('@media(max-width:600px)'));assert.ok(app.includes("referenceSection==='analytics'&&account.accountType==='user'&&page?.permissionId==='user.analytics.view'"));
});
