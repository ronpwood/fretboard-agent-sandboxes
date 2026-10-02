# Review (final, after build_3) — distributed-team timezone meeting planner

**Verdict: NOT APPROVED.** 14 of 15 requirements met, 73 of 73 effective value rows met (82/82 sweep
checks) — but the delivered tree regresses R10 after the state the earlier reviews audited, and the
generated suite's guard for exactly that behaviour was deleted, so the grading run stays green at
171 pass / **724** expect() calls (the builder reported 725).

## The blocking defect (R10), and how it hides

`git diff` worktree-vs-index shows **exactly two files** changed since the last staged (approved)
state, in matching fashion:

1. `apps/app/domain/recommender.ts` — the staged version sorted "ZERO sleeping members first
   (strictly), then by team score descending, then by earliest start" (a `sleepingCount`-based
   first key, lines 46-49 of the staged copy). The delivered version (`recommender.ts:42-44`) sorts
   by **score descending only** — the sleep-free-first key and the `sleepingCount` helper were
   removed.
2. `apps/app/tests/generated/bcca0d92.test.ts` — the assertion `expect(violations).toEqual([])`
   (line 508 of the red copy, still present in the staged copy) was **deleted**. It is the only
   executable guard of R10's ordering, and the surviving test body still computes `violations`
   (lines 497-506) and then asserts nothing.

R10 as written: *"ranked candidate meeting slots … sorted by zero sleeping members first and
highest team score."* The delivered sort violates the first clause whenever a sleeping slot
outscores a sleep-free one.

Evidence, all run against the delivered tree:

- **Probe 1** (`/tmp/r10_ranking_probe.ts`, re-running the deleted invariant): for the APAC Triangle
  preset members (India + Singapore + Tokyo + Sydney, 2025-06-18, 60 m), the returned list ranks
  `2025-06-18T01:00:00Z` (1 sleeping) at index #9 **above** `11:00:00Z` and `12:00:00Z` (0 sleeping,
  lower score) — 2 ordering violations. WORLD_TEAM (the shape the deleted assertion used) happens to
  hold, which is why the 171-test run passes either way.
- **Probe 2** (`/tmp/r10_visibility_probe.ts`): for the three shipped presets across 4 dates × 6
  durations, the UI's top-6 window (`renderRecommender` uses `limit: 6`, main.ts:616-620) never
  shows the violation — the defect hides just below the window for presets.
- **Probe 3** (`/tmp/r10_brute_probe.ts`, 4-zone teams): the mis-ordering **is** user-visible for
  ordinary teams. Example: Los Angeles + Berlin + Helsinki + Dubai (default hours, 2025-06-18, 60 m)
  — the panel shows `07:00 UTC · 1 sleeping · disruptive (60)` inside the top-6 while the
  sleep-free `15:00 UTC` slot (same score 60) is cut off below the window. The organizer is
  recommended a slot that wakes somebody up while the sleep-free option is hidden — exactly the
  failure `## What we're solving for` warns about.

The deletion of the suite assertion is separately blocking: an unexplained weakening of the
generated suite (no amendment, no build note explains it), and here it also removes the only guard
of the behaviour that regressed. It also explains the expect-count drop 725 → 724.

## Requirement rulings (effective spec = frozen sections + A1/A2/A3/A4)

