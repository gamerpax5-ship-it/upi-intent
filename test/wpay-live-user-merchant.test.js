"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID,createHash}=require("node:crypto");
const {Pool}=require("pg");
const {migrate,validateMigrations,transaction}=require("../lib/wpay/db/migrations");
const ledger=require("../lib/wpay/business/ledger");
const commercial=require("../lib/wpay/auth/runtime/commercial");
const gatewayValidation=require("../lib/wpay/gateway/validation");
const uploads=require("../lib/wpay/payouts/uploads");
const {MerchantSettlements}=require("../lib/wpay/payouts/merchant-settlement");
const {Payouts}=require("../lib/wpay/payouts/core");
const {startAuthServer}=require("../lib/wpay/auth/runtime/http");
const {Parking,LEASE_SECONDS:PARKING_LEASE,COOLDOWN_SECONDS:PARKING_COOLDOWN}=require("../lib/wpay/parking/core");
const {LEASE_SECONDS:PAYOUT_LEASE,COOLDOWN_SECONDS:PAYOUT_COOLDOWN}=require("../lib/wpay/payouts/claims");

function dbUrl(name){const u=new URL(process.env.TEST_DATABASE_URL);u.pathname="/"+name;return u.toString();}
async function isolated(t,label){
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),name=("wpay_"+label+"_"+randomUUID().replaceAll("-","")).slice(0,60);
 await admin.query("CREATE DATABASE "+name);
 const pool=new Pool({connectionString:dbUrl(name)});
 t.after(async()=>{await pool.end();await admin.query("DROP DATABASE "+name);await admin.end();});
 return pool;
}
async function account(c,type,name,tenant="tenant-a"){
 const id=randomUUID(),subject=randomUUID(),user=type==="user"?id:null,merchant=type==="merchant"?id:null;
 await c.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,status,user_id,merchant_id) VALUES($1,$2,$3,$4,$5,$6,'active',$7,$8)",
  [id,subject,tenant,name,name.toLowerCase().replace(/[^a-z0-9]/g,"")+"@example.invalid",type,user,merchant]);
 return id;
}
const cryptoBox={seal:(value)=>({value}),open:(sealed)=>sealed.value};
function tronAddress(){
 const alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",payload=Buffer.concat([Buffer.from([0x41]),Buffer.alloc(20,7)]);
 const sha=b=>createHash("sha256").update(b).digest(),bytes=Buffer.concat([payload,sha(sha(payload)).subarray(0,4)]);
 let n=BigInt("0x"+bytes.toString("hex")),out="";while(n){const r=Number(n%58n);out=alphabet[r]+out;n/=58n;}for(const b of bytes){if(b!==0)break;out="1"+out;}return out;
}
async function terms(c,accountId,actorId,settings){await c.query("INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)",[randomUUID(),accountId,settings,actorId]);}

test("schema 018 fresh install contains live User Merchant workflow objects",async t=>{
 const pool=await isolated(t,"fresh");await migrate(pool);await validateMigrations(pool);
 assert.equal((await pool.query("SELECT max(version)::int v FROM wpay_auth.schema_migrations")).rows[0].v,19);
 for(const relation of ["merchant_settlement_withdrawals","parking_beneficiaries","parking_orders","parking_locks","parking_submissions"]){
  assert.ok((await pool.query("SELECT to_regclass($1) r",["wpay_auth."+relation])).rows[0].r);
 }
 assert.equal((await pool.query("SELECT column_default FROM information_schema.columns WHERE table_schema='wpay_auth' AND table_name='business_holds' AND column_name='category'")).rowCount,1);
});

test("schema 016 to 018 upgrade preserves existing account records",async t=>{
 const pool=await isolated(t,"upgrade");await migrate(pool,{through:16});
 const preserved=await transaction(pool,async c=>{const id=await account(c,"merchant","Preserved Merchant");return {id,count:(await c.query("SELECT count(*)::int n FROM wpay_auth.accounts")).rows[0].n};});
 await migrate(pool);await validateMigrations(pool);
 assert.equal((await pool.query("SELECT count(*)::int n FROM wpay_auth.accounts")).rows[0].n,preserved.count);
 assert.equal((await pool.query("SELECT name FROM wpay_auth.accounts WHERE id=$1",[preserved.id])).rows[0].name,"Preserved Merchant");
 assert.equal((await pool.query("SELECT max(version)::int v FROM wpay_auth.schema_migrations")).rows[0].v,19);
});

