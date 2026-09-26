// background.js — MV3 service worker. Injects lib/extract.js then content.js
// into the active tab whenever the toolbar icon is clicked.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/extract.js", "content.js"],
    });
  } catch (err) {
    // Injection can fail on restricted pages (chrome://, Web Store, etc).
    console.warn("CleanCopy: injection failed", err);
  }
});
