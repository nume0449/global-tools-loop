#!/usr/bin/env node
// Reads stats/<name>.json history for every published extension, applies
// loop/judge-rules.json thresholds, and writes loop/decisions.json.
// Does NOT edit code and does NOT publish — it only produces a decision
// that a human (or a separate claude-code-action step reading this file)
// acts on. This separation is deliberate: the judge never marks its own
// homework.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const statsDir = path.join(root, "stats");
const extDir = path.join(root, "extensions");
const rules = JSON.parse(fs.readFileSync(path.join(root, "loop", "judge-rules.json"), "utf8"));

function daysSince(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function judgeOne(name, meta, history) {
  if (history.length === 0) {
    return { name, action: "skip", reason: meta.web_store_id ? "in review or no stats yet" : "not yet submitted" };
  }
  // published_at falls back to the first day a public snapshot was recorded.
  const publishedAt = meta.published_at || history[0].date;
  const publishedDays = daysSince(publishedAt);
  const latest = history[history.length - 1];
  const hasAnySignal = history.some(
    (h) => (h.rating_count && h.rating_count > 0) || h.user_count_text
  );

  if (publishedDays >= rules.archive_days && !hasAnySignal) {
    return { name, action: "archive", reason: `${publishedDays}d published, zero signal ever` };
  }
  if (publishedDays >= rules.zero_signal_days && !hasAnySignal) {
    return { name, action: "rewrite_listing", reason: `${publishedDays}d published, zero signal` };
  }
  if (
    latest.rating_count >= rules.min_rating_count_for_sibling &&
    latest.rating >= rules.min_rating_for_sibling
  ) {
    return {
      name,
      action: "consider_sibling",
      reason: `rating ${latest.rating} over ${latest.rating_count} reviews`,
    };
  }
  return { name, action: "hold", reason: "no threshold crossed yet" };
}

function main() {
  const names = fs.existsSync(extDir)
    ? fs.readdirSync(extDir).filter((n) => fs.statSync(path.join(extDir, n)).isDirectory())
    : [];
  const decisions = [];

  for (const name of names) {
    const storeMetaPath = path.join(extDir, name, "store.json");
    const meta = fs.existsSync(storeMetaPath)
      ? JSON.parse(fs.readFileSync(storeMetaPath, "utf8"))
      : {};
    const statsPath = path.join(statsDir, `${name}.json`);
    const history = fs.existsSync(statsPath) ? JSON.parse(fs.readFileSync(statsPath, "utf8")) : [];
    decisions.push(judgeOne(name, meta, history));
  }

  const outPath = path.join(root, "loop", "decisions.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ judged_at: new Date().toISOString(), decisions }, null, 2) + "\n"
  );
  console.log(`Wrote ${decisions.length} decision(s) to ${path.relative(root, outPath)}`);
  for (const d of decisions) console.log(` - ${d.name}: ${d.action} (${d.reason})`);
}

main();
