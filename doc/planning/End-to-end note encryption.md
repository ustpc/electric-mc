# End-to-end note encryption

Status: design, agreed in discussion with Simson between 2026-10-29 and 2026-10-31. Not built. Nothing here may be implemented before Simson reviews it.

## 1. Goal

Electric MC will be used by more than one ACM publication. Whoever runs the Electric MC server (today, Simson) must not be able to read the notes and discussions of a publication or manuscript he is not entitled to read. A breach of the AWS account must not reveal note text either.

Notes are therefore encrypted and signed in the browser. The server stores only ciphertext and the information needed to route it. Notes can only be decrypted by each person using information stored in their browser.



## 2. Threat model: trustworthy but curious

- **Assumed secure:** each user's own computer and browser profile.
- **Trusted:** editors, reviewers and staff. They follow the rules, but may look at whatever they can reach.
- **Threats addressed:**
  - Someone installs the extension from the Chrome Web Store and tries to reach notes they are not entitled to, for example by typing another person's email address or calling the server directly.
  - The operator, or anyone with access to the AWS account, reading DynamoDB, logs or backups.
  - A bug in the server's access checks returning the wrong rows.
  - The server forging, altering or re-attributing a note. Every note is signed by its author.
- **Out of scope:**
  - Malware on a user's computer.
  - A malicious extension release. The operator also publishes the extension, so a release could copy plaintext out of the browser. Encryption turns "read the database" into "publish a visibly malicious release", which goes through Chrome Web Store review and a public repository. A publication that wants more can build the extension from source.
  - Someone entitled to read a note copying it elsewhere. Deletion is best effort.
  - Metadata (section 11).

## 3. Cryptography: OpenPGP through OpenPGP.js

We use the OpenPGP standard (RFC 9580, what GnuPG implements) through **OpenPGP.js** v6, maintained by Proton and independently audited. It gives us, with no new cryptographic code:

- Ed25519 signing keys and X25519 encryption keys.
- Multi-recipient messages: one encrypted body, plus one small key packet per recipient key.
- Session-key operations, so a message can be re-encrypted for a new reader by adding one key packet, without touching the body (section 8).
- Signatures, and passphrase protection of private keys.

Not used: keyservers, the web of trust, or people's existing GPG keys. The
GnuPG program cannot run inside an extension, but keys and messages are
standard OpenPGP, so they can be read with `gpg` when needed. Simson's root
key (section 5) lives in his local `gpg`.

Notes to carry into the build:

- OpenPGP.js adds a few hundred KB. Load it only when notes are opened.
- Its license is LGPL-3.0. That is fine for an open-source extension and
  should be credited in the store listing.

## 4. Configuration: Publications, roles and departments

One Electric MC system serves several publications. Each publication
(for example CACM, or another ACM journal with its own EIC) has its own
**tree**.

Each person in a tree has:

| Field | Values |
|---|---|
| Email | The address MC uses for them. A person with several MC accounts (personal and shared) appears once per email. We verify Emails by sending a magic link, which is then validated by the server running on AWS Lambda. |
| Name | Display name |
| Role | The tree defines roles in a hierarchical order. CACM uses the roles **Admin**, **EIC**, **CoChair** and **AE**. The tree records each user's highest role; users can also assume roles beneath their current role (e.g. a CoChair can also be an AE or a Reviewer) |
| Department | The tree defines departments. Each user can be in one department. CACM uses the departments **Opinion**, **Practice**, **Research and Advances**, **News** and **all**, the special department that includes all departments. |

**Reviewers** are not in the tree. The handling AE adds them to a single
manuscript, usually by typing their email address rather than picking them
from MC's reviewer list. 

It is a configuration option whether or not reviewers can see each other's names and notes.

Each publication also lists its **admin** email(s), who receive a copy of
key approval emails (section 6).



## 5. The roster and the root key

- The trees live in **DynamoDB** as JSON, one document per publication.
- Simson maintains them on his Mac with:
  - **command-line programs** to list, add, change and remove people;
  - a **local GUI**: a small Python program (standard library plus `boto3`)
    that starts a local web server and opens an editing page in the
    browser. The page is a table with email, name, a Role pop-up and a
    Department pop-up, and it shows each email's key IDs, so it is visible
    when someone has registered a key. The GUI and the CLI share one code
    path. `pywebview` can wrap the page in its own window later if wanted.
