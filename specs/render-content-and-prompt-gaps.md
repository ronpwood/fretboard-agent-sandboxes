---
plan: render-content-and-prompt-gaps
created: 2026-09-23T08:33:36-07:00
modified:
  - 2026-09-23T08:33:36-07:00
  - 2026-09-23T09:05:00-07:00
  - 2026-09-23T09:40:00-07:00
  - 2026-09-23T10:20:00-07:00
  - 2026-09-23T09:35:24-07:00
commits:
  - 45ac892
  - 7d0b92c
  - 8494357
  - 109ca75
  - 266486c
  - 290ee37
  - 772bb26
  - 062cb94
  - f9c3587
  - 4e0a5c8
agents:
  - claude-opus-5-5
sessions:
  - 098f5599-88b9-43e1-9fed-2ba4233f8b62
back_refs: []
forward_refs:
  - specs/context-rot-and-self-compact.md — its baseline arm runs on the harness this plan delivers
status: complete
---

# Plan: Render smoke sees content, and the prompts close the gaps hfix exposed

## Purpose

Close the three cheapest, highest-value gaps `hfix-20260920-062b46` exposed, all without
provisioning anything: make `render_smoke.py` stop discarding the evidence it already collects and
measure what was *painted*, not only which controls exist; give the builder a working way to see
the app and the exact command that grades it; and teach the reviewer the bug class it caught once
and missed once in the same app. NEXTSTEPS items 1, 2, 3 and 4(3).

## Problem

Third run in a row where the smoke passed a visibly broken app (gf3-6 swallowed clicks, fixval's
330° wheel, hfix's two defects). Evidence from hfix, all verified in the harvested tree and traces:

1. **The smoke saw the wheel defect and threw it away.** Playwright's click on a wheel segment
   returned `<text class="label">G</text> intercepts pointer events` × 58 retries, timed out, and
   `render_smoke.py:410-416` does `except Exception: continue`. Reachability (assertion C) passed
   because it asks whether *any* grid point reaches the control, and each segment's rim was bare.
   Both concessions are deliberate and documented in the docstring. Centre-only testing was
   **measured and rejected** because it flagged gf3-2, which works. So the fix is not to tighten C.
   It needs a new, narrower signal.
2. **Every note badge computes to `rgb(148,163,184)`.** `fretboard.ts:120` writes a per-role
   `fill` presentation attribute, and `styles.ts:171` `.note-badge { fill: var(--text-muted) }`
   overrides it, because CSS beats presentation attributes. Nothing measures computed style.
3. **The builder could not get a rendering.** Correcting CHANGELOG 2026-09-20d: the builder did
   *not* discover `render_smoke.py` unprompted. `builder/system.md` has advertised it since
   `2bc8aad` (2026-09-19), along with "a screenshot you actually read — Playwright to
   `page.screenshot()`". What the prompt never says is how the app is **served**. The builder
   hand-rolled `python -m http.server` (which cannot serve the TS bundle), burned four calls and
   gave up. The one tool that already boots the right server, `render_smoke.py`, cannot save a
   screenshot.
4. **The builder never gets the grading command.** The test_designer's prompt names it
   (`bun test <app.test_file> <generated file>`, one process). The builder's does not (open item
   2026-09-20b (3)). The builder also wrote three durable assertions that pin the defective output
   (`app.test.ts:423-436`).
5. **"Matched on one attribute, ignored the one that distinguishes."** `voicingFor` gave F#m the F
   *major* barre shape, and the fretboard lit both the minor and major third. Same class, two
   modules, one app. The reviewer caught one instance and marked the other requirement met.

## Solution

**Measure first, fail only after calibration.** Every new smoke signal lands as a *reported
measurement* in `--json` output and in the human summary. It is promoted to a verdict failure only
after a corpus run shows zero hits on known-good apps and a hit on the known-bad fixture. This is
the docstring's own bar ("FALSE POSITIVES ARE THE FAILURE MODE TO FEAR"), and it follows
[[measure-dont-eyeball]]: hit-test and read computed style, never regex.

