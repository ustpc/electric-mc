"""Local state for mc_queue.py: config file, document database, Keychain
passwords, and printing.

Theory of operation: the config is a TOML file found by config_path():
--config, then $MC_WATCH_CONFIG, then var/mc-watch/config.toml in this
repository (git-ignored), copied from config.example.toml on first use. The
data it points to (downloads, printed PDFs, database; default ~/cacm-opn) is
real MC data, so it stays outside the repository. The database is SQLite with one row per manuscript ID, moving through the states
seen -> downloaded -> printed (or error). Passwords live in the macOS
Keychain through the keyring package. Printing runs CUPS `lp` and, on
success, moves the PDF to printed_dir/{year}/{msid}/{msid}.pdf, where year is
2000 + the two-digit year in the ID. No browser code here, so it can be
tested on its own (test_mc_store.py).
"""

import datetime
import os
import re
import shutil
import sqlite3
import subprocess
import tomllib

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
TEMPLATE = os.path.join(HERE, "config.example.toml")
REPO_CONFIG = os.path.join(REPO, "var", "mc-watch", "config.toml")  # git-ignored
OLD_CONFIG = os.path.expanduser("~/cacm-opn/config.toml")  # where 64f26ff put it
ENV_VAR = "MC_WATCH_CONFIG"
KEYRING_SERVICE = "electric-mc mc-watch"


with open(TEMPLATE, "rb") as _f:
    DEFAULTS = tomllib.load(_f)
PATH_KEYS = ("downloads_dir", "printed_dir", "database")


def config_path(cli=None, env=None, repo_config=REPO_CONFIG, old_config=OLD_CONFIG, log=print):
    """Which config file to use: --config, then $MC_WATCH_CONFIG, then
    var/mc-watch/config.toml in the repository. A config left at the old
    ~/cacm-opn/config.toml is moved into the repository's var/ once."""
    env = os.environ.get(ENV_VAR) if env is None else env
    if cli:
        return os.path.expanduser(cli)
    if env:
        return os.path.expanduser(env)
    if not os.path.exists(repo_config) and os.path.exists(old_config):
        os.makedirs(os.path.dirname(repo_config), exist_ok=True)
        shutil.move(old_config, repo_config)
        log(f"moved the config from {old_config} to {repo_config}")
    return repo_config


def load_config(path):
    """The config as a dict, with defaults filled in and ~ expanded.
    Copies the commented template there first if the file doesn't exist."""
    path = os.path.expanduser(path)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        shutil.copyfile(TEMPLATE, path)
    with open(path, "rb") as f:
        cfg = {**DEFAULTS, **tomllib.load(f)}
    for k in PATH_KEYS:
        cfg[k] = os.path.expanduser(cfg[k])
    cfg["path"] = path
    return cfg


# --- Keychain ---------------------------------------------------------------

def get_password(account):
    import keyring
    return keyring.get_password(KEYRING_SERVICE, account)


def set_password(account, password):
    import keyring
    keyring.set_password(KEYRING_SERVICE, account, password)


def forget_password(account):
    import keyring
    from keyring.errors import PasswordDeleteError
    try:
        keyring.delete_password(KEYRING_SERVICE, account)
        return True
    except PasswordDeleteError:
        return False


