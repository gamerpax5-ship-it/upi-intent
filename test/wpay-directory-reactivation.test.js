'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {run}=require('../lib/wpay/panels/api');
function fixture(type='admin',status='suspended',approval='approved'){
 const id=randomUUID(),target=randomUUID(),now=new Date(),writes=[];
 const row={id,account_type:type,database_now:now,mfa_at:now,transaction_password_at:now};
 const context={principal:{id,type,tenantId:'tenant-a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['users.view','users.suspend'],adminScope:{tenantIds:['tenant-a']}};
 const c={query:async(sql,args)=>{writes.push({sql,args});if(sql.includes('SELECT a.*,e.approval_status'))return {rows:[{id:target,account_type:'user',tenant_id:'tenant-a',status,approval_status:approval}]};if(sql.includes('COALESCE(max(version)'))return {rows:[{n:3}]};return {rows:[],rowCount:0};}};
 const body={id:target,requestId:randomUUID(),action:'reactivate',settings:null,expectedVersion:3,reason:'Account review completed'};
 return {writes,row,context,c,body,call:()=>run(c,row,context,'panel/directory/update',body)};
}
test('reactivation preserves UPI verification and rates while disabling all account routes',async()=>{
 const f=fixture(),r=await f.call();assert.equal(r.status,'active');assert.equal(r.routingStopped,true);assert.equal(r.sessionsInvalidated,true);
 const stop=f.writes.find(x=>x.sql.startsWith('UPDATE wpay_auth.business_assignments'));
 assert.deepEqual(stop.args,[f.body.id]);assert.match(stop.sql,/user_id=\$1 OR merchant_id=\$1/);
 assert.ok(!f.writes.some(x=>/UPDATE wpay_auth.business_bank|INSERT INTO wpay_auth.commercial|DELETE/.test(x.sql)));
 const audit=f.writes.find(x=>x.sql.startsWith('INSERT INTO wpay_auth.panel_audit'));assert.equal(audit.args[3],'directory_reactivate');
});
test('reactivation rejects employee, unapproved account, active account and stale terms',async()=>{
 for(const f of [fixture('employee'),fixture('admin','suspended','pending'),fixture('admin','active')])await assert.rejects(f.call());
 const f=fixture();f.body.expectedVersion=2;await assert.rejects(f.call(),{code:'CONFLICT'});
});
test('reactivation is tenant scoped and requires suspend permission',async()=>{
 const f=fixture();f.context.adminScope.tenantIds=['other'];await assert.rejects(f.call(),{code:'FORBIDDEN'});
 const g=fixture();g.context.grants=['users.view'];await assert.rejects(g.call(),{code:'FORBIDDEN'});
});
test('suspension stops routing before changing account state',async()=>{
 const f=fixture('admin','active');f.body.action='suspend';assert.equal((await f.call()).status,'suspended');
 assert.ok(f.writes.findIndex(x=>x.sql.startsWith('UPDATE wpay_auth.business_assignments'))<f.writes.findIndex(x=>x.sql.startsWith('UPDATE wpay_auth.accounts SET status')));
});

test('reactivation rejects missing or expired password confirmation even with recent MFA',async()=>{
 for(const transaction_password_at of [null,new Date(0)]){
  const f=fixture();f.row.transaction_password_at=transaction_password_at;
  await assert.rejects(f.call(),{code:'RECENT_PASSWORD_REQUIRED'});
  assert.equal(f.writes.length,0);
 }
});
