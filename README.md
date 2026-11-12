# Electric MC

**[Install Electric MC from the Chrome Web Store](https://chromewebstore.google.com/detail/jihifdamelimkliohjickcjhcocblaij)**
(unlisted: anyone with the link can install it).

Electric Manuscript Central is a Chrome extension that makes ScholarOne
Manuscripts (Manuscript Central, "MC") easier to use. It runs on
`*.manuscriptcentral.com` pages, restyles them, and adds a side panel. It
works on its own, with no account and no server. Everything it adds to an MC
page is bold brown, so you can always tell it apart from MC itself. Nothing
about a manuscript is ever sent to an AI service
([Privacy Policy](doc/Privacy%20Policy.md)).

Full feature list: [doc/FEATURES.md](doc/FEATURES.md). What changed in each
version: [extension/CHANGELOG.md](extension/CHANGELOG.md).

## Features for associate editors (AEs)

- **Your password manager works on the login page.** 1Password and Chrome's
  password manager fill MC's login form, and the extension can press Log In
  for you.
- **Revisions stand out.** Queue rows for revised manuscripts (.R1, .R2, …)
  are bold on light yellow.
- **The history of a revision at a glance.** Peer Review Milestones gain the
  previous version's dates, decision, days taken, AE and co-chair, and
  Version History names each earlier version's AE (from the versions you've
  opened). Version History is bold and one point larger.
- **No decision without a word to the author.** If you submit an accept,
  revise or reject recommendation with an empty "Comments to the Author"
  box, the extension asks before it goes out.
- **On to the next manuscript.** After you submit a recommendation, the next
  manuscript in the list opens on the same task (Make Recommendation, say).
- **Signed notes per manuscript.** The side panel shows what MC knows about
  the manuscript on screen, with notes that show who wrote them and when.
  Notes stay in your browser unless a notes server is set.
- **PDFs at a readable size.** Manuscript PDFs open at the zoom you pick
  (125 to 200%) instead of fit to width.
- **Readable tab titles and history.** Each tab says which manuscript and
  page it is, so the Back menu, history and tab strip make sense.
- **Use your whole screen.** MC can stretch to the window width, with bigger
  text, and its left-column page title can move to the top of the page.
- **Less clicking.** Click a manuscript ID to open it; click anywhere in a
  choice row to pick it; choosing a file to upload attaches it; bigger
  previous/next arrows.
- **Stay logged in.** Optional keepalives so MC doesn't log you out while
  you read.
- **One switch per site** turns Electric MC off, and the side panel only
  appears on MC tabs.

## Features for co-chairs, EICs and other assigning editors

Everything AEs get, plus:

- **Straight to the Co-Chair Center.** If you have both the AE and Co-Chair
  Centers, logging in takes you to the Co-Chair Center.
- **An AE menu you can read.** MC's Assign Associate Editor pull-down is
  regrouped under dividers (for example column heads, then section AEs, then
  everyone else), relabeled with each editor's section, and colored by
  group. What MC submits doesn't change. Set it up in Settings > AE
  assignment menu.
- **Original AE first on revisions.** On a revision's Assign AE task, the
  AEs who handled earlier versions are named and put at the top of the
  pull-down.
- **One team database.** The EIC and deputy, co-chairs, sections with their
  heads and AEs, and columns with their columnists, shown as a tree and
  edited in its own window. The matrix, the AE menu and Suggested AEs all
  use it.
- **The editorial matrix, with workloads** (in development). The whole team
  with roles, institutions and expertise, and how many manuscripts each
  editor has now. "Hide columnists" leaves only the people who take
  assignments.
- **Suggested AEs** (in development). On a manuscript page, the side panel
  ranks your AEs by how close their published work is to the manuscript,
  with each one's current load. Profiles come from public OpenAlex and DBLP
  records; the matching runs on your computer. Setup:
  [extension/tools/ae-profiles/README.md](extension/tools/ae-profiles/README.md).
- **What's waiting for the EIC.** Recommendations you send the EIC are kept
  in a To EIC list and marked in the queues until the EIC acts. One click
  copies the list.
- **No decision without a word to the author, and on to the next
  manuscript,** also after Commit Decision (an immediate reject, say).
- **Moderate notes.** Co-chairs and the EIC can delete any note on a
  manuscript.

Coming: dashboards of every manuscript each AE is handling across sections
and journals; alerts for overdue reviews, plagiarism checks and decisions
from MC's emails; chat per manuscript with role-based visibility.

## For developers

- [extension/](extension/README.md): the Chrome extension (TypeScript, WXT,
  Preact). Run `make` there to list the commands. To build and load it
  yourself, see [extension/README.md](extension/README.md#build-and-load).
- [backend/](backend/): the optional notes server (Rust on AWS Lambda).
- [doc/planning/](doc/planning/): design documents.
- [AGENTS.md](AGENTS.md): rules for anyone working here. Above all, real
  Manuscript Central data never goes in this repository.
