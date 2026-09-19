---
plan: fix-validation-arm-preregistration
created: 2026-09-19T08:55:00-07:00
modified:
  - 2026-09-19T08:55:00-07:00
commits:
  - 2bc8aad — Review loop: say what you mean, and let the builder look at its own work
agents:
  - claude-opus-5[1m]
sessions:
  - 609c01b7-75ec-4c74-af00-45fa9d061fea
back_refs:
  - specs/what-the-bare-arm-actually-did.md — the four-handicap decomposition these fix two of
  - specs/bare-claude-control-arm-results.md — the arm that exposed them
  - specs/greenfield-cof-experiment.md — the hidden rubric
forward_refs: []
status: open
---

# Fix-validation arm — pre-registration

**HOST-ONLY.** Rubric stays out of the VM.

One greenfield TDD arm, default roster, pin `7e90258` (host `2bc8aad`). Written before the mount.

## Under test

Two changes, both landed 2026-09-19, neither yet exercised by an agent:

| change | expected visible effect |
|---|---|
| `MAX_REVISIONS = 2` (was 1 revision in disguise) | `review_1 → revise_1 → review_2 → revise_2 → review_3` |
| `FINAL_REVIEW_NOTES` into the last review only | the final review discusses the delivered app, not just the last diff |
| builder prompt: in-build verify section | **the builder runs a browser/instrument during its own phase** |

## Predictions

### P1 — the builder uses the verify tooling. **This is the one that matters.**

**Claim:** the builder (or a fix/revise phase) invokes `render_smoke.py`, playwright, chromium, or
writes its own instrument in `/tmp`, **at least once**.

**Control: 0 of 7 arms, ever.** Every prior factory agent worked blind. The bare arm did it
unprompted; the question here is whether *telling* a specialist is enough.

**Check:** `just sbx manage trace-metrics <id>` plus a grep of the pulled traces for
`render_smoke|playwright|chromium|screenshot`.

**Falsified by:** zero such calls, which would mean the allowlist/harness blocks it or the prompt
is not read as permission — and would move the weight decisively onto handicap (2), continuity.

### P2 — the loop runs longer than it used to, *if* the reviewer rejects

**Claim:** if review_1 rejects, the run reaches `revise_2` — a phase name that **has never appeared
in any run in this repo**.

**Caveat, registered now:** if review_1 approves, this arm says nothing about the loop change. That
is a real possible outcome and not a failure; it just means n=1 was the wrong instrument for P2 and
the loop fix needs a rejecting run to be exercised.

### P3 — delivered quality: no strong claim at n=1

**Claim:** part A ≥ 16 and A+B ≥ 24, i.e. within the established band. I do **not** predict these
two fixes lift the score. The rubric is saturated (four arms at 31–32/32), so it is the wrong
instrument for a quality delta.

**The measure recorded first, before any scored item:** Ron's "would you use it?" — the
discriminator that separated a tied field in under a minute where the rubric could not.

## What this arm cannot answer

**Handicap (2), context discontinuity, is untouched.** The revise phase is still a fresh session
reading an envelope. If P1 confirms and quality does not move, that is evidence *for* continuity
being the binding constraint — the builder will have looked at its own work and still handed a
finding to an agent with no memory of it.

n=1. Within-condition spread on this rubric has been 4× on cost and 5 points on part B with nothing
varying, so no quality claim from a single arm survives that noise floor. P1 is binary and does
survive it.
