"use strict";

// Read-only: deliberately no baseline generation, repair, or accept/update mode.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const BASELINE_COMMIT = "8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541";
const MANIFEST_SHA256 = "26bfc9a6ac908fa9f2e19c8ee47f0351d8079b37916c69aefbaf28af6b5d5243";
const MANIFEST_PATH = "docs/protected-legacy-files.json";
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.algorithm !== "sha256" ||
      !/^[a-f0-9]{40}$/.test(manifest.baselineCommit) ||
      !Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Invalid protection manifest");
  const seen = new Set();
  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string" || !file.path ||
        /[\\:\x00-\x1f]/.test(file.path) || file.path.startsWith("/") ||
        file.path.split("/").some(part => !part || part === "." || part === "..") ||
        seen.has(file.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(file.sha256) ||
        !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new Error("Invalid or duplicate protected path/hash/size");
    seen.add(file.path.toLowerCase());
  }
}

function regularFile(root, relative) {
  const parts = relative.split("/");
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    // Check exact spelling even on a case-insensitive filesystem.
    if (!fs.readdirSync(current).includes(parts[i])) throw new Error("missing or moved (including case-only rename)");
    current = path.join(current, parts[i]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error("symbolic link/junction substitution");
    if (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) throw new Error("not a regular protected file path");
  }
  return current;
}

function loadPinnedManifest(root) {
  const bytes = fs.readFileSync(regularFile(root, MANIFEST_PATH));
  if (digest(bytes) !== MANIFEST_SHA256) throw new Error("Protection manifest changed; separate explicit approval is required");
  const manifest = JSON.parse(bytes.toString("utf8"));
  validateManifest(manifest);
  if (manifest.baselineCommit !== BASELINE_COMMIT) throw new Error("Baseline commit changed");
  return manifest;
}

// Exported for temporary-fixture tests; the CLI always uses the pinned manifest.
function verifyProtectedTree(root, manifest) {
  validateManifest(manifest);
  const errors = [];
  for (const file of manifest.files) {
    try {
      const bytes = fs.readFileSync(regularFile(root, file.path));
      if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) errors.push(`${file.path}: bytes changed`);
    } catch (error) {
      errors.push(`${file.path}: ${error.code || error.message}`);
    }
  }
  return { baselineCommit: manifest.baselineCommit, checked: manifest.files.length, errors };
}

function main(args = process.argv.slice(2)) {
  if (args.length && !(args.length === 2 && args[0] === "--root")) throw new Error("Usage: node scripts/check-protected-legacy.js [--root checkout-directory]");
  const root = fs.realpathSync(args.length ? path.resolve(args[1]) : path.resolve(__dirname, ".."));
  const result = verifyProtectedTree(root, loadPinnedManifest(root));
  if (result.errors.length) throw new Error(`Legacy protection FAILED:\n${result.errors.join("\n")}`);
  console.log(`Legacy protection PASS: ${result.checked} exact file hashes; baseline ${result.baselineCommit}`);
  return result;
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { BASELINE_COMMIT, MANIFEST_SHA256, digest, validateManifest, loadPinnedManifest, verifyProtectedTree, main };
