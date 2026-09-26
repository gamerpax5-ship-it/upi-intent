"use strict";

const { createHash, randomInt, timingSafeEqual } = require("node:crypto");
const hash = value => createHash("sha256").update(value).digest("hex");
const devicePattern = /^[A-Za-z0-9._:-]{8,160}$/;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Mounted only at /api/pairing-service. This credential has no dashboard,
// SMS, payment or device-token API privileges. Device diagnostics are metadata-only.
function createPairingService({ pool, env = process.env }) {
  return async function pairingService(req, res, next) {
    res.set("Cache-Control", "no-store");
    const key = env.WPAY_PAIRING_SERVICE_KEY;
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(key)) {
      return res.status(503).json({ error: "Pairing service is not configured" });
    }
    const supplied = String(req.get("authorization") || "");
    if (!timingSafeEqual(Buffer.from(hash(supplied)), Buffer.from(hash("Bearer " + key)))) {
      return res.status(401).json({ error: "Pairing service authentication required" });
    }
    if (!pool) return res.status(503).json({ error: "Pairing database unavailable" });

    try {
      if (req.method === "GET" && req.path === "/ready") {
        await pool.query("SELECT id FROM device_pairings LIMIT 0");
        await pool.query("SELECT id, status, app_version, last_seen_at FROM devices LIMIT 0");
        return res.json({ ready: true });
      }
      if (req.method !== "POST") return res.status(404).json({ error: "Not found" });
      const body = req.body;
      const fields = allowed => body && Object.getPrototypeOf(body) === Object.prototype &&
        Object.keys(body).every(name => allowed.includes(name));

      if (req.path === "/issue") {
        if (!fields(["ttlSeconds"]) || (body.ttlSeconds !== undefined && ![600,86400].includes(body.ttlSeconds))) return res.status(400).json({ error: "Invalid request" });
        const ttlSeconds=body.ttlSeconds ?? 600;
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
          const result = await pool.query(
            "INSERT INTO device_pairings(token_hash,expires_at) VALUES($1,now()+($2*interval '1 second')) ON CONFLICT(token_hash) DO NOTHING RETURNING id",
            [hash(code),ttlSeconds]
          );
          if (result.rowCount) return res.status(201).json({ pairingCode: code, expiresInSeconds: ttlSeconds });
        }
        return res.status(503).json({ error: "Pairing code unavailable" });
      }

      if (req.path === "/revoke") {
        if (!fields(["digest"]) || typeof body.digest !== "string" || !/^[a-f0-9]{64}$/.test(body.digest)) return res.status(400).json({error:"Invalid request"});
        const result=await pool.query("UPDATE device_pairings SET status='revoked' WHERE token_hash=$1 AND status='pending' RETURNING id",[body.digest]);
        if(result.rowCount)return res.json({revoked:true});
        const existing=await pool.query("SELECT status FROM device_pairings WHERE token_hash=$1",[body.digest]);
        return existing.rows[0]?.status==='revoked'?res.json({revoked:true}):res.status(409).json({error:"Pairing already used or unavailable"});
      }

      if (req.path === "/proof") {
        if (!fields(["digest"]) || typeof body.digest !== "string" || !/^[a-f0-9]{64}$/.test(body.digest)) {
          return res.status(400).json({ error: "Invalid request" });
        }
        const result = await pool.query(
          `SELECT p.id::text, p.status, p.device_id, p.created_at, p.expires_at,
             p.claimed_at, d.status AS device_status,
             (SELECT x.id::text FROM device_pairings x
              WHERE x.device_id=p.device_id AND x.status='claimed'
              ORDER BY x.claimed_at DESC,x.id DESC LIMIT 1) AS latest_pairing
           FROM device_pairings p LEFT JOIN devices d ON d.id=p.device_id
           WHERE p.token_hash=$1 LIMIT 1`, [body.digest]
        );
        // Fixed SQL projection: no credentials or SMS content.
        return res.json({ pairing: result.rows[0] || null });
      }

      if (req.path === "/diagnostics") {
        if (!fields(["id","from"]) || typeof body.id!=="string" || !devicePattern.test(body.id) || typeof body.from!=="string" || !Number.isFinite(Date.parse(body.from))) return res.status(400).json({error:"Invalid request"});
        const result=await pool.query(`SELECT DISTINCT ON(floor(extract(epoch FROM collected_at)/300))
          battery_level,charging,network_type,carrier,latitude,longitude,location_accuracy,collected_at,
          raw->>'batteryHealth' AS battery_health,raw->'locationPermissionGranted' AS location_permission,raw->'locationEnabled' AS location_enabled
          FROM device_diagnostics WHERE device_id=$1 AND collected_at>=GREATEST($2::timestamptz,now()-interval '48 hours') AND collected_at<=now()
          ORDER BY floor(extract(epoch FROM collected_at)/300) DESC,collected_at DESC,id DESC LIMIT 577`,[body.id,body.from]);
        return res.json({diagnostics:result.rows});
      }

      if (req.path === "/devices") {
        if (!fields(["ids"]) || !Array.isArray(body.ids) || body.ids.length > 100 ||
            body.ids.some(id => typeof id !== "string" || !devicePattern.test(id))) {
          return res.status(400).json({ error: "Invalid request" });
        }
        if (!body.ids.length) return res.json({ devices: [] });
        const result = await pool.query(
          `SELECT d.id,d.status,d.app_version,d.last_seen_at,d.phone_e164,d.sim_carrier,d.sim_subscription_label,d.manufacturer,d.model,d.android_version,
             (SELECT p.id::text FROM device_pairings p
              WHERE p.device_id=d.id AND p.status='claimed'
              ORDER BY p.claimed_at DESC,p.id DESC LIMIT 1) AS latest_pairing,
             (SELECT p.claimed_at FROM device_pairings p
              WHERE p.device_id=d.id AND p.status='claimed'
              ORDER BY p.claimed_at DESC,p.id DESC LIMIT 1) AS paired_at
           FROM devices d WHERE d.id=ANY($1::text[])`, [body.ids]
        );
        return res.json({ devices: result.rows });
      }
      return res.status(404).json({ error: "Not found" });
    } catch (_error) {
      // Never echo database errors or request bodies to clients/logs.
      return res.status(503).json({ error: "Pairing service unavailable" });
    }
  };
}

module.exports = { createPairingService };

