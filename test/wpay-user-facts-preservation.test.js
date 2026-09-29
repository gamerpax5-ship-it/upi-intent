'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function node(tag,text='') {return {tagName:tag.toUpperCase(),textContent:text,children:[],childNodes:[],classList:{add(){}},append(...nodes){this.children.push(...nodes);this.childNodes.push(...nodes);},replaceChildren(...nodes){this.children=nodes;this.childNodes=nodes;},replaceWith(n){this.replacement=n;}};}
function run(grouped,invalid=false){
 const dl=node('dl'),dt=node('dt','APK version'),dd=node('dd'),value=node('a','0.10.5');value.onclick=()=>42;dd.append(value);
 if(grouped){const group=node('div');group.append(dt,dd);dl.append(group);}else dl.append(dt,dd);
 if(invalid)dl.append(node('p','Keep this warning'));
 const host={querySelector:s=>s==='.page-hero'?{}:null,querySelectorAll:s=>s==='dl.facts'?[dl]:[]};
 const c={document:{createElement:node}};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/user-burgundy-pages.js','utf8'),c);
 c.WPayUserBurgundyPages.enhance(host,{}, {name:'Fixture'},'agent');return {dl,value};
}
for(const grouped of [false,true])test('facts preserve values and handlers: grouped='+grouped,()=>{const {dl,value}=run(grouped);assert.equal(dl.replacement.children.length,1);const strong=dl.replacement.children[0].children[1];assert.equal(strong.children[0],value);assert.equal(strong.children[0].onclick(),42);});
test('unfamiliar facts structure is retained rather than erased',()=>{const {dl}=run(true,true);assert.equal(dl.replacement,undefined);assert.equal(dl.children[1].textContent,'Keep this warning');});
test('notification cards keep friendly labels and dates without exposing record IDs',async()=>{
 const c={WPayLocales:{translate:(_locale,key)=>key}};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/completion-locales.js','utf8'),c);vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/completion.js','utf8'),c);
 const container=node('main'),calls=[];await c.WPayCompletionPage.render({permission:'notifications.view',account:{accountType:'user'},locale:'en',el:node,container,title:node('h1'),action:f=>f(),post:async path=>{calls.push(path);return {rows:[{id:'private-record-id',event:'customer_password_session_issued',created_at:'2026-09-29T00:00:00Z',read:false}],preferences:{in_app_notifications:true},canUpdate:true,nextOffset:null};}});
 const flatten=n=>[n.textContent,...n.children.map(flatten)].join(' '),text=flatten(container);
 assert.match(text,/Signed in with password/);assert.match(text,/Unread/);assert.match(text,/IST/);assert.doesNotMatch(text,/private-record-id|customer_password_session_issued|2026-09-29T/);
 assert.deepEqual(calls,['panel/notifications']); // Reading does not mark anything read.
});
