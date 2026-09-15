"use strict";
const { createPool } = require("../lib/wpay/db/config");
const { migrate } = require("../lib/wpay/db/migrations");
async function main() {
  if (process.argv.length !== 2) throw new Error("Unexpected arguments.");
  const pool = createPool();
  try { console.log(`WPay development migration: ${await migrate(pool)}.`); }
  finally { await pool.end(); }
}
if (require.main === module) main().catch(() => { console.error("WPay migration unavailable: verify isolated-target confirmation, connection, and compatible schema. No connection details are printed."); process.exitCode = 1; });
module.exports = { main };
