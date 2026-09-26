// content.js — runs in the page, extracts + copies to clipboard, shows a toast.
(function () {
  "use strict";

  function showToast(message, isError) {
    const existing = document.getElementById("__cleancopy_toast__");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "__cleancopy_toast__";
    toast.textContent = message;
    toast.style.cssText = [
      "position:fixed", "bottom:24px", "right:24px", "z-index:2147483647",
      "background:" + (isError ? "#B91C1C" : "#111827"), "color:#fff",
      "padding:10px 16px", "border-radius:8px", "font:14px/1.4 -apple-system,system-ui,sans-serif",
      "box-shadow:0 4px 16px rgba(0,0,0,.25)", "opacity:0", "transition:opacity .15s ease",
    ].join(";");
    document.documentElement.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = "1"; });
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 200);
    }, 2200);
  }

  try {
    const markdown = self.CleanCopyExtract.extractMarkdown(document);
    navigator.clipboard.writeText(markdown).then(
      () => showToast("Copied page as Markdown ✓"),
      () => showToast("Clipboard permission denied", true)
    );
  } catch (err) {
    showToast("CleanCopy failed: " + err.message, true);
  }
})();
