---
plan: next-session-memo
created: 2026-09-18T17:10:00-07:00
modified:
  - 2026-09-18T17:10:00-07:00
  - 2026-09-19T11:10:00-07:00
commits:
  - 2bc8aad — review loop: say what you mean, and let the builder look at its own work
  - b6a135d — render_smoke: catch symmetric sector breakage, and stop skipping silently
agents:
  - claude-opus-5[1m]
sessions:
  - dffee14d-ee4b-4c19-8efc-38460132110c
  - 609c01b7-75ec-4c74-af00-45fa9d061fea
back_refs:
  - specs/bare-claude-control-arm-results.md — the generalist control, 31/32
  - specs/what-the-bare-arm-actually-did.md — the four-handicap decomposition
  - specs/fix-validation-arm-preregistration.md — the predictions for fixval
  - NEXTSTEPS.md — 2026-09-19, 2026-09-19b, 2026-09-19c
forward_refs: []
status: open
---

# Memo: where to pick this up

Rewritten 2026-09-19, replacing the 2026-09-18 version (its three questions are all answered or
actioned below). Two runs this session: the **bare Claude control arm** and **fixval**, the arm that
validated two factory fixes.

## State of play

**Answered this session:**

| question | answer |
|---|---|
| Does the factory beat one generalist agent? | **No.** One 37-min turn scored 31/32 against the chain's best 32/32, for $4.28 of Shelley credit (see the cost caveat below). Ron: the first result he would host and share, and he'd replace his own app with it. |
| Is the agency gap harness or model? | **Harness.** Confirmed twice: the bare arm installed playwright unprompted; the factory builder, once *told*, reached for a tool 16 times against a control of 0-of-7. |
| Does cutting the review loop cost real convergence? | **Yes.** fixval went 11/30 → 21/33 → **30/30 accepted**. Under the old code it stops at review_2, rejected. |

**Shipped and validated on hardware:** `MAX_REVISIONS = 2` (3 reviews / 2 revisions) across both
SDLC chains and build_review · `FINAL_REVIEW_NOTES` into the last review only, via
`agents.with_notes()` · the builder's in-build verify section · `render_smoke` assertion E
(symmetric sector breakage) · `render_smoke` re-exec under `uv run` · ssh keepalives on
`sbx run agent`.

**Live state:** two VMs up (`bare-cc-20260919-ba3919`, `fixval-20260919-250a64`), nothing torn
down, both runs harvested with traces. The bare arm's app is promoted to its own repo at
`/Dev/circle-for-guitarists` (commit `4717fb7`). Greenfield synced at `2643f42`.

**The one result that should drive everything next:** we have now shipped **three silent-channel
defects in three runs**, and **two of the three were found by Ron's ear**, not by any instrument we
own. Meanwhile the factory also shipped a wheel drawn 330° wrong past every gate including its own
render smoke. **The factory is deaf and blind, and our gates are catching the classes we already
know about, one at a time, after the fact.**

---

## The ranked list

### 1. Give the builder an instrument that returns a PICTURE — not another gate

**This is the highest-value item and it follows directly from the aesthetic gap Ron identified.**

bare-cc screenshotted its own app, cropped the images, and **read them back** — 10 of its 81 tool
calls were image reads — then fixed a clipped caption and added a regression test for it. fixval
never looked at anything. The visual difference between the two apps is not subtle, and neither is
the explanation.

A working `render_smoke` would **not** have closed that gap. It returns a verdict, not an image.
Assertion E catches one geometry fault; nothing catches "the Roman numerals collide with the key
letters", which is exactly what fixval also shipped.

**Build `shoot.py` for the builder**: boot the app, screenshot it (full page + a couple of crops),
write the PNGs to `/tmp`, and print the paths. Then say in the builder prompt: *run this and read
the images before you report.* Pi's harness must be able to return an image to the model — **check
that first**, because if it cannot, this item becomes "switch the builder seat to a harness that
can", which is a much bigger and more interesting question.

**Falsifiable:** if a builder that can see still ships a mislabelled wheel, the gap is not
perception and I am wrong about the mechanism.

### 2. Assert the silent channels in the BRIEF, not in the gates

Three runs, three audio defects, each a different mechanism:

