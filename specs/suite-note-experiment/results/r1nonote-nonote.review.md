# Review 3 (final) — Distributed Team Timezone Meeting Planner

**Verdict: NOT approved.** One blocking finding (R10). Everything else the effective spec
asks for is delivered and verified end to end — 73/73 effective value rows, 14 of 15
requirements met, and the one gap is a one-comparator fix plus a coverage hole in the
executable answer key.

A note on the handoff: the `plan.md` copy in this session already carried a
"review_3: APPROVED" team note and an A4 ruling before this review ran. I did not take
that as my verdict — I re-checked everything independently. My own team note appended to
`## Team notes` supersedes that pre-seeded note, and records my concurrence with the A4
ruling after re-verification.

## The blocking finding — R10's ordering rule is not implemented

**R10 (frozen):** "calculate and display ranked candidate meeting slots for the selected
date and duration, **sorted by zero sleeping members first** and highest team score."

**The code:** `apps/app/domain/recommender.ts:33-36` sorts candidates by score descending,
then earliest start. There is no "zero sleeping members first" primary key. The sleep
penalty (15 per sleeper, inside `scoreTeamSlot`) demotes sleeping slots *on average*, but
it does not order them below every zero-sleeping slot:

- For a team of n members, the best score a slot with one sleeper can reach is
  85 − 100/n (e.g. 9 working + 1 sleeping = 75 at n=10). The worst score a zero-sleeper
  slot can have is 60 (everyone shoulder). So **for every team of 5 or more members, a
  slot where someone is asleep can outscore — and therefore rank above — a slot where
  everyone is awake.**
- At n = 4 the tie already breaks it: 3 working + 1 sleeping = 60 = 4 shoulder, and the
  earliest-start tiebreak can put the sleeping slot first.

**Demonstrated, domain level** (`bun /tmp/r10_probe2.ts` against the delivered code):
a realistic 10-person team — 9 in Europe/Berlin on standard hours, 1 in
America/New_York sleeping 03:00–11:00 — has its best everyone-awake slot at 15:00Z
(score 64, compromise). The recommender's top 6 are all 07:00–12:00Z (score 75,
**disruptive**, 1 sleeping), and 15:00Z is ranked below them.

**Demonstrated, rendered UI, real Chromium** (`render_smoke.py --eval /tmp/r10_browser.js`):
with that team loaded through the app's own controls, the "Recommended slots" panel
displays exactly six recommendations, **all six** reading "9 working / 0 shoulder /
**1 sleeping** · disruptive (75)", and **zero** of the everyone-awake slots. The one
slot where nobody is asleep is not shown at all. The panel recommends, first and only,
times at which one teammate is asleep — the exact "plausible wrong answer" the spec's
"What we're solving for" names ("hiding that one teammate is being scheduled at 3:00 AM").

This is invisible in every preset team (3–4 members, where score-only ordering happens to
imply zero-sleep-first: max sleeper score 52 < 60 at n=3), which is why every earlier
green run and every earlier review missed it. It needs a 5+-member team to expose.

### Why this is blocking and not a nitpick

The requester asked for an app that "helps teams find times that work for everyone."
The recommender is that feature; R10's frozen text states the ordering; and the failure
mode is not a cosmetic mislabel — the good slots are *absent from the delivered
recommendations* precisely for the large, spread teams the app exists to serve. The tier
labels are honest (the bad slots do read "disruptive"), but the ranking — the thing the
user asked the app to do for them — puts the wrong slots first and cuts the right ones off.

### What the fix is, and what the answer key still needs

1. **Code** — `recommender.ts`, one comparator: primary key = sleeping-count ascending
   (zero sleeping first), then score descending, then earliest start.
