// popup.js — 独立窗口 UI 逻辑

const selectionDisplay = document.getElementById("selectionDisplay");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const resultListEl = document.getElementById("resultList");
const resultSummary = document.getElementById("resultSummary");
const resultTime = document.getElementById("resultTime");
const waitingState = document.getElementById("waitingState");
const noConfigEl = document.getElementById("noConfig");

let currentSearchId = null;
let results = [];

// ---- 初始化 ----
document.addEventListener("DOMContentLoaded", async () => {
  // 检查配置
  const config = await chrome.storage.sync.get({
    directories: [],
    context_chars: 200,
  });

  if (!config.directories || config.directories.length === 0) {
    waitingState.classList.add("hidden");
    noConfigEl.classList.remove("hidden");
  }

  // 尝试拉取当前选中文字
  try {
    const response = await chrome.runtime.sendMessage({ action: "getSelection" });
    if (response?.text) {
      selectionDisplay.textContent = response.text;
      selectionDisplay.classList.remove("placeholder");
    }
  } catch {
    // ignore
  }

  // 检查缓存结果
  try {
    const resp = await chrome.runtime.sendMessage({ action: "getResults" });
    if (resp?.results?.length > 0) {
      displayResults(resp.results, resp.query, resp.results.length, null);
    }
  } catch {
    // ignore
  }
});

// ---- 监听 background 消息 ----
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.source !== "background") return;

  switch (msg.type) {
    case "search-start":
      currentSearchId = msg.searchId;
      selectionDisplay.textContent = msg.query;
      selectionDisplay.classList.remove("placeholder");
      showStatus("info", `🔍 正在搜索 "${truncate(msg.query, 60)}"...`);
      results = [];
      resultsEl.classList.add("hidden");
      waitingState.classList.add("hidden");
      noConfigEl.classList.add("hidden");
      break;

    case "progress":
      showStatus("info", `📁 已搜索 ${msg.files_searched} 个文件，找到 ${msg.matches_found} 处匹配...`);
      break;

    case "search-complete":
      displayResults(msg.results, currentSearchId, msg.totalMatches, msg.durationMs);
      break;

    case "search-error":
      showStatus("error", msg.message);
      break;
  }
});

// ---- 手动搜索 ----
document.getElementById("searchBtn").addEventListener("click", () => {
  const text = selectionDisplay.textContent;
  if (text && !text.includes("在网页上选中")) {
    chrome.runtime.sendMessage({ action: "startSearch", query: text });
  }
});

// ---- 设置按钮 ----
document.getElementById("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("openSettingsBtn")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// ---- 展示结果 ----
function displayResults(resultsArray, query, totalMatches, durationMs) {
  results = resultsArray;
  statusEl.classList.add("hidden");
  waitingState.classList.add("hidden");
  noConfigEl.classList.add("hidden");

  if (results.length === 0) {
    showStatus("info", "❌ 未找到匹配内容");
    return;
  }

  resultListEl.innerHTML = "";

  // 按文件分组
  const groups = {};
  for (const r of results) {
    if (!groups[r.file]) groups[r.file] = [];
    groups[r.file].push(r);
  }

  const fileCount = Object.keys(groups).length;
  const total = totalMatches || results.length;
  resultSummary.textContent = `✅ 共 ${total} 处匹配（分布在 ${fileCount} 个文件）`;

  if (durationMs) {
    resultTime.textContent = `耗时 ${(durationMs / 1000).toFixed(1)}s`;
  } else {
    resultTime.textContent = "";
  }

  for (const [file, matches] of Object.entries(groups)) {
    const group = document.createElement("div");
    group.className = "result-group";

    // 文件头
    const header = document.createElement("div");
    header.className = "result-group-header";

    const pathSpan = document.createElement("span");
    pathSpan.className = "file-path";
    pathSpan.textContent = file;

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "📋";
    copyBtn.title = "复制文件路径";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(file).catch(() => {});
      copyBtn.textContent = "✅";
      setTimeout(() => { copyBtn.textContent = "📋"; }, 1500);
    });

    header.appendChild(pathSpan);
    header.appendChild(copyBtn);
    group.appendChild(header);

    // 匹配项
    for (const m of matches) {
      const item = document.createElement("div");
      item.className = "match-item";

      const lineInfo = document.createElement("div");
      lineInfo.className = "match-line";
      lineInfo.textContent = `第 ${m.line} 行 · 第 ${m.column} 列${m.encoding !== "utf-8" ? ` [${m.encoding}]` : ""}`;

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

// ---- 辅助函数 ----
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