Two new signals, both designed like assertion E (a *symmetric sibling* signature, so a single odd
element never fires them):

- **G — dead text over a control ring.** For each control, count the grid points that land on a
  text-bearing element that is *not* inside the control and *not* itself interactive. Fire only when
  **≥3 sibling controls** (same tag + class) **all** have such an overlay. hfix's wheel is 12
  segments, each covered by its own non-interactive `<text class="label">`. gf3-2's labels are
  *inside* its wedge buttons (descendants), so it cannot fire. gf3-6's sectors are not controls at
  all, so it stays out of scope, exactly as the docstring says it should.
- **F — presentation attribute overridden by CSS.** Group SVG elements that carry a `fill` (and
  separately `stroke`) *attribute* by tag + class. In a group of ≥3, if the attribute values take
  ≥2 distinct values and the **computed** values take exactly 1, the author's colours never reach
  the screen. That is always a bug: nobody writes twelve distinct fills in order to have them
  discarded. hfix's 96 badges are the reference hit.

Plus one measurement that is never a failure: **`click_blocked`**. Stop discarding click
timeouts. Record the control and, when Playwright names one, the intercepting element.

For the builder, **extend the instrument rather than teach a new one**. `render_smoke.py` already
boots `bun index.html` on a free port with the right chromium flags. Add `--screenshot <path>`
and point the prompt at it. That replaces the vague "Playwright to page.screenshot()" bullet with a
command that works on the first try.

For the reviewer, one **payload-agnostic** checklist item. The target leak check forbids payload
names in synced files, and the factory must stay app-neutral, so the wording describes the
mechanism, not guitars.

## Relevant Files

### Existing — modified
- `adws/adw_modules/render_smoke.py` — `click_blocked` capture; assertions G and F in `PROBE_JS`; `--screenshot`; verdict wiring after calibration; docstring records the corpus result
- `adws/adw_data/prompt_engineering/builder/system.md` — screenshot command, how the app is served, grading command for TDD chains, "durable tests encode the spec, not your output"
- `adws/adw_data/prompt_engineering/reviewer/system.md` — lossy-key check and sibling sweep
- `TREE.md` — one-line update to the `render_smoke.py` entry (now A–G + screenshot)
- `NEXTSTEPS.md` — result entry once validated (single pass with the build, per [[verify-and-document]])

### Existing — deleted
- none

### New
- `sandbox_mount/host/render_smoke_corpus.sh` — extracts each harvested app from `../greenfield-sandboxes` `refs/sandbox/*` into the scratchpad, runs the smoke with `--json`, and prints one row per app. It is the calibration instrument, and it is kept so future assertions are calibrated the same way

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

### Phase 1: Corpus harness and baseline

Build the calibration instrument **before** touching the smoke, and record today's verdicts, so every
later change is a diff against a measured baseline.

#### 1. Corpus script

- [x] Write `sandbox_mount/host/render_smoke_corpus.sh <repo> <out_dir> [ref...]`. For each ref (default: all `refs/sandbox/*` in `<repo>`), `git -C ../greenfield-sandboxes archive <ref> | tar -x -C <out_dir>/<id>`, run `bun install --frozen-lockfile` if a lockfile exists, run `uv run adws/adw_modules/render_smoke.py <out_dir>/<id>/apps/app --json > <out_dir>/<id>.json`, and print `id  passed  controls  unreachable  sectorFaults` (plus new fields as they land)
- [x] Confirm the app dir per ref: greenfield payloads live at `apps/app`; skip and print any ref where `apps/app/index.html` is absent rather than failing

#### 2. Known-bad fixtures

- [x] `hfix-nopointer`: the hfix tree with the builder's `pointer-events` fix reverted. Locate it with `rg -n "pointer-events" apps/app/src`, remove the `none` on labels/numerals, and save the patch as `<out_dir>/hfix-nopointer.patch` so the mutation is reproducible
- [x] `hfix` as delivered is the F fixture (the badges are one colour in the delivered snapshot)
- [x] Existing references stay in: `fixval` (E must still fire), `gf3-5` (C must still fire)

