'use strict';
// Authenticated pairing-service metadata only. No credentials or SMS projection.
// Existing (device_id,collected_at DESC) index supports both bounded lookups.
module.exports = `SELECT d.id,d.status,d.app_version,d.last_seen_at,d.phone_e164,d.sim_carrier,d.sim_subscription_label,d.manufacturer,d.model,d.android_version,
 x.battery_level,x.charging,x.network_type,x.carrier,
 g.latitude,g.longitude,g.location_accuracy,g.location_at,
 true AS location_history_checked,
 (g.location_at < now()-interval '2 minutes' OR g.collected_at < x.collected_at OR d.last_seen_at < now()-interval '2 minutes') AS location_last_known,
 x.raw->>'batteryHealth' AS battery_health,
 (x.raw->>'locationPermissionGranted')::boolean AS location_permission,
 (x.raw->>'locationEnabled')::boolean AS location_enabled,
 p.id::text AS latest_pairing,p.claimed_at AS paired_at
 FROM devices d
 LEFT JOIN LATERAL (SELECT id,claimed_at FROM device_pairings WHERE device_id=d.id AND status='claimed' ORDER BY claimed_at DESC,id DESC LIMIT 1) p ON true
 LEFT JOIN LATERAL (SELECT battery_level,charging,network_type,carrier,raw,collected_at FROM device_diagnostics WHERE device_id=d.id ORDER BY collected_at DESC,id DESC LIMIT 1) x ON true
 LEFT JOIN LATERAL (
  SELECT latitude,longitude,location_accuracy,collected_at,
   CASE WHEN raw#>>'{location,capturedAt}' ~ '^[0-9]{13}$' THEN to_timestamp((raw#>>'{location,capturedAt}')::double precision/1000) ELSE collected_at END AS location_at
  FROM device_diagnostics WHERE device_id=d.id AND collected_at>=p.claimed_at AND collected_at<=now()
   AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
   AND (CASE WHEN raw#>>'{location,capturedAt}' ~ '^[0-9]{13}$' THEN to_timestamp((raw#>>'{location,capturedAt}')::double precision/1000) ELSE collected_at END) BETWEEN p.claimed_at AND now()
  ORDER BY collected_at DESC,id DESC LIMIT 1
 ) g ON true
 WHERE d.id=ANY($1::text[])`;