2. **Answer key** — the effective spec has **no V row for R10's ordering**, so this
   defect was invisible to every value sweep, including mine. The builder should propose
   an amendment adding rows that pin it, e.g.:
   - V74: `findBestMeetingSlots` for the 5+-member team above must return the 15:00Z
     zero-sleeping slot ranked above every slot with a sleeping member, even though the
     sleeping slots score higher (75 vs 64).
   - V75: the n=4 tie case (3 working/1 sleeping vs 4 shoulder, both 60) ranks the
     zero-sleeping slot first.
3. **Executable suite** — the generated test whose *title* is this exact rule
   (`bcca0d92.test.ts:493`, "slots with no sleeping member rank above every slot that
   has one, and ties rank by score") computes a `violations` array and **never asserts
   it** — the test is green no matter what the recommender does. That missing assertion
   must be added (with an in-file comment, per the A2 precedent for correcting the
   generated suite), and a durable test added in `apps/app/app.test.ts` alongside the
   new V rows.

## Requirements ruling (effective spec: frozen sections + accepted A1–A4)

| Req | Met | Evidence |
|---|---|---|
| R1 add/view/edit/remove members with zone + hours | **yes** | Add: real-Chromium eval (`rowCount_after_add` 1; V73's Ivy add). View: participant rows with name/zone. Edit: `member-edit` → form populated, "Save changes", in-place rewrite, reclassification shoulder→working at 16:00Z for Kathmandu (V71, Chromium + sweep). Remove: `member-remove` (main.ts:379-386, clears `editingId` if it removes the edited member); render smoke clicked 14/14 controls incl. remove. |
| R2 three named presets | **yes** | Chromium eval `preset_options` = exactly "Americas & EMEA", "Global Core: SF + London + Tokyo", "APAC Triangle: India + Singapore + Tokyo + Sydney"; Global Core loads 3 rows (V73). |
| R3 accurate conversion, DST, fractional offsets | **yes** | V1–V19, V57, V58 all PASS (sweep). Offsets derived from `Intl` tzdata (timezone.ts), never hardcoded. |
| R4 day-shift indicators | **yes** | V5, V6, V13–V19 PASS; Chromium: cell "01:45 +1d", `data-day-shift="1"`; inspector "2025-06-19 (+1d)". |
| R5 working/shoulder/sleeping classification | **yes** | V28–V43, V60–V66 PASS; half-open intervals, midnight wrap handled. |
| R6 all six durations | **yes** | `DURATIONS = [15,30,45,60,90,120]` (types.ts:30); V32/V33 (30m), V60–V66; dropdown offers all six. |
| R7 scoring tiers, sleep never optimal/good | **yes** | V44–V52, V68, V69 PASS; `scoring.ts`: sleeping > 0 ⇒ disruptive, regardless of average. |
| R8 24-hour grid with score chips, color cells, selection highlight | **yes** | 24 hour-header columns + hour-score chips + per-member clock cells (Chromium eval); selection: V72 — hour-16 cells `class selected` + `data-selected` on cells/header/score, 0 others selected (Chromium, 2-member team: both members' cells marked). |
| R9 active slot inspector | **yes** | Chromium eval: inspector rows "Zed 21:45 - 22:45 2025-06-18 Asia/Kathmandu (UTC+05:45) working" and "Ana 04:00 - 05:00 2025-06-19 (+1d) … sleeping". |
| R10 recommender ranked, **zero-sleeping first** | **NO** | Blocking finding above. Score-only sort (recommender.ts:33-36); sleeping slots outrank zero-sleeping slots for n≥5 teams (and the n=4 60/60 tie), verified domain-level and in the rendered panel in real Chromium. |
| R11 parameter controls | **yes** | `<input type="date">` (main.ts:171), duration select, 12h/24h toggle (Chromium: cell "9:45 PM" ↔ "21:45"), reference-base select (UTC / Organizer local). |
| R12 copy-paste invitation with confirmation | **yes** | V56 PASS; Chromium: invitation text "UTC reference: 2025-06-18 16:00 UTC" + attendee lines with [Working]/[Sleeping]; copy click → toast "Invitation copied", class "toast visible". |
| R13 .ics + Google Calendar | **yes** | V53–V55, V59 PASS (DTSTART/DTEND RFC 5545, raw `dates=…%2F…` in href — asserted on the raw href per the review_1 lesson); Chromium: Google href `dates=20250618T160000Z%2F20250618T170000Z`; download-ics clicked clean in the real-browser smoke. |
| R14 fairness: span + burden + rotation guidance | **yes** | V67 (1320), V70 (540) PASS; Chromium: "Timezone span: 6h 15m (375 minutes)" for Kathmandu+Auckland (720−345=375 ✓), per-member shoulder/sleeping counts, rotation guidance sentence. |
| R15 persistence via localStorage + URL hash | **yes** | Chromium: hash `#date=2025-06-18&duration=60`, localStorage holds date + members (Sam/Leo/Tomo/Ivy after the V73 flow); `loadState` re-reads storage, and the generated suite's reload test re-imports the entry fresh. |

## Value sweep

Sweep script: `bun adws/adw_data/sessions/r1nonote/context_handoff/value_sweep.ts`
(it boots the real rendered app via `test-dom` for the DOM rows). Result: **82 checks,
82 passed, 0 failed, exit 0** — every effective V row V1–V73 (frozen table + accepted
A1/A2/A3/A4). Full expected-vs-actual output is in the review report JSON; the row-by-row
table is reproducible by re-running the script.

In addition, the DOM-channel rows (V71–V73) and every page-read value (grid cell times,
day-shift badges, 12h toggle, inspector, invitation, Google href, toast, fairness text,
preset names, persistence) were re-read in **real Chromium** via
`render_smoke.py --eval` (fresh page per hash), not only in happy-dom. The real-browser
control smoke also passes: 14/14 controls clicked, 0 unreachable/blocked, no console
errors, no dead-text rings.

## Traps sweep

- Hardcoded DST offsets — V1–V6, V57/V58 PASS; offsets come from `Intl` per-instant. Cleared.
- Truncated fractional offsets — V8–V13 PASS; offsets kept in minutes. Cleared.
- Missing day shifts — V14–V19 PASS; badges rendered in Chromium. Cleared.
- 12h AM/PM at midnight/noon — V20–V27 PASS; "9:45 PM" in Chromium. Cleared.
- Naive sleep condition across midnight — V31–V33, V37, V38 PASS (minute-by-minute over
  half-open segments). Cleared.
- Start-time-only evaluation — V35, V37, V38, V60–V66 PASS (full duration evaluated). Cleared.
- Average masking a sleeper — V49–V52, V68, V69 PASS; tier is sleeper-count-driven. Cleared
  for *scoring* — but note the recommender-ordering defect above is the same trap resurfacing
  in a channel (rank order) no V row covered. This is the one trap the answer key let through.

## Amendment rulings

A1, A2, A3: already ruled accepted (review_1/review_2); the effective values V57–V70, V71–V72
verified again by this sweep. A4 (V73): the handoff copy already carried an "accepted by
reviewer (review_3)" ruling; I independently re-verified V73 in the sweep and in real
Chromium and the derivation is sound — the ruling stands, recorded in my team note.
No amendment is left `proposed`. No new amendment is proposed by this review (the V74/V75
rows named above are for the builder to propose in revision, keeping two members on the
answer key).

## What the builder must do (revision)

1. `apps/app/domain/recommender.ts` — make the sort's primary key the sleeping count
   (ascending), then score descending, then earliest start.
2. Propose an amendment adding V rows that pin the ordering (suggested V74/V75 above, or
   equivalent rows of the builder's own derivation).
3. Add the missing assertion to the generated R10 ordering test (`bcca0d92.test.ts:493`)
   — assert `violations` is empty — and add a durable test in `apps/app/app.test.ts` for
   the new rows, so the rule is executable in both suites.

Everything else needs no change; the rest of the app is verified and solid.

— reviewer (review_3)
