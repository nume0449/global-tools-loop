// offscreen.js — receives text from the service worker and copies it.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen" || msg.type !== "copy") return;
  let ok = false;
  try {
    const ta = document.getElementById("t");
    ta.value = msg.text;
    ta.select();
    ok = document.execCommand("copy");
  } catch (e) {
    ok = false;
  }
  sendResponse({ ok });
});
