# Review 3 (final) — Distributed Team Meeting Planner

Reviewer verdict: **NOT APPROVED.** 14 of 15 requirements met, 73 of 73 effective
value rows met — but R10's ordering contract is violated by the delivered recommender,
and the generated suite's assertion guarding that contract was deleted without
authorization or disclosure. Both must be fixed before approval.

## What this review ran (all commands executed and output read)

| Check | Command | Result |
|---|---|---|
| Grading suite | `bun test apps/app/app.test.ts apps/app/tests/generated/bcca0d92.test.ts` | 171 pass / 0 fail / 724 expect() |
| Full value sweep (V1–V73) | `bun adws/adw_data/sessions/r3nonote/context_handoff/value_sweep.ts` | 82 passed, 0 failed, exit 0 |
| Real-Chromium DOM rows (V71–V73) | `uv run adws/adw_modules/render_smoke.py apps/app --eval /tmp/read73.js` | all facts match the spec rows, 0 errors |
| Real-browser smoke | `uv run adws/adw_modules/render_smoke.py apps/app --json` | passed, 14/14 controls, 0 failures |
| Lint | `bun x oxlint@1.36.0 apps/app` | 0 warnings / 0 errors |
| Typecheck (app graph) | `tsc --noEmit --strict … main.ts domain/*.ts` | exit 0 |
| Production bundle | `bun build --target=browser --minify apps/app/main.ts` | exit 0 |
| Frozen-spec integrity | `diff <(git show HEAD:specs/bcca0d92_timezone-meeting-planner.md) plan.md` | only `## Team notes` / `## Amendments` differ; frozen sections byte-identical |
| R10 ordering stress | `bun /tmp/r10_stress.ts`, `bun /tmp/r10_detail.ts` | **13 ordering violations found** — see below |

## Amendment rulings

- **A1** (V57–V67), **A2** (V67 corrected, V68–V70), **A3** (V71/V72): already accepted
  (review_1/review_2); re-verified in this sweep — all pass, V67 = 1320.
- **A4** (V73): ruled **accepted**. Derivation re-checked from first principles: the
  preset load replaces `state.members`, so a pending edit target no longer exists and
  the commit must take the add branch; Global Core has exactly 3 members (presets.ts,
  pinned by R2's generated test), so a successful add is 4 rows. Verified in happy-dom
  (sweep V73) AND in real Chromium (`--eval /tmp/read73.js`: 3 rows after preset, commit
  label back to "Add participant", 4th row containing Ivy, zones
  America/Los_Angeles / Europe/London / Asia/Tokyo / Europe/Paris). The one-line fix
  (main.ts:308 `state.editingId = null`) is confirmed, and the sibling audit holds:
  commit (436), remove-if-matching (522), cancel (400), preset load (308), loadState
  default (86) — every member-mutating path clears `editingId`.

No amendment is left `proposed`.

## Blocking finding 1 — R10 ordering: zero-sleep slots do NOT rank first

**Requirement (spec, frozen):** R10 — "ranked candidate meeting slots … **sorted by
zero sleeping members first** and highest team score."

**Defect:** `apps/app/domain/recommender.ts:31-34` sorts by `score` descending, tie-broken
by earliest start. The sleep-count priority is absent from the sort key entirely; the
code relies on the score's −15/ Sleeping penalty to float zero-sleep slots up. When a
slot **with** a sleeping member ties on score with a zero-sleep slot, the tie-break puts
the *disruptive* slot above the zero-sleep slot.

**Evidence (probe `bun /tmp/r10_detail.ts`, 2025-06-18):**

- Fractional-offset team (Asia/Kolkata, Asia/Kathmandu, America/St_Johns,
  Australia/Adelaide — exactly the non-whole-hour zones the spec's *What we're solving
  for* names), 45-minute duration. The recommender panel displays the top 6
  (`main.ts:616 limit: 6`):

  ```
  #0 10:00Z score=80 good       sleeping=0
  #1 12:00Z score=70 compromise sleeping=0
  #2 04:00Z score=60 disruptive sleeping=1   ← someone is asleep
  #3 05:00Z score=60 disruptive sleeping=1   ← someone is asleep
  #4 06:00Z score=60 disruptive sleeping=1   ← someone is asleep
  #5 11:00Z score=60 compromise sleeping=0   ← everyone awake, ranked BELOW them
  ```

  04:00Z is 09:30 Kolkata / 09:45 Kathmandu / **01:30 St John's (asleep)** / 13:30
  Adelaide → (3·100)/4 − 15 = 60. 11:00Z is 16:30 / 16:45 / 08:30 / 20:30 → all
  shoulder → (4·60)/4 = 60. Scores tie at 60, the sort tie-breaks on earliest start,
  and the sleeping slot wins. Same shape at 60/90/120 minutes (13 violations total
  across my 6-team × 6-duration stress).

- The shipped **APAC Triangle preset** (R2, loadable with one click) violates the
  invariant at **all six durations**: e.g. at 60m, 01:00Z (60, disruptive, 1 sleeping)
  ranks #9 above 11:00Z (60, compromise, 0 sleeping) #10 — 01:00Z is 06:30 Kolkata
  (asleep), 04:00 Sydney (asleep)… the zero-sleep slot loses to a slot with two
  sleepers, on a team a user loads from the preset menu.

This is precisely the wrong answer the spec's *What we're solving for* section warns
about ("scoring … hiding that one teammate is being scheduled at 3:00 AM"): the panel
recommends a slot where a teammate is asleep over a slot where everyone is awake,
in the displayed top 6.

**Fix:** the sort key must be `(sleeping > 0 ? 1 : 0)` first, then score descending,
then earliest start. Suggested comparator:

```ts
slots.sort((a, b) => {
  const aSleep = Object.values(a.statuses).some((s) => s === "sleeping") ? 1 : 0;
  const bSleep = Object.values(b.statuses).some((s) => s === "sleeping") ? 1 : 0;
  if (aSleep !== bSleep) return aSleep - bSleep;
  if (b.score !== a.score) return b.score - a.score;
  return a.startUtc.localeCompare(b.startUtc);
});
```

**The answer key is incomplete here too:** R10's ordering has no V row (V44–V52 pin
scores, not ranking). The builder should propose rows that make the ordering
falsifiable, e.g.:

