'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function el(tag,textContent=''){return {tag,textContent,children:[],style:{},value:'',append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}},replaceChildren(...nodes){this.children=[];this.append(...nodes);},setAttribute(k,v){this[k]=v;},reportValidity(){return true;},showModal(){this.open=true;},close(){this.open=false;this.onclose?.();},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);},scrollIntoView(){},querySelector(){return null;}};}
const all=n=>[n,...n.children.flatMap(all)];
test('UPI modal preserves details on stale auth, shows the error inside dialog and retries after password confirmation',async()=>{
 const context={crypto:{randomUUID:()=> 'test-request'}};vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/admin-upi.js','utf8'),context);
 const container=el('main'),calls=[];let fresh=false,saved,pending;
 const post=async(route,body)=>{calls.push(route);if(route==='business/admin-upi')return {canCreate:true,canRoute:true,banks:[],routes:[],accounts:[{id:'owner',name:'Owner',account_type:'user'}]};if(route==='security/admin-reauth'){assert.equal(body.password,'test-only-password');fresh=true;return {ok:true};}if(route==='business/admin-upi/create'){if(!fresh)throw Error('error.RECENT_MFA_REQUIRED');saved=body;return {id:'bank'};}};
 await context.WPayAdminUpi.render({post,action:fn=>(pending=fn()),el,container,title:el('h1')});await all(container).find(n=>n.tag==='button'&&n.textContent==='+ Add Admin UPI').onclick();
 const dialog=all(container).find(n=>n.tag==='dialog'),form=dialog.children.find(n=>n.tag==='form');
 const field=label=>all(form).find(n=>n.tag==='label'&&n.textContent===label).children[0];
 for(const [label,value]of Object.entries({'UPI ID':'test@bank','Account holder':'Test Holder','Bank name':'Test Bank','Account number':'123456780001','IFSC':'sbin0001234','Registered mobile':'+919000000001','Approval reason':'Checked account'}))field(label).value=value;
 for(const input of all(form).filter(n=>n.pattern))assert.equal(new RegExp('^(?:'+input.pattern+')$','v').test(input.value),true);
 form.onsubmit({preventDefault(){}});await pending;assert.equal(dialog.open,true);assert.match(all(dialog).find(n=>n.role==='alert').textContent,/Confirm your Admin password/);assert.equal(field('UPI ID').value,'test@bank');
 field('Confirm Admin password').value='test-only-password';form.onsubmit({preventDefault(){}});await pending;assert.equal(saved.details.ifsc,'SBIN0001234');assert.equal(saved.details.bankLimitMinor,'10000000');assert.equal(saved.ownerId,'owner');assert.equal(dialog.open,false);assert.ok(calls.includes('security/admin-reauth'));
});
