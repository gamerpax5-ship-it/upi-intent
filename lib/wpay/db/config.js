"use strict";
const fs = require("node:fs");
const { Pool } = require("pg");
const { AuthError } = require("../auth/runtime/errors");
function readConfig(env = process.env) {
  try {
    if (!env.WPAY_AUTH_DEV_DATABASE_URL) throw 0;
    const url = new URL(env.WPAY_AUTH_DEV_DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hash || url.search || !url.username || !url.password) throw 0;
    const database = decodeURIComponent(url.pathname.slice(1));
    const host = url.hostname;
    const local = ["127.0.0.1", "[::1]"].includes(host);
    const project = env.WPAY_AUTH_DEV_SUPABASE_PROJECT;
    const direct = /^[a-z]{20}$/.test(project || "") && host === `db.${project}.supabase.co`;
    const pooler = /^[a-z]{20}$/.test(project || "") && /^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) &&
      decodeURIComponent(url.username) === `postgres.${project}`;
    const target = local ? `${host}:${url.port || "5432"}/${database}` : `supabase:${project}`;
    if (!/^[a-zA-Z0-9_]{1,63}$/.test(database) || (!local && !direct && !pooler) ||
        env.WPAY_AUTH_DEV_ISOLATED_CONFIRM !== target) throw 0;
    const port = Number(url.port || 5432);
    if (!Number.isInteger(port) || port < 1 || port > 65535 || (!local && port !== 5432)) throw 0;
    const ssl = local ? false : { rejectUnauthorized: true, ...(env.WPAY_AUTH_DEV_CA_FILE ? { ca: fs.readFileSync(env.WPAY_AUTH_DEV_CA_FILE, "utf8") } : {}) };
    return { host: host.replace(/^\[|\]$/g, ""), port, database, user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password), ssl, max: 4, connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000, statement_timeout: 5000, options: "-c search_path=pg_catalog",
      application_name: "wpay-auth-development" };
  } catch { throw new AuthError("UNAVAILABLE"); }
}
function createPool(env) {
  const pool = new Pool(readConfig(env));
  pool.on("error", () => {}); // Failed queries still fail closed; never log connection details.
  return pool;
}
module.exports = { readConfig, createPool };