#### 3. Baseline

- [x] Run the corpus on current `render_smoke.py`; save the table into this plan's Notes via sync. Expected: fixval and gf3-5 fail, everything else passes, including both hfix variants. That is the gap on record

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `sandbox_mount/host/render_smoke_corpus.sh ../greenfield-sandboxes $SCRATCH/corpus` — exits 0 and prints one row per ref; proves the harness runs end to end locally (bun + uv + chromium on macOS)
- [x] fixval row shows `sectorFaults` ≥1 and gf3-5 shows `unreachable` ≥1 — proves the harness reproduces known verdicts, so it can be trusted for new ones
- [x] `hfix-nopointer` and `hfix` rows both `passed: true` — proves the baseline reproduces the gap

### Phase 2: New measurements (report-only)

#### 1. `click_blocked`

- [x] In the click loop, replace the bare `continue` with an append to `report["click_blocked"]`: `{control, occluder}`, where `occluder` is parsed from Playwright's `(.+?) intercepts pointer events` when present, else `null`. Keep `continue`, because this is not a failure
- [x] Print a count in the human summary line; the full list only under `--json`

#### 2. Assertion G — dead text over a control ring

- [x] In `PROBE_JS`'s `probe()`, for each grid point whose hit is not `el`/descendant, classify the hit as *dead text*: it is (or is inside) an SVG `text`/`tspan`, or an HTML element with non-empty own text; it has no interactive ancestor (reuse `isInteractive` up the chain); and it has computed `pointer-events` ≠ `none`. Count such points per control as `deadTextPoints` and record the first occluder descriptor
- [x] Probe the **full grid** for this count even when the control is already reachable. Today `probe()` returns on the first reaching point; G needs the whole grid. Split the function so C keeps its early exit
- [x] Aggregate: group controls by `tag + first class`. Emit `deadTextRings: [{group, controls, withOverlay, occluder}]` for groups with ≥3 members; mark `fault: true` when `withOverlay == controls`

#### 3. Assertion F — attribute colour overridden

- [x] In `PROBE_JS`, for `fill` and `stroke` separately: over every SVG element with that attribute set (excluding `none`, `transparent`, `currentColor` and `url(...)`), group by `tag + class`. For groups of ≥3, record `{group, prop, n, attrDistinct, computedDistinct, computed}`. Mark `fault: true` when `attrDistinct ≥ 2 && computedDistinct == 1`
- [x] Also record, report-only, per `data-role` grouping: distinct roles vs distinct computed fills. This is the "legend advertises N colours" measurement from NEXTSTEPS item 1. It is a secondary signal and never a failure

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] Re-run the corpus: `hfix-nopointer` shows a `deadTextRings` entry with `fault: true` naming `text.label` — proves G catches the reference defect
- [x] `hfix` shows an F entry with `fault: true` for the note-badge group, `attrDistinct ≥ 5`, `computedDistinct == 1` — proves F catches the reference defect
- [x] `hfix-nopointer` shows `click_blocked` non-empty with an `occluder` — proves the discarded evidence is now kept — (was `fail`, blocked by D's stale-handle defect; CLOSED by Phase 2b: 15 blocked clicks each name the key label) (see amendment 09:40): the wheel clicks never happen, so nothing can be intercepted. Evidence capture is in place and verified by code path; it becomes observable once D re-probes (proposed Phase 2b)
- [x] **Every other row: zero `fault: true` for G and F.** RESULT: F zero hits. G fired on 4 'passing' apps, and all 4 were adjudicated as REAL by click measurement, not false positives (see Notes) Any hit gets a `--screenshot` plus a computed-style read before being called a false positive or a newly found real bug. Record each in Notes
- [x] `passed` is unchanged for every row versus the Phase 1 baseline — proves nothing is wired into the verdict yet

### Phase 3: Promote to verdict (conditional)

Only the signals that came through Phase 2 clean get promoted. A signal that produced a genuine
false positive stays report-only, and the reason is written into the docstring.

#### 1. Verdict wiring

- [x] Add G and F faults to `verdict()`, each with a fix-oriented message in the style of E's: say what was measured, why it is wrong, and the one-line fix (`pointer-events: none` on the overlay; move the colour to an inline `style` or drop the CSS `fill` rule)
- [x] Update the docstring's scope list (A–E → A–G) and add a paragraph on G and F with the corpus numbers, matching how E was recorded ("Validated both ways…")

#### Validation — Phase 3

> **Loop gate.** Do not start Phase 4 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] Corpus: `hfix-nopointer` and `hfix` now `passed: false`; every previously-passing good app still `passed: true` (RESULT: the 4 G-adjudicated apps gf-3, gf2-3, gf3-4, gf4-solo also flip to false, which is correct since each is a click-verified real defect; all 12 remaining passing apps unchanged) — proves precision on the corpus
- [x] `uv run adws/adw_modules/render_smoke.py <hfix>/apps/app; echo $?` prints `1` and a readable G/F message — proves the builder-facing text, not just the JSON

