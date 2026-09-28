'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
class Element{
 constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.style={};this.dataset={};}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.children=[...children];}setAttribute(name,value){this[name]=value;}
}
const descendants=node=>[node,...node.children.flatMap(descendants)];
function setup(files){
 const document={getElementById:()=>null,createElement:tag=>new Element(tag),createTextNode:text=>new Element('#text',text)};
 const context={document,Node:Element};for(const file of files)vm.runInNewContext(fs.readFileSync(require.resolve('../dev/wpay-auth/web/'+file),'utf8'),context);
 const el=(tag,text,cls)=>Object.assign(new Element(tag,text),{className:cls||''});return {context,el,container:el('main'),title:el('h1')};
}
test('Admin metric cards use the actual shared SVG icon export and reference classes',async()=>{
 const f=setup(['admin-ui.js','admin-v5-pages.js']),read=async p=>p==='business/admin-upi'?{banks:[],routes:[],accounts:[]}:{banks:[]};
 await f.context.WPayAdminV5Pages.render('v5.bank-upi',{...f,post:read,request:read});
 const cards=descendants(f.container).filter(x=>x.className==='card metric-rich');assert.ok(cards.length>0);
 for(const card of cards){assert.equal(card.children[0].className,'metric-ico');assert.match(card.children[0].innerHTML,/<svg/);assert.ok(descendants(card).some(x=>x.className==='label'));}
});
test('all dashboard roles render only confirmed masked content; legacy or unsafe replies fail closed',async()=>{
 for(const accountType of ['admin','employee','user'])for(const verified of [true,false]){
  const f=setup(['operations.js']);const events=[{device:'fixture-device',sender:'TEST',receivedAt:'2026-09-28T10:00:00Z',ownerName:'Synthetic',code:verified?'123456':'872194',message:verified?'Synthetic masked message':'Your OTP 872194',masked:verified}];
  await f.context.WPayOperationsPage.render({...f,destination:'operations.otp',account:{accountType},post:async()=>({events,masked:verified}),action:fn=>fn()});
  const nodes=descendants(f.container),output=nodes.map(x=>x.textContent).join('\n');assert.doesNotMatch(output,/872194/);assert.ok(nodes.some(x=>x.tagName==='table'));assert.ok(output.includes('Masked OTP'));assert.ok(output.includes(verified?'Synthetic masked message':'[Masked message]'));
  assert.equal(nodes.filter(x=>x.tagName==='th').length,accountType==='user'?6:7);
 }
});
