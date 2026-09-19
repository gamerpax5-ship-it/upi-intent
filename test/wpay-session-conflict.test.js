'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {AuthRepository}=require('../lib/wpay/db/auth-repository');
function fixture(rows){const log=[];let snapshot=0;return {log,repository:new AuthRepository({connect:async()=>({query:async sql=>{log.push(sql);if(sql.startsWith('SELECT a.id'))return {rows:rows[Math.min(snapshot++,rows.length-1)]};return {rows:[]};},release:()=>log.push('RELEASE')})})};}
const conflict=()=>Object.assign(new Error('synthetic serialization conflict'),{code:'40001'});
test('whole-session retry rolls back and reads the new principal before repeating transactional work',async()=>{
 const f=fixture([[{version:1}],[{version:2}]]),seen=[];
 const result=await f.repository.withSession('synthetic',async(_,row)=>{seen.push(row.version);if(row.version===1)throw conflict();return row.version;});
 assert.equal(result,2);assert.deepEqual(seen,[1,2]);assert.equal(f.log.filter(x=>x==='ROLLBACK').length,1);assert.equal(f.log.filter(x=>x==='COMMIT').length,1);assert.equal(f.log.filter(x=>x==='RELEASE').length,2);
});
test('revoked session after conflict denies before action; policy failures never retry',async()=>{
 const f=fixture([[{version:1}],[]]);let calls=0;await assert.rejects(f.repository.withSession('synthetic',async()=>{calls++;throw conflict();}),e=>e.code==='AUTH_FAILED');assert.equal(calls,1);
 const g=fixture([[{}]]);let denied=0;await assert.rejects(g.repository.withSession('synthetic',async()=>{denied++;throw Object.assign(new Error('denied'),{code:'FORBIDDEN'});}),e=>e.code==='FORBIDDEN');assert.equal(denied,1);
});
test('persistent serialization failure remains bounded to three rolled-back attempts',async()=>{
 const f=fixture([[{}]]);let calls=0;await assert.rejects(f.repository.withSession('synthetic',async()=>{calls++;throw conflict();}),e=>e.code==='40001');assert.equal(calls,3);assert.equal(f.log.filter(x=>x==='COMMIT').length,0);assert.equal(f.log.filter(x=>x==='ROLLBACK').length,3);
});