### Phase 2b: D exercises every control (added 2026-09-23, approved by Ron)

Found while building Phase 2 (amendment 09:40): apps that re-render on click wiped D's handles, so
7 of 18 apps landed exactly one click.

#### 1. Re-find, then reload

- [x] When a control's `data-smoke-id` stamp is gone, re-run `PROBE_JS` and find it again by signature (group + label + ordinal among the same group/label, `_signatures`)
- [x] If it is absent from the current state (an earlier click navigated away), reload to the starting state and look there; only a control absent even from a fresh load counts as `click_stale`
- [x] Snapshot the error count AFTER any reload, just before the click, so replayed load-time console output is never blamed on a click
- [x] Report `reprobes` and `reloads` alongside `clicked N of M`

#### Validation — Phase 2b

> **Loop gate.** Do not start Phase 4 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] Fixed hfix: `clicked` 25/25 (was 1/25), `click_failures` empty — proves coverage without new noise on the reference app
- [x] `hfix-nopointer`: `click_blocked` names `<text class="label">…</text>` for the wheel segments (15 of them) — proves the interception evidence now reaches the report (closes the Phase 2 `fail` box)
- [x] Corpus: `clicked` rises across the board; every NEW `click_failures` entry is adjudicated (reproduced by hand: a real uncaught error thrown by a click handler, or an artefact of the smoke) before this is committed

### Phase 4: Builder can see, and knows how it is graded

#### 1. `--screenshot`

- [x] Add `--screenshot <path>` to `render_smoke.py`: after load and settle, before the click pass, `page.screenshot(path=…, full_page=True)`. It is written even when the verdict fails, because a failing app is when a picture helps most. Refuse a path inside the repo working tree (exit 2 with a message), consistent with the scratch-goes-to-`/tmp` rule

#### 2. Builder prompt

