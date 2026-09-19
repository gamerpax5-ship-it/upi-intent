'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createServer}=require('../scripts/serve-wpay-maintenance');
test('staging maintenance stays live while denying readiness and every application operation',async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{const health=await fetch(origin+'/maintenance_healthz');assert.equal(health.status,200);assert.deepEqual(await health.json(),{maintenance:true});for(const [route,method]of [['/readyz','GET'],['/admin','GET'],['/wpay-auth/roles/user/login','POST'],['/wpay-api/v1/orders','POST']]){const r=await fetch(origin+route,{method});assert.equal(r.status,503);assert.equal((await r.json()).ready,false);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.has('set-cookie'),false);}}
 finally{await new Promise(r=>{server.close(r);server.closeAllConnections();});}
});
