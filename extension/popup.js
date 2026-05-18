// popup.js — Popup UI logic for Local Text Search

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const resultListEl = document.getElementById("resultList");
const resultCountEl = document.getElementById("resultCount");
const resultTimeEl = document.getElementById("resultTime");
const emptyStateEl = document.getElementById("emptyState");
const noConfigEl = document.getElementById("noConfig");

let currentSearchId = null;
let results = [];

// ---- Init ----
document.addEventListener("DOMContentLoaded", async () => {
  // Check config
  const config = await chrome.storage.sync.get({
    directories: [],
    context_chars: 200,
  });

  if (!config.directories || config.directories.length === 0) {
    emptyStateEl.classList.add("hidden");
    noConfigEl.classList.remove("hidden");
  }

  // Load previous selection
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { action: "getSelection" });
      if (response?.text) {
        searchInput.value = response.text;
      }
    }
  } catch {
    // Content script might not be loaded
  }

  // Check if there are cached results from background
  const sessionData = await chrome.storage.session.get("lastSearch");
  if (sessionData.lastSearch) {
    displayResults(
      sessionData.lastSearch.results,
      sessionData.lastSearch.query,
      sessionData.lastSearch.totalMatches,
      sessionData.lastSearch.durationMs
    );
  }
});

// ---- Listen for background messages ----
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.source !== "background") return;

  switch (msg.type) {
    case "search-start":
      currentSearchId = msg.searchId;
      showStatus("info", `Searching for "${truncate(msg.query, 50)}"...`);
      results = [];
      resultsEl.classList.add("hidden");
      emptyStateEl.classList.add("hidden");
      noConfigEl.classList.add("hidden");
      break;

    case "match":
      break;

    case "progress":
      showStatus("info", `Searched ${msg.files_searched} files, found ${msg.matches_found} matches...`);
      break;

    case "search-complete":
      displayResults(msg.results, currentSearchId, msg.totalMatches, msg.durationMs);
      break;

    case "search-error":
      showStatus("error", msg.message);
      break;
  }
});

// ---- Search Button ----
searchBtn.addEventListener("click", () => {
  const query = searchInput.value.trim();
  if (!query) {
    showStatus("error", "Please enter text to search for.");
    return;
  }
  chrome.runtime.sendMessage({ action: "startSearch", query });
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    searchBtn.click();
  }
});

// ---- Settings Button ----
document.getElementById("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("openSettingsBtn")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// ---- Display Results ----
function displayResults(resultsArray, query, totalMatches, durationMs) {
  currentSearchId = query; // used as key
  results = resultsArray;
  statusEl.classList.add("hidden");
  emptyStateEl.classList.add("hidden");
  noConfigEl.classList.add("hidden");

  if (results.length === 0) {
    showStatus("info", "No matches found.");
    return;
  }

  resultListEl.innerHTML = "";

  // Group by file
  const groups = {};
  for (const r of results) {
    if (!groups[r.file]) groups[r.file] = [];
    groups[r.file].push(r);
  }

  const fileCount = Object.keys(groups).length;
  resultCountEl.textContent = `${totalMatches || results.length} matches in ${fileCount} files`;

  if (durationMs) {
    resultTimeEl.textContent = `(${(durationMs / 1000).toFixed(1)}s)`;
  } else {
    resultTimeEl.textContent = "";
  }

  for (const [file, matches] of Object.entries(groups)) {
    const group = document.createElement("div");
    group.className = "result-group";

    const header = document.createElement("div");
    header.className = "result-group-header";

    const pathSpan = document.createElement("span");
    pathSpan.className = "file-path";
    pathSpan.textContent = file;

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "📋";
    copyBtn.title = "Copy file path";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(file).catch(() => {});
    });

    header.appendChild(pathSpan);
    header.appendChild(copyBtn);
    group.appendChild(header);

    for (const m of matches) {
      const item = document.createElement("div");
      item.className = "match-item";

      const lineInfo = document.createElement("div");
      lineInfo.className = "match-line";
      lineInfo.textContent = `Line ${m.line}:${m.column}${m.encoding !== "utf-8" ? ` [${m.encoding}]` : ""}`;

      const context = document.createElement("div");
      context.className = "match-context";

      const beforeText = escapeHtml(m.before || "");
      const matchText = escapeHtml(m.match || "");
      const afterText = escapeHtml(m.after || "");

      context.innerHTML =
        (beforeText ? `<span class="ellipsis">${beforeText}</span>` : "") +
        `<span class="highlight">${matchText}</span>` +
        (afterText ? `<span>${afterText}</span>` : "");

      item.appendChild(lineInfo);
      item.appendChild(context);
      group.appendChild(item);
    }

    resultListEl.appendChild(group);
  }

  resultsEl.classList.remove("hidden");
}

// ---- Helpers ----
function showStatus(type, message) {
  statusEl.className = `status ${type}`;
  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
}

function truncate(str, maxLen) {
  return str.length > maxLen ? str.substring(0, maxLen) + "..." : str;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