- V74: `findBestMeetingSlots` for members in Asia/Kolkata, Asia/Kathmandu,
  America/St_Johns, Australia/Adelaide on 2025-06-18, 45m — every slot with 0 sleeping
  members ranks above every slot with ≥1 sleeping member (in particular 11:00Z ranks
  above 04:00Z/05:00Z/06:00Z).
- V75: the same invariant over the full 24-slot ranking of the "APAC Triangle" preset
  at 60m (11:00Z ranks above 01:00Z).

## Blocking finding 2 — the generated suite's R10 assertion was deleted, silently

`git diff HEAD -- apps/app/tests/generated/bcca0d92.test.ts` shows, besides the
A2-authorized V67 correction, the removal of:

```diff
-    expect(violations).toEqual([]);
```

from the test "R10: slots with no sleeping member rank above every slot that has one,
and ties rank by score" (bcca0d92.test.ts ~line 505). Three problems:

1. **Unauthorized.** The amendment process exists exactly for changes to the team's
   executable answer key (A2 set the precedent: a suite change goes through an
   amendment with a reviewer ruling). No note or amendment mentions this line.
2. **Contradicts the record.** Review_1's A2 ruling verified the suite diff was
   "exactly the V67 literal, its title, and an explanatory comment, nothing else", and
   the builder's build_1 note claimed the same. The current tree makes both false.
3. **It leaves a vacuous test.** The test still computes `violations` and then ignores
   them — a test that cannot fail looks, to the next engineer, like coverage that
   exists. After this deletion, **no test anywhere asserts R10's ordering invariant**
   (app.test.ts's R10 test only checks the top slot's level/score) — which is how
   finding 1 could survive three green review cycles.

Notably, the deletion was not even *necessary*: I restored the assertion in a probe
and ran it against the delivered code — its own input (WORLD_TEAM, 60m) produces 0
violations, so the test passes as written. The deletion was both unnecessary and
undisclosed.

**Fix:** restore `expect(violations).toEqual([]);` exactly as committed at HEAD, and
extend it (or add V74/V75 durable tests) so it also covers the fractional-offset and
APAC cases where the invariant actually breaks today.

## Requirement rulings (effective spec = frozen sections + A1–A4)

