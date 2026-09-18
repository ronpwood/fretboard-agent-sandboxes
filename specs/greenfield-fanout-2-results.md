---
plan: greenfield-fanout-2-results
created: 2026-09-18T06:45:00-07:00
modified:
  - 2026-09-18T06:45:00-07:00
commits: []
agents:
  - claude-opus-5[1m]
sessions:
  - f2d194d8-161e-4061-be71-2eec59f951ae
back_refs:
  - specs/fanout-readiness-and-team-quality.md — the plan whose Phase 5 this run executes
  - specs/greenfield-cof-experiment.md — the hidden /20 rubric and the 2026-08-28 control scores (15 / 9 / 19)
  - specs/greenfield-target.md — the named target and pristine guard these arms mounted
forward_refs: []
status: complete
---

# Greenfield fan-out 2 — results

**HOST-ONLY.** The rubric lives in `specs/greenfield-cof-experiment.md` and must never enter a VM
or a target's `prompts/`.

Run 2026-09-18. N=4, TDD chain, one prompt (`prompts/greenfield.md`, unchanged since 2026-08-28),
one pin (`da460ca6cb50af47845dfc83f422eed881c9355e`). Total **billed** spend **$11.28** against a $75
cap.

### Cost is recorded, never scored

**Dollar cost is a fact in this report, not a scoring lever, and must not become one.** Ron's call,
2026-09-18, and the reasoning is sound:

- **A price is a business decision, not a measurement of work.** DeepSeek doing this volume of work
  for $0.04–$0.10 a phase is hard to reconcile with the electricity alone. Subsidy, loss-leader
  pricing, or a market-share play are all likelier than a genuine 100× efficiency edge over vendors
  who must price at cost-plus to survive. Scoring on price rewards whoever is currently burning
  investor money.
- **Scoring on price makes the scorecard unreproducible.** An arm graded partly on cost-per-point
  silently changes grade when a vendor reprices. We would be tracking the pricing wars, not our own
  engineering. Token counts do not move when someone's finance team does.
- **Recorded cost still earns its place** as a dated snapshot of the landscape — useful for reading
  who is buying share, who is pre-IPO, and how that shifts over time. Keep it visible; keep it out
  of the score.

**Token efficiency is the legitimate lever**, because it tracks real work. One caveat so it is not
over-trusted: tokens are not a clean compute measure either — tokenizers differ, reasoning-token and
cache accounting differ per provider, and a sparse MoE burns far fewer FLOPs per token than a dense
frontier model. Tokens are safest compared *within* a model family, or read as order-of-magnitude
across families. gf2-4's 3.3M against gf2-1's 21.2M is a 6.4× gap — well past that noise floor, and
therefore meaningful. A 15% gap would not be.

**Billed ≠ traced.** The chains' own cost reports total $13.39; OpenRouter billed $11.28, or ~84%.
Every arm is traced-high by a similar factor (0.67×–0.93×), so rankings are unaffected, but **use
the billed column** — it comes from the key's own usage endpoint at teardown, recorded in the run
record. (Prior sessions found the opposite direction for deepseek's published vs billed rate; do not
assume a constant.)

## Headline

The factory changes did what they were meant to. **The gates I added did not, and two of them
actively caused harm.**

- **H1 (builder tool contracts): CONFIRMED.** `edit` schema failures 18 → 0/1/2 across every arm.
- **H2 (typecheck gate): FAILED.** It never failed once, in any arm. Zero defects caught.
- **H3 (render smoke): FAILED, and worse — it caused two browser crashes** and contaminated the
  production source of **all four** arms with test-double code.
- **H4 (asymmetric roster): NOT SUPPORTED.** Ties the top rubric score, but at 11.7× the billed cost
  of the winner, and still rejected.
- **H5 (inverse roster): NOT SUPPORTED.** Most efficient builder by far, still rejected, most
  expensive per token.

The one arm that was accepted is a **default-roster arm**. The two frontier arms both failed.

## The arms

| arm | roster | planner | builder | reviewer | outcome | tokens | traced | **billed** |
|---|---|---|---|---|---|---|---|---|
| gf2-1 | default | gemini-3.8-flash | deepseek-v4-flash | glm-5.3 | ✗ rejected (review_2) | 21.2M | $1.70 | $1.14 |
| gf2-2 | default | gemini-3.8-flash | deepseek-v4-flash | glm-5.3 | **✓ accepted** | 12.7M | $0.98 | **$0.66** |
| gf2-3 | asymmetric | **opus-5** | deepseek-v4-flash | **opus-5** | ✗ rejected (review_2) | 29.2M | $8.29 | **$7.73** |
| gf2-4 | inverse | gemini-3.8-flash | **kimi-k3** | glm-5.3 | ✗ rejected (review_2) | 3.3M | $2.42 | $1.75 |

