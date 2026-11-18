# Rules for anyone working in this repository (people and AI agents)

## Real data never goes in this repository

This repository is public. Manuscript Central holds confidential peer-review
data, and none of it may ever be committed here, in any file, in any form:

- manuscript IDs or their numbers (even under a different prefix such as
  `TEST-` or `XYZJ-`), titles, abstracts or any text from a submission;
- names, email addresses or ORCIDs of authors, reviewers, editors or staff;
- decisions, scores, reviews, comments, dates or statuses of real manuscripts;
- emails, mbox files, page captures, HTML saved from Manuscript Central,
  extension logs or screenshots of real pages;
- anything copied from a real page into a doc, comment, commit message, test,
  fixture or example.

This applies to commit messages, PR descriptions and issue comments too.

**Use synthetic data only.** Test fixtures and examples use made-up journals
(`TEST-`, `XYZJ-`), manuscript numbers from 1000–1999 or 9000–9999, obviously
invented titles ("A Synthetic Paper About …"), placeholder names ("Editor,
Pat", "Reviewer, Robin") and `example.org` addresses. When you build a fixture
from a real page, rewrite every ID, title, name, email and date before saving
it, and keep the real capture outside the repository (`var/` is git-ignored).

**Before committing**, look at the diff for anything that came from a real
page or email. If in doubt, leave it out and ask.

**If real data is ever committed**, stop and tell Simson. Removing it means
rewriting history on every branch and asking GitHub Support to purge cached
pull-request views. Deleting the line in a new commit is not enough.

## Chrome Web Store policies are never broken

Electric MC is published in the Chrome Web Store, and every change must
comply with the [Chrome Web Store program
policies](https://developer.chrome.com/docs/webstore/program-policies) and the
[Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements/).
A violation puts the listing at risk of removal (it happened on 2026-11-18,
warning "Blue Argon", for a jsDelivr address inside Transformers.js). No
feature, deadline or convenience justifies a violation; if a change can't be
made within the policies, don't make it and say so.

**No remotely hosted code.** All JavaScript, WebAssembly and models the
extension runs ship inside the package. In particular:

- never load a script, module, worker or `.wasm` from the network: no
  `<script src="https://…">`, no `import("https://…")`, no `importScripts` of
  a URL, no CDN (jsDelivr, unpkg, esm.sh, cdnjs, Skypack, jspm …), no
  `eval` or `new Function` of fetched text;
- a library that defaults to a CDN or a model hub must be pointed at the
  bundled files in code *and* have the address removed from the build
  (`extension/scripts/local-runtime.ts` does this for Transformers.js and
  ONNX Runtime). Dead code still counts: the store's scanner flags the
  string;
- the manifest's CSP `script-src` stays `'self'` (plus `'wasm-unsafe-eval'`
  for the bundled WebAssembly);
- `extension/scripts/check-no-remote-code.mjs` runs after every build and zip
  and in CI, and fails on any remote-code address. Never weaken, skip or
  allowlist around it to get a build through; fix the code instead.

**Before any store submission** (a release tag, the release workflow, or an
upload by hand), build the store package and confirm the check passes on it.
Also check the other policies a change touches: the single-purpose rule,
permissions limited to what the features need (flag any new one), the privacy
fields and policy matching what the extension collects, and a listing that
describes what it does.

## Privacy decisions

Every privacy-relevant design decision is recorded in
`doc/Privacy Policy.md`.
