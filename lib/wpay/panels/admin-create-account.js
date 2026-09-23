'use strict';
const {randomUUID}=require('node:crypto'),v=require('../auth/runtime/validation'),{permit,recent,fail}=require('../operations/access');
const {hashPassword}=require('../auth/runtime/passwords'),ledger=require('../business/ledger');
async function create(c,row,context,b){
 if(!['admin','super_admin'].includes(row.account_type))fail();
 v.exactFields(b,['requestId','type','name','email','password']);require('../business/validation').id(b.requestId);
 if(!['user','merchant'].includes(b.type))fail('INVALID_INPUT');
 const scope=permit(context,b.type==='user'?'users.view':'merchants.view');recent(row);
 const id=randomUUID();permit(context,b.type==='user'?'users.approve':'merchants.approve',{kind:'record',id,tenantId:row.tenant_id});
 if(!scope.tenantIds?.includes(row.tenant_id))fail();
 const name=v.name(b.name),email=v.email(b.email);v.password(b.password,b.type);
 const payload=ledger.digest({type:b.type,name,email,password:b.password});await ledger.lock(c);
 const prior=(await c.query('SELECT payload_digest,result FROM wpay_auth.directory_requests WHERE actor_id=$1 AND request_id=$2',[row.id,b.requestId])).rows[0];
 if(prior){if(prior.payload_digest!==payload)fail('CONFLICT');return prior.result;}
 if((await c.query('SELECT 1 FROM wpay_auth.accounts WHERE email=$1',[email])).rowCount)fail('CONFLICT');
 const record=await hashPassword(b.password,b.type),grants=require('../auth/runtime/service').DEFAULT_GRANTS[b.type];
 await c.query('INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,user_id,merchant_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,randomUUID(),row.tenant_id,name,email,b.type,b.type==='user'?randomUUID():null,b.type==='merchant'?randomUUID():null]);
 await c.query('INSERT INTO wpay_auth.credentials(account_id,password_record) VALUES($1,$2)',[id,record]);
 await c.query('INSERT INTO wpay_auth.grants(account_id,permission_version,permissions) VALUES($1,1,$2)',[id,grants]);
 for(const table of ['eligibility','account_security','preferences'])await c.query('INSERT INTO wpay_auth.'+table+'(account_id) VALUES($1)',[id]);
 const result={id,approvalStatus:'pending'};
 await c.query('INSERT INTO wpay_auth.directory_requests(actor_id,request_id,payload_digest,result) VALUES($1,$2,$3,$4)',[row.id,b.requestId,payload,result]);
 await c.query("INSERT INTO wpay_auth.panel_audit(id,actor_id,target_id,action) VALUES($1,$2,$3,'account_created_by_admin')",[randomUUID(),row.id,id]);return result;
}
module.exports={create};
