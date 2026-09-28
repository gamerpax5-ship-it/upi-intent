'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{createHash,randomUUID}=require('node:crypto');
const {createLegacyReader}=require('../lib/wpay/integrations/legacy-reader');
function ui(){const c={};vm.runInNewContext(fs.readFileSync(require.resolve('../dev/wpay-auth/web/admin-ui.js'),'utf8'),c);return c.WPayAdminUi;}
test('global account search only reads granted collections and keeps selection scoped to an account ID',async()=>{
 const calls=[],post=async(path,body)=>{calls.push({path,body});return {rows:[{id:'fixture-id',name:'Synthetic',email:'fixture@example.invalid'}]};};
 assert.equal((await ui().searchEntities(post,[],'Synthetic')).hits.length,0);assert.equal(calls.length,0);
 const r=await ui().searchEntities(post,['users.view'],'Synthetic');assert.equal(calls.length,1);assert.equal(calls[0].body.type,'user');assert.equal(calls[0].body.search,'Synthetic');assert.equal(r.hits[0].state.search,'fixture-id');assert.equal(r.hits[0].destination,'v5.users');
});
test('UTR search uses exact validated filters and reports unavailable sources without reading OTP content',async()=>{
 const calls=[],utr='123456789012',post=async(path,body)=>{calls.push({path,body});if(path==='operations/utr/pending')return {records:[{utr,reference:'Fixture',status:'pending'}]};if(!body.linkId)return {links:[{id:'one'},{id:'two'}],afterLink:'more'};if(body.linkId==='two')throw Error('unavailable');return {observations:[{utr,source:'transactions',amount:'1.00'}]};};
 const r=await ui().searchEntities(post,['utr_center.view'],utr);assert.equal(r.hits.length,2);assert.ok(r.hits.every(x=>x.state.utr===utr));assert.equal(r.warnings.length,2);assert.ok(calls.filter(x=>x.body.linkId).every(x=>x.body.utr===utr));assert.ok(calls.every(x=>!x.path.includes('otp')));
 calls.length=0;await ui().searchEntities(post,['utr_center.view'],'12345');assert.equal(calls.length,0);
});
function principal(type='admin',grants=['utr_center.view']){const id=randomUUID(),now=new Date();return {row:{id,account_type:type,database_now:now,mfa_at:now},context:{principal:{id,type,tenantId:'tenant-a',status:'active',permissionVersion:1},currentPermissionVersion:1,grants,adminScope:{tenantIds:['tenant-a']}}};}
test('claim search keeps both tenant predicates and filters by digest before decrypting',async()=>{
 const {list}=require('../lib/wpay/operations/utr-review'),p=principal(),calls=[],client={query:async(sql,args)=>{calls.push({sql,args});return {rows:[]};}},crypto={open(){throw Error('No unmatched claim may be decrypted');}};
 await list(client,p.row,p.context,{utr:'123456789012',status:'all'},crypto);assert.deepEqual(calls[0].args[0],['tenant-a']);assert.match(calls[0].sql,/u\.tenant_id=ANY\(\$1\) AND m\.tenant_id=ANY\(\$1\)/);assert.equal(calls[0].args[3],createHash('sha256').update('123456789012').digest('hex'));
 for(const body of [{utr:123456789012},{utr:"' OR 1=1 --"},{utr:'123'}])await assert.rejects(list(client,p.row,p.context,body,crypto),{code:'INVALID_INPUT'});
 for(const p of [principal('user'),principal('employee'),principal('admin',[])])await assert.rejects(list(client,p.row,p.context,{utr:'123456789012'},crypto),{code:'FORBIDDEN'});
 assert.equal(calls.length,1);
});
async function readerFixture(){const calls=[],client={query:async(sql,args)=>{calls.push({sql,args});return {rows:[],rowCount:0};},release(){}},reader=await createLegacyReader({query:async()=>({rows:[{name:'wpay_legacy_reader',rolsuper:false}]}),connect:async()=>client});return {reader,calls};}
test('legacy filtered reads retain source, time and cursor bounds and reject unsupported filters',async()=>{
 const f=await readerFixture(),link={resource_id:'owned',valid_from:new Date('2026-01-01'),valid_until:new Date('2026-02-01')};
 for(const view of ['transactions','statement']){await f.reader.read(link,view,'100',{utr:'123456789012'});const q=f.calls.filter(x=>x.args).at(-1);assert.deepEqual(q.args,['owned','100',link.valid_from,link.valid_until,'123456789012']);assert.match(q.sql,/created_at>=\$3 AND created_at<\$4/);assert.match(q.sql,/id<\$2::bigint/);assert.match(q.sql,/utr(?:_normalized)?=\$5/);}
 await assert.rejects(f.reader.read(link,'otp','100',{utr:'123456789012'}),{code:'INVALID_INPUT'});await assert.rejects(f.reader.read(link,'transactions','100',{utr:'123456789012',owner:'foreign'}),{code:'INVALID_INPUT'});
});
test('PostgreSQL UTR lookup excludes foreign sources, wrong UTRs and observations outside the authorized interval',async t=>{
 if(!process.env.TEST_DATABASE_URL){t.skip('Requires isolated PostgreSQL');return;}const url=new URL(process.env.TEST_DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const {Pool}=require('pg'),server=new Pool({connectionString:url.toString()}),name='utr_search_'+randomUUID().replaceAll('-','');await server.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new Pool({connectionString:url.toString()});t.after(async()=>{await pool.end();await server.query('DROP DATABASE '+name);await server.end();});
 for(const [view,table,key,utrKey] of [['transactions','device_transactions','device_id','utr'],['statement','statement_credit_events','import_id','utr_normalized']]){
  await pool.query(`CREATE TABLE public.${table}(id bigint,${key} text,${utrKey} text,status text,amount numeric,created_at timestamptz,txn_date timestamptz,matched_at timestamptz)`);
  const rows=[[1,'owned','123456789012','2026-01-15'],[2,'foreign','123456789012','2026-01-15'],[3,'owned','999999999999','2026-01-15'],[4,'owned','123456789012','2025-12-31'],[5,'owned','123456789012','2026-02-01']];
  for(const [id,owner,utr,at] of rows)await pool.query(`INSERT INTO public.${table}(id,${key},${utrKey},created_at,amount) VALUES($1,$2,$3,$4,1)`,[id,owner,utr,at]);
  const f=await readerFixture();await f.reader.read({resource_id:'owned',valid_from:new Date('2026-01-01'),valid_until:new Date('2026-02-01')},view,'100',{utr:'123456789012'});const q=f.calls.find(x=>x.args),actual=await pool.query(q.sql,q.args);assert.deepEqual(actual.rows.map(x=>x.id),['1']);
 }
});
