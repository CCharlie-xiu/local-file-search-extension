// popup.js — 独立窗口 UI

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
  // 检查是否有内容
  try {
    const resp = await chrome.runtime.sendMessage({ action: "getContentInfo" });
    if (!resp || !resp.length) {
      waitingState.classList.add("hidden");
      noConfigEl.classList.remove("hidden");
    }
  } catch {
    // ignore
  }

  // 拉取当前选中
  try {
    const response = await chrome.runtime.sendMessage({ action: "getSelection" });
    if (response?.text) {
      selectionDisplay.textContent = response.text;
      selectionDisplay.classList.remove("placeholder");
    }
  } catch {
    // ignore
  }

  // 缓存结果
  try {
    const resp = await chrome.runtime.sendMessage({ action: "getResults" });
    if (resp?.results?.length > 0) {
      displayResults(resp.results, resp.results.length, null);
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

    case "search-complete":
      displayResults(msg.results, msg.totalMatches, msg.durationMs);
      break;

    case "search-error":
      showStatus("error", msg.message);
      break;
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
function displayResults(resultsArray, totalMatches, durationMs) {
  results = resultsArray;
  statusEl.classList.add("hidden");
  waitingState.classList.add("hidden");
  noConfigEl.classList.add("hidden");

  if (results.length === 0) {
    showStatus("info", "❌ 未找到匹配内容");
    return;
  }

  resultListEl.innerHTML = "";
  resultSummary.textContent = `✅ 共 ${totalMatches || results.length} 处匹配`;

  if (durationMs != null) {
    resultTime.textContent = `耗时 ${(durationMs / 1000).toFixed(2)}s`;
  } else {
    resultTime.textContent = "";
  }

  for (const m of results) {
    const item = document.createElement("div");
    item.className = "match-item";

    const lineInfo = document.createElement("div");
    lineInfo.className = "match-line";
    lineInfo.textContent = `第 ${m.line} 行 · 第 ${m.column} 列`;

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
    resultListEl.appendChild(item);
  }

  resultsEl.classList.remove("hidden");
}

// ---- 辅助 ----
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
