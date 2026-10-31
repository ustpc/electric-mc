#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["selenium>=4.30"]
# ///
"""List the manuscript IDs in the Co-Chair "Awaiting AE Assignment" queue.

Test program for the auto-print idea. It drives a Chromium window placed
off-screen (not headless) through the same clicks a person makes:

    https://mc.manuscriptcentral.com/cacm -> log in -> Manage ->
    Co-Chair Center -> Co-Chair Tasks: Awaiting AE Assignment ->
    print each Manuscript ID (all pages) -> log out

Usage:
    uv run tools/mc-watch/mc_queue.py USERNAME [--show] [--chromium PATH]
    make mc-queue USERID=USERNAME [ARGS="--show --fresh"]

The password is read from a prompt (never from the command line or a file).
The browser keeps its own persistent profile (cookie jar) in
var/mc-watch/profile (git-ignored), so MC's "Remember this device" cookie
survives between runs and the emailed verification code is needed only once.
--fresh deletes that profile first. It never touches your installed Chrome or
its profile. If MC asks for a verification code, type it at the terminal.
If Cloudflare's "Just a moment..." check doesn't clear by itself, the window
moves on-screen so you can complete it; the profile keeps its cookie, so
later runs should pass. Run it next to your screen the first time.

The browser is Selenium-driven Chromium. By default Selenium Manager fetches
"Chrome for Testing" (a stock Chromium build) into ~/.cache/selenium the first
time and the script refuses to start any browser under /Applications. (Asked
only for "stable", Selenium Manager would pick the installed Google Chrome.)
Pass --chromium (and --chromedriver) to use another Chromium instead.

The IDs go to stdout. For debugging, after each step it saves the page's
HTML and a PNG screenshot as NN-step.html / NN-step.png in a new private
(0700) directory under the system temp dir, never under this repository,
since they contain real MC data. The path is printed at the start; the
directory is never deleted automatically. --no-debug turns this off.

Run with uv (it installs Selenium from the script header on first use):
    uv run tools/mc-watch/mc_queue.py USERNAME
"""

import argparse
import base64
import getpass
import re
import select
import shutil
import sys
import os
import tempfile
import time

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.selenium_manager import SeleniumManager
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

START_URL = "https://mc.manuscriptcentral.com/cacm"
# Same pattern as extension/lib/ids.ts DEFAULT_ID_PATTERN.
ID_RE = re.compile(
    r"\b([A-Z][A-Z0-9]{1,15}(?:-[A-Z]{1,6})?-\d{2,4}(?:-\d{2})?-\d{3,6})(?:\.R(\d{1,2}))?\b"
)
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROFILE = os.path.join(REPO, "var", "mc-watch", "profile")  # git-ignored
STEP_TIMEOUT = 30  # seconds
PAUSE = 0.5  # seconds between clicks, roughly a person's pace
CF_WAIT = 15  # seconds to let a Cloudflare check clear by itself
HUMAN_WAIT = 5 * 60  # seconds for a person to complete it
OFFSCREEN = (-3000, 0)
show_window = False  # --show: keep the window on-screen


def log(msg):
    print(f"[mc_queue] {msg}", file=sys.stderr, flush=True)


class Snapshots:
    """Numbered HTML + PNG captures of each step, for debugging."""

    def __init__(self, enabled):
        self.dir = tempfile.mkdtemp(prefix="mc-watch-") if enabled else None  # mkdtemp is 0700
        self.n = 0

    def __call__(self, d, step):
        if not self.dir:
            return
        self.n += 1
        base = os.path.join(self.dir, f"{self.n:02d}-{re.sub(r'[^A-Za-z0-9]+', '-', step).strip('-')}")
        try:
            with open(base + ".html", "w", encoding="utf-8") as f:
                f.write(d.page_source)
        except Exception as e:
            log(f"snapshot {step}: no HTML ({e.__class__.__name__})")
        try:
            # Whole page, not just the window.
            size = d.execute_cdp_cmd("Page.getLayoutMetrics", {})["cssContentSize"]
            shot = d.execute_cdp_cmd("Page.captureScreenshot", {
                "format": "png", "captureBeyondViewport": True,
                "clip": {"x": 0, "y": 0, "width": size["width"], "height": size["height"], "scale": 1},
            })
            with open(base + ".png", "wb") as f:
                f.write(base64.b64decode(shot["data"]))
        except Exception:
            try:
                d.save_screenshot(base + ".png")
            except Exception as e:
                log(f"snapshot {step}: no PNG ({e.__class__.__name__})")


snap = Snapshots(False)


def xp_text(s):
    """XPath string literal."""
    return f'"{s}"' if '"' not in s else "concat('" + s.replace("'", "',\"'\",'") + "')"


def link(text, exact=True):
    t = xp_text(text)
    cond = f"normalize-space(.)={t}" if exact else f"starts-with(normalize-space(.),{t})"
    return (By.XPATH, f"//a[{cond}]")


def body_text(d):
    return d.find_element(By.TAG_NAME, "body").text


def logged_in(d):
    return bool(d.find_elements(*link("Log Out")))


