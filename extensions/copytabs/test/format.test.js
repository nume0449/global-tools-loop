const test = require("node:test");
const assert = require("node:assert/strict");
const { selectTabs, formatTabs, extractUrls } = require("../lib/format.js");

const TABS = [
  { title: "GitHub  -  Home", url: "https://github.com/" },
  { title: "Docs [beta] (new)", url: "https://example.com/a(b)c d" },
  { title: "", url: "https://no-title.example/" },
  { title: "Extensions", url: "chrome://extensions/" },
  { title: "GitHub dup", url: "https://github.com/" },
];

test("selectTabs skips browser pages and dedupes when asked", () => {
  const t = selectTabs(TABS, { skipBrowserPages: true, dedupe: true });
  assert.deepEqual(t.map((x) => x.url), ["https://github.com/", "https://example.com/a(b)c d", "https://no-title.example/"]);
  assert.equal(t[0].title, "GitHub - Home");
  assert.equal(t[2].title, "https://no-title.example/");
});

test("selectTabs keeps everything by default", () => {
  assert.equal(selectTabs(TABS).length, 5);
});

test("markdown escapes brackets in titles and parens/spaces in urls", () => {
  const out = formatTabs(selectTabs([TABS[1]]), "markdown");
  assert.equal(out, "[Docs \\[beta\\] (new)](https://example.com/a%28b%29c%20d)");
});

test("markdownList, urls and titleUrl formats", () => {
  const t = selectTabs(TABS.slice(0, 1));
  assert.equal(formatTabs(t, "markdownList"), "- [GitHub - Home](https://github.com/)");
  assert.equal(formatTabs(t, "urls"), "https://github.com/");
  assert.equal(formatTabs(t, "titleUrl"), "GitHub - Home\nhttps://github.com/");
});

test("html escapes and csv quotes", () => {
  const t = [{ title: 'A "q" <b>, c', url: "https://x.example/?a=1&b=2" }];
  assert.equal(formatTabs(t, "html"), '<a href="https://x.example/?a=1&amp;b=2">A &quot;q&quot; &lt;b&gt;, c</a>');
  assert.equal(formatTabs(t, "csv"), 'title,url\n"A ""q"" <b>, c",https://x.example/?a=1&b=2');
});

test("json is valid and round-trips", () => {
  const t = selectTabs(TABS.slice(0, 2));
  assert.deepEqual(JSON.parse(formatTabs(t, "json")), t);
});

test("unknown format throws", () => {
  assert.throws(() => formatTabs([], "nope"));
});

test("extractUrls reads plain lists, markdown, html and bare domains, deduped", () => {
  const text = [
    "https://a.example/one",
    "- [Two](https://b.example/two)",
    '<a href="https://c.example/three">x</a>',
    "github.com/foo/bar",
    "not a url",
    "https://a.example/one",
    "see https://d.example/four, and more.",
  ].join("\n");
  assert.deepEqual(extractUrls(text), [
    "https://a.example/one",
    "https://b.example/two",
    "https://c.example/three",
    "https://d.example/four",
    "https://github.com/foo/bar",
  ]);
});

test("extractUrls ignores non-http schemes and hostless junk", () => {
  assert.deepEqual(extractUrls("javascript:alert(1)\nftp://x.example\nlocalhost\nfoo"), []);
});
