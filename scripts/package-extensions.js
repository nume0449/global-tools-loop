#!/usr/bin/env node
// Zips each extensions/<name>/ directory into dist/<name>-<version>.zip
// using only Node's built-ins (no external zip dependency).
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const extDir = path.join(root, "extensions");
const distDir = path.join(root, "dist");

fs.mkdirSync(distDir, { recursive: true });

for (const name of fs.readdirSync(extDir)) {
  const dir = path.join(extDir, name);
  if (!fs.statSync(dir).isDirectory()) continue;
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const outFile = path.join(distDir, `${name}-${manifest.version}.zip`);
  fs.rmSync(outFile, { force: true });
  // `zip -r` is present on macOS/Linux GitHub Actions runners by default.
  // Exclude dev-only files (tests, loop metadata) from the Store package.
  execFileSync(
    "zip",
    ["-r", outFile, ".", "-x", "test/*", "-x", "*.test.js", "-x", "store.json", "-x", ".DS_Store"],
    { cwd: dir, stdio: "inherit" }
  );
  console.log(`Packaged ${name} -> ${path.relative(root, outFile)}`);
}
