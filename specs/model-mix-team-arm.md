---
plan: model-mix-team-arm
created: 2026-09-29T10:47:13-07:00
modified:
  - 2026-09-29T10:47:13-07:00
  - 2026-09-29T11:05:00-07:00
commits:
  - 84e801a
  - b365252
agents:
  - claude-opus-5-5
sessions:
  - 38f92256-ced9-4e68-ae1b-e041a51da36c
back_refs:
  - specs/team-ownership-prompts.md — the team arm (prompts, chain, gates) this run holds fixed
  - specs/team-default-consolidation.md — the frozen control and the "team roster = default models + team prompts" contract this arm deliberately breaks in two seats
forward_refs: []
status: building
---

# Plan: Model mix on the team harness (mix1): frontier planner and reviewer, flash builder

## Purpose

Run the team arm once more on the meeting-planner brief, with **only two seats changed**: the planner and
the reviewer move to `claude-opus-5`, and the builder, test designer, scout and documenter stay where mtg1
had them. Judge P4 against mtg1 (team, all flash-tier) and mtg1c (control) with the same oracle and the
same GRID. Record cost; don't score it. The question is Ron's: do sharper seats at the two judgement
points pull the team ahead on value defects, and what does that cost?

## Problem

- **mtg1 shipped one narrow value defect.** A meeting straddling a spring-forward transition was
  classified by linear local minutes (16/196,860). The planner's key pinned the transition *instants*
  (after A1) but no *span* across one. The reviewer swept every `V` and approved.
- **The structural fix was abandoned** as overdesign (CHANGELOG 2026-09-29a). Per-limit key coverage
  would have caught this, but it needs a limit list for every domain.
- **What's left is the models.** mtg1's planner was `gemini-3.8-flash` and its reviewer was `glm-5.3`.
  Those are the two seats that decide what "right" means (the key) and whether it was reached (the
  review). A frontier planner may write the span row unprompted. A frontier reviewer may probe past the
  key: both mtg1 defects were found by an *independent* check, not the sweep.
- **The asymmetric idea is untested on the team harness.** Its only prior run, gf2-3 (2026-08-28, old
  prompts, 0731 builder), was rejected at $7.73. That result predates the team prompts, v4.1, and every
  harness fix since, so it doesn't answer the question.

## Solution

- **One new roster:** `sssf.team-mix.config.yaml`, a byte-copy of `sssf.team.config.yaml` with exactly
  two `model:` lines changed (planner, reviewer → `openrouter/anthropic/claude-opus-5`) and a header
  comment. Thinking stays `high` on both, the same as mtg1, so only the model changes.
- **No chain, prompt or gate change.** Both the team roster and the frozen control stay untouched. The
  arm runs through the existing `execute` CONFIG slot:
  `just sbx lifecycle execute <id> prompts/meeting-planner.md adws/adw_sssf_config/sssf.team-mix.config.yaml team`.
- **Same brief and oracle.** The factory is unchanged since mtg1's sync (`git diff --stat dfdfe4e 84e801a`
  over the sync paths is empty), so a re-sync adds only the roster file. The greenfield pin moves from
  `b4906f7` to the new sync commit. That's the only input difference besides the two model lines.
- **Pre-register before mounting** (CHANGELOG 2026-09-29b), in the mtg1 form: predictions, what is recorded
  and not scored, and the confounds.
- **N=1** (memory: small N before fan-out). A replicate only if mix1 separates from mtg1 on P4 or P5.

## Relevant Files

### Existing — modified
- `./`
  - `CHANGELOG.md` — 2026-09-29b pre-registration, mount record, then the judged result
  - `NEXTSTEPS.md` — item 3 closes when mix1 is judged and torn down

### Existing — deleted
- nothing is removed

### New
- `adws/adw_sssf_config/`
  - `sssf.team-mix.config.yaml` — the mix roster: the team roster with planner and reviewer on `claude-opus-5`
