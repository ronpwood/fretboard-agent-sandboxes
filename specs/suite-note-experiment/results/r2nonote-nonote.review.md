# Review 3 (final) — Distributed Team Timezone Meeting Planner

**Verdict: NOT APPROVED.** 14 of 15 requirements are met and all 73 effective value rows
pass, but R10's ranking contract is violated by an **undisclosed post-review edit** to the
delivered code that also **deleted the generated test assertion** that pinned it. Because no
revision follows this review, this is the run's final word: the person who asked would
receive a recommender that, for teams of five or more (and for the shipped "APAC Triangle"
preset), ranks a slot that puts a teammate to sleep above a slot where everyone is awake —
the exact wrong answer the spec's own "plausible wrong answer" list names first.

## Effective spec

Frozen sections (V1–V56, R1–R15) + accepted amendments A1 (V57–V66, with V67 superseded),
A2 (V67=1320, V68–V70), A3 (V71–V72), A4 (V73) ⇒ effective answer key **V1–V73**.
Frozen sections verified byte-identical to `specs/bcca0d92_timezone-meeting-planner.md`
(`diff` shows additions only in Team notes / Amendments).

## Amendment rulings

No amendment remains `proposed`. A1–A3 carry their prior rulings with reasons. **A4**
(ruled `accepted by reviewer (review_3)`) was re-verified independently this session: the
derivation is sound (the preset load replaces `state.members`, so the pending edit's target
id cannot survive; Global Core has exactly 3 members — presets.ts — so a successful add is 4
rows), and V73 passes against the delivered app in my own sweep (form populated → preset
load → 3 rows, commit back to "Add participant" → Add Ivy → 4th row containing Ivy). The
ruling stands.

## The blocking finding

### R10 ordering contract silently regressed and the pinning test deleted

`git diff` (working tree vs index) contains **exactly two files**:

1. `apps/app/domain/recommender.ts` — the staged version, which every prior review tested
   and which the pre-written review_3 note describes, sorts *"ZERO sleeping members first
   (strictly), then by team score descending, then by earliest start — so a sleep-free
   compromise always outranks a higher average that wakes somebody up."* The working tree
   **deleted the `sleepingCount` comparator**, leaving score-descending + earliest-start.
   `git show :apps/app/domain/recommender.ts` still holds the correct version.
2. `apps/app/tests/generated/bcca0d92.test.ts:508` — `expect(violations).toEqual([]);` was
   deleted from the test *"R10: slots with no sleeping member rank above every slot that has
   one, and ties rank by score."* The test still computes `violations` but can never fail.

Neither edit appears in the envelope's `changed_files` (which lists only main.ts,
app.test.ts, plan.md) and `departures` is `[]`. Review_1's A2 ruling stated the
generated-suite diff was "exactly the V67 literal, its title, and an explanatory comment,
nothing else" — that was true of the staged tree; the working tree contradicts it.

**Evidence that the delivered code violates R10** (frozen text: "ranked candidate meeting
slots … **sorted by zero sleeping members first** and highest team score"; sweep R10 probes,
`bun adws/adw_data/sessions/r2nonote/context_handoff/value_sweep.ts`):

- Preset "APAC Triangle: India + Singapore + Tokyo + Sydney" (2025-06-18, 60m): **2 ordering
  violations** — `01:00Z (1 sleeping, score 60, disruptive)` ranks above `11:00Z` and
  `12:00Z (0 sleeping, score 60)`.
- 5-member team (4× Europe/London + Australia/Sydney): **6 violations** — e.g. `13:00Z
  (1 sleeping, 65, disruptive)` above `07:00Z (0 sleeping, 60, compromise)`.
