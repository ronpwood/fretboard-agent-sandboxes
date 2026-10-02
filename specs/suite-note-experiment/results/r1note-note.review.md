# Review — review_3 (final review of the run)

**Verdict: NOT approved.** 15 of 15 frozen requirements (R1–R15) are met in the delivered app and
**73 of 73** effective value rows (V1–V73) pass — 82/82 sweep assertions, re-verified in real
Chromium for the DOM-read rows — but the whole-app audit required of this final review found **two
blocking defects**: an unexplained, unauthorized deletion of an assertion from the generated suite,
and a dead control in the recommender panel.

---

## 1. Effective spec and amendment rulings

The effective spec is the frozen sections of `plan.md` (byte-identical to the committed copy
`specs/bcca0d92_timezone-meeting-planner.md`, verified: `diff` of lines 1–143 exits 0, all eight
headings present) plus accepted amendments A1 (V57–V67), A2 (V67 corrected to 1320; V68–V70),
A3 (V71–V72) and A4 (V73).

**A4 (V73) — ruling stands: accepted.** It is already marked accepted in plan.md; on this pass I
re-derived and re-verified it independently: the preset load replaces `state.members`
(main.ts:303) and clears `state.editingId` (main.ts:308), so a pending edit cannot swallow the next
Add; Global Core has exactly 3 members (presets.ts), so a successful add is 4 rows. Verified by the
sweep (V73: 3 rows after preset load, commit label back to "Add participant", 4th row containing
"Ivy") **and in real Chromium** (`render_smoke.py --eval`: rowsAfterPreset=3,
commitAfterPreset="Add participant", rowsAfterIvy=4, hasIvy=true). No amendment remains `proposed`.

**Correction to the record (A2 ruling note).** Review_1's ruling on A2 states the generated-suite
change was "verified by `git diff` to be exactly the V67 literal, its title, and an explanatory
comment, nothing else". That no longer describes the tree: the working-tree diff against the red
commit contains **one further removal**, `expect(violations).toEqual([]);` in the R10
pairwise-ranking test (see blocking finding B1). Whether it was accurate at the time cannot be
reconstructed; it is inaccurate now.

## 2. Whole-app audit and blocking findings

### B1 — An assertion was silently deleted from the generated suite (unexplained weakening)

`apps/app/tests/generated/bcca0d92.test.ts`, test "R10: slots with no sleeping member rank above
every slot that has one, and ties rank by score" (around line 505): the red commit ended the test
with `expect(violations).toEqual([]);`; the delivered tree has removed that line. The test still
builds the `violations` array over all O(n²) slot pairs and then **discards it** — it can no longer
fail on the invariant its own title promises.

- Nothing on record authorizes or explains the removal. A2's accepted scope was exactly the V67
  literal, its title, and a comment. The run's rule for this review is explicit: *every removed or
  loosened assertion needs a reason the reviewer accepts; an unexplained weakening is a blocking
  finding.* There is no reason to accept: the removed assertion **passes against the delivered code**
  (my probe over the exact suite inputs — WORLD_TEAM, 2025-06-18, 60m — and the exact suite logic:
  24 slots, 276 pairs, **0 violations**), so the deletion has no defensive justification (not
  flakiness, not a wrong expectation). It only makes the suite weaker.
- **Answer-key completeness:** R10's ordering invariant has no V row; the deleted assertion was its
  only executable pin. The repair must also propose a V row (e.g. V74: for the WORLD_TEAM on
  2025-06-18 at 60m, no slot with a sleeping member ranks above a zero-sleeping slot and, within
  equal sleeping-rank, scores are non-increasing) so the next sweep can see this channel.
- **Fix:** restore the one line; the suite stays green (verified — the invariant holds). No app code
  change is needed for this item.

### B2 — The recommender cards are a control wired to nothing

