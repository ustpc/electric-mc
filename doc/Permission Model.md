# Electric MC Permission Model

Who can see what in Electric MC (E-MC), and how each rule is enforced.
Started 2026-11-24, at extension 0.0.100. Keep it current: any change to
who can see something, or to how that is enforced, is recorded here in the
same pull request, with what the change means for privacy in the
[Privacy Policy](Privacy%20Policy.md).

## 1. The rule

**E-MC never shows anyone information they could not already see in
Manuscript Central (MC), unless this document names the role that may see
it and says how that is enforced.**

Today every piece of manuscript data E-MC shows was read from an MC page
that the same person opened, in the same browser, and is kept only in that
browser (`chrome.storage.local`). So MC enforces the rule for us: an
Associate Editor's browser has only seen that AE's own manuscripts, because
MC showed them nothing else. Nothing about a manuscript goes to any server.

That stops being enough the moment a server holds data that one person
gathered and another person reads. From then on, every such item needs a
role that may see it and a server check that enforces it (section 5).

## 2. Roles

| Role | Who | Notes |
|---|---|---|
| EIC | Editor-in-Chief, Deputy EIC | Sees everything a co-chair sees. |
| Co-chair | The section's co-chairs (Opinion Co-Chair) | Assigns AEs; administers E-MC for the section. |
| Column head | Heads of each column | Take assignments like AEs. |
| Associate Editor (AE) | The section's AEs | See their own manuscripts. |
| Staff | Journal staff with MC admin rights | Same as co-chair for what they can see in MC; nothing more from the server unless named below. |
| Columnist | Columnists | Take no assignments. Nothing from the server. |
| Authors, reviewers | Everyone else | Never users of E-MC data. |

A person's role comes from MC (what MC shows them) or, for anything served
by a server, from the signed team roster held by the co-chair (section 5).
**Roles the extension reads from MC pages are never trusted by a server to
grant access**; they are only hints.

## 3. What each role can see

"Local" means kept only in the browser that read it; "MC" means MC already
shows it to that person.

| Data | Where it is kept | EIC & co-chairs | Column heads & AEs | How it is enforced |
|---|---|---|---|---|
| Manuscripts seen: IDs, titles, status, handling AE per version (`seen`) | Local | What they opened in MC | What they opened in MC | MC: only pages the person could open |
| **Team assignments**: each editor's manuscripts, with IDs and titles (Team window, People tab, 0.0.100) | Local, built from `seen` | Yes | **No** (see below) | Today MC. Never served to AEs by any server |
| AE workloads (count per editor, from MC's Assign AE pull-down) | Local | Yes | No | MC shows that pull-down only to those who assign |
| Team database: names, MC emails, roles, sections, expertise, notes, photos | Local; a team file the person saves | Yes | Only if a co-chair gives them a file | The person who holds the file decides; holds no assignments |
| To EIC list, flag labels, MC roles, logged-in identity | Local | Own | Own | Local only |
| AE menu config | Local; a server store is planned | Yes | Yes (layout only) | Planned: anyone may list and download; only the admin's signed config is saved |
| Manuscript notes | Local; or the notes server if one is set | All | Notes on manuscripts assigned to them | Planned server ACL (section 5; Privacy Policy 5.2) |
| Chat | Notes server (planned) | Per thread setting | Per thread setting | Server ACL (planned) |

**Team assignments are for the EIC and co-chairs only.** An AE who installs
E-MC and opens the Team window sees only the manuscripts their own browser
has seen, which are their own: the same thing MC shows them. The team
assignments list is never part of the team file (Save team file writes the
team database only), and no server may ever serve it, or any part of it, to
an AE, a column head, a columnist or staff.

The list is built slowly. E-MC does not yet see every manuscript's AE and
title; it remembers each assignment it sees (from a manuscript's details
page) and the list grows as the co-chair works in MC. A manuscript whose
title E-MC hasn't seen is listed by ID alone. When MC's count for an editor
is higher than the manuscripts E-MC knows of, the Team window says so.

## 4. How it is enforced today

1. **The source is MC.** E-MC reads only pages the person opens in MC; it
   never fetches MC pages in the background (that logged people out, and it
   would let E-MC read what the person didn't open).
2. **Local storage only.** Manuscript data stays in `chrome.storage.local`
   in that browser. Settings sync through the Chrome profile but hold no
   manuscript data. Clear all data removes everything.
3. **No manuscript data to any server or AI service.** See the Privacy
   Policy, sections 3 and 8. Notes, when a notes server is set, send a hash
   of the title, never the title.
4. **Files are the person's choice.** A team file goes where the person
   saves it, and carries no assignments, titles or manuscript IDs.

## 5. Rules for anything a server serves

These apply to the notes server and to every future store (team, AE menu,
assignments, email ingestion):

1. **Deny by default.** A request gets only what this document grants its
   role.
2. **Identity is verified, not claimed.** A sign-in is bound to a person by
   verifying the email address MC uses for them (Privacy Policy 5.2), or by
   a key on the co-chair's signed roster.
3. **Roles come from the signed roster or from MC's assignment emails**,
   never from what an extension reports it saw on a page.
4. **Assignment data is EIC and co-chair only.** Lists of who handles which
   manuscript, titles, and workloads are served only to callers whose
   verified role is EIC or co-chair. An AE asking for them gets nothing,
   not an empty list that reveals the data exists.
5. **Every check is on the server**, on every request (a Lambda check), and
   tested: each new endpoint ships with a test that an AE's credentials are
   refused.
6. **The co-chair can grant and revoke** by hand, and every grant is logged.
7. **After an assignment ends**, an AE keeps read access to notes posted
   while they were assigned and sees nothing posted afterward
   (decided 2026-10-23).

## 6. Open questions

- How the EIC and Deputy EIC are verified on the server: on the co-chair's
  signed roster, or by an email allowlist.
- Whether staff (who can see everything in MC) get the team assignments.
- Whether the assignments list should move to the server at all, or stay
  local in each co-chair's browser and be shared only through a file between
  co-chairs.

## 7. Related documents

- [Privacy Policy](Privacy%20Policy.md): what is collected and kept, and
  section 5.2, who can see manuscript notes.
- [Technical Stack and Architecture](planning/Technical%20Stack%20and%20Architecture.md),
  section 5.5: the note-access design.
- [End-to-end note encryption](planning/End-to-end%20note%20encryption.md):
  the encrypted alternative to a trusted server.

## 8. Change log

| Date | Change |
|---|---|
| 2026-11-24 | First version: the rule, roles, what each role can see, today's enforcement (MC plus local storage), rules for any server, and that team assignments are EIC and co-chair only (extension 0.0.100). |
