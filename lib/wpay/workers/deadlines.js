'use strict';
const {transaction}=require('../db/migrations');
// Uses the same audited, idempotent deadline rules as authenticated API calls.
// No sessions, OTP reads, payment evidence fabrication or Parking approval.
function startDeadlines({pool,payouts,parking,intervalMs=15000,schedule=setInterval,cancel=clearInterval,onError=()=>{}}){
 let stopped=false,running=null;
 const tick=()=>{
  if(stopped||running)return running||Promise.resolve();
  running=transaction(pool,async client=>{
   await client.query("SET LOCAL statement_timeout = '30s'");
   // The existing ledger mutex serializes this with API actions and other replicas.
   await payouts.expire(client);await parking.expire(client);
  }).catch(()=>onError('WPAY_DEADLINE_WORKER_RETRY')).finally(()=>{running=null;});
  return running;
 };
 const timer=schedule(tick,intervalMs);timer.unref?.();
 return {tick,async stop(){stopped=true;cancel(timer);if(running)await running;}};
}
module.exports={startDeadlines};
