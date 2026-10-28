# AE expertise profiles

`build.ts` makes `ae-profiles.json`, which the side panel uses to suggest AEs
for a manuscript. Run it on your own computer; it fetches only public
bibliographic data and embeds it locally.

```sh
cd extension
make install                    # packages, if needed
node scripts/fetch-model.mjs    # the embedding model, once (npm run build does this too)
OPENALEX_MAILTO=you@example.org make ae-profiles ROSTER=~/path/to/roster.json
```

- `ROSTER` is the `roster.json` that cacm-opn-dashboard's `make export` writes
  (the same file the editorial matrix loads). Only people marked assignable
  are profiled; add `ARGS=--all` for everyone.
- Output goes to `../var/ae-profiles.json` (git-ignored), with
  `ae-profiles-report.txt` beside it listing which OpenAlex author each person
  was matched to. **Read the report.** Lines that say "NO affiliation match"
  are guesses.
- Fix wrong or missing matches in an `ids.json` (keep it in `var/`, not in
  the repository) and pass `IDS=../var/ids.json`:

  ```json
  {
    "pat-editor": { "orcid": "0000-0000-0000-0000", "dblp": "00/0000", "keywords": ["synthetic topics"] },
    "robin-editor": { "openalex": "A0000000000" },
    "sam-editor": { "skip": true }
  }
  ```

- Fetches are cached in `../var/ae-profiles-cache/`, so re-running after a fix
  is fast. Delete the cache to pick up new papers.

Then open the side panel on any Manuscript Central page, go to a manuscript,
and press **Load AE profiles…** under *Suggested AEs*.

## How the profile is made

For each person: up to 60 most recent papers (OpenAlex titles and abstracts,
plus DBLP titles when a pid is given), each embedded with
`Xenova/bge-small-en-v1.5` (8-bit). The profile is the mean vector, weighted
by `0.5^(age/5 years)`, plus the vectors of the 20 most recent papers. A
manuscript's score is `0.6 · cos(manuscript, mean) + 0.4 · best cos(manuscript,
paper)`. See doc/AE recruitment and matching.md §3.
