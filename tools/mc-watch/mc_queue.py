#!/usr/bin/env python3
"""List the manuscript IDs in the Co-Chair "Awaiting AE Assignment" queue.

Test program for the auto-print idea. It drives a real browser through the
same clicks a person makes:

    log in -> Manage -> Co-Chair Center -> Co-Chair Tasks:
    Awaiting AE Assignment -> print each Manuscript ID (all pages)

Usage:
    python3 tools/mc-watch/mc_queue.py USERNAME [--site cacm] [--headless]

The password is read from a prompt (never from the command line or a file).
The browser runs with its own profile in var/mc-watch/profile (git-ignored),
separate from your everyday Chrome, so it has its own MC session. It logs out
at the end unless --stay-logged-in is given.

Nothing from MC is written to disk; the IDs go to stdout only.

Setup (once):
    python3 -m venv var/mc-watch/venv
    var/mc-watch/venv/bin/pip install playwright
    var/mc-watch/venv/bin/python -m playwright install chromium   # skip if using --channel chrome
"""

import argparse
import getpass
import os
import re
import sys

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

# Same pattern as extension/lib/ids.ts DEFAULT_ID_PATTERN.
ID_RE = re.compile(
    r"\b([A-Z][A-Z0-9]{1,15}(?:-[A-Z]{1,6})?-\d{2,4}(?:-\d{2})?-\d{3,6})(?:\.R(\d{1,2}))?\b"
)
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROFILE = os.path.join(REPO, "var", "mc-watch", "profile")
STEP_TIMEOUT_MS = 30_000
HUMAN_TIMEOUT_MS = 5 * 60_000  # time allowed for a code / CAPTCHA typed by hand


def log(msg):
    print(f"[mc_queue] {msg}", file=sys.stderr, flush=True)


def logged_in(page):
    return page.get_by_role("link", name="Log Out").count() > 0


def log_in(page, username, password, headless):
    user = page.locator("input[name='USERID'], input#USERID").first
    if not user.count() or not user.is_visible():
        log("no login form; assuming the saved profile is still logged in")
        return
    log("logging in")
    user.fill(username)
    page.locator("input[name='PASSWORD'], input#PASSWORD, input[type='password']").first.fill(password)
    button = page.get_by_role("button", name=re.compile(r"^\s*Log In\s*$"))
    if not button.count():
        button = page.locator("#logInButton, input[type='submit'][value='Log In']")
    button.first.click()
    page.wait_for_load_state("domcontentloaded")
    if logged_in(page):
        return
    # A verification code or other extra step. In a visible window, let the
    # person finish it; headless, give up.
    if headless:
        raise SystemExit("login did not complete (extra verification step?); rerun without --headless")
    log("waiting up to 5 minutes for you to finish logging in in the browser window")
    page.get_by_role("link", name="Log Out").first.wait_for(timeout=HUMAN_TIMEOUT_MS)


def open_cochair_center(page):
    log("Manage -> Co-Chair Center")
    page.get_by_role("link", name=re.compile(r"^\s*Manage\b")).first.click()
    center = page.get_by_role("link", name=re.compile(r"^\s*Co-Chair Center\s*$")).first
    center.wait_for(state="visible", timeout=STEP_TIMEOUT_MS)
    center.click()
    page.wait_for_load_state("domcontentloaded")
    page.get_by_text("Co-Chair Tasks").first.wait_for(timeout=STEP_TIMEOUT_MS)


def open_awaiting_ae_assignment(page):
    log("Co-Chair Tasks -> Awaiting AE Assignment")
    page.get_by_role("link", name=re.compile(r"^\s*Awaiting AE Assignment\s*$")).first.click()
    page.wait_for_load_state("domcontentloaded")
    page.get_by_text("Take Action").first.wait_for(timeout=STEP_TIMEOUT_MS)


def ids_on_page(page):
    """Manuscript IDs in the queue table, in page order."""
    text = page.locator("body").inner_text()
    seen, out = set(), []
    for m in ID_RE.finditer(text):
        mid = m.group(0)
        if mid not in seen:
            seen.add(mid)
            out.append(mid)
    return out


def page_select(page):
    """The 'Manuscripts [1-10] of 14' page picker, or None."""
    for sel in page.locator("select").all():
        opts = [o.strip() for o in sel.locator("option").all_inner_texts()]
        if opts and all(re.fullmatch(r"\d+\s*-\s*\d+", o) for o in opts):
            return sel, opts
    return None, []


def expected_total(page):
    m = re.search(r"Manuscripts\s+\d+\s*-\s*\d+\s+of\s+(\d+)", page.locator("body").inner_text())
    if m:
        return int(m.group(1))
    m = re.search(r"\bof\s+(\d+)\b", page.locator("body").inner_text())
    return int(m.group(1)) if m else None


def all_queue_ids(page):
    ids = ids_on_page(page)
    total = expected_total(page)
    _, opts = page_select(page)
    for i in range(1, len(opts)):
        log(f"page {opts[i]}")
        sel, _ = page_select(page)
        sel.select_option(index=i)
        page.wait_for_load_state("domcontentloaded")
        page.get_by_text("Take Action").first.wait_for(timeout=STEP_TIMEOUT_MS)
        for mid in ids_on_page(page):
            if mid not in ids:
                ids.append(mid)
    return ids, total


def log_out(page):
    out = page.get_by_role("link", name="Log Out")
    if out.count():
        log("logging out")
        out.first.click()
        page.wait_for_load_state("domcontentloaded")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("username", help="your MC user ID")
    ap.add_argument("--site", default="cacm", help="MC site path (default: cacm)")
    ap.add_argument("--headless", action="store_true", help="no visible window")
    ap.add_argument("--channel", default="chrome",
                    help="browser to drive: chrome (your installed Google Chrome, own profile) or chromium")
    ap.add_argument("--slow-mo", type=int, default=300, help="ms pause between actions (default 300)")
    ap.add_argument("--stay-logged-in", action="store_true", help="don't log out at the end")
    a = ap.parse_args()

    password = getpass.getpass(f"MC password for {a.username}: ")
    os.makedirs(PROFILE, exist_ok=True)
    url = f"https://mc.manuscriptcentral.com/{a.site}"

    with sync_playwright() as p:
        kwargs = dict(headless=a.headless, slow_mo=a.slow_mo, accept_downloads=False)
        if a.channel != "chromium":
            kwargs["channel"] = a.channel
        ctx = p.chromium.launch_persistent_context(PROFILE, **kwargs)
        ctx.set_default_timeout(STEP_TIMEOUT_MS)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            log(f"opening {url}")
            page.goto(url, wait_until="domcontentloaded")
            log_in(page, a.username, password, a.headless)
            open_cochair_center(page)
            open_awaiting_ae_assignment(page)
            ids, total = all_queue_ids(page)
            for mid in ids:
                print(mid)
            log(f"{len(ids)} manuscript IDs" + (f" (MC says {total})" if total is not None else ""))
            if total is not None and total != len(ids):
                log("WARNING: count differs from MC's total")
            if not a.stay_logged_in:
                log_out(page)
        except PWTimeout as e:
            log(f"timed out at {page.url.split('?')[0]} (title: {page.title()!r}): {e.message.splitlines()[0]}")
            if not a.headless:
                input("Browser left open so you can see where it stopped. Press Return to close. ")
            return 1
        finally:
            ctx.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
