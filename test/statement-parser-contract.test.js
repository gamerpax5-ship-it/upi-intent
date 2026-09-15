"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const XLSX = require("../public/vendor/smart-upi-parser-runtime/xlsx.full.min.js");

// Synthetic statement data only. Execute the existing browser entry point unchanged.
function parser() {
  const context = { window: { XLSX }, document: { readyState: "complete", getElementById: () => null } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../public/statement-parser.js"), "utf8"), context);
  return context.window.WPAYStatementParser.parseStatement;
}
const rows = [
  ["Date", "Narration", "Debit", "Credit", "Balance"],
  ["15/09/2026", "UPI/123456789012 received", "", "1,250.50", "2,250.50"],
  ["15/09/2026", "UPI/123456789012 received", "", "1,250.50", "2,250.50"],
  ["15/09/2026", "UPI/234567890123 paid", "50.00", "", "2,200.50"],
  ["15/09/2026", "NEFT/345678901234 received", "", "70.00", "2,270.50"],
  ["15/09/2026", "UPI/45678901234 received", "", "80.00", "2,350.50"]
];
for (const extension of ["csv", "xls", "xlsx"]) {
  test(`statement parser: ${extension} preserves exact credit extraction and deduplication`, async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Synthetic");
    const bytes = XLSX.write(book, { type: "buffer", bookType: extension === "xls" ? "biff8" : extension });
    const name = `synthetic.${extension}`;
    const result = await parser()({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    assert.deepEqual(JSON.parse(JSON.stringify(result)), { transactions: [{ date: "15/09/2026", utr: "123456789012", amount: "1250.50", mode: "UPI" }], rowsScanned: 6, fileName: name });
  });
}
test("statement parser: unsupported input rejected before file access", async () => {
  await assert.rejects(parser()({ name: "synthetic.txt", arrayBuffer: async () => { throw new Error("must not read"); } }), /Unsupported file type/);
});
