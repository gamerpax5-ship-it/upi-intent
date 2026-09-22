'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {Reconciliation}=require('../lib/wpay/operations/reconciliation');
const row={id:'11111111-1111-4111-8111-111111111111',account_type:'user'};
const context={principal:{id:row.id,userId:'customer',tenantId:'tenant-a',type:'user',status:'active',permissionVersion:1},currentPermissionVersion:1,eligibility:{approvalStatus:'approved'},grants:['user.transaction_history.view']};
test('pay-in history retains creation/payment dates and filters within account scope',async()=>{
 const queries=[],createdAt=new Date('2026-09-01Z'),paidAt=new Date('2026-09-02Z');
 const client={query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.startsWith('SELECT')?[{id:'order',state:'successful',amount_minor:'12345',created_at:createdAt,paid_at:paidAt,claims:[]}]:[]};}};
 const result=await new Reconciliation({}).observations(client,row,context,{status:'successful',offset:50});
 assert.equal(result.records[0].createdAt,createdAt);assert.equal(result.records[0].paidAt,paidAt);
 assert.deepEqual(queries[0].args,[row.id,null,null,50,'successful']);assert.match(queries[0].sql,/r.user_id=\$1/);assert.match(queries[0].sql,/o.state=\$5/);
 assert.equal(result.records[0].accountingState,'not_posted');assert.equal(result.records[0].userId,undefined);
});
test('invalid history filters and missing permissions fail before accessing data',async()=>{
 const client={query:()=>{throw Error('unexpected data access');}},api=new Reconciliation({});
 await assert.rejects(api.observations(client,row,context,{status:'anything'}),e=>e.code==='INVALID_INPUT');
 await assert.rejects(api.observations(client,row,{...context,grants:[]},{}),e=>e.code==='FORBIDDEN');
});
function node(tag='',textContent=''){return {tag,textContent,children:[],append(...c){this.children.push(...c);},replaceChildren(...c){this.children=c;}};}
const text=n=>[n.textContent,...n.children.map(text)].join(' ');
const find=(n,label)=>n.tag==='button'&&n.textContent===label?n:n.children.map(c=>find(c,label)).find(Boolean);
test('combined history displays real successful pay-ins and paginates them independently of payouts',async()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('dev/wpay-auth/web/reference-history.js','utf8'),ctx);
 const container=node(),calls=[],args={container,title:node(),el:node,action:fn=>fn(),groups:[{children:['operations.transactions','payout.jobs'].map(destinationId=>({destinationId}))}],post:async(route,body)=>{
 calls.push([route,{...body}]);return route==='operations/transactions'?{records:[{orderId:'payin',reference:'PAY-IN',amountMinor:'12345',status:'successful',paidAt:'2026-09-02T00:00:00Z'}],hasMore:body.offset===0}:{orders:[],hasMore:true};},request:async()=>{throw Error('ungranted request');}};
 await ctx.WPayReferenceHistory.render(args);assert.match(text(container),/Successful pay-ins.*PAY-IN.*₹123.45/);
 await find(container,'Next pay-ins').onclick();assert.equal(calls.at(-2)[1].offset,50);assert.equal(calls.at(-1)[1].offset,0);
 await find(container,'Next payouts').onclick();assert.equal(calls.at(-2)[1].offset,50);assert.equal(calls.at(-1)[1].offset,25);
 await find(container,'Previous pay-ins').onclick();assert.equal(calls.at(-2)[1].offset,0);assert.equal(calls.at(-1)[1].offset,25);
 assert.ok(calls.filter(([r])=>r==='operations/transactions').every(([,b])=>b.status==='successful'));
});
