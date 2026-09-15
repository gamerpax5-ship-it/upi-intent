"use strict";
const { createPool } = require("../lib/wpay/db/config");
const { validateMigrations } = require("../lib/wpay/db/migrations");
const { SecurityRepository } = require("../lib/wpay/db/security-repository");
const { MfaCrypto, readKey } = require("../lib/wpay/auth/runtime/mfa");
const { AuthService } = require("../lib/wpay/auth/runtime/service");
const { startAuthServer } = require("../lib/wpay/auth/runtime/http");
async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--port" || !/^[1-9][0-9]{0,4}$/.test(args[1]) || Number(args[1]) > 65535)) throw new Error("Invalid port arguments.");
  const mfaCrypto = new MfaCrypto(readKey());
  mfaCrypto.libraries();
  const pool = createPool();
  try {
    await validateMigrations(pool);
    const factors = await pool.query("SELECT account_id, factor_version, encrypted_secret FROM wpay_auth.account_security WHERE enabled=true");
    for (const factor of factors.rows) mfaCrypto.open(factor.encrypted_secret,`wpay-factor:${factor.account_id}:${factor.factor_version}`);
    const server = await startAuthServer({ service: new AuthService(new SecurityRepository(pool), { mfaCrypto, fixedCurrency: process.env.WPAY_AUTH_DEV_FIXED_FEE_CURRENCY }), port: args.length ? Number(args[1]) : 4174 });
    console.log(`WPay development: http://127.0.0.1:${server.address().port}/wpay-auth/ — payments not connected`);
    let stopping = false;
    const stop = () => { if (stopping) return; stopping = true; server.close(() => pool.end().catch(() => {})); server.closeIdleConnections(); };
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    return server;
  } catch (error) { await pool.end(); throw error; }
}
if (require.main === module) main().catch(error => {
  const reason = ["WPAY_SCHEMA_MISSING", "WPAY_SCHEMA_INCOMPATIBLE"].includes(error.message) ? error.message : "WPAY_AUTH_UNAVAILABLE";
  console.error(`${reason}: require a confirmed isolated database with current migrations, the scoped MFA dependencies and the persistent external MFA encryption key.`);
  process.exitCode = 1;
});
module.exports = { main };
