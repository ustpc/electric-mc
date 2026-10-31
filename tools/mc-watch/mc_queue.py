#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["selenium>=4.30", "keyring>=25"]
# ///
"""Watch one or more ScholarOne queues (by default the Co-Chair "Awaiting AE
Assignment" list): list them, download each new manuscript's "View
Submission" PDF, and print it. For co-chairs, AEs, and EICs; see README.md
in this directory for setup and use.

It drives a Chromium window, minimized, through the same clicks a person
makes:

    https://mc.manuscriptcentral.com/cacm -> log in -> Manage ->
    <center> (e.g. Co-Chair Center) -> <queue> (e.g. Awaiting AE Assignment) ->
    each page: record each Manuscript ID, download new PDFs -> next queue ->
    log out

The center and queues come from --role (cochair, ae, eic; mc_store.ROLES),
or the config's role / center / queues, or --center / --queue.

then prints every downloaded-but-unprinted PDF with CUPS `lp` and files it
under printed_dir/{year}/{msid}/.

The config file is the first of: --config PATH, $MC_WATCH_CONFIG, or
var/mc-watch/config.toml in this repository (git-ignored; copied from
tools/mc-watch/config.example.toml on the first run). It names the default
MC account, the printer and its options, and where the data goes:
downloads_dir, printed_dir, and the SQLite database of every document seen /
downloaded / printed (mc_store.py), by default under ~/cacm-opn, outside the
repository, because they are real MC data.

Usage:
    uv run tools/mc-watch/mc_queue.py [USERNAME] [--role ROLE] [--list | --no-print | --mark-seen]
    make mc-queue [USERID=USERNAME] [ARGS="--show --fresh"]

    (default)    list the queue, download new PDFs, print everything pending
    --list       only list and record the queue
    --no-print   list and download, don't print
    --mark-seen  record the current queue as printed without downloading or
                 printing, to skip a backlog; later revisions still print

The password is kept in the macOS Keychain (service "electric-mc mc-watch",
account = the MC user ID), asked for only when there is none, and saved only
after a login succeeds; a rejected stored password is deleted and asked for
once more. --forget-password deletes it first.

The browser keeps its own persistent profile (cookie jar) in
var/mc-watch/profile (git-ignored), so MC's "Remember this device" cookie
survives between runs and the emailed verification code is needed only once.
--fresh deletes that profile first. It never touches your installed Chrome or
its profile. If MC asks for a verification code, type it at the terminal (or
in the browser window). The window is minimized right after launch: macOS
keeps windows on some display, so no position is reliably off-screen. If
Cloudflare's "Just a moment..." check doesn't clear by itself, the window is
restored so you can complete it; the profile keeps its cookie.

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

import mc_store
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
WINDOW = dict(x=0, y=0, width=1400, height=1000)
DOWNLOAD_WAIT = 60  # seconds for one PDF
show_window = False  # --show: keep the window on-screen


class BadLogin(Exception):
    """MC showed the login form again: the user ID or password was rejected."""


def hide(d):
    if not show_window:
        d.minimize_window()


def unhide(d):
    d.set_window_rect(**WINDOW)  # also restores a minimized window


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
        unhide(d)
        log("Cloudflare check: please complete it in the browser window")
        WebDriverWait(d, HUMAN_WAIT).until(lambda d: not challenged(d))
        hide(d)
    time.sleep(PAUSE)
    snap(d, "after cloudflare")


def list_loaded(d):
    """A manuscript list is showing (an ID, or the Co-Chair list's Take Action header)."""
    text = body_text(d)
    return "Take Action" in text or bool(ID_RE.search(text))


def manage_menu(d):
    """The item names under Manage, for error messages."""
    items = d.find_elements(By.XPATH, "//a[starts-with(normalize-space(.),'Manage')]/ancestor::li[1]//a"
                                      " | //a[contains(normalize-space(.),'Center')]")
    names = []
    for e in items:
        t = " ".join(e.get_attribute("textContent").split())
        if t and not t.startswith("Manage") and t not in names:
            names.append(t)
    return names


def open_center(d, center):
    click(d, link("Manage", exact=False), "Manage")
    if not d.find_elements(*link(center)):
        items = manage_menu(d)
        raise SystemExit(f"no {center!r} under Manage for this account; the menu has: "
                         + (", ".join(repr(i) for i in items) or "nothing recognizable"))
    click(d, link(center), center)


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
    try:
        WebDriverWait(d, STEP_TIMEOUT).until(lambda d: logged_in(d) or needs_code(d))
    except TimeoutException:
        if visible(d, "//input[@name='USERID']"):
            snap(d, "login rejected")
            raise BadLogin(username)
        raise
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


def all_queue_ids(d, on_page=lambda d, ids: None):
    """Every ID in the queue, in order, calling on_page(d, new_ids) while
    each page of the list is showing."""
    ids = ids_on_page(d)
    on_page(d, ids)
    total = expected_total(d)
    _, opts = page_picker(d)
    for i in range(1, len(opts)):
        log(f"page {opts[i]}")
        sel, _ = page_picker(d)
        old = sel._el
        sel.select_by_index(i)
        WebDriverWait(d, STEP_TIMEOUT).until(EC.staleness_of(old))
        cloudflare(d)
        WebDriverWait(d, STEP_TIMEOUT).until(list_loaded)
        time.sleep(PAUSE)
        snap(d, f"queue page {opts[i]}")
        here = [mid for mid in ids_on_page(d) if mid not in ids]
        ids += here
        on_page(d, here)
    return ids, total


def finished_files(folder):
    return [os.path.join(folder, f) for f in os.listdir(folder)
            if not f.endswith(".crdownload") and not f.startswith(".")]


def wait_for_file(folder, seconds):
    """The first completed download in folder, or None."""
    deadline = time.time() + seconds
    while time.time() < deadline:
        done = finished_files(folder)
        if done:
            time.sleep(1)  # let Chrome finish the rename
            return done[0]
        time.sleep(0.5)
    return None


VIEW_SUBMISSION = ".//a[contains(normalize-space(.),'View Submission')]"


def view_submission_link(d, msid):
    """msid's "View Submission" link. The list is built from nested layout
    tables and the ID is plain text in its cell (only extensions such as
    Electric MC make it a link), so start at the innermost element whose text
    is exactly the ID and walk out through its enclosing rows to the nearest
    one that has a View Submission link and no other manuscript's ID."""
    holders = d.find_elements(By.XPATH, f"//*[normalize-space(.)={xp_text(msid)}]")
    if not holders:
        raise RuntimeError("ID not found on the page")
    rows = holders[-1].find_elements(By.XPATH, "ancestor::tr")  # outermost first
    for row in reversed(rows):
        links = row.find_elements(By.XPATH, VIEW_SUBMISSION)
        if not links:
            continue
        if {m.group(0) for m in ID_RE.finditer(row.text)} != {msid}:
            break  # this row already spans other manuscripts
        return links[0]
    raise RuntimeError("no View Submission link in its row")


def download(d, msid, staging, dest):
    """Click msid's "View Submission" and save the PDF as dest. Chrome is set
    to download PDFs (not show them) into staging. If the popup turns out to be
    a page around the PDF instead, follow its embedded PDF."""
    link_el = view_submission_link(d, msid)
    for f in os.listdir(staging):
        os.remove(os.path.join(staging, f))
    main, before = d.current_window_handle, set(d.window_handles)
    log(f"{msid}: View Submission")
    link_el.click()
    try:
        got = wait_for_file(staging, DOWNLOAD_WAIT / 2)
        popups = [h for h in d.window_handles if h not in before]
        if not got and popups:
            d.switch_to.window(popups[-1])
            snap(d, f"{msid} proof window")
            srcs = [e.get_attribute("src") or e.get_attribute("data") for e in
                    d.find_elements(By.XPATH, "//iframe | //embed | //object | //frame")]
            srcs += [e.get_attribute("href") for e in
                     d.find_elements(By.XPATH, "//a[contains(translate(@href,'PDF','pdf'),'pdf')]")]
            srcs = [u for u in srcs if u and not u.startswith("about:")]
            if srcs:
                log(f"{msid}: following the PDF inside the proof window")
                d.get(srcs[0])
                got = wait_for_file(staging, DOWNLOAD_WAIT / 2)
        if not got:
            raise RuntimeError("no PDF arrived")
        with open(got, "rb") as f:
            if f.read(5) != b"%PDF-":
                raise RuntimeError(f"download is not a PDF: {os.path.basename(got)}")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.move(got, dest)
        return dest
    finally:
        for h in d.window_handles:
            if h not in before:
                d.switch_to.window(h)
                d.close()
        d.switch_to.window(main)


def get_password(username, ask):
    """(password, from_keychain)."""
    if not ask:
        pw = mc_store.get_password(username)
        if pw:
            return pw, True
    return getpass.getpass(f"MC password for {username}: "), False


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("username", nargs="?", help="MC user ID (default: username in the config)")
    ap.add_argument("--config", help=f"config file (default: ${mc_store.ENV_VAR}, else {mc_store.REPO_CONFIG})")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--list", action="store_true", help="only list and record the queue")
    mode.add_argument("--no-print", action="store_true", help="download new PDFs but don't print")
    mode.add_argument("--mark-seen", action="store_true",
                      help="record the current queue as printed, without downloading or printing")
    ap.add_argument("--role", choices=sorted(mc_store.ROLES), help="preset center and queues (default: config role)")
    ap.add_argument("--center", help="the item under Manage, e.g. 'Associate Editor Center'")
    ap.add_argument("--queue", action="append", help="a list on that center's dashboard; repeat for several")
    ap.add_argument("--forget-password", action="store_true", help="delete the Keychain password first")
    ap.add_argument("--chromium", help="path to a Chromium binary (default: Chrome for Testing via Selenium Manager)")
    ap.add_argument("--chromedriver", help="path to the chromedriver that matches --chromium")
    ap.add_argument("--show", action="store_true", help="keep the browser window on-screen")
    ap.add_argument("--fresh", action="store_true", help="delete the saved profile (cookies) first")
    ap.add_argument("--no-debug", action="store_true", help="don't save HTML/PNG snapshots of each step")
    ap.add_argument("--stay-logged-in", action="store_true", help="don't click Log Out at the end")
    a = ap.parse_args()

    cfg = mc_store.load_config(mc_store.config_path(a.config, log=log))
    username = a.username or cfg["username"]
    center, queues = mc_store.role_queues(cfg, a.role, a.center, a.queue)
    log(f"center {center!r}; queues {', '.join(repr(q) for q in queues)}")
    if not username:
        raise SystemExit(f"no MC user ID: give one, or set username in {cfg['path']}")
    store = mc_store.Store(cfg["database"])
    staging = os.path.join(cfg["downloads_dir"], ".incoming")
    os.makedirs(staging, exist_ok=True)
    log(f"config {cfg['path']}; downloads {cfg['downloads_dir']}; database {cfg['database']}")

    global snap
    snap = Snapshots(not a.no_debug)
    if snap.dir:
        log(f"debug snapshots (real MC data; delete when done): {snap.dir}")
    if a.forget_password and mc_store.forget_password(username):
        log(f"deleted the Keychain password for {username}")
    password, from_keychain = get_password(username, ask=False)
    if a.fresh:
        shutil.rmtree(PROFILE, ignore_errors=True)
    os.makedirs(PROFILE, exist_ok=True)
    opts = webdriver.ChromeOptions()
    global show_window
    show_window = a.show
    opts.add_argument(f"--user-data-dir={PROFILE}")
    opts.add_argument(f"--window-size={WINDOW['width']},{WINDOW['height']}")
    opts.add_argument("--no-first-run")
    opts.add_argument("--no-default-browser-check")
    # Keep working while minimized, covered, or behind a locked screen.
    opts.add_argument("--disable-backgrounding-occluded-windows")
    opts.add_argument("--disable-renderer-backgrounding")
    opts.add_argument("--disable-background-timer-throttling")
    opts.add_experimental_option("prefs", {
        "download.default_directory": staging,
        "download.prompt_for_download": False,
        "plugins.always_open_pdf_externally": True,  # download PDFs instead of showing them
    })
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

    tally = dict(in_queue=0, new=0, downloaded=0, printed=0, errors=0)

    def on_page(d, ids):
        for mid in ids:
            print(mid, flush=True)
            tally["in_queue"] += 1
            if store.seen(mid):
                tally["new"] += 1
            if a.mark_seen:
                store.mark_seen(mid)
            elif not a.list and store.needs_download(mid):
                try:
                    path = download(d, mid, staging, os.path.join(cfg["downloads_dir"], f"{mid}.pdf"))
                    store.downloaded(mid, path)
                    tally["downloaded"] += 1
                    log(f"{mid}: downloaded")
                except Exception as e:
                    store.error(mid, f"download: {e}")
                    tally["errors"] += 1
                    log(f"{mid}: download failed: {e}")
                    snap(d, f"{mid} download error")
                time.sleep(PAUSE * 4)  # one at a time, at a person's pace

    d = webdriver.Chrome(options=opts, service=Service(driver) if driver else None)
    status = 0
    try:
        hide(d)
        log(f"opening {cfg['site_url']}")
        d.get(cfg["site_url"])
        cloudflare(d)
        snap(d, "start page")
        try:
            log_in(d, username, password)
        except BadLogin:
            if not from_keychain:
                raise SystemExit(f"MC rejected the user ID or password for {username}")
            log("MC rejected the Keychain password; deleting it")
            mc_store.forget_password(username)
            password, from_keychain = get_password(username, ask=True)
            d.get(cfg["site_url"])
            cloudflare(d)
            log_in(d, username, password)
        if not from_keychain:
            mc_store.set_password(username, password)
            log(f"saved the password for {username} in the Keychain")
        for n, queue in enumerate(queues):
            if n:
                log(f"back to {center}")
            open_center(d, center)
            try:
                WebDriverWait(d, STEP_TIMEOUT).until(lambda d: any(q in body_text(d) for q in queues))
            except TimeoutException:
                pass  # reported below as "no such list"
            snap(d, "center dashboard")
            # The dashboard shows "N <queue>"; at 0 it's plain text, not a link.
            m = re.search(rf"(\d+)\s+{re.escape(queue)}", body_text(d))
            if (m and m.group(1) == "0") or not d.find_elements(*link(queue)):
                log(f"0 manuscripts in {queue!r}" + ("" if m else " (no such list on this dashboard?)"))
                continue
            click(d, link(queue), queue)
            WebDriverWait(d, STEP_TIMEOUT).until(list_loaded)
            snap(d, "queue")
            ids, total = all_queue_ids(d, on_page)
            log(f"{queue}: {len(ids)} manuscript IDs" + (f" (MC says {total})" if total is not None else ""))
            if total is not None and total != len(ids):
                log("WARNING: count differs from MC's total")
        if not a.stay_logged_in and logged_in(d):
            click(d, link("Log Out"), "logging out")
    except TimeoutException:
        log(f"timed out at {d.current_url.split('?')[0]} (page title {d.title!r})")
        snap(d, "error timeout")
        status = 1
    except BaseException as e:
        snap(d, f"error {e.__class__.__name__}")
        raise
    finally:
        d.quit()
        if snap.dir:
            log(f"debug snapshots: {snap.dir}")

    if not (a.list or a.no_print or a.mark_seen):
        for row in store.pending_print():
            job = mc_store.print_and_file(store, row, cfg)
            if job:
                tally["printed"] += 1
                log(f"{row['msid']}: printed on {cfg['printer']} ({job})")
            else:
                tally["errors"] += 1
                log(f"{row['msid']}: print failed: {store.get(row['msid'])['last_error']}")
    log("summary: {in_queue} in queue, {new} new, {downloaded} downloaded, {printed} printed, {errors} errors"
        .format(**tally))
    return status or (1 if tally["errors"] else 0)


if __name__ == "__main__":
    sys.exit(main())
