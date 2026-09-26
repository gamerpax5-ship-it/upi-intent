"use strict";

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
    return devices.map(device => ({
      ...device,
      linked: device.status === "active" && links.some(link =>
        link.device_ref === device.id && (link.pairing_id
          ? link.pairing_id === device.latest_pairing
          : device.paired_at && +new Date(device.paired_at) <= +new Date(link.authority_at))
      )
    }));
  }
}

function configuredPairingService(env = process.env) {
  if (!env.WPAY_PAIRING_SERVICE_ORIGIN && !env.WPAY_PAIRING_SERVICE_KEY) return null;
  return new PairingService({ origin: env.WPAY_PAIRING_SERVICE_ORIGIN, key: env.WPAY_PAIRING_SERVICE_KEY });
}

module.exports = { PairingService, configuredPairingService };

