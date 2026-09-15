"use strict";
const readline = require("node:readline/promises");
const { createPool } = require("../lib/wpay/db/config");
const { validateMigrations } = require("../lib/wpay/db/migrations");
const { AuthRepository } = require("../lib/wpay/db/auth-repository");
const { AuthService } = require("../lib/wpay/auth/runtime/service");
const { readSecret } = require("../lib/wpay/auth/runtime/secret-input");
async function main() {
  if (process.argv.length !== 2 || !process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Interactive CLI only.");
  const pool = createPool();
  try {
    await validateMigrations(pool);
    const reader = readline.createInterface({ input: process.stdin, output: process.stdout });
    let name, email;
    try { name = await reader.question("Development administrator name: "); email = await reader.question("Development administrator email: "); }
    finally { reader.close(); }
    let password = await readSecret("Password (15–128 characters, input hidden): ");
    let confirmation = await readSecret("Confirm password (input hidden): ");
    try {
      if (password !== confirmation) throw new Error("Passwords differ.");
      await new AuthService(new AuthRepository(pool)).bootstrap({ name, email, password });
      console.log("Development administrator created. Authenticator enrollment is required before application review and approval. Payments are not connected.");
    } finally { password = ""; confirmation = ""; }
  } finally { await pool.end(); }
}
if (require.main === module) main().catch(() => { console.error("Bootstrap failed. Check isolated database configuration, input requirements and whether an administrator already exists. No account or password was replaced."); process.exitCode = 1; });
module.exports = { main };
