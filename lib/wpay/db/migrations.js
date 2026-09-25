"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const sha = value => createHash("sha256").update(value).digest("hex");
const migrationPaths = ["001_auth.sql", "002_approval_mfa.sql", "003_runtime_role.sql", "004_resource_links.sql", "005_unscoped_admin.sql", "006_business_core.sql", "007_business_correctness.sql", "008_usdt_funding.sql", "009_funding_runtime_visibility.sql", "010_funding_snapshot_guards.sql", "011_upi_statement_onboarding.sql", "012_merchant_gateway.sql", "013_payout_operations.sql", "014_operational_access.sql", "015_panel_completion.sql", "016_internal_completion.sql", "017_live_user_merchant_workflows.sql", "018_runtime_visibility.sql", "019_admin_password_sessions.sql", "020_admin_upi_routing.sql", "021_optional_customer_authenticator.sql", "022_admin_expenses.sql", "023_admin_utr_approval.sql", "024_payout_approval_deadlines.sql"].map(file => path.join(__dirname, "../../../migrations/wpay-auth", file));
const LOCK = 57415905;
async function transaction(pool, action) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}
async function fingerprint(client) {
  // Version 15 uses a total policy order. Keep the historical algorithm intact
  // while validating 001-014, including during a real upgrade.
  const completion=(await client.query("SELECT pg_catalog.to_regclass('wpay_auth.password_reset_challenges') AS relation")).rows[0].relation;
  // Include schema objects, column definitions, constraints, indexes, RLS,
  // policies and ACLs; data and physical OIDs are deliberately excluded.
  const result = await client.query(`SELECT
    (SELECT jsonb_agg(x ORDER BY x.table_name,x.ordinal_position) FROM
      (SELECT table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
       FROM information_schema.columns WHERE table_schema='wpay_auth') x) AS columns,
    (SELECT jsonb_agg(x ORDER BY x.relname) FROM
      (SELECT c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text
       FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='wpay_auth') x) AS relations,
    (SELECT jsonb_agg(x ORDER BY x.conname) FROM
      (SELECT c.conname,pg_catalog.pg_get_constraintdef(c.oid) AS definition
       FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='wpay_auth') x) AS constraints,
    (SELECT jsonb_agg(x ORDER BY x.indexname) FROM
      (SELECT indexname,indexdef FROM pg_catalog.pg_indexes WHERE schemaname='wpay_auth') x) AS indexes,
    (SELECT jsonb_agg(x ORDER BY ${completion?'x.tablename,x.policyname':'x.policyname'}) FROM
      (SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_catalog.pg_policies WHERE schemaname='wpay_auth') x) AS policies,
    (SELECT jsonb_agg(p.proname ORDER BY p.proname) FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='wpay_auth') AS functions,
    (SELECT n.nspacl::text FROM pg_catalog.pg_namespace n WHERE n.nspname='wpay_auth') AS schema_acl`);
  // Preserve versions 1–5 fingerprints; version 6 also seals trigger/function definitions.
  if ((await client.query("SELECT pg_catalog.to_regclass('wpay_auth.business_mutex') AS relation")).rows[0].relation) {
    const guards=await client.query(`SELECT
      (SELECT jsonb_agg(x ORDER BY x.name) FROM (SELECT p.proname AS name,pg_catalog.pg_get_functiondef(p.oid) AS definition,p.proacl::text AS acl
       FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='wpay_auth') x) AS functions,
      (SELECT jsonb_agg(x ORDER BY x.table_name,x.name) FROM (SELECT c.relname AS table_name,t.tgname AS name,t.tgenabled,pg_catalog.pg_get_triggerdef(t.oid) AS definition
       FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='wpay_auth' AND NOT t.tgisinternal) x) AS triggers`);
    result.rows[0].business_guards=guards.rows[0];
  }
  return sha(JSON.stringify(result.rows[0]));
}
async function visibilityCounts(client){
  const result=await client.query(`SELECT
    (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='wpay_auth') AS columns,
    (SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='wpay_auth') AS relations,
    (SELECT count(*)::int FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='wpay_auth') AS constraints,
    (SELECT count(*)::int FROM pg_catalog.pg_indexes WHERE schemaname='wpay_auth') AS indexes,
    (SELECT count(*)::int FROM pg_catalog.pg_policies WHERE schemaname='wpay_auth') AS policies,
    (SELECT count(*)::int FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='wpay_auth') AS functions,
    (SELECT count(*)::int FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='wpay_auth' AND NOT t.tgisinternal) AS triggers`);
  return result.rows[0];
}
async function validate(client, checksums, required = true) {
  let history;
  try { history = await client.query("SELECT version, checksum, schema_fingerprint FROM wpay_auth.schema_migrations ORDER BY version"); }
  catch (error) { if (["42P01", "3F000"].includes(error.code)) throw new Error("WPAY_SCHEMA_MISSING"); throw error; }
  if (!history.rowCount || history.rowCount > checksums.length || (required && history.rowCount !== checksums.length) ||
      history.rows.some((row, index) => row.version !== index + 1 || row.checksum !== checksums[index]) ||
      history.rows.at(-1).schema_fingerprint !== await fingerprint(client)) throw new Error("WPAY_SCHEMA_INCOMPATIBLE");
  return history.rowCount;
}
async function validateMigrations(pool) {
  const checksums = await Promise.all(migrationPaths.map(async file => sha(await fs.readFile(file))));
  await transaction(pool, async client => {
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock($1)", [LOCK]);
    await validate(client, checksums);
  });
}
async function migrate(pool, { through = migrationPaths.length } = {}) {
  if (!Number.isInteger(through) || through < 1 || through > migrationPaths.length) throw new Error("WPAY_MIGRATION_TARGET_INVALID");
  const sql = await Promise.all(migrationPaths.slice(0, through).map(file => fs.readFile(file)));
  const checksums = sql.map(sha);
  return transaction(pool, async client => {
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock($1)", [LOCK]);
    const existing = await client.query("SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=$1", ["wpay_auth"]);
    const completed = existing.rowCount ? await validate(client, checksums, false) : 0;
    if (completed === sql.length) return "already-applied";
    for (let index = completed; index < sql.length; index++) {
      await client.query(sql[index].toString("utf8"));
      await client.query("INSERT INTO wpay_auth.schema_migrations(version,checksum,schema_fingerprint) VALUES ($1,$2,$3)", [index + 1, checksums[index], await fingerprint(client)]);
    }
    return "applied";
  });
}
module.exports = { transaction, migrate, validateMigrations, fingerprint, visibilityCounts };