- [x] Replace the "a screenshot you actually read — Playwright to `page.screenshot()`" bullet with: `uv run adws/adw_modules/render_smoke.py <app-dir> --screenshot /tmp/app.png`, then read the image. Add one sentence: the app is served by `bun index.html` from its directory; `python -m http.server` cannot serve it, so never hand-roll a server
- [x] Add under Instructions: when `previous_envelope` names a generated test file, the build is graded by **one** process, `bun test <app.test_file from app.manifest.yaml> <that file>`. Run exactly that before reporting and read the per-file results, not just the exit code (same reasoning as the test_designer's line 16)
- [x] Add: a durable test you add must assert the answer the **spec** requires, derived independently of your code. A test that captures what your code currently returns can freeze a defect in place (hfix: `app.test.ts:423-436`)

#### Validation — Phase 4

> **Loop gate.** Do not start Phase 5 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `uv run adws/adw_modules/render_smoke.py $SCRATCH/corpus/hfix-20260920-062b46/apps/app --screenshot $SCRATCH/hfix.png` then Read the PNG — proves the screenshot shows the rendered app, not a blank page
- [x] `--screenshot apps/app/x.png` from the repo root exits 2 — proves the scratch rule is enforced
- [x] `rg -n 'http.server|--screenshot|app.test_file' adws/adw_data/prompt_engineering/builder/system.md` shows all three — proves the prompt edits landed

### Phase 5: Reviewer lossy-key check, then sync

#### 1. Reviewer prompt

- [x] Add a payload-neutral item under Instructions: **Lookups that drop a distinguishing attribute.** When code selects an entry by one property (a distance, an offset, an index, a name prefix), list the inputs that share that property and confirm each gets its own correct answer. The failure is a table keyed on one attribute that silently returns another variant's entry
- [x] Add a **sibling sweep**: when you find a defect, search the codebase for the same mechanism before ruling any other requirement met. One app here had the same mistake in two unrelated modules; the review caught one and approved the other

#### 2. Sync to the greenfield target

- [x] `just target sync greenfield --dry-run` passes the leak check and all four gates
- [x] **Ask Ron** before `--push`: it is outward-facing (public repo). Approved 2026-09-23; pushed as target `777d62f` (host `4e0a5c8`), verified on `origin/main`

#### 3. Record

- [x] NEXTSTEPS entry with the corpus table, the promote/keep decision per signal, and the prompt diffs; mark items 1, 2, 3, 4(3) done there

#### Validation — Phase 5

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `just target sync greenfield --dry-run; echo $?` prints `0` — proves the new wording is leak-free and the gates pass inside the target
- [x] `rg -n -i 'guitar|chord|fret|scale' adws/adw_data/prompt_engineering/reviewer/system.md` returns nothing — proves the reviewer text stayed payload-neutral (belt and braces over the leak check)

## Global Validation

- [x] `sandbox_mount/host/render_smoke_corpus.sh ../greenfield-sandboxes $SCRATCH/corpus-final` — final table: known-bad fixtures fail on the intended assertion; every other row matches the Phase 1 baseline verdict
- [x] `git diff 45ac892 --stat` touches only the files listed in Relevant Files (plus the three specs from the planning commit)
- [x] NEXTSTEPS "NEXT STEPS" section reflects which items this plan closed

## Notes

**Why not just tighten C?** It was tried. Centre-only reachability flags gf3-2's wedge buttons,
whose box centre sits over the hub. The grid-any-point rule exists because of a measured false
positive. G adds a *different* question ("is there dead text on top of this control, and is that
true for the whole ring?") without weakening C's tolerance.

**Why sibling-symmetric signatures.** E's lesson generalises: C catches asymmetric breakage, and a
fault applied identically to every member of a ring is invisible to any per-element "is anything
reachable" test. Requiring ≥3 siblings to *all* show the fault keeps a single decorative label or a
single overridden icon from firing, which is where false positives would come from.

**F's edge cases to watch in calibration.**
- A hover/active CSS rule does not apply at rest, so it cannot collapse the computed values. That is fine.
- A theme that *intentionally* repaints icons with `currentColor` overrides: excluded by skipping `currentColor` attributes. If the corpus shows an intentional override pattern, narrow to groups that carry `data-role` or a legend.
- `fill` set via inline `style` beats CSS, so it is not an attribute and is correctly out of scope.

**G's edge cases.**
- A label that is inside the control (gf3-2) is a descendant. It is excluded by construction.
- A tooltip overlaying one control is one element, not a ring. It is excluded by the ≥3 rule.
- A ring whose labels *do* have their own handlers (clickable labels) makes each hit interactive, so it is excluded. That is correct: clicking works.

**What this plan still cannot see (keep it honest).** Values: wrong notes lit, like the D#/E double
third, are correctly coloured and correctly clickable, just wrong. No render check catches that.
It is the reviewer's lossy-key item plus the durable suite's job, and the audio channel (NEXTSTEPS
4(6)) is the same class. Do not let G/F passing be read as "the content is right".

**`click_blocked` is deliberately never a failure.** Animations and transient overlays time out
too, and the docstring's reasoning for skipping still holds. The value is that the evidence reaches
the builder and the trace. In hfix it would have named `text.label` on the first run instead of the
builder finding it by accident.

**Correction carried into NEXTSTEPS and memory.** "The builder discovered render_smoke unprompted"
(2026-09-20d, and memory `agency-gap-on-vm`) is wrong: the prompt named it from 2026-09-19. The
agency finding shrinks to "it followed the instruction". The real gap was a missing *how to serve*.

**Phase 1 baseline, 2026-09-23 (current `render_smoke.py`, local macOS chromium, 1280×900).**
22 rows: 21 harvested refs plus the `hfix-nopointer` mutation fixture.

| id | passed | ctrls | unreach | sector | why it fails |
|---|---|---|---|---|---|
| bare-cc-20260919 | true | 50 | 0 | 0 | |
| dsctl-20260920 | true | 16 | 0 | 0 | |
| dsv41-20260920 | true | 45 | 0 | 0 | |
| **dsv41s-20260920** | false | 0 | 0 | 0 | B: 22 chars drawn |
| **fixval-20260919** | false | 99 | 0 | **1** | E (reference) |
| gf-1-20260828 | true | 32 | 0 | 0 | |
| **gf-2-20260828** | false | 0 | 0 | 0 | A: `relativeMinor2 is not a function` |
| gf-3-20260828 | true | 16 | 0 | 0 | |
| gf-e2e-20260917 | true | 15 | 0 | 0 | |
| **gf2-1-20260918** | false | 123 | 123 | 0 | A: crash in `route()`; unreachable = `bun-hmr` overlay |
| gf2-2-20260918 | true | 30 | 0 | 0 | |
| gf2-3-20260918 | true | 40 | 0 | 0 | |
| **gf2-4-20260918** | false | 42 | 42 | 0 | A: `Cannot redefine property: document`; unreachable = `bun-hmr` |
| gf3-1-20260918 | true | 77 | 0 | 0 | |
| gf3-2-20260918 | true | 62 | 0 | 0 | |
| gf3-3-20260918 | true | 31 | 0 | 0 | |
| gf3-4-20260918 | true | 22 | 0 | 0 | |
| **gf3-5-20260918** | false | 86 | **8** | 2 | C (reference), and E fires too |
| gf3-6-20260918 | true | 12 | 0 | 0 | out of scope by design (docstring) |
| gf4-solo-20260918 | true | 39 | 0 | 0 | |
| **hfix-20260920** | **true** | 41 | 0 | 0 | the F gap on record |
| **hfix-nopointer** | **true** | 41 | 0 | 0 | the G gap on record |

- The prediction "everything else passes" was wrong. Four more apps fail, and all four are
  genuine load-time crashes caught by A/B, so none is a false positive. That leaves **14
  known-passing apps** as the precision set for G and F, plus the two hfix fixtures as the recall set.
- **Design input for G:** a crashed app is covered by bun's `bun-hmr` error overlay (the occluder
  for all 123/42 "unreachable" controls above). G must exclude `bun-hmr` (and descendants), or
  every crashed app double-reports as a dead-text ring. C already double-reports this way. That
  is harmless because A fires first, but worth a one-line docstring note.
- hfix shows 41 controls locally versus 102 in the VM trace (a builder-run smoke after its own
  edits, maybe another tab state). Not investigated. The fixtures compare against each other, so it
  does not affect calibration.

**Phase 2 corpus, 2026-09-23 (G/F report-only).** `clicked` = clicks that actually landed.

| id | passed | clicked | G | F | |
|---|---|---|---|---|---|
| bare-cc | true | 25/25 | 0 | 0 | |
| dsctl | true | **1/16** | 0 | 0 | |
| dsv41 | true | **1/25** | 0 | 0 | |
| fixval | false | 19/25 | 0 | 0 | |
| gf-1 | true | 25/25 | 0 | 0 | |
| **gf-3** | true | 4/16 | **1** | 0 | `path.slice` |
| gf-e2e | true | 8/15 | 0 | 0 | |
| gf2-2 | true | 22/25 | 0 | 0 | |
| **gf2-3** | true | **1/25** | **1** | 0 | `g.wheel-sector` |
| gf3-1 | true | **1/25** | 0 | 0 | |
| gf3-2 | true | 7/25 | 0 | 0 | |
| gf3-3 | true | **1/25** | 0 | 0 | |
| **gf3-4** | true | 3/22 | **1** | 0 | `circle.` |
| gf3-5 | false | 1/25 | 1 | 0 | `path.slice` (already failing) |
| gf3-6 | true | 12/12 | 0 | 0 | |
| **gf4-solo** | true | 5/25 | **1** | 0 | `path.sector` |
| hfix | true | 1/25 | 0 | **1** | `text.note-badge:fill` |
| hfix-nopointer | true | 1/25 | **1** | **1** | `path.segment`, `text.note-badge:fill` |

(The four crashed apps show 0/0 and no G/F: A fires first, and `bun-hmr` is excluded.)

**G adjudication, measured, not eyeballed** (`$SCRATCH/verify_g.py`). For 4 members of each
fault ring, on a fresh load each time: click a bare point of the control, then click the dead-text
point. Compare a DOM/text snapshot before and after.

| ring | bare click | label click | verdict |
|---|---|---|---|
| gf-3 `path.slice` | CHANGED ×4 | no change ×4 | **real**: key names swallow clicks |
| gf2-3 `g.wheel-sector` | CHANGED ×4 | no change ×4 | **real** |
| gf3-4 `circle.` | CHANGED ×4 | no change ×4 | **real** |
| gf4-solo `path.sector` | CHANGED ×4 | no change ×4 | **real**: minor-ring and accidental labels |
| hfix-nopointer `path.segment` | CHANGED ×4 | no change ×4 | **real** (reference) |
| gf3-5 `path.slice` | mixed (slices already occluded) | no change ×4 | real (already failing on C/E) |

**Precision on the corpus: 6/6 G rings true, 2/2 F groups true, 0 false positives.** The
precision set turned out smaller than "14 known-passing": four of those apps had this defect all
along, invisible to every gate and to the fan-out judging. G was designed for the gf3-6 class
("labels above the sectors … every click is swallowed"), and it catches it wherever the sectors ARE
detectable controls. gf3-6 itself stays out of scope, as the docstring says.

**D's coverage, measured for the first time:** of the 18 harvested apps that render, **7 landed
exactly one click**: dsctl, dsv41, gf2-3, gf3-1, gf3-3, gf3-5 and hfix. Only 4 landed every click
(bare-cc, gf-1, gf3-6, and gf2-2 at 22/25). So "survives interaction" was effectively untested on
most of the recent factory runs. See amendment 09:40.

**Phase 2b corpus, 2026-09-23.** Clicks landed, before → after re-find: hfix 1→25, dsctl 1→16
(all), dsv41 1→25, gf3-3 1→25, gf-3 4→16 (all), gf-e2e 8→15 (all), gf3-5 1→21, gf2-3 1→13,
gf4-solo 5→11, gf3-4 3→10, gf3-2 7→9, gf3-1 1→1.

- **One new click failure, reproduced by hand and real:** gf4-solo, one click on the "D#m" sector on
  a fresh page throws `Unknown note name: E#` (`notes.ts:47`: `PITCH_CLASS_MAP` has no E#, which is
  in the correctly spelled D# minor scale). No verdict flipped, because gf4-solo already failed on G.
- **Remaining low coverage is the smoke's reach, not app errors** (blocked clicks are report-only):
  gf3-1's first click opens a help modal the smoke never dismisses (24 clicks land on
  `modal-backdrop`); gf3-2's wedge buttons have box centres over the hub button (the geometry the
  docstring already records), so Playwright's centre click is intercepted by `wheel-hub`. Candidate
  follow-ups, not built: press Escape when a click is blocked by a `*modal*` backdrop, and click at
  the probe's known-reaching grid point instead of the box centre.
