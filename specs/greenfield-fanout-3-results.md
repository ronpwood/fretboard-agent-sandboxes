---
plan: greenfield-fanout-3-results
created: 2026-09-18T14:40:00-07:00
modified:
  - 2026-09-18T14:40:00-07:00
commits:
  - 96ec208 — provision: freeze the lockfile, retry the just install
  - 54f52c2 — pre-register greenfield fan-out 3 before any arm runs
  - 320807d — gate C ping retry (contained a set -u subshell bug)
  - 0c69080 — gate C: a busy ZDR pool is not a broken one
agents:
  - claude-opus-5[1m]
sessions:
  - dffee14d-ee4b-4c19-8efc-38460132110c
back_refs:
  - specs/greenfield-fanout-3-preregistration.md — the predictions, written before any arm ran
  - specs/greenfield-fanout-2-results.md — the control run
  - specs/greenfield-cof-experiment.md — the hidden rubric (part A frozen, part B new)
forward_refs: []
status: complete
---

# Greenfield fan-out 3 — results

**HOST-ONLY.** The rubric lives in `specs/greenfield-cof-experiment.md` and must never enter a VM
or a target's `prompts/`.

Run 2026-09-18. **N=6, one roster** (default), one prompt (`prompts/greenfield.md`, unchanged since
2026-08-28), one pin (`a91e559`), TDD chain. Predictions registered in
`specs/greenfield-fanout-3-preregistration.md` and committed (`54f52c2`) **before any arm executed**.

Billed spend **$5.37** against a $300 cap. Recorded as a dated fact, never scored.

## Headline

**The crash fix worked. The gates still cannot tell a working app from a broken one, and the
accept/reject signal now runs *opposite* to delivered quality.**

- **P1 CONFIRMED.** Zero crashes in six arms, against 2-of-4 crashing in the control. happy-dom did
  its job.
- **P2 SPLIT.** Schema failures held flat (4 fleet-wide, same as control). `not-found` errors rose
  **3 → 16**. The regression check fails on that half.
- **P3 CONFIRMED, with a caveat.** 6 of 6 reviewers engaged the delivered interface, against 0 of 4
  under the old prompt. But most engagement is conformance-to-own-plan, not independent judgment.
- **P4 PARTIAL.** Part A clustered as predicted (16–20). Part B spread wider (7–12) but **three arms
  tied at its ceiling**, so part B has the same problem part A does, one rung higher.
- **Unpredicted, and the most important result: both accepted arms have broken or partial primary
  interaction; all three arms with fully coherent interaction were rejected.**

## The arms

| arm | outcome | fix | revise | reviews | tokens | **billed** | part A /20 | part B /12 |
|---|---|---|---|---|---|---|---|---|
| gf3-1 | ✗ rejected | 1 | 1 | 2 | — | $1.07 | **20** | **12** |
| gf3-2 | ✗ rejected | 0 | 1 | 2 | — | $1.17 | **20** | **12** |
| gf3-3 | ✗ rejected | 0 | 1 | 2 | 16.8M | $1.43 | **20** | **12** |
| gf3-4 | ✓ accepted | 0 | 1 | 2 | — | $0.62 | 19 | 10 |
| gf3-6 | ✓ accepted | 1 | 0 | 1 | 2.79M | $0.36 | 17 | 7 |
| gf3-5 | ✗ rejected | 0 | 1 | 2 | — | $0.71 | 16 | 8 |

Billed ran ~80% of the chains' self-reported $6.71, consistent with the control's ~84%. Use billed.

## Part A — frozen rubric (20 max)

| # | item | gf3-1 | gf3-2 | gf3-3 | gf3-4 | gf3-5 | gf3-6 |
|---|---|---|---|---|---|---|---|
| 1 | Circle order (12 keys in fifths) | 2 | 2 | 2 | 2 | **1** | 2 |
| 2 | Key signatures correct | 2 | 2 | 2 | 2 | 2 | 2 |
| 3 | Relative minors | 2 | 2 | 2 | 2 | 2 | 2 |
| 4 | Diatonic content with qualities | 2 | 2 | 2 | 2 | 2 | **1** |
| 5 | Enharmonics at the F#/Gb seam | 2 | 2 | 2 | 2 | **1** | 2 |
| 6 | Real guitar surface | 2 | 2 | 2 | 2 | 2 | 2 |
| 7 | Teaching surface | 2 | 2 | 2 | 2 | 2 | 2 |
| 8 | Interactive wheel | 2 | 2 | 2 | **1** | **0** | **0** |
| 9 | Tests exercise theory; red preceded build | 2 | 2 | 2 | 2 | 2 | 2 |
| 10 | Delivery: gates green + loads clean | 2 | 2 | 2 | 2 | 2 | 2 |
| | **TOTAL** | **20** | **20** | **20** | **19** | **16** | **17** |