- `.sandbox/runs/mix1-<ts>-artifacts/`
  - `sweep_mix1.ts` — the P4 sweep adapter, adapted from `sweep_mtg1.ts` to mix1's API after the app exists (host-only)

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

| Phase | Purpose | Done when | Status |
|---|---|---|---|
| [1. Roster](#phase-1-roster) | Add the mix roster; prove it differs from team in two lines | Diff shows exactly the two model lines + header; config loads | `complete` |
| [2. Pre-register and sync](#phase-2-pre-register-and-sync) | Freeze predictions, sync greenfield, confirm Opus answers | 2026-09-29b committed; sync pushed; the only factory delta is the roster | `wip` |
| [3. Mount and run](#phase-3-mount-and-run) | One arm on the pinned brief | Check 0 passes; the chain ends with an approved or exhausted review | `idle` |
| [4. Judge](#phase-4-judge) | P1–P6 against mtg1/mtg1c | 2026-09-29c written, sweep committed host-side | `idle` |
| [5. Teardown and cost](#phase-5-teardown-and-cost) | Reconcile per generation, tear down, close item 3 | Billed $ per model recorded; VM gone; NEXTSTEPS updated | `idle` |

### Phase 1: Roster

#### 1. Create the mix roster

- [x] `cp adws/adw_sssf_config/sssf.team.config.yaml adws/adw_sssf_config/sssf.team-mix.config.yaml`
- [x] Planner `model:` → `openrouter/anthropic/claude-opus-5 # mix: frontier planner`
- [x] Reviewer `model:` → `openrouter/anthropic/claude-opus-5 # mix: frontier reviewer`
- [x] Prepend a header: what differs (two seats), what is held (everything else, thinking included), and
      why (the judgement seats; the builder stays flash). **Don't name the brief's domain.**
      `meeting planner` and `daylight saving` are leak patterns, and `adws/` is synced.

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `diff <(grep -v '^#' adws/adw_sssf_config/sssf.team.config.yaml) <(grep -v '^#' adws/adw_sssf_config/sssf.team-mix.config.yaml)` — exactly two changed lines, both `model:`, planner and reviewer
- [x] `uv run -q --with pyyaml --with pydantic --with rich --with python-dotenv python -c "import sys; sys.path.insert(0,'adws'); from adw_modules import agents; c=agents.load_config('adws/adw_sssf_config/sssf.team-mix.config.yaml'); print({a.name: a.model for a in c.agents})"` — loads; planner/reviewer resolve to opus-5, and builder/test_designer/scout to the v4.1 default (the ADW's inline deps, since `uv run` bare lacks yaml/dotenv)
- [x] `grep -n '"anthropic/claude-opus-5"' sandbox_mount/guest/models.json.tmpl` — the model is registered for the guest (memory: models must be in models.json.tmpl)

### Phase 2: Pre-register and sync

#### 1. Write the pre-registration (CHANGELOG 2026-09-29b)

- [ ] The question, the arm table (mix1 vs mtg1 vs mtg1c), and the input delta (two model lines + a new pin).
- [ ] Predictions, with a miss counting as a result:
  - **P1 (instrument):** every review sweeps every effective `V` and declares a `value_sweep.*`.
  - **P2:** at least one amendment is proposed and ruled on.
  - **P3:** every trap cites an existing `V`. Record whether `spec_form` needed a correction.
  - **P4 (primary):** zero reachable value defects on the mtg1 GRID and rules, verbatim from 2026-09-28f.
  - **P5 (recorded against mtg1, not a gate):** the planner's key has a DST-transition row, a gap/overlap
    wall-time row (or declares no wall input), a date-rollover row, **and a span across a transition**, the
    row mtg1 lacked. Record which ones appear at plan, before any amendment.
  - **P6:** no non-model loss; record every retry and timeout.
- [ ] Recorded, not scored: whether the reviewer runs any check *outside* the key (an independent probe
      or oracle). That's the fallback lever's mechanism appearing unprompted. Also record V counts, review
      trajectory, per-seat tokens, wall clock, and billed $ per model.
- [ ] Confounds: N=1; model × sampling are not separable against mtg1's N=1; a new greenfield pin (factory
      identical); pi version at mount.
- [ ] A spending limit set before mounting: **$20** (opus-5 at $5/$25 per M; mtg1's glm reviewer alone was 77
      generations; gf2-3 asymmetric billed $7.73).
- [x] Ron approves before the mount; nothing above the mount record changes after that commit.

#### 2. Sync greenfield

- [x] `just target sync greenfield --push` — pushes the roster; record the new target sha. → `0f790db` from host `15a156f`

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `git -C ../greenfield-sandboxes diff --stat b4906f7 HEAD` — the only changed path is `adws/adw_sssf_config/sssf.team-mix.config.yaml`
- [x] `git -C ../greenfield-sandboxes grep -il 'meeting planner\|daylight saving' HEAD -- adws just sandbox_mount` — no hits (no leak)
- [x] `curl -s https://openrouter.ai/api/v1/chat/completions -H "Authorization: Bearer $OPENROUTER_API_KEY" -H 'Content-Type: application/json' -d '{"model":"anthropic/claude-opus-5","max_tokens":8,"messages":[{"role":"user","content":"ping"}]}' | jq -r '.choices[0].message.content // .error.message'` — opus-5 answers on OpenRouter (setup gate D doesn't ping it)
- [ ] `git log -1 --format=%s -- CHANGELOG.md` — the pre-registration commit exists and comes before the mount

### Phase 3: Mount and run

#### 1. Mount

- [ ] `just sbx mount mix1 --limit 20 --target greenfield`

#### 2. Execute on the mix roster

- [ ] `just sbx lifecycle execute <run-id> prompts/meeting-planner.md adws/adw_sssf_config/sssf.team-mix.config.yaml team`
- [ ] Append the mount record (run id, adw id, pid, pin, pi version, resolved command) to 2026-09-29b.
- [ ] While it runs, note in-flight observations with timestamps before any outcome (the 2026-09-28f form):
      V count at plan, and P5 classes present at plan.

#### Validation — Phase 3

> **Loop gate.** Do not start Phase 4 until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] Check 0: gates A–F pass (gate E: credit covers the open run), greenfield HEAD = the Phase 2 sha, tree clean, brief present
- [ ] `ssh <vm>.exe.xyz "grep -m1 -- '--config' app/run.log"` — the run resolved `adw_team_sdlc.py --config adws/adw_sssf_config/sssf.team-mix.config.yaml`
- [ ] Trace check: the planner's and reviewer's generations report model `anthropic/claude-opus-5`, and the builder's report `deepseek/deepseek-v4.1-flash` (judge the tool/generation records, not summarized thinking)
- [ ] The chain ended: approved, or review cap reached; `just sbx manage harvest <run-id>` landed the commits

### Phase 4: Judge

#### 1. Build the sweep adapter

- [ ] Copy `sweep_mtg1.ts` → `sweep_mix1.ts` and adapt it only to mix1's function names and API. Keep the
      oracle (`specs/oracles/meeting_oracle.ts`), GRID and rules unchanged.
- [ ] Also run the mtg1 DST-straddle probe and the mtg1c wrapped-hours and end-inclusive probes against
      mix1, so all three apps face the same failure classes.

#### 2. Write CHANGELOG 2026-09-29c

- [ ] A P1–P6 table with mtg1/mtg1c columns carried from 2026-09-28g. P4 detail with instance counts.
- [ ] What happened that the predictions didn't ask about. What it means, at N=1.

#### Validation — Phase 4

> **Loop gate.** Do not start Phase 5 until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] `bun test specs/oracles/meeting_oracle.test.ts` — the oracle's self-test still passes (planted rule error caught)
- [ ] `bun run .sandbox/runs/mix1-*-artifacts/sweep_mix1.ts` — prints per-class tallies; a mutation check (one planted wrong offset in the adapter's call) turns them red (memory: exact oracle + mutation test)
- [ ] Every P4 finding is re-checked by hand at one instance, in the DOM, before it's written up

### Phase 5: Teardown and cost

#### 1. Reconcile, then tear down

- [ ] Resolve every generation id and sum billed $ per model **before** teardown (memory: toolchain-unpin).
      The total must match the key's billed usage within setup-ping noise.
- [ ] `just sbx lifecycle teardown <run-id>` then `just sbx manage reap` — no orphans; key revoked.

#### 2. Close the queue item

- [ ] Add cost to 2026-09-29c, recorded and not scored. Delete NEXTSTEPS item 3, or replace it with the
      follow-up the result calls for (replicate, oracle lever, or promote the mix).

#### Validation — Phase 5

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] `sandbox_mount/host/run_record.py list | jq '.[] | select(.run_id|startswith("mix1")) | {spend, closed_at}'` — spend recorded, record closed
- [ ] `ssh exe.dev ls --json | jq '.vms[].vm_name' | grep -c mix1` — 0

## Global Validation

- [ ] `git diff 84e801a -- adws/adw_sssf_config/sssf.team.config.yaml adws/adw_sssf_config/sssf.config.yaml adws/adw_data/prompt_engineering_team adws/adw_team_sdlc.py adws/adw_tdd_sdlc.py` — empty: the team arm and the frozen control are untouched
- [ ] `grep -n '2026-09-29b\|2026-09-29c' CHANGELOG.md` — pre-registration and result both exist, in order
- [ ] `grep -n 'mix1' NEXTSTEPS.md` — item 3 is closed or rewritten to the follow-up

## Notes

**What would count as a separation (N=1 against N=1, so this is only a direction):**

| outcome | reading | next |
|---|---|---|
| mix1 P4 exact, and P5 has the span row at plan | the planner seat was the gap | replicate once; if it holds, consider mix as the team default |
| mix1 P4 exact, the key has no span row, and the reviewer probed outside the key | the reviewer seat was the gap | replicate; the oracle lever becomes a prompt line, not a model |
| mix1 ships a mtg1-class defect | model mix doesn't move this class | the oracle lever next, on the flash roster (cheaper to test) |
| mix1 ships a *new* defect class | brief × sampling; not a mix result | record; don't chase at N=1 |

**Why Opus 5 and not a newer frontier:** `anthropic/claude-opus-5` is the only frontier Anthropic model in
`models.json.tmpl`. It was also the asymmetric seat in gf2-3, so this is the same idea on a new harness. A
newer model would need a registry entry, a rate check and a gate D decision first. That's a separate
change, and it would confound "harness moved" with "model moved" against gf2-3.

**Why only two seats:** the test designer turns the key into red assertions and does no independent
judging. Moving it would add a third variable, and A1's wrong V67 was caught downstream anyway. The builder
stays flash on purpose: the question is whether judgement lifts a cheap builder. The frontier roster
(Opus planner + Kimi builder) already answers "everything frontier".

**Deliberately not done:**
- No control re-run: mtg1c is on the same brief and factory. Only the pin moves, and the diff is one roster file.
- No prompt change to push the reviewer toward independent oracles. That's the other lever, and mixing
  them would make the result unreadable.
- No edge-class rows added to the planner prompt: that's the abandoned gate by another route.

**Risks:**
- *Cost overrun:* Opus reviewing 3 times over a ~70-row key. The $20 limit is the hard stop. If it trips,
  that's a P6 non-model loss, recorded, and not a quality result.
- *Opus is stricter, so more revisions and a longer run.* The trajectory is recorded; accept/reject is not a
  quality ranking (fan-out 3).
- *The Anthropic caching ratio distorts token counts* (CHANGELOG ~1158: 8,922× cache ratios). Compare
  efficiency on uncached input + output, not raw totals.

## Amendments

<details>
<summary>— no amendments yet</summary>

Post-execution changes are appended here, newest at the bottom, by the `update` and `sync` workflows.
</details>