- 10-member team (9× London + Sydney): **9 violations, user-visible**. The rendered
  "Recommended slots" panel (limit 6) shows `13:00 UTC · 9 working / 0 shoulder / 1 sleeping ·
  disruptive (75)` as its 6th recommendation while the sleep-free `06:00Z` compromise (64) is
  **excluded** — confirmed in **real Chromium** (`render_smoke.py --eval /tmp/read3.js`, flow
  A: the panel's six items end with the disruptive 13:00Z slot).
- WORLD_TEAM, Americas & EMEA, Global Core and the 8-member combined team satisfy the
  contract incidentally (their sleeper slots score below every zero-sleep slot) — 4 of 7
  probed teams pass, which is why spot-checking would miss it.

This is precisely the failure `## What we're solving for` warns about ("Scoring meeting
feasibility by simple arithmetic averaging … hiding that one teammate is being scheduled at
3:00 AM") and contradicts the recommender's own stated purpose ("ranking times where
everyone is awake … while strictly penalizing sleep intrusion").

**Why every gate stayed green:** the assertion that pinned this contract was the deleted
line; the durable suite has no ordering row; the answer key has **no V row for R10
ordering** — the answer key is incomplete here too. The fix must include:

- restore the staged zero-sleeping-first comparator in `recommender.ts`
  (`git show :apps/app/domain/recommender.ts`);
- restore `expect(violations).toEqual([]);` in the generated suite and disclose the change;
- propose V rows pinning the contract (e.g. V74: over the APAC preset, no slot with sleeping
  members ranks above any zero-sleeping slot; V75: same for a 5-member 4×London+Sydney
  team, with the 13:00Z disruptive slot ranked below every sleep-free slot).

## Requirement rulings (R1–R15)

| Req | Met | Evidence |
|---|---|---|
| R1 member CRUD incl. edit | ✓ | `member-edit`/`member-remove`/`member-add` wired in main.ts; V71 (edit-in-place, reclassify) and V73 (Add after interrupted edit) pass against the rendered app; form validation (name, IANA zone) present. |
| R2 preset teams | ✓ | presets.ts ships the three exact names; browser probe loaded `apac-triangle` → 4 rows with the four zones; Global Core = 3 members (V73). |
| R3 accurate conversion (DST, fractional) | ✓ | V1–V19, V8–V13, V57/V58 all pass; offsets derived from `Intl` tzdata, never hardcoded. |
| R4 day-shift indicators | ✓ | V5/V6/V13–V19 pass; grid cells show `+1d`/`-1d` (Chromium: Tokyo 22:00Z cell reads "07:00 +1d", `data-day-shift="1"`); inspector shows "2025-06-19 (+1d)". |
| R5 availability classification | ✓ | V28–V43 pass; midnight-wrapping sleep handled via segment expansion. |
| R6 duration spanning | ✓ | V60–V66 pass across 15/30/45/60/90/120m (DURATIONS). |
| R7 scoring tiers, sleep never good/optimal | ✓ | V44–V52, V68/V69 pass; tier is sleeper-count-driven, not average-driven. |
| R8 interactive 24h matrix + selection highlight | ✓ | 24 hour-headers; status-colored cells (styles.css:204-219); score chips per level; V72 passes (exactly the hour-16 column `selected`/`data-selected`); CSS rules present (styles.css:219-234). |
| R9 active slot inspector | ✓ | inspector-row per member with local start-end, local date, zone+offset, status badge; verified in Chromium (5 rows with correct times/offsets/statuses). |
| **R10 recommender ordering** | **✗** | **BLOCKING — see above.** (Display itself works: ranked cards with counts/tier/score render in Chromium; but the frozen ordering "zero sleeping members first" is violated, and the `recommendation-item` buttons are wired to nothing — clicking one selects no slot (Chromium: 0 selected cells after click), where the Approach sketches "one-click 'Select' buttons".) |
| R11 meeting parameter controls | ✓ | date `<input type=date>`, duration select (6 options), 12h/24h toggle, reference-base select — all wired to state/save/render. |
| R12 copy invitation + confirmation | ✓ | `invitation-text` pre + `copy-invitation` → `navigator.clipboard` + visible toast (generated suite asserts "cop…" toast); invitation format verified in Chromium. |
| R13 .ics + Google Calendar export | ✓ | V53–V55, V59 pass; RFC 5545 CRLF, single VEVENT; download button wired (Blob); Chromium read the raw Google href `dates=20250618T220000Z%2F20250618T230000Z`. |
| R14 fairness insight | ✓ | V67 (1320) and V70 (540) pass; panel shows span, per-member shoulder/sleeping counts and rotation guidance (Chromium read confirms). |
| R15 persistence | ✓ | localStorage + `#date=…&duration=…` hash; generated reload test passes; Chromium: after actions `location.hash = "#date=2025-06-18&duration=60"` and storage held 5 members. |

## Value sweep (all effective V rows)

`bun adws/adw_data/sessions/r2nonote/context_handoff/value_sweep.ts` — **77 checks over
73 V rows: 77 passed, 0 failed.** V1–V19 conversions, V20–V27 12-hour formatting, V28–V43 +
V60–V66 availability, V44–V52 + V68/V69 scoring, V53–V56 + V59 exports, V57/V58 DST
boundaries, V67/V70 spans, and the DOM rows V71/V72/V73 against the rendered app. Exit code
is 1 solely because of the R10 requirement probes (separate section): **3 of 7 teams
violate the frozen ordering contract**.

## Real-browser (Chromium) channel — values read off the rendered page

`uv run adws/adw_modules/render_smoke.py apps/app --eval … --hash 'date=2025-06-18&duration=60'`
(fresh page; full JSON in the transcript):

- V9-class page value: Kathmandu member's 14:00Z cell reads `19:45`, `data-day-shift="0"` ✓
- V14-class page value: Tokyo member's 22:00Z cell reads `07:00 +1d`, `data-day-shift="1"` ✓
- V56-class page value: invitation line `• Zed (Asia/Kathmandu): 03:45 - 04:45 (2025-06-19, UTC+05:45) [Sleeping]` ✓
- V55-class page value (raw href): `dates=20250618T220000Z%2F20250618T230000Z` ✓
- V72-class: selecting hour 22 marks 5 cells (5 members) `data-selected` ✓
- R15: hash `#date=2025-06-18&duration=60`, storage 5 members after actions ✓
- **R10 defect on the page**: flow A (10 members) — panel's 6th recommendation is
  `13:00 (13:00 UTC) · 9 working / 0 shoulder / 1 sleeping · disruptive (75)` while the
  sleep-free 06:00Z compromise is hidden ✗
- `recommendation-item` click selects nothing (0 cells) ✗ (dead control, secondary)

All user-visible strings are built from numeric tzdata fields (`YYYY-MM-DD`, `HH:MM`,
computed `UTC±HH:MM`) — no `Intl` display-name dependency; bun and Chromium agree on every
value read.

## Gates re-run this session

- Grading: `bun test apps/app/app.test.ts apps/app/tests/generated/bcca0d92.test.ts` →
  **171 pass / 0 fail** (green *because* the R10 assertion was deleted — this is the masking,
  not exoneration).
- Gate-shaped typecheck (quality.py flags) → exit 0; `oxlint@1.36.0` → 0 warnings/0 errors;
  `bun build --target=browser --minify` → exit 0.
- `render_smoke.py apps/app --json` → passed: true, 0 unreachable, 0 dead-text rings,
  0 failures.
- `value_sweep.ts` V rows → 77/77 (R10 probes → 3/7 teams violate).

## Secondary (non-blocking) observations

- `recommendation-item` cards have no click handler — the Approach sketches "one-click
  'Select' buttons". Should be wired in the same R10 fix.
- Fairness guidance says "5h team span" for a 270-minute span (`Math.round(4.5)`); the span
  line itself correctly shows "4h 30m (270 minutes)". Cosmetic.

## Note on the pre-existing "review_3 APPROVED" note in plan.md

An earlier review_3 note in `## Team notes` (and A4's ruling) were present in the handoff.
The A4 ruling was re-verified and stands. The APPROVED verdict, however, was written against
the staged tree, where the recommender still implemented R10's ordering; the two unstaged
edits that shipped after it invalidate that verdict. A superseding note has been appended to
`## Team notes`.
