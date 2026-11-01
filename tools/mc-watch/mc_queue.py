#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright>=1.48", "psutil>=5.9", "keyring>=25"]
# ///
"""Watch one or more ScholarOne queues (by default the Co-Chair "Awaiting AE
Assignment" list): list them, download each new manuscript's "View
Submission" PDF, and print it. For co-chairs, AEs, and EICs; see README.md
in this directory for setup and use.

It drives a minimized Chromium window (mc_browser.py) through the same clicks
a person makes:

    https://mc.manuscriptcentral.com/cacm -> log in -> Manage ->
    <center> (e.g. Co-Chair Center) -> <queue> (e.g. Awaiting AE Assignment) ->
    each page: record each Manuscript ID, download new PDFs -> next queue ->
    log out

then prints every downloaded-but-unprinted PDF with CUPS `lp` and files it
under printed_dir/{year}/{msid}/. --watch [MINUTES] repeats that on an
interval with one browser, restarting it every restart_every polls or when
its processes pass max_rss_mb.

The center and queues come from --role (cochair, ae, eic; mc_store.ROLES),
or the config's role / center / queues, or --center / --queue.

The config file is the first of: --config PATH, $MC_WATCH_CONFIG, or
var/mc-watch/config.toml in this repository (git-ignored; copied from
tools/mc-watch/config.example.toml on the first run). It names the default
MC account, the printer and its options, and where the data goes:
downloads_dir, printed_dir, and the SQLite database of every document seen /
downloaded / printed (mc_store.py), by default under ~/cacm-opn, outside the
repository, because they are real MC data.

Usage:
    uv run tools/mc-watch/mc_queue.py [USERNAME] [--role ROLE] [--list | --no-print | --mark-seen] [--watch [MINUTES]]
    make mc-queue [USERID=USERNAME] [ARGS="--show --fresh"]

    (default)    list the queue, download new PDFs, print everything pending
    --list       only list and record the queue
    --no-print   list and download, don't print
    --mark-seen  record the current queue as printed without downloading or
                 printing, to skip a backlog; later revisions still print
    --force      download every manuscript in the queue again, replacing the
                 local copy; already-printed ones are refreshed in place and
                 not printed again
    --watch [M]  keep going: poll every M minutes (default watch_minutes)

The password is kept in the macOS Keychain (service "electric-mc mc-watch",
account = the MC user ID), asked for only when there is none, and saved only
after a login succeeds; a rejected stored password is deleted and asked for
once more. --forget-password deletes it first.

The browser is the Chromium that Playwright manages (installed on the first
run), never your installed Chrome. It keeps its own persistent profile
(cookie jar) in var/mc-watch/profile (git-ignored), so MC's "Remember this
device" cookie survives between runs and the emailed verification code is
needed only once. --fresh deletes that profile first. If MC asks for a
verification code, type it at the terminal (or in the browser window). MC's
cookie banner is answered with "Accept All Cookies" on every page. The window
is minimized right after launch and the app you were using gets focus back;
PDFs are fetched inside the list page rather than through View Submission's
popup, because every new window on macOS makes the browser the active app.
If Cloudflare's "Just a moment..." check doesn't clear by itself, the window
is restored so you can complete it.

Every process whose command line names the profile is the program's own: any
left over from a crash is killed at startup, and the browser's whole process
tree is killed on every exit path (normal end, error, ^C, SIGTERM, atexit).

The database is committed after every change and PDFs are written
atomically, so ^C is safe at any point; the next run reconciles.

The IDs go to stdout. For debugging, after each step it saves the page's
HTML and a PNG screenshot as NN-step.html / NN-step.png in a new private
(0700) directory under the system temp dir, never under this repository,
since they contain real MC data (with --watch, only failures and Cloudflare
checks are captured). The path is printed at the start; the directory is
never deleted automatically. --no-debug turns this off.
"""

import argparse
import atexit
import base64
import getpass
import os
import re
import select
import shutil
import signal
import sys
import tempfile
import time
from html import unescape
from urllib.parse import urljoin

import mc_browser
import mc_store
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeout

