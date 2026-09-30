'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const dir='dev/wpay-auth/web/';
const source=fs.readFileSync(dir+'user-burgundy-dashboard.js','utf8');
async function dashboard(unlimited=false){
 const context={WPayReferencePresentation:{bind(){}}};vm.runInNewContext(source,context);let page;const paths=[];
 const data={collectionAccess:{unlimited_collection:unlimited},capacity:{available:'12345',held:'200',reserved:'300'},commission:{available:'456',gross:'789',held:'100',usdtEquivalentMinor:'1200000',inrPerUsdt:'107'},payins:{successful:4,failed:1,pending:2,today_volume:'500'},payouts:{successful:3,review:2},parking:{volume:'800',locked:'900'},deposits:{usdt_minor:'23000000',pending:2},banks:[{upi_id:'<bad>@upi',bank_name:'Example bank',status:'running'}],recent:[{reference:'<script>bad</script>',amount_minor:'100',date:'2026-09-30',upi_id:'<bad>@upi',state:'successful'}],trend:[{day:'2026-09-30',payin:'100',payout:'0'}],totalVolumeMinor:'1400'};
 await context.WPayUserBurgundyDashboard.render({container:{replaceChildren:n=>page=n},title:{},el:()=>({isConnected:true}),account:{name:'<img onerror=bad>'},request:async path=>{paths.push(path);return data;}});return {html:page.innerHTML,paths};
}
test('User redesign retains every dashboard area and supporting financial value',async()=>{
 const result=await dashboard(),html=result.html.replaceAll('&amp;','&'),paths=result.paths;assert.deepEqual(paths,['business/user-dashboard']);
 for(const label of ['Available Capacity','Today Collection','Total Volume','Frozen & Hold','Commission held','Total UPI Running','Successful Pay-ins','Successful Payouts','Total Commission','USDT Deposited','Payout Orders','Available Commission','USDT Balance','Parking Completed','Devices','Quick actions','7-day Collection & Payout Volume','UPI Routes','Operations snapshot','Recent financial activity','Capacity reserved','Merchant Review'])assert.ok(html.includes(label),label);
 for(const value of ['₹123.45','₹4.56','₹7.89','₹2.00','₹1.00','₹3.00','₹8.00','₹9.00','23.000000 USDT','1.200000 USDT'])assert.ok(html.includes(value),value);
 for(const route of ['bank-upi','payouts','parking-orders','usdt-deposit','devices','upi-analytics','payins'])assert.ok(html.includes('data-go="'+route+'"'),route);
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('tabindex="0" role="img" aria-label="2026-09-30 · Collection ₹1.00"'));
 assert.ok((await dashboard(true)).html.includes('Unlimited'));
});
test('Approved styling is User-scoped and preserves native visibility, responsive search and identity',()=>{
 const css=fs.readFileSync(dir+'user-burgundy-live.css','utf8').split('/* Approved preservation-first User design.')[1];assert.ok(css);
 assert.doesNotMatch(css,/display\s*:\s*none|\[hidden\]|pointer-events\s*:\s*none|@import|url\(/);
 assert.match(css,/\.user-burgundy #workspace \.search\{flex:1 1 100%/);
 assert.match(css,/\.user-burgundy #workspace \.top-user\{display:flex/);
 assert.match(css,/prefers-reduced-motion/);assert.match(css,/focus-visible/);
 for(const line of css.split('\n').map(s=>s.trim()).filter(s=>s.includes('{')&&!s.startsWith('@')))assert.ok(line.startsWith('.user-burgundy')||line.startsWith('.light .user-burgundy'),line);
 const shell=fs.readFileSync(dir+'user-live.html','utf8');assert.equal((shell.match(/data-page="/g)||[]).length,26);
});
