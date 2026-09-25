"use strict";
const ledger=require('./ledger'),accounting=require('../payouts/accounting');
async function overview(c,userId){
 const capacity=await ledger.summary(c,userId);
 let commission=null;try{commission=await accounting.entitlement(c,userId);}catch(e){if(e.code!=='UNAVAILABLE')throw e;}
 const payins=(await c.query(`SELECT count(*)::int AS total,
 count(*) FILTER(WHERE o.state='successful')::int AS successful,
 count(*) FILTER(WHERE o.state='failed')::int AS failed,
 count(*) FILTER(WHERE o.state IN('pending_payment','verification_pending'))::int AS pending,
 count(*) FILTER(WHERE (o.created_at AT TIME ZONE 'Asia/Kolkata')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)::int AS today_orders,
 COALESCE(sum(o.amount_minor) FILTER(WHERE o.state='successful'),0)::text AS volume,
 COALESCE(sum(o.amount_minor) FILTER(WHERE o.state='successful' AND (o.paid_at AT TIME ZONE 'Asia/Kolkata')::date=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),0)::text AS today_volume
 FROM wpay_auth.gateway_orders o JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id WHERE r.user_id=$1`,[userId])).rows[0];
 const payouts=(await c.query(`SELECT count(*) FILTER(WHERE cl.state='consumed')::int AS successful,
 count(*) FILTER(WHERE cl.state='submitted')::int AS review,
 COALESCE(sum(p.amount_minor) FILTER(WHERE cl.state='consumed'),0)::text AS volume
 FROM wpay_auth.payout_claims cl JOIN wpay_auth.payout_orders p ON p.id=cl.payout_id WHERE cl.user_id=$1`,[userId])).rows[0];
 const parking=(await c.query("SELECT COALESCE(sum(amount_minor) FILTER(WHERE state='completed'),0)::text AS volume,COALESCE(sum(amount_minor) FILTER(WHERE state IN('active','cooldown','submitted','review','disputed')),0)::text AS locked FROM wpay_auth.parking_locks WHERE user_id=$1",[userId])).rows[0];
 const deposits=(await c.query("SELECT COALESCE(sum(floor(credit_minor*10000000000/((snapshot->>'rate')::numeric*1000000))) FILTER(WHERE state='confirmed'),0)::text AS usdt_minor,count(*) FILTER(WHERE state IN('requested','detected','confirming','review'))::int AS pending FROM wpay_auth.funding_requests WHERE owner_id=$1",[userId])).rows[0];
 const banks=(await c.query("SELECT b.id,b.status,b.frozen,b.deactivated,v.details->>'upiId' AS upi_id,v.details->>'bankName' AS bank_name FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version WHERE b.owner_id=$1 ORDER BY b.created_at DESC LIMIT 100",[userId])).rows;
 const trend=(await c.query(`SELECT to_char(day,'YYYY-MM-DD') AS day,sum(payin)::text AS payin,sum(payout)::text AS payout FROM (
 SELECT (o.paid_at AT TIME ZONE 'Asia/Kolkata')::date AS day,o.amount_minor AS payin,0::numeric AS payout FROM wpay_auth.gateway_orders o JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id WHERE r.user_id=$1 AND o.state='successful' AND o.paid_at>=CURRENT_TIMESTAMP-interval '7 days'
 UNION ALL SELECT (p.completed_at AT TIME ZONE 'Asia/Kolkata')::date,0,p.amount_minor FROM wpay_auth.payout_orders p JOIN wpay_auth.payout_claims cl ON cl.payout_id=p.id WHERE cl.user_id=$1 AND cl.state='consumed' AND p.completed_at>=CURRENT_TIMESTAMP-interval '7 days'
 ) x GROUP BY day ORDER BY day`,[userId])).rows;
 const recent=(await c.query(`SELECT o.reference,o.amount_minor::text,o.state,to_char(o.created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS date,v.details->>'upiId' AS upi_id
 FROM wpay_auth.gateway_orders o JOIN wpay_auth.business_reservations r ON r.id=o.reservation_id JOIN wpay_auth.business_bank_versions v ON v.bank_id=r.bank_id AND v.version=r.bank_version WHERE r.user_id=$1 ORDER BY o.created_at DESC,o.id LIMIT 5`,[userId])).rows;
 return {collectionAccess:await require('./collection-policy').access(c,userId),capacity,commission,payins,payouts,parking,deposits,banks,trend,recent,totalVolumeMinor:(BigInt(payins.volume)+BigInt(payouts.volume)+BigInt(parking.volume)).toString(),timezone:'Asia/Kolkata'};
}
module.exports={overview};
