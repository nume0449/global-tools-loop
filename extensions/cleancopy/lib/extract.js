// extract.js
// Pure functions: DOM (or DOM-like) -> readable article -> Markdown.
// No external dependencies, no network calls, no LLM calls.
// Exported as CommonJS for unit tests (Node) AND attached to `self`
// for use inside the content script (classic script, not a module).

(function (root) {
  "use strict";

  // Tags whose entire subtree never contributes content.
  const NOISE_TAGS = new Set([
    "script", "style", "noscript", "svg", "nav", "footer", "form", "iframe",
    "aside", "button", "input", "select", "textarea", "template", "canvas",
    "dialog", "menu", "object", "embed", "audio", "video", "link", "meta",
  ]);

  // Whole class/id tokens (split on non-alphanumerics) that mark page chrome.
  // Token matching, not substring matching: "lead-paragraph" must not match
  // "ad", "threads" must not match "ads".
  const NOISE_TOKENS = new Set([
    "nav", "navbar", "navigation", "navbox", "menu", "sidebar", "footer",
    "banner", "ad", "ads", "advert", "advertisement", "sponsored", "promo",
    "cookie", "cookies", "consent", "subscribe", "newsletter", "popup",
    "modal", "share", "sharing", "social", "comment", "comments", "related",
    "breadcrumb", "breadcrumbs", "editsection", "noprint", "toc", "skip",
  ]);

  const BLOCK_TAGS = new Set([
    "address", "article", "blockquote", "details", "div", "dl", "dd", "dt",
    "fieldset", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6",
    "header", "hgroup", "hr", "li", "main", "ol", "p", "pre", "section",
    "summary", "table", "tbody", "thead", "tfoot", "tr", "td", "th", "ul",
  ]);
  const BLOCK_SELECTOR = Array.from(BLOCK_TAGS).join(",");

  function tagOf(el) {
    return el && el.tagName ? el.tagName.toLowerCase() : "";
  }

  function isNoisyElement(el) {
    if (!el || !el.getAttribute) return false;
    const id = el.id || "";
    const cls = el.className && el.className.toString ? el.className.toString() : "";
    const tokens = (id + " " + cls).toLowerCase().split(/[^a-z0-9]+/);
    for (const t of tokens) {
      if (t && NOISE_TOKENS.has(t)) return true;
    }
    return false;
  }

  function isHidden(el) {
    if (!el || !el.getAttribute) return false;
    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return true;
    // Real browsers only (Chrome 105+); jsdom has no layout, so skip there.
    if (typeof el.checkVisibility === "function") {
      try { return !el.checkVisibility(); } catch (e) { return false; }
    }
    return false;
  }

  function skip(el) {
    return NOISE_TAGS.has(tagOf(el)) || isNoisyElement(el) || isHidden(el);
  }

  function absoluteUrl(raw, doc) {
    if (!raw) return "";
    const v = raw.trim();
    if (/^(javascript|data|blob):/i.test(v)) return "";
    try {
      return new URL(v, doc.baseURI).href;
    } catch (e) {
      return v;
    }
  }

  // ---- article root detection ------------------------------------------

  function scoreNode(el) {
    const text = (el.textContent || "").trim();
    if (text.length < 40) return -1;
    const links = el.querySelectorAll ? el.querySelectorAll("a") : [];
    let linkText = 0;
    for (const a of Array.from(links)) linkText += (a.textContent || "").length;
    const linkDensity = linkText / Math.max(text.length, 1);
    const paragraphs = el.querySelectorAll ? el.querySelectorAll("p").length : 0;
    return text.length * (1 - Math.min(linkDensity, 0.9)) + paragraphs * 25;
  }

  function hasNoisyAncestor(el) {
    let p = el.parentElement;
    while (p) {
      if (NOISE_TAGS.has(tagOf(p)) || isNoisyElement(p)) return true;
      p = p.parentElement;
    }
    return false;
  }

  function findArticleRoot(doc) {
    const articles = Array.from(doc.querySelectorAll("article")).filter(
      (a) => !hasNoisyAncestor(a) && scoreNode(a) > 0
    );
    if (articles.length === 1) return articles[0];

    const main = doc.querySelector("main, [role=main]");
    if (main && scoreNode(main) > 0) return main;

    let best = null;
    let bestScore = 0;
    for (const el of Array.from(doc.querySelectorAll("div, section, article"))) {
      if (isNoisyElement(el) || hasNoisyAncestor(el)) continue;
      const s = scoreNode(el);
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    }
    return best || doc.body;
  }

  // ---- inline conversion -----------------------------------------------

  function isCitationMarker(el) {
    if (tagOf(el) !== "sup") return false;
    const t = (el.textContent || "").trim();
    return /^\[?[\w ,–-]{1,12}\]?$/.test(t) && !!el.querySelector('a[href^="#"]');
  }

  function inline(node, doc) {
    if (node.nodeType === 3) return node.textContent.replace(/\s+/g, " ");
    if (node.nodeType !== 1) return "";
    if (skip(node) || isCitationMarker(node)) return "";
    const tag = tagOf(node);

    if (tag === "br") return "\n";
    if (tag === "img") return imageMarkdown(node, doc);
    if (tag === "code" || tag === "kbd" || tag === "samp") {
      const t = node.textContent.trim();
      return t ? "`" + t + "`" : "";
    }

    let inner = "";
    for (const child of Array.from(node.childNodes)) inner += inline(child, doc);

    if (tag === "strong" || tag === "b") {
      const t = inner.trim();
      return t ? wrapKeepingSpaces(inner, "**") : "";
    }
    if (tag === "em" || tag === "i") {
      const t = inner.trim();
      return t ? wrapKeepingSpaces(inner, "*") : "";
    }
    if (tag === "a") {
      const label = inner.replace(/\s+/g, " ").trim();
      if (!label) return "";
      const rawHref = node.getAttribute("href") || "";
      if (!rawHref || rawHref.charAt(0) === "#") return inner;
      const href = absoluteUrl(rawHref, doc);
      return href ? wrapKeepingSpaces(inner, "[", "](" + href + ")") : inner;
    }
    return inner;
  }

  // "  text " + ** -> "  **text** " so emphasis markers hug the text.
  function wrapKeepingSpaces(s, open, close) {
    close = close === undefined ? open : close;
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return m[1] + open + m[2].replace(/\s+/g, " ") + close + m[3];
  }

  function imageMarkdown(node, doc) {
    const src = absoluteUrl(node.getAttribute("src") || "", doc);
    if (!src) return "";
    // Skip tracking pixels and tiny icons when layout info is available.
    const w = Number(node.getAttribute("width")) || node.naturalWidth || 0;
    if (w && w < 32) return "";
    const alt = (node.getAttribute("alt") || "").replace(/\s+/g, " ").trim();
    return "![" + alt + "](" + src + ")";
  }

  function cleanInline(s) {
    return s
      .split("\n")
      .map((l) => l.replace(/[ \t ]+/g, " ").trim())
      .join("\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  // ---- block conversion ------------------------------------------------

  function containsBlock(el) {
    return !!(el.querySelector && el.querySelector(BLOCK_SELECTOR));
  }

  function isBlockLevel(node) {
    if (node.nodeType !== 1) return false;
    const tag = tagOf(node);
    return BLOCK_TAGS.has(tag) || containsBlock(node);
  }

  // Walk children; consecutive inline nodes (text + inline elements) become
  // one paragraph, block children are converted recursively.
  function mixed(el, doc) {
    let out = "";
    let run = "";
    const flush = () => {
      const text = cleanInline(run);
      if (text) out += text + "\n\n";
      run = "";
    };
    for (const child of Array.from(el.childNodes)) {
      if (isBlockLevel(child)) {
        flush();
        out += block(child, doc);
      } else {
        run += inline(child, doc);
      }
    }
    flush();
    return out;
  }

  function listMarkdown(el, doc) {
    const ordered = tagOf(el) === "ol";
    let out = "";
    let i = Number(el.getAttribute("start")) || 1;
    for (const li of Array.from(el.children)) {
      if (tagOf(li) !== "li" || skip(li)) continue;
      const content = mixed(li, doc).trim().replace(/\n{2,}/g, "\n");
      if (!content) continue;
      const marker = ordered ? i + ". " : "- ";
      const indent = " ".repeat(marker.length);
      const lines = content.split("\n");
      out += marker + lines[0] + "\n";
      for (const l of lines.slice(1)) out += indent + l + "\n";
      i += 1;
    }
    return out ? out + "\n" : "";
  }

  function tableMarkdown(el, doc) {
    const rows = [];
    for (const tr of Array.from(el.querySelectorAll("tr"))) {
      // Only rows that belong to this table, not to a nested one.
      if (tr.closest("table") !== el || skip(tr)) continue;
      const cells = Array.from(tr.children)
        .filter((c) => /^(td|th)$/.test(tagOf(c)) && !skip(c))
        .map((c) => {
          let s = "";
          for (const n of Array.from(c.childNodes)) s += isBlockLevel(n) ? " " + block(n, doc) + " " : inline(n, doc);
          return s.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
        });
      if (cells.some((c) => c)) rows.push(cells);
    }
    if (!rows.length) return "";
    const width = Math.max.apply(null, rows.map((r) => r.length));
    // Single-column or layout tables read better as plain paragraphs.
    if (width < 2 || el.getAttribute("role") === "presentation") {
      return rows.map((r) => r.filter(Boolean).join(" ")).filter(Boolean).join("\n\n") + "\n\n";
    }
    const line = (r) => {
      const padded = r.concat(new Array(width - r.length).fill(""));
      return "| " + padded.join(" | ") + " |";
    };
    let out = line(rows[0]) + "\n" + "| " + new Array(width).fill("---").join(" | ") + " |\n";
    for (const r of rows.slice(1)) out += line(r) + "\n";
    return out + "\n";
  }

  function block(el, doc) {
    if (skip(el)) return "";
    const tag = tagOf(el);

    if (/^h[1-6]$/.test(tag)) {
      const text = cleanInline(inline(el, doc)).replace(/\n/g, " ");
      return text ? "#".repeat(Number(tag[1])) + " " + text + "\n\n" : "";
    }
    if (tag === "p") {
      if (containsBlock(el)) return mixed(el, doc);
      const text = cleanInline(inline(el, doc));
      return text ? text + "\n\n" : "";
    }
    if (tag === "pre") {
      const code = el.textContent.replace(/^\n+|\s+$/g, "");
      return code ? "```\n" + code + "\n```\n\n" : "";
    }
    if (tag === "blockquote") {
      const inner = mixed(el, doc).trim();
      if (!inner) return "";
      return inner.split("\n").map((l) => (l ? "> " + l : ">")).join("\n") + "\n\n";
    }
    if (tag === "ul" || tag === "ol") return listMarkdown(el, doc);
    if (tag === "table") return tableMarkdown(el, doc);
    if (tag === "hr") return "---\n\n";
    if (tag === "dt") {
      const text = cleanInline(inline(el, doc));
      return text ? "**" + text + "**\n\n" : "";
    }
    return mixed(el, doc);
  }

  // ---- entry point -----------------------------------------------------

  function extractMarkdown(doc, opts) {
    opts = opts || {};
    const title = (doc.title || "").replace(/\s+/g, " ").trim();
    const rootEl = opts.root || findArticleRoot(doc);
    let body = rootEl ? mixed(rootEl, doc) : "";

    body = body
      .split("\n")
      .map((l) => l.replace(/[ \t]+$/, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Most articles repeat the page title as their own <h1>. Only prepend
    // the document title when the body does not already have an h1 up top.
    const hasEarlyH1 = /^# \S/m.test(body.slice(0, 1500));
    const header = title && !hasEarlyH1 ? "# " + title + "\n\n" : "";
    return header + body + "\n";
  }

  const api = { extractMarkdown, findArticleRoot, scoreNode, isNoisyElement };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CleanCopyExtract = api;
  }
})(typeof self !== "undefined" ? self : this);
