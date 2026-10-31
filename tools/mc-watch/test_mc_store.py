"""Tests for mc_store: config defaults, the document state machine, and
printing/filing. Printing uses a fake `lp` script, so nothing reaches a real
printer, and every path is under pytest's tmp_path. All IDs are made up.

    make mc-watch-test
"""

import os
import stat

import pytest

import mc_store


def fake_lp(tmp_path, ok=True):
    """An executable that records its arguments and answers like CUPS lp."""
    lp = tmp_path / "lp"
    log = tmp_path / "lp.args"
    body = f'echo "$@" >> {log}\necho "request id is Fake_Printer-42 (1 file(s))"\n' if ok else \
        'echo "lp: The printer or class does not exist." >&2\nexit 1\n'
    lp.write_text("#!/bin/sh\n" + body)
    lp.chmod(lp.stat().st_mode | stat.S_IXUSR)
    return str(lp), log


@pytest.fixture
def cfg(tmp_path):
    path = tmp_path / "cacm-opn" / "config.toml"
    c = mc_store.load_config(str(path))
    c["downloads_dir"] = str(tmp_path / "downloads")
    c["printed_dir"] = str(tmp_path / "printed")
    os.makedirs(c["downloads_dir"])
    return c


def test_config_written_with_defaults(tmp_path):
    path = tmp_path / "sub" / "config.toml"
    c = mc_store.load_config(str(path))
    assert path.exists() and "printer" in path.read_text()
    assert c["printer"] == "High_Priestess"
    assert "sides=two-sided-long-edge" in c["lp_options"]
    assert c["downloads_dir"] == os.path.expanduser("~/cacm-opn/downloads")
    assert c["site_url"] == "https://mc.manuscriptcentral.com/cacm"


def test_config_overrides(tmp_path):
    path = tmp_path / "config.toml"
    path.write_text('downloads_dir = "~/elsewhere"\nprinter = "Other"\n')
    c = mc_store.load_config(str(path))
    assert c["downloads_dir"] == os.path.expanduser("~/elsewhere")
    assert c["printer"] == "Other"
    assert c["username"] == ""  # default kept


def test_config_path_order(tmp_path):
    repo, old = str(tmp_path / "var" / "config.toml"), str(tmp_path / "old.toml")
    kw = dict(repo_config=repo, old_config=old, log=lambda m: None)
    assert mc_store.config_path("/x/cli.toml", "/x/env.toml", **kw) == "/x/cli.toml"
    assert mc_store.config_path(None, "/x/env.toml", **kw) == "/x/env.toml"
    assert mc_store.config_path(None, "", **kw) == repo
    assert not os.path.exists(repo)  # nothing to move, nothing written yet


def test_old_config_moved_once(tmp_path):
    repo, old = tmp_path / "var" / "config.toml", tmp_path / "old.toml"
    old.write_text('printer = "Moved"\n')
    msgs = []
    path = mc_store.config_path(None, "", repo_config=str(repo), old_config=str(old), log=msgs.append)
    assert path == str(repo) and repo.read_text() == 'printer = "Moved"\n' and not old.exists()
    assert len(msgs) == 1 and "moved" in msgs[0]
    old.write_text("stale\n")  # the repo config now wins; the old one is left alone
    mc_store.config_path(None, "", repo_config=str(repo), old_config=str(old), log=msgs.append)
    assert old.exists() and len(msgs) == 1


@pytest.mark.parametrize("msid,expect", [
    ("TEST-26-10-9001", ("TEST-26-10-9001", 0, 2026)),
    ("TEST-25-08-9002.R1", ("TEST-25-08-9002", 1, 2025)),
    ("TEST-X-24-01-9999.R12", ("TEST-X-24-01-9999", 12, 2024)),
])
def test_split_msid(msid, expect):
    assert mc_store.split_msid(msid) == expect


def test_seen_is_new_only_once():
    s = mc_store.Store(":memory:")
    assert s.seen("TEST-26-10-9001") is True
    assert s.seen("TEST-26-10-9001") is False
    row = s.get("TEST-26-10-9001")
    assert row["state"] == "seen" and row["revision"] == 0
    assert s.needs_download("TEST-26-10-9001")


def test_revision_is_its_own_document():
    s = mc_store.Store(":memory:")
    s.seen("TEST-26-08-9002")
    s.mark_seen("TEST-26-08-9002")
    assert s.seen("TEST-26-08-9002.R1") is True
    assert s.needs_download("TEST-26-08-9002.R1")
    assert not s.needs_download("TEST-26-08-9002")


