'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{
 constructor(tag,text=''){this.tagName=tag.toUpperCase();this.textContent=text;this.children=[];this.value='';this.attributes={};}
 append(...nodes){this.children.push(...nodes);if(this.tagName==='SELECT'&&!this.value&&nodes[0])this.value=nodes[0].value;}
 replaceChildren(...nodes){this.children=[];this.value='';this.append(...nodes);}
 setAttribute(k,v){this.attributes[k]=v;}
 setCustomValidity(message){this.validationMessage=message;}
 reportValidity(){return !this.validationMessage;}
 showModal(){this.open=true;}
 close(){this.open=false;}
 remove(){}
}
const el=(tag,text)=>new Element(tag,text),flatten=n=>[n,...n.children.flatMap(flatten)];
test('Admin routing, assignment and hold parsers reject extra precision instead of truncating or mispricing',()=>{
 const source=fs.readFileSync('dev/wpay-auth/web/admin-v5-pages.js','utf8'),context={};
 // Expose the private helper only in this test VM; production exports stay unchanged.
 vm.runInNewContext(source.replace('root.WPayAdminV5Pages={render,employeePageAccess};','root.WPayAdminV5Pages={inrMinor,money};'),context);
 const parse=context.WPayAdminV5Pages.inrMinor;
 for(const value of ['1.001','-1.25','1e3','1.2.3','1,000','','9'.repeat(29)])assert.throws(()=>parse(value),{message:'error.INVALID_INPUT'});
 for(const [input,expected]of [['0','0'],['0.01','1'],['125.50','12550'],['100','10000']])assert.equal(parse(input),expected);
 assert.equal((source.match(/minor=inrMinor/g)||[]).length,2);
 assert.equal((source.match(/const toMinor=inrMinor/g)||[]).length,2);
 assert.equal(context.WPayAdminV5Pages.money('12550').replace('₹','').replaceAll(',',''),'125.50');
 assert.equal(source.split('h?money(h.amount_minor).replace("₹","").replaceAll(",","")').length-1,2);
});
async function setup(admin,hasBeneficiary=true){
 const container=el('main'),tools=el('div'),posts=[],context={Node:Element,crypto:{randomUUID:()=> 'test-request'},document:{createElement:el,createTextNode:t=>el('text',t),getElementById:id=>id==='page-tools'?tools:null}};
 vm.runInNewContext(fs.readFileSync('dev/wpay-auth/web/'+(admin?'admin-v5-pages.js':'parking.js'),'utf8'),context);
 const args={container,title:el('h1'),el,account:{accountType:admin?'admin':'user'},action:fn=>fn(),post:async(route,body)=>{posts.push({route,body});return {};},request:async()=>admin?{tenants:['tenant-a'],beneficiaries:hasBeneficiary?[{id:'beneficiary-a',tenantId:'tenant-a',details:{beneficiaryName:'Fixture',bankName:'Test Bank'}}]:[],orders:[],reviews:[],confirmations:[],canCreate:true}:{orders:[{id:'order-a',reference:'fixture',totalMinor:'100000',remainingMinor:'100000',minMinor:'1',maxMinor:'100000',beneficiary:{}}],history:[]}};
 if(admin){await context.WPayAdminV5Pages.render('v5.parking-orders',args);flatten(tools).find(n=>n.textContent==='+ Create Parking order').onclick();}
 else await context.WPayParkingPage.render({...args,destination:'parking.orders'});
 const form=flatten(container).find(n=>n.tagName==='FORM'),input=name=>flatten(form).find(n=>n.name===name),amount=admin?input('total'):flatten(form).find(n=>n.tagName==='INPUT');
 if(admin)input('reference').value='valid-order';
 return {container,form,input,amount,posts,submit:()=>form.onsubmit({preventDefault(){}})};
}
test('User amount form rejects precision loss, exponents, signs and malformed amounts without requests',async()=>{
 const ui=await setup(false);
 for(const value of ['1.001','1e3','-1.25','1.2.3','+1','1,000','','0','0.00','9'.repeat(29)]){ui.amount.value=value;await ui.submit();assert.ok(ui.amount.validationMessage,value);assert.equal(ui.posts.length,0,value);}
 ui.amount.value='125.50';ui.amount.oninput();await ui.submit();assert.equal(ui.posts.length,1);assert.equal(ui.posts[0].body.amountMinor,'12550');
});
test('Admin form displays errors without truncating, throwing or posting',async()=>{
 const ui=await setup(true);ui.input('min').value='0.01';ui.input('max').value='1000';
 for(const value of ['1.001','1e3','-1.25','1.2.3','+1','1,000','','9'.repeat(29)]){ui.amount.value=value;await ui.submit();assert.equal(ui.posts.length,0,value);assert.ok(flatten(ui.form).some(n=>n.attributes.role==='alert'&&!n.hidden&&n.textContent),value);}
 ui.amount.value='125.50';ui.form.oninput();await ui.submit();assert.equal(ui.posts.length,1);assert.equal(ui.posts[0].body.totalMinor,'12550');assert.equal(ui.posts[0].body.minMinor,'1');
});
test('Admin missing beneficiary and invalid amount range produce actionable errors',async()=>{
 const empty=await setup(true,false);await empty.submit();assert.equal(empty.posts.length,0);assert.ok(flatten(empty.form).some(n=>/No active beneficiary/.test(n.textContent)&&!n.hidden));
 const ui=await setup(true);ui.input('min').value='500';ui.input('max').value='100';await ui.submit();assert.equal(ui.posts.length,0);assert.ok(flatten(ui.form).some(n=>/Minimum must be positive/.test(n.textContent)&&!n.hidden));
});
