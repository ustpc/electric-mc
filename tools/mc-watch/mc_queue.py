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
The browser keeps its own persistent profile (cookie jar) in
var/mc-watch/profile (git-ignored), so MC's "Remember this device" cookie
survives between runs and the emailed verification code is needed only once.
--fresh deletes that profile first. It never touches your installed Chrome or
its profile. If MC asks for a verification code, type it at the terminal.

The browser is Selenium-driven Chromium. By default Selenium Manager fetches
"Chrome for Testing" (a stock Chromium build) into ~/.cache/selenium the first
time and the script refuses to start any browser under /Applications. (Asked
only for "stable", Selenium Manager would pick the installed Google Chrome.)
Pass --chromium (and --chromedriver) to use another Chromium instead.

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
import os
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


def needs_code(d):
    return "Verification Code" in body_text(d)


def visible(d, xpath):
    return [e for e in d.find_elements(By.XPATH, xpath) if e.is_displayed()]


def enter_code(d):
    """MC's "Unrecognized Device" dialog: ask for the emailed code on the
    terminal (the browser is offscreen), tick "Remember this device" so the
    persistent profile skips this next time, and press Verify."""
    log("MC says this is an unrecognized device and emailed a verification code")
    code = input("Verification code from the 'Communications of the ACM Verification Code' email: ").strip()
    dialog = "//*[contains(normalize-space(.),'Unrecognized Device') and .//input]"
    fields = visible(d, f"({dialog})[last()]//input[@type='text' or @type='tel' or @type='number' or not(@type)]")
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
        log("still logged in from the saved profile")
        return
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
    WebDriverWait(d, STEP_TIMEOUT).until(lambda d: logged_in(d) or needs_code(d))
    if needs_code(d):
        enter_code(d)
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
    ap.add_argument("--chromedriver", help="path to the chromedriver that matches --chromium")
    ap.add_argument("--show", action="store_true", help="show the browser window (for debugging)")
    ap.add_argument("--fresh", action="store_true", help="delete the saved profile (cookies) first")
    ap.add_argument("--stay-logged-in", action="store_true", help="don't click Log Out at the end")
    a = ap.parse_args()

    password = getpass.getpass(f"MC password for {a.username}: ")
    if a.fresh:
        shutil.rmtree(PROFILE, ignore_errors=True)
    os.makedirs(PROFILE, exist_ok=True)
    opts = webdriver.ChromeOptions()
    if not a.show:
        opts.add_argument("--headless=new")
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


if __name__ == "__main__":
    sys.exit(main())