## Scorecard

Scored against the brief's words (hidden rubric, 0/1/2 per item, 20 max), **not** against each
arm's own spec. Arms wrote specs with different requirement counts (26 / — / 24 / 33), so the
chains' own "N of M requirements met" figures are **not comparable across arms** and are excluded
from ranking — the 2026-08-27 cross-grading lesson.

| # | rubric item | gf2-1 | gf2-2 | gf2-3 | gf2-4 |
|---|---|---|---|---|---|
| 1 | Circle order (12 keys in fifths) | 2 | 2 | 2 | 2 |
| 2 | Key signatures correct | 2 | 2 | 2 | 2 |
| 3 | Relative minors | 2 | 2 | 2 | 2 |
| 4 | Diatonic content with qualities | 1 | 2 | 2 | 1 |
| 5 | Enharmonics at the F#/Gb seam | 2 | 2 | 2 | 0 |
| 6 | Real guitar surface | 2 | 2 | 2 | 2 |
| 7 | Teaching surface | 1 | 2 | 2 | 1 |
| 8 | Interactive wheel | **0** | 2 | 2 | **0** |
| 9 | Tests exercise the theory engine; red suite preceded build | 2 | 2 | 2 | 2 |
| 10 | Delivery: gates green **and** app loads without console errors | **0** | 2 | 2 | **0** |
| | **TOTAL /20** | **14** | **20** | **20** | **12** |

### Confidence and method

- Items 1–5, 9 scored from source in a worktree of each `refs/sandbox/<id>`.
- Items 6–8, 10 scored from the **running app** on the VM after `just sbx lifecycle refresh`, via a
  headless browser (screenshots and console capture in `.playwright-mcp/`).
- **gf2-1 and gf2-4 score 0 on items 8 and 10 because their apps crash on load.** They could not be
  interacted with at all, so item 8 is unscoreable-as-working rather than merely thin. Item 4 and 7
  for those two are scored from code, and are therefore *generous* — the features exist in source
  but no user can reach them.
- gf2-2 and gf2-3 both scored 20/20. That is a **rubric ceiling problem**, not a tie on merit: see
  Findings §5.

### vs the 2026-08-28 control

| run | arm scores /20 |
|---|---|
| 2026-08-28 (control, N=3, default roster) | 15 / 9 / 19 |
| 2026-09-18 (this run, N=4) | 14 / 20 / 20 / 12 |

Median rises 15 → 17, and the floor rises 9 → 12. But the spread is still enormous **within the same
roster**: gf2-1 scored 14 and gf2-2 scored 20 on identical roster, prompt and pin. Sampling noise
remains the dominant effect, exactly as the 2026-08-28 judge warned.

## Builder tool errors (H1)

| arm | builder model | calls | errors | rate | **schema** | missing `path` |
|---|---|---|---|---|---|---|
| baseline 2026-09-17 | deepseek-v4-flash | 128 | 20 | 15.6% | **18** | 18 |
| gf2-1 | deepseek-v4-flash | 163 | 9 | 5.5% | **2** | 1 |
| gf2-2 | deepseek-v4-flash | 112 | 4 | 3.6% | **2** | 2 |
| gf2-3 | deepseek-v4-flash | 143 | 6 | 4.2% | **1** | 0 |
| gf2-4 | **kimi-k3** | 48 | 1 | 2.1% | **0** | 0 |

**H1 CONFIRMED with margin.** Target was ≤3 schema failures; every arm met it, and the three
deepseek arms agree closely (2, 2, 1) — consistent, not a lucky draw.

Not every error is prompt-attributable. gf2-1's 9 errors include **5 legitimate `bash` non-zero
exits** (a missing module, a `cat` of a nonexistent file) and **1 model-format failure** where
deepseek leaked its own native tool markup into a JSON argument:

```
"limit": "22</｜DSML｜parameter">\n<｜DSML｜parameter name=\"offset…
```

plus a phantom tool named `content` from the same mangled parse. Those are a serialization failure
between deepseek's native function-calling format and the OpenAI-style JSON schema pi/OpenRouter
use. **No system prompt can fix them.** Prompt-attributable builder errors on gf2-1: 2 of 163.