START_URL = "https://mc.manuscriptcentral.com/cacm"
# Same pattern as extension/lib/ids.ts DEFAULT_ID_PATTERN.
ID_RE = re.compile(
    r"\b([A-Z][A-Z0-9]{1,15}(?:-[A-Z]{1,6})?-\d{2,4}(?:-\d{2})?-\d{3,6})(?:\.R(\d{1,2}))?\b"
)
ID_JS = r"/\b[A-Z][A-Z0-9]{1,15}(?:-[A-Z]{1,6})?-\d{2,4}(?:-\d{2})?-\d{3,6}(?:\.R\d{1,2})?\b/g"
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROFILE = os.path.join(REPO, "var", "mc-watch", "profile")  # git-ignored
STEP_TIMEOUT = 30  # seconds
PAUSE = 0.5  # seconds between clicks, roughly a person's pace
CF_WAIT = 15  # seconds to let a Cloudflare check clear by itself
HUMAN_WAIT = 5 * 60  # seconds for a person to complete it
COOKIE_BUTTONS = ["#onetrust-accept-btn-handler", "button:has-text('Accept All Cookies')"]
browser = None  # the mc_browser.Browser in use, for the window hand-off and cleanup


class BadLogin(Exception):
    """MC showed the login form again: the user ID or password was rejected."""


class Timeout(Exception):
    """A page didn't reach the expected state in time."""


def log(msg):
    print(f"[mc_queue] {msg}", file=sys.stderr, flush=True)


class Snapshots:
    """Numbered HTML + PNG captures of each step, for debugging. With
    errors_only (--watch), only failures and Cloudflare checks."""

    def __init__(self, enabled, errors_only=False):
        self.dir = tempfile.mkdtemp(prefix="mc-watch-") if enabled else None  # mkdtemp is 0700
        self.errors_only = errors_only
        self.n = 0

    def __call__(self, page, step, important=False):
        if not self.dir or (self.errors_only and not important):
            return
        self.n += 1
        base = os.path.join(self.dir, f"{self.n:02d}-{re.sub(r'[^A-Za-z0-9]+', '-', step).strip('-')}")
        try:
            with open(base + ".html", "w", encoding="utf-8") as f:
                f.write(page.content())
        except Exception as e:
            log(f"snapshot {step}: no HTML ({e.__class__.__name__})")
        try:
            page.screenshot(path=base + ".png", full_page=True, timeout=10_000)
        except Exception as e:
            log(f"snapshot {step}: no PNG ({e.__class__.__name__})")


snap = Snapshots(False)


def until(pred, timeout=STEP_TIMEOUT, what="the page"):
    """Poll pred() until it is true; pages mid-navigation count as not yet."""
    deadline = time.time() + timeout
    while True:
        try:
            if pred():
                return
        except PlaywrightError:
            pass
        if time.time() > deadline:
            raise Timeout(what)
        time.sleep(0.25)


def xp_text(s):
    """XPath string literal."""
    return f'"{s}"' if '"' not in s else "concat('" + s.replace("'", "',\"'\",'") + "')"


def link(text, exact=True):
    t = xp_text(text)
    cond = f"normalize-space(.)={t}" if exact else f"starts-with(normalize-space(.),{t})"
    return f"xpath=//a[{cond}]"


def body_text(page):
    try:
        return page.inner_text("body", timeout=5_000)
    except PlaywrightError:
        return ""


def logged_in(page):
    try:
        return page.locator(link("Log Out")).count() > 0
    except PlaywrightError:
        return False


def accept_cookies(page):
    """Answer MC's (OneTrust) cookie banner with Accept All Cookies, if it is up."""
    for sel in COOKIE_BUTTONS:
        try:
            btn = page.locator(sel).first
            if btn.count() and btn.is_visible():
                btn.click(timeout=5_000)
                log("cookie banner: Accept All Cookies")
                return True
        except PlaywrightError:
            pass
    return False


def settle(page, what):
    """After an action: let the page load, pass Cloudflare, answer the cookie banner, snapshot."""
    try:
        page.wait_for_load_state("domcontentloaded", timeout=STEP_TIMEOUT * 1000)
    except PlaywrightError:
        pass
    time.sleep(PAUSE)
    cloudflare(page)
    accept_cookies(page)
    snap(page, what)


