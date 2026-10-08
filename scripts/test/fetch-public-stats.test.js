const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCount, ownSection } = require("../fetch-public-stats.js");

test("parseCount handles K suffix and thousands separators", () => {
  assert.equal(parseCount("1.1K"), 1100);
  assert.equal(parseCount("22.5K"), 22500);
  assert.equal(parseCount("1,234"), 1234);
  assert.equal(parseCount("48"), 48);
});

test("ownSection drops the Related carousel so its ratings are not counted", () => {
  const html = '<h1>Mine</h1><h2>Related</h2><span aria-label="Average rating 4.4 out of 5">';
  assert.equal(/Average rating/.test(ownSection(html)), false);
  assert.equal(ownSection("<h1>No carousel</h1>"), "<h1>No carousel</h1>");
});