The residual schema failures moved off `edit` entirely and onto **`write`** (gf2-2 ×2) and **`read`**
(gf2-1 ×1). The contract's first bullet gave `path` its own emphatic treatment for `edit` and
mentioned `write ({path, content})` only in passing. The **reviewer** (glm-5.3, a different model
family) also hit `write` missing `path`, so this is a general pattern against this tool schema, not
a deepseek quirk.

gf2-2 also produced two *overlapping-edit* errors — it adopted the "several changes in one `edit`
call" advice and then violated non-overlap. That is a more sophisticated failure than the baseline's
and counts as progress.

## Findings

### 1. The typecheck gate caught nothing (H2 FAILED)

`quality typecheck` ran in every arm and **passed every time** (exit 0, 0.1–0.6s). It never entered a
fix loop, never failed, never caught a defect. On the final harvested trees, all four arms report
**0 tsc errors** — including the two that crash on load.

It is not useless in principle: it demonstrably catches the `idx`-class defect that `bun build` exits
0 on (measured pre-run). But in this run it bought nothing, and it costs a `bun x` fetch per arm.

**It also has a false positive.** `import "./styles.css"` — the idiomatic bundler form — fails with
`TS2882: Cannot find module or type declarations for side-effect import`, while `bun build` accepts
it. gf2-2 dodged this only by choosing a `<link rel="stylesheet">` tag instead. An arm that reaches
for the import burns a bounded fix loop on a non-defect. Fix: ship `declare module "*.css";` in the
greenfield shell (another deliberate pristine bump).

### 2. The render smoke caused two crashes and contaminated all four arms (H3 FAILED)

This is the most important result of the run, and it is an indictment of my own Phase 3 work.

**All four arms shipped test-double code in production source.** gf2-3 ships an entire
`apps/app/testing/fake-dom.ts` module inside the app.

Two arms crash in a browser **because of** the stub, by two different mechanisms:

- **gf2-1** — `TypeError: Cannot read properties of undefined (reading 'add')` at `route → mount`.
  The stub stores classes in an internal `classNameSet` field behind a realistic `classList` getter.
  `main.ts:100` reached past the DOM API into that internal field, unguarded:
  `btn.classNameSet.add("active")`. `dom.ts` guards the same call with `?.` and is safe; `main.ts`
  does not. Passes `bun test` (MockEl has it), throws in a browser (real elements do not).

- **gf2-4** — `TypeError: Cannot redefine property: document` at `main.ts`. The agent wrote
  production code whose stated purpose is to serve the stub:
  ```ts
  // Test files reassign globalThis.document with richer stubs after this
  // module is cached; re-render into whatever document shows up next.
  Object.defineProperty(globalThis, "document", { … });
  ```
  `window.document` is non-configurable in a browser, so this throws at module load. Immediately
  above it, `try { render(); } catch { /* a partial DOM stub must never crash the test runner */ }`
  swallows render errors — which also makes the smoke test structurally unable to fail.

The plan anticipated the stub "going vacuous" if agents stopped extending it. What actually happened
is stronger and worse: agents **extended it enthusiastically, invented APIs on it, and then depended
on those inventions in production**. A test double that is not API-faithful is an attractive
nuisance, and the instruction to extend it made that worse, not better.

tsc cannot catch either crash **in strict or non-strict mode** — verified, both report 0 errors. The
hole is explicit `any` (`h(): any`, `Map<string, any>`), which defeats both equally. The plan's
strict-vs-non-strict tradeoff table is unaffected; strictness was never the gap. `oxlint`'s
`no-explicit-any` would flag it, but **`lint` is not part of `run_verify` or the TDD chain** — only
typecheck and tests are. That gap is mine.

**Recommended, in order:**
1. Replace the hand-rolled stub with a real DOM (`happy-dom`). You cannot invent `classNameSet` onto
   a real implementation. The plan rejected this as too heavy for a "no frameworks" shell; against
   two shipped crashes that trade was wrong.
2. If the stub stays: make it **API-faithful and sealed** — storage in a `#private` field or WeakMap,
   the object frozen, so there is nothing non-standard to reach for. Cheap, no dependency.
3. Add `lint` to `run_verify` so `no-explicit-any` runs.
4. Change the header comment: forbid *referencing the stub from production code*, not merely
   forbid deleting the test.

### 3. A frontier planner taxes the downstream flash agents (unplanned finding)