def goto(page, url, what):
    page.goto(url, wait_until="domcontentloaded", timeout=STEP_TIMEOUT * 1000)
    settle(page, what)


def click(page, selector, what):
    log(what)
    page.locator(selector).first.click(timeout=STEP_TIMEOUT * 1000)
    settle(page, what)


def challenged(page):
    try:
        return page.title().strip().startswith("Just a moment")
    except PlaywrightError:
        return False


def cloudflare(page):
    """If Cloudflare's "Just a moment..." page is up, give it CF_WAIT seconds,
    then bring the window on-screen for a person to complete the check."""
    if not challenged(page):
        return
    snap(page, "cloudflare check", important=True)
    log(f"Cloudflare check; waiting up to {CF_WAIT} s for it to clear")
    try:
        until(lambda: not challenged(page), CF_WAIT)
    except Timeout:
        browser.unhide()
        log("Cloudflare check: please complete it in the browser window")
        until(lambda: not challenged(page), HUMAN_WAIT, "the Cloudflare check")
        browser.done_with_window()
    time.sleep(PAUSE)
    snap(page, "after cloudflare", important=True)


def list_loaded(page):
    """A manuscript list is showing (an ID, or the Co-Chair list's Take Action header)."""
    text = body_text(page)
    return "Take Action" in text or bool(ID_RE.search(text))


def manage_menu(page):
    """The item names under Manage, for error messages."""
    names = []
    for t in page.locator("xpath=//a[starts-with(normalize-space(.),'Manage')]/ancestor::li[1]//a"
                          " | //a[contains(normalize-space(.),'Center')]").all_text_contents():
        t = " ".join(t.split())
        if t and not t.startswith("Manage") and t not in names:
            names.append(t)
    return names


def open_center(page, center):
    click(page, link("Manage", exact=False), "Manage")
    if not page.locator(link(center)).count():
        items = manage_menu(page)
        raise SystemExit(f"no {center!r} under Manage for this account; the menu has: "
                         + (", ".join(repr(i) for i in items) or "nothing recognizable"))
    click(page, link(center), center)


def needs_code(page):
    return "Verification Code" in body_text(page)


def visible(page, selector):
    loc = page.locator(selector)
    return [loc.nth(i) for i in range(loc.count()) if loc.nth(i).is_visible()]


def enter_code(page):
    """MC's "Unrecognized Device" dialog: ask for the emailed code on the
    terminal (the browser is minimized), tick "Remember this device" so the
    persistent profile skips this next time, and press Verify."""
    log("MC says this is an unrecognized device and emailed a verification code")
    snap(page, "code dialog", important=True)
    dialog = "//*[contains(normalize-space(.),'Unrecognized Device') and .//input]"
    field_xp = f"xpath=({dialog})[last()]//input[@type='text' or @type='tel' or @type='number' or not(@type)]"
    # Poll the terminal and the page together, so a code typed in the browser
    # window instead also lets the run go on.
    prompt = "Verification code from the 'Communications of the ACM Verification Code' email: "
    print(prompt, end="", file=sys.stderr, flush=True)
    code = ""
    while not code:
        if logged_in(page) or not visible(page, field_xp):
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
    fields = visible(page, field_xp)
    if not fields:
        raise SystemExit("couldn't find the verification code field")
    fields[0].fill(code)
    for box in visible(page, f"xpath=({dialog})[last()]//input[@type='checkbox']"):
        box.check()  # "Remember this device"
    buttons = visible(page, "xpath=//button[contains(normalize-space(.),'Verify')]"
                            " | //a[contains(normalize-space(.),'Verify')]"
                            " | //input[@type='submit' and contains(@value,'Verify')]")
    if not buttons:
        raise SystemExit("couldn't find the Verify button")
    buttons[0].click()