def test_print_moves_file_and_records_job(tmp_path, cfg):
    lp, args = fake_lp(tmp_path)
    s = mc_store.Store(str(tmp_path / "db.sqlite"))
    pdf = os.path.join(cfg["downloads_dir"], "TEST-26-10-9001.pdf")
    open(pdf, "wb").write(b"%PDF-1.4 fake")
    s.seen("TEST-26-10-9001")
    s.downloaded("TEST-26-10-9001", pdf)
    assert not s.needs_download("TEST-26-10-9001")
    [row] = s.pending_print()
    assert mc_store.print_and_file(s, row, cfg, lp=lp) == "Fake_Printer-42"
    dest = os.path.join(cfg["printed_dir"], "2026", "TEST-26-10-9001", "TEST-26-10-9001.pdf")
    assert os.path.exists(dest) and not os.path.exists(pdf)
    row = s.get("TEST-26-10-9001")
    assert (row["state"], row["printed_path"], row["lp_job"]) == ("printed", dest, "Fake_Printer-42")
    assert s.pending_print() == []
    assert args.read_text().split() == ["-d", "High_Priestess", "-o", "sides=two-sided-long-edge",
                                        "-o", "print-color-mode=color", "-o", "ColorModel=RGB", pdf]


def test_print_failure_leaves_file_and_retries(tmp_path, cfg):
    bad, _ = fake_lp(tmp_path, ok=False)
    s = mc_store.Store(":memory:")
    pdf = os.path.join(cfg["downloads_dir"], "TEST-26-10-9003.pdf")
    open(pdf, "wb").write(b"%PDF-1.4 fake")
    s.seen("TEST-26-10-9003")
    s.downloaded("TEST-26-10-9003", pdf)
    [row] = s.pending_print()
    assert mc_store.print_and_file(s, row, cfg, lp=bad) is None
    row = s.get("TEST-26-10-9003")
    assert row["state"] == "error" and "does not exist" in row["last_error"]
    assert os.path.exists(pdf)
    assert not s.needs_download("TEST-26-10-9003")  # the file is still there
    assert [r["msid"] for r in s.pending_print()] == ["TEST-26-10-9003"]  # retried next run


def test_download_error_retries_download():
    s = mc_store.Store(":memory:")
    s.seen("TEST-26-10-9004")
    s.error("TEST-26-10-9004", "download: no PDF arrived")
    assert s.needs_download("TEST-26-10-9004")
    assert s.pending_print() == []


def test_role_queues_precedence():
    cfg = {"role": "ae"}
    assert mc_store.role_queues(cfg) == mc_store.ROLES["ae"][0:1] + (mc_store.ROLES["ae"][1],)
    assert mc_store.role_queues({}) == ("Co-Chair Center", ["Awaiting AE Assignment"])
    assert mc_store.role_queues(cfg, role="eic")[0] == "Editor-in-Chief Center"
    cfg = {"role": "ae", "center": "Handling Editor Center", "queues": ["List A", "List B"]}
    assert mc_store.role_queues(cfg) == ("Handling Editor Center", ["List A", "List B"])
    assert mc_store.role_queues(cfg, queues=["Only"]) == ("Handling Editor Center", ["Only"])
    with pytest.raises(SystemExit):
        mc_store.role_queues({"role": "publisher"})


def test_save_pdf_is_atomic(tmp_path):
    dest = str(tmp_path / "d" / "TEST-26-10-9005.pdf")
    assert mc_store.save_pdf(b"%PDF-1.4 fake", dest) == dest
    assert open(dest, "rb").read() == b"%PDF-1.4 fake"
    assert os.listdir(tmp_path / "d") == ["TEST-26-10-9005.pdf"]  # no .part left
    with pytest.raises(ValueError):
        mc_store.save_pdf(b"<html>Just a moment...</html>", str(tmp_path / "d" / "TEST-26-10-9006.pdf"))
    assert os.listdir(tmp_path / "d") == ["TEST-26-10-9005.pdf"]


