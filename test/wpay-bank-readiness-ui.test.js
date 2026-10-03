'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
class Element{
 constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.style={};this.dataset={};this.isConnected=true;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this[k]=v;}
}
const walk=node=>[node,...node.children.flatMap(walk)],text=node=>walk(node).map(n=>n.textContent).join(' ');
function fixture(file){
 const el=(tag,value,cls)=>Object.assign(new Element(tag,value),{className:cls||''});
 const context={Node:Element,document:{getElementById:()=>null,createElement:el,createTextNode:value=>el('#text',value)}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context);return {context,el,container:el('main'),title:el('h1')};
}
const bank=(displayStatus='unassigned')=>({id:'bank',owner_id:'owner',owner_name:'Owner',status:'running',version:1,approved_version:1,verified_version:1,used:'0',sharedLimit:'10000',daily_limit_minor:'10000',displayStatus,routingReadiness:{eligible:displayStatus==='running',reasonText:displayStatus==='unassigned'?'No merchant is assigned to this UPI.':displayStatus==='blocked'?'Remaining UPI daily limit is below the route minimum.':''},details:{upiId:'fixture@bank',bankName:'Fixture',holderName:'Owner',accountNumber:'12345678',bankLimitMinor:'10000'}});
test('Admin UPI directory shows Not assigned and its reason but retains the Stop action',async()=>{
 const f=fixture('dev/wpay-auth/web/admin-v5-pages.js'),b=bank(),read=async path=>path==='business/admin-upi'?{banks:[b],routes:[],accounts:[]}:{banks:[b],actions:[]};
 await f.context.WPayAdminV5Pages.render('v5.bank-upi',{...f,request:read,post:read,action:fn=>fn()});
 const output=text(f.container);assert.match(output,/Not assigned/);assert.match(output,/No merchant is assigned/);
 assert.ok(walk(f.container).some(n=>n.tagName==='button'&&n.textContent==='Stop'));
 const runningLabel=walk(f.container).find(n=>n.textContent==='Running');assert.ok(runningLabel);
 const metric=walk(f.container).find(n=>n.children.includes(runningLabel));assert.match(text(metric),/\b0\b/);
});
test('User cards show Blocked with a reason while preserving the enabled-route stop control',async()=>{
 const f=fixture('dev/wpay-auth/web/user-burgundy-banks.js'),b=bank('blocked');
 await f.context.WPayUserBurgundyBanks.render({...f,account:{name:'Owner'},request:async()=>({banks:[b],actions:['update']}),action:fn=>fn()});
 assert.match(text(f.container),/Blocked/);assert.match(text(f.container),/Remaining UPI daily limit/);
 assert.ok(walk(f.container).some(n=>n.tagName==='button'&&n.textContent==='Disable Route'));
 assert.ok(!walk(f.container).some(n=>n.tagName==='span'&&n.textContent==='Running'));
});
test('User cards show Running only after backend eligibility passes',async()=>{
 const f=fixture('dev/wpay-auth/web/user-burgundy-banks.js');
 await f.context.WPayUserBurgundyBanks.render({...f,account:{name:'Owner'},request:async()=>({banks:[bank('running')],actions:[]}),action:fn=>fn()});
 assert.ok(walk(f.container).some(n=>n.tagName==='span'&&n.textContent==='Running'));
});