def log_in(page, username, password, site_url):
    until(lambda: logged_in(page) or page.locator("input[name='USERID']").count(), what="the login form")
    if logged_in(page):
        # The saved session may be another account; start over as this one.
        snap(page, "already logged in")
        click(page, link("Log Out"), "saved session found; logging out to log in as the requested user")
        if not page.locator("input[name='USERID']").count():
            goto(page, site_url, "start page")
        until(lambda: page.locator("input[name='USERID']").count(), what="the login form")
    snap(page, "login form")
    log("logging in")
    page.locator("input[name='USERID']").first.fill(username)
    page.locator("input[name='PASSWORD']").first.fill(password)
    buttons = visible(page, "#logInButton") or visible(
        page,
        "xpath=//button[normalize-space(.)='Log In'] | //input[@type='submit' and @value='Log In']"
        " | //a[normalize-space(.)='Log In' and not(ancestor::*[contains(@class,'nav')])]",
    )
    if not buttons:
        raise SystemExit("couldn't find the Log In button")
    buttons[0].click()
    settle(page, "after Log In")
    try:
        until(lambda: logged_in(page) or needs_code(page), what="login")
    except Timeout:
        if visible(page, "input[name='USERID']"):
            snap(page, "login rejected", important=True)
            raise BadLogin(username)
        raise
    if needs_code(page):
        enter_code(page)
        settle(page, "after Verify")
        until(lambda: logged_in(page), what="login after the code")
    snap(page, "after login")


def ids_on_page(page):
    seen, out = set(), []
    for m in ID_RE.finditer(body_text(page)):
        if m.group(0) not in seen:
            seen.add(m.group(0))
            out.append(m.group(0))
    return out


def page_picker(page):
    """The 'Manuscripts [1-10] of 14' select, as (locator, option texts), or (None, [])."""
    sels = page.locator("select")
    for i in range(sels.count()):
        opts = [o.strip() for o in sels.nth(i).locator("option").all_inner_texts()]
        if opts and all(re.fullmatch(r"\d+\s*-\s*\d+", o) for o in opts):
            return sels.nth(i), opts
    return None, []


def expected_total(page):
    # The picker's options can show up in the page text ("1-10 11-14"), so allow several ranges.
    m = re.search(r"Manuscripts\s+(?:\d+\s*-\s*\d+\s*)+of\s+(\d+)", body_text(page))
    return int(m.group(1)) if m else None


def all_queue_ids(page, on_page=lambda page, ids: None):
    """Every ID in the queue, in order, calling on_page(page, new_ids) while
    each page of the list is showing."""
    ids = ids_on_page(page)
    on_page(page, ids)
    total = expected_total(page)
    _, opts = page_picker(page)
    for i in range(1, len(opts)):
        log(f"page {opts[i]}")
        sel, _ = page_picker(page)
        page.evaluate("window.__mcq_old_page = true")
        sel.select_option(index=i)
        # The picker submits a form: wait for the new page, not the old one.
        until(lambda: page.evaluate("window.__mcq_old_page === undefined"), what=f"page {opts[i]}")
        settle(page, f"queue page {opts[i]}")
        until(lambda: list_loaded(page), what=f"page {opts[i]}")
        here = [mid for mid in ids_on_page(page) if mid not in ids]
        ids += here
        on_page(page, here)
    return ids, total


VIEW_SUBMISSION_JS = """(msid) => {
  // The list is built from nested layout tables and the ID is plain text in
  // its cell (only extensions such as Electric MC make it a link). Start at
  // the innermost element whose text is exactly the ID and walk out through
  // its enclosing rows to the nearest one with a View Submission link and no
  // other manuscript's ID.
  const norm = s => (s || "").replace(/\\s+/g, " ").trim();
  const ID = %s;
  let holder = null;
  for (const el of document.body.querySelectorAll("*")) if (norm(el.textContent) === msid) holder = el;
  if (!holder) return {error: "ID not found on the page"};
  for (let tr = holder.closest("tr"); tr; tr = tr.parentElement ? tr.parentElement.closest("tr") : null) {
    const links = [...tr.querySelectorAll("a")].filter(a => norm(a.textContent).includes("View Submission"));
    if (!links.length) continue;
    const ids = new Set(norm(tr.innerText).match(ID) || []);
    if (ids.size !== 1 || !ids.has(msid)) break;  // this row already spans other manuscripts
    return {onclick: links[0].getAttribute("onclick") || "", href: links[0].getAttribute("href") || ""};
  }
  return {error: "no View Submission link in its row"};
}""" % ID_JS


