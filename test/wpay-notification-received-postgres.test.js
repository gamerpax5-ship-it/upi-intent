'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {randomUUID,randomBytes,createHash}=require('node:crypto'),{readFile}=require('node:fs/promises'),path=require('node:path'),{Pool}=require('pg');
const {migrate,transaction}=require('../lib/wpay/db/migrations'),{MfaCrypto}=require('../lib/wpay/auth/runtime/mfa');
const {BusinessCore}=require('../lib/wpay/business/core'),adminUpi=require('../lib/wpay/business/admin-upi'),ledger=require('../lib/wpay/business/ledger');
const {Gateway}=require('../lib/wpay/gateway/core'),{confirm}=require('../lib/wpay/notification-bot/received'),{Store}=require('../lib/wpay/notification-bot/store');
const {change}=require('../lib/wpay/notification-bot/mappings'),{CONTROLLERS}=require('../lib/wpay/notification-bot/policy');
test('User Received: real transactional accounting, scope, revocation, duplicate UTR and callback delivery',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}
 const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const server=new Pool({connectionString:url.toString()}),name='notification_money_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;
 const ownerPool=new Pool({connectionString:url.toString()});let pool=ownerPool;
 t.after(async()=>{if(pool!==ownerPool)await pool.end();await ownerPool.end();await server.query('DROP DATABASE '+name);await server.end();});
 await migrate(pool);
 // Exercise all financial, trigger and worker access through the same
 // restricted role as production when the focused runner provisions it.
 if((await pool.query("SELECT 1 FROM pg_roles WHERE rolname='wpay_runtime'")).rowCount){
  const runtimePool=new Pool({connectionString:url.toString(),options:'-c role=wpay_runtime'});
  pool=runtimePool;
  await require('../lib/wpay/db/migrations').validateMigrations(runtimePool);
 }
 const ids={admin:randomUUID(),user:randomUUID(),merchant:randomUUID()};
 for(const [key,id] of Object.entries(ids)){
  const type=key==='admin'?'super_admin':key;
  await pool.query("INSERT INTO wpay_auth.accounts(id,subject_id,tenant_id,name,email,account_type,user_id,merchant_id) VALUES($1,$2,'tenant-a',$3,$4,$5,$6,$7)",[id,randomUUID(),key,key+'@fixture.invalid',type,type==='user'?id:null,type==='merchant'?id:null]);
  await pool.query("INSERT INTO wpay_auth.eligibility(account_id,approval_status) VALUES($1,'approved')",[id]);
  await pool.query("INSERT INTO wpay_auth.account_security(account_id,enabled,factor_version,encrypted_secret) VALUES($1,false,1,'{}')",[id]);
 }
 for(const key of ['user','merchant'])await pool.query('INSERT INTO wpay_auth.commercial_versions(id,account_id,version,settings,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),ids[key],key==='user'?{payinCommission:'1',payoutCommission:'1',inrPerUsdt:'107',depositNetwork:'TRON-TRC20',depositAddress:'synthetic'}:{payinFee:'2',payoutFee:'1',fixedPayoutFee:'6',fixedFeeCurrency:'INR'},ids.admin]);
 await pool.query("INSERT INTO wpay_auth.grants(account_id,permissions,permission_version) VALUES($1,ARRAY['merchant.gateway.view','merchant.gateway.create'],1)",[ids.merchant]);
 const core=new BusinessCore({adminManagedCollections:true}),now=new Date(),actor={id:ids.admin,account_type:'super_admin',auth_method:'password',password_at:now,created_at:now,mfa_at:null,database_now:now,status:'active',approval_status:'approved',security_version:1,session_security_version:1,factor_version:0,session_factor_version:0};
 const context={principal:{id:ids.admin,tenantId:'tenant-a',type:'super_admin',status:'active',permissionVersion:1},currentPermissionVersion:1,grants:['bank_upi.view','bank_upi.approve','assignments.view','assignments.update'],adminScope:{tenantIds:['tenant-a'],platform:true}};
 const tx=fn=>transaction(pool,fn),admin=(op,body)=>tx(c=>adminUpi.run(core,c,actor,context,op,body));
 const bank=await admin('business/admin-upi/create',{ownerId:ids.user,reason:'Synthetic approved collection',requestId:randomUUID(),details:{upiId:'fixture.collection@bank',bankName:'Fixture Bank',holderName:'Fixture',accountNumber:'123456780001',ifsc:'TEST0000001',mobile:'+919000000001',bankLimitMinor:'100000',accountType:'business',providerName:'',notes:''}});
 await admin('business/admin-upi/route',{id:null,bankId:bank.id,version:1,merchantId:ids.merchant,priority:10,minMinor:'1',maxMinor:'100000',enabled:true,reason:'Synthetic approved assignment'});
 const crypto=new MfaCrypto(randomBytes(32));let responseCode=503,deliveries=0;
 const endpoint=http.createServer(async(req,res)=>{for await(const _ of req){}deliveries++;res.writeHead(responseCode);res.end();});await new Promise(resolve=>endpoint.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>endpoint.close(resolve)));
 const gateway=new Gateway({pool,crypto,allowSynthetic:true,testCallback:'http://127.0.0.1:'+endpoint.address().port+'/callback'});gateway.core=core;
 await tx(c=>gateway.configure(c,ids.merchant,{url:gateway.testCallback}));
 const store=new Store(pool),chat={id:-10087654,type:'supergroup'},telegramId='1234567',account={id:ids.user,email:'user@fixture.invalid',account_type:'user',status:'active'};
 await store.group(chat,['tenant-a'],async(c,current)=>{const result=change(current.state,{command:'setuser',email:account.email,telegramId},account,CONTROLLERS[0]);await store.save(c,current,result.state,CONTROLLERS[0],'setuser');});
 let messageId=0;
 const make=async(reference,utr)=>{
  const order=await tx(c=>gateway.create(c,ids.merchant,{reference,idempotencyKey:reference,amountMinor:'100',currency:'INR'},'manual','https://fixture.invalid'));
  await tx(c=>gateway.customer(c,order.paymentUrl.split('/').at(-1),utr));
  const claim=(await pool.query('SELECT id FROM wpay_auth.gateway_claims WHERE order_id=$1',[order.id])).rows[0],token=randomBytes(24).toString('base64url'),message=++messageId;
  await store.group(chat,['tenant-a'],async(c,current)=>c.query("INSERT INTO wpay_auth.notification_bot_receipts(token_digest,chat_id,account_id,claim_id,mapping_ids,amount_minor,message_id,expires_at) VALUES($1,$2,$3,$4,$5,'100',$6,CURRENT_TIMESTAMP+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),chat.id,ids.user,claim.id,current.state.mappings.map(m=>m.id),message]));
  return {...order,claimId:claim.id,query:{data:'nb:received:'+token,from:{id:telegramId},message:{chat,message_id:message}}};
 };
 const receive=(o,query=o.query)=>store.group(chat,['tenant-a'],(c,current)=>confirm({c,current,query,access:{receiver:async(_,id)=>!CONTROLLERS.includes(String(id))},gateway,crypto,tenants:['tenant-a']}));
 const one=await make('user-confirmation','123456789012');
 await assert.rejects(receive(one,{...one.query,from:{id:'7654321'}}),/RECEIVED_DENIED/);
 await assert.rejects(receive(one,{...one.query,from:{id:CONTROLLERS[0]}}),/RECEIVED_DENIED/);
 await assert.rejects(receive(one,{...one.query,message:{...one.query.message,message_id:999}}),/RECEIVED_DENIED/);
 const results=await Promise.all([receive(one),receive(one)]);assert.equal(results.filter(r=>r.alreadyAccounted===false).length,1);
 assert.equal((await ledger.summary(pool,ids.merchant)).gross,'100');assert.equal((await ledger.summary(pool,ids.merchant)).fees,'2');assert.equal((await ledger.summary(pool,ids.user)).commission,'1');
 assert.equal((await gateway.get(pool,ids.merchant,one.id)).evidenceStatus,'user_confirmed');
 const event=(await pool.query('SELECT * FROM wpay_auth.gateway_outbox WHERE order_id=$1',[one.id])).rows[0],body=JSON.parse(event.body);assert.equal(body.bankVerified,false);assert.equal(body.approvalMethod,'user_manual');
 await gateway.dispatch();assert.equal(deliveries,1);assert.equal((await pool.query('SELECT state FROM wpay_auth.gateway_outbox WHERE id=$1',[event.id])).rows[0].state,'pending');
 responseCode=200;await pool.query('UPDATE wpay_auth.gateway_outbox SET next_attempt_at=CURRENT_TIMESTAMP WHERE id=$1',[event.id]);await gateway.dispatch();assert.equal((await pool.query('SELECT state FROM wpay_auth.gateway_outbox WHERE id=$1',[event.id])).rows[0].state,'delivered');
 assert.equal((await ledger.summary(pool,ids.merchant)).gross,'100');
 // Real monitor writes and Admin override audit, using synthetic device state.
 const {Source}=require('../lib/wpay/notification-bot/source'),{Worker}=require('../lib/wpay/notification-bot/worker');
 const source=new Source({pool,origin:'https://fixture.invalid'}),worker=new Worker(source);
 const monitorContext={store,pool,tenants:['tenant-a'],settings:require('../lib/wpay/notification-bot/policy').config(),crypto};
 source.device=async()=>({sourceConnected:true,status:'offline',lastSeenAt:new Date(Date.now()-600000).toISOString()});
 const due=()=>pool.query('UPDATE wpay_auth.notification_bot_watches SET next_check_at=CURRENT_TIMESTAMP WHERE bank_id=$1',[bank.id]);
 await due();await worker.monitor(monitorContext);
 assert.equal((await pool.query('SELECT status FROM wpay_auth.business_bank_accounts WHERE id=$1',[bank.id])).rows[0].status,'stopped');
 await admin('business/admin-upi/state',{bankId:bank.id,version:1,action:'start',reason:'Explicit incident override'});
 assert.equal((await pool.query('SELECT auto_stop FROM wpay_auth.notification_bot_watches WHERE bank_id=$1',[bank.id])).rows[0].auto_stop.adminOverride,true);
 await due();await worker.monitor(monitorContext);
 assert.equal((await pool.query('SELECT status FROM wpay_auth.business_bank_accounts WHERE id=$1',[bank.id])).rows[0].status,'running');
 source.device=async()=>({sourceConnected:true,status:'online',lastSeenAt:new Date().toISOString()});
 await due();await worker.monitor(monitorContext);
 assert.equal((await pool.query('SELECT auto_stop FROM wpay_auth.notification_bot_watches WHERE bank_id=$1',[bank.id])).rows[0].auto_stop,null);
 source.device=async()=>({sourceConnected:false,status:'unavailable',lastSeenAt:null});await due();await worker.monitor(monitorContext);
 assert.equal((await pool.query('SELECT status FROM wpay_auth.business_bank_accounts WHERE id=$1',[bank.id])).rows[0].status,'running');
 // Outbox delivery uses only current mapped recipients and real callback state.
 const sent=[];await worker.fanout(monitorContext);
 for(let i=0;i<20;i++){if(!await worker.deliver({...monitorContext,access:{receiver:async()=>true,controller:async()=>true},telegram:{text:async(chatId,text,markup)=>{sent.push({chatId,text,markup});return {message_id:1000+sent.length};}}}))break;}
 assert.ok(sent.some(x=>x.text.includes('Callback Sent')));
 assert.ok(sent.every(x=>String(x.chatId)===String(chat.id)));
 const duplicate=await make('duplicate-utr','123456789012');await assert.rejects(receive(duplicate),/UTR_ALREADY_USED/);
 const revoked=await make('revoked-mapping','123456789013');await store.group(chat,['tenant-a'],async(c,current)=>store.save(c,current,change(current.state,{command:'removeuser',email:account.email,telegramId},account,CONTROLLERS[0]).state,CONTROLLERS[0],'removeuser'));
 await assert.rejects(receive(revoked),/RECEIVED_DENIED/);assert.equal((await ledger.summary(pool,ids.merchant)).gross,'100');
});
