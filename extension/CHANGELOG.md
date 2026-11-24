# Electric MC extension changelog

Newest first. Every version bump gets an entry here.

## 0.0.97 (2026-11-24)

- Fixed: MC still logged you out "due to inactivity" with keepalive on. The keepalives reach MC fine, also from background tabs (MC answers each one), but every MC page also runs its own logout countdown from when it loaded (about 3 hours), and a keepalive didn't reset it. The log showed logouts exactly 178 minutes after the last page load with every keepalive in between answered. Now, each time MC answers a keepalive, every open MC tab starts its countdown again, as a page load would. The keepalive log line says how many countdowns it restarted (0 would mean MC counts down some other way).

## 0.0.96 (2026-11-22)

Fixes from Copilot's second review of the open pull request:

- Fixed: one-button reject could still take a step on a slow page after it (or E-MC) was turned off while the page loaded. The step now checks the setting when the page finishes loading.
- Fixed: turning off "show earlier versions' AEs" (or E-MC) left the earlier AEs in Version History and above the AE pull-down, and a read still in progress could put them back. They now go, and come back when the setting is turned on again. When MC redraws Version History, the notes are put back without another read.
- Fixed: the "View full interactive search" line now also follows the box when it's opened or closed with the WoS logo.
- Privacy: a warning about a rejected title no longer quotes the title (it gives its length), and the log export removes old ones whole even when the title holds quotes. The local tests on real pages and PDFs never print a file's path or contents when it fails to load.

## 0.0.95 (2026-11-22)

- Changed: PDFs from MC now open at 150% by default instead of Chrome's fit to width. A browser that already saved its settings keeps its choice; pick 150% under Settings, Page layout, "Open PDFs at".

## 0.0.94 (2026-11-22)

- Changed: one-button reject ends on the paper's Manuscript Information tab. MC left it on its next task (Make Immediate Decision), which looked as if something was still to do. "One-button reject done" now shows there.

## 0.0.93 (2026-11-22)

- Fixed: after E-MC was turned off and on again for the site, Version History lost its earlier-version AE notes until the next paper.

## 0.0.92 (2026-11-22)

Fixes from a code review of the open pull request:

- Fixed: turning off One-button reject (or E-MC for the site) left its controls on the page, and pressing them could still start a run. The controls now go away, and a press checks the setting first.
- Fixed: the "View full interactive search" line in the Web of Science box now follows the box when you open or close it by hand (it showed or hid by the setting only).
- Fixed: turning E-MC off for the site left decided rows red on queue lists.
- Fixed: a Submit or Commit Decision press was added to the To EIC list on any page update, even when MC refused it and showed the form again. It is now added only when MC answers with a new page, and not when that page is the form again.
- Fixed: font size scaling could miss a panel MC replaced with one of the same size.
- Privacy: page snapshots (Capture page HTML, weekly samples) now clear every field a person can type into, including search, phone and untyped fields, and keep the manuscript IDs E-MC made clickable. The local tests on real files never print what a file holds, even when it fails to load, and an empty queue no longer fails them.
- Developer: `make check` now runs what CI runs (coverage floors, a fresh build with its remote-code and permission checks, the Chromium load and page tests).

## 0.0.91 (2026-11-22)