def click(d, locator, what):
    log(what)
    el = WebDriverWait(d, STEP_TIMEOUT).until(EC.element_to_be_clickable(locator))
    el.click()
    time.sleep(PAUSE)
    cloudflare(d)
    snap(d, what)


def challenged(d):
    return d.title.strip().startswith("Just a moment")


def cloudflare(d):
    """If Cloudflare's "Just a moment..." page is up, give it CF_WAIT seconds,
    then bring the window on-screen for a person to complete the check."""
    if not challenged(d):
        return
    snap(d, "cloudflare check")
    log(f"Cloudflare check; waiting up to {CF_WAIT} s for it to clear")
    try:
        WebDriverWait(d, CF_WAIT).until(lambda d: not challenged(d))
    except TimeoutException:
        d.set_window_position(0, 0)
        log("Cloudflare check: please complete it in the browser window")
        WebDriverWait(d, HUMAN_WAIT).until(lambda d: not challenged(d))
        if not show_window:
            d.set_window_position(*OFFSCREEN)
    time.sleep(PAUSE)
    snap(d, "after cloudflare")


def wait_text(d, text):
    WebDriverWait(d, STEP_TIMEOUT).until(lambda d: text in body_text(d))


def needs_code(d):
    return "Verification Code" in body_text(d)


def visible(d, xpath):
    return [e for e in d.find_elements(By.XPATH, xpath) if e.is_displayed()]


def enter_code(d):
    """MC's "Unrecognized Device" dialog: ask for the emailed code on the
    terminal (the browser is off-screen), tick "Remember this device" so the
    persistent profile skips this next time, and press Verify."""
    log("MC says this is an unrecognized device and emailed a verification code")
    snap(d, "code dialog")
    dialog = "//*[contains(normalize-space(.),'Unrecognized Device') and .//input]"
    field_xp = f"({dialog})[last()]//input[@type='text' or @type='tel' or @type='number' or not(@type)]"
    # Poll the terminal and the page together, so a code typed in the browser
    # window instead also lets the run go on.
    prompt = "Verification code from the 'Communications of the ACM Verification Code' email: "
    print(prompt, end="", file=sys.stderr, flush=True)
    code = ""
    while not code:
        if logged_in(d) or not visible(d, field_xp):
            print(file=sys.stderr)
            log("the code dialog is gone (entered in the browser?); going on")
            return
        if select.select([sys.stdin], [], [], 1)[0]:
            line = sys.stdin.readline()
            if not line:
                raise SystemExit("no verification code (end of input)")
            code = line.strip()
            if not code:
                print(prompt, end="", file=sys.stderr, flush=True)
    fields = visible(d, field_xp)
    if not fields:
        raise SystemExit("couldn't find the verification code field")
    fields[0].clear()
    fields[0].send_keys(code)
    for box in visible(d, f"({dialog})[last()]//input[@type='checkbox']"):
        if not box.is_selected():
            box.click()  # "Remember this device"
    buttons = visible(d, "//button[contains(normalize-space(.),'Verify')] | //a[contains(normalize-space(.),'Verify')]"
                         " | //input[@type='submit' and contains(@value,'Verify')]")
    if not buttons:
        raise SystemExit("couldn't find the Verify button")
    buttons[0].click()


def log_in(d, username, password):
    WebDriverWait(d, STEP_TIMEOUT).until(lambda d: logged_in(d) or d.find_elements(By.NAME, "USERID"))
    if logged_in(d):
        # The saved session may be another account; start over as this one.
        snap(d, "already logged in")
        click(d, link("Log Out"), "saved session found; logging out to log in as the requested user")
        if not d.find_elements(By.NAME, "USERID"):
            d.get(START_URL)
            cloudflare(d)
        WebDriverWait(d, STEP_TIMEOUT).until(EC.presence_of_element_located((By.NAME, "USERID")))
    snap(d, "login form")
    log("logging in")
    d.find_element(By.NAME, "USERID").send_keys(username)
    d.find_element(By.NAME, "PASSWORD").send_keys(password)
    buttons = d.find_elements(By.ID, "logInButton") or visible(
        d,
        "//button[normalize-space(.)='Log In'] | //input[@type='submit' and @value='Log In']"
        " | //a[normalize-space(.)='Log In' and not(ancestor::*[contains(@class,'nav')])]",
    )
    if not buttons:
        raise SystemExit("couldn't find the Log In button")
    buttons[0].click()
    time.sleep(PAUSE)
    cloudflare(d)
    WebDriverWait(d, STEP_TIMEOUT).until(lambda d: logged_in(d) or needs_code(d))
    if needs_code(d):
        enter_code(d)
        time.sleep(PAUSE)
        cloudflare(d)
        WebDriverWait(d, STEP_TIMEOUT).until(logged_in)
    snap(d, "after login")


def ids_on_page(d):
    seen, out = set(), []
    for m in ID_RE.finditer(body_text(d)):
        if m.group(0) not in seen:
            seen.add(m.group(0))
            out.append(m.group(0))
    return out


