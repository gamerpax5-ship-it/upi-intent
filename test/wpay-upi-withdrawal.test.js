'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto');
const {Withdrawals,upiDestination}=require('../lib/wpay/payouts/withdrawals');
test('UPI withdrawal validates a single explicit destination before database access',async()=>{
 assert.deepEqual(upiDestination({beneficiaryName:'Synthetic User',upiId:'Fixture@Test'}),{beneficiaryName:'Synthetic User',upiId:'fixture@test',transferMode:'upi',source:'request_details'});
 for(const details of [null,{}, {beneficiaryName:'Synthetic User',upiId:'bad'}, {beneficiaryName:'Synthetic User',upiId:'ok@test',bankId:'extra'}])assert.throws(()=>upiDestination(details));
 const w=new Withdrawals(null),client={query(){throw Error('Database must not be reached');}},base={idempotencyKey:'synthetic-upi',currency:'INR',amountMinor:'1000',upiDetails:{beneficiaryName:'Synthetic User',upiId:'fixture@test'}};
 for(const extra of [{bankId:randomUUID()},{bankDetails:{}},{currency:'USDT'},{network:'TRON-TRC20'}])await assert.rejects(w.request(client,randomUUID(),{...base,...extra}),{code:'INVALID_INPUT'});
});
test('PostgreSQL: UPI withdrawal encryption, idempotency, release and Admin completion',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),{migrate,transaction}=require('../lib/wpay/db/migrations'),ledger=require('../lib/wpay/business/ledger'),{entitlement}=require('../lib/wpay/payouts/accounting'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa');
 const server=new Pool({connectionString:url.toString()}),name='upi_withdrawal_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});
 t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});await migrate(pool);
 const admin=randomUUID(),user=randomUUID();for(const [id,type] of [[admin,'super_admin'],[user,'user']])await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id) VALUES($1,$2,'upi-withdrawal-test','Synthetic Test',$3,$4,'active',$5)",[id,randomUUID(),id+'@example.invalid',type,type==='user'?id:null]);
 await pool.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),user,{payinCommission:'1',payoutCommission:'1',inrPerUsdt:'107',depositNetwork:'ETHEREUM-ERC20'},admin]);
 await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[user]);
 const tx=fn=>transaction(pool,fn),w=new Withdrawals(new MfaCrypto(randomBytes(32)));
 await tx(c=>ledger.post(c,{key:'synthetic-upi-commission',referenceType:'test',referenceId:'test',entries:ledger.pair(user,'user_commission','100000')}));
 const body={idempotencyKey:'upi-request',currency:'INR',amountMinor:'100000',upiDetails:{beneficiaryName:'Synthetic Person',upiId:'fixture@test'}},request=b=>tx(c=>w.request(c,user,b));
 const first=await request(body);assert.equal(first.feeMinor,'500');assert.equal(first.netMinor,'99500');assert.equal((await request(body)).id,first.id);assert.equal((await entitlement(pool,user)).available,'0');
 await assert.rejects(request({...body,upiDetails:{...body.upiDetails,upiId:'different@test'}}),{code:'CONFLICT'});
 const stored=(await pool.query('SELECT * FROM wpay_auth.commission_withdrawals WHERE id=$1',[first.id])).rows[0];assert.equal(w.project(stored,true).destination.upiId,'fixture@test');assert.equal(w.project(stored).destination,undefined);assert.ok(!JSON.stringify(stored).includes('fixture@test'));
 const change=(r,action,extra={})=>tx(c=>w.transition(c,r,admin,{id:r.id,action,reason:'Synthetic test decision',...extra}));
 await change(first,'reject');assert.equal((await entitlement(pool,user)).available,'100000');
 const second=await request({...body,idempotencyKey:'upi-complete'});for(const action of ['approve','process'])await change(second,action);
 await assert.rejects(change(second,'complete',{completedAt:new Date().toISOString()}),{code:'INVALID_INPUT'});
 const completedAt=(await pool.query('SELECT CURRENT_TIMESTAMP AS now')).rows[0].now.toISOString();await change(second,'complete',{reference:'123456789012',completedAt});await change(second,'complete',{reference:'123456789012',completedAt});
 assert.equal((await entitlement(pool,user)).withdrawn,'100000');assert.equal((await entitlement(pool,user)).reserved,'0');
});
