# ScholarOne release history and forecast

Research done 2026-10-16. Covers the past three years (late 2023 to October
2026) and forecasts the next one to two years.

## Where the release notes are

- Official release notes exist. They moved from Clarivate's site
  ([clarivate.com release notes](https://clarivate.com/academia-government/training-support/scholarone-manuscripts/release-notes/))
  to Silverchair's support site
  ([support.silverchair.com release notes](https://support.silverchair.com/s/scholarone-manuscripts/release-notes))
  after the acquisition.
- They are named by quarter, for example "Release Note: Q4.2023 Release",
  "Q1.2023 Release", and "Q4.2024 Release". Silverchair says ScholarOne
  Manuscripts ships **three to four releases a year**, and that features
  still in progress are marked "Beta" in the release notes.
- **Limitation:** the release-note pages are rendered by JavaScript on a
  Salesforce site, and neither page could be read by the research tools used
  here (both sites also refused direct downloads). The year-by-year summary
  below is therefore built from Silverchair's public announcements and the
  ScholarOne developer changelog, which name the features that shipped. Someone
  with a browser should skim the quarterly notes to fill in smaller items
  (UI tweaks, configuration options, bug fixes).
- The API changelog is public: [ScholarOne Developer Hub changelog](https://developer.scholarone.com/changelog).

## Summary by year

### 2024 (Clarivate, then sale to Silverchair)

- **Q4.2023 and Q4.2024 quarterly releases** shipped under Clarivate (titles
  confirmed, contents not readable; see above).
- **Research integrity at scale**: the Unusual Activity Detector (UAD, built in
  2015, sold since 2017) flagged 939,331 manuscripts as low, medium, or high
  risk in 2024 and stopped 68,825 high-risk manuscripts. Improvements from user
  feedback began in late 2024.
  ([The evolution of research integrity solutions in ScholarOne](https://www.silverchair.com/news/research-integrity/), 2025-03-21)
- **Accessibility remediation of author submission**: keyboard navigation,
  screen-reader support, contrast, and 200% zoom, aiming at WCAG 2.1 AA.
  Editor pages were explicitly not remediated.
  ([Enhancing Accessibility](https://www.silverchair.com/news/enhancing-accessibility-scholarone/), 2024-12-11)
- **Ownership change**: Silverchair agreed to buy ScholarOne from Clarivate
  (announced 2024-10-28) and promised gradual integration, continuity, and a
  roadmap centred on UX, accessibility, research integrity, and AI.
  ([Silverchair to Acquire ScholarOne](https://www.silverchair.com/news/silverchair-acquires-scholarone/), 2024-10-28;
  [Integrating for Innovation](https://www.silverchair.com/news/integrating-for-innovation/), 2024-12-05)

Character of the year: maintenance mode under Clarivate; little visible to
editors.

### 2025 (first year under Silverchair)

- **Product vision** (2025-01-30): four themes: research integrity,
  re-imagined author/reviewer/editor experiences, interoperability and
  modernization, community.
  ([2025 Product Vision](https://www.silverchair.com/news/scholarone-product-vision/))
- **Modernization strategy** (2025-03-11): no rewrite; incremental
  "strangler fig" replacement of old code, with new author and reviewer
  gateways promised for the second half of the year.
  ([Strategies for Sustainability](https://www.silverchair.com/news/strategies-for-sustainability/))
- **Research integrity partnerships**: Signals pilot (2025-03-03), Hum
  Alchemist Review (2025-03-25), Clear Skies paper-mill detection
  (2025-05-13), Cactus (2025-05-20), STM Integrity Hub. A 2025-03-25 release
  improved the UAD.
- **AI Playground** extended to ScholarOne Manuscripts for editor
  experimentation with select partners (2025-05-27), followed by an
  **editorial assistant beta** for reviewer guidance and manuscript assessment.
  ([AI Playground](https://www.silverchair.com/news/silverchair-expands-ai-playground-to-scholarone-manuscripts/))
- **Relay API** (2025-09-03): two-way integration so outside vendors can
  assess manuscripts and post results back into ScholarOne.
- **ScholarOne Summit** (September 2025): product team reorganised into
  three-week sprints with quarterly planning; editor-experience redesign
  begun; Silverchair acknowledged the interface's "challenging and dated"
  reputation. ([Summit 2025 Recap](https://www.silverchair.com/news/scholarone-summit-2025-recap/))
- **Infrastructure modernization** (reported 2025-10-30): "the most
  significant infrastructure investment ScholarOne has seen in years", with
  maintenance windows. ([Building ScholarOne's Next Chapter](https://www.silverchair.com/news/building-scholarones-next-chapter/))
- **New API calls** (2025-11-26): `addNote` and `makeEditorAssignment`.
- **ScholarOne Gateway** commercial launch (2025-12-10): unified author and
  reviewer dashboard across a publisher's journals, linked accounts, central
  status tracking, branded publisher home pages.
  ([Silverchair Launches ScholarOne Gateway](https://www.silverchair.com/news/silverchair-launches-scholarone-gateway/))
- Scale: 475 new sites and 3.9 million submissions in the first year.
  ([One Year In](https://www.silverchair.com/news/one-year-in-scholarone-silverchairs-shared-journey-forward/), 2025-11-04)

Character of the year: re-platforming and partnerships; the visible changes
were for authors and reviewers, not editors.

### 2026 (to October)

- **New API calls**: `getSubmissionConfigurationByJournal` (01-14),
  `updatePersonProfile` (01-15), `getUADMetadata` (01-22), and a new response
  element in `getSubmissionInfoFull` v13 (04-20).
- **2026 roadmap** (2026-01-21): Gateway deep links, journal matching
  (exploratory), transfer improvements, Editor AI Console beta, prototype
  editor dashboards and redesigned manuscript views ("Editor Gateway"),
  reviewer-matching prototypes, UAD expansion (relationship and clique
  analysis), Cognos analytics updates, refined authentication, Relay data on
  checklist and reviewer-selection pages.
  ([From Submission to Decision](https://www.silverchair.com/news/from-submission-to-decision/))
- **Integrity integrations**: Digital Science Dimensions Author Check
  (2026-01-29), full Hum Alchemist Review (2026-03-09), Imagetwin image checks
  (2026-04-08).
- **Editor research**: 34 editor interviews (2026-02-24) and a
  feedback-first "blueprints" process (2026-02-12).
- **Early Access, Beta, and User Testing Groups** (2026-03-03). Testing topics
  for 2026 include **in-workflow collaboration tools**.
  ([Turn Up the Volume](https://www.silverchair.com/news/turn-up-the-volume/))
- **Gold SSP EPIC Award** for ScholarOne Gateway (May 2026).
- **Editor Gateway dashboards and Editor AI Console** (2026-07-21): new
  editor dashboards showing manuscript status, reviewer activity, and
  outstanding tasks, rolling out at no extra cost; an opt-in AI console on the
  manuscript details page that summarises methods, ethics, and readiness with
  editable prompts.
  ([Silverchair Advances the Editor Experience](https://www.silverchair.com/news/silverchair-advances-editor-experience/))
- **Prophy Referee Finder** reviewer matching with explanations and
  conflict-of-interest flags (2026-10-08).
  ([Prophy announcement](https://www.silverchair.com/news/prophy-brings-explainable-reviewer-matching-to-scholarone-manuscripts/))

Character of the year: the editor experience is finally being worked on, and
the pace has picked up.

## Rate of change

- 2024: roughly maintenance-level change.
- 2025: about one significant announcement a month, mostly infrastructure,
  integrations, and the author/reviewer Gateway.
- 2026: one to two a month, now including editor-facing features. The team
  works in three-week sprints with quarterly releases and publishes Beta
  features early.

## Forecast: October 2026 to late 2028

Likelihoods are judgements from the pattern above, not vendor commitments.

| Expected change | Likelihood in 1–2 years | Effect on Electric MC |
|-----------------|-------------------------|-----------------------|
| **Editor Gateway** generally available: dashboards plus redesigned manuscript views without tabs and menus, gradually replacing legacy editor pages | High | Restyling selectors will break as pages change. Keep selectors as per-journal data updatable from the backend (Design Goals 5.2); expect to support legacy and new pages side by side for a long time. Readability (G1) matters less on new pages. |
| **Editor dashboards** with status, reviewer activity, and outstanding tasks | High (already rolling out) | Overlaps G4. Electric MC's difference is activity-based attention (who actually worked on what) and cross-journal views. |
| **In-workflow collaboration** (notes or discussion inside the manuscript) | Medium–high: in user testing in 2026, and `addNote` was added to the API | Directly overlaps G2. Our difference is per-message, retroactive visibility by role, including reviewers. Plan an optional sync into ScholarOne notes through the API. |
| Native **reviewer recommendation** beyond Prophy | High | Makes discovery less of a gap; reviewer notes (Ideas A5) stay useful. |
| More **AI console** features (reviewer-report summaries, decision-letter drafts) | High | Not a goal for Electric MC. |
| More **research-integrity** signals (UAD expansion, image and identity checks) | High | No overlap. |
| **Transfers** and **deep links** | Medium–high | Deep links help Electric MC link from chat and the dashboard into ScholarOne. |
| Editor-side **accessibility** remediation (European Accessibility Act pressure) | Medium | Reduces the need for our accessibility theme on new pages. |
| Unified **cross-publisher** identity for editors | Low | Electric MC's cross-journal view stays distinctive. |
| Fine-grained, retroactive **per-message visibility** or **active-time tracking** | Low | These remain Electric MC's clearest differentiators. |

Overall: Silverchair is likely to ship much of the "dashboard" and some of the
"collaboration" ideas within two years, and to change the editor pages that
our restyling targets. Electric MC should lead with the features the vendor is
least likely to build (role-based retroactive visibility, opt-in activity
tracking, cross-journal attention views) and design restyling to cope with
page changes.
