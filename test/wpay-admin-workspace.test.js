'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const finance=require('../lib/wpay/panels/admin-finance');
test('Admin topbar stays on V5 Notifications and Profile pages',()=>{
 const fs=require('node:fs'),ui=fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-ui.js'),'utf8');
 assert.match(ui,/notifications\.view'[\s\S]*?api\.navigate\('v5\.notifications'\)/);
 assert.match(ui,/profile\.view'[\s\S]*?api\.navigate\('v5\.profile'\)/);
 assert.doesNotMatch(ui,/notifications\.view'[\s\S]*?api\.navigate\(p\.destinationId\)/);
 assert.doesNotMatch(ui,/profile\.view'[\s\S]*?api\.navigate\(p\.destinationId\)/);
 assert.match(ui,/go\('reports\.view','Reports','v5\.reports'\)/);
 for(const destination of ['v5.approvals','v5.bank-upi','v5.deposits','v5.payout-approval','v5.payout-disputes','v5.late-reviews','v5.withdrawals'])assert.match(ui,new RegExp(destination.replaceAll('.','\\\\.')));
});
test('operating margin excludes double counting and unsupported FX',()=>{
 assert.equal(finance.margin({merchant_platform_fee:'1000',merchant_payout_fee:'600',user_commission:'200',user_payout_commission:'100'},'500'),'800');
 assert.equal(finance.margin({},'500'),'-500');
});
test('customer and employee cannot access admin finance',async()=>{
 for(const account_type of ['user','merchant','employee'])await assert.rejects(finance.run({query(){throw Error('should not query');}},{account_type},{},'panel/admin-finance',{}),{code:'FORBIDDEN'});
});
test('Admin account creation, profit, expenses, voids and audit use scoped real rows',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires disposable local PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),admin=new Pool({connectionString:url.toString()}),name='admin_workspace_'+randomUUID().replaceAll('-','');await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name);await admin.end();});
 const {migrate,transaction}=require('../lib/wpay/db/migrations');await migrate(pool);
 const {SecurityRepository}=require('../lib/wpay/db/security-repository'),{AuthService}=require('../lib/wpay/auth/runtime/service'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa');
 const repo=new SecurityRepository(pool),service=new AuthService(repo,{mfaCrypto:new MfaCrypto(randomBytes(32))}),password='Testing-admin-password-2026';
 await service.bootstrap({name:'Workspace Admin',email:'admin@workspace.invalid',password});
 const session=(await service.login({email:'admin@workspace.invalid',password},'127.0.0.1','admin')).sessionToken;
 const call=(op,b={})=>service.authenticated(session,op,0,b,'admin');
 const merchantBody={requestId:randomUUID(),type:'merchant',name:'Test Merchant',email:'merchant@workspace.invalid',password};
 const merchant=await call('panel/directory/create',merchantBody),user=await call('panel/directory/create',{...merchantBody,requestId:randomUUID(),type:'user',name:'Test User',email:'user@workspace.invalid'});
 assert.equal(merchant.approvalStatus,'pending');assert.equal((await call('panel/directory/create',merchantBody)).id,merchant.id);
 await assert.rejects(call('panel/directory/create',{...merchantBody,name:'Different name'}),{code:'CONFLICT'});
 await assert.rejects(service.login({email:merchantBody.email,password},'127.0.0.1','merchant'),{code:'APPROVAL_PENDING'});
 const ledger=require('../lib/wpay/business/ledger');await transaction(pool,c=>ledger.post(c,{key:'synthetic-admin-report',referenceType:'test',referenceId:'test',entries:[...ledger.pair(merchant.id,'merchant_platform_fee','1000'),...ledger.pair(merchant.id,'merchant_payout_fee','200'),...ledger.pair(user.id,'user_commission','300')]}));
 const cost={requestId:randomUUID(),tenantId:'wpay-auth-development',category:'salary',payee:'Test employee',amountMinor:'500',occurredAt:new Date().toISOString(),description:'Synthetic salary reference'};
 const expense=await call('panel/expense/create',cost);assert.equal((await call('panel/expense/create',cost)).id,expense.id);
 await assert.rejects(call('panel/expense/create',{...cost,requestId:randomUUID(),tenantId:'foreign-tenant'}),e=>['FORBIDDEN','INVALID_INPUT'].includes(e.code));
 const report=await call('panel/admin-finance');assert.equal(report.operatingMargin,'400');assert.equal(report.totalCosts,'500');assert.equal(report.canManage,true);assert.equal(report.fxProfit,null);
 assert.ok(report.rows.some(r=>r.id===merchant.id));assert.equal(report.expenses.length,1);
 await call('panel/expense/void',{id:expense.id,reason:'Synthetic reversal'});const updated=await call('panel/admin-finance');assert.equal(updated.operatingMargin,'900');assert.equal(updated.expenses[0].void_reason,'Synthetic reversal');
 const audit=await call('panel/admin-audit');assert.ok(audit.rows.some(r=>r.action==='account_created_by_admin'));
 const nav=await call('navigation');assert.ok(nav.groups.flatMap(g=>g.children).some(p=>p.destinationId==='admin-finance.salary'));
 await assert.rejects(call('panel/admin-finance',{from:'2020-01-01',to:'2026-01-01'}),{code:'INVALID_INPUT'});
});
