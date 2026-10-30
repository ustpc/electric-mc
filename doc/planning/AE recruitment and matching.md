# Electric MC: AE Recruitment and Manuscript Matching

Status: draft, 2026-10-18. Requested by Simson in the project thread. What
this means for users' data is in [Privacy Policy.md](../Privacy%20Policy.md).

Related documents: [Design Goals.md](Design%20Goals.md),
[Technical Stack and Architecture.md](Technical%20Stack%20and%20Architecture.md),
[Email ingestion.md](Email%20ingestion.md).

## 1. What this adds

1. **AE recruitment tracking.** A list of people the journal has approached
   about becoming an associate editor, where each one stands, reminders to
   follow up, and how it ended.
2. **Expertise matching.** For each manuscript, a ranked list of AEs who suit
   it. For each prospective AE, the open manuscripts that suit them, so the
   invitation can show titles of papers they would handle.

Decision (Simson, 2026-10-18): build this into Electric MC rather than use a
recruitment platform. Hiring tools such as Greenhouse or Lever are built for
employees, charge per seat, and can't see the manuscript stream that makes
the matching useful.

## 2. Recruitment tracking

### 2.1 Pipeline

Each prospect moves through these states:

| State | Meaning | Next reminder |
|-------|---------|---------------|
| `IDENTIFIED` | Someone suggested this person | 7 days after creation: "send the first invitation" |
| `CONTACTED` | Invitation sent (`contactedAt`) | 14 days after contact: "follow up" |
| `FOLLOWED_UP` | Second message sent | 14 days after follow-up: "close or try again" |
| `ACCEPTED` | Said yes. Staff then add them as an AE through the admin loader | none |
| `DECLINED` | Said no | none |
| `NO_RESPONSE` | Closed without an answer | none |
| `ON_HOLD` | Paused on purpose (for example, "ask again next year"), with an optional `revisitAt` | on `revisitAt` |

Intervals are per-journal settings in the journal's `CONFIG` item
(`recruitIntervals`). Every state change is recorded with who made it and when.

### 2.2 Reminders

Reminders reuse the daily scheduled check that already raises overdue alerts
(Design Goals 9.4). It runs once a day from EventBridge Scheduler. It queries
the prospects whose `nextActionAt` has passed and sends **one digest email**
through SES listing them. It also raises an alert in the dashboard and side
panel.

**Every reminder goes to Simson only** (Simson, 2026-10-18). Each prospect has
an `owner`, the staff member responsible for them, but until the system has
earned trust, mail meant for an owner goes to Simson with the owner named in
the line. A journal setting `reminderRecipients` (default: `co-chair-only`)
will later switch delivery to `owner`.

Cost: one scheduled invocation a day and at most one email a day per journal,
well within the free tier for Lambda and EventBridge Scheduler. SES charges
a small amount per message, which is negligible at this volume.

### 2.3 Where prospects come from

- Entered by hand in the dashboard (name, email, ORCID iD, affiliation, who
  suggested them, a short note).
- From the matching view: "people whose work fits manuscripts that have no
  good AE". This uses the reviewer and author pool the journal already
  knows about. It also takes public profiles the co-chair adds (section 3.2).

The invitation itself is sent by a person from their own email for now.
Electric MC drafts it (section 4) but doesn't send it.

### 2.4 Schema additions

| Item | PK | SK | Main attributes |
|------|----|----|-----------------|
| Prospect | `JOURNAL#<site>` | `PROSPECT#<ulid>` | `name`, `email`, `orcid`, `dblpPid`, `scholarId`, `affiliation`, `suggestedBy`, `owner`, `state`, `stateChangedAt`, `nextActionAt`, `note` (max 1 KB), `expiresAt` (set when closed; section 5); also `GSI4PK`, `GSI4SK` |
| Prospect history | `JOURNAL#<site>` | `PROSPECTHIST#<ulid>#<ts>` | `actor`, `from`, `to`, `note` |
| Expertise profile | `PERSON#<sub>` or `JOURNAL#<site>` | `EXPERTISE` or `EXPERTISE#<prospectUlid>` | `model` (embedding model ID and version), `vector` (binary, 384 × int8), `sources` (list of URLs), `paperCount`, `builtAt` |
| Manuscript vector | `MS#<site>#<baseId>` | `VECTOR` | `model`, `vector`, `builtAt` |

| Index | Partition key | Sort key | Used for |
|-------|---------------|----------|----------|
| `GSI4` | `GSI4PK` = `RECRUIT#<site>` | `GSI4SK` = `<nextActionAt>#<ulid>` | The daily reminder query and the recruitment page, soonest action first. Sparse: closed prospects drop the keys. |

The prospect list is one `Query` on `PK = JOURNAL#<site>`, `SK` begins with
`PROSPECT#`: a few read units, on demand, no provisioned capacity.

## 3. Expertise matching with vectors, without an LLM

### 3.1 Approach

Matching needs no LLM and no vector database.

1. Turn each manuscript's **title and abstract** into an embedding vector
   with a small sentence-embedding model.
2. Turn each AE's or prospect's **publication titles and abstracts** into
   vectors, and combine them into one profile vector. The combination is the
   mean, weighted toward recent papers: weight `0.5^(age_years / 5)`.
   The profile also keeps up to 20 recent paper vectors for "max-sim"
   scoring, so a broad AE still matches a niche paper.
3. Score each pair with cosine similarity:
   `score = 0.6 · cos(ms, profile) + 0.4 · max_i cos(ms, paper_i)`.
