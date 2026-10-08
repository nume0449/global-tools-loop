// popup.js — the popup has user focus, so navigator.clipboard works here
// directly; no offscreen document is needed.
(function () {
  "use strict";
  const F = self.CopyTabsFormat;
  const $ = (id) => document.getElementById(id);
  const MAX_OPEN = 50;

  const settings = { scope: "window", format: "markdown", skip: true, dedupe: true, newWindow: false };
  let current = [];

  function setStatus(msg, kind) {
    const s = $("status");
    s.textContent = msg;
    s.className = kind || "";
  }

  async function loadSettings() {
    try {
      Object.assign(settings, await chrome.storage.local.get(Object.keys(settings)));
    } catch (e) { /* defaults */ }
  }

  function saveSettings() {
    chrome.storage.local.set(settings).catch(() => {});
  }

  async function queryTabs(scope) {
    if (scope === "all") return chrome.tabs.query({});
    if (scope === "selected") return chrome.tabs.query({ currentWindow: true, highlighted: true });
    return chrome.tabs.query({ currentWindow: true });
  }

  async function refresh() {
    const tabs = await queryTabs(settings.scope);
    current = F.selectTabs(tabs, { skipBrowserPages: settings.skip, dedupe: settings.dedupe });
    $("preview").value = F.formatTabs(current, settings.format);
    $("count").textContent = String(current.length);
    $("copy").disabled = current.length === 0;
  }

  async function copy() {
    const text = $("preview").value;
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      $("preview").select();
      if (!document.execCommand("copy")) {
        setStatus("Could not access the clipboard", "err");
        return;
      }
    }
    setStatus(`Copied ${current.length} tab${current.length === 1 ? "" : "s"} ✓`, "ok");
  }

  function updateOpenButton() {
    const n = F.extractUrls($("paste").value).length;
    $("open").disabled = n === 0;
    $("open").textContent = n > MAX_OPEN ? `Open first ${MAX_OPEN} of ${n} links` : `Open ${n} link${n === 1 ? "" : "s"}`;
  }

  async function openLinks() {
    const urls = F.extractUrls($("paste").value).slice(0, MAX_OPEN);
    if (!urls.length) return;
    if (settings.newWindow) {
      await chrome.windows.create({ url: urls, focused: true });
    } else {
      for (const url of urls) await chrome.tabs.create({ url, active: false });
    }
    setStatus(`Opened ${urls.length} link${urls.length === 1 ? "" : "s"} ✓`, "ok");
  }

  function selectPanel(which) {
    for (const name of ["copy", "open"]) {
      const on = name === which;
      $("tab-" + name).setAttribute("aria-selected", String(on));
      $("panel-" + name).hidden = !on;
    }
    setStatus("");
    if (which === "open") $("paste").focus();
  }

  async function init() {
    for (const [value, label] of Object.entries(F.FORMATS)) {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      $("format").appendChild(o);
    }
    await loadSettings();
    $("scope").value = settings.scope;
    $("format").value = settings.format;
    $("skip").checked = settings.skip;
    $("dedupe").checked = settings.dedupe;
    $("newWindow").checked = settings.newWindow;

    const onChange = (key, prop) => (e) => {
      settings[key] = e.target[prop];
      saveSettings();
      setStatus("");
      refresh();
    };
    $("scope").addEventListener("change", onChange("scope", "value"));
    $("format").addEventListener("change", onChange("format", "value"));
    $("skip").addEventListener("change", onChange("skip", "checked"));
    $("dedupe").addEventListener("change", onChange("dedupe", "checked"));
    $("newWindow").addEventListener("change", (e) => { settings.newWindow = e.target.checked; saveSettings(); });
    $("copy").addEventListener("click", copy);
    $("paste").addEventListener("input", updateOpenButton);
    $("open").addEventListener("click", openLinks);
    $("tab-copy").addEventListener("click", () => selectPanel("copy"));
    $("tab-open").addEventListener("click", () => selectPanel("open"));

    await refresh();
  }

  init().catch((e) => setStatus("Error: " + e.message, "err"));
})();
