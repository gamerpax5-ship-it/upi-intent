"use strict";
// One WPay bank-identity limit calculation for incoming routing and outgoing jobs.
// A pending outgoing transfer consumes its limit until explicitly resolved.
async function volume(client,bankId,version){
 return (await client.query(`WITH identity AS (SELECT account_key FROM wpay_auth.business_bank_identities WHERE bank_id=$1 AND version=$2)
  SELECT ((SELECT COALESCE(sum(r.amount_minor),0) FROM wpay_auth.business_reservations r JOIN wpay_auth.business_bank_identities i ON i.bank_id=r.bank_id AND i.version=r.bank_version WHERE i.account_key=(SELECT account_key FROM identity) AND r.state='active' AND r.expires_at>CURRENT_TIMESTAMP)+
  (SELECT COALESCE(sum(f.amount_minor),0) FROM wpay_auth.business_financial_events f JOIN wpay_auth.business_reservations r ON r.id=f.reservation_id JOIN wpay_auth.business_bank_identities i ON i.bank_id=r.bank_id AND i.version=r.bank_version WHERE i.account_key=(SELECT account_key FROM identity) AND f.created_at>CURRENT_TIMESTAMP-interval '24 hours')+
  (SELECT COALESCE(sum(p.amount_minor),0) FROM wpay_auth.payout_claims c JOIN wpay_auth.payout_orders p ON p.id=c.payout_id WHERE c.account_key=(SELECT account_key FROM identity) AND ((c.state='active' AND c.expires_at>CURRENT_TIMESTAMP) OR c.state='submitted' OR (c.state='consumed' AND p.completed_at>CURRENT_TIMESTAMP-interval '24 hours'))))::text AS used,
  (SELECT min(v.limit_minor)::text FROM wpay_auth.business_bank_accounts b JOIN wpay_auth.business_bank_versions v ON v.bank_id=b.id AND v.version=b.version JOIN wpay_auth.business_bank_identities i ON i.bank_id=v.bank_id AND i.version=v.version WHERE i.account_key=(SELECT account_key FROM identity) AND NOT b.deactivated) AS shared_limit`,[bankId,version])).rows[0];
}
module.exports={volume};
