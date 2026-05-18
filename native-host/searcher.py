import os
import re
import fnmatch


DEFAULT_EXCLUDE_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    ".svn", ".hg", "bower_components", "vendor", ".idea", ".vscode"
}

BINARY_EXTENSIONS = {
    ".exe", ".dll", ".so", ".dylib", ".bin", ".dat", ".png", ".jpg",
    ".jpeg", ".gif", ".bmp", ".ico", ".pdf", ".zip", ".tar", ".gz",
    ".rar", ".7z", ".mp3", ".mp4", ".avi", ".mov", ".wmv", ".flv",
    ".woff", ".woff2", ".ttf", ".eot", ".o", ".a", ".lib", ".obj"
}


def is_binary(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    if ext in BINARY_EXTENSIONS:
        return True
    try:
        with open(filepath, "rb") as f:
            chunk = f.read(8192)
        return b"\0" in chunk
    except OSError:
        return True


def read_file_safe(filepath):
    encodings = ["utf-8", "gbk", "gb2312", "gb18030", "latin-1"]
    for enc in encodings:
        try:
            with open(filepath, "r", encoding=enc) as f:
                return f.read(), enc
        except (UnicodeDecodeError, OSError):
            continue
    return None, None


def search_file(filepath, query, config):
    """Search a single file for the query. Yields match dicts."""
    try:
        file_size = os.path.getsize(filepath)
        max_bytes = config.get("max_file_size_mb", 10) * 1024 * 1024
        if file_size > max_bytes:
            return
    except OSError:
        return

    if is_binary(filepath):
        return

    content, encoding = read_file_safe(filepath)
    if content is None:
        return

    case_sensitive = config.get("case_sensitive", False)
    regex_mode = config.get("regex_mode", False)
    context_chars = config.get("context_chars", 200)

    if not case_sensitive:
        search_content = content
        search_query = query
    else:
        search_content = content
        search_query = query

    if regex_mode:
        flags = 0 if case_sensitive else re.IGNORECASE
        try:
            pattern = re.compile(search_query, flags)
        except re.error:
            return
        matches = pattern.finditer(search_content)
        for m in matches:
            start = m.start()
            end = m.end()
            yield build_match(filepath, content, start, end, context_chars, encoding)
    else:
        # Plain text substring search
        col = 0
        while True:
            idx = search_content.find(search_query, col)
            if idx == -1:
                break
            yield build_match(filepath, content, idx, idx + len(query), context_chars, encoding)
            col = idx + 1


def build_match(filepath, content, start, end, context_chars, encoding):
    line_number = content[:start].count("\n") + 1
    col_number = start - content.rfind("\n", 0, start) - 1

    before_start = max(0, start - 200)
    before = content[before_start:start]

    matched = content[start:end]

    after = content[end:end + context_chars]

    rel_path = os.path.normpath(filepath)

    return {
        "file": rel_path,
        "line": line_number,
        "column": max(0, col_number),
        "before": before,
        "match": matched,
        "after": after,
        "encoding": encoding,
    }


def search_files(config, query, progress_callback=None):
    """Search all configured directories for the query. Yields match dicts."""
    directories = config.get("directories", [])
    file_patterns = config.get("file_patterns", ["*.*"])
    exclude_patterns = set(config.get("exclude_patterns", [])) | DEFAULT_EXCLUDE_DIRS
    include_hidden = config.get("include_hidden", False)
    max_results = config.get("max_results", 100)
    max_depth = config.get("max_directory_depth", 0)

    match_count = 0
    file_count = 0

    for root_dir in directories:
        if not os.path.isdir(root_dir):
            continue

        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Filter excluded directories (modify in-place for os.walk)
            dirnames[:] = [
                d for d in dirnames
                if d not in exclude_patterns
                and (include_hidden or not d.startswith("."))
            ]

            # Check depth limit
            if max_depth > 0:
                rel_depth = os.path.relpath(dirpath, root_dir).count(os.sep)
                if rel_depth >= max_depth:
                    dirnames.clear()

            for filename in filenames:
                if not include_hidden and filename.startswith("."):
                    continue

                # Check file patterns
                if file_patterns and "*.*" not in file_patterns:
                    matched = any(fnmatch.fnmatch(filename, p) for p in file_patterns)
                    if not matched:
                        continue

                filepath = os.path.join(dirpath, filename)
                file_count += 1

                try:
                    for match in search_file(filepath, query, config):
                        match_count += 1
                        yield match

                        if progress_callback and file_count % 50 == 0:
                            progress_callback(file_count, match_count)

                        if match_count >= max_results:
                            return
                except Exception:
                    continue