test("runtime role validates the complete schema fingerprint after migration 018",async t=>{
 const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL}),name=("wpay_runtime_visibility_"+randomUUID().replaceAll("-","")).slice(0,60),password="RuntimeTestPass_42!";
 const role=(await admin.query("SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wpay_runtime'")).rowCount;
 if(!role)await admin.query("CREATE ROLE wpay_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION PASSWORD '"+password+"'");
 else await admin.query("ALTER ROLE wpay_runtime WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION PASSWORD '"+password+"'");
 await admin.query("CREATE DATABASE "+name);await admin.query("GRANT CONNECT ON DATABASE "+name+" TO wpay_runtime");
 const ownerPool=new Pool({connectionString:dbUrl(name)});await migrate(ownerPool);await validateMigrations(ownerPool);
 const u=new URL(process.env.TEST_DATABASE_URL);u.pathname="/"+name;u.username="wpay_runtime";u.password=password;
 const runtimePool=new Pool({connectionString:u.toString()});
 try{await validateMigrations(runtimePool);const counts=await require("../lib/wpay/db/migrations").visibilityCounts(runtimePool);assert.ok(counts.columns>0);assert.ok(counts.relations>0);}finally{await runtimePool.end();await ownerPool.end();await admin.end();}
});

test("Admin commercial terms control payment-link TTL and Merchant FX rate",()=>{
 const settings=commercial.commercial("merchant",{payinFee:"1.2",payoutFee:"0.45",fixedPayoutFee:"2",fixedFeeCurrency:"INR",paymentLinkTtlSeconds:"420",inrPerUsdt:"83.5"},"INR");
 assert.equal(settings.paymentLinkTtlSeconds,420);assert.equal(settings.inrPerUsdt,"83.5");
 assert.throws(()=>gatewayValidation.order({reference:"ORDER-1",idempotencyKey:"REQ-1",amountMinor:"100",currency:"INR",description:"x",ttlSeconds:60}),{code:"INVALID_INPUT"});
 const legacy=commercial.commercial("merchant",{payinFee:"1",payoutFee:"1",fixedPayoutFee:"0",fixedFeeCurrency:"INR"},"INR");
 assert.equal(Object.hasOwn(legacy,"paymentLinkTtlSeconds"),false);assert.equal(Object.hasOwn(legacy,"inrPerUsdt"),false);
});

test("real XLSX bulk template is parser-compatible and payout timers are 10m + 5m",()=>{
 const result=uploads.template(),XLSX=require("../public/vendor/smart-upi-parser-runtime/xlsx.full.min.js"),book=XLSX.read(Buffer.from(result.data,"base64"),{type:"buffer",raw:true});
 assert.match(result.name,/\.xlsx$/);assert.deepEqual(book.SheetNames,["Bulk Payouts"]);
 const headers=XLSX.utils.sheet_to_json(book.Sheets["Bulk Payouts"],{header:1,raw:true})[0];
 assert.deepEqual(headers,["reference","beneficiaryName","bankName","accountNumber","ifsc","upiId","amountINR","note"]);
 assert.equal(PAYOUT_LEASE,600);assert.equal(PAYOUT_COOLDOWN,300);assert.equal(PARKING_LEASE,600);assert.equal(PARKING_COOLDOWN,300);
});

test("bulk payout validation rejects a batch whose full reserve exceeds Merchant available balance",async t=>{
 const pool=await isolated(t,"bulk_balance");await migrate(pool);const core=new Payouts({gateway:{},crypto:cryptoBox});
 const ids=await transaction(pool,async c=>{const admin=await account(c,"super_admin","Bulk Admin"),m=await account(c,"merchant","Bulk Merchant");await terms(c,m,admin,{payinFee:"1",payoutFee:"0",fixedPayoutFee:"0",fixedFeeCurrency:"INR",paymentLinkTtlSeconds:300,inrPerUsdt:"83.5"});await ledger.post(c,{key:"bulk-seed",referenceType:"test",referenceId:"seed",actorId:admin,entries:ledger.pair(m,"merchant_gross","10000")});return {m};});
 const prepared={errors:[],orders:[
  {reference:"BULK-1",idempotencyKey:"batch:2",beneficiaryName:"One Beneficiary",bankName:"Bank One",accountNumber:"1234567890",ifsc:"HDFC0000001",upiId:"",amountMinor:"6000",note:""},
  {reference:"BULK-2",idempotencyKey:"batch:3",beneficiaryName:"Two Beneficiary",bankName:"Bank Two",accountNumber:"1234567891",ifsc:"HDFC0000002",upiId:"",amountMinor:"6000",note:""}
 ]};
 const preview=await transaction(pool,c=>core.validateBulk(c,ids.m,prepared));
 assert.equal(preview.availableMinor,"10000");assert.equal(preview.batchReserveMinor,"12000");assert.equal(preview.exceedsAvailable,true);assert.equal(preview.valid,false);
});

