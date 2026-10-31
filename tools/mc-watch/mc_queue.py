#!/usr/bin/env python3
"""List the manuscript IDs in the Co-Chair "Awaiting AE Assignment" queue.

Test program for the auto-print idea. It drives an offscreen (headless)
Chromium through the same clicks a person makes:

    https://mc.manuscriptcentral.com/cacm -> log in -> Manage ->
    Co-Chair Center -> Co-Chair Tasks: Awaiting AE Assignment ->
    print each Manuscript ID (all pages) -> log out

Usage:
    python3 tools/mc-watch/mc_queue.py USERNAME [--show] [--chromium PATH]

The password is read from a prompt (never from the command line or a file).
Every run starts from a new, empty browser profile in a temporary directory
(no cookies, no history), which is deleted at the end. It never touches your
installed Chrome or its profile.

The browser is Selenium-driven Chromium. By default Selenium Manager fetches
"Chrome for Testing" (a stock Chromium build) into its own cache the first
time; pass --chromium to use another Chromium binary instead.

Nothing from MC is written to disk; the IDs go to stdout only.

Setup (once):
    python3 -m venv var/mc-watch/venv
    var/mc-watch/venv/bin/pip install selenium
"""

import argparse
import getpass
import re
import shutil
import sys
import tempfile
import time

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

START_URL = "https://mc.manuscriptcentral.com/cacm"
# Same pattern as extension/lib/ids.ts DEFAULT_ID_PATTERN.
ID_RE = re.compile(
    r"\b([A-Z][A-Z0-9]{1,15}(?:-[A-Z]{1,6})?-\d{2,4}(?:-\d{2})?-\d{3,6})(?:\.R(\d{1,2}))?\b"
)
STEP_TIMEOUT = 30  # seconds
PAUSE = 0.5  # seconds between clicks, roughly a person's pace


def log(msg):
    print(f"[mc_queue] {msg}", file=sys.stderr, flush=True)


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


def wait_text(d, text):
    WebDriverWait(d, STEP_TIMEOUT).until(lambda d: text in body_text(d))


def log_in(d, username, password):
    WebDriverWait(d, STEP_TIMEOUT).until(EC.presence_of_element_located((By.NAME, "USERID")))
    log("logging in")
    d.find_element(By.NAME, "USERID").send_keys(username)
    d.find_element(By.NAME, "PASSWORD").send_keys(password)
    buttons = d.find_elements(By.ID, "logInButton") or d.find_elements(
        By.XPATH,
        "//button[normalize-space(.)='Log In'] | //input[@type='submit' and @value='Log In']"
        " | //a[normalize-space(.)='Log In' and not(ancestor::*[contains(@class,'nav')])]",
    )
    if not buttons:
        raise SystemExit("couldn't find the Log In button")
    buttons[0].click()
    try:
        WebDriverWait(d, STEP_TIMEOUT).until(logged_in)
        return
    except TimeoutException:
        pass
    # Probably a verification-code step. Ask for the code here, since the
    # browser is offscreen, and type it into the page's visible text field.
    fields = [
        f for f in d.find_elements(By.XPATH, "//input[@type='text' or @type='tel' or @type='number' or not(@type)]")
        if f.is_displayed()
    ]
    if not fields:
        raise SystemExit(f"login did not complete; page title is {d.title!r}")
    log(f"MC wants another step; page title is {d.title!r}")
    code = input("Verification code (from your email/phone): ").strip()
    fields[0].clear()
    fields[0].send_keys(code)
    submits = [
        b for b in d.find_elements(By.XPATH, "//button | //input[@type='submit'] | //a[contains(@class,'btn')]")
        if b.is_displayed()
    ]
    if not submits:
        raise SystemExit("couldn't find a button to submit the code")
    submits[0].click()
    WebDriverWait(d, STEP_TIMEOUT).until(logged_in)


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
        wait_text(d, "Take Action")
        time.sleep(PAUSE)
        for mid in ids_on_page(d):
            if mid not in ids:
                ids.append(mid)
    return ids, total


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("username", help="your MC user ID")
    ap.add_argument("--chromium", help="path to a Chromium binary (default: Chrome for Testing via Selenium Manager)")
    ap.add_argument("--show", action="store_true", help="show the browser window (for debugging)")
    ap.add_argument("--stay-logged-in", action="store_true", help="don't click Log Out at the end")
    a = ap.parse_args()

    password = getpass.getpass(f"MC password for {a.username}: ")
    profile = tempfile.mkdtemp(prefix="mc-watch-")
    opts = webdriver.ChromeOptions()
    if not a.show:
        opts.add_argument("--headless=new")
    opts.add_argument(f"--user-data-dir={profile}")
    opts.add_argument("--window-size=1400,1000")
    opts.add_argument("--no-first-run")
    opts.add_argument("--no-default-browser-check")
    if a.chromium:
        opts.binary_location = a.chromium
    else:
        opts.browser_version = "stable"  # Chrome for Testing, never the installed Chrome

    d = webdriver.Chrome(options=opts)
    try:
        log(f"opening {START_URL}")
        d.get(START_URL)
        log_in(d, a.username, password)
        click(d, link("Manage", exact=False), "Manage")
        click(d, link("Co-Chair Center"), "Co-Chair Center")
        wait_text(d, "Co-Chair Tasks")
        click(d, link("Awaiting AE Assignment"), "Awaiting AE Assignment")
        wait_text(d, "Take Action")
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
        return 1
    finally:
        d.quit()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