def page_picker(d):
    """The 'Manuscripts [1-10] of 14' select, as (Select, option texts), or (None, [])."""
    for el in d.find_elements(By.TAG_NAME, "select"):
        sel = Select(el)
        opts = [o.text.strip() for o in sel.options]
        if opts and all(re.fullmatch(r"\d+\s*-\s*\d+", o) for o in opts):
            return sel, opts
    return None, []


def expected_total(d):
    # The picker's options can show up in the page text ("1-10 11-14"), so allow several ranges.
    m = re.search(r"Manuscripts\s+(?:\d+\s*-\s*\d+\s*)+of\s+(\d+)", body_text(d))
    return int(m.group(1)) if m else None


def all_queue_ids(d):
    ids = ids_on_page(d)
    total = expected_total(d)
    _, opts = page_picker(d)
    for i in range(1, len(opts)):
        log(f"page {opts[i]}")
        sel, _ = page_picker(d)
        old = sel._el
        sel.select_by_index(i)
        WebDriverWait(d, STEP_TIMEOUT).until(EC.staleness_of(old))
        cloudflare(d)
        wait_text(d, "Take Action")
        time.sleep(PAUSE)
        snap(d, f"queue page {opts[i]}")
        for mid in ids_on_page(d):
            if mid not in ids:
                ids.append(mid)
    return ids, total


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("username", help="your MC user ID")
    ap.add_argument("--chromium", help="path to a Chromium binary (default: Chrome for Testing via Selenium Manager)")
    ap.add_argument("--chromedriver", help="path to the chromedriver that matches --chromium")
    ap.add_argument("--show", action="store_true", help="put the browser window on-screen from the start")
    ap.add_argument("--fresh", action="store_true", help="delete the saved profile (cookies) first")
    ap.add_argument("--no-debug", action="store_true", help="don't save HTML/PNG snapshots of each step")
    ap.add_argument("--stay-logged-in", action="store_true", help="don't click Log Out at the end")
    a = ap.parse_args()

    global snap
    snap = Snapshots(not a.no_debug)
    if snap.dir:
        log(f"debug snapshots (real MC data; delete when done): {snap.dir}")
    password = getpass.getpass(f"MC password for {a.username}: ")
    if a.fresh:
        shutil.rmtree(PROFILE, ignore_errors=True)
    os.makedirs(PROFILE, exist_ok=True)
    opts = webdriver.ChromeOptions()
    global show_window
    show_window = a.show
    if not a.show:
        opts.add_argument(f"--window-position={OFFSCREEN[0]},{OFFSCREEN[1]}")
    opts.add_argument(f"--user-data-dir={PROFILE}")
    opts.add_argument("--window-size=1400,1000")
    opts.add_argument("--no-first-run")
    opts.add_argument("--no-default-browser-check")
    if a.chromium:
        browser, driver = a.chromium, a.chromedriver
    else:
        # Chrome for Testing, never the installed Chrome.
        paths = SeleniumManager().binary_paths(
            ["--browser", "chrome", "--browser-version", "stable", "--force-browser-download"]
        )
        browser, driver = paths["browser_path"], paths["driver_path"]
    if browser.startswith("/Applications/"):
        raise SystemExit(f"refusing to drive an installed browser: {browser}")
    log(f"browser: {browser}")
    opts.binary_location = browser

    d = webdriver.Chrome(options=opts, service=Service(driver) if driver else None)
    try:
        log(f"opening {START_URL}")
        d.get(START_URL)
        cloudflare(d)
        snap(d, "start page")
        log_in(d, a.username, password)
        click(d, link("Manage", exact=False), "Manage")
        click(d, link("Co-Chair Center"), "Co-Chair Center")
        wait_text(d, "Co-Chair Tasks")
        snap(d, "co-chair center")
        # The dashboard shows "N Awaiting AE Assignment"; at 0 it's plain text, not a link.
        m = re.search(r"(\d+)\s+Awaiting AE Assignment", body_text(d))
        if (m and m.group(1) == "0") or not d.find_elements(*link("Awaiting AE Assignment")):
            log("0 manuscripts awaiting AE assignment")
            if not a.stay_logged_in and logged_in(d):
                click(d, link("Log Out"), "logging out")
            return 0
        click(d, link("Awaiting AE Assignment"), "Awaiting AE Assignment")
        wait_text(d, "Take Action")
        snap(d, "queue")
        ids, total = all_queue_ids(d)
        for mid in ids:
            print(mid)
        log(f"{len(ids)} manuscript IDs" + (f" (MC says {total})" if total is not None else ""))
        if total is not None and total != len(ids):
            log("WARNING: count differs from MC's total")
        if not a.stay_logged_in and logged_in(d):
            click(d, link("Log Out"), "logging out")
        return 0
    except TimeoutException:
        log(f"timed out at {d.current_url.split('?')[0]} (page title {d.title!r})")
        snap(d, "error timeout")
        return 1
    except BaseException as e:
        snap(d, f"error {e.__class__.__name__}")
        raise
    finally:
        d.quit()
        if snap.dir:
            log(f"debug snapshots: {snap.dir}")


if __name__ == "__main__":
    sys.exit(main())