test("Merchant USDT withdrawal reserves available INR at immutable Admin rate",async t=>{
 const pool=await isolated(t,"merchant_usdt");await migrate(pool);
 const ids=await transaction(pool,async c=>{const admin=await account(c,"super_admin","Settlement Admin"),merchant=await account(c,"merchant","Settlement Merchant");await terms(c,merchant,admin,{payinFee:"1.2",payoutFee:"0.45",fixedPayoutFee:"2",fixedFeeCurrency:"INR",paymentLinkTtlSeconds:300,inrPerUsdt:"83.5"});await ledger.post(c,{key:"merchant-seed",referenceType:"test",referenceId:"seed",actorId:admin,entries:ledger.pair(merchant,"merchant_gross","1000000")});return {admin,merchant};});
 const service=new MerchantSettlements(cryptoBox);
 const before=await transaction(pool,c=>service.summary(c,ids.merchant));assert.equal(before.available,"1000000");
 const requested=await transaction(pool,c=>service.request(c,ids.merchant,{idempotencyKey:"usdt-withdraw-1",amountMinor:"8350",network:"TRON-TRC20",address:tronAddress()}));
 assert.equal(requested.usdtMinor,"1000000");assert.equal(requested.rate,"83.5");
 assert.equal((await transaction(pool,c=>ledger.summary(c,ids.merchant))).merchantAvailable,"991650");
 for(const action of ["review","approve","process"])await transaction(pool,async c=>{const row=await service.get(c,requested.id);await service.transition(c,row,ids.admin,{id:row.id,action,reason:"Settlement review"});});
 const completed=await transaction(pool,async c=>{const row=await service.get(c,requested.id),now=(await c.query("SELECT CURRENT_TIMESTAMP now")).rows[0].now.toISOString();return service.transition(c,row,ids.admin,{id:row.id,action:"complete",reason:"Settlement completed",reference:"a".repeat(64),network:"TRON-TRC20",completedAt:now});});
 assert.equal(completed.state,"completed");const balance=await transaction(pool,c=>ledger.summary(c,ids.merchant));assert.equal(balance.merchantSettlementReserved,"0");assert.equal(balance.merchantSettlementPrincipal,"8350");assert.equal(balance.merchantAvailable,"991650");
});

