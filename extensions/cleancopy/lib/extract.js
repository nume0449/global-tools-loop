// extract.js
// Pure functions: DOM (or DOM-like) -> readable article -> Markdown.
// No external dependencies, no network calls, no LLM calls.
// Exported as CommonJS for unit tests (Node) AND attached to `window`/`self`
// for use inside the content script (classic script, not a module).

(function (root) {
  "use strict";

  // Tags whose entire subtree is noise and should never contribute text.
  const NOISE_TAGS = new Set([
    "script", "style", "noscript", "svg", "nav", "footer", "header",
    "form", "iframe", "aside", "button", "input", "select", "textarea",
    "template", "canvas",
  ]);

  // Class/id substrings that strongly suggest non-article chrome.
  const NOISE_HINTS = [
    "nav", "menu", "sidebar", "footer", "header", "banner", "ad-",
    "ads", "advert", "cookie", "subscribe", "newsletter", "popup",
    "modal", "share", "social", "comment", "related", "breadcrumb",
  ];

  function isNoisyElement(el) {
    if (!el || !el.getAttribute) return false;
    const id = (el.id || "").toLowerCase();
    const cls = (el.className && el.className.toString ? el.className.toString() : "").toLowerCase();
    return NOISE_HINTS.some((hint) => id.includes(hint) || cls.includes(hint));
  }

  // Score each block-level candidate by text density (long paragraphs win
  // over link-heavy nav lists). Classic "readability" heuristic, simplified.
  function scoreNode(el) {
    const text = (el.innerText || el.textContent || "").trim();
    if (text.length < 40) return -1;
    const linkText = Array.from(el.querySelectorAll ? el.querySelectorAll("a") : [])
      .reduce((sum, a) => sum + ((a.innerText || a.textContent || "").length), 0);
    const linkDensity = linkText / Math.max(text.length, 1);
    const paragraphs = el.querySelectorAll ? el.querySelectorAll("p").length : 0;
    let score = text.length * (1 - Math.min(linkDensity, 0.9));
    score += paragraphs * 25;
    return score;
  }

  function findArticleRoot(doc) {
    const explicit = doc.querySelector("article, main, [role=main]");
    if (explicit && scoreNode(explicit) > 0) return explicit;

    const candidates = Array.from(doc.querySelectorAll("div, section, article, main"));
    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      if (isNoisyElement(el)) continue;
      let ancestorNoisy = false;
      let p = el.parentElement;
      while (p) {
        if (isNoisyElement(p) || NOISE_TAGS.has(p.tagName ? p.tagName.toLowerCase() : "")) {
          ancestorNoisy = true;
          break;
        }
        p = p.parentElement;
      }
      if (ancestorNoisy) continue;
      const s = scoreNode(el);
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    }
    return best || doc.body;
  }

  function inlineMarkdown(el, doc) {
    // Convert inline-level children of `el` to a Markdown string.
    let out = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) {
        out += node.textContent;
        continue;
      }
      if (node.nodeType !== 1) continue;
      const tag = node.tagName.toLowerCase();
      if (NOISE_TAGS.has(tag)) continue;
      if (tag === "br") {
        out += "\n";
      } else if (tag === "strong" || tag === "b") {
        out += `**${inlineMarkdown(node, doc).trim()}**`;
      } else if (tag === "em" || tag === "i") {
        out += `*${inlineMarkdown(node, doc).trim()}*`;
      } else if (tag === "code") {
        out += `\`${node.textContent.trim()}\``;
      } else if (tag === "a") {
        const href = node.getAttribute("href") || "";
        const label = inlineMarkdown(node, doc).trim() || href;
        out += href ? `[${label}](${href})` : label;
      } else if (tag === "img") {
        const alt = node.getAttribute("alt") || "";
        const src = node.getAttribute("src") || "";
        if (src) out += `![${alt}](${src})`;
      } else {
        out += inlineMarkdown(node, doc);
      }
    }
    return out;
  }

  function blockToMarkdown(el, doc, depth) {
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (NOISE_TAGS.has(tag) || isNoisyElement(el)) return "";

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      const text = inlineMarkdown(el, doc).trim();
      return text ? `\n${"#".repeat(level)} ${text}\n\n` : "";
    }
    if (tag === "p") {
      const text = inlineMarkdown(el, doc).trim();
      return text ? `${text}\n\n` : "";
    }
    if (tag === "blockquote") {
      const inner = Array.from(el.children).map((c) => blockToMarkdown(c, doc, depth)).join("");
      const quoted = inner.trim().split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");
      return quoted ? `${quoted}\n\n` : "";
    }
    if (tag === "pre") {
      const code = el.textContent.replace(/\n+$/, "");
      return "```\n" + code + "\n```\n\n";
    }
    if (tag === "ul" || tag === "ol") {
      let out = "";
      let i = 1;
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== "li") continue;
        const text = inlineMarkdown(li, doc).trim();
        if (!text) continue;
        out += tag === "ol" ? `${i}. ${text}\n` : `- ${text}\n`;
        i += 1;
      }
      return out ? `${out}\n` : "";
    }
    if (tag === "hr") return "---\n\n";
    if (tag === "img") {
      const alt = el.getAttribute("alt") || "";
      const src = el.getAttribute("src") || "";
      return src ? `![${alt}](${src})\n\n` : "";
    }

    // Generic container: recurse into children.
    if (el.children && el.children.length) {
      return Array.from(el.children).map((c) => blockToMarkdown(c, doc, depth)).join("");
    }
    // Leaf with only text (e.g. a bare <div>text</div>).
    const text = inlineMarkdown(el, doc).trim();
    return text ? `${text}\n\n` : "";
  }

  function extractMarkdown(doc, opts) {
    opts = opts || {};
    const title = (doc.title || "").trim();
    const root = opts.root || findArticleRoot(doc);
    let body = Array.from(root.children).map((c) => blockToMarkdown(c, doc, 0)).join("");
    if (!body.trim()) {
      body = inlineMarkdown(root, doc).trim() + "\n";
    }
    // Collapse 3+ blank lines down to 2, trim trailing whitespace per line.
    body = body
      .split("\n")
      .map((l) => l.replace(/[ \t]+$/, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const header = title ? `# ${title}\n\n` : "";
    return `${header}${body}\n`;
  }

  const api = { extractMarkdown, findArticleRoot, scoreNode, isNoisyElement };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CleanCopyExtract = api;
  }
})(typeof self !== "undefined" ? self : this);
