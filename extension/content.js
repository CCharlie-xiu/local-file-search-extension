// content.js — Detects text selection on web pages

let currentSelection = "";

document.addEventListener("mouseup", () => {
  const selection = window.getSelection();
  currentSelection = selection ? selection.toString().trim() : "";
});

document.addEventListener("keyup", (e) => {
  // Also capture Ctrl+C or Cmd+C style selections
  if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
    const selection = window.getSelection();
    currentSelection = selection ? selection.toString().trim() : "";
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSelection") {
    sendResponse({ text: currentSelection });
  }
});
