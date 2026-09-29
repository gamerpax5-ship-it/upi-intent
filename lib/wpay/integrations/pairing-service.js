"use strict";
const { coordinates } = require('./device-metadata');

// A pairing-only HTTPS adapter; it cannot read OTP/SMS events.
class PairingService {
  constructor({ origin, key, fetchImpl = fetch, allowLoopback = false }) {
    const url = new URL(origin);
    const loopback = allowLoopback && url.protocol === "http:" &&
      ["127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.origin !== origin || url.username || url.password ||
        (url.protocol !== "https:" && !loopback) ||
        typeof key !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(key)) {
      throw new Error("Invalid pairing service configuration");
    }
    this.origin = origin;
    this.key = key;
    this.fetch = fetchImpl;
    this.sourceId = "legacy-primary";
    this.devicesIncludesReadiness = true;
  }

  async request(path, body) {
    try {
      const response = await this.fetch(this.origin + "/api/pairing-service/" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { authorization: "Bearer " + this.key, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch (_error) {
      // Preserve the existing public error contract without exposing secrets.
      const { AuthError } = require("../auth/runtime/errors");
      throw new AuthError("OTP_SOURCE_UNAVAILABLE");
    }
  }

  async ready() {
    try { return (await this.request("ready")).ready === true; }
    catch { return false; }
  }

  async issue({ttlSeconds=600}={}) {
    if(![600,86400].includes(ttlSeconds))throw new Error("Invalid pairing expiry");
    const body = await this.request("issue", ttlSeconds===600?{}:{ttlSeconds});
    if (!/^[A-Z2-9]{8}$/.test(body.pairingCode) || body.expiresInSeconds !== ttlSeconds) {
      throw new Error("Invalid pairing service response");
    }
    return body.pairingCode;
  }

  async revoke(digest) {
    if(typeof digest!=="string"||!/^[a-f0-9]{64}$/.test(digest))throw new Error("Invalid pairing digest");
    const r=await this.request("revoke",{digest});if(r.revoked!==true)throw new Error("Pairing revocation unavailable");return r;
  }

  async diagnostics(id,from) {
    const result=await this.request("diagnostics",{id,from:new Date(from).toISOString()});if(!Array.isArray(result.diagnostics)||result.diagnostics.length>577)throw new Error("Invalid diagnostics response");return result.diagnostics;
  }

  async pairing(digest) {
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error("Invalid pairing digest");
    }
    const proof = (await this.request("proof", { digest })).pairing;
    if (proof === null) return null;
    if (!proof || typeof proof.id !== "string" || !/^[0-9]+$/.test(proof.id)) {
      throw new Error("Invalid pairing service response");
    }
    // The existing SQL adapter returns Date objects. Preserve that contract:
    // ownership checks use numeric comparisons on expires_at/claimed_at.
    for (const name of ["created_at", "expires_at", "claimed_at"]) {
      if (name === "claimed_at" && proof[name] === null) continue;
      const date = new Date(proof[name]);
      if (typeof proof[name] !== "string" || !Number.isFinite(+date)) {
        throw new Error("Invalid pairing service timestamp");
      }
      proof[name] = date;
    }
    return proof;
  }

  async devices(links) {
    if (!Array.isArray(links) || links.length > 100) throw new Error("Invalid device scope");
    if (!links.length) return [];
    const { devices } = await this.request("devices", { ids: links.map(link => link.device_ref) });
    if (!Array.isArray(devices)) throw new Error("Invalid pairing service response");
    const normalized = devices.filter(device => links.some(link => link.device_ref === device.id)).map(device => ({
      ...device,
      // Normalize the main pairing service's legacy aliases into the hosted
      // Admin metadata contract.
      carrier: device.carrier ?? device.network_carrier ?? device.sim_carrier ?? null,
      sim_name: device.sim_name ?? device.sim_subscription_label ?? null,
      battery_health: device.battery_health ?? device.raw?.batteryHealth ?? null,
      location_permission: typeof device.location_permission === "boolean"
        ? device.location_permission
        : typeof device.raw?.locationPermissionGranted === "boolean"
          ? device.raw.locationPermissionGranted
          : null,
      location_enabled: typeof device.location_enabled === "boolean"
        ? device.location_enabled
        : typeof device.raw?.locationEnabled === "boolean"
          ? device.raw.locationEnabled
          : null,
      location_label: coordinates(device) ? `${coordinates(device).latitude.toFixed(5)}, ${coordinates(device).longitude.toFixed(5)}` : null,
      linked: device.status === "active" && links.some(link =>
        link.device_ref === device.id && (link.pairing_id
          ? link.pairing_id === device.latest_pairing
          : device.paired_at && +new Date(device.paired_at) <= +new Date(link.authority_at))
      )
    }));
    // A heartbeat without a GPS fix must not erase the last reported location.
    // Only read history within this current ownership/pairing interval, and label
    // historical fixes with their own timestamp (never with the heartbeat time).
    for (const device of normalized) {
      if (device.location_history_checked !== true) continue;
      const link = links.find(link => link.device_ref === device.id), at = Date.parse(device.location_at);
      const start = Math.max(+new Date(link.valid_from), +new Date(device.paired_at || link.valid_from));
      if (!device.linked || !Number.isFinite(at) || !Number.isFinite(start) || at < start || at > Date.now()) {
        device.latitude = device.longitude = device.location_label = device.location_at = null;
        device.location_last_known = false;
      }
    }
    const pending = normalized.filter(device => device.linked && !coordinates(device) && device.location_history_checked !== true);
    let index = 0;
    const deadline = Date.now() + 5000;
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
      while (index < pending.length) {
        const device = pending[index++], link = links.find(link => link.device_ref === device.id);
        if (Date.now() >= deadline) { device.location_source_unavailable = true; continue; }
        const now = Date.now(), start = Math.max(+new Date(link.valid_from), +new Date(device.paired_at || link.valid_from), now - 48 * 3600000);
        if (!Number.isFinite(start) || start > now) continue;
        try {
          const history = await this.diagnostics(device.id, new Date(start));
          const latest = history.filter(h => coordinates(h) && +new Date(h.collected_at) >= start && +new Date(h.collected_at) <= now)
            .sort((a, b) => +new Date(b.collected_at) - +new Date(a.collected_at))[0];
          if (latest) Object.assign(device, coordinates(latest), {
            location_label: `${coordinates(latest).latitude.toFixed(5)}, ${coordinates(latest).longitude.toFixed(5)}`,
            location_at: new Date(latest.collected_at).toISOString(), location_last_known: true
          });
        } catch { device.location_source_unavailable = true; }
      }
    }));
    return normalized;
  }
}

function configuredPairingService(env = process.env) {
  if (!env.WPAY_PAIRING_SERVICE_ORIGIN && !env.WPAY_PAIRING_SERVICE_KEY) return null;
  return new PairingService({ origin: env.WPAY_PAIRING_SERVICE_ORIGIN, key: env.WPAY_PAIRING_SERVICE_KEY });
}

module.exports = { PairingService, configuredPairingService };

