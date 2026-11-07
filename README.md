# Electric MC

Electric Manuscript Central: a Chrome extension that makes ScholarOne
Manuscripts (Manuscript Central, "MC") easier to use for everyone in peer
review. It runs on `*.manuscriptcentral.com` pages, restyles them, and adds a
side panel. It works on its own, with no account and no server. An optional
notes server shares notes between editors.

Everything Electric MC adds to an MC page is bold brown, so you can always
tell it apart from MC itself. Nothing about a manuscript is ever sent to an
AI service ([Privacy Policy](doc/Privacy%20Policy.md)).

- **Install:** the Chrome Web Store build is unlisted for now; ask Simson
  for the link. To build it yourself, see
  [extension/README.md](extension/README.md#build-and-load).
- **Everything it does:** [doc/FEATURES.md](doc/FEATURES.md). **What
  changed:** [extension/CHANGELOG.md](extension/CHANGELOG.md).

## For everyone, reviewers included

Reviewers get the parts that make MC itself less painful:

- Your password manager (1Password, Chrome) fills MC's login page, and the
  extension can press Log In for you.
- Each tab gets a title that says which manuscript and page it is, so
  history, the Back menu and the tab strip make sense.
- MC can use the whole window width, with bigger text.
- Choosing a file to upload attaches it, with no separate Attach click.
- Bigger previous/next arrows, clickable manuscript IDs, and choice rows you
  can click anywhere.
- Optional keepalives so MC doesn't log you out while you read.
- Test builds: Back shows the page you came from instead of "Confirm Form
  Resubmission".
- One switch per site turns Electric MC off.

## For AEs

Everything above, plus:

- Revisions (.R1, .R2, …) stand out in your queues.
- On a revision you see the earlier versions' dates, decisions and AEs, from
  the versions you've opened.
- Version History on a revision is bold and one point larger.
- After you submit a recommendation or commit a decision, the extension
  opens the next manuscript in the list, on the same task (Make
  Recommendation, say).
- The side panel shows what MC knows about the manuscript on screen, with
  signed notes per manuscript. Notes stay in your browser unless a notes
  server is set.

## For section editors (co-chairs)

Everything above, plus:

- **Suggested AEs.** On a manuscript page, the side panel ranks your AEs by
  how close their published work is to the manuscript, and shows each one's
  current load. The matching runs on your computer. To set it up, build the
  AE profiles once from your roster:
  [extension/tools/ae-profiles/README.md](extension/tools/ae-profiles/README.md).
- **A readable AE menu.** MC's Assign Associate Editor pull-down
  regrouped under dividers, relabeled with each editor's section and colored
  by group. Set it up in Settings > AE assignment menu.
- **One team database and the editorial matrix.** The whole section team,
  with roles, institutions, expertise and how many manuscripts each editor
  has now, edited in its own window.
- **To EIC list.** The recommendations you sent the EIC are marked in the
  queues until the EIC acts. One click copies the list.
- You can delete any note on a manuscript.

## For publication editors (EIC)

Everything section editors get. Coming:

- Dashboards of every manuscript each AE is handling, across sections and
  journals.
- Alerts for overdue reviews, plagiarism checks and decisions, from MC's
  emails.
- Chat per manuscript, with role-based visibility.

## For developers

- [extension/](extension/README.md): the Chrome extension (TypeScript, WXT,
  Preact). Run `make` there to list the commands.
- [backend/](backend/): the optional notes server (Rust on AWS Lambda).
- [doc/planning/](doc/planning/): design documents.
- [AGENTS.md](AGENTS.md): rules for anyone working here. Above all, real
  Manuscript Central data never goes in this repository.
