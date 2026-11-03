"""Offline browser tests for mc_queue's "View Submission" lookup, in-page
download, and cookie-banner click.

A synthetic queue page copies the shape of a ScholarOne list: an outer
layout table whose single row holds the whole list, an inner table with one
row per manuscript, the ID as plain text in its cell, and the "[ View
Submission]" link in the title cell; one row nests the ID in a table of its
own. Placeholder IDs and invented titles only. It runs Playwright's Chromium
(headless) against a local HTTP server, so it never touches MC; downloads are
fetched inside the page, so no window opens. Skipped if Playwright's
Chromium isn't installed.
"""

import functools
import http.server
import os
import threading

import pytest

sync_api = pytest.importorskip("playwright.sync_api")
import mc_queue  # noqa: E402

ROW = """<tr><td class="tablelightcolor"><p class="listcontents">{id}
</p></td><td class="tablelightcolor"><p class="listcontents">{title} [ <a href=""
 onclick="JavaScript: window.open('{target}','pdf_proof_window','toolbar=yes'); return false;"
 target="_proof">View
 Submission</a>]</p></td><td rowspan="2">01-Jan-2026</td></tr>
<tr><td class="tablelightcolor"><p class="listcontents">Opinion</p></td>
<td><p class="listcontents">Author, Pat</p></td></tr>"""

NESTED = """<tr><td><table><tr><td><p>{id}</p></td></tr></table></td>
<td><p>{title} [ <a href="" onclick="window.open('{target}','pdf_proof_window'); return false;">View Submission</a>]</p></td></tr>"""

PAGE = """<html><head><title>Awaiting AE Assignment</title></head><body>
<table width="100%"><tr><td class="tablelines">
<table cellpadding="0" cellspacing="1"><tbody>
<tr><td class="newsecondary">Manuscript ID</td><td class="newsecondary">Take Action</td></tr>
{rows}
<tr><td><p class="listcontents">XYZJ-26-01-9003</p></td><td><p>A Synthetic Paper Without a Proof</p></td></tr>
</tbody></table></td></tr></table>
<div id="onetrust-banner-sdk">By clicking "Accept All Cookies"...
<button id="onetrust-accept-btn-handler" onclick="this.parentNode.remove(); document.title='accepted'">Accept All Cookies</button></div>
</body></html>"""

IDS = ("XYZJ-26-01-9001", "XYZJ-26-01-9001.R1", "XYZJ-26-01-9002")


@pytest.fixture(scope="module")
def site(tmp_path_factory):
    root = tmp_path_factory.mktemp("site")
    rows = (ROW.format(id=IDS[0], title="A Synthetic Paper About Direct PDFs", target="a.pdf")
            + ROW.format(id=IDS[1], title="A Synthetic Revision", target="wrap.html")
            + NESTED.format(id=IDS[2], title="A Synthetic Paper in a Nested Cell", target="a.pdf"))
    (root / "queue.html").write_text(PAGE.format(rows=rows))
    (root / "a.pdf").write_bytes(b"%PDF-1.4\n% synthetic test file\n")
    (root / "wrap.html").write_text('<html><body><iframe src="a.pdf"></iframe></body></html>')
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    handler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_port}/queue.html"
    srv.shutdown()


@pytest.fixture(scope="module")
def page():
    with sync_api.sync_playwright() as p:
        if not os.path.exists(p.chromium.executable_path):
            pytest.skip("Playwright's Chromium isn't installed (uv run --with playwright playwright install chromium)")
        b = p.chromium.launch(headless=True)
        yield b.new_page()
        b.close()


def test_link_found_in_nested_tables(site, page):
    page.goto(site)
    for msid in IDS:
        assert mc_queue.view_submission_target(page, msid).startswith(site.rsplit("/", 1)[0])
    with pytest.raises(RuntimeError, match="no View Submission"):
        mc_queue.view_submission_target(page, "XYZJ-26-01-9003")  # never uses the outer row's link
    with pytest.raises(RuntimeError, match="not found"):
        mc_queue.view_submission_target(page, "XYZJ-26-01-9999")


def test_download_direct_and_wrapped(site, page, tmp_path):
    page.goto(site)
    for msid in IDS:
        dest = str(tmp_path / f"{msid}.pdf")
        assert mc_queue.download(page, msid, dest) == dest
        assert open(dest, "rb").read(5) == b"%PDF-"
    assert len(page.context.pages) == 1  # fetched in the page: no popup window
    assert sorted(os.listdir(tmp_path)) == sorted(f"{m}.pdf" for m in IDS)


def test_html_that_is_not_a_proof_page_is_an_error(site, page, tmp_path):
    page.goto(site)
    page.evaluate("""document.querySelector('a[onclick*="a.pdf"]').setAttribute(
        'onclick', "window.open('queue.html','pdf_proof_window'); return false;")""")
    with pytest.raises(RuntimeError, match="neither a PDF"):
        mc_queue.download(page, IDS[0], str(tmp_path / "x.pdf"))
    assert os.listdir(tmp_path) == []


def test_cookie_banner_accepted(site, page):
    page.goto(site)
    assert mc_queue.accept_cookies(page) is True
    assert page.title() == "accepted"
    assert mc_queue.accept_cookies(page) is False  # gone; nothing to click
