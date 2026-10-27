#!/usr/bin/env python3
"""Register (or remove) the Electric MC live-log host with Chrome on macOS.

Chrome finds native messaging hosts by a small JSON manifest in
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/. The
manifest names an executable and the one extension allowed to start it.
Chrome can't pass arguments, so this writes a two-line wrapper,
var/log-host.sh, that runs electric_mc_log_host.py with the log file
var/electric-mc.log (var/ is git-ignored: the log holds real MC data).
The extension's ID is Chrome's ID for the unpacked build directory, worked
out from its path the way Chrome does; pass --ext-id to override it.
With --dry-run nothing is written; the files are printed instead.
"""

import argparse
import hashlib
import json
import os
import stat
import sys

NAME = "org.electric_mc.log"
HERE = os.path.dirname(os.path.abspath(__file__))
EXTENSION = os.path.dirname(os.path.dirname(HERE))
REPO = os.path.dirname(EXTENSION)
HOSTS = os.path.expanduser("~/Library/Application Support/Google/Chrome/NativeMessagingHosts")


def unpacked_id(path):
    """Chrome's ID for an extension loaded unpacked from `path`."""
    digest = hashlib.sha256(os.path.realpath(path).encode("utf-8")).hexdigest()[:32]
    return "".join(chr(ord("a") + int(c, 16)) for c in digest)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--ext-id", help="extension ID from chrome://extensions (default: computed from build/chrome-mv3)")
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    manifest_path = os.path.join(HOSTS, NAME + ".json")
    wrapper = os.path.join(REPO, "var", "log-host.sh")
    if a.uninstall:
        for p in (manifest_path, wrapper):
            if os.path.exists(p) and not a.dry_run:
                os.remove(p)
            print(("would remove " if a.dry_run else "removed ") + p)
        return 0

    ext_id = a.ext_id or unpacked_id(os.path.join(EXTENSION, "build", "chrome-mv3"))
    log_file = os.path.join(REPO, "var", "electric-mc.log")
    script = f'#!/bin/sh\nexec "{sys.executable}" "{os.path.join(HERE, "electric_mc_log_host.py")}" "{log_file}"\n'
    manifest = {
        "name": NAME,
        "description": "Electric MC live log (test builds, developer mode)",
        "path": wrapper,
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{ext_id}/"],
    }
    if a.dry_run:
        print(f"would write {wrapper}:\n{script}\nwould write {manifest_path}:\n{json.dumps(manifest, indent=2)}")
        return 0
    os.makedirs(os.path.dirname(wrapper), exist_ok=True)
    with open(wrapper, "w") as f:
        f.write(script)
    os.chmod(wrapper, os.stat(wrapper).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    os.makedirs(HOSTS, exist_ok=True)
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Registered {NAME} for extension {ext_id}.\nLog file: {log_file}\n"
          "Check the ID matches Electric MC in chrome://extensions; if not, run again with --ext-id.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
