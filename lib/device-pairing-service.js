"use strict";

const { createHash, randomInt, timingSafeEqual } = require("node:crypto");
const hash = value => createHash("sha256").update(value).digest("hex");
const devicePattern = /^[A-Za-z0-9._:-]{8,160}$/;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Mounted only at /api/pairing-service. This credential has no dashboard,
// SMS, diagnostics, payment, or device-token API privileges.
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
        if (!fields([])) return res.status(400).json({ error: "Invalid request" });
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("");
          const result = await pool.query(
            "INSERT INTO device_pairings(token_hash) VALUES($1) ON CONFLICT(token_hash) DO NOTHING RETURNING id",
            [hash(code)]
          );
          if (result.rowCount) return res.status(201).json({ pairingCode: code, expiresInSeconds: 600 });
        }
        return res.status(503).json({ error: "Pairing code unavailable" });
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

      if (req.path === "/devices") {
        if (!fields(["ids"]) || !Array.isArray(body.ids) || body.ids.length > 100 ||
            body.ids.some(id => typeof id !== "string" || !devicePattern.test(id))) {
          return res.status(400).json({ error: "Invalid request" });
        }
        if (!body.ids.length) return res.json({ devices: [] });
        const result = await pool.query(
          `SELECT d.id,d.status,d.app_version,d.last_seen_at,
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
