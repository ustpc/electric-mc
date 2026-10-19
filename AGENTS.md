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

## Privacy decisions

Every privacy-relevant design decision is recorded in
`doc/Privacy Policy.md`.
