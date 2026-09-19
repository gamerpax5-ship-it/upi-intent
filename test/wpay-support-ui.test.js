"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const web=path.join(__dirname,'../dev/wpay-auth/web');
function el(tag,text=''){
 const node={tag,textContent:text,children:[],append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},reportValidity(){return true;}};
 // HTMLTextAreaElement.type is a getter-only DOM property, unlike input.type.
 if(tag==='textarea')Object.defineProperty(node,'type',{get(){return 'textarea';}});
 return node;
}
function descendants(node){return [node,...node.children.flatMap(descendants)];}
function renderer(){const context={crypto};for(const file of ['locales.js','business-locales.js','completion-locales.js','completion.js'])vm.runInNewContext(fs.readFileSync(path.join(web,file),'utf8'),context);return context.WPayCompletionPage;}
for(const accountType of ['user','merchant'])test(accountType+' Support renders an editable message and submits through the existing endpoint',async()=>{
 const page=renderer(),container=el('main'),calls=[];
 const post=async(route,body)=>{calls.push({route,body});return route==='panel/support'?{rows:[],canWrite:true,admin:false,nextOffset:null}:{id:'synthetic-ticket'};};
 await page.render({permission:'support.view',account:{accountType},locale:'en',el,container,title:el('h1'),post,action:fn=>fn()});
 const nodes=descendants(container),message=nodes.find(n=>n.name==='message');assert.equal(message.tag,'textarea');assert.equal(message.maxLength,2000);assert.equal(message.required,true);
 nodes.find(n=>n.name==='subject').value='Synthetic support check';message.value='No financial or external activity.';
 await nodes.find(n=>n.tag==='button'&&n.textContent==='Open a support ticket').onclick();
 const saved=calls.find(c=>c.route==='panel/support/create');assert.ok(saved);assert.equal(saved.body.subject,'Synthetic support check');assert.equal(saved.body.message,message.value);assert.match(saved.body.requestId,/^[a-f0-9-]{36}$/);
});
test('staff support reply renders and submits only the displayed ticket and status',async()=>{
 const page=renderer(),container=el('main'),calls=[];
 const post=async(route,body)=>{calls.push({route,body});return route==='panel/support'?{rows:[{id:'ticket-1',subject:'Synthetic',status:'open'}],canWrite:true,admin:true,nextOffset:null}:{saved:true};};
 await page.render({permission:'support_admin.view',account:{accountType:'super_admin'},locale:'en',el,container,title:el('h1'),post,action:fn=>fn()});
 const nodes=descendants(container),reply=nodes.find(n=>n.name==='reply');assert.equal(reply.tag,'textarea');reply.value='Synthetic resolution';nodes.find(n=>n.name==='status').value='resolved';
 await nodes.find(n=>n.tag==='button'&&n.textContent==='Save').onclick();const saved=calls.find(c=>c.route==='panel/support/update');assert.equal(saved.body.id,'ticket-1');assert.equal(saved.body.status,'resolved');assert.equal(saved.body.message,reply.value);
});
