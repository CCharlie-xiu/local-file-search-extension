// options.js — 设置页：粘贴 .md 内容 + 搜索选项

const DEFAULT_CONFIG = {
  context_chars: 200,
  max_results: 100,
  case_sensitive: false,
  regex_mode: false,
};

// DOM
const contentTextarea = document.getElementById("contentTextarea");
const contentStats = document.getElementById("contentStats");
const caseSensitive = document.getElementById("caseSensitive");
const regexMode = document.getElementById("regexMode");
const maxResults = document.getElementById("maxResults");
const contextChars = document.getElementById("contextChars");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const saveStatus = document.getElementById("saveStatus");

// ---- 加载 ----
async function loadAll() {
  // 加载内容
  const localData = await chrome.storage.local.get("savedContent");
  contentTextarea.value = localData.savedContent || "";
  updateStats();

  // 加载设置
  const config = await chrome.storage.sync.get(DEFAULT_CONFIG);
  caseSensitive.checked = config.case_sensitive;
  regexMode.checked = config.regex_mode;
  maxResults.value = config.max_results;
  contextChars.value = config.context_chars;
}

// ---- 字数统计 ----
function updateStats() {
  const len = contentTextarea.value.length;
  contentStats.textContent = `${len.toLocaleString()} 字`;
}

contentTextarea.addEventListener("input", updateStats);

// ---- 保存 ----
saveBtn.addEventListener("click", async () => {
  const content = contentTextarea.value.trim();
  if (!content) {
    saveStatus.textContent = "⚠️ 内容为空，请先粘贴 .md 内容";
    saveStatus.style.color = "#ef4444";
    return;
  }

  // 保存内容到 local
  await chrome.storage.local.set({ savedContent: content });

  // 保存设置到 sync
  await chrome.storage.sync.set({
    case_sensitive: caseSensitive.checked,
    regex_mode: regexMode.checked,
    max_results: parseInt(maxResults.value) || 100,
    context_chars: parseInt(contextChars.value) || 200,
  });

  saveStatus.textContent = `✅ 已保存！共 ${content.length.toLocaleString()} 字`;
  saveStatus.style.color = "#10b981";
  setTimeout(() => { saveStatus.textContent = ""; }, 3000);
});

// ---- 清空 ----
clearBtn.addEventListener("click", async () => {
  if (contentTextarea.value && !confirm("确定清空已保存的内容？")) return;
  contentTextarea.value = "";
  updateStats();
  await chrome.storage.local.set({ savedContent: "" });
  saveStatus.textContent = "✅ 已清空";
  saveStatus.style.color = "#10b981";
  setTimeout(() => { saveStatus.textContent = ""; }, 2000);
});

// ---- Ctrl+S 快捷键 ----
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveBtn.click();
  }
});

// ---- 初始化 ----
document.addEventListener("DOMContentLoaded", loadAll);
