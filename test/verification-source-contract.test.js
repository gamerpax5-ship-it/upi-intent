"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Pool } = require("pg");
const { initDb } = require("../server");
const { initDeviceTables } = require("../lib/device-pairing");
const { initPaymentVerificationTables, recordCreditSms } = require("../lib/payment-verification");
const { initStatementTables, matchImportedTransactions } = require("../lib/statement-match-router");

test("verification sources and replays retain legacy semantics on disposable PostgreSQL", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "These fixtures require the disposable local npm test database");
  const schema = "wpay_source_contract_" + crypto.randomBytes(8).toString("hex");
  const admin = new Pool({ connectionString: url.href });
  const pool = new Pool({ connectionString: url.href, options: "-c search_path=" + schema });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  await admin.query(`create schema "${schema}"`);
  await initDb(pool);
  await initDeviceTables(pool);
  await initPaymentVerificationTables(pool);
  await initStatementTables(pool);
  await pool.query("insert into devices(id,credential_hash,sim_fingerprint_hash) values('synthetic-device','fixture','fixture')");

  async function payment(id, amount, utr) {
    await pool.query(`insert into payment_links(id,upi_uri,amount,created_at,expires_at)
      values($1,'upi://pay?pa=synthetic%40bank',$2,'2026-09-15T05:00:00Z','2026-09-16T05:00:00Z')`, [id, amount]);
    if (utr) await pool.query("insert into payment_claims(payment_id,utr_normalized,utr_display,amount) values($1,$2,$2,$3)", [id, utr, amount]);
  }
  async function statement(id, utr, amount) {
    await pool.query("insert into statement_imports(id,file_hash,file_name) values($1,$2,'synthetic.csv')", [id, crypto.createHash("sha256").update(id).digest("hex")]);
    await pool.query("insert into statement_credit_events(import_id,txn_date,utr_normalized,amount) values($1,'2026-09-15',$2,$3)", [id, utr, amount]);
    return { date: "15/09/2026", txnDate: "2026-09-15", utr, amount, mode: "UPI" };
  }
  async function claim(id) {
    return (await pool.query("select status,verification_source,verified_device_id,verified_at from payment_claims where payment_id=$1", [id])).rows[0];
  }

  await t.test("first exact statement match has bank_statement_upload; repeat is matched but not a new success", async () => {
    await payment("WPSOURCE01", "101.00", "123456789012");
    const row = await statement("STSOURCE1", "123456789012", "101.00");
    const first = await matchImportedTransactions(pool, [row], "STSOURCE1");
    assert.equal(first[0].matchType, "exact_utr_amount");
    assert.equal(first[0].recoveredUtr, false);
    const before = await claim("WPSOURCE01");
    assert.equal(before.verification_source, "bank_statement_upload");
    const second = await matchImportedTransactions(pool, [row], "STSOURCE1");
    assert.equal(second[0].status, "matched");
    assert.deepEqual(await claim("WPSOURCE01"), before);
  });
  await t.test("missing-UTR recovery retains its source when another import replays the same evidence", async () => {
    await payment("WPSOURCE02", "202.00");
    const row = await statement("STSOURCE2", "234567890123", "202.00");
    const first = await matchImportedTransactions(pool, [row], "STSOURCE2");
    assert.equal(first[0].recoveredUtr, true);
    assert.equal(first[0].matchType, "utr_recovered");
    const before = await claim("WPSOURCE02");
    assert.equal(before.verification_source, "bank_statement_missing_utr_recovery");
    await statement("STSOURCE3", row.utr, row.amount);
    const second = await matchImportedTransactions(pool, [row], "STSOURCE3");
    assert.equal(second[0].matchType, "exact_utr_amount");
    assert.equal(second[0].recoveredUtr, false);
    assert.deepEqual(await claim("WPSOURCE02"), before);
    assert.equal((await pool.query("select count(*)::int as n from payment_claims where payment_id='WPSOURCE02'")).rows[0].n, 1);
  });
  await t.test("SMS success followed by statement match does not rewrite original source or verification time", async () => {
    await payment("WPSOURCE03", "303.00", "345678901234");
    const credit = { deviceId: "synthetic-device", utr: "345678901234", amount: "303.00", sender: "SYNTHETIC", accountSuffix: "000001", receivedAt: "2026-09-15T06:00:00Z" };
    assert.equal((await recordCreditSms(pool, credit)).matchedPaymentId, "WPSOURCE03");
    const before = await claim("WPSOURCE03");
    assert.equal(before.verification_source, "paired_device_credit_sms");
    const row = await statement("STSOURCE4", credit.utr, credit.amount);
    assert.equal((await matchImportedTransactions(pool, [row], "STSOURCE4"))[0].status, "matched");
    await recordCreditSms(pool, credit);
    assert.deepEqual(await claim("WPSOURCE03"), before);
    assert.equal((await pool.query("select count(*)::int as n from device_credit_events")).rows[0].n, 1);
  });
});