- Renamed: the Matrix is now the Team window (the side panel's Team button), and the window that edits the tree is Edit team.
- Changed: saving the team to a file no longer only downloads. The first save opens Chrome's Save dialog so you choose the folder and name; later saves write over that same file without asking, and the button names it ("Save to team-opinions.json"). Save as… picks a different file. The team itself is still kept in the browser; the file is a copy. Which file was chosen is remembered in this browser only.

## 0.0.90 (2026-11-22)

- Fixed (high priority): with Tight mode on, the login page went blank a second after it opened, so nobody could log in. The login page shows the journal logo a second time inside the box that holds the login form, and Tight mode folded that whole box away along with the logo bar. It now folds away only the logo bar at the top (div.logoBar), and never anything holding a form.

## 0.0.89 (2026-11-21)

- Fixed: one-button reject stopped at the co-chair step with "no co-chair recommendation task on the paper" when MC named that task plain "Make Recommendation" on the co-chair's page (it looked only for a task naming the co-chair). The form it opens is still checked to be the co-chair's Recommends form before anything is pressed.
- Fixed: the side panel said "MC changed: the Assign AE pull-down / the next/previous arrows not found" on manuscript pages, and one-button reject was held back there. MC shows those parts only in some states (the pull-down only while a paper waits for an AE, the arrows only when the paper was opened from a list), so their absence is still counted but no longer reported as a change.

## 0.0.88 (2026-11-20)

- Fixed: one-button reject stopped with "no co-chair recommendation task on the paper" when it reached the paper as co-chair before MC showed that task (it can lag the AE's Submit, and a slow connection can leave the page short). It now opens the paper again, up to twice, before stopping.

## 0.0.87 (2026-11-20)

- Fixed (slow connections): one-button reject could stall when E-MC started on a page MC hadn't finished loading, because MC ignores its own links until then. Each step of a run now waits for the page to finish loading before pressing anything. A run is also kept for 2 hours instead of 30 minutes.
- Fixed: while an MC page was still loading, the side panel said "This tab is running an older build". It now waits for the page.
- Fixed: Pop in threw "No active side panel for windowId" when the browser window's tab wasn't an MC page. It now opens the panel on the window's MC tab, or says to switch to one and leaves the pop-out open.

## 0.0.86 (2026-11-20)

- Fixed: after a Reject recommended as AE, the co-chair's queue said "you recommended Reject as AE …; waiting for the EIC", and the side panel listed it under Waiting for the EIC. A recommendation made as AE waits for the co-chair's own recommendation: the note now says "next, the co-chair recommendation", and only recommendations made as co-chair (or decisions) are listed as waiting for the EIC.

## 0.0.85 (2026-11-20)

- New: a setting for MC's Web of Science Reviewer Locator box (Settings, Page layout): closed (E-MC's default; MC shows it open), open, or removed. Closing and opening press MC's own +/- toggle once per page, so a box you open again by hand stays open. The "View full interactive search on reviewerlocator.webofscience.com" line shows only when the setting is open.

## 0.0.84 (2026-11-20)

- New: Tight mode (Settings, Page layout; off by default), for the EIC. On every MC page the journal logo bar folds away after a second, the row with MC's instructions ("The tabs below organize…") goes, and so do MC's empty spacing rows, with less padding around the main column. The instructions stay on MC's popups, where they are the page. A spacing row comes back if MC later puts something in it.

## 0.0.83 (2026-11-20)

- Changed: one-button reject decides whether MC is showing a Reject choice or Submit button with Chrome's own visibility check, which also catches controls hidden by an enclosing section, not only by their own style.
- Fixed: "Extension context invalidated" could still reach the console from MC tabs left open after E-MC was reloaded. Every storage read and write in those tabs now checks first that E-MC is still there and never throws, and settings changes, the keepalive and the login page do the same. Old errors stay listed on the Extensions page until you press Clear all there.

## 0.0.82 (2026-11-20)

- Fixed: one-button reject reached the AE Recommends form, then stopped with "couldn't find the Recommends form with a Reject choice" and pressed Make Recommendation twice more first. It now counts only the Reject choice and Submit that MC shows (a hidden copy of another form's controls made two of each), takes an image Submit button, stops at once when the form is on the page but can't be read, and says in the banner what it counted.
- Fixed: after E-MC was reloaded, MC tabs left open showed "Uncaught (in promise) Error: Extension context invalidated" in the console. The old copy in those tabs now stays quiet.

## 0.0.81 (2026-11-20)

- Fixed: the developer log's "title reapplied" entries held the page title, which on a manuscript page includes its title. They now hold only the lengths.
- Changed: when the live log helper can't start, the side panel says exactly what to type in Terminal and where, and when it's needed again.

## 0.0.80 (2026-11-20)

- New (test builds, developer mode, off by default): the Back-link experiment, to learn whether a link on a page Back brought up still works later in the session. With it on, a page shown by Back gets a bar at the top to send its links as saved or with the latest live page's tokens (hidden fields other than the page and action ones); each press and MC's answer (page name, logged out, error page) go to the log. Only page names, field names, a kind of link and yes/no results are logged, never values or page text, and nothing is pressed for the person.
- Changed: when one-button reject can't get to Make Recommendation, its banner says which piece was missing: no "reviews required" box, no Save next to it, or the box wouldn't take 0. It also takes a number box and an image Save button.
- New: in developer mode, the side panel's test-build label also shows the build's commit and build time ("test build v0.0.80 · 1898ea0 · 20 Nov 10:17"), so it's clear which build Chrome is running. Store builds carry neither.
- Fixed: a Reject made as AE (by one-button reject) showed in the queue as "you decided Reject" on a red row. The details page lists a "Make Immediate Decision" task link next to every other task, and that link made any Submit there count as a decision. Now a press on the AE's "… Recommends" form is never a decision, and the task link doesn't count. Each press also records the role it was made in and whether the paper had an AE; the blue note says "as AE" or "as co-chair", and only a decision made as co-chair with no AE shades the row red. An entry from an older build that says "decided" on a row that shows an AE is shown as a recommendation, without the red.
- Fixed: one-button reject stopped with "no Make Recommendation task" on a paper whose "# reviews required to make decision" was 2. MC shows that task only once the number is 0 and saved; the run didn't recognize MC's wording, and set the box without pressing Save. It now sets it to 0, presses the Save beside the Reviewer List, and opens Make Recommendation when the page comes back.
- Changed: every feature is on by default (Simson): one-button reject, full window width, page title on top, log in once the password manager fills the form, Take Action after a one-result search, stay logged in, and the grouped Assign AE pull-down (the shipped config until one is saved). Developer mode and Show advanced settings stay off. Saved settings are kept; the defaults matter for a new install, or after the extension is removed and loaded again, which clears its settings.
- Changed: one-button reject says in the page's Console (and the log) why it isn't shown on a manuscript page: no AE pull-down, no Assign control next to it, a run already in progress, or a popup window. It also finds an Assign control one or two table rows out from the pull-down, never an "Assign Reviewers" one. Each step of a page's run is now guarded on its own, so one that fails is logged (also in the Console) and the rest, such as the full-width styling, still run.

## 0.0.79 (2026-11-20)

- Fixed: on real MC pages the classifier never saw MC's page name (CURRENT_PAGE), so pages it alone settles weren't recognized: a co-chair's Assign AE details page was not taken for a manuscript page, and one-button reject didn't appear. The parser classifies a cleaned copy of the page without hidden elements, and in Chrome every hidden input counts as hidden; jsdom, which the tests use, doesn't, so the tests passed. The name is now read from the live page. A new check loads the built extension in real Chromium on a synthetic details page and fails unless it is read as a manuscript page and the one-button controls appear (`npm run test:page`, also in CI).
- New: in the Editorial matrix, Cmd-F (Ctrl-F on Windows and Linux) goes to the matrix's search box and selects its text, instead of opening Chrome's find bar. Press it again in the box for Chrome's find bar.
- New: "Save team file…" in the Editorial matrix, beside "Load a team file…", saves the whole team (the same file as the Team editor's Save to file).
- Fixed: in developer mode, Chrome listed "Permissions policy violation: unload is not allowed in this document" on MC pages, again on every load. The page snapshot (for weekly page samples and Capture page HTML) cloned the whole live page, and cloning MC's body, which carries an onunload attribute, registered an unload handler in the page. The snapshot is now made in a separate, inert document, and also leaves out event-handler attributes. A test fails if any source adds an unload listener, sets onunload or clones the whole page.
- Fixed: flag labels went on the wrong things. Reading the "Flag This Manuscript" panel took any icon near its heading, so MC's bullets, "req" marks, expanders and person icons were learned as flags, and pages showed "(flagged: …)" with a name, a manuscript ID, checklist text or "Reviewer Locator", in large type in Version History. Now only flag icons (an image with "flag" in its address) are learned and labeled, a label is taken from the words beside the icon or its tooltip or alt text, and names and manuscript IDs are never labels. Reading the panel again replaces the journal's flags, so the bad entries go; until then they're ignored. Labels are 12px, go after the icon's link instead of inside it, and are never added in Version History.
- Fixed: in the Team editor, removing a section left its head off the tree ("Not on the tree") though the confirm said only that its columns would report to the co-chairs. Its heads and AEs who are nowhere else now become AEs in no section, reporting to the co-chairs, and the confirm says by name what happens to each of them and to its columns. New: "Make it a column" turns a section into a column of the same name that reports to the co-chairs, with its heads as the columnists.
- Fixed: the redacted log export (the one meant for sharing) kept manuscript IDs that some events log as plain text ("take action after search", "no version links found", "search did not find exactly that manuscript"), and the quoted text of a rejected title in parse warnings. Text in a redacted export now has its manuscript IDs replaced by the same hashes as the rest of the export, and quoted text replaced by "<text>". Found by the new local tests on real data, which redact the whole live log and look for IDs, emails and titles (counts only).
- Safer one-button reject: each step now goes on only once MC has taken the Submit. If MC sends the AE recommendation form back (a required field, an error), the run waits for your next Submit instead of going on to the co-chair step; if it sends the co-chair form back, the run stops and says so instead of reporting "done". And the run presses Submit only on its own role's form: the co-chair step needs "Co-Chair" in the "… Recommends" heading, the AE step needs a heading without it. Before, any "… Recommends" form would do.
- New: a warning when MC changes its pages. On each page load the extension checks that the parts its features rely on are there (the AE/CC lines, task links, the Assign AE pull-down, the Recommends form, the Take Action list, the search bar, who is logged in, and so on), and learns, per MC page name, which ones that page always has. When one that had been found at least 20 times is missing three loads in a row, the side panel says in E-MC brown "MC changed: … not found on …", the log records it ("MC changed"), and one-button reject won't start on that page until it's back. Only the check names and found/not found are kept, in local storage; Clear all data removes them (`lib/probes.ts`).
- Development: every click handler of ours now runs from one listener in fixed phases (trace, guard, record, act; `lib/clickbus.ts`), so a guard that stops a press is sure to stop everything after it.
- Development: the content script's features are now modules in `lib/features/` (versions and milestones, the AE menu, the To EIC list, flag labels, one-button reject, auto-advance, queue marks, the page look, and the role and identity recorders). The content script parses, builds each run's context and runs them in order; features follow the stored values they name instead of reading storage themselves. It went from 722 to about 430 lines, and the moved code is now tested on its own. No change in behavior.
- Better page recognition: the classifier now reads MC's own name for each page (the hidden CURRENT_PAGE field, such as ASSOCIATE_EDITOR_MANUSCRIPT_DETAILS) and gives it the most weight (parser 0.3.0). Checked against the live log, the old signals alone had called 22 of 377 manuscript details pages queue lists (a details page that also lists other manuscripts with Take Action), so the side panel, notes and the page features saw no manuscript there; a few queue pages came out unknown and two dashboards as manuscripts. A manuscript's details in a popup (a reviewer's view) now counts as a manuscript page. A local test on real data checks that MC's page names and the classifier agree.
- Fixed: a note saved in the side panel could be lost if another panel, the daily cleanup of old manuscripts, or the one-time notes migration wrote at the same moment, since the panel wrote the whole notes store itself. The panel now sends each change (add or edit, delete, merge with the server, mark as sent) to the background, which applies it in the same queue as every other storage write.
- Fixed: Clear all data left some data behind: the last-activity and keepalive times, the last cleanup time, the matrix's "Hide columnists" choice, and this browser's note-signing keys (in IndexedDB; a new key is made the next time you post a note). Its confirmation now lists everything it removes. A test checks that every storage key is either cleared or deliberately kept, so a new one can't be missed.
- Development: developer mode logs each request MC's own page scripts make (XHR, fetch, beacons), by path and parameter names, never values ("request" events, from the browser's resource timing), so we can learn which parts of MC run in the browser. The audit found only one so far, the "+ Search" toggle's AJAX servlet.
- Development: test builds in developer mode save one copy of each kind of MC page (by MC's own page name, CURRENT_PAGE) each week, through the live-log helper, as `var/real-pages/<page>.html`, so the local real-data tests always run on recent pages (`lib/pagesample.ts`). Scripts and anything typed into fields are left out. Reinstall the helper (`make install-log-host`) to get this.
- Development: ESLint with type-aware rules (`npm run lint`, its own packages in `tools/lint` because typescript-eslint needs the TypeScript 5 API), stricter TypeScript settings (unused locals and parameters, implicit returns), a coverage floor for `lib/` and `parsers/`, a manifest permission guard (`permissions.json`, checked after every build and zip), a scan for real MC data with git hooks (`make install-hooks`), and local-only tests on real data in `../var` (`npm run test:real`, `tests-real/README.md`). `make check-all` runs every check, including the notes server's `cargo fmt`, `clippy` and tests and the Python tools' `ruff`, `pyright` and `pytest`; CI runs the same.

## 0.0.78 (2026-11-18)

- New: decisions you made are marked on queue lists and search results. When a co-chair makes an immediate decision without assigning an AE, MC keeps the manuscript under "Assign AE" until the EIC acts, and MC's Recommendations box doesn't show the decision, so the extension never knew about it. Now it notes your choice when you press Submit (or Commit Decision) with a choice picked, once MC answers with a new page (a press MC refuses, or one the extension's own guards stop, isn't kept). In queue grids and search results, that manuscript's rows get a light red background (10% red) and under its ID, where MC shows "(Resubmitted)", it says in blue "E-MC: you decided Reject (2026-10-23); MC still lists it until the EIC acts". Recommendations from the Recommendations box show the same way ("you recommended …"); that note used to sit in the Status cell in E-MC brown. A decision noted at Submit leaves the list when a decision letter for the manuscript has gone out. Only the choice is kept, in this browser, never the comments. The log records each one ("decision recorded at submit").
- Decisions made before this version, or in another browser, are found from MC's own list: a row whose Status has a "Make Decision (Due …)" task next to "Assign AE" (MC adds that task after a co-chair's immediate decision) is marked the same way, with "E-MC: decision made; MC still lists it until the EIC acts" (MC's list doesn't say which decision).
- New: MC's flag icons, named. When a manuscript's details page shows the "Flag This Manuscript" panel, the extension learns each icon and its label (per journal, by the icon's file name) and from then on puts the label beside that icon on lists and details pages, in italic E-MC brown: "(flagged: 3 or more rejections)". Hover for where it came from. Settings → Features → "Name MC's flag icons" is on by default. Only MC's own flag labels are kept, in local storage; Clear all data removes them. The log records how many were learned ("flags learned").
- New (test it before relying on it): one-button reject for co-chairs. Settings → Features → "One-button reject next to MC's Assign AE button" (off by default) puts "| [ ] reject [one-button reject]" after MC's Assign button in the Associate Editor List. The button works only after you've opened the PDF on this visit to the paper (leaving the paper resets it) and checked "reject". Pressing it picks your own AE entry in the pull-down (found from who is logged in, so it works for any co-chair), presses Assign, switches to the Associate Editor Center, opens the paper by search, sets the reviewers needed to 0 if the page has such a field, opens Make Recommendation, picks Reject and puts the cursor in "Comments to the Author". A banner says you're in one-button reject mode, with a Stop button. Write your comments (and anything for the editor) and press Submit. The extension then switches to the Co-Chair Center, opens the paper by search, opens the co-chair recommendation, picks Reject, copies both comment boxes and presses Submit itself. Every step runs in the tab you're looking at, one page at a time. Anything unexpected (another paper opens, no Reject choice, a missing link, a choice other than Reject at the AE step) stops the run and says why; the comments you wrote are still on MC's AE recommendation. The log records each step ("one-button reject step") with no text from the paper.
- Known gap: rescinding a decision that MC's Recommendations box never showed doesn't clear it; it stays red until the decision letter goes out.

## 0.0.77 (2026-11-18)

- Fix for the Chrome Web Store's "Blue Argon" warning (remotely hosted code). Transformers.js, which runs the AE-suggestion model, contains a default that points ONNX's WebAssembly runtime at cdn.jsdelivr.net and models at huggingface.co. The extension always replaced those with its own bundled files before loading the model, and its CSP allows only its own scripts, so nothing was ever loaded from there; but MV3 doesn't allow the address in the package at all. The build now rewrites those defaults to the bundled runtime (`ort/`) and turns off remote models (`scripts/local-runtime.ts`), and stops if a Transformers.js upgrade changes that code. AE suggestions work as before.
- New build check: `scripts/check-no-remote-code.mjs` runs after every build and zip and in CI, and fails if the built extension names a CDN or model host, imports a script or worker from a URL (including a bare `import "https://…"`), has a remote `<script>`, or has a CSP that allows other script sources. The CSP check reads each directive by its full name and covers `default-src` (the fallback), `script-src`, `script-src-elem`, `script-src-attr` and `worker-src`, in every policy the manifest has. Tests in `tests/noremotecode.test.ts` (from Copilot's review of PR #80).

## 0.0.76 (2026-11-16)

- New: a recommendation can't go out without a choice. MC accepts Submit in a Recommends table (and Commit Decision in a Decision box) with none of the choices picked, and records an empty recommendation. Now, when the page has choices and none is picked, the extension stops the press and shows "pick one of the choices below before you submit. Nothing was sent." in bold E-MC brown above the choices. Picking a choice removes the message. Save as Draft isn't affected, and the no-comment warning and auto-advance never see a stopped press. The log records each one ("no recommendation picked").

## 0.0.75 (2026-11-12)

- New: a word count on manuscript PDFs. When a PDF from MC opens, a box at the lower left of Chrome's PDF viewer gives the body's word count ("2,898 words") and says what it counted. It skips the cover page (page 1), MC's line numbers (digit-only text stacked in a column in the margin or between two columns), running headers and footers, and everything from the References heading on (also Acknowledgments and author bios). When a PDF holds the article twice, such as a clean copy and a marked-up one, it notices the second copy (a later page opens the way the article opened) and counts only the first; the box gives the other copy's count too. It also gives the count including references ("1,820 including references"). The box ends with "(Cover page and marginal line numbers excluded from count.)". Click the box to hide it. Settings → Features → "Count the words in manuscript PDFs" (on by default) turns it off.
- How it works: Chrome's viewer can't be read, so the extension asks MC for the same PDF again (one more request for a file you just opened) and reads it with pdf.js (`pdfjs-dist`, bundled; about 1.7 MB, loaded only on PDF pages). The text and the count stay in the tab; nothing is stored or sent. The log records the numbers only ("PDF words").
- The manifest now lists pdf.js's two files under `web_accessible_resources` for MC's pages, so the content script can load them. That isn't a permission and adds no install warning.
- `tools/wordcount/count.ts` counts PDFs on your own computer the same way, printing numbers only.

## 0.0.74 (2026-11-10)

- New: a "Hide columnists" checkbox at the top of the editorial matrix. It hides the columns in the tree and the Columnists section of the table, so only the people who take assignments are left: the EIC and co-chairs, the column heads and the AEs. A columnist who is also a head or an AE stays. The box remembers its setting.
- New setting "After I log in, go to the Co-Chair Center" (Settings → Features, on by default). On the first page after you log in, if you could pick either the AE Center or the Co-Chair Center, the extension opens the Co-Chair Center for you. It does this only right after a login in that tab (not when you go back to the welcome page later), waits through MC's emailed-code check, and does nothing for people without both centers. The log records it ("to the Co-Chair Center after login").

## 0.0.73 (2026-11-09)

- New: a warning before a decision or recommendation goes out with no comment to the author. Pressing Submit in a Recommends table, or Commit Decision in a Decision box, with an accept, revise or reject choice and an empty "Comments to the Author" box now asks "Send it anyway?". Cancel stops the press (auto-advance doesn't count it) and puts the cursor in the box. Other choices, and pages without such a box, aren't affected. The log records each warning and the answer ("no comment to author").

## 0.0.72 (2026-11-09)

- The log's keepalive lines now give the HTTP status and size of each request MC answered, the minutes since you last used MC, and how long the page has been open. MC still logs people out now and then with keepalives running; these numbers should show whether MC was already refusing the keepalives before it did.

## 0.0.71 (2026-11-09)

- Fixed: clicking a choice's label on AE Recommends still didn't pick it in 0.0.70. The row-click check gave up whenever anything around the click had an onclick, and MC puts onclick on whole tables and cells. Now only links, buttons, fields and small clickable items inside the row count, and the click is caught before MC's own handlers can stop it.
- The log records each row click that picks a choice, and why a click in a choice row didn't ("radio row").

## 0.0.70 (2026-11-09)

- Fixed: on AE Recommends (and other choice lists drawn the same way), clicking a choice's label showed the hand cursor but didn't pick it. MC puts each label in a small table of its own inside the row, so the click landed in a row with no radio button. The click now goes to the enclosing row's radio button.

## 0.0.69 (2026-11-09)

- The team database can describe a role account. A person can now have an MC name that isn't their own ("Co-Chair, Opinions"), a title for the AE menu ("Opinion Co-Chair") and "Always at the top of the AE menu"; all three are in the team editor's person form. The AE menu matches such an account only by its MC name, labels it with the person's name ("Opinion Co-Chair - Pat Editor (4)") and puts it above every group. Assigning to the co-chair account is how a co-chair takes a paper to reject it, so it belongs on top.
- The log now records each PDF that opens and what the zoom setting did ("PDF opened", "PDF zoom set").

## 0.0.68 (2026-11-09)

- New setting "Open PDFs at" (Settings → Page layout): PDFs opened from MC (the PDF button, proofs) open in Chrome's viewer at 125, 150, 175 or 200% instead of fit to width. The extension sets that tab's zoom just after the viewer's own fit, for the first few seconds only, so your own zooming afterwards is left alone. Only the PDF's tab is zoomed, never every MC page. Off (Chrome's fit to width) by default. No new permissions.

## 0.0.67 (2026-11-09)

- Fixed: the page arrows beside "Manuscripts 1-10 of 19" still weren't enlarged. On those lists the range text is spread over several cells, so the extension never found the arrows next to it. It now also finds MC's own arrow images (icons/left_arrow.gif and right_arrow.gif) directly and replaces them with brown SVG arrowheads twice their size.

## 0.0.66 (2026-11-08)

- On a revision's Assign AE task, the Associate Editor List now says who handled the earlier versions ("Original Associate Editor: …"), and those AEs go to the top of the pull-down under "Original AE" in bold brown. This works even when the AE menu's grouping is off. As in Peer Review Milestones, an earlier AE is known once you have opened that version in this browser.
- Fixed: the page arrows beside "Manuscripts 1-10 of 19" on MC's lists weren't enlarged. The extension only handled arrows drawn as images or as text characters; arrows drawn with an icon font or CSS now get the same large brown arrowheads. The arrows may also sit in the cell next to the range. In developer mode the log says what it found ("pager arrows").

## 0.0.65 (2026-11-08)

- Fixed: updating the extension could leave "Uncaught (in promise) Error: No SW" on its Errors page. Chrome raises it when a call the old background worker started is still running as the new one replaces it. Every background call now catches it, and anything else left over is still reported.
- CI now loads the built extension into headless Chromium, opens a made-up MC page and another site, reloads the extension twice as an update does, and fails if Chrome records any error (`npm run test:load`).

## 0.0.64 (2026-11-07)

- The side panel shows only on Manuscript Central tabs. It used to stay open on every other site with "Not an MC page". Each MC tab now has its own panel: it hides when you switch to another site and comes back when you return to that tab. In a new MC tab, click the toolbar icon to open it.

## 0.0.63 (2026-11-07)

- Tooltips on the extension's own pages (the Matrix, the team editor, the AE menu editor and the side panel) now show after a fifth of a second instead of Chrome's usual second or so.

## 0.0.62 (2026-11-07)

- Fixed: the AE menu still wasn't styled on MC's Assign AE task. The extension didn't recognize the pull-down there: its row says only "Pick from a list", the "Associate Editor List" title is two rows up, and the "Select an AE" placeholder was being ignored. It now reads the table's title row and the placeholder too, so the pull-down is styled and its counts are read. If a page has a pull-down of counted names that still isn't recognized, the log now says so ("AE menu": not recognized).

## 0.0.61 (2026-11-07)

- The Settings tab is simpler: it shows the everyday settings (layout, text size, page title, revisions, log in, next manuscript, keep me logged in, your name on notes, the AE menu switch, Clear all data). "Show advanced settings" reveals the rest: earlier versions' AEs, title rewriting, single-result Take Action, Attach, Back (test builds), the notes server, the AE menu's config source and editors, and developer mode.

## 0.0.60 (2026-11-07)

- The left-column page title option now moves the title instead of hiding it: "Search Results", "View Manuscripts" and the like show as a bold E-MC heading at the top of the page's main column, and the empty left column goes. Titles drawn as images are turned into text ("view_mss_header.gif" becomes "View Manuscripts").
- Fixed: the "Group, relabel and color the Assign Associate Editor pull-down" checkbox couldn't be ticked until a config existed, so the menu was never styled. Ticking it now starts this browser's config from the shipped one (section heads, then AEs, then everyone else).

## 0.0.59 (2026-11-07)

- Test builds: **Back works on MC.** MC sends every page with "Cache-Control: no-store", so Chrome kept no copy and Back showed "Confirm Form Resubmission". Test builds now replace that header on MC's own pages with "private, max-age=0", so Chrome keeps each page and Back shows it as it was. This adds the `declarativeNetRequestWithHostAccess` permission to test builds only; the Web Store build is unchanged. A setting turns it off. MC pages now stay in Chrome's cache on this computer.
- The log records what the AE menu did on each page with an AE pull-down ("AE menu": styled, or why not), so a menu that isn't styled can be diagnosed.

## 0.0.58 (2026-11-07)

- Fixed: the next manuscript still didn't open on Co-Chair Make Recommendation. The extension thought it was already there, because MC's default view can name the task without showing its form. Now it always opens the task's link, and if MC draws the link late it waits up to 10 seconds for it. The log records what happened ("same task on the next manuscript").

## 0.0.57 (2026-11-07)

- Fixed: the same-task carry-over (0.0.56) missed "Co-Chair Make Recommendation". It didn't count role-prefixed task links, and it looked for the task on MC's recommendation form, which has no task links. Now it remembers the first task link you open on a manuscript and opens that link on the next one.

## 0.0.56 (2026-11-06)

- Moving on to the next manuscript keeps you on the same task: if you were on Make Recommendation (or Make Immediate Decision, Make Decision, …), the next manuscript opens on that task too, when it has one. This works after a recommendation or decision and when you press MC's previous/next arrows. It follows the "go on to the next manuscript" setting.

## 0.0.55 (2026-11-06)

- Going on to the next manuscript now also works after Commit Decision (a co-chair's immediate reject), not only after submitting a recommendation.

## 0.0.54 (2026-11-06)

- **One team database** drives the Matrix, the AE menu and Suggested AEs. It holds the EIC and Deputy EIC, the co-chairs, sections with their heads and AEs (an AE can be in several sections, or none), and columns with their columnists (a column inside a section reports to its heads; one outside reports to the co-chairs as a group). Each person has one MC account email (shared accounts are marked), affiliations, expertise, notes, any number of labeled links, and a photo. It's kept in this browser's local storage; Clear all data removes it.
- **Team window** (Matrix > Edit hierarchy…, or Settings): the team as a tree of pills, editable. Add and remove leaders, sections, heads, AEs, columns and columnists; move a column between sections; load and save the team as a JSON file (an older roster.json is converted).
- **Matrix**: the tree of pills at the top (with each editor's current count), "+ person", and clicking a name opens that person's form: every field, a + for more links, and photo upload (shrunk to 256px).
- **AE menu**: the people table is gone from the AE menu config; groups take parts of the team (EIC and co-chairs, section heads, AEs, columnists), optionally only some sections, and labels show all of a person's sections ("Education / Privacy - Pat Editor"). Older configs still load.

## 0.0.53 (2026-11-04)

- The Version History box on a revision's page is easier to see: its heading is bold and everything in it, including the "View Review Details" links, is one point larger than the rest of the page's text. It follows the text-size setting.

## 0.0.52 (2026-11-04)

- An **AE menu** button at the top of the side panel opens the editor. Choosing an AE menu config in the Matrix window's Load roster… loads it as the AE menu config and opens the editor, instead of failing.
- The Matrix window no longer tells people to run a `make export` that never existed; it just asks for a `roster.json`.
- Loading a file in the AE menu editor saves it at once.

## 0.0.51 (2026-11-04)

- **Grouped, relabeled, colored AE menu.** MC's Assign Associate Editor pull-down can be regrouped under labeled dividers and styled per group (color, bold, italic, menu font and size). The config holds a table of people (given name, family name, section, email); people in it are relabeled, so "Editor, Pat (3)" can read "Example Column - Pat Editor (3)". The Opinions co-chair layout puts the table's people (column heads) first, then Opinions AEs from the roster loaded in the Matrix window, then other AEs. MC's option values and selection are unchanged, so assignment submits as before; workload counts still read MC's own text; turning it off puts MC's menu back. The open menu shows the styles in Chrome 135+ (`appearance: base-select`); older Chrome gets the order, labels and dividers.
- **AE menu editor**, in its own window (Settings > AE assignment menu > Edit…): edit the table, paste rows from a spreadsheet, set the label and groups, save to and load from a JSON file, start from the blank config shipped in `config/ae-menu.json`, and preview the result on a copy of the last pull-down MC showed. Rows MC's pull-down doesn't list are flagged.
- Settings picks this browser's config or a downloaded server config, and copies the server's here for editing. The server store (list, download, admin save and delete, in DynamoDB, signed with the admin's key) is planned in `doc/planning/AE menu config.md`; its buttons say it isn't built yet. Configs stay in this browser's local storage; Clear all data removes them. No new permission.

## 0.0.50 (2026-11-04)

- Fixed: a keepalive could be due in a tab whose page has no "+ Search" bar (a popup, the login page); that tab took the turn and sent nothing. Now only a tab that can send takes it.
- Developer mode now records a trace in the log: every click (control, label, section, what its link runs) and every page load (address, MC's action and hidden form fields, embedded JSON). Typed text is never recorded.

## 0.0.49 (2026-11-03)

- After you submit a recommendation, the extension goes on to the next manuscript in the list, in the direction you're moving (forward if you started at the first one, backward if at the last). A setting turns it off.
- The grids' page arrows (beside "Manuscripts 11-12 of 12") are redrawn twice as big.

## 0.0.48 (2026-11-02)

- The bigger previous/next arrows are redrawn as sharp round brown buttons, instead of MC's small pictures scaled up (which looked blurry).

## 0.0.47 (2026-11-01)

- Keepalives now continue for up to 48 hours without activity (was 8).

## 0.0.46 (2026-11-01)

- The page-title setting now also hides titles MC draws as text, such as "View Manuscripts", not just its title images. It's renamed "Hide the left-column page title and the space it wastes".

## 0.0.45 (2026-10-31)

- New setting (off by default): "Send keepalives to prevent auto logout". After 10 idle minutes the extension opens and closes MC's "+ Search" bar, which pings MC's server; it stops after 8 idle hours. Ctrl+Shift+K sends one at once, for testing.

## 0.0.44 (2026-10-31)

- In MC's radio-button tables (Co-Chair Recommends and the like), clicking anywhere in a row picks that row's choice, not just the little button.
- MC's previous/next manuscript arrows ("7 / 8") are twice as big.

## 0.0.43 (2026-10-30)

- **Suggested AEs.** On a manuscript's page, the side panel's Page tab ranks the AEs whose published work is closest to the manuscript's title, abstract and keywords, with each AE's current load from MC's Assign Associate Editor pull-down and the AE paper that matched best. The comparison runs on your computer with a bundled embedding model (bge-small-en-v1.5); the manuscript is never stored or sent.
- AE expertise profiles are built by `make ae-profiles ROSTER=roster.json` from public OpenAlex and DBLP records and loaded from the resulting `ae-profiles.json` (see tools/ae-profiles/README.md). Clear all data removes them.
- The build now bundles the model and the ONNX WebAssembly runtime (about 50 MB), and the extension's pages allow WebAssembly (`wasm-unsafe-eval`). No new permission.

## 0.0.42 (2026-10-28)

- Fixed: once 0.0.37 made the manuscript IDs clickable, the next look at the page no longer found the IDs (it skips what E-MC adds), so the grid read as an unknown page and revisions lost their highlight. The parser now reads the ID text inside those links. (0.0.40 and 0.0.43 are on the authored-notes branch.)

## 0.0.40 (2026-10-28)
- Notes are signed. Each one shows its author and the time its editing session began. Typing keeps updating the same note, and after an hour away your next note starts fresh. Authors can edit or delete their own notes; co-chairs and the EIC can delete any note.
- The extension reads who is logged in from MC's page, and asks once for the name to put on your notes. If it differs from MC's name, notes show both: "Pat Example (Opinions Co-Chair)".
- Optional notes server (Settings > Notes server): notes are shared through a small AWS Lambda (`backend/notes`). Each browser makes its own signing key, which can't be copied out of it. Requests carry a hash of the manuscript's title, never the title. The project owner can ban a key. No new permission.
- Notes from earlier versions become your notes, dated when you upgrade.
## 0.0.39 (2026-10-28)

- On MC's login page, the two "Create an Account" links stay where they were and still work, but are drawn as pictures of the words "New Account". 0.0.38 showed that their wording was what made 1Password offer to generate a password instead of filling your login. The "more..." button is gone.

## 0.0.38 (2026-10-27)

- On MC's login page, the two "Create an Account" links are replaced by one bold brown "more..." button that brings them back when clicked, in case the sign-up wording makes 1Password offer to generate a password instead of filling your login.

## 0.0.37 (2026-10-27)

- Fixed: the side panel wouldn't open on an MC tab that had been on another page before (often the new-tab page), after the extension was reloaded or updated.
- Clickable manuscript IDs on the grids are now bold E-MC brown, so you can see they're links.

## 0.0.36 (2026-10-27)

- Fixed: after the extension learned a new MC role, it stopped saving anything (the log, the Seen list, the To EIC list) until Chrome restarted its background script. With the live log keeping that script awake, it never recovered.

## 0.0.35 (2026-10-27)

- Removed: the background lookup of earlier versions' AEs. It loaded MC pages beside your tab and logged you out. Earlier versions' AEs now come only from versions you've opened; open each original once and its AE shows on the revision.
- The live log helper is now a small Python program, tested end to end with Chrome; the Log tab shows the file it writes to, or why it isn't available.

## 0.0.34 (2026-10-27)

- Live log file for developers: in Developer mode, test builds append every log entry to `var/electric-mc.log` in the repository on your own computer, as it happens. Set it up once with `make install-log-host`. It needs the new `nativeMessaging` permission, in test builds only; the Web Store build doesn't have it.

## 0.0.33 (2026-10-24)

- Manuscript IDs on MC's grids are links that do what the Take Action checkbox does.
- New To EIC tab for co-chairs: your recommendations to the EIC, read from each manuscript's Recommendations box, also noted in the grid's Status column until the EIC acts. Copy summary for the EIC copies the list.
- The extension learns your MC roles (EIC, co-chair, AE, reviewer, author) as you use MC and remembers them across role switches.

## 0.0.32 (2026-10-23)

- New: the Opinions editorial matrix, in its own window (**Matrix** at the top of the side panel). It shows each column head's and AE's current number of assigned manuscripts, read from MC's Assign Associate Editor pull-down whenever you open it.
- The matrix's roster is loaded from a file (`make export` in cacm-opn-dashboard); the extension itself carries no names.
- Clear all data also removes the AE counts and the roster.

## 0.0.31 (2026-10-22)

- Notes save themselves as you type (and when you leave the box or switch manuscripts). The Save button is gone.

## 0.0.30 (2026-10-22)

- Manuscripts you haven't viewed in 2 years are removed automatically, with their notes.
- New "Clear all data" button at the bottom of Settings: removes the Seen list, notes and log, and keeps your settings.

## 0.0.29 (2026-10-22)

- Fixed: the side panel could say "This tab is running an older build" on an up-to-date tab while MC was between pages. It now asks again and checks once more when the page finishes loading.
- Fixed: "AE: Not Assigned" on the current page could be saved as that version's AE.

## 0.0.28 (2026-10-22)

- Fixed: the side panel could not be opened in 0.0.27.
- A tab that comes to MC from another site gets its own panel, which doesn't follow you to other tabs.

## 0.0.27 (2026-10-22)

- The side panel now hides on pages that aren't Manuscript Central, and still follows you across MC tabs.

## 0.0.26 (2026-10-21)

- Earlier versions' AE is looked up offscreen again, in a sealed frame that can't change your page.
- The Version History note says "AE: looking it up…" while the lookup runs.
- Version History drawn after the page loads is picked up too.

## 0.0.25 (2026-10-21)

- Fixed: opening a revision no longer switches the page to the original version.
- Earlier versions' AE now comes from versions you've viewed. Open each earlier version once and its AE shows up on the revision.
- Choosing a file to upload now presses its Attach button for you. You can turn this off in Settings.
- Fixed: a false "reviewers mentioned but not parsed" warning on manuscripts whose notes mention reviewers but that have no reviewers yet.
- New: this changelog.

## 0.0.24 (2026-10-21)

- Search box on the Seen tab: filters by ID or title, ignoring case.

## 0.0.23 (2026-10-21)

- MC's javascript: links are clicked from the page's own world, so Take Action, the Seen search and the Audit Trail lookup no longer fail with CSP errors.
- No more "No tab with id" errors when a tab closes early.

## 0.0.22 (2026-10-21)

- Earlier versions' AE and co-chair are read from MC's editor block.
- A Status | History header no longer reads as status "History".

## 0.0.21 (2026-10-19)

- `STORE=1` builds the Chrome Web Store package.

## 0.0.20 (2026-10-19)

- New setting (off by default): hide MC's page-title image and the empty column beside it.
- Fixed: Take Action after a search was blocked by the Search Criteria line.

## 0.0.19 (2026-10-19)

- A search that finds one manuscript is read as a results list, not a manuscript page.
- Queue status shows as lines in Seen.

## 0.0.18 (2026-10-19)

- Click an ID in Seen to open that manuscript.
- New setting (off by default): Take Action after any search that finds a single manuscript.

## 0.0.17 (2026-10-19)

- Queue rows with per-action Status tables are parsed, so revisions are highlighted there too.
- Full width picks the right column.
- Milestone rows go at the bottom of Peer Review Milestones.

## 0.0.16 (2026-10-18)

- The side panel flags tabs still running an old build and offers to reload them.

## 0.0.15 (2026-10-18)

- Login fields are labeled before password managers scan the page.
- Auto-login is now an opt-in setting.

## 0.0.14 (2026-10-18)

- Login help on any page with exactly one password field.

## 0.0.13 (2026-10-18)

- New icon: MC with a lightning bolt through it, grey when switched off.

## 0.0.12 (2026-10-18)

- Builds go into `build/` (load unpacked from `build/chrome-mv3`).

## 0.0.11 (2026-10-18)

- Page layout preferences moved into the Settings tab.

## 0.0.10 (2026-10-18)

- Renumbered under semantic versioning; the version shows in the name and side panel.
