// options.js — Settings page for Local Text Search

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

// DOM refs
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

// ---- Load ----
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

// ---- Render Directory List ----
function renderDirList(dirs) {
  dirListEl.innerHTML = "";
  if (!dirs || dirs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "list-item";
    empty.style.color = "#999";
    empty.style.fontStyle = "italic";
    empty.textContent = "No directories added yet";
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
    removeBtn.title = "Remove directory";
    removeBtn.addEventListener("click", () => {
      const newDirs = currentConfig.directories.filter((d) => d !== dir);
      currentConfig.directories = newDirs;
      renderDirList(newDirs);
      markDirty();
    });

    item.appendChild(removeBtn);
    dirListEl.appendChild(item);
  }
}

// ---- Add Directory ----
addDirBtn.addEventListener("click", () => {
  const path = dirInput.value.trim();
  if (!path) return;

  if (currentConfig.directories.includes(path)) {
    saveStatus.textContent = "Directory already exists";
    saveStatus.style.color = "#e74c3c";
    return;
  }

  // Normalize path separators
  const normalized = path.replace(/\\/g, "/");
  currentConfig.directories.push(normalized);
  renderDirList(currentConfig.directories);
  dirInput.value = "";
  markDirty();
});

dirInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addDirBtn.click();
});

// ---- Collect Values ----
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

// ---- Mark Dirty ----
let dirtyTimeout = null;
function markDirty() {
  if (dirtyTimeout) clearTimeout(dirtyTimeout);
  saveStatus.textContent = "Unsaved changes";
  saveStatus.style.color = "#f39c12";
}

// ---- Save ----
saveBtn.addEventListener("click", async () => {
  const config = collectConfig();

  if (!config.directories || config.directories.length === 0) {
    saveStatus.textContent = "Please add at least one directory";
    saveStatus.style.color = "#e74c3c";
    return;
  }

  await chrome.storage.sync.set(config);
  currentConfig = config;

  saveStatus.textContent = "Settings saved! ✓";
  saveStatus.style.color = "#27ae60";
  setTimeout(() => {
    saveStatus.textContent = "";
  }, 3000);
});

// ---- Init ----
document.addEventListener("DOMContentLoaded", loadConfig);

// Auto-save on input changes with debounce
const autoSave = (() => {
  let timer = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const config = collectConfig();
      chrome.storage.sync.set(config).catch(() => {});
      saveStatus.textContent = "Saved ✓";
      saveStatus.style.color = "#27ae60";
    }, 1500);
  };
})();

[filePatterns, excludePatterns, maxFileSize, maxResults, contextChars].forEach((el) => {
  el.addEventListener("input", autoSave);
});
[caseSensitive, regexMode, includeHidden].forEach((el) => {
  el.addEventListener("change", autoSave);
});
