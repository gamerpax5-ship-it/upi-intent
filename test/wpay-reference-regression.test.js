"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const navigation=require('../dev/wpay-auth/web/reference-navigation');
function node(tag='',text=''){
 const classes=new Set();
 return {tag,textContent:text,children:[],dataset:{},attributes:{},
  append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
  setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},
  classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle(k,on){const next=on??!classes.has(k);if(next)classes.add(k);else classes.delete(k);return next;}}
 };
}
function script(file,context){vm.createContext(context);vm.runInContext(fs.readFileSync('dev/wpay-auth/web/'+file,'utf8'),context);return context;}
function treeText(n){return [n.textContent,...n.children.map(treeText)].join(' ');}
function groups(...ids){return [{children:ids.map(destinationId=>({destinationId,routeStatus:'implemented'}))}];}
function ui(){
 const ids=new Map(),buttons=Object.keys(navigation.routes.user).map(key=>Object.assign(node('button'),{dataset:{page:key}}));
 const identity=node('span','previous account');
 const document={documentElement:node('html'),createElement:node,addEventListener(){},
  getElementById(id){if(!ids.has(id))ids.set(id,node());return ids.get(id);},
  querySelector(){return {content:'user'};},
  querySelectorAll(selector){if(selector.includes('.sidebar'))return buttons;if(selector.includes('data-account'))return [identity];return [];}
 };
 const context=script('reference-ui.js',{document,WPayReferenceNavigation:navigation,location:{hash:''},history:{replaceState(){}},addEventListener(){},localStorage:{setItem(){throw Error('storage disabled');}}});
 return {api:context.WPayReferenceUi,document,buttons,identity};
}
test('successful history is available with either owning module, not unrelated pay-in grants',()=>{
 assert.equal(navigation.resolve('user','transactions',groups('operations.transactions')),null);
 for(const id of ['payout.jobs','parking.orders'])assert.equal(navigation.resolve('user','transactions',groups(id)).destinationId,id);
});
test('restricted account lands on a granted page and lock clears account identity and mobile overlay',()=>{
 const {api,document,identity,buttons}=ui();
 assert.equal(api.sync({name:'Current'}, {groups:groups('user.support')},null),'user.support');
 assert.equal(api.section,'support');
 assert.equal(buttons.find(b=>b.dataset.page==='support').disabled,false);
 document.getElementById('sidebar').classList.add('open');document.getElementById('overlay').classList.add('show');
 api.lock();api.restoreAvailability();
 assert.equal(identity.textContent,'');assert.ok(buttons.every(b=>b.disabled));
 assert.equal(document.getElementById('sidebar').classList.contains('open'),false);
 assert.equal(document.getElementById('overlay').classList.contains('show'),false);
});
test('appearance changes remain usable when browser storage is blocked',()=>{
 const {api,document}=ui();api.settings();
 const select=document.getElementById('page-content').children[0].children[0].children[0];select.value='light';
 assert.doesNotThrow(()=>select.onchange());assert.equal(document.documentElement.classList.contains('light'),true);
});
test('history requests only available modules and excludes incomplete Parking rows',async()=>{
 const {WPayReferenceHistory}=script('reference-history.js',{}),container=node(),calls=[];
 const permitted=groups('parking.orders','payout.jobs');permitted[0].children[1].routeStatus='unavailable';
 await WPayReferenceHistory.render({groups:permitted,container,title:node(),el:node,action:f=>f(),
  post:async()=>{throw Error('Unavailable payout must not be requested');},
  request:async route=>{calls.push(route);return {history:[{id:'completed-order',state:'completed',amountMinor:'12345'},{id:'pending-order',state:'submitted',amountMinor:'999'}]};}});
 assert.deepEqual(calls,['parking/orders']);assert.match(treeText(container),/completed-order.*₹123\.45/);assert.doesNotMatch(treeText(container),/pending-order/);
});
for(const role of ['user','merchant']){
 test(role+' dashboard propagates expired-session and network errors instead of displaying empty results',async()=>{
  const {WPayRoleDashboard}=script('role-dashboard.js',{});
  for(const message of ['error.AUTH_FAILED','error.UNAVAILABLE']){
   await assert.rejects(()=>WPayRoleDashboard.render({account:{accountType:role},title:node(),container:node(),el:node,request:async route=>{
    if(route===(role==='user'?'parking/orders':'gateway/orders'))throw Error(message);
    return {};
   }}),{message});
  }
 });
 test(role+' dashboard labels restricted optional data as unavailable',async()=>{
  const {WPayRoleDashboard}=script('role-dashboard.js',{}),container=node();
  await WPayRoleDashboard.render({account:{accountType:role},title:node(),container,el:node,request:async route=>{
   if(route===(role==='user'?'parking/orders':'gateway/orders'))throw Error('error.FORBIDDEN');
   return {};
  }});
  assert.match(treeText(container),/unavailable/i);
 });
}
