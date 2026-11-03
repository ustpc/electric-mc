"""The browser for mc_queue.py: Playwright's own Chromium, one window, kept
minimized, never left running.

Theory of operation: Browser.start() launches a headed (Cloudflare checks
headless browsers) persistent context on the dedicated profile in
var/mc-watch/profile, using the Chromium build that Playwright manages, never
an installed Google Chrome. Right after launch the window is minimized
through the Chrome DevTools Protocol and the app that was in front gets
focus back. Every process whose command line names the profile belongs to
us, so kill_strays() finds leftovers from crashes by that path and kills
them, at startup and at exit; Browser.stop() closes the context and then
kills the process tree recorded at launch, so no renderers outlive the run.
rss_mb() sums the tree's own (unshared) memory so a long --watch can restart the browser.
"""

import os
import subprocess
import sys

import psutil

WINDOW = dict(left=0, top=0, width=1400, height=1000)
FLAGS = [
    f"--window-size={WINDOW['width']},{WINDOW['height']}",
    "--no-first-run",
    "--no-default-browser-check",
    # Keep working while minimized, covered, or behind a locked screen.
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
]


def owned(proc, profile):
    try:
        return any(profile in arg for arg in proc.cmdline())
    except (psutil.Error, OSError):
        return False


def kill_procs(procs, log):
    """Terminate, then kill, the given processes. Returns how many were alive."""
    alive = []
    for p in procs:
        try:
            p.terminate()
            alive.append(p)
        except psutil.Error:
            pass
    _, still = psutil.wait_procs(alive, timeout=3)
    for p in still:
        try:
            p.kill()
        except psutil.Error:
            pass
    psutil.wait_procs(still, timeout=3)
    if alive:
        log(f"stopped {len(alive)} browser process(es): " + ", ".join(str(p.pid) for p in alive))
    return len(alive)


def kill_strays(profile, log=print):
    """Kill every process (but this one) whose command line names profile."""
    me = os.getpid()
    return kill_procs([p for p in psutil.process_iter() if p.pid != me and owned(p, profile)], log)


def frontmost_app():
    """Bundle ID of the app in front (NSWorkspace; needs no Automation permission)."""
    r = subprocess.run(["osascript", "-l", "JavaScript", "-e",
                        'ObjC.import("AppKit"); $.NSWorkspace.sharedWorkspace.frontmostApplication.bundleIdentifier.js'],
                       capture_output=True, text=True)
    return r.stdout.strip() or None


def give_back_focus(bundle_id):
    """Re-activate the app that was in front before the browser took over."""
    if bundle_id:
        subprocess.run(["open", "-b", bundle_id], capture_output=True)


def ensure_chromium(log):
    """Path of Playwright's Chromium, installing it the first time."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        path = p.chromium.executable_path
    if not os.path.exists(path):
        log("installing Playwright's Chromium (first run only)")
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
    if path.startswith("/Applications/"):
        raise SystemExit(f"refusing to drive an installed browser: {path}")
    return path


class Browser:
    """One headed, minimized Playwright Chromium on a persistent profile."""

    def __init__(self, profile, log, show=False, focus_owner=None):
        self.profile, self.log, self.show, self.focus_owner = profile, log, show, focus_owner
        self.pw = self.context = self.page = self.cdp = None
        self.tree = []

    def start(self):
        from playwright.sync_api import sync_playwright
        before = {p.pid for p in psutil.Process().children(recursive=True)}
        self.pw = sync_playwright().start()
        self.context = self.pw.chromium.launch_persistent_context(
            self.profile, headless=False, args=FLAGS, no_viewport=True, accept_downloads=False)
        # Everything launched since (Playwright's driver, Chromium, its helpers).
        self.tree = [p for p in psutil.Process().children(recursive=True) if p.pid not in before]
        self.page = self.context.pages[0] if self.context.pages else self.context.new_page()
        self.cdp = self.context.new_cdp_session(self.page)
        self.hide()
        if not self.show:
            give_back_focus(self.focus_owner)  # launching made the browser the active app
        return self.page

    def _window(self, state):
        win = self.cdp.send("Browser.getWindowForTarget")["windowId"]
        bounds = {"windowState": state} if state == "minimized" else {"windowState": "normal", **WINDOW}
        if state == "normal":
            self.cdp.send("Browser.setWindowBounds", {"windowId": win, "bounds": {"windowState": "normal"}})
        self.cdp.send("Browser.setWindowBounds", {"windowId": win, "bounds": bounds})

    def hide(self):
        if not self.show:
            self._window("minimized")

    def unhide(self):
        self._window("normal")

    def done_with_window(self):
        """After a person used the window (Cloudflare): minimize it, give focus back."""
        self.hide()
        if not self.show:
            give_back_focus(self.focus_owner)

    def rss_mb(self):
        """Memory of the browser's processes, in MB. Each one's own (USS)
        memory where the OS allows it; macOS refuses that to non-root users,
        so there it is the sum of RSS, which counts shared pages once per
        process (a freshly launched browser already sums to about 1.1 GB)."""
        total = 0
        procs = {p.pid: p for p in self.tree}
        for p in list(procs.values()):
            try:
                for c in p.children(recursive=True):
                    procs.setdefault(c.pid, c)
            except psutil.Error:
                pass
        for p in procs.values():
            try:
                total += p.memory_full_info().uss
            except psutil.AccessDenied:
                try:
                    total += p.memory_info().rss
                except psutil.Error:
                    pass
            except psutil.Error:
                pass
        return total / (1024 * 1024)

    def stop(self):
        """Close the context, stop Playwright, and kill whatever is left of the tree."""
        for step in (lambda: self.context and self.context.close(), lambda: self.pw and self.pw.stop()):
            try:
                step()
            except Exception:
                pass  # already gone, e.g. after ^C
        procs = {}
        for p in self.tree:
            try:
                procs[p.pid] = p
                for c in p.children(recursive=True):
                    procs[c.pid] = c
            except psutil.Error:
                pass
        kill_procs(list(procs.values()), self.log)
        self.pw = self.context = self.page = self.cdp = None
        self.tree = []