- G-flagged apps (gf2-3, gf3-4, gf4-solo, hfix-nopointer) stay partial because their wheel clicks are
  intercepted by the labels. That is correct, and now named per click.

**Phase 4, 2026-09-23.** `--screenshot` works in either argument order, writes even when a check
fails (hfix exits 1 on F and still saves the PNG), and refuses an in-repo path with exit 2, writing
nothing. The hfix screenshot, read back, shows the value of the picture directly: every fretboard
note grey under a five-colour legend. A builder looking at it would have seen the F defect. The
grading command in the builder prompt was checked against `quality.tests_argv` (`[bun, "test",
TEST_FILE, *extra]`) rather than copied from the test_designer prompt.

**Phase 5, 2026-09-23.** The first dry run failed the **leak check**: "fretboard" (the host app's
name) appeared twice in F's docstring and comment. Fixed at the source (`f9c3587`), so the check
worked as designed. The second failed the **roster gate** on every model. The cause was environmental:
`pi` (0.85.1) is installed under nvm's node **v22.21.0**, and the Claude Code shell defaulted to
v24.21.0, which has no `pi`, so `pi --list-models` returned nothing. With v22's bin on PATH for the
one command, all four gates pass. Nothing in the repo needed changing for that.

**Deferred.** A per-role colour legend cross-check (read the legend's swatches and match them to
fretboard fills) is more precise than the `data-role` measurement, but it is payload-shaped. Revisit
only if F plus the role measurement miss something real.

