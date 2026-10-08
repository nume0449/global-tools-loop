const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCount } = require("../fetch-public-stats.js");

test("parseCount handles K suffix and thousands separators", () => {
  assert.equal(parseCount("1.1K"), 1100);
  assert.equal(parseCount("22.5K"), 22500);
  assert.equal(parseCount("1,234"), 1234);
  assert.equal(parseCount("48"), 48);
});
