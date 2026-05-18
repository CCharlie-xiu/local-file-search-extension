// background.js — Service worker for Local Text Search
// Handles context menu, native messaging, result aggregation

const HOST_NAME = "com.localtextsearch.host";
const SEARCH_TIMEOUT_MS = 30000;

const DEFAULT_CONFIG = {
  directories: [],
  file_patterns: ["*.*"],
  exclude_patterns: ["node_modules", ".git", "__pycache__", ".venv", "venv"],
  max_file_size_mb: 10,
  max_results: 100,
  case_sensitive: false,
  regex_mode: false,
  context_chars: 200,
  include_hidden: false,
  max_directory_depth: 0,
};

// ---- Context Menu ----
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "search-selection",
    title: 'Search local files for "%s"',
    contexts: ["selection"],
  });
});

// ---- State ----
let currentPort = null;
let currentResults = [];
let currentSearchId = null;
let currentQuery = "";
let searchTimer = null;

// ---- Context Menu Handler ----
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "search-selection" && info.selectionText) {
    const query = info.selectionText.trim().substring(0, 1000);
    startSearch(query);
  }
});

// ---- Message Handlers (from popup) ----
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startSearch") {
    startSearch(request.query);
    sendResponse({ success: true });
  } else if (request.action === "getResults") {
    sendResponse({
      results: currentResults,
      query: currentQuery,
      searchId: currentSearchId,
    });
  } else if (request.action === "getSelection") {
    // Forward to content script of active tab
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          const response = await chrome.tabs.sendMessage(tabs[0].id, { action: "getSelection" });
          sendResponse(response);
        } else {
          sendResponse({ text: "" });
        }
      } catch {
        sendResponse({ text: "" });
      }
    })();
    return true; // Keep channel open for async response
  }
});

// ---- Main Search Function ----
function startSearch(query) {
  // Cancel previous search
  cleanup();

  currentQuery = query;
  currentResults = [];
  currentSearchId = "search_" + Date.now();

  // Notify popup that search is starting
  notifyPopup({ type: "search-start", query, searchId: currentSearchId });

  // Read config
  chrome.storage.sync.get(DEFAULT_CONFIG, (config) => {
    // Validate config
    if (!config.directories || config.directories.length === 0) {
      notifyPopup({
        type: "search-error",
        message: "No search directories configured. Please open extension settings to add directories.",
        searchId: currentSearchId,
      });
      return;
    }

    // Connect native host
    try {
      currentPort = chrome.runtime.connectNative(HOST_NAME);
    } catch (e) {
      notifyPopup({
        type: "search-error",
        message: "Failed to connect to native host. Please run scripts/install.bat to register the native messaging host.",
        searchId: currentSearchId,
      });
      return;
    }

    // Timeout
    searchTimer = setTimeout(() => {
      notifyPopup({
        type: "search-error",
        message: "Search timed out after 30 seconds. Try narrowing your search directories.",
        searchId: currentSearchId,
      });
      cleanup();
    }, SEARCH_TIMEOUT_MS);

    // Port listeners
    currentPort.onMessage.addListener(handleNativeMessage);
    currentPort.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        notifyPopup({
          type: "search-error",
          message: "Native host disconnected: " + chrome.runtime.lastError.message,
          searchId: currentSearchId,
        });
      }
      currentPort = null;
    });

    // Send search request
    const msg = {
      type: "search",
      query: query,
      search_id: currentSearchId,
      config: {
        directories: config.directories,
        file_patterns: config.file_patterns,
        exclude_patterns: config.exclude_patterns,
        max_file_size_mb: config.max_file_size_mb,
        max_results: config.max_results,
        case_sensitive: config.case_sensitive,
        regex_mode: config.regex_mode,
        context_chars: config.context_chars,
        include_hidden: config.include_hidden,
        max_directory_depth: config.max_directory_depth,
      },
    };

    try {
      currentPort.postMessage(msg);
    } catch (e) {
      notifyPopup({
        type: "search-error",
        message: "Failed to send search request: " + e.message,
        searchId: currentSearchId,
      });
      cleanup();
    }
  });
}

// ---- Native Message Handler ----
function handleNativeMessage(msg) {
  if (msg.search_id !== currentSearchId) return;

  switch (msg.type) {
    case "match":
      currentResults.push({
        file: msg.file,
        line: msg.line,
        column: msg.column,
        before: msg.before,
        match: msg.match,
        after: msg.after,
        encoding: msg.encoding,
        matchIndex: msg.match_index,
      });
      notifyPopup({ type: "match", ...msg });
      break;

    case "progress":
      notifyPopup({ type: "progress", ...msg });
      break;

    case "complete":
      if (searchTimer) clearTimeout(searchTimer);
      notifyPopup({
        type: "search-complete",
        results: currentResults,
        totalMatches: msg.total_matches,
        durationMs: msg.duration_ms,
        errors: msg.errors,
        searchId: currentSearchId,
      });
      // Store in session for popup
      chrome.storage.session.set({
        lastSearch: {
          query: currentQuery,
          results: currentResults,
          searchId: currentSearchId,
          totalMatches: msg.total_matches,
          durationMs: msg.duration_ms,
        },
      });
      cleanup();
      break;

    case "error":
      notifyPopup({ type: "search-error", message: msg.message, searchId: currentSearchId });
      if (msg.fatal) cleanup();
      break;

    case "pong":
      // Health check response
      break;
  }
}

// ---- Notify Popup ----
function notifyPopup(data) {
  try {
    chrome.runtime.sendMessage({ source: "background", ...data }).catch(() => {
      // Popup may not be open — that's fine
    });
  } catch {
    // Ignore
  }
}

// ---- Cleanup ----
function cleanup() {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  if (currentPort) {
    try {
      currentPort.disconnect();
    } catch {
      // Already disconnected
    }
    currentPort = null;
  }
}
