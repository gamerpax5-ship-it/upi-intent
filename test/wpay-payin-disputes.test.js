"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{randomUUID,randomBytes}=require("node:crypto");
const {migrate,transaction}=require("../lib/wpay/db/migrations"),ledger=require("../lib/wpay/business/ledger"),uploads=require("../lib/wpay/payouts/uploads");
const {PayinDisputes,withinWindow,coverage}=require("../lib/wpay/gateway/payin-disputes"),{MfaCrypto}=require("../lib/wpay/auth/runtime/mfa");
test("pay-in dispute uses exact 48-hour window and statement coverage",()=>{
 const paid=new Date("2026-09-25T12:00:00Z"),now=new Date(+paid+3600000);
 assert.equal(withinWindow(paid,new Date(+paid+48*3600000-1)),true);assert.equal(withinWindow(paid,new Date(+paid+48*3600000)),false);
 assert.doesNotThrow(()=>coverage({coverageFrom:paid.toISOString(),coverageThrough:now.toISOString()},paid,now));
 assert.throws(()=>coverage({coverageFrom:now.toISOString(),coverageThrough:now.toISOString()},paid,now),{code:"INVALID_INPUT"});
});
test("PostgreSQL: pay-in dispute holds exposure, accepts response and exact-reverses original accounting",async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip("Requires isolated PostgreSQL");return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));
 const {Pool}=require("pg"),server=new Pool({connectionString:url.toString()}),name="payin_dispute_"+randomUUID().replaceAll("-","");
 await server.query("CREATE DATABASE "+name);url.pathname="/"+name;const pool=new Pool({connectionString:url.toString()});
 t.after(async()=>{await pool.end();await server.query("DROP DATABASE "+name);await server.end();});await migrate(pool);
 const admin=randomUUID(),merchant=randomUUID(),user=randomUUID(),tenant="payin-dispute-test";
 for(const [id,type]of [[admin,"super_admin"],[merchant,"merchant"],[user,"user"]]){
  await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id,merchant_id) VALUES($1,$2,$3,'Synthetic',$4,$5,'active',$6,$7)",[id,randomUUID(),tenant,id+"@example.invalid",type,type==="user"?id:null,type==="merchant"?id:null]);
  await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[id]);await pool.query("INSERT INTO wpay_auth.account_security(account_id,enabled) VALUES($1,false)",[id]);
 }
 const bank=randomUUID(),assignment=randomUUID(),reservation=randomUUID(),order=randomUUID();
 await pool.query("INSERT INTO wpay_auth.business_bank_accounts(id,owner_id,version,status,approved_version,verified_version) VALUES($1,$2,1,'running',1,1)",[bank,user]);
 await pool.query("INSERT INTO wpay_auth.business_bank_versions(bank_id,version,details,limit_minor,actor_id) VALUES($1,1,$2,'1000000',$3)",[bank,{upiId:"synthetic@test",bankName:"Synthetic",holderName:"Synthetic",accountNumber:"12345678",ifsc:"TEST0000001",mobile:"+919999999999",bankLimitMinor:"1000000",accountType:"business",providerName:"Synthetic",notes:""},user]);
 await pool.query("INSERT INTO wpay_auth.business_bank_identities(bank_id,version,account_key) VALUES($1,1,'synthetic-key')",[bank]);
 await pool.query("INSERT INTO wpay_auth.business_assignments(id,merchant_id,user_id,bank_id,status,priority,weight,min_minor,max_minor,created_by) VALUES($1,$2,$3,$4,'active',1,1,'1','1000000',$5)",[assignment,merchant,user,bank,admin]);
 await pool.query("INSERT INTO wpay_auth.business_reservations(id,merchant_id,user_id,bank_id,bank_version,assignment_id,order_reference,idempotency_key,payload_digest,amount_minor,currency,state,snapshot,expires_at) VALUES($1,$2,$3,$4,1,$5,'payin-order','payin-order',$6,'10000','INR','consumed',$7,CURRENT_TIMESTAMP+interval '1 hour')",[reservation,merchant,user,bank,assignment,"a".repeat(64),{merchant:{settings:{payinFee:"1"}},user:{settings:{payinCommission:"0.5"}}}]);
 const tx=fn=>transaction(pool,fn);
 await tx(c=>ledger.post(c,{key:"seed-capacity",referenceType:"test",referenceId:"seed",entries:ledger.pair(user,"capacity_allocated","50000")}));
 const original=await tx(c=>ledger.post(c,{key:"payin-economic",referenceType:"payin",referenceId:"payin-order",entries:[...ledger.pair(user,"capacity_consumed","10000"),...ledger.pair(merchant,"merchant_gross","10000"),...ledger.pair(merchant,"merchant_platform_fee","100"),...ledger.pair(user,"user_commission","50")]}));
 const paid=new Date(Date.now()-3600000);
 await pool.query("INSERT INTO wpay_auth.gateway_orders(id,merchant_id,reservation_id,reference,idempotency_key,payload_digest,amount_minor,currency,description,metadata,origin,token_digest,encrypted_token,state,expires_at,paid_at,evidence_state) VALUES($1,$2,$3,'payin-order','gateway-key',$4,'10000','INR','Synthetic',$5,'manual',$6,$7,'successful',CURRENT_TIMESTAMP+interval '1 hour',$8,'verified')",[order,merchant,reservation,"b".repeat(64),{},"c".repeat(64),{},paid]);
 await pool.query("INSERT INTO wpay_auth.business_financial_events(economic_id,bank_id,utr_digest,reservation_id,journal_id,source,amount_minor) VALUES('synthetic-economic',$1,$2,$3,$4,'normal','10000')",[bank,"d".repeat(64),reservation,original]);
 const crypto=new MfaCrypto(randomBytes(32)),engine=new PayinDisputes({crypto}),proof=await uploads.proof({name:"statement.pdf",data:Buffer.from("%PDF-1.4\nfresh statement\n%%EOF").toString("base64")});
 const now=(await pool.query("SELECT CURRENT_TIMESTAMP now")).rows[0].now,body={id:order,reason:"Merchant statement does not show receipt",statement:{},coverageFrom:new Date(+paid-60000).toISOString(),coverageThrough:new Date(+now).toISOString()};
 const opened=await tx(c=>engine.open(c,merchant,body,proof));assert.equal(opened.status,"pending");
 let ub=await ledger.summary(pool,user),mb=await ledger.summary(pool,merchant);assert.equal(ub.held,"10000");assert.equal(mb.merchantHeld,"9900");
 const responseProof=await uploads.proof({name:"response.pdf",data:Buffer.from("%PDF-1.4\nuser response\n%%EOF").toString("base64")});
 await tx(c=>engine.respond(c,user,{id:order,reason:"Bank statement shows the collection",proof:{}},responseProof));assert.equal((await engine.detail(pool,order)).responses.length,1);
 const beforeInvalid=await ledger.summary(pool,merchant);await tx(c=>engine.resolve(c,admin,{id:order,action:"payment_invalid",reason:"Reviewed statements; original pay-in is invalid"}));
 ub=await ledger.summary(pool,user);mb=await ledger.summary(pool,merchant);assert.equal(ub.held,"0");assert.equal(ub.consumed,"0");assert.equal(mb.merchantHeld,"0");assert.equal(mb.gross,"0");assert.equal(mb.fees,"0");assert.equal((await pool.query("SELECT state FROM wpay_auth.gateway_orders WHERE id=$1",[order])).rows[0].state,"successful");
 assert.equal((await engine.detail(pool,order)).status,"payment_invalid");assert.ok(BigInt(beforeInvalid.merchantAvailable)<=0n);
 await assert.rejects(pool.query("DELETE FROM wpay_auth.payin_dispute_resolutions"),/WPAY_APPEND_ONLY/);
});
