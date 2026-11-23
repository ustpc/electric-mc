#!/usr/bin/env python3
"""Electric MC live log: a Chrome native messaging host that appends the
extension's log entries to a file on this computer.

Chrome starts this program when the extension's background worker opens a
port to "org.electric_mc.log", and ends it when the port closes. Chrome
talks to it over stdin/stdout: each message is a 4-byte little-endian
length followed by that many bytes of UTF-8 JSON. On start the host
replies once with {"ok": true, "path": ...}; after that every message is a
log entry, written as one JSON line and flushed at once. The file is
rotated to <file>.1 past 20 MB. A message {"emc_page": {"name", "url",
"html"}} is a weekly page sample instead (lib/pagesample.ts): it is saved
as real-pages/<name>.html next to the log file, replacing the last one, and
not logged. Standard library only.
"""

import json
import os
import re
import struct
import sys
import time

MAX_BYTES = 20 * 1024 * 1024


def read_message(stream):
    """One framed message from Chrome, or None at end of input."""
    head = stream.read(4)
    if len(head) < 4:
        return None
    (length,) = struct.unpack("<I", head)
    body = stream.read(length)
    if len(body) < length:
        return None
    return json.loads(body.decode("utf-8"))


def write_message(stream, obj):
    """One framed message to Chrome."""
    body = json.dumps(obj).encode("utf-8")
    stream.write(struct.pack("<I", len(body)) + body)
    stream.flush()


def rotate_if_big(path):
    try:
        if os.path.getsize(path) > MAX_BYTES:
            os.replace(path, path + ".1")
    except FileNotFoundError:
        pass


PAGE_NAME = re.compile(r"^[A-Z][A-Z0-9_]{1,80}$")


def save_page(log_path, page):
    """Write one page sample as real-pages/<name>.html beside the log. Returns the path, or None."""
    name = page.get("name") if isinstance(page, dict) else None
    html = page.get("html") if isinstance(page, dict) else None
    if not isinstance(name, str) or not PAGE_NAME.match(name) or not isinstance(html, str):
        return None
    folder = os.path.join(os.path.dirname(log_path), "real-pages")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name + ".html")
    meta = {"url": page.get("url", ""), "currentPage": name, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    tmp = path + ".part"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("<!-- electric-mc-capture " + json.dumps(meta) + " -->\n" + html)
    os.replace(tmp, path)
    return path


def main(argv):
    path = os.path.abspath(os.path.expanduser(argv[1] if len(argv) > 1 else "electric-mc.log"))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    stdin, stdout = sys.stdin.buffer, sys.stdout.buffer
    write_message(stdout, {"ok": True, "path": path})
    while True:
        msg = read_message(stdin)
        if msg is None:
            return 0
        if isinstance(msg, dict) and "emc_page" in msg:
            save_page(path, msg["emc_page"])
            continue
        rotate_if_big(path)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(msg, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    sys.exit(main(sys.argv))