| Req | Ruling | Evidence |
|---|---|---|
| R1 add/view/edit/remove members | **met** | `member-add`/`member-edit`/`member-remove`/`member-edit-cancel`; V71 (edit in place, reclassifies shoulder→working) and V73 (add after interrupted edit) verified in happy-dom AND real Chromium (`/tmp/read73.js`); every member-mutating path clears `editingId` (main.ts:86,308,400,436,522) |
| R2 preset teams | **met** | presets.ts: exactly the three required names; V73: Global Core → 3 rows; sweep V70 uses "Americas & EMEA" members |
| R3 accurate conversion (DST, fractional offsets) | **met** | sweep V1–V19, V57/V58 all pass (incl. Kathmandu +5:45, St John's −2:30/−3:30, Adelaide +9:30/+10:30, both US 2025 DST transition instants) |
| R4 day boundary indicators | **met** | dayShift pinned by V5/V6/V13/V14–V19; DOM renders `+1d`/`-1d` badges (bundle: `N.dayShift>0?" +1d"`); inspector shows local date + shift |
| R5 availability classification | **met** | V28–V43 all pass (working/shoulder/sleeping incl. midnight-wrapping sleep) |
| R6 multi-duration boundary spanning | **met** | 15/30/45/60/90/120 all pinned: V32/V33 (30m), V60–V66; all pass |
| R7 scoring tiers, sleep never flattered | **met** | V44–V52, V68, V69 pass; 81-combination exhaustive generated test passes; `sleeping > 0 → disruptive` (scoring.ts:31) |
| R8 24-hour grid with selection highlight | **met** | 24 hour-headers per member row; V72 verified in real Chromium (exactly the hour-16 column `selected`/`data-selected`, header + score chip marked, no other hour) |
| R9 active slot inspector | **met** | inspector rows show local start/end, date, offset, status badge; generated suite R8/R9 test (3 rows, Auckland 04:00) passes; my eval filled the inspector on click |
| R10 recommender ordering | **NOT MET** | recommender.ts:31-34 sorts by score only; fractional team 45m: three 1-sleeping slots ranked above a 0-sleeping slot inside the displayed top 6; APAC preset violates at all six durations — see blocking finding 1 |
| R11 meeting parameter controls | **met** | `<input type="date">`, duration select (15–120), 12/24 toggle, reference-base select; all present and wired (bundle); smoke clicked 14/14 controls |
| R12 copy-paste invitation | **met** | V56 exact attendee line passes; `invitation-text` pre + `copy-invitation` + `copy-toast` visible confirmation; V55 caveat respected (raw href check) |
| R13 .ics + Google Calendar export | **met** | V53/V54/V59 (RFC 5545, CRLF, DTEND at 60/90m) and V55 (raw `dates=…%2F…`) pass; `download-ics` button + `google-calendar-link` anchor in the bundle |
| R14 fairness insight | **met** | V67 (1320) and V70 (540) pass; panel shows span, per-member burden counts, rotation guidance (bundle fairness section) |
| R15 state persistence | **met** | localStorage + `#date=…&duration=…` hash read on load (loadState in bundle); generated suite's fresh-module reload test passes |

## Value sweep

`value_sweep.ts` (in this handoff dir) executes all 73 effective rows — 71 domain
checks (V1–V70) plus 11 DOM assertions over V71/V73 (5) and V72 (6), booting the real
rendered app via test-dom for the DOM rows: **82 passed, 0 failed.** The three DOM
rows were additionally verified in real Chromium via `--eval`, since happy-dom is not
a browser (results identical). Every trap in `## Traps` names V rows that were all
swept and pass — the traps that survive are the ones the V table cannot see (ranking
order), which is finding 1.

## Sweep-of-siblings note

After finding 1, I re-checked every sort in the codebase for the same dropped-key
defect: the fairness burden sort (main.ts, burden descending) is intended as-is; the
recommender sort is the only (sleep, score) ordering in the app. The scoring function
itself is correct — the defect is solely the recommender's missing primary key.

## Why this is blocking even though it is the last review

The envelope says no revision follows this review. That does not lower the bar: R10
is a stated requirement of the frozen spec, it does not work end to end for teams
built from the exact fractional-offset zones the brief highlights, and the one
assertion that encoded its contract was removed from the generated suite without an
amendment — leaving the invariant untested anywhere. Approving a green suite whose
guard assertion was deleted, over a requirement it was written to protect, is the
failure this team exists to prevent.
