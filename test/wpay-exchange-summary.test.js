'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {summarize}=require('../lib/wpay/panels/exchange-summary');
test('exchange difference uses each account rate and actual quantities',()=>{
 const r=summarize([{usdt:'100000000',rate:'100',capacity:'1000000'},{usdt:'200000000',rate:'105',capacity:'2100000'}],[{usdt:'100000000',rate:'110'},{usdt:'200000000',rate:'112'}]);
 assert.equal(r.funding.inr,'3100000');assert.equal(r.settlement.inr,'3340000');assert.equal(r.fxProfit,'240000');
});
test('gross received value stays separate from setup-adjusted capacity',()=>{
 const r=summarize([{usdt:'2000000000',rate:'107',capacity:'20330000'}],[]);
 assert.equal(r.funding.inr,'21400000');assert.equal(r.funding.capacity,'20330000');assert.equal(r.fxProfit,'-21400000');
});
test('decimal rates and sub-paise transfers aggregate before truncation',()=>{
 const r=summarize([{usdt:'100',rate:'85.75'},{usdt:'100',rate:'85.75'}],[]);
 assert.equal(r.funding.inr,'1');assert.equal(r.fxProfit,'-1');
});
test('empty report and amounts above safe JS integer retain exact values',()=>{
 assert.equal(summarize([],[]).fxProfit,'0');
 const r=summarize([{usdt:'90071992547409910000',rate:'100'}],[{usdt:'90071992547409910000',rate:'101'}]);
 assert.equal(r.fxProfit,'9007199254740991');
});
