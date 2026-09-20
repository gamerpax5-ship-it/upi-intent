'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function node(tag,text=''){return {tag,textContent:text,children:[],value:'',append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},setAttribute(k,v){this[k]=v;},reportValidity(){return true;},dataset:{}};}
const flatten=n=>[n,...n.children.flatMap(flatten)];
function moduleFor(){const copied=[],context={crypto:{randomUUID:()=> 'synthetic-request-123'},navigator:{clipboard:{writeText:async value=>copied.push(value)}}};vm.runInNewContext(fs.readFileSync(require.resolve('../dev/wpay-auth/web/gateway.js'),'utf8'),context);return {api:context.WPayGatewayPage,copied};}
test('INR display conversion uses exact integer arithmetic and rejects ambiguous input',()=>{
 const {api}=moduleFor();for(const [input,output]of [['0.01','1'],['1','100'],['1250.50','125050'],['90071992547409.93','9007199254740993'],['10000000000000000000000','1000000000000000000000000']])assert.equal(api.toPaise(input),output);
 for(const value of ['0','0.00','01',' 1','1 ','1e3','1,25','1.001','-1','Infinity','10000000000000000000001',1,null])assert.throws(()=>api.toPaise(value));
});
for(const locale of ['en','ru','zh-CN'])test('canonical Merchant generator in '+locale+' creates exact paise, displays QR/status/expiry and supports copy/open',async()=>{
 const {api,copied}=moduleFor(),container=node('main'),title=node('h1'),calls=[],url='http://127.0.0.1:4999/wpay-pay/synthetic',order={id:'synthetic-order',reference:'synthetic-reference',amountMinor:'125050',status:'pending_payment',origin:'manual',createdAt:'2026-01-01T00:00:00Z',expiresAt:'2026-01-01T00:05:00Z',paymentUrl:url,paymentQr:'data:image/png;base64,c3ludGhldGlj'};
 let created=false,pending;
 const args={account:{accountType:'merchant'},locale,container,title,el:node,action:fn=>(pending=fn()),request:async route=>route==='gateway/summary'?{synthetic:true,total:0,successRate:null}:route==='gateway/keys'?{keys:[]}:{events:[],endpoint:null},post:async(route,body)=>{calls.push({route,body});if(route==='gateway/create'){created=true;return order;}if(route==='gateway/get')return order;if(route==='gateway/search')return {orders:created?[order]:[],hasMore:false};throw Error('Unexpected write '+route);}};
 await api.render(args);let all=flatten(container),form=all.find(n=>n.tag==='form');const inputs=flatten(form).filter(n=>n.tag==='input');assert.equal(inputs.length,3);assert.equal(inputs[2].required,false);inputs[0].value=order.reference;inputs[1].value='1250.50';inputs[2].value='Synthetic only';
 form.onsubmit({preventDefault(){}});await pending;all=flatten(container);const create=calls.find(c=>c.route==='gateway/create');assert.equal(create.body.amountMinor,'125050');assert.equal(create.body.currency,'INR');assert.equal(create.body.reference,order.reference);assert.equal(create.body.idempotencyKey,'synthetic-request-123');
 assert.equal(all.filter(n=>n.tag==='form'&&flatten(n).some(x=>x.textContent===api.text(locale,'generate'))).length,1);
 assert.ok(all.some(n=>n.tag==='img'&&n.src===order.paymentQr));assert.ok(all.some(n=>n.textContent===api.text(locale,'status')+': '+api.text(locale,'pending_payment')));assert.ok(all.some(n=>n.textContent.startsWith(api.text(locale,'expires')+': ')));
 const open=all.find(n=>n.tag==='a'&&n.textContent===api.text(locale,'openCheckout'));assert.equal(open.href,url);assert.equal(open.rel,'noopener noreferrer');assert.equal(open.target,'_blank');await all.find(n=>n.tag==='button'&&n.textContent===api.text(locale,'copyLink')).onclick();assert.deepEqual(copied,[url]);
});
test('no-route remains visible without URL or QR and retry retains the request id',async()=>{
 const {api}=moduleFor(),container=node('main'),requests=[];let pending;
 await api.render({account:{accountType:'merchant'},locale:'en',container,title:node('h1'),el:node,action:fn=>(pending=fn()),request:async r=>r==='gateway/summary'?{total:0,successRate:null}:r==='gateway/keys'?{keys:[]}:{events:[]},post:async(r,b)=>{if(r==='gateway/search')return {orders:[]};requests.push(b);throw Error('error.NO_ROUTE');}});
 const form=flatten(container).find(n=>n.tag==='form'),inputs=flatten(form).filter(n=>n.tag==='input');inputs[0].value='synthetic-no-route';inputs[1].value='1.00';
 form.onsubmit({preventDefault(){}});await pending;form.onsubmit({preventDefault(){}});await pending;assert.equal(requests.length,2);assert.equal(requests[0].idempotencyKey,requests[1].idempotencyKey);assert.ok(flatten(container).some(n=>n.textContent===api.text('en','noRoute')));assert.equal(flatten(container).some(n=>n.tag==='img'||n.tag==='a'),false);
});
