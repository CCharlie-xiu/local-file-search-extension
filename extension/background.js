// background.js — 后台服务工作线程
// 无 Native Messaging，纯内存搜索已保存的内容

const DEFAULT_CONFIG = {
  context_chars: 200,
  max_results: 100,
  case_sensitive: false,
  regex_mode: false,
};

let currentResults = [];
let currentSearchId = null;
let currentQuery = "";
let searchDebounceTimer = null;

// ============================================================
//  事件：安装 → 右键菜单
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "search-selection",
    title: '在已保存内容中搜索 "%s"',
    contexts: ["selection"],
  });
});

// ============================================================
//  事件：右键菜单
// ============================================================

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "search-selection" && info.selectionText) {
    startSearch(info.selectionText.trim().substring(0, 1000));
  }
});

// ============================================================
//  消息处理
// ============================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "selectionChanged":
      handleSelectionChange(request.text);
      break;
    case "startSearch":
      startSearch(request.query);
      sendResponse({ success: true });
      break;
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
    case "getResults":
      sendResponse({ results: currentResults, query: currentQuery, searchId: currentSearchId });
      break;
    case "getContentInfo":
      (async () => {
        const data = await chrome.storage.local.get("savedContent");
        const content = data.savedContent || "";
        sendResponse({ length: content.length, chars: content.length });
      })();
      return true;
  }
});

// ============================================================
//  选中文字处理（防抖 500ms）
// ============================================================

function handleSelectionChange(text) {
  if (!text) return;
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => startSearch(text), 500);
}

// ============================================================
//  搜索核心逻辑（纯内存）
// ============================================================

function startSearch(query) {
  currentQuery = query;
  currentResults = [];
  currentSearchId = "search_" + Date.now();

  notifyWindow({ type: "search-start", query, searchId: currentSearchId });

  chrome.storage.local.get("savedContent", (localData) => {
    const content = localData.savedContent || "";
    if (!content) {
      notifyWindow({
        type: "search-error",
        message: "⚠️ 尚未粘贴内容，请点击 ⚙ 设置粘贴 .md 内容",
        searchId: currentSearchId,
      });
      return;
    }

    chrome.storage.sync.get(DEFAULT_CONFIG, (config) => {
      const t0 = performance.now();
      const results = searchContent(query, content, config);
      const durationMs = Math.round(performance.now() - t0);

      currentResults = results;
      notifyWindow({
        type: "search-complete",
        results,
        totalMatches: results.length,
        durationMs,
        searchId: currentSearchId,
      });
    });
  });
}

// ============================================================
//  内容搜索实现
// ============================================================

function searchContent(query, content, config) {
  const results = [];
  const maxResults = config.max_results || 100;
  const contextChars = config.context_chars || 200;
  const caseSensitive = config.case_sensitive || false;
  const regexMode = config.regex_mode || false;

  if (!content || !query) return results;

  if (regexMode) {
    try {
      const flags = caseSensitive ? "g" : "gi";
      const re = new RegExp(query, flags);
      let m;
      while ((m = re.exec(content)) !== null) {
        const idx = m.index;
        results.push(buildMatch(content, idx, idx + m[0].length, contextChars));
        if (results.length >= maxResults) break;
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    } catch {
      // 正则语法错误
    }
  } else {
    const searchContent = caseSensitive ? content : content.toLowerCase();
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    let idx = 0;
    while ((idx = searchContent.indexOf(searchQuery, idx)) !== -1) {
      results.push(buildMatch(content, idx, idx + query.length, contextChars));
      idx += 1;
      if (results.length >= maxResults) break;
    }
  }

  return results;
}

function buildMatch(content, start, end, contextChars) {
  const lineNum = content.substring(0, start).split("\n").length;
  const colNum = start - content.lastIndexOf("\n", start - 1);
  const beforeStart = Math.max(0, start - 200);

  return {
    file: "📄 已保存的内容",
    line: lineNum,
    column: Math.max(0, colNum),
    before: content.substring(beforeStart, start),
    match: content.substring(start, end),
    after: content.substring(end, end + contextChars),
  };
}

// ============================================================
//  推送消息到 popup 窗口
// ============================================================

function notifyWindow(data) {
  try {
    chrome.runtime.sendMessage({ source: "background", ...data }).catch(() => {});
  } catch {
    // ignore
  }
}
