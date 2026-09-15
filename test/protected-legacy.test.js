"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const protection = require("../scripts/check-protected-legacy");

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, "wpay-protection-fixture-"));
  t.after(() => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith("wpay-protection-fixture-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, "lib"));
  const bytes = Buffer.from([0, 1, 13, 10, 255]);
  const file = path.join(root, "lib", "sample.bin");
  fs.writeFileSync(file, bytes);
  const manifest = { schemaVersion: 1, algorithm: "sha256", baselineCommit: "a".repeat(40),
    files: [{ path: "lib/sample.bin", bytes: bytes.length, sha256: protection.digest(bytes) }] };
  return { root, file, manifest };
}

test("protection: exact binary bytes pass and separate additions are allowed", t => {
  const { root, manifest } = fixture(t);
  fs.writeFileSync(path.join(root, "new-module.txt"), "fixture");
  assert.deepEqual(protection.verifyProtectedTree(root, manifest).errors, []);
});
test("protection: same-size mutation fails without changing the baseline", t => {
  const { root, file, manifest } = fixture(t);
  const before = JSON.stringify(manifest);
  fs.writeFileSync(file, Buffer.from([0, 2, 13, 10, 255]));
  assert.match(protection.verifyProtectedTree(root, manifest).errors[0], /bytes changed/);
  assert.equal(JSON.stringify(manifest), before);
});
for (const action of ["delete", "move", "case-rename", "directory"]) {
  test(`protection: ${action} fails on temporary fixtures`, t => {
    const { root, file, manifest } = fixture(t);
    if (action === "move") fs.renameSync(file, path.join(root, "moved.bin"));
    else if (action === "case-rename") fs.renameSync(file, path.join(root, "lib", "SAMPLE.bin"));
    else { fs.unlinkSync(file); if (action === "directory") fs.mkdirSync(file); }
    assert.equal(protection.verifyProtectedTree(root, manifest).errors.length, 1);
  });
}
test("protection: line-ending conversion fails", t => {
  const { root, file, manifest } = fixture(t);
  fs.writeFileSync(file, Buffer.from([0, 1, 10, 255]));
  assert.equal(protection.verifyProtectedTree(root, manifest).errors.length, 1);
});
test("protection: malformed, escaping and duplicate paths fail closed", t => {
  const { manifest } = fixture(t);
  for (const unsafe of ["../outside", "/outside", "C:/outside", "lib\\sample.bin", "lib//sample.bin", "lib/./sample.bin"]) {
    assert.throws(() => protection.validateManifest({ ...manifest, files: [{ ...manifest.files[0], path: unsafe }] }));
  }
  assert.throws(() => protection.validateManifest({ ...manifest, files: [] }));
  assert.throws(() => protection.validateManifest({ ...manifest, files: [manifest.files[0], manifest.files[0]] }));
  assert.throws(() => protection.validateManifest({ ...manifest, files: [{ ...manifest.files[0], sha256: "bad" }] }));
});
test("protection: manifest tampering fails through the real CLI", t => {
  const { root, manifest } = fixture(t);
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "docs", "protected-legacy-files.json"), JSON.stringify(manifest));
  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../scripts/check-protected-legacy.js"), "--root", root], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /manifest changed/);
});
test("protection: unknown update option cannot regenerate a baseline", () => {
  assert.throws(() => protection.main(["--update"]), /Usage:/);
});
test("protection: the actual repository and pinned manifest pass read-only verification", () => {
  const root = path.resolve(__dirname, "..");
  const manifest = protection.loadPinnedManifest(root);
  const result = protection.verifyProtectedTree(root, manifest);
  assert.equal(result.checked, 197);
  assert.deepEqual(result.errors, []);
});
