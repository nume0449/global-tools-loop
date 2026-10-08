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

// "1.1K" -> 1100, "1,234" -> 1234
function parseCount(text) {
  const t = String(text).replace(/,/g, "");
  return /K$/i.test(t) ? Math.round(parseFloat(t) * 1000) : Number(t);
}

async function main() {
  const names = fs.readdirSync(extDir).filter((n) =>
    fs.statSync(path.join(extDir, n)).isDirectory()
  );

  for (const name of names) {
    const storeMetaPath = path.join(extDir, name, "store.json");
    if (!fs.existsSync(storeMetaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(storeMetaPath, "utf8"));
    // Once an item has a store ID, its public page appears at a fixed URL
    // when review passes. Detect that here so nobody has to edit store.json
    // by hand after approval (main is protected).
    if (!meta.web_store_url && meta.web_store_id) {
      meta.web_store_url = `https://chromewebstore.google.com/detail/${meta.web_store_id}`;
      meta.detected = true;
    }
    if (!meta.web_store_url) {
      console.log(`[${name}] no store ID yet, skipping.`);
      continue;
    }

    let html;
    try {
      const res = await fetch(meta.web_store_url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; global-tools-loop/0.1)" },
      });
      if (!res.ok) {
        if (meta.detected && res.status === 404) {
          console.log(`[${name}] not public yet (store page 404), skipping.`);
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      html = await res.text();
      // Unpublished or in-review items still return 200, as a generic page
      // titled just "Chrome Web Store" (URL slug "empty-title"). A live
      // listing is titled "<Item name> - Chrome Web Store".
      const title = (html.match(/<title>([^<]*)<\/title>/) || ["", ""])[1].trim();
      if (!/ - Chrome Web Store$/.test(title)) {
        console.log(`[${name}] not public yet (generic store page), skipping.`);
        continue;
      }
    } catch (err) {
      console.error(`[${name}] fetch failed: ${err.message}`);
      continue;
    }

    // These regexes are best-effort against the public listing's rendered
    // text and WILL need occasional repair if Google changes markup.
    const ratingMatch = html.match(/Average rating ([\d.]+) out of 5/);
    const ratingCountMatch = html.match(/>([\d.,]+K?) ratings?</);
    const userCountMatch = html.match(/([\d,]+)\+?\s*users?/i);

    const snapshot = {
      date: new Date().toISOString().slice(0, 10),
      url: meta.web_store_url,
      fetched_at: new Date().toISOString(),
      rating: ratingMatch ? Number(ratingMatch[1]) : null,
      rating_count: ratingCountMatch ? parseCount(ratingCountMatch[1]) : null,
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

if (require.main === module) main().catch((err) => {
  console.error(err);
  process.exit(1);
});

module.exports = { parseCount };
