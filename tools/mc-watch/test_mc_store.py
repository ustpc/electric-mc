"""Tests for mc_store: config defaults, the document state machine, and
printing/filing. Printing uses a fake `lp` script, so nothing reaches a real
printer, and every path is under pytest's tmp_path. All IDs are made up.

    uv run --with pytest --with keyring pytest tools/mc-watch
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
