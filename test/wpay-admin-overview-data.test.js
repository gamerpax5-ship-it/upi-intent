"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {overview}=require('../lib/wpay/panels/admin-overview');
const row={account_type:'admin',database_now:new Date('2026-09-22T13:31:00Z')};
const context=grants=>({principal:{id:'admin-a',tenantId:'tenant-a',type:'admin',status:'active',permissionVersion:1},currentPermissionVersion:1,grants,adminScope:{tenantIds:['tenant-a']}});
test('overview denies customers and absent permission before querying',async()=>{let queries=0;const c={query:async()=>{queries++;}};await assert.rejects(overview(c,{...row,account_type:'user'},context(['overview.view'])),e=>e.code==='FORBIDDEN');await assert.rejects(overview(c,row,context([])),e=>e.code==='FORBIDDEN');assert.equal(queries,0);});
test('overview-only grant does not expose financial totals or use unscoped queries',async()=>{const r=await overview({query:async()=>{throw Error('unexpected SQL');}},row,context(['overview.view']));assert.equal(r.merchantAvailable,null);assert.equal(r.netProfit,null);assert.equal(r.totalVolume,null);});
test('merchant balances include payout fees, principal, settlement and frozen reservations',async()=>{
 const queries=[],c={query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.includes('a.account_type,e.ledger_type')?[['merchant_gross','100000'],['merchant_platform_fee','1000'],['merchant_payout_fee','600'],['merchant_payout_reserved','10000'],['merchant_payout_principal','20000'],['merchant_settlement_reserved','5000'],['merchant_settlement_principal','10000'],['merchant_hold','3000']].map(([ledger_type,amount])=>({account_type:'merchant',ledger_type,amount})):[]};}};
 const r=await overview(c,row,context(['overview.view','reports.view']),{days:60});assert.equal(r.merchantAvailable,'50400');assert.equal(r.frozen,'18000');assert.equal(r.settlement,'10000');assert.equal(r.netProfit,null);
 for(const q of queries){assert.match(q.sql,/a\.tenant_id=ANY\(\$1\)/);assert.deepEqual(q.args[0],['tenant-a']);}
});
test('unsupported period is rejected without SQL',async()=>{await assert.rejects(overview({},row,context(['overview.view']),{days:999}),e=>e.code==='INVALID_INPUT');});