4. Adjust for load and conflicts. Exclude anyone who is an author of the
   manuscript, shares an affiliation with an author, or has a known
   co-authorship with an author in the last 5 years (from DBLP). Show the
   AE's current workload (from `GSI3`) next to the score, without folding it
   into the score. The co-chair decides.

A journal has at most a few hundred AEs and prospects and a few hundred open
manuscripts. Scoring every pair is under 100,000 dot products of 384
numbers, which takes milliseconds in the browser. A flat array is enough.

### 3.2 Where expertise comes from

| Source | How we read it | Notes |
|--------|----------------|-------|
| **DBLP** | Public API by person ID (`pid`): titles, venues, years, co-authors | Free and open. No abstracts, so titles carry the match. Also gives co-authors for conflict checks. |
| **ORCID** | Public API (`pub.orcid.org`) by iD: works with titles and DOIs | Free and needs no key for public data. Gives DOIs to look up abstracts. |
| **OpenAlex** | Public API by DOI or ORCID: titles and abstracts | Free and open. Fills in the abstracts that DBLP and ORCID lack. |
| **Google Scholar** | Read only when the co-chair opens the person's Scholar profile page with the extension installed. The extension then offers "use this profile" | Google Scholar has no API, and automated fetching breaks its terms, so Electric MC never fetches it on its own. |
| Past assignments | Manuscripts the AE handled for this journal | Titles only, from our own data. |

All of these are public data about the person's published work, except past
assignments.

### 3.3 Where the computation runs

Everything runs **in the extension, on the user's device**.

- The model is a small open sentence-embedding model (default
  `bge-small-en-v1.5`, 384 dimensions, about 35 MB quantized). It runs with
  Transformers.js on WebGPU, falling back to WASM. It is **bundled with the
  extension**, not downloaded at run time, which keeps to MV3's no-remote-code
  rule. MV3 allows WASM through the `wasm-unsafe-eval` CSP setting.
- Embeddings run in an offscreen document, so pages stay responsive.
- **Manuscript vectors** are computed when someone with access opens the
  manuscript in Manuscript Central, from the title and abstract on that page.
  The vector is stored in our backend (`MS#…/VECTOR`), under the same access
  rules as the manuscript title. The abstract text itself is never stored.
- **Expertise vectors** are computed in the co-chair's extension from the
  public sources above and stored in our backend, so every editor's
  extension shares them.
- Every vector records the model ID. Changing the model means recomputing
  all vectors, which the extension does in the background.

No manuscript text, title, abstract or vector is ever sent to a third-party
service. The ACM peer review policy forbids uploading confidential
submissions, authors' technical approaches, or information about authors
into third-party systems, including LLMs, that do not promise
confidentiality ([ACM Peer Review Policy](https://www.acm.org/publications/policies/peer-review),
item 1). Our own backend runs in the journal's AWS account under the
journal's control, and is held to the same rules as the manuscript data it
already stores.

### 3.4 Showing manuscripts to prospective AEs

The matching view lists, for each prospect, the open manuscripts that fit
them best. The invitation draft can include **titles only**: no manuscript
IDs, author names, abstracts or status.

Decision (Simson, 2026-10-18): assume this is allowed, but make it a switch.
The journal setting `showTitlesToProspects` (default `true`) controls it.
When it's off, drafts describe the topic areas instead ("submissions on
differential privacy and census data").

Caution: ACM policy item 1 says submissions may not be disclosed outside
authorized reviewers. A title shown to someone who hasn't yet agreed to
serve may count as a disclosure. Each draft is reviewed by a person before
it's sent, and the switch exists so a journal can turn this off.

## 4. Where an LLM is used, and where it isn't

Matching, ranking, conflict checks, reminders and the recruitment pipeline
use **no LLM**.

An LLM is optional and only for writing help: drafting an invitation from a
template, or a one-line "why this match" note. Rules:

1. **On-device only.** The extension uses Chrome's built-in on-device model
   (Gemini Nano through the Prompt API) where the machine supports it. When
   it isn't available, the feature is simply absent, and the plain template
   is used.
2. **No server-side LLM for anything that touches a manuscript or its
   authors.** This follows the ACM policy above. A server-side LLM (Gemini,
   Claude or OpenAI) could later be used only for text with no manuscript
   or author information, for example polishing a template. It would have to
   sit behind a per-journal switch (`serverLlm`, default off) and a monthly
   spending cap kept in DynamoDB. The Lambda would refuse calls once the cap
   is reached.
3. **Apple Intelligence** (the Foundation Models framework) can only be called
   from Swift. Using it would need a small Mac helper app that talks to the
   extension through Chrome native messaging, and it would only work on Macs.
   It's a possible later option, not part of the first build.

## 5. Retention

- Accepted prospects become people (Design Goals 3). Their prospect record is
  kept as history.
- Declined and no-response prospects are kept for 2 years after closing
  (`expiresAt`, deleted by DynamoDB TTL at no cost), so the journal doesn't
  ask the same person twice in a short time. Staff can delete one at any time.
- Expertise profiles of prospects are deleted with the prospect record.
  Manuscript vectors are deleted when the manuscript record is.

## 6. Milestone

This fits after M4 (dashboard) as **M5 – Recruitment and matching**:

1. Prospect schema, dashboard pages and the daily digest to Simson.
2. Bundled embedding model and the manuscript vector capture.
3. DBLP, ORCID and OpenAlex profile builder, and the Scholar "use this
   profile" button.
4. Matching view (manuscript → AEs, prospect → manuscripts) with conflict
   checks.
5. Invitation drafts, with on-device LLM help where available.
