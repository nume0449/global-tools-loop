// format.js — pure functions: tab list -> text, and text -> URL list.
// No DOM, no chrome.* calls, so it runs unchanged in Node tests and in the popup.

(function (root) {
  "use strict";

  const FORMATS = {
    markdown: "Markdown links",
    markdownList: "Markdown list",
    urls: "URLs only",
    titleUrl: "Title + URL",
    html: "HTML links",
    csv: "CSV",
    json: "JSON",
  };

  function cleanTitle(t) {
    return String(t || "").replace(/\s+/g, " ").trim();
  }

  function escapeMarkdownText(t) {
    // Characters that would break the [text](url) link syntax.
    return t.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  }

  function escapeMarkdownUrl(u) {
    return u.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/ /g, "%20");
  }

  function escapeHtml(t) {
    return t
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function csvCell(t) {
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }

  function isBrowserPage(url) {
    return /^(chrome|chrome-extension|edge|about|devtools|view-source|chrome-search):/i.test(url || "");
  }

  // tabs: [{title, url}], opts: {skipBrowserPages, dedupe}
  function selectTabs(tabs, opts) {
    opts = opts || {};
    const out = [];
    const seen = new Set();
    for (const t of tabs || []) {
      const url = String(t.url || t.pendingUrl || "").trim();
      if (!url) continue;
      if (opts.skipBrowserPages && isBrowserPage(url)) continue;
      if (opts.dedupe) {
        if (seen.has(url)) continue;
        seen.add(url);
      }
      out.push({ title: cleanTitle(t.title) || url, url });
    }
    return out;
  }

  function formatTabs(tabs, format) {
    switch (format) {
      case "markdown":
        return tabs.map((t) => `[${escapeMarkdownText(t.title)}](${escapeMarkdownUrl(t.url)})`).join("\n");
      case "markdownList":
        return tabs.map((t) => `- [${escapeMarkdownText(t.title)}](${escapeMarkdownUrl(t.url)})`).join("\n");
      case "urls":
        return tabs.map((t) => t.url).join("\n");
      case "titleUrl":
        return tabs.map((t) => `${t.title}\n${t.url}`).join("\n\n");
      case "html":
        return tabs.map((t) => `<a href="${escapeHtml(t.url)}">${escapeHtml(t.title)}</a>`).join("<br>\n");
      case "csv":
        return ["title,url"].concat(tabs.map((t) => csvCell(t.title) + "," + csvCell(t.url))).join("\n");
      case "json":
        return JSON.stringify(tabs.map((t) => ({ title: t.title, url: t.url })), null, 2);
      default:
        throw new Error("Unknown format: " + format);
    }
  }

  // Pull http(s) URLs out of any pasted text: plain lists, Markdown links,
  // HTML, CSV. Bare domains like "example.com/page" are accepted too.
  function extractUrls(text) {
    const found = [];
    const seen = new Set();
    const add = (raw) => {
      let u = raw.replace(/[)\]>"',.;]+$/, "");
      if (!/^https?:\/\//i.test(u)) u = "https://" + u;
      try {
        const parsed = new URL(u);
        if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".")) return;
        const norm = parsed.href;
        if (seen.has(norm)) return;
        seen.add(norm);
        found.push(norm);
      } catch (e) {
        /* not a URL */
      }
    };
    const s = String(text || "");
    const full = /https?:\/\/[^\s<>"'`)\]]+/gi;
    let m;
    const covered = [];
    while ((m = full.exec(s))) {
      add(m[0]);
      covered.push([m.index, m.index + m[0].length]);
    }
    // Bare domains on their own line (e.g. "github.com/foo").
    for (const line of s.split(/\r?\n/)) {
      const l = line.trim();
      if (!l || /https?:\/\//i.test(l)) continue;
      if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(l)) add(l);
    }
    return found;
  }

  const api = { FORMATS, selectTabs, formatTabs, extractUrls, isBrowserPage };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CopyTabsFormat = api;
})(typeof self !== "undefined" ? self : this);