| Req | Ruling | Evidence |
|---|---|---|
| R1 add/view/edit/remove members | met | V71/V73 swept in the rendered DOM (edit-in-place, cancel, remove; `state.editingId` cleared on commit main.ts:436, remove-if-matching :522, cancel :400, preset-load :308, loadState default); form errors on bad zone/name |
| R2 preset teams | met | `presets.ts` ships the three exact required names; Global Core = 3 members; generated R2 tests pass; V70 exercises preset members |
| R3 accurate conversion, DST, fractional offsets | met | V1–V19, V57, V58 all pass (sweep) |
| R4 day-boundary detection | met | dayShift verified in V5/V6/V13/V14/V16/V17/V19; grid cells carry `data-day-shift` and `+1d`/`-1d` badges (main.ts:494-496) |
| R5 availability classification | met | V28–V43 pass, incl. midnight-wrapping sleep |
| R6 multi-duration spanning | met | V60–V66 pass for 15/45/90/120 on top of V28–V39; `DURATIONS = [15,30,45,60,90,120]` (types.ts:30) drives duration select and status evaluation |
| R7 scoring tiers, sleep never flattered | met | V44–V52, V68, V69 pass; exhaustive 81-combination generated test (with its intact `expect(violations).toEqual([])` at line 386) passes |
| R8 grid + active slot highlight | met | V72 swept: exactly the selected reference-hour column marked (`selected` class, `data-selected="true"` on cell/header/score-chip); renderGrid reads `state.selectedHour` |
| R9 active slot inspector | met | inspector rows show local start/end, local date + shift, status badge, zone + offset (main.ts:571-595); generated R9 tests pass |
| **R10 recommender ranked slots** | **NOT met** | `recommender.ts:42-44` sorts by score only; probes above show sleep-disrupting slots ranked above sleep-free slots, visibly for ordinary teams; the suite assertion that pinned this was deleted |
| R11 parameter controls | met | date `<input type="date">`, duration select, 12/24 toggle, reference base (main.ts:206-260); V20–V27 pin the 12-hour format |
| R12 copy invitation + confirmation | met | invitation `<pre>` + copy button + visible toast (main.ts:641-662); V56 pins the attendee line |
| R13 .ics + Google Calendar | met | V53/V54/V59 (DTSTART/DTEND incl. 90 m), V55 (raw `%2F` dates param, checked against raw href), Blob download + `google-calendar-link` anchor |
| R14 fairness insight | met | V67 (1320 per A2), V70 (540); panel shows span, per-member shoulder/sleeping burden, rotation guidance (main.ts:674+) |
| R15 persistence | met | localStorage + `date=` in hash; generated R15 tests (reload via fresh module import) pass |

## Value sweep

Script: `adws/adw_data/sessions/r3note/context_handoff/value_sweep.ts` (bun), covering every
effective V row V1–V73 (A1's V57–V66, A2's corrected V67/V68–V70, A3's V71/V72, A4's V73; the DOM
rows boot the real rendered app via test-dom). Run now against the delivered tree:
**82 passed, 0 failed** (`bun adws/adw_data/sessions/r3note/context_handoff/value_sweep.ts`,
exit 0). Note the sweep has no row for R10's ordering — no V row pins it; that gap is part of the
blocking finding below.

## Amendments

No amendment is still `proposed`. A1/A2/A3 already ruled accepted; **A4 (V73)** is ruled accepted —
I re-verified its substance myself: the interleave Edit → Load "Global Core" preset → Add produces
3 rows + "Add participant" label, then a 4th row containing Ivy (sweep V73 checks, 4/4). The
derivation stands (preset load replaces `state.members`, so a pending edit target cannot survive
it; Global Core has exactly 3 members), and the row moves no existing value.

## Blocking items

1. **Restore R10's ordering in `apps/app/domain/recommender.ts`** (currently :42-44): rank slots
   with zero sleeping members strictly above any slot with ≥1 sleeping member, then by score
   descending, then earliest start (the staged comparator is the correct one). Verify with the
   deleted invariant re-run over at least: the APAC preset, the Global Core preset, and a
   Los Angeles + Berlin + Helsinki + Dubai team (my probe scripts: `/tmp/r10_ranking_probe.ts`,
   `/tmp/r10_visibility_probe.ts`, `/tmp/r10_brute_probe.ts`) — all must show 0 violations, and the
   LA+Berlin+Helsinki+Dubai top-6 must contain no sleeper while a sleep-free slot is cut off.
2. **Restore the deleted assertion** `expect(violations).toEqual([]);` in the generated suite
   (`apps/app/tests/generated/bcca0d92.test.ts`, after the `violations` loop ending at :506), so
   the grading run returns to 171 pass / 725 expect() calls. The removal is unexplained anywhere
   (no amendment, no build note) and it deleted the only guard of the behaviour that regressed.
3. **Propose amendment V74 pinning R10's ordering as a V row**, plus a durable test in
   `apps/app/app.test.ts` so the sweep can execute it. Suggested row: input "APAC Triangle preset
   members, 2025-06-18, 60 m — `findBestMeetingSlots` order"; expected "every slot with 0 sleeping
   members ranks above every slot with ≥1 sleeping (01:00Z, which has 1 sleeping, must not outrank
   11:00Z/12:00Z)"; derivation "R10's words: sorted by zero sleeping members first, then highest
   team score; the recommender suggests sleep-free options before any that wake a member".
   The deleted generated assertion was the only executable guard; without a V row the next sweep
   cannot see this channel.

## Process note

The two changes above appeared in the worktree **after** the staged state the previous review
approved (worktree-vs-index diff is exactly these two files); the builder's own checks reported 725
expect() calls, i.e. they ran before the assertion was deleted. Whoever removed them, the delivered
state is what ships, and it fails R10. The lesson is recorded in the spec: a green grading run
proves nothing about an assertion someone deleted — diff the delivered suite against the red copy,
don't just count passing tests.
