# Electric MC features

Electric MC addresses longstanding usability issues observed in ScholarOne Manuscripts (previously known as Manuscript Central). This list feeds the announcement, the Chrome Web Store page and the
pitch to associate editors. 

## For everyone who uses Manuscript Central

- **Your password manager works on the login page .** 1Password and
  Chrome's own password manager recognize MC's login form, fill it, and the
  extension can press Log In for you (optional). No more copying passwords by hand!
- **Straight to the Co-Chair Center (now).** If you're both an AE and a
  co-chair, logging in takes you to the Co-Chair Center instead of making
  you pick a center. A switch in Settings turns it off.
- **Readable tab titles and history.** Every page gets a title that
  says what it is ("CACM-24-04-1000.R2 · This is a test!..."), so the Back
  menu, browser history and tab strip are finally useful.
- **Back works (test builds, now).** Back shows the page you came from
  instead of "Confirm Form Resubmission". A switch turns it off.
- **Choose a file and it's attached.** No separate Attach click after
  choosing a file to upload.
- **Use your whole screen.** MC's narrow fixed column can stretch to
  the window, half an inch from each edge, and its 11px text can be made
  bigger. Preferences follow your Chrome profile; no account needed.
- **The page title on top.** MC's left-column title ("Search Results",
  "View Manuscripts") can move to the top of the page, so the table gets
  the column's width back.
- **Clearly marked.** Everything Electric MC adds to a page is bold brown,
  so you always know what came from MC and what came from us.
- **One switch per site.** Right-click the toolbar icon, or use the
  side panel, to turn Electric MC off for a site.
- **A side panel only where it belongs.** Everything known about the
  manuscript on screen, which pops out into its own window. It shows on
  MC tabs only and stays out of the way on every other site.
- **Click the ID to open a manuscript.** No more aiming for the
  little Take Action checkbox.

## For editors and reviewers

- **Revisions stand out (now).** Queue rows for revised manuscripts (.R1,
  .R2, …) are bold on light yellow, so the papers coming back to you are easy
  to spot. A switch turns it off.
- **PDFs at a readable size (now).** Manuscript PDFs open in Chrome's
  viewer at the zoom you pick in Settings (125 to 200%) instead of fit to
  width; only that tab is zoomed.
- **The history of a revision at a glance (now).** On a revision, the
  extension adds the previous version's submission and decision dates, the
  days it took, and its AE and co-chair to Peer Review Milestones, and puts
  each earlier version's AE next to it in Version History, from the versions
  you've opened. On the Assign AE task it names the original AE in the
  Associate Editor List and puts them at the top of the pull-down, so a
  revision is easy to send back to them.
- **No decision without a word to the author (now).** When you submit an
  accept, revise or reject recommendation or commit such a decision and the
  "Comments to the Author" box is empty, the extension asks before it goes
  out. Cancel takes you to the box.
- **On to the next manuscript (now).** After you submit a recommendation or
  commit a decision, the extension opens the next manuscript in the list, in
  the direction you're moving, on the same task you were on (Make
  Recommendation, say). A switch turns it off.
- **Signed notes per manuscript (now).** Each note shows who wrote it and
  when. Keep typing and it updates the same note; come back after an hour
  and you start a new one. You can edit or delete your own notes, and
  co-chairs and the EIC can delete any note. Notes stay in your browser
  unless you set a notes server, which shares them with the other editors.
  Each browser signs its notes with its own key, and the manuscript's title
  never leaves your computer.

## For co-chairs

- **What's waiting for the EIC.** Recommend a decision under
  Co-Chair Recommends and the extension keeps it in a To EIC list and marks
  the manuscript in the queue grid, which MC itself doesn't, until the EIC
  acts. One click copies the list for the EIC.
- **The editorial matrix, with workloads (in development).** One window lists the
  whole section team (column heads, columnists and associate editors) with
  photos, roles, institutions and expertise, and shows next to each editor
  how many manuscripts they have right now, as MC's Assign Associate Editor
  pull-down reports it. Search by name, column or expertise. "Hide
  columnists" leaves only the people who take assignments: the column
  heads and the AEs.
  
- **One team database, with its tree (now).** The EIC and Deputy EIC,
  co-chairs, sections with their heads and AEs, and columns with their
  columnists, shown as a tree of pills above the matrix and edited in its
  own window. Every person's details, links and photo are editable, and
  the matrix, the AE menu and Suggested AEs all use the same record.
- **An AE menu you can read (now).** MC's Assign Associate Editor
  pull-down is one long alphabetical list of "Last, First". Electric MC
  regroups it under dividers (for the Opinions co-chair: column heads, then
  Opinions AEs, then everyone else), relabels people with their sections from the team
  database ("Example Column - Pat Editor" instead of "Editor, Pat"), and gives each
  group its own color, weight and font, using Chrome's new customizable
  select. What MC submits doesn't change. The layout is edited in the
  extension's own editor window and saved as a file; no Python needed.
  Shared configs on the server, which the admin publishes and everyone can
  download, are coming.
- **Suggested AEs for each manuscript (in development).** Open a manuscript and the
  side panel ranks your AEs by how close their published work is to its
  title, abstract and keywords, with each AE's current load and the paper of
  theirs that matched best. AE profiles are built from public OpenAlex and
  DBLP records; the matching runs on your computer with no AI service and
  nothing about the manuscript leaves it.

## Privacy

- Nothing leaves your browser in the test extension unless you set a notes
  server. Once set, the only information that leaves your browser is your MC identity,  hash of each title, and GPG-encrypted per-manuscript notes that can only be read by specific individual
- Logs keep only problems unless you turn on developer mode, and the export
  meant for sharing strips names, titles, emails and manuscript IDs.
- No manuscript content ever goes to a third-party AI service.

## Coming

- **Chat per manuscript** with role-based visibility, including for people
  added later.
- **Alerts** for overdue reviews, plagiarism-check results and decisions,
  from MC's own emails.
- **Dashboards** of every manuscript each AE is handling, across journals.
- **Optional time tracking** so editors can see where their hours go.
