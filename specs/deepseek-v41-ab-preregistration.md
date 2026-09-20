---
plan: deepseek-v41-ab-preregistration
created: 2026-09-20T06:50:00-07:00
modified:
  - 2026-09-20T06:50:00-07:00
  - 2026-09-20T07:25:00-07:00 — amended mid-run: the treatment arm was blinded by a registry error
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


---

## Amendment, 2026-09-20T07:25 — the treatment arm is running BLINDED, by my error

Observed live in obs by Ron, then measured off both arms' `raw_output.jsonl`:

| builder tool calls | control (0731) | treatment (v4.1) |
|---|---|---|
| total | 36 | 64 |
| bash | 13 | 42 |
| `render_smoke` refs | 2 | 7 |
| **chromium / playwright / screenshot / .png** | **0** | **5 / 3 / 1 / 3** |

**The v4.1 builder wrote its own Playwright driver** (`/tmp/shot.py`, with a `uv`
inline-dependency header), installed playwright itself, and produced two real
PNGs (386KB, 368KB). The 0731 builder, on the **identical prompt with the same
in-build verify section from `b6a135d`**, did none of it. That separates model
from harness cleanly: the instruction is in both arms; only v4.1 acts on it.

This is the agency gap closing **from the model side** — the behaviour
`specs/what-the-bare-arm-actually-did.md` recorded for bare Claude and that no
factory arm has ever shown.

Then it reached for the image and got:

    [Current model does not support images. The image will be omitted from this request.]

**That refusal is a bug in `models.json.tmpl`, not a property of the model.**
`deepseek/deepseek-v4.1-flash` is multimodal — `["text","image"]` per pi's
openrouter catalog, pi's deepseek catalog, and OpenRouter's own
`architecture.input_modalities`. `0731` is text-only, and the new entry was
written by copying 0731's `"input": ["text"]` line. pi MERGES its built-in
catalog with `~/.pi/agent/models.json`, so our entry overrode a correct
built-in and suppressed the capability.

Fixed in the template. The running arm cannot be fixed in place — the template
is installed at provision time.

### What this does to the experiment

P1 (speed) is now partly confounded for the treatment arm: its build took 1229s
vs the control's 660s, and part of that was spent constructing an instrument the
harness then refused to let it use. It did adapt rather than loop — it pivoted to
a DOM-interrogation script (`/tmp/interact.py`, `highlighted: ['G','G','G']
errors: []`), which is a programmatic assertion, not a look.

The two running arms are NOT wasted. They now answer a sharper question than the
one pre-registered:

| arm | question it answers |
|---|---|
| `dsctl` (0731) | baseline |
| `dsv41` (v4.1, **text-only**) | does v4.1 improve *on its own*, without vision? |
| a third arm (v4.1, **sighted**) | what does adopting v4.1 actually buy? |

Both running arms are past the expensive phases, so they are carried to
completion rather than killed. The third arm is a separate decision.

**Standing caution for scoring:** the internal control moved between arms —
`plan`, identical model and prompt, took 356s on the control and 263s on the
treatment, a 26% spread. At n=1 per arm, single-phase differences below roughly
that magnitude are not evidence of anything.

---

## Amendment 2, 2026-09-20T07:55 — the sighted arm died in `plan`, and the error names the wrong owner

`dsv41s` arm 1 (`adw_id a55c0249`) failed at phase 02 after 101s / 34,401 tokens
/ $0.0285. The run log says:

    ⟳ planner retry 1/2 — same session · invalid PlanOutput JSON: no JSON object found in the response
    ⟳ planner retry 2/2 — same session · invalid PlanOutput JSON: no JSON object found in the response
    ✗ plan 101.0s  planner never produced valid PlanOutput JSON

**That message is wrong about what happened.** The raw pi stream shows the real
cause on every failed turn:

    "stopReason": "error", "errorMessage": "Corrupted thought signature."

gemini-3.8-flash returns `thinkingSignature` blocks with
`format: "google-gemini-v1"` — encrypted reasoning that must round-trip
verbatim. When the provider rejects the signature the turn returns **empty
content**, `_extract_json(result.text)` finds nothing, and `agents.py:276`
reports it as the model failing to emit JSON. A provider/transport fault is
being attributed to the model's formatting. Same class of mis-ownership that
`trace_metrics.py` already separates for `model-format` vs `schema`.

### It is arm-specific, and new

| arm | planner | "Corrupted thought signature" |
|---|---|---|
| `dsctl` (0731) | gemini-3.8-flash | **0** |
| `dsv41` (v4.1 blind) | gemini-3.8-flash | **0** |
| `dsv41s` (v4.1 sighted) | gemini-3.8-flash | **9** |

The planner is the SAME model and the SAME prompt in all three arms, and it is
untouched by the modality fix. This is not the model swap and not the config
change. It has never been recorded in this repo before.

### The retry cannot work, by construction

The retry is **same session** — it replays the conversation, including the
corrupted signature, so all three attempts were doomed before they were made.
A retry that re-sends the poisoned history is not a retry. Candidate fixes, in
order of cheapness:

1. Classify `stopReason == "error"` separately from a parse failure, and say
   the provider's own message instead of "no JSON object found".
2. On a signature/transport error, retry in a **fresh session** rather than the
   same one.
3. Strip prior `thinkingSignature` blocks when rebuilding history after such an
   error.

None of these are in scope for this experiment; recorded so the next run does
not rediscover it. The arm was simply relaunched on the same VM (fresh
`adw_id`, fresh session).

**Scoring note:** `dsv41s` starts ~50 min behind the other two arms and its
wall-clock total includes no part of the dead attempt. Phase-level comparisons
are unaffected; end-to-end wall clock for this arm should be measured from its
second launch.
