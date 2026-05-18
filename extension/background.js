// background.js — 后台服务工作线程
// 管理独立窗口、实时搜索、Native Messaging 通信

const HOST_NAME = "com.localtextsearch.host";
const SEARCH_TIMEOUT_MS = 30000;
const WINDOW_WIDTH = 640;
const WINDOW_HEIGHT = 540;

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

// ---- 状态 ----
let currentPort = null;
let currentResults = [];
let currentSearchId = null;
let currentQuery = "";
let searchTimer = null;
let searchDebounceTimer = null;

// ============================================================
//  独立窗口管理
// ============================================================

async function ensureWindow() {
  const data = await chrome.storage.session.get("windowId");
  const windowId = data.windowId;

  if (windowId) {
    try {
      const win = await chrome.windows.get(windowId);
      if (win) return win;
    } catch {
      // 窗口已关闭，忽略
    }
  }

  return createWindow();
}

async function createWindow() {
  try {
    const win = await chrome.windows.create({
      url: "popup.html",
      type: "popup",
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      focused: true,
    });
    if (win?.id) {
      await chrome.storage.session.set({ windowId: win.id });
    }
    return win;
  } catch (e) {
    console.error("创建窗口失败:", e);
    return null;
  }
}

async function focusWindow() {
  const win = await ensureWindow();
  if (win?.id) {
    try {
      await chrome.windows.update(win.id, { focused: true });
    } catch {
      // 忽略
    }
  }
}

// ============================================================
//  事件：安装 / 启动
// ============================================================

chrome.runtime.onInstalled.addListener((details) => {
  // 创建右键菜单
  chrome.contextMenus.create({
    id: "search-selection",
    title: '在本地文件中搜索 "%s"',
    contexts: ["selection"],
  });

  // 首次安装打开窗口
  if (details.reason === "install") {
    createWindow();
  }
});

// Chrome 启动时打开窗口
chrome.runtime.onStartup.addListener(() => {
  createWindow();
});

// ============================================================
//  事件：点击扩展图标 → 打开/聚焦窗口
// ============================================================

chrome.action.onClicked.addListener(() => {
  focusWindow();
});

// ============================================================
//  事件：右键菜单
// ============================================================

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "search-selection" && info.selectionText) {
    const query = info.selectionText.trim().substring(0, 1000);
    focusWindow().then(() => {
      setTimeout(() => startSearch(query), 300);
    });
  }
});

// ============================================================
//  消息处理（来自 content.js 和 popup 窗口）
// ============================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {

    // content.js 实时选中文字更新
    case "selectionChanged":
      handleSelectionChange(request.text);
      break;

    // 窗口手动搜索
    case "startSearch":
      startSearch(request.query);
      sendResponse({ success: true });
      break;

    // 窗口查询当前选中（打开时主动拉取）
    case "getSelection":
      (async () => {
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs[0]?.id) {
            const resp = await chrome.tabs.sendMessage(tabs[0].id, { action: "getSelection" });
            sendResponse(resp);
          } else {
            sendResponse({ text: "" });
          }
        } catch {
          sendResponse({ text: "" });
        }
      })();
      return true;

    // 窗口查询当前结果
    case "getResults":
      sendResponse({
        results: currentResults,
        query: currentQuery,
        searchId: currentSearchId,
      });
      break;
  }
});

// ============================================================
//  选中文字处理（防抖）
// ============================================================

function handleSelectionChange(text) {
  if (!text) return;

  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    startSearch(text);
  }, 500);
}

// ============================================================
//  搜索核心逻辑
// ============================================================

function startSearch(query) {
  cleanup(); // 取消上次搜索

  currentQuery = query;
  currentResults = [];
  currentSearchId = "search_" + Date.now();

  notifyWindow({ type: "search-start", query, searchId: currentSearchId });

  chrome.storage.sync.get(DEFAULT_CONFIG, (config) => {
    if (!config.directories || config.directories.length === 0) {
      notifyWindow({
        type: "search-error",
        message: "⚠️ 未配置搜索目录，请点击 ⚙ 设置添加",
        searchId: currentSearchId,
      });
      return;
    }

    try {
      currentPort = chrome.runtime.connectNative(HOST_NAME);
    } catch {
      notifyWindow({
        type: "search-error",
        message: "⚠️ 无法连接 Native Host，请运行 scripts/install.bat",
        searchId: currentSearchId,
      });
      return;
    }

    searchTimer = setTimeout(() => {
      notifyWindow({
        type: "search-error",
        message: "⏱ 搜索超时（30秒），请缩小搜索目录范围",
        searchId: currentSearchId,
      });
      cleanup();
    }, SEARCH_TIMEOUT_MS);

    currentPort.onMessage.addListener(handleNativeMessage);
    currentPort.onDisconnect.addListener(() => {
      currentPort = null;
    });

    const msg = {
      type: "search",
      query,
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
      notifyWindow({
        type: "search-error",
        message: "发送搜索请求失败: " + e.message,
        searchId: currentSearchId,
      });
      cleanup();
    }
  });
}

// ============================================================
//  Native Messaging 响应处理
// ============================================================

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
      break;

    case "progress":
      notifyWindow({
        type: "progress",
        files_searched: msg.files_searched,
        matches_found: msg.matches_found,
        searchId: currentSearchId,
      });
      break;

    case "complete":
      if (searchTimer) clearTimeout(searchTimer);
      notifyWindow({
        type: "search-complete",
        results: currentResults,
        totalMatches: msg.total_matches,
        durationMs: msg.duration_ms,
        errors: msg.errors,
        searchId: currentSearchId,
      });
      cleanup();
      break;

    case "error":
      notifyWindow({ type: "search-error", message: msg.message, searchId: currentSearchId });
      if (msg.fatal) cleanup();
      break;
  }
}

// ============================================================
//  推送消息到独立窗口
// ============================================================

function notifyWindow(data) {
  try {
    chrome.runtime.sendMessage({ source: "background", ...data }).catch(() => {});
  } catch {
    // ignore
  }
}

// ============================================================
//  清理
// ============================================================

function cleanup() {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  if (currentPort) {
    try { currentPort.disconnect(); } catch { /* ignore */ }
    currentPort = null;
  }
}
