// popup.js — 独立窗口 UI（支持 Markdown 渲染）

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
      (beforeText ? `<span class="ellipsis">${renderMd(beforeText)}</span>` : "") +
      `<span class="highlight">${renderMd(matchText)}</span>` +
      (afterText ? `<span>${renderMd(afterText)}</span>` : "");

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

// ---- 内联 Markdown 渲染器 ----
// 将已转义 HTML 中的 markdown 语法转为 HTML 标签
function renderMd(text) {
  if (!text) return "";

  // 必须按顺序处理，避免冲突

  // 1. 代码块 ```code``` → <pre><code>
  // 先保护行内代码，避免内部格式被误转
  let codes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    codes.push(code);
    return `\x00CODE${codes.length - 1}\x00`;
  });

  // 2. 图片 ![alt](url) → 过滤掉
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

  // 3. 链接 [text](url) → <a>
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" title="$1">$1</a>');

  // 4. 加粗 **text** 或 __text__
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // 5. 删除线 ~~text~~
  text = text.replace(/~~([^~]+)~~/g, "<s>$1</s>");

  // 6. 斜体 *text* 或 _text_（宽松匹配，避免单个 *)
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  text = text.replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>");

  // 7. 行首标记
  const lines = text.split("\n");
  const rendered = lines.map((line) => {
    let l = line;

    // 标题 # ~ ######
    l = l.replace(/^#{1,6}\s+(.*)$/, '<strong class="md-heading">$1</strong>');

    // 引用 >
    l = l.replace(/^>\s+(.*)$/, '<span class="md-blockquote">$1</span>');

    // 无序列表 - 或 *
    l = l.replace(/^[\s]*[-*+]\s+(.*)$/, '<span class="md-list-item">• $1</span>');

    // 有序列表 1.
    l = l.replace(/^[\s]*\d+\.\s+(.*)$/, '<span class="md-list-item">$1</span>');

    // 分隔符 --- 或 ***
    if (/^-{3,}$/.test(l) || /^\*{3,}$/.test(l)) {
      l = '<hr class="md-hr">';
    }

    return l;
  });

  text = rendered.join("\n");

  // 8. 恢复行内代码
  text = text.replace(/\x00CODE(\d+)\x00/g, (_, idx) => {
    return `<code class="md-code">${codes[parseInt(idx)]}</code>`;
  });

  // 9. 换行转 <br>
  text = text.replace(/\n/g, "<br>");

  return text;
}
