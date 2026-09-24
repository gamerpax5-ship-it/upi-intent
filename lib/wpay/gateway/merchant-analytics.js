'use strict';
const {AuthError}=require('../auth/runtime/errors');
// Caller has already enforced Merchant ownership and gateway permission.
async function analytics(client,merchantId,body={}) {
 if(!body||Object.keys(body).some(k=>k!=='days')||![1,7,30].includes(body.days))throw new AuthError('INVALID_INPUT');
 const params=[merchantId,body.days];
 const condition="merchant_id=$1 AND created_at >= CURRENT_TIMESTAMP-($2::int*interval '1 day')";
 const channels=(await client.query(`SELECT origin,count(*)::int AS total,count(*) FILTER(WHERE state='successful')::int AS successful,count(*) FILTER(WHERE state IN('pending_payment','verification_pending','recovery_review'))::int AS pending,count(*) FILTER(WHERE state='failed')::int AS failed,count(*) FILTER(WHERE state='expired')::int AS expired,COALESCE(sum(amount_minor) FILTER(WHERE state='successful'),0)::text AS volume FROM wpay_auth.gateway_orders WHERE ${condition} GROUP BY origin ORDER BY origin`,params)).rows;
 const days=(await client.query(`SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS day,COALESCE(sum(amount_minor) FILTER(WHERE state='successful'),0)::text AS volume,count(*) FILTER(WHERE state='successful')::int AS successful FROM wpay_auth.gateway_orders WHERE ${condition} GROUP BY 1 ORDER BY 1`,params)).rows;
 return {channels,days,windowDays:body.days,timeZone:'Asia/Kolkata'};
}
module.exports={analytics};
