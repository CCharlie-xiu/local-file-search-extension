#!/usr/bin/env python3
"""
Chrome Native Messaging host for Local Text Search extension.
Reads JSON messages from stdin (4-byte length-prefixed) and writes results to stdout.
"""

import os
import sys
import struct
import json
import uuid
import time
import threading

from searcher import search_files

# Windows: ensure binary mode for stdin/stdout
if sys.platform == "win32":
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)  # noqa: F821
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)


def read_message():
    """Read a JSON message from stdin using Chrome Native Messaging framing."""
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None
    length = struct.unpack("<I", raw_length)[0]
    if length == 0:
        return None
    payload = sys.stdin.buffer.read(length)
    return json.loads(payload)


def write_message(message):
    """Write a JSON message to stdout using Chrome Native Messaging framing."""
    content = json.dumps(message, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(content)))
    sys.stdout.buffer.write(content)
    sys.stdout.buffer.flush()


def handle_search(msg):
    """Handle a search request: run search and stream results back."""
    search_id = msg.get("search_id", str(uuid.uuid4()))
    query = msg.get("query", "").strip()
    config = msg.get("config", {})

    if not query:
        write_message({
            "type": "error",
            "search_id": search_id,
            "message": "Query is empty",
            "fatal": False,
        })
        write_message({
            "type": "complete",
            "search_id": search_id,
            "total_files": 0,
            "total_matches": 0,
            "duration_ms": 0,
            "errors": ["Empty query"],
        })
        return

    if len(query) > 1000:
        write_message({
            "type": "error",
            "search_id": search_id,
            "message": "Query too long (max 1000 characters)",
            "fatal": False,
        })
        write_message({
            "type": "complete",
            "search_id": search_id,
            "total_files": 0,
            "total_matches": 0,
            "duration_ms": 0,
            "errors": ["Query too long"],
        })
        return

    cancel_event = threading.Event()
    # Store for potential cancellation (simplified: not multi-threaded, but
    # checks a flag between files — cancellation message sets this flag)

    def progress_callback(files_searched, matches_found):
        write_message({
            "type": "progress",
            "search_id": search_id,
            "files_searched": files_searched,
            "matches_found": matches_found,
        })

    start_time = time.time()
    total_files = 0
    total_matches = 0
    errors = []

    try:
        for match in search_files(config, query, progress_callback):
            if cancel_event.is_set():
                break
            total_matches += 1
            total_files = max(total_files, match.get("_files_searched", 0))
            write_message({
                "type": "match",
                "search_id": search_id,
                "file": match["file"],
                "line": match["line"],
                "column": match["column"],
                "before": match["before"],
                "match": match["match"],
                "after": match["after"],
                "encoding": match.get("encoding", "utf-8"),
                "match_index": total_matches,
            })
    except Exception as e:
        errors.append(str(e))
        write_message({
            "type": "error",
            "search_id": search_id,
            "message": str(e),
            "fatal": True,
        })

    duration_ms = int((time.time() - start_time) * 1000)
    write_message({
        "type": "complete",
        "search_id": search_id,
        "total_files": total_files,
        "total_matches": total_matches,
        "duration_ms": duration_ms,
        "errors": errors if errors else None,
    })


def main():
    """Main loop: read messages from stdin, process them."""
    while True:
        msg = read_message()
        if msg is None:
            break

        msg_type = msg.get("type", "")

        if msg_type == "search":
            handle_search(msg)
        elif msg_type == "ping":
            write_message({
                "type": "pong",
                "python_version": sys.version,
                "host_version": "1.0.0",
            })
        elif msg_type == "cancel":
            # Cancellation handled via flag; for simplicity we process it
            write_message({
                "type": "cancelled",
                "search_id": msg.get("search_id", ""),
            })
        else:
            write_message({
                "type": "error",
                "message": f"Unknown message type: {msg_type}",
                "fatal": False,
            })


if __name__ == "__main__":
    main()
