'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{constructor(tag,text){this.tagName=tag;this.textContent=text;this.children=[];this.dataset={};}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}}
const all=n=>[n,...n.children.flatMap(all)],el=(tag,text,cls)=>Object.assign(new Element(tag,text),{className:cls});
test('device and activation pages link to APK section without repeating download buttons',async()=>{
 const ctx={crypto:require('node:crypto'),setTimeout,setInterval,clearInterval};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/device-setup.js','utf8'),ctx);
 for(const page of ['devices','activation']){const container=el('main');await ctx.WPayDeviceSetupPage.render({destination:'operations.'+page,account:{accountType:'user'},el,container,title:el('h1'),action:fn=>fn(),post:async route=>route==='operations/pairing-history'?{requests:[]}:{devices:[],canCreate:true,pairingAvailable:true}});assert.ok(!all(container).some(n=>n.download||n.href?.includes('apk/download')));assert.ok(all(container).some(n=>n.dataset.go==='agent'));}
});
test('user without a linked device gets an activation action instead of unexplained empty OTP view',async()=>{
 const ctx={};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/operations.js','utf8'),ctx);const container=el('main');await ctx.WPayOperationsPage.render({destination:'operations.otp',account:{accountType:'user'},el,container,title:el('h1'),action:fn=>fn(),post:async()=>({events:[],message:'No linked device'})});assert.ok(all(container).some(n=>n.dataset.go==='activation'));assert.match(all(container).map(n=>n.textContent).join(' '),/verified ownership period/);
});
