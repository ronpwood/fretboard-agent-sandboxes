---
plan: next-session-memo
created: 2026-09-18T17:10:00-07:00
modified:
  - 2026-09-18T17:10:00-07:00
commits: []
agents:
  - claude-opus-5[1m]
sessions:
  - dffee14d-ee4b-4c19-8efc-38460132110c
back_refs:
  - specs/greenfield-fanout-3-results.md — the N=6 scorecard
  - specs/greenfield-fanout-3-preregistration.md — the predictions, committed before the run
  - NEXTSTEPS.md — 2026-09-18d/e/f session entries
forward_refs: []
status: open
---

# Memo: where to pick this up

Written at the end of 2026-09-18, after fan-out 3 (N=6) and a solo validation run. Everything
below is either unstarted or explicitly deferred — nothing here is in flight.

## State of play

**Fixed and proven today:** the render gate in `run_verify` (validated live, 12.5s, no false
positives), the agent stall watchdog (`PI_STALL_SECONDS`, kills the process tree), `--frozen-lockfile`
provisioning, the `just`-install retry, and gate C's busy-vs-broken distinction.

**No VMs, no orphaned keys, everything harvested.** Seven greenfield arms and their traces are local.

**The one result that should drive everything next:** accept/reject is *anti-correlated* with
delivered quality. Two accepted arms ranked 4th and 6th of six; the solo run produced the best app of
all seven and was rejected. Until that is fixed, no comparison that uses accept/reject as its outcome
measure means anything.

---

## Ron's three questions, which are better than my follow-up list

### 1. The reviewer is cut off mid-convergence — and the last review is always wasted

**His instinct, and the code backs it harder than he put it.** `MAX_REVISION_LOOPS = 2` in
`adw_tdd_sdlc.py:57` produces `review_1 → revise_1 → review_2 → stop`. The loop breaks at
`i == MAX_REVISION_LOOPS` **before** revising, so **the final review's findings are never acted on,
in any run, ever.** N reviews yield N−1 revisions.

Evidence it is cutting off real convergence, not churn:

| arm | review_1 | after revise_1 | outcome |
|---|---|---|---|
| gf3-3 | 11 blocking, 11/24 met | 8 blocking, **18/24 met** | rejected, 8 findings discarded |
| gf3-1 | 10 blocking | **8 of 10 closed**, 2 left | rejected, both remaining findings small and localized — its own reviewer said so |

gf3-1's reviewer wrote that the two survivors were *"both small, localized, and have existing
engine/audio"* to build on. That is one more loop from acceptance.

**The experiment:** same prompt, same roster, vary `MAX_REVISION_LOOPS` ∈ {2, 3, 4}. Cheap, one
variable, and the outcome measure is delivered quality, not the verdict.

**The caveat worth pre-registering:** more loops may just mean more churn against a *self-authored*
spec — the anti-correlation mechanism. If arms converge on their own requirements while the app gets
no better, that is a finding about the spec, not the loop count. Cost is real too: gf3-3's review_2
alone burned 1.68M tokens.

### 2. The agency gap — why VM agents don't behave like we do

**The sharpest observation of the session**, and there is a concrete answer rather than a mystery.
Across all six fan-out 3 arms plus the solo, **not one agent ever reached for a browser** — zero
mentions of chromium, playwright, puppeteer, jsdom or selenium. None tried to install anything. Yet
they clearly *wanted* runtime truth: one wrote a `setInterval` probe to test import timing, another
grepped for click handlers to infer whether the UI responded.

They were reconstructing by inference what they could have observed directly. Why:

1. **`tools:` is an allowlist, and it has no discovery in it.** The builder gets read, bash, edit,
   write, grep, find, ls. No web search, no fetch. **It cannot find out that playwright exists.** We
   can, in a normal session — that is the single biggest difference.
2. **Nothing advertises the box.** Chromium is installed now; no prompt says so. Nothing tells an
   agent what is on the VM, that it has network, or that it may add a dependency.
3. **No one to ask.** `pi -p` is one non-interactive shot per phase and `ask_question` is not in the
   roster. There is no "should I install X?" path, so the safe read is "no".
