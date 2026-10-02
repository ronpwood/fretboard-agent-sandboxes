# Review 3 (final) — re-review verdict

**Verdict: NOT approved.** 14 of 15 requirements met; 73 of 73 effective value rows met
(V1–V73, sweep: 82 checks / 0 failures). One stated requirement is violated by the delivered
code in a channel no `V` row and no surviving test covers, and the one executable check of
that contract was removed from the generated suite without explanation.

## The blocking finding

**R10 — "ranked candidate meeting slots … sorted by zero sleeping members first and highest
team score" — is NOT met.** `apps/app/domain/recommender.ts:42-45` sorts by score descending
only, tie-breaking on earliest start. But V48 (0 working / 4 shoulder) and V49 (3 working /
1 sleeping) both score exactly **60** — the frozen answer key itself proves a sleeping slot
can tie with an all-awake slot — and at that tie the start-time tie-break ranks the
**disruptive slot with a sleeping member ABOVE the all-awake compromise slot**.

Evidence (commands I ran and read):

1. `bun /tmp/r10_order_probe.ts` — the removed generated-suite assertion, re-run verbatim
   against the delivered code, PASSES for the 3-member WORLD_TEAM; but the shipped
   **APAC Triangle preset** violates the zero-sleeping-first contract at all six durations
   (e.g. @60m: slot 2025-06-18T01:00:00Z, 1 sleeping, disruptive (60) ranks above
   11:00Z/12:00Z, 0 sleeping, compromise (60)).
2. `bun /tmp/r10_visible_probe.ts` — brute-forced every 4-member combination of 12 plausible
   zones × {60, 90, 120}m: **253 combinations put a sleeping-member slot inside the visible
   top-6 panel ranked above an all-awake slot**.
3. `bun /tmp/r10_dom_probe.ts` — rendered-DOM confirmation (test-dom, the real render path):
   team [America/Los_Angeles, America/New_York, Asia/Singapore, America/St_Johns], 120m —
   the panel shows `#1: 16:00 UTC · 3 working / 0 shoulder / 1 sleeping · disruptive (60)`
   above `#3: 23:00 UTC · 0 working / 4 shoulder / 0 sleeping · compromise (60)`. The app's
   **top recommendation is a slot where someone is asleep, above a slot where everyone is
   awake** — the exact flavour of wrong answer `## What we're solving for` warns about
   ("hiding that one teammate is being scheduled at 3:00 AM").

Fix: the sort key must be `(slotHasSleepingMember, score desc, startUtc)` — i.e. zero-sleeping
slots first, then score. One change in `recommender.ts:42`.

**Answer-key gap (same blocking item):** no `V` row pins R10's ordering, which is why three
green runs and two prior reviews missed it. The builder should propose **V74**, stated as a
DOM/API-observable fact, e.g.: for the team [Los Angeles, New York, Singapore, St John's] at
120m on 2025-06-18, no returned slot containing a sleeping member ranks above any slot with
zero sleeping members, and the top-ranked slot is 2025-06-18T23:00:00Z (all four shoulder,
compromise). Derivation: V48/V49 tie at 60; zero-sleeping-first is R10's primary key.

**Concomitant suite finding:** the generated suite's only enforcement of this contract —
`expect(violations).toEqual([])` in "R10: slots with no sleeping member rank above every slot
that has one, and ties rank by score" (`bcca0d92.test.ts`) — was **removed** (see
suite_changes.diff, unexplained in the envelope). The delivered code *passes* that assertion
as written (probe 1), so the removal was unnecessary as well as unexplained. Restore it and
extend it to a 4-member team where the 60/60 tie is live (the current WORLD_TEAM version can
never fail: with 3 members the maximum sleeping score is 51⅔ < the minimum awake score of 60,
so it no longer tests the contract at all once restored alone).

## Everything else — met (evidence per requirement)

- **R1 add/view/edit/remove** — met. V71/V73 swept in the rendered DOM (edit-in-place,
  reclassification shoulder→working, interrupted-edit Add); member-mutating paths all clear
  `editingId` (main.ts:308/400/436/522, loadState default :86); remove covered by generated
  suite (171 pass).
- **R2 presets** — met. The three exact names ship in `presets.ts`; V73 loads Global Core
  (exactly 3 rows); V70 exercises Americas & EMEA; generated R2 tests pass.
- **R3 conversion / DST / fractional offsets** — met. V1–V19, V57, V58 all pass
  (sweep lines 1–19, 66–68); offsets are derived from tzdata, never hardcoded (timezone.ts:36).
- **R4 day shifts** — met. V5/V6/V13/V14–V19 pass; generated test asserts day shift on all 72
  grid cells.
- **R5/R6 classification across all six durations** — met. V28–V43, V60–V66 pass; half-open
  intervals honoured (V34/V36/V65).
- **R7 scoring tiers** — met. V44–V52, V68, V69 pass; any sleeping member forces `disruptive`
  (scoring.ts), never optimal/good.
- **R8 grid + selection highlight** — met. V72 swept in the DOM (exactly the hour-16 column
  marked, header and score chip too); render smoke 14/14 controls.
- **R9 inspector** — met. Generated R8/R9 tests (24 columns, per-member cells, inspector rows)
  pass; sweep exercises selection.
- **R11 controls** — met. Date input, all six durations, 12h/24h toggle, reference base
  (generated R11 tests pass; render smoke clicked every control).
- **R12 invitation + copy confirmation** — met. V56 pass; generated R12 tests (title, UTC
  reference, copy toast) pass.
- **R13 .ics + Google Calendar** — met. V53/V54/V55/V59 pass; .ics download wired
  (main.ts:653 ff); Google URL asserted against the raw href (%2F intact).
- **R14 fairness** — met. V67 = 1320 (per accepted A2), V70 = 540; burden + rotation
  guidance tests pass.
- **R15 persistence** — met. Generated R15 reload test passes (fresh module re-import, storage
  re-read).

## Value sweep

Ran `bun adws/adw_data/sessions/r2note/context_handoff/value_sweep.ts` — **82 passed, 0
failed** (V1–V73: 71 domain rows + 11 DOM assertions over V71–V73). Frozen sections verified
byte-identical to `specs/bcca0d92_timezone-meeting-planner.md` (diff shows only Team-notes
growth). Grading command `bun test apps/app/app.test.ts apps/app/tests/generated/bcca0d92.test.ts`
→ 171 pass / 0 fail. `uv run adws/adw_modules/render_smoke.py apps/app --json` → passed, 14/14
controls. No `Intl` display-name strings are used for user-visible values (offsets are
computed numerically, timezone.ts:44-52) — no engine-stability exposure.

## Amendments

- **A4 (V73): accepted** — ruling already recorded in plan.md; I re-verified the fix
  (main.ts:308) and the V73 sweep checks pass end to end. No amendment remains proposed.
- The A4 ruling stands; the *approval* recorded in the earlier review_3 team note does not —
  it was written before the R10 ordering defect was found, and is superseded by this review.

## Why this cannot ship as-is

The recommender is the app's headline promise ("find times that work for everyone"). With a
shipped one-click preset (APAC Triangle) and with hundreds of ordinary 4-member teams, the
app's first recommendation is a slot where a teammate is asleep, ranked above a slot where
everyone is awake. The fix is one sort key; the coverage fix is one restored-and-extended
assertion plus a proposed V74.