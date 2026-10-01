const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { extractMarkdown } = require("../lib/extract.js");

function docFrom(html) {
  return new JSDOM(html).window.document;
}

test("extracts a simple article with heading and paragraphs", () => {
  const doc = docFrom(`
    <html><head><title>My Article</title></head>
    <body>
      <nav><a href="/">Home</a><a href="/about">About</a></nav>
      <article>
        <h1>My Article</h1>
        <p>This is the <strong>first</strong> paragraph of the article, long enough to score well.</p>
        <p>This is the second paragraph with a <a href="https://example.com">link</a> inside it.</p>
      </article>
      <footer>Copyright 2026</footer>
    </body></html>
  `);
  const md = extractMarkdown(doc);
  assert.match(md, /^# My Article/);
  assert.match(md, /\*\*first\*\*/);
  assert.match(md, /\[link\]\(https:\/\/example\.com\/?\)/);
  assert.doesNotMatch(md, /Copyright 2026/);
  assert.doesNotMatch(md, /Home/);
});

test("prefers the dense article block over a link-heavy sidebar", () => {
  const doc = docFrom(`
    <html><head><title>T</title></head>
    <body>
      <div id="sidebar" class="sidebar">
        <a href="/1">Link one</a><a href="/2">Link two</a><a href="/3">Link three</a>
      </div>
      <div id="main-content">
        <p>${"Real article text that is definitely long enough to win on density. ".repeat(5)}</p>
      </div>
    </body></html>
  `);
  const md = extractMarkdown(doc);
  assert.match(md, /Real article text/);
  assert.doesNotMatch(md, /Link one/);
});

test("converts headings, lists, blockquote and code block", () => {
  const doc = docFrom(`
    <html><head><title>Formats</title></head>
    <body><article>
      <h2>Section</h2>
      <ul><li>item a</li><li>item b</li></ul>
      <blockquote><p>a wise quote</p></blockquote>
      <pre>const x = 1;</pre>
    </article></body></html>
  `);
  const md = extractMarkdown(doc);
  assert.match(md, /## Section/);
  assert.match(md, /- item a/);
  assert.match(md, /- item b/);
  assert.match(md, /> a wise quote/);
  assert.match(md, /```\nconst x = 1;\n```/);
});

test("handles an empty/near-empty page without throwing", () => {
  const doc = docFrom(`<html><head><title>Empty</title></head><body></body></html>`);
  assert.doesNotThrow(() => extractMarkdown(doc));
});

test("collapses excessive blank lines", () => {
  const doc = docFrom(`
    <html><head><title>Spacer</title></head>
    <body><article>
      <p>One paragraph that is long enough to be picked up by the scorer here.</p>


      <p>Another paragraph, also long enough to be picked up by the density scorer.</p>
    </article></body></html>
  `);
  const md = extractMarkdown(doc);
  assert.doesNotMatch(md, /\n{3,}/);
});

test("does not duplicate the title when the article already has an h1", () => {
  const doc = docFrom(`
    <html><head><title>Same Title</title></head>
    <body><article>
      <h1>Same Title</h1>
      <p>Body paragraph that is long enough to be picked up by the density scorer.</p>
    </article></body></html>
  `);
  const md = extractMarkdown(doc);
  assert.equal(md.match(/^# /gm).length, 1);
});

test("prepends the document title when the body has no h1", () => {
  const doc = docFrom(`
    <html><head><title>Doc Title</title></head>
    <body><article>
      <p>Body paragraph that is long enough to be picked up by the density scorer.</p>
    </article></body></html>
  `);
  const md = extractMarkdown(doc);
  assert.match(md, /^# Doc Title\n/);
});

test("keeps text nodes mixed with inline elements in one paragraph", () => {
  const doc = docFrom(`
    <html><head><title>T</title></head><body><article>
      <h1>T</h1>
      <div>Find sources: <a href="https://a.example/news">news</a> and <span>books</span> for this long enough sentence.</div>
    </article></body></html>
  `);
  const md = extractMarkdown(doc);
  assert.match(md, /Find sources: \[news\]\(https:\/\/a\.example\/news\) and books for this long enough sentence\./);
});

test("noise matching is token based (lead-paragraph and threads survive)", () => {
  const doc = docFrom(`
    <html><head><title>T</title></head><body><article>
      <h1>T</h1>
      <p class="lead-paragraph">Lead paragraph text that must not be dropped by the ad filter.</p>
      <div class="threads"><p>Threads text that must not be dropped by the ads filter either.</p></div>
      <div class="ad ad-slot"><p>Buy now, this advertisement should be removed entirely.</p></div>
    </article></body></html>
  `);
  const md = extractMarkdown(doc);
  assert.match(md, /Lead paragraph text/);
  assert.match(md, /Threads text/);
  assert.doesNotMatch(md, /Buy now/);
});

test("renders tables, nested lists and drops citation markers", () => {
  const doc = docFrom(`
    <html><head><title>T</title></head><body><article>
      <h1>T</h1>
      <p>A claim that is cited<sup><a href="#cite-1">[1]</a></sup> in this sufficiently long sentence.</p>
      <table><tr><th>Name</th><th>Size</th></tr><tr><td>a|b</td><td>10</td></tr></table>
      <ul><li>parent<ul><li>child</li></ul></li><li>second</li></ul>
    </article></body></html>
  `);
  const md = extractMarkdown(doc);
  assert.match(md, /cited in this/);
  assert.match(md, /\| Name \| Size \|\n\| --- \| --- \|\n\| a\\\|b \| 10 \|/);
  assert.match(md, /- parent\n  - child\n- second/);
});

test("resolves relative links against the document base URL", () => {
  const dom = new JSDOM(
    `<html><head><title>T</title></head><body><article><h1>T</h1>
     <p>See the <a href="/docs/guide">guide</a> for a long enough explanation of things.</p>
     </article></body></html>`,
    { url: "https://site.example/blog/post" }
  );
  const md = extractMarkdown(dom.window.document);
  assert.match(md, /\[guide\]\(https:\/\/site\.example\/docs\/guide\)/);
});