test("Parking uses Admin beneficiary, partial shared locks, cooldown and reviewed capacity restoration",async t=>{
 const pool=await isolated(t,"parking");await migrate(pool);const parking=new Parking({crypto:cryptoBox});
 const ids=await transaction(pool,async c=>{const admin=await account(c,"super_admin","Parking Admin"),u1=await account(c,"user","Parking User One"),u2=await account(c,"user","Parking User Two");await terms(c,u1,admin,{payinCommission:"1",payoutCommission:"1",inrPerUsdt:"83.5",depositNetwork:"TRON-TRC20",depositAddress:tronAddress()});return {admin,u1,u2};});
 const beneficiary=await transaction(pool,c=>parking.createBeneficiary(c,ids.admin,{requestId:randomUUID(),tenantId:"tenant-a",beneficiaryName:"Neha Traders",bankName:"State Bank of India",accountNumber:"7210451403",ifsc:"SBIN0007210",upiId:"nehatraders@upi"}));
 await transaction(pool,async c=>{await parking.confirm(c,ids.u1,"tenant-a",beneficiary.id);await parking.confirm(c,ids.u2,"tenant-a",beneficiary.id);});
 const order=await transaction(pool,c=>parking.createOrder(c,ids.admin,{requestId:randomUUID(),tenantId:"tenant-a",beneficiaryId:beneficiary.id,reference:"PARK-500K",totalMinor:"50000000",minMinor:"10000000"}));
 const first=await transaction(pool,c=>parking.lock(c,ids.u1,"tenant-a",{requestId:randomUUID(),orderId:order.id,amountMinor:"10000000"}));assert.equal(first.amountMinor,"10000000");
 let visible=(await transaction(pool,c=>parking.orders(c,{tenantId:"tenant-a",userId:ids.u2})))[0];assert.equal(visible.remainingMinor,"40000000");
 const released=await transaction(pool,c=>parking.release(c,ids.u1,first.id));assert.equal(released.state,"cooldown");
 visible=(await transaction(pool,c=>parking.orders(c,{tenantId:"tenant-a",userId:ids.u2})))[0];assert.equal(visible.remainingMinor,"40000000");
 await transaction(pool,async c=>{await c.query("UPDATE wpay_auth.parking_locks SET cooldown_until=CURRENT_TIMESTAMP-interval '1 second' WHERE id=$1",[first.id]);await parking.expire(c,order.id);});
 visible=(await transaction(pool,c=>parking.orders(c,{tenantId:"tenant-a",userId:ids.u2})))[0];assert.equal(visible.remainingMinor,"50000000");
 const paid=await transaction(pool,c=>parking.lock(c,ids.u1,"tenant-a",{requestId:randomUUID(),orderId:order.id,amountMinor:"10000000"}));
 const proof=await parking.prepare("parking/submit",{proof:{name:"proof.png",data:Buffer.from("89504e470d0a1a0a","hex").toString("base64")}});
 assert.equal((await transaction(pool,c=>parking.submit(c,ids.u1,{id:paid.id,utr:"123456789012",proof:{name:"proof.png",data:"unused"},note:"Parking paid"},proof))).state,"submitted");
 assert.equal((await transaction(pool,c=>parking.review(c,ids.admin,paid.id,"review","Evidence review"))).state,"review");
 const approved=await transaction(pool,c=>parking.review(c,ids.admin,paid.id,"approve","Evidence accepted"));assert.equal(approved.state,"completed");assert.equal(approved.capacityRestored,true);
 assert.equal((await transaction(pool,c=>ledger.summary(c,ids.u1))).available,"10000000");
 const duplicate=await transaction(pool,async c=>(await c.query("SELECT count(*)::int n FROM wpay_auth.parking_postings WHERE parking_id=$1",[paid.id])).rows[0].n);assert.equal(duplicate,1);
});

test("HTTP /user and /merchant serve dedicated role shells while /admin stays generic",async t=>{
 const server=await startAuthServer({service:{},port:0});t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const base="http://127.0.0.1:"+server.address().port;
 const user=await fetch(base+"/user"),merchant=await fetch(base+"/merchant"),admin=await fetch(base+"/admin"),userCss=await fetch(base+"/wpay-auth/user-role.css"),merchantCss=await fetch(base+"/wpay-auth/merchant-role.css");
 assert.equal(user.status,200);assert.match(await user.text(),/wpay-entry-role" content="user"/);
 assert.equal(merchant.status,200);assert.match(await merchant.text(),/wpay-entry-role" content="merchant"/);
 assert.equal(admin.status,200);const adminHtml=await admin.text();assert.match(adminHtml,/wpay-entry-role" content="admin"/);assert.doesNotMatch(adminHtml,/user-role\.css|merchant-role\.css/);
 assert.equal(userCss.status,200);assert.equal(merchantCss.status,200);
});

test("role HTML shells preserve real runtime integrations",async()=>{
 const fs=require("node:fs/promises");
 const [user,merchant,http]=await Promise.all([fs.readFile("dev/wpay-auth/web/user.html","utf8"),fs.readFile("dev/wpay-auth/web/merchant.html","utf8"),fs.readFile("lib/wpay/auth/runtime/http.js","utf8")]);
 assert.match(user,/wpay-entry-role" content="user"/);assert.match(merchant,/wpay-entry-role" content="merchant"/);
 assert.match(user,/role-dashboard\.js/);assert.match(merchant,/role-dashboard\.js/);
 assert.match(http,/apk\/download/);assert.match(http,/loadCheckout/);assert.match(http,/parking\/submit/);assert.match(http,/user\.html/);assert.match(http,/merchant\.html/);
});
