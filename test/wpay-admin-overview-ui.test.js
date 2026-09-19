"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path'),web=path.join(__dirname,'../dev/wpay-auth/web');
function element(tag,text=''){return {tag,textContent:text,children:[],append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}};}
function text(node){return [node.textContent,...node.children.map(text)].join('\n');}
function fixture(){const context={};for(const file of ['business-locales.js','business.js'])vm.runInNewContext(fs.readFileSync(path.join(web,file),'utf8'),context);return context;}
test('Admin overview renders the authorized platform summary without a profile or invented account balances',async()=>{
 const context=fixture();for(const locale of ['en','ru','zh-CN']){
  const container=element('main'),title=element('h1'),routes=[];
  const result=await context.WPayBusinessPage.render({permission:'overview.view',account:{accountType:'super_admin'},locale,request:async route=>{routes.push(route);return {currency:'INR',administrative:true,financialOperationsEnabled:false};},el:element,container,title});
  assert.equal(result,true);assert.deepEqual(routes,['business/summary']);assert.equal(title.textContent,context.WPayBusinessLocales.translate(locale,'adminOverview'));
  const output=text(container);assert.ok(output.includes('INR'));assert.ok(output.includes(context.WPayBusinessLocales.translate(locale,'disabled')));assert.doesNotMatch(output,/₹|0\.00|<form|Profile/);
 }
});
test('Admin overview preserves a server authorization denial and does not render fabricated summary values',async()=>{
 const context=fixture(),container=element('main');await assert.rejects(context.WPayBusinessPage.render({permission:'overview.view',account:{accountType:'admin'},locale:'en',request:async()=>{throw Error('error.FORBIDDEN');},el:element,container,title:element('h1')}),/FORBIDDEN/);assert.doesNotMatch(text(container),/INR|Disabled|₹/);
});
test('workspace badge distinguishes staff status from customer approval status',async()=>{
 const source=fs.readFileSync(path.join(web,'app.js'),'utf8');const loadSource=source.slice(source.indexOf('async function load('),source.indexOf('async function changeLocale('));
 for(const [accountType,approvalStatus,status,expected] of [['super_admin','pending','active','active'],['admin','pending','suspended','suspended'],['employee','approved','active','active'],['user','pending','active','pending'],['merchant','approved','active','approved']]){
  const nodes=new Map(),context={destination:null,explicitLocale:null,navigator:{language:'en'},L:{choose:()=> 'en',supported:['en','ru','zh-CN']},applyLocale(){},tr:key=>key,profile(){},request:async route=>route==='me'?{accountType,approvalStatus,status}:{groups:[]},$:id=>{if(!nodes.has(id))nodes.set(id,element('div'));return nodes.get(id);}};
  vm.runInNewContext(loadSource,context);await context.load();assert.equal(nodes.get('approval-badge').textContent,expected);
 }
});
