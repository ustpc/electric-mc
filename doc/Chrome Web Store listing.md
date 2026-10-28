# Chrome Web Store listing

Everything needed to submit the Electric MC extension to the Chrome Web Store,
field by field, in the order the developer dashboard asks for it. Paste the
text blocks as they are. The first release is **Unlisted**: only people with
the link can install it, and it doesn't appear in search.

Publisher account: simsong@gmail.com (non-trader), created 2026-10-19.
Dashboard: <https://chrome.google.com/webstore/devconsole>

## 0. Before submitting

| Item | Status |
|------|--------|
| Developer account, 2-Step Verification, contact email | Done (2026-10-19) |
| Store build without "(test build …)" in the name | Done in 0.0.21: `npm run zip:store` (same as `STORE=1 npm run zip`). |
| Public privacy policy URL | Done: `doc/Privacy Policy.md` is on `main` (see section 3). |
| Screenshots | One placeholder from synthetic test data (`doc/store/`). Better ones are listed in section 2. |
| Package | `cd extension && npm run zip:store` writes `build/electric-mc-extension-<version>-chrome.zip`. Upload that file. |

## 1. Package (from the manifest)

These come from `extension/wxt.config.ts` in a store build (`STORE=1`), not from the dashboard, so they
change only with a new upload.

- **Name:** `Electric MC`
- **Summary** (manifest `description`, 132 characters at most):

  > Makes ScholarOne Manuscripts easier for editors: readable tab titles, highlighted revisions, earlier-version AEs, and easier login.

## 2. Store listing tab

**Category:** Productivity → Workflow & Planning. **Language:** English.

**Description:**

```text
Electric MC makes ScholarOne Manuscripts (Manuscript Central) easier to use for the editors and associate editors who run peer review.

What it does today:
• Readable tab titles. Each Manuscript Central tab is named for the manuscript or queue it shows, so your browser history and Back menu make sense.
• Highlighted revisions. Revised manuscripts (.R1, .R2, …) stand out in your queues.
• Earlier versions at a glance. On a revision's page, Electric MC shows who handled each earlier version, when it was submitted, and when its decision went out.
• Easier login. It adds the hints password managers such as 1Password and Chrome's own need to fill the Manuscript Central login form.
• Optional wider layout and larger text.
• A side panel listing the manuscripts you have seen, with one-click navigation.
• A per-site on/off switch.

Privacy: everything stays in your browser. Electric MC sends nothing to any server, uses no analytics, and runs no AI on your manuscripts. Settings sync through your Chrome profile; manuscript data stays on this computer.

Electric MC works with ScholarOne Manuscripts. It is an independent project and is not affiliated with or endorsed by Clarivate or Silverchair.

Source code: https://github.com/ustpc/electric-mc
```

**Graphic assets:**

| Asset | Required | File |
|-------|----------|------|
| Store icon 128×128 | Yes | `extension/public/icon/128.png` |
| Screenshot 1280×800 (1–5) | Yes, at least 1 | `doc/store/screenshot-revisions-1280x800.png` (placeholder) |
| Small promo tile 440×280 | Yes | `doc/store/promo-tile-440x280.png` |
| Marquee tile 1400×560 | No | — |
| YouTube video | No | — |

The placeholder screenshot is a queue page built from the synthetic test
fixtures, with a revision highlighted. Better screenshots would show the side
panel next to a real-looking queue and the Earlier Versions rows on a
manuscript page. **Never use a screenshot of a real manuscript:** titles,
author and reviewer names are confidential.

**Additional fields:**

- **Homepage URL:** `https://github.com/ustpc/electric-mc`
- **Support URL:** `https://github.com/ustpc/electric-mc/issues`
- **Official URL:** none (it needs a site verified in Google Search Console).
- **Mature content:** off.

## 3. Privacy practices tab

**Single purpose:**

```text
Improves the ScholarOne Manuscripts (Manuscript Central) web pages for journal editors: clearer tab titles, highlighted revisions, information about earlier manuscript versions, and password-manager-friendly login.
```

**Permission justifications:**