def test_reconcile_after_interrupt(tmp_path):
    dl = tmp_path / "downloads"
    dl.mkdir()
    (dl / "TEST-26-10-9007.pdf").write_bytes(b"%PDF-1.4 saved, then ^C before the DB update")
    (dl / "TEST-26-10-9008.pdf.part").write_bytes(b"%PDF-1.4 half")
    (dl / "TEST-26-10-9009.pdf").write_bytes(b"%PDF-1.4 known")
    (dl / "notes.txt").write_text("not ours")
    s = mc_store.Store(str(tmp_path / "db.sqlite"))
    s.seen("TEST-26-10-9007")
    s.error("TEST-26-10-9007", "download: interrupted")
    s.seen("TEST-26-10-9009")
    s.downloaded("TEST-26-10-9009", str(dl / "TEST-26-10-9009.pdf"))
    found = s.reconcile(str(dl), log=lambda m: None)
    assert found == ["TEST-26-10-9007"]
    assert s.get("TEST-26-10-9007")["state"] == "downloaded"
    assert not (dl / "TEST-26-10-9008.pdf.part").exists()
    assert (dl / "notes.txt").exists()
    assert sorted(r["msid"] for r in s.pending_print()) == ["TEST-26-10-9007", "TEST-26-10-9009"]
    assert s.reconcile(str(dl), log=lambda m: None) == []  # idempotent


def test_interrupted_print_is_not_sent_twice(tmp_path, cfg):
    lp, args = fake_lp(tmp_path)
    s = mc_store.Store(str(tmp_path / "db.sqlite"))
    pdf = os.path.join(cfg["downloads_dir"], "TEST-26-10-9010.pdf")
    open(pdf, "wb").write(b"%PDF-1.4 fake")
    s.seen("TEST-26-10-9010")
    s.downloaded("TEST-26-10-9010", pdf)
    s.print_sent("TEST-26-10-9010", "Fake_Printer-41")  # lp ran, then ^C before the move
    s = mc_store.Store(str(tmp_path / "db.sqlite"))  # next run
    [row] = s.pending_print()
    assert mc_store.print_and_file(s, row, cfg, lp=lp) == "Fake_Printer-41"
    assert not args.exists()  # lp was not run again
    assert s.get("TEST-26-10-9010")["state"] == "printed"


def test_wal_mode(tmp_path):
    s = mc_store.Store(str(tmp_path / "db.sqlite"))
    assert s.db.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert s.db.execute("PRAGMA synchronous").fetchone()[0] == 2  # FULL


def test_missing_download_is_fetched_again(tmp_path):
    dl = tmp_path / "downloads"
    (dl / ".incoming").mkdir(parents=True)
    s = mc_store.Store(str(tmp_path / "db.sqlite"))
    s.seen("TEST-26-10-9011")
    s.downloaded("TEST-26-10-9011", str(dl / "TEST-26-10-9011.pdf"))  # file deleted by hand
    msgs = []
    assert s.reconcile(str(dl), log=msgs.append) == []
    row = s.get("TEST-26-10-9011")
    assert (row["state"], row["download_path"]) == ("seen", None)
    assert s.needs_download("TEST-26-10-9011") and s.pending_print() == []
    assert any("again" in m for m in msgs)
    assert not (dl / ".incoming").exists()


def test_force_targets(tmp_path, cfg):
    s = mc_store.Store(":memory:")
    for m in ("TEST-26-10-9012", "TEST-26-10-9013", "TEST-26-10-9014"):
        s.seen(m)
    s.downloaded("TEST-26-10-9013", os.path.join(cfg["downloads_dir"], "TEST-26-10-9013.pdf"))
    filed = mc_store.printed_destination(cfg["printed_dir"], "TEST-26-10-9014")
    s.printed("TEST-26-10-9014", filed, "Fake_Printer-7")
    dl = lambda m: (os.path.join(cfg["downloads_dir"], f"{m}.pdf"), False)
    assert mc_store.force_target(s.get("TEST-26-10-9012"), cfg) == dl("TEST-26-10-9012")
    assert mc_store.force_target(s.get("TEST-26-10-9013"), cfg) == dl("TEST-26-10-9013")
    assert mc_store.force_target(s.get("TEST-26-10-9014"), cfg) == (filed, True)
    # a refreshed printed copy keeps its state and is never queued to print
    mc_store.save_pdf(b"%PDF-1.4 refreshed", filed)
    s.replace_printed("TEST-26-10-9014", filed)
    row = s.get("TEST-26-10-9014")
    assert (row["state"], row["lp_job"]) == ("printed", "Fake_Printer-7")
    assert all(r["msid"] != "TEST-26-10-9014" for r in s.pending_print())
    # skipped with --mark-seen: no filed copy yet, so it gets one in printed_dir
    s.mark_seen("TEST-26-10-9012")
    assert mc_store.force_target(s.get("TEST-26-10-9012"), cfg) == (
        mc_store.printed_destination(cfg["printed_dir"], "TEST-26-10-9012"), True)
