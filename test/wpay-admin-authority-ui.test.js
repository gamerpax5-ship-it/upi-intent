'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
function el(tag,text=''){return {tag,textContent:text,children:[],dataset:{},append(...nodes){this.children.push(...nodes);},prepend(...nodes){this.children.unshift(...nodes);},replaceChildren(...nodes){this.children=nodes;}};}
const descendants=n=>[n,...n.children.flatMap(descendants)];
function setup(admin){
 const context={crypto,setTimeout:()=>0,document:{addEventListener(){}}};vm.runInNewContext(fs.readFileSync(require.resolve('../dev/wpay-auth/web/operations.js'),'utf8'),context);
 const calls=[],container=el('main'),self=['profile.view','account_security.view','account_security.update'];let pending;
 const options={destination:'operations.admins',account:{accountType:'super_admin'},el,container,title:el('h1'),post:async(route,body)=>{calls.push({route,body});return route==='operations/admins'?{admins:admin?[admin]:[],offset:0,hasMore:false,tenantIds:['tenant-a','tenant-b'],requiredPermissions:self,permissions:[...self,'users.view'].map(id=>({id,label:id}))}:{id:'synthetic-admin',email:'admin@example.invalid',oneTimePassword:'Synthetic one-time display only',loginPath:'/admin'};},action:fn=>(pending=fn())};
 return {context,options,calls,container,self,done:()=>pending};
}
test('Admin creation UI selects no tenants or extra permissions implicitly and uses explicit idempotent request',async()=>{
 const f=setup();await f.context.WPayOperationsPage.render(f.options);await descendants(f.container).find(n=>n.tag==='button'&&n.textContent==='Create tenant-scoped Admin').onclick();
 const nodes=descendants(f.container),label=name=>nodes.find(n=>n.tag==='label'&&n.textContent===name).children[0];
 assert.equal(label('tenant-a').checked,false);assert.equal(label('tenant-b').checked,false);assert.equal(label('users.view').checked,false);
 label('Name').value='Synthetic Admin';label('Email').value='admin@example.invalid';label('tenant-a').checked=true;
 nodes.find(n=>n.tag==='form').onsubmit({preventDefault(){}});await f.done();const saved=f.calls.find(c=>c.route==='operations/admin/create');assert.deepEqual(Array.from(saved.body.tenantIds),['tenant-a']);assert.deepEqual(Array.from(saved.body.permissions),f.self);assert.equal(saved.body.platform,undefined);assert.match(saved.body.requestId,/^[a-f0-9-]{36}$/);
 assert.ok(descendants(f.container).find(n=>n.tag==='code'&&n.dataset.secret==='true'));
});
test('Admin edit UI binds current version, identity and explicit scope without changing credentials',async()=>{
 const f=setup({id:'admin-a',name:'Existing',email:'existing@example.invalid',status:'active',permission_version:7,permissions:['profile.view','account_security.view','account_security.update'],admin_scope:{tenantIds:['tenant-a']}});
 await f.context.WPayOperationsPage.render(f.options);await descendants(f.container).find(n=>n.tag==='button'&&n.textContent==='Edit Existing').onclick();
 const nodes=descendants(f.container),label=name=>nodes.find(n=>n.tag==='label'&&n.textContent===name).children[0];assert.equal(label('Name').disabled,true);assert.equal(label('Email').disabled,true);label('Status').value='suspended';
 nodes.find(n=>n.tag==='form').onsubmit({preventDefault(){}});await f.done();const saved=f.calls.find(c=>c.route==='operations/admin/update');assert.equal(saved.body.id,'admin-a');assert.equal(saved.body.expectedVersion,7);assert.equal(saved.body.status,'suspended');assert.equal(saved.body.password,undefined);assert.equal(saved.body.email,undefined);
});