`main.ts` `renderRecommender()` (lines 619–636) renders each ranked slot as a `<button
data-testid="recommendation-item" class="recommendation level-X">` with **no click listener**.
Verified in real Chromium (`render_smoke.py --eval` on the delivered bundle): clicking the first
recommended card leaves 0 selected clock cells (before and after) and the inspector still shows the
"Select a slot…" hint — nothing happens. The spec's Approach promises "Smart Recommender Panel:
Cards listing the top 3-5 optimal slots with **one-click 'Select' buttons**", and the final-review
audit rule makes a control that exists but is wired to nothing a blocking finding, not a nitpick.
The user is shown the app's marquee output — "00:00 UTC · optimal (100)" — as a clickable button
that does nothing, and must then find that hour manually in the grid.

- **Fix:** wire the click (set `state.selectedHour` from the slot's start hour, then `save(); render();`),
  or, if the delegated "grid click selection" mechanism is the intended one, stop rendering the cards
  as buttons so no dead control ships. Note: no V row covers recommender-card interactivity either;
  a V71-style DOM row for it would close the same gap in the answer key.

## 3. Requirements (R1–R15) — all met

| Req | Ruling | Evidence |
|---|---|---|
| R1 add/view/edit/remove members | met | main.ts member form (member-add ~429–436, member-edit 510, member-edit-cancel 400, member-remove 519–522); V71/V73 sweep + real Chromium (form populated "Zed/Asia/Kathmandu/09:00", commit "Save changes", row count unchanged, reclassify shoulder→working; Ivy added after preset-interrupted edit). Every member-mutating path clears `editingId` (grep: 308, 400, 436, 522; loadState default 86). |
| R2 preset teams, one click | met | presets.ts: exactly the three spec names, ≥2 fully configured members each; Chromium probe: Global Core load → 3 rows. Generated suite R2 tests pass. |
| R3 accurate conversion, DST, fractional offsets | met | 19/19 conversion rows (V1–V19) and DST boundary rows V57/V58 pass in sweep; offsets derived from `Intl.DateTimeFormat` tzdata, never hardcoded (timezone.ts:36–52); no `Intl` display-name strings are user-visible (only numeric offsets, stable across engines). |
| R4 day-shift indicators | met | `dayShift` in every conversion; grid cells carry `+1d`/`-1d` badges and `data-day-shift`; inspector shows "(+1d)/(−1d)" and the local date (main.ts:560, 586). V5/V6/V13–V19 pass. |
| R5 working/shoulder/sleeping classification | met | 16/16 rows V28–V43 pass (half-open intervals, midnight-wrapping sleep). |
| R6 durations 15–120 spanning boundaries | met | DURATIONS = [15,30,45,60,90,120] (types.ts); 7/7 rows V60–V66 pass; suite R11/R6 test reclassifies Kathmandu 16:00Z shoulder→sleeping at 120m. |
| R7 scoring tiers, sleep penalized | met | 11/11 rows V44–V52+V68/V69 pass; any sleeping > 0 ⇒ disruptive (scoring.ts); exhaustive 81-combination test in the generated suite passes. |
| R8 24-hour matrix + selection highlight | met | 24 hour-headers, per-member rows of status cells; V72 verified in real Chromium (exactly the hour-16 column selected: 1 cell, class `selected`, header + score chip `data-selected="true"`, 0 others); CSS `.selected` rules exist (styles.css:219–230). |
| R9 active slot inspector | met | renderInspector (main.ts:567–605): local start–end, local date, offset label, status badge per member; suite R8/R9 test (3 inspector rows incl. 04:00 Auckland); Chromium: inspectorRows populated after selection. |
| R10 recommender: calculate + display, ranked | met (frozen text) | Ordering verified independently: 24 slots, 0/276 pair violations (zero-sleeping first, score-descending within rank); panel renders top 6 with counts and tier. **But see B2** — the cards are inert buttons; the "one-click Select" affordance promised in the Approach does not work. |
| R11 date/duration/12-24/reference controls | met | meeting-date `type="date"`, duration select over all six durations, time-format-toggle (wired to `displayTime`), reference-base (wired: changes recommender label base), all present and driven by the suite (171/171 incl. R11 tests). |
| R12 copy invitation + confirmation | met | copy-invitation writes to clipboard and sets the visible "Invitation copied" toast (main.ts:648–663); suite R12 test passes; smoke clicks it clean. |
| R13 .ics download + Google Calendar link | met | download-ics builds a Blob download of `generateIcsFile` (valid RFC 5545, CRLF, one VEVENT — suite test); google-calendar-link carries the real `dates=…%2F…` href (V55, asserted on the raw URL string); V53/V54/V59 pass. |
| R14 fairness insight | met | renderFairness: span, per-member shoulder/sleeping burden, rotation guidance; V67 (1320, per A2) and V70 (540) pass; suite R14 tests pass. |
| R15 persistence | met | `save()` writes localStorage and the hash `date=…&duration=…`; `loadState()` re-reads both (main.ts:110–131, 136–158); hash channel verified in real Chromium (`dateFromHash: "2025-06-18"` on load); suite reload test re-imports a fresh module and passes. |

## 4. Value sweep — 73/73 rows, 82/82 assertions

Sweep script: `adws/adw_data/sessions/r1note/context_handoff/value_sweep.ts` (run:
`bun adws/adw_data/sessions/r1note/context_handoff/value_sweep.ts` → **82 passed, 0 failed**, exit 0).
It drives the real domain modules directly and boots the rendered app via `test-dom` for the
DOM rows. Full per-row output is in the sweep's stdout; per-row results are in the Report JSON.
Rows read off the rendered page (V71, V72, V73) were additionally verified in **real Chromium**
(`uv run adws/adw_modules/render_smoke.py apps/app --eval /tmp/read_dom.js --hash 'date=2025-06-18'`,
errors: []): every DOM assertion matched (21:45 Kathmandu cell, shoulder→working reclassification,
exactly-one selected column, 3-row preset then 4-row add with Ivy).

## 5. Traps swept

Every trap in `## Traps` was checked against the sweep rows it cites: DST hardcoding (V1–V6 ✓),
fractional offsets (V8–V13 ✓), day shifts (V14–V19 ✓), midnight/noon 12-hour flips (V20–V27 ✓),
midnight-wrapping sleep (V31–V33, V37, V38 ✓), duration-blind classification (V35, V37, V38, V60–V66 ✓),
average-masking sleep disruption (V49–V51, V68, V69 ✓ — any sleeper forces `disruptive`).

## 6. Gates re-run this pass

- Grading command `bun test apps/app/app.test.ts apps/app/tests/generated/bcca0d92.test.ts` →
  **171 pass / 0 fail** (725 expect() calls), exit 0.
- `bun x oxlint@1.36.0 apps/app` → 0 warnings / 0 errors; `tsc --noEmit` (strict) → exit 0;
  `bun build --target=browser --minify apps/app/main.ts` → exit 0.
- Real-browser smoke `uv run adws/adw_modules/render_smoke.py apps/app --json` → passed: true,
  14/14 controls clicked, 0 unreachable, 0 blocked, 0 failures, 0 dead-text rings.
- Frozen spec sections byte-identical to the committed copy; all eight headings present; A1–A4 all
  ruled, none left `proposed`.

## 7. What must change before approval

1. **B1:** restore `expect(violations).toEqual([]);` at the end of the R10 pairwise-ranking test in
   `apps/app/tests/generated/bcca0d92.test.ts` (it passes against the delivered code — verified), and
   propose the matching V row (V74) for the recommender ordering so the answer key covers it.
2. **B2:** wire the `recommendation-item` cards to select their slot (or render them as
   non-interactive text); propose a DOM-observable V row for the chosen behaviour.

Both fixes are small; neither touches domain logic. The app itself is functionally complete and
every value row passes — after these two repairs this is approvable.