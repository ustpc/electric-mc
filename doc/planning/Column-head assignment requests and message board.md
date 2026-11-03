# Column-head assignment requests, message board, and AE last-seen

Status: requirements, 2026-11-03 (Simson, after a discussion with the other
Opinions co-chair). Issues: see section 7. Related: issue #29 (the
"Reassign to AE" picker), #30 (sections and section assignments), the notes
server in `backend/notes` (identities and keys), [Email
ingestion.md](Email%20ingestion.md), and [Technical Stack and
Architecture.md](Technical%20Stack%20and%20Architecture.md) section 5.5.

## 1. The problem

In the Opinions section, a new submission on topic X goes to the **column
head** for X. The column head then does one of three things:

1. a rapid reject (sets the number of reviewers to 0 and enters a
   recommendation);
2. assigns reviewers themselves; or
3. hands the paper to another AE.

Column heads are AEs in Manuscript Central, and an AE can't assign a
manuscript to another AE. So for (3) the column head emails a co-chair or the
editorial staff, who do the assignment by hand. Those emails get lost, nobody
can see what is waiting, and the column head isn't told when it's done.

Options 1 and 2 already work in MC and are out of scope.

When the publisher grants ScholarOne API access (`makeEditorAssignment`,
Design Goals open question 6), Electric MC could make the assignment itself.
Until then it keeps a **queue of the assignments column heads would make if
they could**, which someone with the privilege works through.

## 2. Does Manuscript Central have a message board?

No, not one for individual users. As far as Electric MC has seen:

- MC talks to people by **email only**. Each manuscript's history lists the
  letters sent about it, but there is no inbox, newsfeed, or unread count
  inside MC.
- Administrators can put **announcement text** on a site's pages, which is
  the same for everyone and isn't tracked as read or unread.
- ScholarOne's **manuscript notes** belong to one manuscript and are read
  only by people who open that manuscript.
- The editor dashboard shows queue counts, not messages.

So Electric MC needs its own board (section 4).

## 3. Assignment requests (the task queue)

### 3.1 Roles

- **Column head**: an AE who heads a section of the journal. Section and
  column-head membership come from issue #30. Until #30 lands, the server
  reads a `COLUMN_HEADS` list of MC emails, like `OWNERS` and `MODERATORS`.
- **Assigner**: someone with MC privileges to assign AEs: the co-chairs and
  the editorial staff (three people today). A new `ASSIGNERS` list of MC
  emails; later a journal role `ASSIGNER` in the static configuration
  (Design Goals section 3).
- Every assigner can also make a request (a co-chair may want a colleague
  to do the clicking).

### 3.2 What a column head can do

- **Request an AE assignment** for a manuscript they are handling. In the
  side panel, and in the "Reassign to AE" section of issue #29, they pick an
  AE from the list of AEs in their section (with each AE's current load and
  last-seen date, section 5) and may add a short note for the assigner
  (500 characters at most).
- **Request a different journal action later.** The task has a `kind` so
  other "I would do this if I could" actions can be added (for example
  "unassign me", "extend a due date"). Only `ASSIGN_AE` is built first.
- **See their open requests** and **cancel** one that hasn't been done.
- Get a **board message** when the request is done, declined, or done
  differently (section 3.5).

One open `ASSIGN_AE` task per manuscript. A second request for the same
manuscript replaces the first, and the board tells the earlier requester.

### 3.3 What an assigner sees

- An **Assignment queue** tab in the side panel (and later a dashboard page),
  oldest first, showing for each task: the manuscript ID (the title comes
  from the assigner's own local data when they have seen the paper; the
  server never stores titles), the requester, the requested AE and their
  current load, the note, and the age of the request.
- A count badge on the toolbar icon while any task is open.
- Each task links straight to the manuscript's AE-assignment page in MC.
- **Claim** (so two assigners don't both do it; a claim lapses after 24
  hours), **Mark done**, and **Decline** with a reason, which goes to the
  requester's board.
- Tasks older than 2 business days raise an overdue alert (Design Goals 9.4)
  and appear in the daily digest email, which for now goes only to Simson
  (Privacy Policy section 9).

### 3.4 When a task is done

A task leaves the table when the assignment has happened. The board message
and the history item (section 3.6) are the record of it. Completion is
detected three ways, in order of trust:

1. **Assignment email** (preferred): the ingestion Lambda sees "now in your
   Associate Editor Center" (Email ingestion catalog row 3) for the
   manuscript. If it went to the requested AE, the task is done. If it went
   to someone else, the task is closed as "assigned to another AE" and the
   requester is told who.
2. **What an assigner's extension sees**: after the assigner submits MC's
   assign-AE form, the confirmation page shows the new AE. The extension
   then marks the task done on the assigner's behalf. This is accepted
   because only assigners can mark tasks done.
3. **Mark done** by hand.

The manuscript reaching a final decision (catalog rows 7 and 9) cancels any
open task on it.

### 3.5 Board messages a task produces

| Event | To |
|-------|----|
| Request made | every assigner (also counted on the badge) |
| Done as requested | the requester |
| Done, but to a different AE | the requester |
| Declined, with reason | the requester |
| Replaced by a newer request | the earlier requester |
| Cancelled by the requester | the assigner who claimed it, if any |
| Overdue | every assigner |

The newly assigned AE learns of the paper from MC's own email, as now.

### 3.6 Storage

In the notes server's table first (one on-demand table, never provisioned
capacity, account 075439264285, us-east-2), and in the main `electric-mc`
table when that exists.

