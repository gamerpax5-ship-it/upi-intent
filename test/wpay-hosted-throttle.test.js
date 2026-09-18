"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {AuthRepository}=require('../lib/wpay/db/auth-repository');
const {SecurityRepository}=require('../lib/wpay/db/security-repository');
function database(){const calls=[],counts=new Map();return {calls,async query(sql,args){calls.push({sql,args});const n=(counts.get(args[0])||0)+1;counts.set(args[0],n);return {rows:[{attempts:n}]};}};}
test('development retains loopback-only admission and rejects unknown modes before querying',async()=>{
 const pool=database(),repo=new AuthRepository(pool);
 for(const ip of ['10.0.0.2','203.0.113.9','::1',undefined,'127.0.0.1, 203.0.113.9'])await assert.rejects(repo.throttle('csrf',ip),{code:'FORBIDDEN'});
 assert.equal(pool.calls.length,0);assert.throws(()=>new AuthRepository(pool,{throttleMode:'anything'}),{code:'UNAVAILABLE'});
 await repo.throttle('csrf','127.0.0.1');await repo.throttle('csrf','::ffff:127.0.0.1');assert.equal(pool.calls[0].args[0],pool.calls[1].args[0]);
});
test('explicit hosted mode accepts real proxy peers and rejects missing or header-like identities',async()=>{
 const pool=database(),repo=new SecurityRepository(pool,{throttleMode:'hosted'});
 for(const ip of ['10.0.0.2','::ffff:10.0.0.3','fd00::4'])await repo.throttle('csrf',ip);
 assert.equal(new Set(pool.calls.map(c=>c.args[0])).size,1);
 for(const ip of [undefined,'','client.example','10.0.0.2, 203.0.113.9',{forwardedFor:'127.0.0.1'}])await assert.rejects(repo.throttle('csrf',ip),{code:'FORBIDDEN'});
 await assert.rejects(repo.throttle('unknown','10.0.0.2'),{code:'FORBIDDEN'});assert.equal(pool.calls.length,3);
});
test('changing proxy addresses cannot evade hosted operation limits; development buckets stay separate',async()=>{
 const pool=database(),hosted=new AuthRepository(pool,{throttleMode:'hosted'}),local=new AuthRepository(pool);
 for(const [operation,limit,seconds] of [['login',40,900],['csrf',120,900],['register',20,3600]]){
  for(let i=0;i<limit;i++)await hosted.throttle(operation,'10.0.0.'+(i%250+1));
  await assert.rejects(hosted.throttle(operation,'fd00::999'),{code:'RATE_LIMITED'});
  const call=pool.calls.at(-1);assert.deepEqual(call.args.slice(1),[seconds,limit]);assert.match(call.sql,/ON CONFLICT\(bucket\) DO UPDATE/);
  await local.throttle(operation,'127.0.0.1');assert.notEqual(pool.calls.at(-1).args[0],call.args[0]);
 }
});
