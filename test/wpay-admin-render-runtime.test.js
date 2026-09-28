'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
// Minimal DOM boundary: execute real renderers, including their asynchronous reads.
class Element{
 constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.style={};this.dataset={};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(name,value){this[name]=value;}
 showModal(){this.open=true;}
 close(){this.open=false;this.onclose?.();}
 remove(){this.removed=true;}
}
function setup(overrides={}){
 const document={getElementById:()=>null,createElement:tag=>new Element(tag),createTextNode:text=>new Element('#text',text)};
 const context={document,Node:Element};vm.runInNewContext(fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-v5-pages.js'),'utf8'),context);
 const calls=[],container=new Element('main'),title=new Element('h1'),el=(tag,text,cls)=>Object.assign(new Element(tag,text),{className:cls||''});
 const read=async(path,body)=>{calls.push({path,body});if(Object.hasOwn(overrides,path))return overrides[path];if(path==='panel/directory')return {rows:[{id:body.type,name:body.type}]};if(path==='business/banks')return {banks:[]};if(path==='business/admin-upi')return {banks:[],routes:[],accounts:[]};if(path==='payout/approval/search')return {requests:[]};if(path==='payout/withdrawal/search')return {withdrawals:[]};throw Error(path);};
 return {calls,container,title,render:destination=>context.WPayAdminV5Pages.render(destination,{container,title,el,post:read,request:read,navigate(){},action:fn=>fn()})};
}
test('Pending approvals renders real async read results without a missing request binding',async()=>{
 const f=setup();await f.render('v5.approvals');assert.equal(f.title.textContent,'Pending approvals');assert.equal(f.calls.length,5);assert.equal(f.container.children.length,2);
});
test('Bank & UPI renders both admin and generic bank sources without a missing request binding',async()=>{
 const f=setup();await f.render('v5.bank-upi');assert.deepEqual(f.calls.map(x=>x.path),['business/admin-upi','business/banks']);assert.equal(f.title.textContent,'Bank & UPI');assert.ok(f.container.children.length>0);
});

function descendants(node){return [node,...node.children.flatMap(descendants)];}
test('populated account cards open rate and reactivation dialogs with local form helpers',async()=>{
 const f=setup({'panel/directory':{rows:[{id:'account',name:'Test account',email:'test@example.invalid',status:'suspended',approvalStatus:'approved',settings:{inrPerUsdt:'107'}}],actions:['commercial.update','reactivate']},'business/user-access':{users:[]}});
 await f.render('v5.users');
 const nodes=descendants(f.container);assert.ok(nodes.some(x=>x.className==='pill red'));
 nodes.find(x=>x.tagName==='button'&&x.textContent==='Edit rates').onclick();
 const modal=descendants(f.container).find(x=>x.tagName==='dialog');assert.equal(modal.open,true);
 assert.ok(descendants(modal).some(x=>x.name==='rate'&&x.value==='107'));
 nodes.find(x=>x.tagName==='button'&&x.textContent==='Reactivate').onclick();
 assert.equal(descendants(f.container).filter(x=>x.tagName==='dialog').length,2);
});