| Item | pk | sk | Attributes |
|------|----|----|------------|
| Task | `task#<journal>` | `<createdAt>#<baseId>` | `kind`, `m` (base ID), `rev`, `requester` (email), `targetAe` (email and MC person ID), `note`, `claimedBy`, `claimedAt` |
| Task by manuscript | `m#<baseId>` | `task` | pointer to the task's sort key, to enforce one open task per manuscript and to find it from an assignment email |
| Task history | `m#<baseId>` | `taskhist#<ts>` | `kind`, `requester`, `targetAe`, `outcome` (`DONE`, `DONE_OTHER_AE`, `DECLINED`, `CANCELLED`, `REPLACED`), `by`, `reason`; TTL 2 years |

Listing the queue is one `Query` on `task#<journal>`, a few read units.
Removing a task is a transactional delete of the task and its pointer plus
the history put.

The request carries the manuscript ID and title hash like a note `put`
(`backend/notes/README.md`), so only someone who has seen the paper can file
one. The server checks that the requester is a column head or assigner; it
does not yet check that they are the paper's handling AE (that waits for
email-ingested roles, Technical Stack 5.5).

### 3.7 Not in scope

- Doing the assignment through the ScholarOne API (later, when granted).
- Rapid reject and reviewer assignment, which column heads can already do.

## 4. Message board

### 4.1 What it is

A per-person list of short messages from Electric MC and from people:
task outcomes (section 3.5), alerts (Design Goals 9.4), and messages a
co-chair or staff member posts to one person, a section's AEs, or every AE.
It is shown in a **Board** tab in the side panel, with an unseen count on the
tab and the toolbar badge.

### 4.2 Seen and unseen

- Every message starts **unseen**. Unseen messages are listed first, newest
  first, with the count on the badge.
- A message becomes **seen** when it has been on screen in the Board tab for
  2 seconds, or when the person clicks **Mark all seen**. Seen messages drop
  out of the default view.
- Seen is per person, not per browser: reading on one computer clears the
  count on the others.

### 4.3 Looking back

- **Show earlier messages** opens the seen messages grouped by week: this
  week, last week, 2 weeks ago, and so on back to **8 weeks** (2 months).
  Each week loads on request.
- A **search box** filters the loaded weeks by text, sender, manuscript ID,
  and kind (task, alert, message).
- Messages older than 2 months aren't shown, though they are kept until the
  purge (section 4.4).

### 4.4 Retention

A message is **purged once it has been seen and is more than 6 months
old**. When a message is marked seen, the server sets its DynamoDB TTL to
the later of (created + 6 months) and now; TTL deletion is free. Unseen
messages are not purged; a message still unseen after 6 months appears in
the daily digest, and after 12 months it is purged anyway.

### 4.5 Content rules

- A message names a manuscript by its **ID only**. The extension shows the
  title from the reader's own local data, so titles never reach the server
  (as with notes).
- Text is capped at 1 KB, and never contains email bodies, reviews, or
  author names.
- People can post only to people in their journal; only assigners and
  co-chairs can post to a group.

### 4.6 Storage

| Item | pk | sk | Attributes |
|------|----|----|------------|
| Message | `board#<email>` | `<createdAt>#<ulid>` | `kind`, `from`, `m` (optional), `text`, `seenAt`, `expiresAt` |
| Unseen marker | `unseen#<email>` | `<createdAt>#<ulid>` | none; deleted when seen |
| Board head | `board#<email>` | `head` | `version`, bumped on every new message or seen change |

- The side panel polls the board head (one eventually consistent `GetItem`,
  half a read unit), as chat does, and loads messages only when the version
  changes.
- The unseen count is a `Query` with `Select=COUNT` on `unseen#<email>`.
- A week is a `Query` on `board#<email>` with a sort-key range.
- A group post writes one message per recipient (a few dozen writes), in
  batches.

The board is keyed by MC email, not by browser key, so all of a person's
keys (one per browser profile) share one board.

## 5. AE last-seen

### 5.1 Does MC show it?

Not to editors. MC's AE pull-down shows a count of manuscripts per AE, but
not when an AE last logged in or worked. An MC administrator may be able to
see account activity in the Admin Center; that is unconfirmed and isn't
something a column head or co-chair can see while assigning.

### 5.2 What Electric MC records

Two signals, shown side by side in the AE picker (issue #29), the editorial
matrix, and the AE workload view (Design Goals 9.1a):

1. **Last action seen in MC email** (needs no extension): the date of the
   most recent ingested event that the AE caused, such as reviewers invited
   or a recommendation submitted on one of their papers. It comes from email
   the co-chair mailbox already receives.
2. **Last seen in MC** (needs the extension): the **date** (not the time)
   the AE last loaded any MC page while logged in, sent once a day at most.
   This is activity tracking (Design Goals section 7), so it follows the
   same consent rule: off unless the AE turns it on (open question 1).

Both are visible only to assigners, co-chairs, and column heads, and to the
AE themselves. Only the latest date is kept; there is no history.

| Item | pk | sk | Attributes |
|------|----|----|------------|
| Last seen | `person#<email>` | `lastseen#<journal>` | `seenDate`, `lastActionDate`, `lastActionKind` |

## 6. Open questions

1. **Last-seen consent.** Recommended: the email-derived "last action" for
   everyone, and the extension's "last seen in MC" date only for AEs who turn
   it on. Alternative: on by default for AEs, with a notice and a switch to
   turn it off.
2. Should messages between 2 and 6 months old be searchable, or only kept?
   Default: only kept.
3. Should a column head's request also be able to name a second-choice AE?

## 7. Issues

- Column-head AE assignment requests: task queue for assigners.
- Assigner queue in the side panel, and completion detection.
- Message board with unseen tracking, weekly history, and purge.
- AE last-seen and last-action dates.
- Issue #29 (the picker) and #30 (sections) are prerequisites.
