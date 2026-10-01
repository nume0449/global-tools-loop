#!/usr/bin/env node
// Fails CI if any extension's manifest.json is malformed or missing
// required fields/icons. Cheap sanity check that runs before packaging.
const fs = require("node:fs");
const path = require("node:path");

const extDir = path.join(__dirname, "..", "extensions");
const required = ["manifest_version", "name", "version", "description", "icons"];
let failures = 0;

if (!fs.existsSync(extDir)) {
  console.error(`No extensions/ directory at ${extDir}`);
  process.exit(1);
}

for (const name of fs.readdirSync(extDir)) {
  const dir = path.join(extDir, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`[${name}] missing manifest.json`);
    failures++;
    continue;
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    console.error(`[${name}] invalid JSON: ${err.message}`);
    failures++;
    continue;
  }
  for (const field of required) {
    if (!(field in manifest)) {
      console.error(`[${name}] manifest missing required field: ${field}`);
      failures++;
    }
  }
  // Chrome Web Store rejects the upload outright beyond these limits.
  if (typeof manifest.description === "string" && manifest.description.length > 132) {
    console.error(`[${name}] description is ${manifest.description.length} chars (Chrome Web Store limit: 132)`);
    failures++;
  }
  if (typeof manifest.name === "string" && manifest.name.length > 75) {
    console.error(`[${name}] name is ${manifest.name.length} chars (Chrome Web Store limit: 75)`);
    failures++;
  }
  if (manifest.manifest_version !== 3) {
    console.error(`[${name}] must use manifest_version 3`);
    failures++;
  }
  for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
    const full = path.join(dir, iconPath);
    if (!fs.existsSync(full)) {
      console.error(`[${name}] icon for size ${size} not found: ${iconPath}`);
      failures++;
    }
  }
  console.log(`[${name}] manifest OK (v${manifest.version})`);
}

if (failures > 0) {
  console.error(`\n${failures} manifest validation failure(s).`);
  process.exit(1);
}
console.log("\nAll manifests valid.");