## Amendments

<details>
<summary>2026-09-23T09:05:00-07:00 — corpus script moved to sandbox_mount/host/, repo is an argument</summary>

Both `adws/` and `sandbox_mount/` are target sync paths, so either location ships to the public
greenfield repo. `sandbox_mount/host/` is where host tooling that reads harvested refs already
lives (`target_sync.py`). The script takes the refs repo as its first argument instead of
hardcoding `../greenfield-sandboxes`, which keeps it generic and leak-free. It reads the app dir
from each ref's `app.manifest.yaml`, and it reuses an existing extracted dir, which is how the
`hfix-nopointer` mutation fixture (patch at `$SCRATCH/corpus/hfix-nopointer.patch`: deletes
`.label`/`.numeral { pointer-events: none; }` from `styles.ts:151,153`) survives re-runs.

Verified during fixture build: in hfix the wheel's `<text class="label">` is a SIBLING of its
`<path class="segment">` (`wheel.ts:85-89`), not a child. The `.segment text.label` CSS rule matches
nothing. So G's "not a descendant of the control" condition holds for the reference defect.
</details>
<details>
<summary>2026-09-23T09:40:00-07:00 — found while building Phase 2: assertion D clicks ONE control on apps that re-render</summary>

`click_blocked` came back 24/25 on the FIXED hfix with no named occluder. Diagnosed with a
direct probe: hfix re-renders its DOM on the first click, which wipes every `data-smoke-id` stamp
(41 → 0). Every later `page.click('[data-smoke-id=…]')` then times out on a selector that no
longer exists, and the old bare `continue` hid that. **So D ("clicking throws nothing") has
exercised exactly one control on any re-rendering app**, and the 09-20 "no click_failures" on hfix
meant "one click, no error".

Phase 2 response, kept inside scope: a stamp that is gone before its click is counted as
`click_stale`, not `click_blocked`, and the report now says `clicked N of M`. So `click_blocked`
means only real interception. It cannot see the hfix wheel until D re-probes between clicks,
because the wheel clicks never happen. G carries that signal independently.

**Proposed, not built:** re-run the probe (or re-stamp by a stable signature: group + label +
ordinal) before each click, so D exercises every control. It changes D's coverage on every
re-rendering app, so new `click_failures` may appear across the corpus and must be calibrated like
G/F. Candidate new Phase 2b. Needs Ron's call.
</details>
<details>
<summary>2026-09-23 — closed: final corpus identical to the 2b run; target pushed</summary>

The final corpus run against `render_smoke.py` as shipped matched the Phase 2b run exactly on all 22
rows: verdict, click errors, G, F and clicks landed. The later changes (`--screenshot`, message
wording, and the leak-safe comment edit) changed no behaviour. The target was synced and pushed at
`777d62f`, and the remote was checked for the new smoke and the reviewer items.
</details>
