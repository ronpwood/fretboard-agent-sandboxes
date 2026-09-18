---
plan: greenfield-fanout-3-preregistration
created: 2026-09-18T12:20:00-07:00
modified:
  - 2026-09-18T12:20:00-07:00
commits:
  - 96ec208 — provision: freeze the lockfile, and retry the just install
agents:
  - claude-opus-5[1m]
sessions:
  - dffee14d-ee4b-4c19-8efc-38460132110c
back_refs:
  - specs/greenfield-fanout-2-results.md — the run this one controls against
  - specs/greenfield-cof-experiment.md — the hidden rubric (part A frozen, part B new)
  - specs/greenfield-target.md — the named target and its pristine guard
forward_refs: []
status: in-progress
---

# Greenfield fan-out 3 — pre-registration

**HOST-ONLY.** The rubric lives in `specs/greenfield-cof-experiment.md` and must never enter a VM
or a target's `prompts/`.

Written **before any arm was executed**, so the predictions cannot be fitted to the results. The
scorecard is a separate document; this one is not edited after execution begins except to record
that it was followed or departed from.

## The question

Did this morning's factory changes help? Nothing else varies.

Six arms, **one roster** (default), one prompt (`prompts/greenfield.md`, byte-identical since
2026-08-28), one pin, one chain (TDD).

## Why one condition

Fan-out 2 ran 2 default + 1 asymmetric + 1 inverse and found that the **within-condition spread
exceeded every between-condition difference**: gf2-1 scored 14 and gf2-2 scored 20 on identical
roster, prompt and pin, while the asymmetric arm tied the ceiling at 20 and the inverse arm scored
12. With n=2 per condition, no roster claim was separable from sampling noise.

The stronger reason is the fan-out 2 headline: **the gates could not tell a working app from a
broken one.** All four arms had green tests and zero tsc errors; two of them did not run in a
browser. A roster comparison conducted through an instrument that cannot detect a crash measures
the instrument, not the rosters. The instrument changed this morning. Test it first.

Roster questions resume once the variance under a fixed roster is known.

## Under test

Seven changes since the fan-out 2 pin, none previously exercised by an agent:

| change | where |
|---|---|
| happy-dom replaces the hand-rolled DOM stub | greenfield shell `4d6e63b` |
| `declare module "*.css"` ambient declarations | greenfield shell `4a6dfc8` |
| reviewer scope rules neutralized (zero design words) | `reviewer/system.md` |
| `path` required on every file tool, not just `edit` | `builder/system.md` |
| `lint` added to `run_verify` | `quality.py` |
| `.d.ts` typecheck fix (glob relative to `APP_DIR`) | `quality.py` |
| `model-format` error classification | `trace_metrics.py` |
| `just sbx manage shot` | host recipe |

## Predictions

Registered in advance. Each names the instrument that settles it.

### P1 — zero stub-induced mount crashes

**Claim:** no arm ships an app that throws at module load in a real browser for a reason traceable
to the test double.

**Check:** `just sbx lifecycle refresh <id>` then `just sbx manage shot <id>` on every arm, plus the
interaction pass (below). Fan-out 2 control: **2 of 4 crashed** (gf2-1 `classNameSet`, gf2-4
`Cannot redefine property: document`), and both crashes were *caused by* the stub.

This is the crisp one: a binary mechanism check, not a score comparison, and the only prediction in
this set that n=6 can settle decisively. happy-dom cannot have a `classNameSet` invented onto it,
and `configurable: false` on the document binding reproduces the redefine failure inside `bun test`.

**Falsified by:** any arm crashing on load, whether or not the stub is implicated. Record the cause
either way — a crash from a *new* mechanism is a more interesting result than a clean sweep.

### P2 — tool-contract regression check (restated)

**Not a test of improvement.** Re-deriving the fan-out 2 traces with the new `model-format`
classifier (done before this run, so the control is not a post-hoc number):

| arm | builder calls | errs | schema | model-format | not-found | overlap |
|---|---|---|---|---|---|---|
| gf2-1 | 163 | 9 | 1 | 2 | 1 | 0 |
| gf2-2 | 112 | 4 | 2 | 0 | 0 | 2 |
| gf2-3 | 143 | 6 | 1 | 0 | 2 | 0 |
| gf2-4 | 48 | 1 | 0 | 0 | 0 | 0 |

Schema failures already sit at 0/1/2/0 per arm. The original prediction ("≤1 per arm") is inside
that range — half the control already meets it, and the generalized `path` bullet was built on
**four events total**. No n=6 run resolves an effect that size; the prediction would pass by default
and the prompt would get credit for sampling.

**Claim, restated:** the expanded contract section did not make tool use worse. No arm exceeds 3
schema failures, and fleet `not-found` + `overlap` does not rise above 5 (the control total).

**Check:** `just sbx manage trace-metrics <id>` per arm. Report `model-format` separately — provider
corruption and instruction-following failures have different owners.

### P3 — reviewer design findings, as a count

The reviewer prompt now contains zero design-specific words: it neither suppresses design judgment
(the pre-2026-09-18 state, where it was *told* "not your job") nor mandates it (my first, equally
steering, fix). Whether these agents notice an unstyled app is now measurable.