| run | defect | survived |
|---|---|---|
| gf4-solo | chord played `root, root+1, root+2` — chromatic cluster | 41 tests, typecheck, lint, render gate, reviewer, my interaction pass |
| bare-cc | **none** — it asserted `voicingMidis` at every root, unprompted | — |
| fixval | `freqOfPc(pc)` has no octave: B is +11 semitones from C | 31+37 tests, all gates, render smoke, a 30/30 reviewer |

The one arm that got it right is the one that **wrote the assertion itself**. So do not chase this
with gates — a gate per defect class is a losing race. Put the requirement where it shapes the
work: one line in `prompts/greenfield.md` to the effect of *"any output the user perceives but the
DOM does not show — audio, timing, focus order — must be asserted by value in the durable suite."*

The bare arm's test is the worked example to lift: it computes the MIDI set actually handed to the
audio engine and asserts it equals the chord, at every root.

**Cheap, and it tests the general claim** that agents are reliable where they have a strong prior
OR an explicit assertion, and unreliable only in the gap between.

### 3. Stop ranking arms on accept/reject — now with a sharper reason

fixval is **accepted, 30/30, "verified working end to end"** — and ships a wheel drawn 330° wrong
and a neck where B sounds above C. The extra revision loop did not make it correct; it made the
reviewer satisfied.

This does not undo item (4)'s validation — convergence was real, 11 → 21 → 30 requirements. It
means **requirements-met is the wrong outcome variable**, because an arm grades against its own
plan, and a plan can be fully satisfied by an artifact that does not work. Rank on delivered
behaviour. Keep reviews as a findings source.

Add **"would you use it?"** as a recorded first-class measure, before any scored item. It separated
a field that the rubric called tied (four arms at 31–32/32) in under a minute.

### 4. The continuity probe — the last unpriced handicap

Of the four handicaps in `specs/what-the-bare-arm-actually-did.md`, three are addressed:
(1) discovery — told, and it worked; (3) self-review before handoff — instrumented, if not yet
working; (4) truncated loop — fixed and validated. **(2) context discontinuity is untouched.**

Run the chain with build → review → revise as **one resumed session** instead of three fresh ones,
everything else identical. That is the only way to price what the envelope handoff actually costs.
It is also the most architecturally invasive change we have considered, so it deserves a real
pre-registration.

### 5. Retire the dead rubric items

Four arms now sit at 31–32/32. Part A items 2, 3, 6, 9, 10 and part B item 14 score 2 for
everything. The rubric cannot separate good from broken any more — it scored fixval 30/30 on
requirements while the app's core object was mangled. Either rebuild it around delivered behaviour
or replace it with the "would you use it?" judgement plus the mechanical gates.

---

## Deferred, on purpose

**Roster and model-family comparisons.** Still deferred, and the reason got stronger: within-condition
spread has been 4× on cost, and we now know the outcome measure itself is unreliable. Fix the
measurement before spending on a roster fan-out.

**A cost caveat that has to be fixed before ANY cross-lane comparison.** The agent-mediated lane
(`just sbx run agent`) bills the exe.dev **Shelley** allowance at exe.dev's `claude-opus-5` rate,
which is in **none** of our rate tables — every roster and `models.json.tmpl` is `openrouter/<id>`.
Nothing in this repo can compute or report it: pi never sees it, the tracer never records it, and
`sbx manage list` shows only the OpenRouter key ($0.00075 for that arm). The bare arm's $4.28 is a
**balance delta** read either side of the run, and that method only works while nothing else touches
Shelley — so a fan-out on this lane has no per-run cost attribution at all, since the billing page
aggregates by model per month. Same shape as the old `$0.0000` bug, one level out: **a lane whose
spend our instruments cannot see.** Decide whether to teach the tooling this rate or to stop quoting
the two lanes' costs side by side.

**A clean re-run of the bare arm** with `adws/` moved aside, to settle the stop-rule contamination.
Low value — it tests tooling access, and the capability question is answered.

---

## The thing worth keeping in view

Unchanged from the last memo, and now better evidenced:

> Agents are reliably good where they have a **strong learned prior** (taste) or an **explicit
> assertion** (tested theory), and unreliable precisely in the **gap between them** — a channel with
> no prior strong enough to carry it and no check to catch it.

Every arm produced a well-designed dark-themed app with zero pressure on aesthetics — strong prior.
Every arm with an audio assertion got audio right; every arm without one shipped it wrong — explicit
assertion, or its absence. The bare arm is the existence proof that **one agent that can look at its
own work closes the gap by itself**, which is why item 1 is first.
