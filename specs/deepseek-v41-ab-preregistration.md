---
plan: deepseek-v41-ab-preregistration
created: 2026-09-20T06:50:00-07:00
modified:
  - 2026-09-20T06:50:00-07:00
commits:
  - b5f136b — Model refresh: register deepseek-v4.1-flash and add the A/B roster
agents:
  - claude-opus-5[1m]
back_refs:
  - specs/fix-validation-arm-preregistration.md — the run whose numbers are the baseline
  - specs/greenfield-cof-experiment.md — the hidden rubric
forward_refs: []
status: open
---

# DeepSeek V4.1 Flash vs V4 Flash 0731 — pre-registration

**HOST-ONLY.** Rubric stays out of the VM. Written after both arms were mounted
and executed, before either produced a phase result.

## Arms

| arm | run id | roster | deepseek seats |
|---|---|---|---|
| control | `dsctl-20260920-ff9573` | `sssf.config.yaml` | `deepseek-v4-flash-0731` |
| treatment | `dsv41-20260920-8233d1` | `sssf.dsflash41.config.yaml` | `deepseek-v4.1-flash` |

Same brief (`prompts/10-circle-of-fifths-wheel.md`), same ADW (`adw tdd`), same
target (greenfield), same factory pin (`8a83bd83`, host `b5f136b`), same limit
($10), same toolchain. The rosters differ by **one line**; `diff` from
`defaults:` onward returns exactly the model id.

Affected seats: **test_designer, builder, scout.** planner (gemini-3.8-flash),
reviewer (glm-5.3) and documenter (gpt-5.6-luna) are identical in both arms and
act as an internal control — if their numbers move, something other than the
model moved.

## Why this is NOT a comparison against fixval

`fixval-20260919-250a64` ran before `2bc8aad` and `b6a135d`. Its builder invoked
`render_smoke.py` 16 times and got `SMOKE EXIT: 2` (a silent skip) every time.
Today's factory returns a real verdict. **A single arm against fixval would
measure model + harness fix and could not separate them.** That is why the
control arm exists and is being re-run from scratch today rather than read off
yesterday's record.

fixval's numbers are context, not the control:

| | fixval (0731, old factory) |
|---|---|
| phases / verdict | 19/19, ACCEPTED |
| wall clock | 107 min |
| test_design | 40 min |
| build + fix_1 + revise_1 + revise_2 | 48 min |
| **deepseek share of wall clock** | **88 of 107 min (82%)** |
| builder tool calls / errors | 174 / 4 (2.3%) |
| tokens | 33.5M |

## Predictions

### P1 — speed. **This is the one Ron raised.**

**Claim:** the treatment arm's deepseek-owned phases (`test_design`, `build`,
every `fix_*` and `revise_*`) take **less total wall clock** than the control's.

**Measured by:** `phases` table, summed minutes for those phases, per arm.

**Falsified by:** treatment ≥ control. A tie is a real answer — it would mean
the slowness is the harness (tool-call round trips, context reload), not the
model, and the next lever is architecture, not a model swap.

### P2 — tool-call competence

**Claim:** the treatment builder's tool-call error rate is **at or below** the
control's. 0731's residual on this schema is `edit` not-found and overlapping
edits (`trace_metrics.py` kinds `not-found` / `other`).

**Measured by:** `just sbx manage trace-metrics <id>`, builder row, both arms.

**Falsified by:** a higher error rate, or a new error kind (e.g. the DSML-markup
leak into JSON seen on an earlier fan-out).

### P3 — outcome quality is judged against the rubric, not the verdict

**Claim:** neither arm's ACCEPT/REJECT is used to rank them. Per
`fanout3-results`, accept/reject is anti-correlated with quality.

**Measured by:** the hidden rubric in `specs/greenfield-cof-experiment.md`,
scored per `cases[].requirement`, plus `render_smoke` Assertion E and a
by-ear check of the audio path (the factory is still deaf, and this is the
fourth run in a row where that is the known gap).

**Explicitly NOT a ranking input:** dollar cost. See the standing rule — cost is
recorded, never scored.

## Known confound to report, not to silently correct

`check_rates.py` flags **four pre-existing drifts**, and one of them lands
directly on this experiment: the registry prices 0731 at `0.14/0.28` against a
live `0.04/0.08`, while the new `deepseek-v4.1-flash` entry matches live
exactly. **The control arm's recorded cost is therefore inflated ~3.5x relative
to the treatment's on the input leg.** A naive arm-to-arm cost comparison is
invalid. The authoritative path is generation-id reconciliation (2026-09-07g),
not the trace estimate. Left uncorrected on purpose: the deepseek
keep-catalog-vs-use-measured decision is still open and is not this run's to
settle.

## What a win does and does not authorize

A win on P1+P2 authorizes promoting `deepseek-v4.1-flash` into
`sssf.config.yaml`'s `defaults.model` and retiring the sibling roster. It does
**not** authorize the other five rosters — those still carry 0731 and each one
is its own decision.
