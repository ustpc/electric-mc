# Electric MC notes server

A Rust AWS Lambda behind a public function URL, with one on-demand DynamoDB
table. It stores authored notes on manuscripts for the extension
(`extension/lib/notesClient.ts`). Issue: [#28](https://github.com/ustpc/electric-mc/issues/28).

## Protocol

Every request is a `POST` with a `text/plain` JSON body:

```json
{ "key": "<key ID>", "payload": "<JSON string>", "sig": "<base64>", "spki": "<base64, register only>" }
```

`sig` is an ECDSA P-256 / SHA-256 signature (WebCrypto's 64-byte r||s) of
the exact `payload` string. The payload always has `op` and `ts` (seconds
since 1970, within 5 minutes of the server's clock).

| op | payload | who |
|----|---------|-----|
| `register` | `email`, `label`, `mcName`, `personId`, `role`, `journal` | anyone, once per browser key |
| `list` | `m`, `h` | any registered key |
| `put` | `m`, `h`, `t`, `text` | any registered key; the author is the key's email |
| `delete` | `m`, `h`, `t`, `email` | the note's author (any of their keys), moderators, owners |
| `ban` / `unban` | `key` or `email` | owners |
| `keys` | | owners: every registered key, and whether it is banned |

- **Keys.** A key's ID is the first 32 hex digits of SHA-256 of its public
  key. The first upload of a key is taken as legitimate, and a key stays
  with the email it was first registered for. One email may have many keys
  (one per browser profile). Registering the same key again updates its name.
- **Notes.** A note is (`m` base manuscript ID, `t` session start, author
  email, text). A `put` with the same `m`, `t` and author overwrites the
  note: that is how edits arrive.
- **Titles.** `h` is SHA-256 of the normalized title (lower case, straight
  quotes, single spaces; `normalizeTitle` in `extension/lib/notes.ts`). The
  first `h` seen for a manuscript is kept as HMAC-SHA256(`NOTES_SECRET`,
  `m|h`), and later requests must match. A moderator's request with a new
  `h` adds it (a revision may change the title). The title is never sent.
- **Bans** cover a key or an email. A banned key can't register again.

Not yet: the owner approving identities, and limiting who can read a
manuscript's notes to the editors assigned to it. Until then anyone with a
registered key who knows a paper's ID and title can read its notes.

## Table

One table, `pk` and `sk` strings, `PAY_PER_REQUEST` (never provisioned
capacity). Layout in [src/dynamo.rs](src/dynamo.rs).

## Configuration

| variable | |
|----------|-|
| `NOTES_TABLE` | table name (default `emc-notes`) |
| `NOTES_SECRET` | HMAC key for title hashes, 32+ characters; made by the first deploy and kept after |
| `OWNERS` | comma-separated MC emails that can ban keys and delete any note |
| `MODERATORS` | comma-separated MC emails (co-chairs, EIC) that can delete any note |

## Develop

```sh
make notes-test                              # from the repository root; no AWS needed
cargo run --example local                    # in-memory server on http://127.0.0.1:8787/
```

Set **Settings > Notes server** in the side panel to the local address to
try it with the extension.

## Deploy (from the Mac)

Needs the AWS CLI signed in to account 075439264285 (region us-east-2) and
[cargo-lambda](https://www.cargo-lambda.info/) (`brew install cargo-lambda/tap/cargo-lambda`).

```sh
OWNERS=you@example.org MODERATORS=chair@example.org,eic@example.org make notes-deploy
```

It builds the arm64 zip, creates or updates the table, a role that can use
only that table, the function (`provided.al2023`, 128 MB), and its public
URL with CORS open to any origin (requests are authenticated by their
signatures, not by origin). It prints the URL to paste into Settings. Run it
again to update the code or the email lists; the secret is kept.
