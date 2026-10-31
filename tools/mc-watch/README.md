# mc-watch: print new manuscripts from your ScholarOne queue

`mc_queue.py` checks a list in your ScholarOne Manuscripts (Manuscript Central)
account, downloads the PDF of each manuscript it hasn't seen before, and prints
it on your printer. It works for Co-Chairs, Associate Editors (AEs) and
Editors-in-Chief (EICs). You pick the role center and the list or lists to
watch.

Every run:

1. opens a private browser window (minimized) and logs in to your journal's
   ScholarOne site;
2. opens **Manage → your center** (for example *Co-Chair Center*) and then
   each list you chose (for example *Awaiting AE Assignment*), every page of
   it;
3. records every manuscript ID it sees, and downloads each new one's
   **View Submission** PDF, one at a time;
4. logs out, then prints every downloaded PDF that hasn't been printed yet,
   and files it away.

**It only reads.** It never assigns an editor or reviewer, makes a decision,
sends email or changes anything in ScholarOne. The only things it clicks are
the Manage menu, your center, the list, the list's page picker, *View
Submission*, the verification-code dialog and *Log Out*.

## What you need

- A Mac running macOS, with an account that can reach your journal's
  ScholarOne site.
- [uv](https://docs.astral.sh/uv/) (`brew install uv`). uv installs the
  program's two Python packages (Selenium and keyring) the first time you run
  it.
- A printer set up in macOS. To list your printers' system names, run:
  ```bash
  lpstat -p
  ```
- This repository checked out, for example in `~/gits/electric-mc`.

The program downloads its own browser, "Chrome for Testing", into
`~/.cache/selenium` the first time. It never uses or touches your everyday
Chrome, its profile or its passwords.

## First run

From the top of the repository, run this, using your own ScholarOne user ID:

```bash
uv run tools/mc-watch/mc_queue.py editor@example.org --role ae --no-print
```

The first run asks you for a few things. After that, runs need nothing from
you.

- **Password.** It asks once and saves the password in your macOS Keychain
  (as "electric-mc mc-watch"), but only after a successful login. macOS may
  ask whether to allow Keychain access; choose *Always Allow*. If ScholarOne
  later rejects the saved password, the program deletes it and asks once more.
  To forget it yourself, run with `--forget-password`.
- **"Unrecognized Device" code.** ScholarOne emails a verification code the
  first time it sees this browser. The program waits at the terminal: paste
  the code and press Return, or type it in the browser window. It ticks
  *Remember this device*, so you shouldn't be asked again.
- **Cloudflare "Just a moment..." check.** If this doesn't clear by itself
  within 15 seconds, the window comes onto your screen and the terminal asks
  you to complete the check. The program waits up to 5 minutes.
- **Cookie banner.** Choose whichever button you like. The browser keeps your
  choice.

The browser keeps its own cookies in `var/mc-watch/profile` inside the
repository. That folder is git-ignored, so the device approval and Cloudflare
cookie last from run to run. `--fresh` deletes it and starts over.

**Before your first printing run**, decide what to do about the manuscripts
already in your queue. A run without `--list`, `--no-print` or `--mark-seen`
prints *every* manuscript it hasn't printed before. If a dozen are waiting, all of them
print. To print only new arrivals from now on, run once with `--mark-seen`.

## Modes

| Command | What it does |
|---|---|
| `mc_queue.py` | Lists the queue, downloads new PDFs and **prints everything pending**. |
| `mc_queue.py --list` | Only lists and records the queue. Downloads and prints nothing. |
| `mc_queue.py --no-print` | Lists and downloads, but doesn't print. Already-downloaded PDFs wait for a later printing run. |
| `mc_queue.py --mark-seen` | Records everything now in the queue as already printed, without downloading or printing. Use it once to skip a backlog. |

Manuscript IDs go to the terminal. Every run ends with a summary like
`summary: 9 in queue, 2 new, 2 downloaded, 2 printed, 0 errors`.

A revision (for example `XYZJ-26-01-9001.R1`) counts as a new document, so it
prints even if the original was skipped or printed.

You can also run it through make. `ARGS` passes extra options:
```bash
make mc-queue USERID=editor@example.org ARGS="--role ae --no-print"
```

## Configuration

The program reads its settings from the first of these it finds:

1. the file given with `--config PATH`;
2. the file named in the `MC_WATCH_CONFIG` environment variable;
3. `var/mc-watch/config.toml` inside the repository (git-ignored).

If none exists, the first run copies `tools/mc-watch/config.example.toml` to
`var/mc-watch/config.toml`. Edit that copy, not the example. The program
prints the config path it used at the start of every run. Never commit a
filled-in config: it names a real account.

| Key | Default | Meaning |
|---|---|---|
| `username` | `""` | Your ScholarOne user ID, so you can leave it off the command line. |
| `site_url` | `https://mc.manuscriptcentral.com/cacm` | Your journal's ScholarOne address. |
| `role` | `"cochair"` | A preset center and list. See below. |
| `center` | from `role` | The item under the **Manage** menu, exactly as ScholarOne shows it. |
| `queues` | from `role` | One or more list names on that center's dashboard, exactly as shown (the link next to the count). |
| `downloads_dir` | `~/cacm-opn/downloads` | Where new PDFs wait until they're printed. |
| `printed_dir` | `~/cacm-opn/printed` | Where printed PDFs are filed. |
| `database` | `~/cacm-opn/mc-watch.sqlite` | The record of every manuscript seen, downloaded and printed. |
| `printer` | `"High_Priestess"` | The printer's system name, from `lpstat -p`. Change this to your own printer. |
| `lp_options` | two-sided, color | Print options passed to `lp -o`. To see what your printer accepts, run `lpoptions -p PRINTER -l`. |

### Roles

| `role` | Center | List | Status |
|---|---|---|---|
| `cochair` | Co-Chair Center | Awaiting AE Assignment | Tested on CACM |
| `ae` | Associate Editor Center | Awaiting Reviewer Selection | Center name seen on CACM; list name **not verified** |
| `eic` | Editor-in-Chief Center | Awaiting EIC Assignment | **Not verified** |

Journals name their centers and lists differently. If a preset doesn't match
your site, set `center` and `queues` yourself, copying the names exactly from
your Manage menu and dashboard. For example:

```toml
role = "ae"
center = "Associate Editor Center"
queues = ["Awaiting Reviewer Selection", "Awaiting AE Recommendation"]
```

If the center isn't in your Manage menu, the program stops and lists the
items that are there. If a list isn't on the dashboard, it says
`0 manuscripts in '...' (no such list on this dashboard?)`. A list with a
count of 0 is skipped.

On the command line, `--role`, `--center` and `--queue` override the config.
Repeat `--queue` to watch several lists.

## Where files go

- New PDFs go to `downloads_dir/{ID}.pdf`.
- After printing, each PDF moves to `printed_dir/{year}/{ID}/{ID}.pdf`. The
  year comes from the ID: `XYZJ-26-01-9001` is filed under `2026`.
- The database has one row per manuscript ID, in one of these states:
  - `seen`: in a queue, not downloaded yet;
  - `downloaded`: PDF in `downloads_dir`, waiting to print;
  - `printed`: printed and filed, or skipped with `--mark-seen`;
  - `error`: a download or print failed. The reason is recorded, and the next
    run tries again.

If printing fails (for example, the printer is off), the PDF stays in
`downloads_dir` and prints on the next printing run.

## Debug snapshots

To help diagnose problems, every run saves the HTML and a screenshot of each
step into a new private folder in your Mac's temporary directory, such as
`/var/folders/.../T/mc-watch-abc123/`. The terminal shows the path at the
start and end of each run. These snapshots show real manuscripts and names,
so delete them when you no longer need them:

```bash
rm -rf "$TMPDIR"/mc-watch-*
```

To turn snapshots off, run with `--no-debug`.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `timed out at ...` | Look at the last files in that run's snapshot folder to see where it stopped. Run again with `--show` to watch the window. |
| Every list shows 0 | You may be logged in to an account that doesn't hold that role. Some roles use a separate shared login. |
| `no '...' under Manage` | Copy the exact center name from the list in the message into `center`. |
| Asked for the verification code every time | Run with `--fresh` once, enter the code, and make sure *Remember this device* is ticked. |
| `MC rejected the user ID or password` | Check the user ID, then run with `--forget-password`. |
| `download failed` | ScholarOne may show the PDF differently on your site. Send the developer the step names in the snapshot folder, but not the files themselves. |
| Nothing prints | Check `printer` against `lpstat -p`, and check `lp_options`. Failed jobs stay in `downloads_dir` with state `error`. |
| The window is in the way | It is minimized after launch. It comes back only for a Cloudflare check, or when you use `--show`. |
| Nothing happens while the Mac sleeps | A sleeping Mac runs nothing. A screensaver or locked screen is fine. To keep the Mac awake for a run: `caffeinate -i uv run tools/mc-watch/mc_queue.py` |

## Privacy and confidentiality

- Everything stays on your Mac: the PDFs, the database, the snapshots, the
  browser profile and your password (in the Keychain). The program sends
  nothing to any server other than ScholarOne itself, and it uses no AI or
  LLM service.
- Manuscripts under review are confidential. ACM's
  [peer review policy](https://www.acm.org/publications/policies/peer-review)
  requires editors and reviewers to keep submissions confidential. Don't share
  the downloaded PDFs, the printouts, the database or the debug snapshots, and
  don't upload any of them to an AI tool.
- Nothing from ScholarOne may be committed to this repository, which is
  public. See [AGENTS.md](../../AGENTS.md).

## Terms of use and account risk

The program uses your own ScholarOne account through an ordinary browser, at
about a person's pace. It doesn't bypass Cloudflare or ScholarOne's security
checks; you complete those yourself. Even so, automated use of ScholarOne may
be restricted by your journal's or Clarivate's terms of use, and unusual
activity could get your account challenged or locked. Run it at a reasonable
interval, not continuously, and check with your journal's staff if you're
unsure. You are responsible for how you use it.
