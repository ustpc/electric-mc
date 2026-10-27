#!/usr/bin/env python3
"""Electric MC live log: a Chrome native messaging host that appends the
extension's log entries to a file on this computer.

Chrome starts this program when the extension's background worker opens a
port to "org.electric_mc.log", and ends it when the port closes. Chrome
talks to it over stdin/stdout: each message is a 4-byte little-endian
length followed by that many bytes of UTF-8 JSON. On start the host
replies once with {"ok": true, "path": ...}; after that every message is a
log entry, written as one JSON line and flushed at once. The file is
rotated to <file>.1 past 20 MB. Standard library only.
"""

import json
import os
import struct
import sys

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


def main(argv):
    path = os.path.abspath(os.path.expanduser(argv[1] if len(argv) > 1 else "electric-mc.log"))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    stdin, stdout = sys.stdin.buffer, sys.stdout.buffer
    write_message(stdout, {"ok": True, "path": path})
    while True:
        msg = read_message(stdin)
        if msg is None:
            return 0
        rotate_if_big(path)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(msg, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    sys.exit(main(sys.argv))