**Claim:** record **k of 6** reviewers that raise a design or delivered-interface finding unprompted.
Not a pass/fail — "≥1 of 6" is satisfied by chance and would tell us nothing. The control is
**0 of 4**, under a prompt that forbade it.

**Check:** read each arm's `review.md`. A finding counts if it concerns the delivered interface
(styling present at all, visible hierarchy, controls distinguishable from static text), not code
formatting.

### P4 — part A clusters, part B spreads

**Claim:** part A (frozen, 20 max) clusters at 18–20 because items 1, 2, 3, 6 and 9 were scored 2 by
every arm last run; part B (new, 12 max) produces a real spread.

**Check:** score both parts per `specs/greenfield-cof-experiment.md`. If part B *also* clusters, the
new discriminators failed and the rubric needs another pass — that is a result about the rubric, and
it is worth having.

### Secondary observations — recorded, not predicted

- **Did `lint` or `typecheck` ever fire?** H2 failed in fan-out 2 purely because the gate never ran
  hot: `quality typecheck` passed in all four arms, every time, catching zero defects. `lint` is new
  to `run_verify`. If the answer is again "zero, across six arms," that is a finding about the gate,
  not about the arms.
- **Did any arm write `import "./styles.css"`?** That is the only thing `declarations.d.ts` fixes.
  If no arm reaches for the import form, the fix is untested rather than confirmed.
- **Process metrics** per `specs/greenfield-cof-experiment.md`: tokens (total and builder seat), tool
  error rates, fix/revise loops consumed, and **billed spend as a dated fact only** — never scored,
  never a cost-per-point ratio.

## Procedure

1. `just target sync greenfield --push` — pin every arm to one `target_sha`.
2. Precompute six run ids with `run_record.py new-id`; mount each arm's `create → fill → setup →
   observe` in its own background subshell, concurrently.
3. `just sbx lifecycle execute <id> prompts/greenfield.md "" tdd` per arm, concurrently.
4. **Snapshot any arm that finishes rejected**, before anything else — three of four fan-out 2 arms
   ended rejected with dirty trees, and all three builds would have died at teardown.
5. Harvest every arm.
6. `refresh` → `observe` → interaction pass → `shot`, per arm. **All VMs stay alive until part B is
   scored**; items 11 and 14 require driving the app, and `shot` captures a page, not a session.
7. Score, write the scorecard, then teardown and reap.

### `just sbx mount` is not used here

That recipe resolves the run id by reading back `run_record.py list | [0]` — the newest record. Under
concurrency two arms can resolve to the same id, filling one VM twice and orphaning another. Passing
a precomputed suffixed id to `create` skips its `new-id` call and removes the race.

## Blockers hit before any arm ran

Recorded here because both were invisible from the host and neither is in the fan-out 2 write-up.

**Every arm failed gate A on `apps/app/bun.lock`.** The greenfield shell's lock was committed this
morning by the **host's bun 1.3.0**; provision installs **1.4.2**, which adds a `"configVersion": 0`
line, so `bun install` rewrote a tracked file and the git-integrity gate failed all six before an
agent ran. The happy-dom work was verified on the host, where the two bun versions are the same one
by definition. Fixed with `--frozen-lockfile` when a lock is committed — which is also what the
committed lock is *for*. Verified on a live VM: happy-dom installs, the shell's render smoke passes,
the tree stays clean.

**The `just` install took a 403 on three of six arms.** `install.sh` fetches from
`github.com/casey/just/releases`, and GitHub rate-limits release assets **by source IP**; every
exe.dev VM leaves through the same egress, so a fan-out is N simultaneous unauthenticated fetches
from one address. A serialised retry 20 s later still failed on two. Transient — the same URL
answered 302 minutes later — so the fix is a bounded retry with backoff, not a mirror. bun is
unaffected; bun.sh serves its own CDN.

**Gate C's roster ping flapped on `openai/gpt-5.6-luna`.** "temporarily rate-limited upstream",
on three of six arms, and it survived a 15 s stagger. Direct probing showed it is *intermittent*,
not blocked: two refusals then `pong` on the third try, 45 s apart. Gate C requests
`provider: {zdr: true, data_collection: "deny"}`, which restricts the call to zero-data-retention
upstreams — a much smaller pool than the model's general availability, and the likely reason this
seat is the one that flaps. Resolved by looping setup until the ping lands.

**The residual risk is recorded, not mitigated:** `gpt-5.6-luna` is the **documenter** seat, and the
documenter is the last phase of the chain. Gate C passing now is a point-in-time reading, and six
arms reach `document` at roughly the same time. If it flaps then, the phase has `retries=1` and may
fail. That costs the write-up, not the build — `git(commit_build)` lands **before** `documenter`,
and no item in either rubric part reads `app_docs/`. An arm that loses its write-up is still fully
scoreable.

### The pattern

**Three separate shared-resource ceilings appeared at N=6, and none of them was CPU:** GitHub's
per-IP release-asset limit, OpenRouter's ZDR upstream pool for one model, and (had `mount` been
used) the run-record read-back race. Shared vCPU does not cap arm count — that claim was corrected
on 2026-09-18 after costing ~40 minutes of needless serialization, and it remains correct. But
"concurrency is free" does not follow from it. The binding constraints on a fan-out are the
resources every arm reaches through one shared identity, and they first bit between N=4 and N=6.