| Permission | Justification to paste |
|------------|------------------------|
| `storage` | Saves the user's settings (synced through their Chrome profile) and, locally, the list of manuscripts they have viewed and a debug log. Nothing is sent off the device. |
| `sidePanel` | The extension's interface is a side panel that shows what it found on the current Manuscript Central page, the manuscripts seen so far, and settings. |
| `tabs` | The side panel follows the active tab, so it needs to know which tab is active and when its URL changes, and it can reload the tab after a setting changes. |
| `downloads` | Lets the user save the extension's debug log to their Downloads folder so they can send it with a bug report. Only on an explicit button click. |
| `contextMenus` | Adds "Turn off on this site" / "Turn on for this site" to the toolbar icon's right-click menu. |
| Host permission `https://*.manuscriptcentral.com/*` | The extension only works on Manuscript Central. It reads those pages to find manuscript IDs, titles and assignments, and changes them (tab title, highlighting, extra rows). Journals each have their own subdomain, hence the wildcard. |

**Remote code:** No, I am not using remote code. All JavaScript is in the package.

**Data usage.** The form asks what data the extension collects "now or in the
future". Today nothing leaves the browser, but the planned backend will
receive manuscript and assignment data, so tick:

- **Personally identifiable information:** names of editors, reviewers and authors shown on Manuscript Central pages.
- **Website content:** manuscript IDs, titles and statuses.

Leave everything else unticked: health, financial, authentication information,
personal communications, location, web history, and user activity. Activity
tracking will need its box ticked when it ships.

Then tick all three certifications: data is not sold to third parties, not
used or transferred for purposes unrelated to the single purpose, and not used
to determine creditworthiness.

**Privacy policy URL:**
`https://github.com/ustpc/electric-mc/blob/main/doc/Privacy%20Policy.md`
(live on `main`; the repository is public).

## 4. Distribution tab

- **Visibility:** Unlisted.
- **Regions:** All regions.
- **Payment:** free.

## 5. Submitting and updating

1. Upload the zip on the Package tab, fill in the tabs above, and click **Submit for review**. Review usually takes from a few days to a few weeks.
2. For each update, bump `version` in `extension/package.json`, then run `npm run zip:store` and upload on the Package tab. Chrome rejects an upload whose version isn't higher than the published one.
3. Adding a permission makes Chrome disable the extension for existing users until they accept it. Avoid adding permissions in small updates.

## 6. Automated releases

`.github/workflows/chrome-web-store.yml` builds the store package, runs the
tests, uploads the zip through the Chrome Web Store API and submits it for
review. To release:

1. Bump `version` in `extension/package.json` and merge to `main`.
2. Push a tag that matches it: `git tag extension-v0.0.22 && git push origin extension-v0.0.22`.
   You can also run the workflow by hand from the Actions tab. Tick
   "staged" to hold the approved version until you publish it from the
   dashboard.

The store keeps the visibility set in the dashboard. After changing
visibility, publish once by hand before the workflow can publish again.

**One-time setup** (Simson, signed in as simsong@gmail.com):

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project (e.g. `electric-mc-publishing`) and enable the **Chrome Web Store API**
   and the **IAM Service Account Credentials API** (the workflow's sign-in
   step needs the second one to turn the key into an access token).
2. Under IAM & Admin → Service accounts, create a service account
   (e.g. `cws-publisher`), open it, and under Keys → Add key → JSON download a key.
3. In the [developer dashboard](https://chrome.google.com/webstore/devconsole),
   click **Settings** under PUBLISHER in the left column (not the account's
   Profile page) and add the service account's email in the Service account
   section.
4. In GitHub, ustpc/electric-mc → Settings → Environments, create an environment
   named `chrome-web-store`, add the secret `CWS_SERVICE_ACCOUNT_KEY` (the whole
   JSON key), then add the variables `CWS_PUBLISHER_ID` (the ID in the
   dashboard's address, `devconsole/<publisher ID>/…`) and `CWS_ITEM_ID` (the
   extension's 32-letter ID), on the environment or the repository.
5. Check it: run the workflow by hand from the Actions tab with **submit**
   unticked. It signs in and uploads a draft without sending anything for
   review. Then delete the downloaded key file.

Requiring a reviewer on the `chrome-web-store` environment makes every
release wait for your approval in GitHub before it is uploaded.

