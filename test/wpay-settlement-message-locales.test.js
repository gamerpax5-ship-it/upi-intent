'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const el=(tag,text='')=>({tag,textContent:text,children:[],append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}});
const nodes=n=>[n,...n.children.flatMap(nodes)];
async function render(locale,response){
 const context={};for(const file of ['payout-locales.js','payouts.js'])vm.runInNewContext(fs.readFileSync(require.resolve('../dev/wpay-auth/web/'+file),'utf8'),context);
 const container=el('main'),calls=[];await context.WPayPayoutPage.render({account:{accountType:'merchant'},locale,destination:'payout.merchant-usdt',el,container,title:el('h1'),request:async route=>{calls.push(route);return response;},post:()=>{throw Error('Disabled settlement must never write');}});
 return {paragraphs:nodes(container).filter(n=>n.tag==='p').map(n=>n.textContent),buttons:nodes(container).filter(n=>n.tag==='button'),calls};
}
for(const [locale,expected]of [['en','USDT settlement rate not configured'],['ru','Курс расчётов USDT не настроен'],['zh-CN','未配置 USDT 结算汇率']])test('disabled Merchant settlement explanation uses '+locale,async()=>{
 const result=await render(locale,{enabled:false,status:'rate_not_configured',message:'USDT settlement rate not configured',creationDisabled:true});
 assert.ok(result.paragraphs.includes(expected));if(locale!=='en')assert.equal(result.paragraphs.includes('USDT settlement rate not configured'),false);
 assert.deepEqual(result.calls,['payout/merchant-usdt']);assert.equal(result.buttons.length,0);
});
test('unrecognized settlement capability message is retained without inventing a state',async()=>{
 const result=await render('ru',{enabled:false,status:'other_unavailable',message:'Other capability unavailable',creationDisabled:true});assert.ok(result.paragraphs.includes('Other capability unavailable'));assert.equal(result.buttons.length,0);
});