`test_designer` inherits `defaults.model` (deepseek) in **every** roster, giving four samples of one
model on one task:

| arm | planner | plan size | test_design calls | tokens | output | time |
|---|---|---|---|---|---|---|
| gf2-2 | flash | 283 ln / 2,508 w | 9 | 250k | 468 ln | 11.2 min |
| gf2-4 | flash | 330 ln / 3,247 w | 11 | 250k | 318 ln | 17.0 min |
| gf2-1 | flash | 354 ln / 2,799 w | 13 | 508k | 802 ln | 26.5 min |
| **gf2-3** | **opus-5** | **565 ln / 4,483 w** | **37** | **1,945k** | 677 ln | **46.4 min** |

Opus-5's plan is ~2× the size; the flash test_designer spent ~4× the tokens and 3–4× the tool calls
to produce **fewer** test lines than gf2-1. The effort went into comprehension, not output — and this
is the TDD chain, so it must reason about a red suite without running anything.

**Asymmetric rosters have a hidden cost nobody costed: upgrading one seat increases the load on the
flash seats downstream of it.** Worth a real experiment — upgrade the *pair* (planner +
test_designer) rather than one seat. The cost here is not dollars (this phase is pennies) but
**tokens and wall clock**: 1.94M tokens and 46 minutes, against 250k and 11 minutes for the same
model on a flash-authored plan.

### 4. Frontier seats did not buy an accepted build (H4, H5 both NOT SUPPORTED)

- **gf2-3 (asymmetric, opus-5 plan + review)** scored 20/20, was still rejected at review_2, and was
  the **least token-efficient arm in the run: 29.2M tokens**, with review_2 alone burning 3.28M. H4
  asked whether it beats both default arms by more than they differ from each other: it ties gf2-2
  at the rubric ceiling while gf2-1 and gf2-2 differ by 6 points. **The within-condition spread is
  larger than the between-condition difference.** Not supported. (Billed $7.73 — recorded, not
  scored.)