4. **The prompt reads as a prohibition.** Greenfield says *"no frameworks beyond what `bun build
   --target=browser` bundles"*. Agents treated the other constraints literally; it is reasonable to
   read that as "do not add dependencies."
5. **No memory across phases.** Each phase is a fresh session handed an envelope. A wish accumulated
   in `build` cannot motivate an install in `revise`.

**The framing:** we built a factory of *specialists with fixed tools*, and specialists with fixed
tools do not go shopping. A Claude Code session is a *generalist with discovery tools and a human to
ask*. That is a design difference, not a model deficiency — and it is fixable at (1) and (2) cheaply.

**Cheapest probe:** tell one arm, in one line, that chromium and `render_smoke.py` exist. See whether
it uses them. That isolates "didn't know" from "wouldn't think to".

### 3. The bare Claude Code control arm — run this FIRST

**This is the highest-value experiment we have**, and it subsumes the plan-build idea. Mount a VM,
hand the *identical* greenfield prompt to a single Claude Code session via `just sbx run agent`, no
factory, no phases, no gates. Compare against the seven TDD arms on the same rubric.

It directly tests Ron's "a simple plan-build session would probably produce better results," and it
does so at the extreme: **one generalist agent with tools, versus the entire chain.**

Why it is worth doing before any roster or chain comparison:

- It is the **only** experiment that questions the premise rather than tuning inside it.
- It needs no measurement fix — "does the app work" is scoreable regardless of what produced it.
- It is one VM and roughly one arm's cost.
- It also tests §2 directly: a Claude Code agent *does* install things and test in `/tmp`. If the
  bare agent reaches for a browser unprompted while six factory arms never did, that isolates the
  agency gap to harness and tooling rather than to the models.

**Pre-register the outcome measure before running it**, and do not use accept/reject — there is no
reviewer in this arm. Score both rubric parts plus the render gate, exactly as the fan-out arms were
scored.

---

## My open recommendations, re-ranked after today

1. **Assert audio (or any silent channel).** `main.ts:88-92` played `root, root+1, root+2` — C major
   emitted C–C♯–D. It survived 41 tests, typecheck, lint, the new render gate, the reviewer, and a
   manual interaction pass. A unit test asserting the **emitted MIDI set** for a known chord would
   have caught it in `test_1`. Generalised: **any output channel with no assertion is one where a
   confident, well-typed, fully-tested wrong answer ships.** Audit for others — timing, animation,
   focus order, keyboard nav, screen-reader output.
2. **Stop ranking arms on accept/reject** (§State of play). Keep reviews as a findings source. The
   deeper fix is grading every arm against the **brief** rather than its own plan, which is what
   makes ambition self-penalising.
3. **Run the render gate on revised code.** The retest phase sits *after* the review loop concludes,
   so a rejected arm's final tree is never render-verified. Only accepted arms get checked.
4. **The final review must audit the delivered app, not the last diff.** gf3-6 was approved on a
   review scoped to a single-file fix; it never examined the app. That — not reviewer blindness — is
   why its dead wheel shipped. A reviewer *can* catch unwired controls: the solo run's did,
   unprompted.
5. **Guard the `document` rebind in the test_designer prompt**, and protect the harness block of
   `apps/*/app.test.ts` while leaving test bodies writable. Five of six test_designers already guard
   correctly without being told; a blanket file protection would block gf3-3's genuinely good
   behaviour (adding durable regression tests).
6. **Re-examine the merged-edit advice.** `not-found` errors rose 3 → 16 fleet-wide. Plausibly the
   "merge neighbouring changes into one larger entry" rule trading schema failures for match
   failures. Unconfirmed, one run.
7. **Retire the dead rubric items.** Part A items 2, 3, 6, 7, 9, 10 and part B item 14 scored 2 for
   every arm. Part B needs headroom above 12 the way part A needed it above 20.

**Deferred on purpose:** roster and model-family comparisons. Ron's cohort hypothesis is interesting
and has real supporting evidence (fan-out 2's frontier planner taxed the downstream flash
test_designer 4× in tokens — a measured cross-family handoff cost, and the adversarial reviewer seat
works *well* cross-family). But within-condition spread is currently 4× on cost and 5 points on part
B with nothing varying. **Any roster effect has to clear that noise floor.** Fix the measurement
first or we repeat fan-out 2.

---

## The thing worth keeping in view

The agents' **priors are good**. Every one of seven arms produced a genuinely well-designed app —
dark theme, hierarchy, colour-coded functional roles, legends — with **zero pressure on aesthetics**:
no gate, no test, no prompt, and a reviewer explicitly neutralised to say nothing about design.

Set that against the chord bug. The pattern is not "agents are weak at X". It is:

> Agents are reliably good where they have a **strong learned prior** (taste) or an **explicit
> assertion** (tested theory), and unreliable precisely in the **gap between them** — a channel with
> no prior strong enough to carry it and no check to catch it.

That argues for a **cheaper chain plus targeted assertions**, not a longer chain. Which is the same
place Ron's instinct pointed, arrived at from the other direction.