Items 2, 3, 6, 7, 9 and 10 scored 2 for **every arm** — six of ten items no longer discriminate.
Item 1 did, for the first time, and only because one arm's rendering broke.

### Method

Items 1–5 verified **live in a browser by measurement, not inspection** (see "Measure geometry,
never eyeball it" below), cross-checked against source in a worktree of each `refs/sandbox/<id>`.
Items 6–8 and 10 from the running app on the VM after `just sbx lifecycle refresh`, driven with
Playwright. Item 9 from commit order plus suite content.

### Item 10 is the damning one

**All six arms: lint green, build green, every test passing**, on the harvested trees, run on the
host after teardown:

| arm | lint | build | tests |
|---|---|---|---|
| gf3-1 | ok | ok | 45 pass / 0 fail |
| gf3-2 | ok | ok | 86 pass / 0 fail |
| gf3-3 | ok | ok | 44 pass / 0 fail |
| gf3-4 | ok | ok | 38 pass / 0 fail |
| gf3-5 | ok | ok | 45 pass / 0 fail |
| gf3-6 | ok | ok | 32 pass / 0 fail |

Two of those six have a broken core: gf3-5's circle renders as a solid band, gf3-6's wheel ignores
every click. Both are fully green. **This is the control run's finding, reproduced exactly, one
layer up:** the chain no longer ships apps that *crash*, and still cannot detect an app that does
not *work*.

## Part B — discriminators (12 max)

| # | item | gf3-1 | gf3-2 | gf3-3 | gf3-4 | gf3-5 | gf3-6 |
|---|---|---|---|---|---|---|---|
| 11 | Survives interaction | 2 | 2 | 2 | **1** | **1** | **0** |
| 12 | Visual design | 2 | 2 | 2 | **1** | **1** | **1** |
| 13 | Legibility of the core object | 2 | 2 | 2 | 2 | **0** | 2 |
| 14 | Error-free under use | 2 | 2 | 2 | 2 | 2 | 2 |
| 15 | Restraint | 2 | 2 | 2 | 2 | 2 | **1** |
| 16 | Recoverability | 2 | 2 | 2 | 2 | 2 | **1** |
| | **TOTAL** | **12** | **12** | **12** | **10** | **8** | **7** |

Part B separated the bottom (7, 8, 10) from the top, which part A could not. But **three arms tied
at 12/12**, so it inherits part A's ceiling problem for good arms. Item 14 scored 2 for every arm
and is already dead weight — and for gf3-5 and gf3-6 it is close to vacuous, since an app that
cannot be driven cannot throw errors while being driven.

Judgment items, one line each:

- **15 (restraint):** gf3-6 scores 1 — five feature tabs while its chord data is wrong and its wheel
  is inert. Surface grew, core stayed thin. Every other arm put effort where the brief pointed.
- **16 (recoverability):** gf3-5 scores 2 despite the worst visible defect, because it is a
  **one-character fix** (SVG large-arc-flag `1` → `0`). gf3-6 scores 1: `pointer-events: none` is
  trivial, but its chord model needs real work (below).

## The three defects no gate could see

Each was found only by driving a real browser, and each is invisible to lint, tsc, `bun test` under
happy-dom, and a source-reading reviewer.

### 1. gf3-6 — the wheel swallows every click (accepted arm)

Playwright: `<text class="circle-label">A</text> intercepts pointer events`. The key labels sit
above the sectors that carry the handler, have no `pointer-events: none`, and no handler of their
own. gf3-6 has **no other key control** — the wheel is it. Its primary interaction does not exist.

### 2. gf3-6 — every chord card shows the parent scale, not the chord (accepted arm)

`theory/circle.ts:169` builds `notes: MAJOR_SCALE.map((interval) => (rootPc + interval) % 12)` and
`ui/chord-strip.ts:52` renders `chord.root + " · " + chord.notes.join(" - ")`. So all seven diatonic
chords display the identical string `0 - 2 - 4 - 5 - 7 - 9 - 11` — the parent major scale as raw
pitch classes. Qualities (I ii iii IV V vi vii°) are right; the note content is wrong for six of
seven chords. 32 tests pass.

### 3. gf3-5 — one wrong SVG flag destroys the core object

Its F slice is emitted with `A 100 100 0 1 0` — large-arc-flag **1** on a 30° wedge, so it sweeps
~330° and paints over the entire ring. Measured: **all 12 labels hit-test to the same `F` slice.**
The "dark green band" in its screenshot is not styling. One character.

## Findings

### 1. Acceptance runs opposite to delivered quality

Sorted by part A + part B, the two accepted arms rank **4th and 6th of six**:

| rank | arm | A+B /32 | outcome |
|---|---|---|---|
| 1= | gf3-1 | 32 | ✗ rejected |
| 1= | gf3-2 | 32 | ✗ rejected |
| 1= | gf3-3 | 32 | ✗ rejected |
| 4 | gf3-4 | 29 | ✓ **accepted** |
| 5 | gf3-5 | 24 | ✗ rejected |
| 6 | gf3-6 | 24 | ✓ **accepted** |

**This is not the reviewers being careless.** Their findings are specific, line-cited and correct.
gf3-1 was rejected on two real gaps — ear-training questions that populate `audioNotes` but never
play them *and* spell the answer in the visible subtext, and progression highlighting that reaches
the chord card but not the wheel or fretboard, both verified by grep in the review itself. Its own
summary: *"8 of 10 blocking gaps closed correctly, every gate green, no regressions."*

The mechanism is structural, and it is the sharpest result of this run:

**The spec is self-authored, so ambition is self-penalising.** Each arm's planner writes the
requirements its reviewer will grade it against. An ambitious plan creates more checkable claims,
so a rigorous reviewer finds more unmet ones and rejects. A modest plan creates fewer, and passes.
gf3-3 wrote 24 requirements and was rejected with 18 met; gf3-6's final review ruled on **seven**
and approved. Accept/reject is measuring *plan conservatism*, not delivered quality.

The control run hinted at this (two arms tied at the 20/20 ceiling, one of them rejected). With
n=6 on one roster it is unambiguous, and it invalidates accept/reject as a quality signal for
best-of-N selection. **An automated "pick the accepted arm" policy would have shipped the two worst
apps in this run.**

Independent corroboration worth recording: Ron reviewed all six in a browser without seeing any
review, and picked **gf3-1** — a rejected arm, and the top scorer here — as his favourite on first
pass.

### 2. The `document` collision was our bug, and the chain handled it correctly

`quality.tests()` runs `bun test <fixed> <generated>` in **one process, shared `globalThis`**. The
fixed suite installs a `configurable: false` document. A generated suite that installs its own
throws.

**Five of six test_designers guarded against this unprompted**, in three different idioms:

| arm | generated suite |
|---|---|
| gf3-1, gf3-3 | no redefine at all |
| gf3-2 | `if (g.document === undefined)` |
| gf3-4 | `if (!("document" in globalThis))` — commented *"Guarded so this file never fights app.test.ts if both run in one process."* |
| gf3-5 | `if (!globalThis.document)` |
| **gf3-6** | **unguarded** |

Only gf3-6 collided. `test_1` **caught it** — the gate worked. `fix_1` resolved it by flipping the
fixed suite's `configurable: false` → `true`. Its reviewer then identified exactly what was lost:

> *"The lost `configurable: false` runtime throw for production-code redefinition is an unavoidable
> tradeoff… the builder cannot edit the generated suite (it is the factory's spec-as-tests), so
> relaxing the durable suite's descriptor was the only viable fix."*

That reasoning is correct. Given an unguarded generated suite and a builder forbidden from editing
it, weakening the fixed suite is the *only* path to green. **The agents behaved correctly inside an
impossible constraint we built.** The fault is ours, and the fix is ours.

The hole it exposes is real regardless: `apps/*/app.test.ts` is **not** in `protected_files`, so a
builder can edit the machinery that grades it — the roster's own comment says it must not be able
to. But the capability was used both ways: gf3-3 and gf3-5 also edited the fixed suite, to **add
durable regression tests** for defects their reviewers caught. That is good engineering. A blanket
protection would block it.

### 3. P2 — the tool contract traded one error class for another

| arm | builder calls | errs | rate | schema | not-found | model-format |
|---|---|---|---|---|---|---|
| gf3-1 | 131 | 3 | 2.3% | 1 | 1 | 0 |
| gf3-2 | 136 | 7 | 5.1% | 3 | 3 | 0 |
| gf3-3 | 131 | 9 | 6.9% | 0 | 6 | 0 |
| gf3-4 | 85 | 5 | 5.9% | 0 | 3 | 0 |
| gf3-5 | 99 | 4 | 4.0% | 0 | 3 | 0 |
| gf3-6 | 41 | 0 | 0.0% | 0 | 0 | 0 |

- **Schema half: PASS.** No arm above 3; fleet total **4**, identical to the control's 4.
- **`not-found` half: FAIL.** Control 3 across four arms; this run **16** across six. Bar was ≤5.
- `model-format`: **0** everywhere. No DSML corruption this run.

Hypothesis, from one run and not a conclusion: the same prompt change that promoted non-overlap to
a hard rule also told builders to *"merge neighbouring changes into one larger entry."* Larger
merged `oldText` blocks are harder to match byte-exactly. We may have traded schema failures for
`not-found` failures.

**This is the value of restating P2 before the run.** As originally written ("≤1 schema failure per
arm") the prediction sat inside the control's own 0/1/2/0 range and would have passed by default,
crediting the prompt for sampling noise. The restated version caught a real regression instead.

### 4. P3 — reviewers now look at the interface, but mostly as spec conformance

**6 of 6** engaged the delivered interface; the control was **0 of 4** under a prompt that said
*"Not your job: … style opinions."* The neutralized prompt clearly changed behaviour.

The caveat matters. Most engagement is *conformance to the arm's own plan* — gf3-2's "Dark studio
palette, typography, responsive layout — MET", gf3-4's "Key family highlighting with per-degree
colors — MET". Only four raised an actual interface **finding**:

- gf3-3 — `.key-node.traced` glow is a no-op (`styles.css:166`), so playback is "half-invisible"
- gf3-1 — sync highlighting never reaches the wheel or fretboard
- gf3-5 — fret spacing uniform, not proportional as its plan specified
- gf3-6 — page title is generic "App", not the branding its plan described

And **not one reviewer caught any of the three defects in §"The three defects no gate could see"** —
because all three are only visible when rendered. A reviewer reading source cannot see that a label
swallows a click or that an arc flag is wrong.

### 5. The red gate is structurally degenerate on greenfield

All six arms went red via **module-not-found**; not one assertion executed in any arm's red run.
On a blank target this is unavoidable — there is no code for a generated suite to assert against,
so its imports cannot resolve. The gate proves the suite parses (oxlint runs it) and references
not-yet-existent code. It cannot prove the suite tests anything.

`specs/greenfield-cof-experiment.md` pre-authorised this ("degenerate but acceptable red for v1;
note it in the judgment"), so item 9 was scored on suite *content*, not the gate's verdict. Suite
sizes varied 32–86 tests with nothing varying but the sample.

### 6. Within-condition variance remains the dominant effect

One roster, one prompt, one pin:

- **Outcome:** 2 accepted, 4 rejected
- **Billed:** $0.36 → $1.43, a **4×** spread
- **Tokens:** 2.79M (gf3-6) → 16.8M (gf3-3), a **6×** spread
- **Part A:** 16 → 20 · **Part B:** 7 → 12
- **Builder tool calls:** 41 → 136

The control run's warning stands and is now quantified at n=6. Any roster comparison must clear
this noise floor, and fan-out 2's between-condition differences did not.

## Predictions vs outcomes

| # | prediction | verdict |
|---|---|---|
| P1 | zero stub-induced mount crashes | **CONFIRMED** — 0 of 6 crash (control: 2 of 4). Console clean on all six, 582–1476 chars rendered |
| P2 | tool contract did not regress | **SPLIT** — schema flat at 4 fleet-wide (PASS); `not-found` 3 → 16 (FAIL) |
| P3 | k of 6 reviewers raise a design finding | **6 of 6 engaged** (control 0 of 4); 4 of 6 raised an actual finding; 0 of 6 caught a render-only defect |
| P4 | part A clusters, part B spreads | **PARTIAL** — A clustered 16–20 as predicted; B spread 7–12 but three arms tied at its ceiling |

## Infrastructure: three fan-out ceilings, none of them CPU

All three appeared between N=4 and N=6, and all three are resources every arm reaches through one
shared identity. Fixed and committed before the run.

1. **`bun.lock` rewritten across a host/guest bun gap** (`96ec208`). The greenfield shell's lock was
   committed by the host's bun 1.3.0; provision installs 1.4.2, which adds `"configVersion": 0`.
   `bun install` dirtied a tracked file and **gate A failed all six arms before an agent ran**. Fixed
   with `--frozen-lockfile`, which is also what a committed lock is *for*.
2. **GitHub rate-limits release assets per IP** (`96ec208`). `just.systems/install.sh` pulls from
   `github.com/casey/just/releases`; every exe.dev VM shares one egress. 403 on three of six arms,
   surviving a 15 s stagger. Bounded retry with backoff. bun is unaffected (own CDN).
3. **OpenRouter's ZDR pool for one seat** (`320807d`, `0c69080`). Gate C pins
   `provider: {zdr: true, data_collection: "deny"}`, a far smaller pool than a model's general
   availability. `openai/gpt-5.6-luna` (documenter) exhausted four retries on three of six arms while
   every other model passed first try. Gate C now distinguishes **"rate-limited"** (routing resolved,
   pool busy — tolerated) from **"no endpoints matching your data policy"** (no ZDR provider — still
   fails). Allowlist, not catch-all: a deprecated id still fails.

**"Shared vCPU does not cap arm count" remains correct. "Concurrency is free" does not follow from
it.**

`just sbx mount` was not used: it resolves the run id by reading back `run_record.py list | [0]`, so
under concurrency two arms can claim one id. Precomputed ids passed to `create` remove the race.

## Method notes worth keeping

### Measure geometry, never eyeball it

I called gf3-4's circle "visibly broken" from its screenshot. Measurement: **12 nodes, every one at
radius 150 from the centroid, 0% spread**, labels reading C G D A E B F# Db Ab Eb Bb F clockwise at
exact 30° intervals. It is perfect. The larger highlighted progression nodes crowd the top and the
unselected fills blend into the background, which reads as lopsided.

Had I scored from the screenshot, gf3-4 would have lost item 1 and item 13 — four points — for a
defect that does not exist. Conversely gf3-5's genuinely broken ring needed a hit-test to prove.
**Both errors run in both directions; only measurement settles either.**

### Do not classify varying behaviour by regex

I twice reported a wrong count of which arms guarded their `document` rebind, because I grepped for
guard idioms I had thought of. Three arms wrote three different correct guards; my patterns caught
one. On a population whose entire purpose is to vary, pattern-matching for expected forms measures
the patterns, not the population. Reading the context costs the same and is correct.

### `bun test` passing is not "it works"

Six arms, 32–86 tests each, all green, all lint-clean, all building. Two do not function. Tests
assert what someone thought to assert; a browser asserts what a user encounters.

## Follow-ups

Ordered by value. None applied — all need review.

1. **Stop using accept/reject to rank arms** (§1). It is anti-correlated with quality here. For
   best-of-N, rank on delivered behaviour; keep the review as a *findings* source, not a verdict.
   The deeper fix is that a self-authored spec makes ambition self-penalising — consider grading
   every arm against the **brief**, as the judge does, rather than against its own plan.
2. **Put a real browser in the chain** (§"three defects"). All three unseen defects are render-only:
   a click-swallowing label, a wrong arc flag, a wrong data model surfaced only on screen. happy-dom
   closed the *crash* class; it does no hit-testing or layout. A headless load-and-drive assertion in
   `run_verify` is the single change most likely to move outcomes now — the same argument that
   justified happy-dom, one layer up.
3. **Fix the `document` collision at the source** (§2). State the invariant in the test_designer
   prompt ("a document may already exist — guard your rebind"); five of six already do this
   unprompted. Then protect the harness block of `apps/*/app.test.ts` while leaving test bodies
   writable, so gf3-6's resolution becomes impossible without blocking gf3-3's regression tests.
4. **Re-examine the merged-edit advice** (§3). `not-found` rose 3 → 16. Test whether "merge
   neighbouring changes into one larger entry" is causing it before it is treated as settled.
5. **Retire part A items 2, 3, 6, 7, 9, 10 and part B item 14.** Six of ten part A items and one of
   six part B items scored 2 for every arm. Part B needs headroom above 12 for good arms, the way
   part A needed it above 20.
6. **Make the red gate mean something on greenfield** (§5). Require at least one *assertion* failure
   rather than a non-zero exit, or accept that item 9 is scored on content and say so in the rubric.

## Artifacts

- Harvested: `refs/sandbox/gf3-{1..6}-20260918-*` in `../greenfield-sandboxes` (2,068–4,023 lines each)
- Bundles: `.sandbox/runs/gf3-*.bundle`
- Traces: `.sandbox/traces/gf3-*/` (137 MB; `trace-metrics` reads these post-teardown)
- Screenshots: `.sandbox/shots/gf3-*.png`
- All four rejected arms were rescued with `just sbx manage snapshot` — **every one had its entire
  build uncommitted**, HEAD still at the red-suite commit. Without it, four of six builds would have
  died at teardown. Combined with the control run, that recipe has now saved seven builds.
- All six VMs torn down, keys revoked and verified absent from OpenRouter's key list.
