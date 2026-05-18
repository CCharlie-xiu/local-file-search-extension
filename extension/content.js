// content.js — 实时捕捉选中文字并发送到 background

let currentSelection = "";
let debounceTimer = null;

function sendSelection(text) {
  if (text) {
    chrome.runtime.sendMessage({ action: "selectionChanged", text: text }).catch(() => {});
  }
}

document.addEventListener("mouseup", () => {
  const sel = window.getSelection();
  const text = sel ? sel.toString().trim() : "";

  if (text && text !== currentSelection) {
    currentSelection = text;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      sendSelection(text);
    }, 400);
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (text) {
      currentSelection = text;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        sendSelection(text);
      }, 400);
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSelection") {
    sendResponse({ text: currentSelection });
  }
});