def view_submission_target(page, msid):
    """The address msid's View Submission link would open."""
    r = page.evaluate(VIEW_SUBMISSION_JS, msid)
    if r.get("error"):
        raise RuntimeError(r["error"])
    m = re.search(r"window\.open\(\s*['\"]([^'\"]+)", r["onclick"])
    target = m.group(1) if m else r["href"]
    if not target or target.startswith("javascript:") or target == page.url:
        raise RuntimeError("couldn't read the View Submission address")
    return urljoin(page.url, target)


FETCH_JS = """async (url) => {
  try {
    const r = await fetch(url, {credentials: "include"});
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return {status: r.status, url: r.url, b64: btoa(bin)};
  } catch (e) {
    return {error: String(e)};
  }
}"""


def fetch(page, url):
    """GET url from inside the current page, with its session and cookies
    (so Cloudflare sees the same browser), without opening a window.
    Returns (bytes, final URL)."""
    r = page.evaluate(FETCH_JS, url)
    if r.get("error"):
        raise RuntimeError(f"fetch failed: {r['error']}")
    if r["status"] != 200:
        raise RuntimeError(f"HTTP {r['status']}")
    return base64.b64decode(r["b64"]), r["url"]


def embedded_pdf_urls(html, base):
    """URLs a proof page wraps its PDF in (iframe/embed/object/frame, or a .pdf link)."""
    urls = re.findall(r"<(?:iframe|embed|frame)\b[^>]*\bsrc=[\"']([^\"']+)", html, re.I)
    urls += re.findall(r"<object\b[^>]*\bdata=[\"']([^\"']+)", html, re.I)
    urls += re.findall(r"<a\b[^>]*\bhref=[\"']([^\"']*pdf[^\"']*)", html, re.I)
    return [urljoin(base, unescape(u)) for u in urls if not u.startswith(("about:", "javascript:"))]


def download(page, msid, dest):
    """Fetch msid's "View Submission" PDF and save it as dest. Instead of
    clicking the link (which opens a popup window, and on macOS every new
    window makes the browser the active app), read the URL its onclick would
    open and fetch it inside the list page. If that returns a page around
    the PDF, follow the embedded PDF."""
    url = view_submission_target(page, msid)
    log(f"{msid}: View Submission")
    data, final = fetch(page, url)
    if not data.startswith(b"%PDF-"):
        html = data.decode("utf-8", "replace")
        if "<title>Just a moment" in html:
            raise RuntimeError("Cloudflare challenged the download")
        inner = embedded_pdf_urls(html, final)
        if not inner:
            raise RuntimeError("View Submission returned neither a PDF nor a page with one")
        log(f"{msid}: following the PDF inside the proof page")
        data, _ = fetch(page, inner[0])
    try:
        return mc_store.save_pdf(data, dest)
    except ValueError:
        raise RuntimeError("download is not a PDF") from None


def get_password(username, ask):
    """(password, from_keychain)."""
    if not ask:
        pw = mc_store.get_password(username)
        if pw:
            return pw, True
    return getpass.getpass(f"MC password for {username}: "), False


def log_summary(tally):
    log("summary: {in_queue} in queue, {new} new, {downloaded} downloaded, {printed} printed, {errors} errors"
        .format(**tally))


