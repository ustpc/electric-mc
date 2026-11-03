"""Tests for mc_browser's cleanup: processes whose command line names the
profile are found and killed, and nothing else is touched. Uses throwaway
`sleep` processes, no browser.
"""

import subprocess
import sys

import psutil

import mc_browser


def spawn(tag):
    # Python keeps the unused argument in its command line, like Chromium's --user-data-dir.
    return subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)", f"--user-data-dir={tag}"])


def test_kill_strays_only_kills_the_profile(tmp_path):
    profile = str(tmp_path / "var" / "mc-watch" / "profile")
    ours, other = spawn(profile), spawn(str(tmp_path / "someone-else"))
    try:
        msgs = []
        assert mc_browser.kill_strays(profile, log=msgs.append) == 1
        assert ours.wait(timeout=5) is not None
        assert other.poll() is None and psutil.pid_exists(other.pid)
        assert msgs and str(ours.pid) in msgs[0]
        assert mc_browser.kill_strays(profile, log=msgs.append) == 0  # nothing left
    finally:
        for p in (ours, other):
            p.kill()
            p.wait()
