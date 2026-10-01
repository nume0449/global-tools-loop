// background.js — MV3 service worker.
// Toolbar click -> extract Markdown in the page -> copy via an offscreen
// document -> show a toast in the page.
//
// The clipboard write happens in an offscreen document (Chrome's documented
// MV3 pattern) instead of in the page, so it does not depend on the page
// being focused or on the page's own clipboard permission state.

const OFFSCREEN_URL = "offscreen.html";

async function copyViaOffscreen(text) {
  const has = chrome.offscreen.hasDocument ? await chrome.offscreen.hasDocument() : false;
  if (!has) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: "Write the extracted Markdown to the clipboard.",
    });
  }
  try {
    const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "copy", text });
    return !!(res && res.ok);
  } finally {
    await chrome.offscreen.closeDocument().catch(() => {});
  }
}

// Runs in the page. Must be self-contained (it is serialized by executeScript).
function showToast(message, isError) {
  const existing = document.getElementById("__cleancopy_toast__");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "__cleancopy_toast__";
  toast.textContent = message;
  toast.style.cssText = [
    "position:fixed", "bottom:24px", "right:24px", "z-index:2147483647",
    "background:" + (isError ? "#B91C1C" : "#111827"), "color:#fff",
    "padding:10px 16px", "border-radius:8px",
    "font:14px/1.4 -apple-system,system-ui,sans-serif",
    "box-shadow:0 4px 16px rgba(0,0,0,.25)", "opacity:0",
    "transition:opacity .15s ease", "pointer-events:none",
  ].join(";");
  document.documentElement.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = "1"; });
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 200);
  }, 2200);
}

async function flashBadge(text) {
  await chrome.action.setBadgeBackgroundColor({ color: "#B91C1C" });
  await chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id || !tab.url || !/^https?:/.test(tab.url)) {
    await flashBadge("!");
    return;
  }
  const target = { tabId: tab.id };
  try {
    await chrome.scripting.executeScript({ target, files: ["lib/extract.js"] });
    const [{ result: markdown }] = await chrome.scripting.executeScript({
      target,
      func: () => self.CleanCopyExtract.extractMarkdown(document),
    });
    const ok = typeof markdown === "string" && markdown.trim() && (await copyViaOffscreen(markdown));
    await chrome.scripting.executeScript({
      target,
      func: showToast,
      args: ok ? ["Copied page as Markdown ✓", false] : ["Could not copy this page", true],
    });
  } catch (err) {
    // Restricted pages (Chrome Web Store, chrome://, PDF viewer) reject injection.
    console.warn("CleanCopy failed:", err);
    await flashBadge("!");
  }
});