# --- Database ---------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    msid          TEXT PRIMARY KEY,
    base_id       TEXT NOT NULL,
    revision      INTEGER NOT NULL DEFAULT 0,
    first_seen    TEXT NOT NULL,
    last_seen     TEXT NOT NULL,
    downloaded_at TEXT,
    download_path TEXT,
    printed_at    TEXT,
    printed_path  TEXT,
    lp_job        TEXT,
    state         TEXT NOT NULL DEFAULT 'seen'
                  CHECK (state IN ('seen', 'downloaded', 'printed', 'error')),
    last_error    TEXT
);
"""

MSID_RE = re.compile(r"^(?P<base>[A-Z][A-Z0-9-]*?-(?P<yy>\d{2})-\d{2}-\d{3,6})(?:\.R(?P<rev>\d{1,2}))?$")


def now():
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


def split_msid(msid):
    """("XYZJ-26-08-9001.R1") -> ("XYZJ-26-08-9001", 1, 2026)."""
    m = MSID_RE.match(msid)
    if not m:
        return msid, 0, datetime.date.today().year
    return m.group("base"), int(m.group("rev") or 0), 2000 + int(m.group("yy"))


class Store:
    def __init__(self, path):
        if path != ":memory:":
            os.makedirs(os.path.dirname(path), exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    def seen(self, msid):
        """Record msid as in the queue now. Returns True if it is new."""
        base, rev, _ = split_msid(msid)
        t = now()
        new = self.get(msid) is None
        self.db.execute(
            "INSERT INTO documents (msid, base_id, revision, first_seen, last_seen) VALUES (?,?,?,?,?)"
            " ON CONFLICT(msid) DO UPDATE SET last_seen=excluded.last_seen",
            (msid, base, rev, t, t),
        )
        self.db.commit()
        return new

    def get(self, msid):
        return self.db.execute("SELECT * FROM documents WHERE msid=?", (msid,)).fetchone()

    def needs_download(self, msid):
        row = self.get(msid)
        return row is not None and row["state"] in ("seen", "error") and not row["printed_at"] and (
            not row["download_path"] or not os.path.exists(row["download_path"])
        )

    def downloaded(self, msid, path):
        self.db.execute(
            "UPDATE documents SET state='downloaded', downloaded_at=?, download_path=?, last_error=NULL WHERE msid=?",
            (now(), path, msid),
        )
        self.db.commit()

    def printed(self, msid, path, job):
        self.db.execute(
            "UPDATE documents SET state='printed', printed_at=?, printed_path=?, lp_job=?, last_error=NULL WHERE msid=?",
            (now(), path, job, msid),
        )
        self.db.commit()

    def mark_seen(self, msid):
        """Skip msid: count it as printed without downloading or printing."""
        self.db.execute(
            "UPDATE documents SET state='printed', printed_at=?, lp_job='skipped (--mark-seen)', last_error=NULL"
            " WHERE msid=? AND state!='printed'",
            (now(), msid),
        )
        self.db.commit()

    def error(self, msid, msg):
        self.db.execute("UPDATE documents SET state='error', last_error=? WHERE msid=?", (msg, msid))
        self.db.commit()

    def pending_print(self):
        """Downloaded but not printed, oldest first; includes print errors whose file is still there."""
        rows = self.db.execute(
            "SELECT * FROM documents WHERE printed_at IS NULL AND download_path IS NOT NULL"
            " AND state IN ('downloaded', 'error') ORDER BY downloaded_at"
        ).fetchall()
        return [r for r in rows if os.path.exists(r["download_path"])]


# --- Printing ---------------------------------------------------------------

def lp_command(file, printer, options, lp="lp"):
    cmd = [lp, "-d", printer]
    for o in options:
        cmd += ["-o", o]
    return cmd + [file]


def print_file(file, printer, options, lp="lp"):
    """Send file to CUPS. Returns the job id ("High_Priestess-123"); raises
    RuntimeError if lp fails."""
    r = subprocess.run(lp_command(file, printer, options, lp), capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip() or f"lp exited {r.returncode}")
    m = re.search(r"request id is (\S+)", r.stdout)
    return m.group(1) if m else r.stdout.strip()


def printed_destination(printed_dir, msid):
    _, _, year = split_msid(msid)
    return os.path.join(printed_dir, str(year), msid, f"{msid}.pdf")


def print_and_file(store, row, cfg, lp="lp"):
    """Print one downloaded document and move it into printed_dir.
    Returns the job id, or None after recording an error."""
    msid, src = row["msid"], row["download_path"]
    try:
        job = print_file(src, cfg["printer"], cfg["lp_options"], lp)
    except (RuntimeError, OSError) as e:
        store.error(msid, f"print: {e}")
        return None
    dest = printed_destination(cfg["printed_dir"], msid)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.move(src, dest)
    store.printed(msid, dest, job)
    return job
