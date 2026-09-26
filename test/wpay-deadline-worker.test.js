'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {startDeadlines}=require('../lib/wpay/workers/deadlines');
test('deadline worker runs without page traffic, prevents overlapping runs and drains before shutdown',async()=>{
 const queries=[];let release,entered,cleared=false,returned=false;const inside=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 const client={query:async sql=>{queries.push(sql);},release:()=>{returned=true;}};
 const worker=startDeadlines({pool:{connect:async()=>client},payouts:{expire:async()=>{entered();await hold;queries.push('payout');}},parking:{expire:async()=>queries.push('parking')},schedule:()=>({unref(){}}),cancel:()=>{cleared=true;}});
 const a=worker.tick();await inside;const b=worker.tick();assert.equal(a,b);const stop=worker.stop();assert.equal(cleared,true);assert.equal(returned,false);release();await stop;assert.equal(returned,true);assert.equal(queries.filter(x=>x==='BEGIN').length,1);assert.ok(queries.indexOf('parking')<queries.indexOf('COMMIT'));await worker.tick();assert.equal(queries.filter(x=>x==='BEGIN').length,1);
});
test('deadline errors rollback, expose no sensitive details and retry next tick',async()=>{
 const queries=[],errors=[];let attempts=0;
 const worker=startDeadlines({pool:{connect:async()=>({query:async s=>queries.push(s),release(){}})},payouts:{expire:async()=>{if(++attempts===1)throw Error('sensitive-database-details');}},parking:{expire:async()=>{}},schedule:()=>({}),cancel(){},onError:code=>errors.push(code)});
 await worker.tick();assert.ok(queries.includes('ROLLBACK'));assert.deepEqual(errors,['WPAY_DEADLINE_WORKER_RETRY']);await worker.tick();assert.ok(queries.includes('COMMIT'));assert.equal(attempts,2);await worker.stop();
});
