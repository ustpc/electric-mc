# Ideas from the web

Complaints about Manuscript Central (ScholarOne Manuscripts) found online,
and how the Electric MC architecture (a Chrome extension plus a Lambda and
DynamoDB backend, see [Design Goals.md](Design%20Goals.md)) could address
each one.

Research done 2026-10-16. Each idea lists where the complaint was made and
when. "Undated" means the page shows no date. Ideas are grouped by who
benefits and ordered roughly by how well they fit the architecture.

Fit ratings:

- **High**: the extension and backend can solve it without touching
  Manuscript Central data.
- **Medium**: helps, but depends on reading more pages or on publisher
  cooperation.
- **Low**: mostly out of reach for an extension; listed for completeness.

---

## A. Editors and associate editors

### A1. Manuscript status is hard to monitor, and deadlines slip

A clinical researcher reviewing ScholarOne on Capterra said submission status
is "extremely difficult to monitor", the interface is "clunky and outdated",
and the system "encourages editor laziness" with missed deadlines. At the
ScholarOne Summit, publishers named "transparent status tracking" as a top
pain point. A 2018 comparison of manuscript systems found ScholarOne lacked a
colour-coded, expandable review-status column that other systems had.

- Idea: colour-code statuses and due dates on every queue page (G1), and
  list stalled manuscripts on the attention dashboard (G4).