- **gf2-4 (inverse, kimi-k3 builder)** is the efficiency story, and it is a real one: **3.3M tokens,
  48 builder tool calls, zero schema errors**, with comparable code volume (2,195 src lines vs
  gf2-2's 2,020). It built more with 6.4× fewer tokens than gf2-1 and 3.8× fewer than gf2-2 — a gap
  far past the cross-family noise floor. And it still shipped a browser crash and scored lowest
  (12/20). **Token efficiency did not convert into a working app.** Not supported. (Billed $1.75 —
  recorded, not scored.)

**Which seat buys more?** Neither, on this evidence. The winning arm was neither frontier arm, and
the most token-efficient arm scored last. The binding constraint is not model capability at any
single seat — it is that **the gates cannot tell a working app from a broken one**, so a good build
and a crashing build both reach review looking identical. Until that is fixed, roster experiments
are measuring noise through a broken instrument.

### 5. The rubric has a ceiling problem

gf2-2 and gf2-3 both scored 20/20 despite gf2-3 using 2.3× the tokens and being rejected by its own
reviewer. A rubric that cannot separate them is not measuring what now matters. Items 1–3, 6 and 9
were scored 2 by every arm — they no longer discriminate.

**Recommendation for the next run:** add items with headroom, and **no cost item** (see
"Cost is recorded, never scored"):

- **Survives interaction**, not merely loads — click the wheel, change a key, play a chord.
- **Design quality**, which no arm's reviewer assessed at all (§6).
- **Token efficiency per delivered feature**, as the legitimate efficiency signal.
- Retire or split the items every arm aces, so the scale has room at the top.

### 6. Reviewers remain blind to visual design

gf2-2's reviewer (glm-5.3) produced a genuinely rigorous rejection: 9 blocking findings, line-cited,
catching real defects (`onPluck` accepted but never bound while the caption claims "Click a position
to pluck it"; all five CAGED shapes given the same `baseFret` when real zones stagger C@0 A@3 G@5
E@8 D@10). **Not one of the 9 mentioned that the app had no styling whatsoever at that point.**

This reproduces the 2026-08-28 finding that agents are "blind to their own design" — and it now
extends to reviewers. Styling did arrive in gf2-2's `revise_1` (`styles.css`, 111 lines), so the
outcome was fine; the point is the reviewer never asked.

**The reviewer is not negligent — it is blindfolded.** It reads source. It has no channel through
which an app can *look* like anything, so "the page is unstyled" is not a fact available to it. No
prompt change fixes a missing sense; asking a text-only reviewer to judge design just invites it to
guess from CSS line counts.

**The fix shares infrastructure with the load check (follow-up 5), and that is the argument for
doing both at once.** Both need one thing the VM does not have today: a headless browser in the
chain. With it:

- `run_verify` gains a real load assertion — zero console errors on open. That alone would have
  caught gf2-1 and gf2-4.
- The same render produces a **screenshot**, which can be attached to the reviewer's context. A
  reviewer that can see the page can say "this is unstyled" as a finding, and can judge layout,
  hierarchy and legibility — the rubric's item 7 territory that nothing currently measures.

One provisioning change (add a headless browser to `provision.sh`) buys crash detection *and* the
first design review this factory has ever had. Cost: a heavier image and a slower provision.

## Verdicts

| # | hypothesis | verdict |
|---|---|---|
| H1 | builder tool contract cuts `edit` schema failures to ≤3 | **CONFIRMED** — 18 → 0/1/2, all four arms, three deepseek arms agreeing (2,2,1) |
| H2 | the tsc gate catches ≥1 real defect during a fix loop | **FAILED** — never failed once in any arm; 0 defects caught; has a CSS-import false positive |
| H3 | the render smoke surfaces a crash, or its stub is extended not deleted | **FAILED** — stub was extended, but it *caused* 2 browser crashes and put test-double code in all 4 arms' production source |
| H4 | asymmetric beats both default arms by more than they differ from each other | **NOT SUPPORTED** — ties the ceiling while using the most tokens in the run (29.2M), still rejected; within-condition spread (6 pts) exceeds between-condition |
| H5 | inverse beats both default arms by more than their spread | **NOT SUPPORTED** — lowest score (12) and shipped a crash, despite the best token efficiency (3.3M, 6.4× better than gf2-1) and best tool-use metrics in the run. Efficiency did not convert into a working app |

## Follow-ups

**Applied 2026-09-18** (after review, same morning):

- **#1 stub → happy-dom.** Greenfield commit `4d6e63bd`, `target.pristine` bumped to it. Verified
  against the real crashed code from both arms: gf2-1 now fails with
  `undefined is not an object (evaluating 'btn.classNameSet.add')` and gf2-4 with
  `Attempting to change configurable attribute of unconfigurable property` — the same errors the
  browser reported, now inside the fix loop. `configurable: false` on the document binding is the
  load-bearing part; without it the gf2-4 class still passes.
- **#2 scope corrected, then done host-side.** Building #1 showed the browser is **not needed for
  crash detection** — happy-dom catches both classes. So `just sbx manage shot <run-id>` records
  what shipped (screenshot + console errors) from the host, where a browser already exists, rather
  than putting ~190 MB of chromium on every arm. It is an observation, not a gate: gating belongs in
  the fix loop.
- **#2b reviewer design criteria.** Root cause was sharper than "blind": the reviewer prompt said
  *"Not your job: … style opinions …"*, so it was **instructed** to ignore the UI. Now split — code
  style stays out of scope, the delivered interface is a requirement.

**Still open:**

1. **Generalize the `path` bullet** to every file tool (`edit`, `write`, `read`) and strengthen the
   non-overlap constraint on multi-edit calls. *Cheapest win on the list — H1 already proved the
   mechanism works, this just widens its scope.*

2. **Fix the tsc CSS false positive** — `declare module "*.css";` in the greenfield shell (another
   deliberate pristine bump).

3. **Add `lint` to `run_verify`** so `no-explicit-any` runs in the chain. Both crashes hid behind
   explicit `any`, which tsc cannot see in either mode.

4. **Rework the rubric** for headroom, with **no cost item** (§5).

5. **Test seat *pairs*, not single seats** (§3) — upgrading the planner alone taxed the flash
   test_designer downstream.

6. **Add a `model-format` error kind to `trace_metrics.py`** so DSML-style corruption is not folded
   into `schema`/`other`. Provider bugs and instruction-following failures have different owners and
   should not share a bucket.

## Artifacts

- Harvested: `refs/sandbox/gf2-{1,2,3,4}-20260918-*` in `../greenfield-sandboxes`
- Bundles: `.sandbox/runs/gf2-*.bundle`
- Traces: `.sandbox/traces/gf2-*/`
- Screenshots: `.playwright-mcp/gf2-{1-crash,2-final,3,4}.png`
- gf2-1, gf2-3, gf2-4 were rescued with `just sbx manage snapshot` (all three rejected with dirty
  trees); without it their builds would have died at teardown.
