'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {maskedEvent}=require('../lib/wpay/telegram/format');
test('notification placeholder never depends on the supplied OTP or SMS',()=>{
 const base={phone:'synthetic-device',receivedAt:'2026-09-28T00:00:00Z'};
 const expected=maskedEvent(base);
 assert.match(expected,/OTP received: \[MASKED\]/);
 for(const code of ['872194','SECRET','12345678'])assert.equal(maskedEvent({...base,code,message:'Private SMS '+code}),expected);
 for(const otpLength of [4,5,6,7,8]){
  const formatted=maskedEvent({...base,otpLength,contentMasked:true,sender:'TESTBANK',maskedMessage:'Your OTP is 872194',code:'872194',message:'RAW PRIVATE MESSAGE'});
  assert.ok(formatted.includes('OTP received: '+'12345678'.slice(0,otpLength)+' [MASKED]'));
  assert.match(formatted,/Sender: TESTBANK/);
  assert.doesNotMatch(formatted,/872194|RAW PRIVATE MESSAGE/);
 }
});
test('every dashboard role ignores the OTP field even when the reply claims to be masked',async()=>{
 class Element{constructor(tag,text=''){this.tagName=tag;this.textContent=text;this.children=[];this.style={};this.dataset={};}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this[k]=v;}}
 const all=n=>[n,...n.children.flatMap(all)];
 for(const accountType of ['admin','employee','user'])for(const masked of [true,false]){
  const context={document:{getElementById:()=>null,createElement:tag=>new Element(tag),createTextNode:t=>new Element('#text',t)},Node:Element};
  vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/operations.js','utf8'),context);
  const el=(tag,text,cls)=>Object.assign(new Element(tag,text),{className:cls||''}),container=el('main');
  await context.WPayOperationsPage.render({el,container,title:el('h1'),destination:'operations.otp',account:{accountType},action:fn=>fn(),post:async()=>({masked,events:[{masked,code:'872194',message:'Already redacted',device:'synthetic',receivedAt:'2026-09-28T00:00:00Z'}]})});
  const nodes=all(container);assert.equal(nodes.find(n=>n.className==='mono otp-code').textContent,'1234 [Masked]');
  assert.doesNotMatch(nodes.map(n=>n.textContent).join('\n'),/872194/);
 }
});
