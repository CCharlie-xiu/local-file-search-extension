// options.js — 设置页逻辑

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

// DOM
const dirListEl = document.getElementById("dirList");
const dirInput = document.getElementById("dirInput");
const addDirBtn = document.getElementById("addDirBtn");
const filePatterns = document.getElementById("filePatterns");
const excludePatterns = document.getElementById("excludePatterns");
const caseSensitive = document.getElementById("caseSensitive");
const regexMode = document.getElementById("regexMode");
const includeHidden = document.getElementById("includeHidden");
const maxFileSize = document.getElementById("maxFileSize");
const maxResults = document.getElementById("maxResults");
const contextChars = document.getElementById("contextChars");
const saveBtn = document.getElementById("saveBtn");
const saveStatus = document.getElementById("saveStatus");

let currentConfig = { ...DEFAULT_CONFIG };

// ---- 加载配置 ----
async function loadConfig() {
  const config = await chrome.storage.sync.get(DEFAULT_CONFIG);
  currentConfig = config;

  renderDirList(config.directories);
  filePatterns.value = (config.file_patterns || []).join(", ");
  excludePatterns.value = (config.exclude_patterns || []).join(", ");
  caseSensitive.checked = config.case_sensitive;
  regexMode.checked = config.regex_mode;
  includeHidden.checked = config.include_hidden;
  maxFileSize.value = config.max_file_size_mb;
  maxResults.value = config.max_results;
  contextChars.value = config.context_chars;
}

// ---- 渲染目录列表 ----
function renderDirList(dirs) {
  dirListEl.innerHTML = "";
  if (!dirs || dirs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "list-item";
    empty.style.color = "#9ca3af";
    empty.style.fontStyle = "italic";
    empty.textContent = "尚未添加任何目录";
    dirListEl.appendChild(empty);
    return;
  }

  for (const dir of dirs) {
    const item = document.createElement("div");
    item.className = "list-item";
    item.textContent = dir;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "×";
    removeBtn.title = "删除此目录";
    removeBtn.addEventListener("click", () => {
      currentConfig.directories = currentConfig.directories.filter((d) => d !== dir);
      renderDirList(currentConfig.directories);
      markDirty();
    });

    item.appendChild(removeBtn);
    dirListEl.appendChild(item);
  }
}

// ---- 添加目录 ----
addDirBtn.addEventListener("click", () => {
  const path = dirInput.value.trim();
  if (!path) return;

  if (currentConfig.directories.includes(path)) {
    saveStatus.textContent = "⚠️ 目录已存在";
    saveStatus.style.color = "#f59e0b";
    return;
  }

  // 统一分隔符
  const normalized = path.replace(/\\/g, "/");
  currentConfig.directories.push(normalized);
  renderDirList(currentConfig.directories);
  dirInput.value = "";
  markDirty();
});

dirInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addDirBtn.click();
});

// ---- 收集值 ----
function collectConfig() {
  return {
    directories: currentConfig.directories,
    file_patterns: filePatterns.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    exclude_patterns: excludePatterns.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    case_sensitive: caseSensitive.checked,
    regex_mode: regexMode.checked,
    include_hidden: includeHidden.checked,
    max_file_size_mb: parseInt(maxFileSize.value) || 10,
    max_results: parseInt(maxResults.value) || 100,
    context_chars: parseInt(contextChars.value) || 200,
    max_directory_depth: 0,
  };
}

// ---- 标记未保存 ----
function markDirty() {
  saveStatus.textContent = "有未保存的更改";
  saveStatus.style.color = "#f59e0b";
}

// ---- 保存 ----
saveBtn.addEventListener("click", async () => {
  const config = collectConfig();

  if (!config.directories || config.directories.length === 0) {
    saveStatus.textContent = "⚠️ 请至少添加一个搜索目录";
    saveStatus.style.color = "#ef4444";
    return;
  }

  await chrome.storage.sync.set(config);
  currentConfig = config;

  saveStatus.textContent = "✅ 设置已保存！";
  saveStatus.style.color = "#10b981";
  setTimeout(() => { saveStatus.textContent = ""; }, 3000);
});

// ---- 自动保存 ----
const autoSave = (() => {
  let timer = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const config = collectConfig();
      chrome.storage.sync.set(config).catch(() => {});
      saveStatus.textContent = "✅ 已自动保存";
      saveStatus.style.color = "#10b981";
    }, 1500);
  };
})();

[filePatterns, excludePatterns, maxFileSize, maxResults, contextChars].forEach((el) => {
  el.addEventListener("input", autoSave);
});
[caseSensitive, regexMode, includeHidden].forEach((el) => {
  el.addEventListener("change", autoSave);
});

// ---- 初始化 ----
document.addEventListener("DOMContentLoaded", loadConfig);