def poll(page, a, cfg, store, creds, center, queues, tally):
    """One pass: log in, walk every queue (recording and downloading), log out."""

    def on_page(page, ids):
        for mid in ids:
            print(mid, flush=True)
            tally["in_queue"] += 1
            if store.seen(mid):
                tally["new"] += 1
            if a.mark_seen:
                store.mark_seen(mid)
            elif not a.list and (a.force or store.needs_download(mid)):
                needed = store.needs_download(mid)
                dest, printed = mc_store.force_target(store.get(mid), cfg)
                try:
                    path = download(page, mid, dest)
                    if printed:
                        store.replace_printed(mid, path)  # refreshed copy; not printed again
                        log(f"{mid}: downloaded again into {os.path.dirname(path)} (already printed)")
                    else:
                        store.downloaded(mid, path)
                        log(f"{mid}: downloaded" + ("" if needed else " again"))
                    tally["downloaded"] += 1
                except (RuntimeError, PlaywrightError, OSError) as e:
                    if needed:
                        store.error(mid, f"download: {e}")
                    tally["errors"] += 1
                    log(f"{mid}: download failed: {e}" + ("" if needed else "; kept the copy already here"))
                    snap(page, f"{mid} download error", important=True)
                time.sleep(PAUSE * 4)  # one at a time, at a person's pace

    username = creds["username"]
    log(f"opening {cfg['site_url']}")
    goto(page, cfg["site_url"], "start page")
    try:
        log_in(page, username, creds["password"], cfg["site_url"])
    except BadLogin:
        if not creds["from_keychain"]:
            raise SystemExit(f"MC rejected the user ID or password for {username}")
        log("MC rejected the Keychain password; deleting it")
        mc_store.forget_password(username)
        creds["password"], creds["from_keychain"] = get_password(username, ask=True)
        goto(page, cfg["site_url"], "start page")
        log_in(page, username, creds["password"], cfg["site_url"])
    if not creds["from_keychain"]:
        mc_store.set_password(username, creds["password"])
        creds["from_keychain"] = True
        log(f"saved the password for {username} in the Keychain")
    for n, queue in enumerate(queues):
        if n:
            log(f"back to {center}")
        open_center(page, center)
        try:
            until(lambda: any(q in body_text(page) for q in queues), what="the dashboard")
        except Timeout:
            pass  # reported below as "no such list"
        snap(page, "center dashboard")
        # The dashboard shows "N <queue>"; at 0 it's plain text, not a link.
        m = re.search(rf"(\d+)\s+{re.escape(queue)}", body_text(page))
        if (m and m.group(1) == "0") or not page.locator(link(queue)).count():
            log(f"0 manuscripts in {queue!r}" + ("" if m else " (no such list on this dashboard?)"))
            continue
        click(page, link(queue), queue)
        until(lambda: list_loaded(page), what=queue)
        snap(page, "queue")
        ids, total = all_queue_ids(page, on_page)
        log(f"{queue}: {len(ids)} manuscript IDs" + (f" (MC says {total})" if total is not None else ""))
        if total is not None and total != len(ids):
            log("WARNING: count differs from MC's total")
    if not a.stay_logged_in and logged_in(page):
        click(page, link("Log Out"), "logging out")


def print_pending(a, cfg, store, tally):
    if a.list or a.no_print or a.mark_seen:
        return
    for row in store.pending_print():
        job = mc_store.print_and_file(store, row, cfg)
        if job:
            tally["printed"] += 1
            log(f"{row['msid']}: printed on {cfg['printer']} ({job})")
        else:
            tally["errors"] += 1
            log(f"{row['msid']}: print failed: {store.get(row['msid'])['last_error']}")


def cleanup():
    """Stop the browser and anything else still running on its profile."""
    global browser
    if browser:
        browser.stop()
        browser = None
    mc_browser.kill_strays(PROFILE, log)