- Fit: **High**.
- Sources:
  - [Capterra review, Senior Clinical Fellow](https://www.capterra.com/p/234422/ScholarOne/reviews/), 2025-07-17
  - [ScholarOne Summit 2025 Recap, Silverchair](https://www.silverchair.com/news/scholarone-summit-2025-recap/), 2025-10-27
  - [Kim et al., "Comparative analysis of manuscript management systems for scholarly publishing", Science Editing 5(2)](https://www.escienceediting.org/journal/view.php?number=148), 2018-08-20

### A2. Editors keep their real records in spreadsheets

In 34 interviews, Silverchair found editors "building their own processes
outside any single platform, using spreadsheets, reference databases, and
other workarounds", from single-editor book series to journals with 500+
manuscripts a year. 65% wanted more flexible workflows.

- Idea: the per-manuscript chat (G2) is the shared notebook; add structured
  notes (tags such as "waiting on author", "needs 3rd reviewer") that feed the
  dashboard's filters.
- Fit: **High**.
- Source: [Listening to Editors: What 34 Conversations Taught Us, Silverchair](https://www.silverchair.com/news/listening-to-editors/), 2026-02-24

### A3. Confusing "reviews required" workflow and repeated prompts

Manuscript Central keeps prompting editors to select or invite reviewers even
after enough have accepted, unless the editor changes the "# reviews required
to make decision" number. Many journals publish workarounds: set it to 0 to
desk-reject, to 2 to decide early, and so on. Revisions arrive with previous
reviewers selected but not invited.

- Idea: contextual tips injected next to the relevant controls, written per
  journal by staff and stored in the backend ("To desk-reject, set this to 0,
  then open Make Recommendation"). Optional one-click helpers later.
- Fit: **High** for tips, **Medium** for helpers (they act on Manuscript
  Central, which is a non-goal for now).
- Sources:
  - [Manuscript Central Q&A, Dalhousie (Computational Intelligence journal)](https://projects.cs.dal.ca/ci/MC.htm), undated
  - [Reviewer Info for editors, ACM TOMCCAP](https://tomccap.hosting.acm.org/editor.html), undated
  - [Instructions to AEs, IEEE Transactions on Medical Imaging](https://ieeetmi.org/aes-instructions/), undated (copyright 2026, refers to rules "since 2025")
  - [Instructions for JCR Associate Editors, Journal of Consumer Research](https://consumerresearcher.com/instructions-for-jcr-associate-editors), last modified 2026-05-07

### A4. Chasing late reviewers is manual

Automatic reminders stop after a fixed schedule; after that the AE must
email reviewers personally. Deadlines must be extended one reviewer at a time
("no bulk deadline change").

- Idea: a "chase" button that opens a pre-filled personal email (template
  stored per journal), logs the chase in the chat thread (visible to editors
  only), and shows chase history on the dashboard.
- Fit: **High** for templates and logging; **Low** for bulk deadline changes
  (would require automating Manuscript Central forms).
- Sources:
  - [ACM TOMCCAP editor info](https://tomccap.hosting.acm.org/editor.html), undated
  - [IEEE TMI Instructions to AEs](https://ieeetmi.org/aes-instructions/), undated
  - [IEEE Signal Processing Society Guidelines for Associate Editors](https://signalprocessingsociety.org/publications-resources/guidelines-associate-editors), revised 2019-05

### A5. Finding reviewers takes 15–20 invitations for 2–3 reviews

Silverchair's editor interviews found securing 2–3 quality reviews often takes
15–20 invitations; editors want better reviewer discovery. Angela Cochran
wrote in the Scholarly Kitchen that finding good reviewers is "the single
greatest problem for editors". Prophy's reviewer finder was added in October
2026, so discovery itself is being addressed by the vendor.

- Idea: a shared **reviewer notebook** in the backend: AEs leave notes about
  reviewers ("fast and thorough", "declines summer requests") visible to all
  AEs, and the extension shows them beside reviewer names on invitation
  pages. Track the invitation funnel per manuscript on the dashboard.
- Fit: **High** for notes; discovery itself is now a vendor feature.
- Sources:
  - [Listening to Editors, Silverchair](https://www.silverchair.com/news/listening-to-editors/), 2026-02-24
  - [Ask The Chefs: How Can We Improve the Article Review and Submission Process?, Scholarly Kitchen](https://scholarlykitchen.sspnet.org/2015/03/26/ask-the-chefs-how-can-we-improve-the-article-review-and-submission-process/), 2015-03-26
  - [Prophy Brings Explainable Reviewer Matching to ScholarOne Manuscripts, Silverchair](https://www.silverchair.com/news/prophy-brings-explainable-reviewer-matching-to-scholarone-manuscripts/), 2026-10-08

### A6. Reviewer activity is invisible across journals

A commenter (an associate editor) in the Scholarly Kitchen noted that editors
can't see a reviewer's activity across journals of the same publisher, and
that ScholarOne, Editorial Manager, and EES are "similarly painful to
navigate".

- Idea: the backend already spans journals. Record invitations and
  completions the extension sees, and show "this reviewer has 3 open reviews
  across our journals" on invitation pages.
- Fit: **Medium** (depends on the extension seeing the relevant pages, or on
  API access).
- Source: [The Manuscript Submission Mess: Brief Notes from a Grumpy Author, Scholarly Kitchen](https://scholarlykitchen.sspnet.org/2015/06/15/the-manuscript-submission-mess-brief-notes-from-a-grumpy-author/), 2015-06-15 (comments)

### A7. AEs who can't invite reviewers must suggest them by email

At the Journal of Consumer Research, AEs cannot search, select, or invite
reviewers in ScholarOne; they email suggestions to the editor.

- Idea: a "suggest reviewers" message type in the chat, visible to the
  editor and assigning editor, with structured names and reasons, which the
  editor can tick off as invited.
- Fit: **High**.
- Source: [Instructions for JCR Associate Editors](https://consumerresearcher.com/instructions-for-jcr-associate-editors), 2026-05-07

### A8. Who can see what is unclear

Journals warn AEs that confidential comments go only to the editor, that the
recommendation must not be hinted at in the AE report, and that trainee
reviewer flags shown on one page do not carry over to the page where the AE
writes the report. A Capterra reviewer complained of "lack of transparency in
the peer review process" and "limited options for sharing reviewer feedback".

- Idea: this is the core of G2's per-message visibility with audience badges.
  The extension can also carry flags across pages (show "Reviewer 2 is a
  trainee" on the recommendation page).
- Fit: **High**.
- Sources:
  - [Instructions for JCR Associate Editors](https://consumerresearcher.com/instructions-for-jcr-associate-editors), 2026-05-07
  - [Capterra review, Assistant Professor](https://www.capterra.com/p/234422/ScholarOne/reviews/), 2023-03-16

### A9. Related submissions are scattered

A reject-and-resubmit gets a new manuscript ID; the original is found under
"Manuscript Information" or "Companion Papers", and following those links
opens only the old PDF rather than its details. Appeals are filed as a
separate "Administrative Communication".

- Idea: the backend links IDs into a lineage; the chat thread follows the
  lineage, and the extension adds a compact "history" strip linking every
  version's details page.
- Fit: **High** once staff link IDs; **Medium** for automatic detection.
- Sources:
  - [IEEE TMI Instructions to AEs](https://ieeetmi.org/aes-instructions/), undated
  - [Instructions for JCR Associate Editors](https://consumerresearcher.com/instructions-for-jcr-associate-editors), 2026-05-07

### A10. Editor availability isn't shared with assigning editors

At JCR, unavailable dates entered in ScholarOne only stop reviewing
invitations; to stop new AE assignments the AE must separately tell the
editorial office.

- Idea: an availability calendar in the backend, shown to assigning editors
  beside AE names and on the dashboard.
- Fit: **High**.
- Source: [Instructions for JCR Associate Editors](https://consumerresearcher.com/instructions-for-jcr-associate-editors), 2026-05-07

### A11. Too much time on administration

Silverchair's research suggests 40–60% of editors' administrative time could
be reclaimed, and editors said core functions such as **search and auto-save**
matter as much as visual updates.

- Idea: auto-save of text typed into Manuscript Central text areas (decision
  letters, comments to authors) to local extension storage, restorable if the
  session expires or the page reloads; a quick-find box that searches the
  manuscripts the user has viewed.
- Fit: **High** for local auto-save and recent-manuscript search.
- Source: [Listening to Editors, Silverchair](https://www.silverchair.com/news/listening-to-editors/), 2026-02-24

### A12. Reporting and analytics are limited

A Capterra reviewer cited "limited options for managing manuscript data and
analytics" for internal and external reporting. At the 2025 Summit,
publishers' strongest AI Lab interest was "advanced editor and admin
analytics". A 2022 comparison noted Editorial Manager's one-click overview by
editor or status and EJPress's folder of chaser emails, neither credited to
ScholarOne.

- Idea: the dashboard (G4) grows into a small analytics page: time to first
  view, time to reviewer assignment, active time per manuscript, AE workload.
- Fit: **High** for data Electric MC collects; **Medium** for data only in
  Manuscript Central.
- Sources:
  - [Capterra review, Assistant Professor](https://www.capterra.com/p/234422/ScholarOne/reviews/), 2023-03-18
  - [ScholarOne Summit 2025 Recap](https://www.silverchair.com/news/scholarone-summit-2025-recap/), 2025-10-27
  - [Features of Four Submission Systems, The Editorial Hub](https://theeditorialhub.com/scholarly-publishing/features-of-four-submission-systems/), 2022-08-05

## B. Everyone who uses the editor pages

### B1. The interface is dated and hard to read

Capterra reviewers call it "clunky and slow", "difficult to navigate,
especially for new users", and say the "interface should have been much
simple". Silverchair itself acknowledged at its 2025 Summit that ScholarOne's
interface "has a reputation as challenging and dated", and says user feedback
repeatedly asks for a "visually intuitive interface".

- Idea: this is G1. Themes, larger type, clearer tables, sticky headers.
- Fit: **High**.
- Sources:
  - [Capterra reviews](https://www.capterra.com/p/234422/ScholarOne/reviews/), 2023-02-22 and 2023-03-18
  - [ScholarOne Summit 2025 Recap](https://www.silverchair.com/news/scholarone-summit-2025-recap/), 2025-10-27
  - [Building with Blueprints, Silverchair](https://www.silverchair.com/news/building-with-blueprints/), 2026-02-12

### B2. Accessibility fixes stopped at the author side

Silverchair's accessibility work (keyboard navigation, screen-reader support,
contrast, 200% zoom) covered only the author submission process; full
remediation of the legacy platform "was not feasible".

- Idea: an accessibility theme (high contrast, larger type, focus outlines)
  and added ARIA labels and keyboard shortcuts on editor pages.
- Fit: **High** for visual fixes, **Medium** for screen-reader fixes.
- Source: [Enhancing Accessibility: From ScholarOne to the Next Generation, Silverchair](https://www.silverchair.com/news/enhancing-accessibility-scholarone/), 2024-12-11

### B3. Pop-up windows

Manuscript Central relies on pop-up windows; journals tell editors to turn
off pop-up blocking. Anand Sarwate's blog post listed this first.

- Idea: the extension opens Manuscript Central pop-ups (letters, reviewer
  details) as tabs or in a docked panel, according to the user's choice.
- Fit: **Medium** (needs testing against how each pop-up is opened).
- Sources:
  - [Manuscript Central is annoying, Anand Sarwate (ergodicity.net)](https://ergodicity.net/2012/04/19/manuscript-central-is-annoying/), 2012-04-19
  - [ACM TOMCCAP editor info](https://tomccap.hosting.acm.org/editor.html), undated

### B4. A separate login for every journal, and duplicate accounts

Editors and reviewers have separate accounts per journal site; duplicates
block reviewer invitations and must be merged by staff. ScholarOne Gateway
(launched 2025-12-10) links an author's or reviewer's accounts within one
publisher, but not across publishers and not for editors yet.

- Idea: one Electric MC sign-in gives an editor a combined "my assignments
  across all journals" view built from the pages the extension sees; a
  duplicate-account warning on invitation pages using emails and ORCID iDs the
  backend has seen.
- Fit: **Medium**.
- Sources:
  - [Manuscript Central is annoying](https://ergodicity.net/2012/04/19/manuscript-central-is-annoying/), 2012-04-19
  - [The Manuscript Submission Mess, Scholarly Kitchen](https://scholarlykitchen.sspnet.org/2015/06/15/the-manuscript-submission-mess-brief-notes-from-a-grumpy-author/), 2015-06-15
  - [How do I merge duplicate user accounts on ScholarOne Manuscripts?, IEEE Support](https://supportcenter.ieee.org/app/answers/detail/a_id/2604/~/how-do-i-merge-duplicate-user-accounts-on-scholarone-manuscripts%3F), undated
  - [IEEE TMI Instructions to AEs](https://ieeetmi.org/aes-instructions/), undated
  - [Silverchair Launches ScholarOne Gateway](https://www.silverchair.com/news/silverchair-launches-scholarone-gateway/), 2025-12-10

## C. Editorial office staff

### C1. Answering author status questions

Publishers at the 2025 Summit named "reducing time spent answering author
questions" as a pain point, along with presubmission checks.

- Idea: canned responses stored per journal, inserted from the extension
  into email or Manuscript Central forms, and a staff view of "manuscripts
  whose authors asked about status" logged in chat.
- Fit: **Medium**.
- Source: [ScholarOne Summit 2025 Recap](https://www.silverchair.com/news/scholarone-summit-2025-recap/), 2025-10-27

### C2. Repetitive data entry and late validation errors

Robert M. Kaplan (former editor in chief of two journals) argued that
ScholarOne-style portals make authors re-enter titles, abstracts, and
affiliations, and enforce trivial formatting before any editor reads the
paper. Enago documents ScholarOne raising required-field and PDF-build errors
only at the final step.

- Idea: mostly author-side and out of scope. For staff, a checklist overlay
  that shows a manuscript's missing items early, so staff can return it in one
  message rather than several.
- Fit: **Low**.
- Sources:
  - [The Academic Publishing System's Most Pointless Bottleneck, Robert M. Kaplan, Academe Blog](https://academeblog.org/2026/03/13/the-academic-publishing-systems-most-pointless-bottleneck/), 2026-03-13
  - [Editorial Manager and ScholarOne: Troubleshooting Common Submission Portal Glitches and Errors, Enago](https://www.enago.com/articles/editorial-manager-vs-scholarone-submission-errors/), 2026-02-23

## D. Reviewers

### D1. Watermarked PDFs and PDF review attachments

Sarwate's post and its comments said the "For Peer Review Only" watermark
interferes with PDF annotation, and that PDF reviews uploaded by reviewers
keep their original file names (an anonymity risk) or sometimes fail to
register.

- Idea: an extension cannot change the PDFs Manuscript Central generates. It
  could warn a reviewer whose upload file name contains their own name.
- Fit: **Low**.
- Source: [Manuscript Central is annoying](https://ergodicity.net/2012/04/19/manuscript-central-is-annoying/), 2012-04-19 (post and comments)

### D2. Reviewers new to the system lose time learning it

A Capterra reviewer noted that reviewers unfamiliar with ScholarOne may need
extra time, which slows reviews.

- Idea: for reviewers who install the extension, a guided overlay on the
  review form and a reviewer-visible chat with the handling AE for
  clarification questions (G2 with "Reviewers" visibility).
- Fit: **Medium** (depends on reviewers installing the extension).
- Source: [Capterra review, Assistant Professor](https://www.capterra.com/p/234422/ScholarOne/reviews/), 2023-03-09

---

## Notes on the search

- No public bug tracker, user forum, or subreddit dedicated to Manuscript
  Central turned up. Most complaints are in vendor-review sites, journal
  instructions for editors (which describe workarounds), the Scholarly
  Kitchen, and personal blogs. See [publicity.md](publicity.md).
- No existing Chrome extension or userscript for Manuscript Central turned up
  in searches of the web and GitHub, so Electric MC appears to have no direct
  prior art.
- Several complaints (status tracking, editor dashboards, reviewer matching,
  collaboration) are on Silverchair's 2026 roadmap. See
  [ScholarOne release history.md](ScholarOne%20release%20history.md) for what
  that means for Electric MC.