- Every saved tree is **signed with the root key**, which today is
  Simson's, held in his local `gpg`.
- The public key is embedded in the extension's executable.
- The extension has the root key's **fingerprint compiled in**. It refuses
  any tree that is not signed by that key, and warns loudly if the signer
  changes.
- Real editors' email addresses are never committed to the repository or
  compiled into the extension. The local working copy of the roster lives
  in git-ignored `var/`.

Known limit: because one root key signs every publication's tree, Simson
could add himself to another publication's tree. That is a deliberate,
visible act (section 7.3 shows key additions to members), which fits the
threat model. A later version can give each publication its own admin key.

## 6. User keys

### 6.1 Creating a key

1. The extension learns the user's email address from the MC page. The
   sidebar shows it and lets the user change it (for example to their
   shared account's address).
2. On first use the sidebar asks for a **passphrase**, once, with an
   open/closed eye button to show or hide it. The extension then remembers
   it in the browser (acceptable under section 2).
3. The extension generates a key pair, protects the private key with the
   passphrase, and uploads both halves to the server. The server cannot
   open the private key.
4. Each upload for an email gets the next **version number** (1, 2, 3…).

A second browser for the same person downloads the protected private key
from the server and opens it with the passphrase. One key therefore serves
all of a person's browsers.

### 6.2 Approving a key

A new key is **not used by anyone** until it is approved.

- The server emails the key's own address through Amazon's **Simple Email Service (SES)**, with the
  publication's admin on Cc. Receiving the email at that address is the
  proof of ownership. 
  - The From address is currently **robot@sabinok.com**.
- The email says how many keys that address already has, and has two
  buttons, each carrying a single-use, per-key nonce:
  - **Register new key**
  - **Register new key and delete the old one(s)** (only shown when older
    keys exist)
- Clicking a button marks that key version approved, and in the second
  case retires the older versions.

This needs SES **production access** in the sabinok account, us-east-2,
since SES must send to addresses other than Simson's.

### 6.3 Using keys

- A note is encrypted to **every approved, non-retired key** of every
  potential viewer of the note (see section 7.1).
- A **lost** key (forgotten passphrase) is retired: no new notes are
  encrypted to it. The user makes a new key version, and older notes are
  re-encrypted to it by someone who can already read them (section 8).
- Requests to the server are **signed with the user's key**, and the
  server checks the signature against the approved keys for that email.

### 6.4 Passkeys (optional, later)

We are considering allowing Passkeys to unlock the GPG key using the WebAuthn PRF extension (Touch ID, Windows Hello). Before relying on it, check
that WebAuthn works from an extension page and that editors' platforms
support PRF.

### 6.5 Handing over a role

A shared MC account (for example a CoChair role account) has its own email
and its own key. To hand it over:

1. The old holder gives the new holder the passphrase.
2. The new holder creates a new key version for that email and approves it
   with "Register new key and delete the old one(s)".

The old key is retired, so the old holder can no longer read new notes,
though they keep what they could read before. This matches the ex-AE rule
in section 7.2.

## 7. Notes

### 7.1 Who each note is encrypted to

| Recipient | When |
|---|---|
| The author (of the note, not the manuscript) | Always |
| The publication's EIC(s) | Always |
| The CoChair(s) for the manuscript's department, and CoChairs with department "all" | Always |
| The handling AE | While they are assigned |
| The manuscript's reviewers | When the publication allows reviewers to see each other's notes; otherwise each reviewer's notes go only to the author, the chairs and the EIC |

Each email on the list contributes all of its approved, non-retired keys.

### 7.2 Assignment changes

The extension monitors assignment changes and reports them to the server. As part of this process, the extension fetches notes (if they are not resident) and encrypts or re-encrypts the notes and sends them to the server. This monitoring is typically done by the extension running on the **Admin**, **EIC** or **CoChair**.

- **New AE or reviewer:** older notes are re-encrypted to them (section 8),
  so they see the manuscript's history. 
- **AE leaves** (reassigned or final decision): new notes simply stop
  listing them. They keep reading notes from while they were assigned and
  see nothing afterward. This is Simson's 2026-10-23 decision.

### 7.3 Signatures, edits and deletes

- Every note is signed by its author. Clients reject a note whose signature
  does not match an approved key of the claimed author.
- **Edit:** a new version of the note, signed by the same person. Clients
  ignore edits signed by anyone else.
- **Delete:** a signed tombstone from the author, or from a CoChair or the
  EIC. The server can check signatures (public keys are public), so it
  deletes ciphertext only for a valid tombstone, and keeps the tombstone so
  clients drop cached copies.
- Each note carries a per-manuscript sequence number and the previous
  note's hash, so clients can show that a note is missing if the server
  drops one.
- Clients remember the keys they have encrypted to and show a notice when a
  new key appears for someone on their manuscripts ("New key for
  <email>, key ID …").

### 7.4 Plain notes during the transition

Unencrypted notes keep working while this is built. Each stored note has a
format field, `plain` or `pgp`, and clients read both. Encryption is
switched on per publication. Existing plain notes can later be encrypted by
someone who can read them, or left as they are.

## 8. Re-encryption is done by readers, not the admin

If the admin re-encrypted notes, the admin could read everything. So
re-encryption is done in the extension, with the key of someone who can
already read the note:

- The **EIC** can re-encrypt for anyone, including CoChairs.
- A **CoChair** can re-encrypt for any AE in their department.
- The **handling AE** can re-encrypt for that manuscript's reviewers.

Mechanically, the reader's extension opens each older note's session key
and adds a key packet for the new recipient key. The note bodies do not
change. Pending re-encryptions (a new AE, reviewer or key version) show as
a badge in the sidebar of the people who can do them, and are done
automatically when one of them opens the extension.

## 9. Server

- One Lambda (Rust), reached at **`https://emc-api.sabinok.com`**, in the
  sabinok AWS account, us-east-2. A Lambda function URL cannot use a custom
  domain by itself, so CloudFront sits in front, which is within the free
  tier.
- That address is compiled into the extension as the default and can be
  changed in Settings. (Today the Notes server field in Settings is empty
  by default, which keeps notes local.)
- One on-demand DynamoDB table holds trees, public keys, protected private
  keys, approval nonces, notes and tombstones.
- The server enforces a plain access check as well (only approved keys of
  people on a manuscript may fetch its ciphertext), as defense in depth.

## 10. When the server is down

Notes are online only. There is no offline editing and no sync protocol.

- If the server cannot be reached, the notes area is hidden and shows a
  banner saying the notes server is unreachable.
- Everything else in the extension works as before.

This changes the current local-first notes interface, which Simson
accepted.

## 11. What the server still sees

| Data | Visible to the operator? |
|---|---|
| Note text and anything inside notes | No |
| Trees: emails, names, roles, departments | Yes |
| Reviewer emails per manuscript | Yes |
| Manuscript IDs | Yes, unless hashed (possible later) |
| Who wrote on which manuscript, when, and how much | Yes |
| Request IP addresses | In AWS logs; keep retention short |

## 12. How this changes earlier plans

- **Cognito is dropped.** Signed requests (6.3) and email approval (6.2)
  replace it. The Cognito parts of *Technical Stack and Architecture* are
  superseded.
- **Authored notes:** the per-browser self-generated key and first-upload
  trust become the versioned, approved user key, which closes the gap where
  any registered key could read notes given an ID and title.
- **Reviewer discussions for another journal:** its attestation chain maps
  onto the tree (EIC and CoChairs) plus reviewers added by the handling AE.
  Its Cognito sign-in is replaced by 6.2.
- **ACM LLM policy:** unchanged. Note text can no longer reach any
  server-side model, which suits the policy.
- **Privacy Policy:** needs a section on what is encrypted, what metadata
  remains (section 11), key approval emails, and the extension-release
  caveat.
- **Email ingestion:** stays for CACM. For other publications it would let
  the operator read their assignment emails, so it stays off unless a
  publication asks for it.

## 13. Edge Cases

1. The **Admin** and **EIC** both have access to all notes, so if either loses their passphrase, the other can re-encrypt all of the notes for them.
2. Manuscript IDs are not stored hashed, since they can be readily brute-forced. 
3. Notes are retained until final decision, or until there is no activity for 18 months. 
4. Initially Simson is the admin for every publication. This may change. 