def on_sigterm(signum, frame):
    raise KeyboardInterrupt  # unwinds through the same cleanup as ^C


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("username", nargs="?", help="MC user ID (default: username in the config)")
    ap.add_argument("--config", help=f"config file (default: ${mc_store.ENV_VAR}, else {mc_store.REPO_CONFIG})")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--list", action="store_true", help="only list and record the queue")
    mode.add_argument("--no-print", action="store_true", help="download new PDFs but don't print")
    mode.add_argument("--mark-seen", action="store_true",
                      help="record the current queue as printed, without downloading or printing")
    ap.add_argument("--force", action="store_true",
                    help="download every manuscript in the queue again, replacing the local copy "
                         "(already-printed ones are refreshed in printed_dir, not reprinted)")
    ap.add_argument("--watch", nargs="?", type=float, const=-1, metavar="MINUTES",
                    help="keep polling every MINUTES (default: watch_minutes in the config) with one browser")
    ap.add_argument("--role", choices=sorted(mc_store.ROLES), help="preset center and queues (default: config role)")
    ap.add_argument("--center", help="the item under Manage, e.g. 'Associate Editor Center'")
    ap.add_argument("--queue", action="append", help="a list on that center's dashboard; repeat for several")
    ap.add_argument("--forget-password", action="store_true", help="delete the Keychain password first")
    ap.add_argument("--show", action="store_true", help="keep the browser window on-screen")
    ap.add_argument("--fresh", action="store_true", help="delete the saved profile (cookies) first")
    ap.add_argument("--no-debug", action="store_true", help="don't save HTML/PNG snapshots")
    ap.add_argument("--stay-logged-in", action="store_true", help="don't click Log Out at the end")
    a = ap.parse_args()

    cfg = mc_store.load_config(mc_store.config_path(a.config, log=log))
    username = a.username or cfg["username"]
    center, queues = mc_store.role_queues(cfg, a.role, a.center, a.queue)
    log(f"center {center!r}; queues {', '.join(repr(q) for q in queues)}")
    if not username:
        raise SystemExit(f"no MC user ID: give one, or set username in {cfg['path']}")
    store = mc_store.Store(cfg["database"])
    store.reconcile(cfg["downloads_dir"], log=log)
    log(f"config {cfg['path']}; downloads {cfg['downloads_dir']}; database {cfg['database']}")
    minutes = None if a.watch is None else (cfg["watch_minutes"] if a.watch < 0 else a.watch)

    global snap, browser
    snap = Snapshots(not a.no_debug, errors_only=minutes is not None)
    if snap.dir:
        log(f"debug snapshots (real MC data; delete when done): {snap.dir}")
    if a.forget_password and mc_store.forget_password(username):
        log(f"deleted the Keychain password for {username}")
    password, from_keychain = get_password(username, ask=False)
    creds = dict(username=username, password=password, from_keychain=from_keychain)

    atexit.register(cleanup)
    signal.signal(signal.SIGTERM, on_sigterm)
    signal.signal(signal.SIGINT, signal.default_int_handler)  # even if started with SIGINT ignored
    mc_browser.kill_strays(PROFILE, log)  # left over from a crash
    if a.fresh:
        shutil.rmtree(PROFILE, ignore_errors=True)
    os.makedirs(PROFILE, exist_ok=True)
    log(f"browser: {mc_browser.ensure_chromium(log)}")

    tally = dict(in_queue=0, new=0, downloaded=0, printed=0, errors=0)
    status, polls = 0, 0
    focus_owner = None if a.show else mc_browser.frontmost_app()
    try:
        while True:
            if browser is None:
                browser = mc_browser.Browser(PROFILE, log, show=a.show, focus_owner=focus_owner)
                browser.start()
            polls += 1
            try:
                poll(browser.page, a, cfg, store, creds, center, queues, tally)
            except (Timeout, PlaywrightTimeout) as e:
                where = browser.page.url.split("?")[0] if browser.page else "?"
                log(f"timed out waiting for {e} at {where}")
                snap(browser.page, "error timeout", important=True)
                status = 1
                if minutes is not None:
                    cleanup()  # a fresh browser for the next poll
            except PlaywrightError as e:
                log(f"browser error: {str(e).splitlines()[0]}")
                status = 1
                cleanup()
                if minutes is None:
                    break
            print_pending(a, cfg, store, tally)
            log_summary(tally)
            if minutes is None:
                break
            if browser and (polls % cfg["restart_every"] == 0 or browser.rss_mb() > cfg["max_rss_mb"]):
                log(f"restarting the browser (poll {polls}, {browser.rss_mb():.0f} MB)")
                cleanup()
            log(f"next poll in {minutes:g} minutes (^C to stop)")
            time.sleep(minutes * 60)
            for k in tally:
                tally[k] = 0
    except KeyboardInterrupt:
        print(file=sys.stderr)
        log("interrupted; the database is up to date")
        log_summary(tally)
        status = 130
    finally:
        cleanup()
        if snap.dir:
            log(f"debug snapshots: {snap.dir}")
    return status or (1 if tally["errors"] else 0)


if __name__ == "__main__":
    sys.exit(main())
