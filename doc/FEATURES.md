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
- **Tight mode** (off unless you turn it on). The journal logo folds away
  a second after each page opens, and MC's instructions line ("The tabs
  below organize…") and its empty spacing rows go, so more of the
  manuscript fits on the screen.
- **Web of Science, your way.** MC's Web of Science Reviewer Locator box,
  which pushes the rest of the reviewer page a screen down, starts closed
  (MC shows it open). A setting keeps it open or removes it entirely; its
  "View full interactive search" line shows only when the box is open.
- **Clearly marked.** Everything Electric MC adds to a page is bold brown,
  so you always know what came from MC and what came from us.
- **One switch per site.** Right-click the toolbar icon, or use the
  side panel, to turn Electric MC off for a site.
- **A side panel only where it belongs.** Everything known about the
  manuscript on screen, which pops out into its own window. It shows on
  MC tabs only and stays out of the way on every other site.
- **Click the ID to open a manuscript.** No more aiming for the
  little Take Action checkbox.
- **One search result opens itself (optional).** When a search finds
  exactly one manuscript, the extension presses its Take Action for you.
- **Click anywhere in a choice row.** In MC's recommendation and decision
  tables, a click anywhere on a row picks its choice, not just on the tiny
  radio button.
- **Arrows you can hit.** MC's previous/next manuscript arrows and the
  list's page arrows are drawn larger.
- **The Version History box stands out**, so a revision's earlier versions
  are easy to find.
- **Told when MC changes.** If a part of an MC page the extension relies on stops showing up, the side panel says so, and the automations that need it stay off there until it's back.
- **Stay logged in (on by default; can be turned off).** After 10 minutes without
  activity in any MC tab, the extension presses MC's own "+ Search" toggle so
  MC doesn't log you out; it gives up after 48 hours, so an unattended
  computer is still logged out. Ctrl+Shift+K sends one at once.

## For editors and reviewers

- **Revisions stand out (now).** Queue rows for revised manuscripts (.R1,
  .R2, …) are bold on light yellow, so the papers coming back to you are easy
  to spot. A switch turns it off.
- **PDFs at a readable size (now).** Manuscript PDFs open in Chrome's
  viewer at 150% by default, or the zoom you pick in Settings (125 to 200%,
  or Chrome's fit to width); only that tab is zoomed.
- **Word counts on PDFs (now).** A manuscript PDF shows its body's word
  count in a box over the viewer: no cover page, line numbers, headers or
  references. A PDF with two copies of the article (clean and marked up) is
  counted once. Counted in the browser; nothing is sent.
- **The history of a revision at a glance (now).** On a revision, the
  extension adds the previous version's submission and decision dates, the
  days it took, and its AE and co-chair to Peer Review Milestones, and puts
  each earlier version's AE next to it in Version History, from the versions
  you've opened. On the Assign AE task it names the original AE in the
  Associate Editor List and puts them at the top of the pull-down, so a
  revision is easy to send back to them.
- **No recommendation without a choice (now).** Submit in a Recommends
  table (or Commit Decision in a Decision box) does nothing until one of the
  choices (Accept, Minor Revision, Major Revision, Reject & Resubmit, Reject)
  is picked. MC itself would accept the empty recommendation; the extension
  stops the press and says so, in bold E-MC brown, above the choices.
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
- **One-button reject (testing).** Next to MC's Assign button, after you've
  opened the PDF: check "reject" and press "one-button reject". The
  extension assigns the paper to your own AE entry, takes you to the AE
  recommendation with Reject picked, and after you write your comments and
  press Submit it makes the co-chair recommendation with the same comments
  and submits it. A banner shows each step; anything unexpected stops it.
- **Flags, named (now).** MC's flag icons carry no words. The extension
  learns each one's label from the "Flag This Manuscript" panel and writes
  it beside the icon in italics: "(flagged: 3 or more rejections)".
- **Decisions you made, marked in the queue (now).** An immediate decision made without
  assigning an AE leaves the manuscript in MC's Assign AE list. The
  extension notes the choice when you press Submit and, in queue lists and
  search results, prints your choice and the role you made it in (as AE or
  as co-chair) in blue under its ID until the decision letter goes out. Only
  a decision made as co-chair with no AE assigned also shades the rows light
  red.
- **The Team window, with workloads (in development).** One window (the side
  panel's Team button; it used to be called the Matrix) lists the
  whole section team (column heads, columnists and associate editors) with
  photos, roles, institutions and expertise, and shows next to each editor
  how many manuscripts they have right now, as MC's Assign Associate Editor
  pull-down reports it. Search by name, column or expertise. "Hide
  columnists" leaves only the people who take assignments: the column
  heads and the AEs.
  
- **One team database, with its tree (now).** The EIC and Deputy EIC,
  co-chairs, sections with their heads and AEs, and columns with their
  columnists, shown as a tree of pills in the Team window and edited in its
  own window (Edit team). A section can be turned into a column ("Make it a column"),
  and removing one keeps its people on the tree. The Team window can save and load
  the team as a file: the first save asks where, and later saves write over
  that same file (Save as… picks another). The team is kept in the browser
  either way; the file is a copy to share or restore, and Cmd-F there goes to its search box. Every person's details,
  links and photo are editable, and
  the Team window, the AE menu and Suggested AEs all use the same record.
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

- Nothing leaves your browser unless you set a notes server. Once set, what
  leaves it is your MC identity and this browser's public key, a hash of
  each manuscript's title (never the title), and your notes. Notes are
  signed in your browser so the server and other readers can tell who wrote
  them, but they are not encrypted: the notes server can read them.
  End-to-end encryption is designed but not built.
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
