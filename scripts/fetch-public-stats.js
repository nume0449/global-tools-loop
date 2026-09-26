#!/usr/bin/env node
// Reads each extensions/<name>/store.json for a public Chrome Web Store
// listing URL, fetches the PUBLIC listing page (no login, no API key —
// the same page any visitor sees), and appends a dated snapshot of
// rating / rating count / user count text to stats/<name>.json.
//
// Honest limitation: Chrome Web Store has no public API for exact daily
// install counts. This gives a coarse, delayed signal ("1,000+ users").
// Precise daily installs/uninstalls require a manual CSV export from the
// developer dashboard (see README section 5) — that part is NOT automated.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const extDir = path.join(root, "extensions");
const statsDir = path.join(root, "stats");
fs.mkdirSync(statsDir, { recursive: true });

async function main() {
  const names = fs.readdirSync(extDir).filter((n) =>
    fs.statSync(path.join(extDir, n)).isDirectory()
  );

  for (const name of names) {
    const storeMetaPath = path.join(extDir, name, "store.json");
    if (!fs.existsSync(storeMetaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(storeMetaPath, "utf8"));
    if (!meta.web_store_url) {
      console.log(`[${name}] not yet published, skipping (store.json has no web_store_url).`);
      continue;
    }

    let html;
    try {
      const res = await fetch(meta.web_store_url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; global-tools-loop/0.1)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch (err) {
      console.error(`[${name}] fetch failed: ${err.message}`);
      continue;
    }

    // These regexes are best-effort against the public listing's rendered
    // text and WILL need occasional repair if Google changes markup.
    const ratingMatch = html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/);
    const ratingCountMatch = html.match(/"ratingCount"\s*:\s*"?(\d+)"?/);
    const userCountMatch = html.match(/([\d,]+)\+?\s*users?/i);

    const snapshot = {
      date: new Date().toISOString().slice(0, 10),
      fetched_at: new Date().toISOString(),
      rating: ratingMatch ? Number(ratingMatch[1]) : null,
      rating_count: ratingCountMatch ? Number(ratingCountMatch[1]) : null,
      user_count_text: userCountMatch ? userCountMatch[0] : null,
    };

    const statsPath = path.join(statsDir, `${name}.json`);
    const history = fs.existsSync(statsPath)
      ? JSON.parse(fs.readFileSync(statsPath, "utf8"))
      : [];
    // One snapshot per day: replace today's entry if it already exists.
    const withoutToday = history.filter((h) => h.date !== snapshot.date);
    withoutToday.push(snapshot);
    fs.writeFileSync(statsPath, JSON.stringify(withoutToday, null, 2) + "\n");
    console.log(`[${name}] snapshot recorded:`, snapshot);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
