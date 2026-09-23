---
plan: context-rot-and-self-compact
created: 2026-09-23T08:33:36-07:00
modified:
  - 2026-09-23T08:33:36-07:00
commits:
  - 45ac892
agents:
  - claude-opus-5-5
sessions:
  - 098f5599-88b9-43e1-9fed-2ba4233f8b62
back_refs:
  - specs/harness-signals-suite-growth-provider-errors-context.md — needs its Phase 3 per-turn context curve to interpret any arm
  - specs/render-content-and-prompt-gaps.md — the baseline arm must run on the harness it delivers, or the A/B measures the old gaps
forward_refs: []
status: draft
---

# Plan: Context rot and agent-chosen compaction (a later experiment, stubbed)

## Purpose

Find out whether the builder's long, never-compacted session is costing quality. If it is, test
whether letting the agent **compact itself at a checkpoint of its choosing, with a note it writes**
(the `self-compact` pi extension, `/Users/ronaldwood/Dev/TAC/self-compact-pi-agent`) does better
than one long session. This is a stub: the design is sketched and the feasibility risk is named,
but it is not ready to build until its back refs are complete.

## Problem

Measured on 2026-09-23 across every greenfield run since 2026-09-17 (`agent_sessions` in each
harvested `sssf.db`):

| agent | typical peak | highest | runs |
|---|---|---|---|
| builder | 100–200k | **276k (26.4%)** fixval | 15 |
| reviewer | 60–120k | 153k (14.6%) hfix | 15 |
| test_designer / planner | < 120k | 117k (11.1%) | 15 |

- **Overflow is not happening.** Pi's reactive compaction fires near the 1M window, and no trace
  holds a compaction event. The builder's number is a true peak: its session persists across
  build → revise_1 → revise_2 (`agents._agent_session_id` rejoins it), and with no compaction the
  window only grows.
- **Rot might be.** The extension's shipped warning line is 20%. On that setting the builder would
  already have been told to hand off in **fixval, gf2-3 and hfix**. Those are the runs where a
  late revise pass broke earlier work: fixval shipped the 330° wheel, and hfix's `revise_2`
  double-applied the transpose. Three runs is a suggestion, not evidence.
- **Cost grows quadratically.** hfix: 29.8M tokens against a 228k peak. Every turn re-sends the
  whole history. Tokens are the efficiency axis we rank on; dollars are recorded, never scored
  ([[cost-is-recorded-never-scored]]).
- **Tension with an existing finding.** [[factory-handicap-is-four-things]] showed that breaking
  context between agents (discontinuity) *hurts*. Self-compaction is a middle path: a cut the agent
  chooses, carrying its own intent across. Whether that beats both a long session and a hard
  handoff is the actual question.

## Solution

Sketched, not final. Three stages, each able to stop the plan:

1. **Look before intervening.** With the per-turn curve from the back-ref plan, read the baseline
   run and hfix/fixval: at what occupancy did each defect-introducing edit happen? If defects do
   not concentrate in late, high-occupancy turns, rot is not our problem and the plan stops there
   with a written result.
2. **Feasibility spike.** The extension is exercised in pi's **RPC mode** (`tests/harness/rpc-client.ts`).
   Its handoff is: "`self_compact` saves the note, ends the run, compaction runs once the agent is
   idle, the note is returned verbatim as a handoff message that starts the next turn". The factory
   runs **`pi -p --mode json`** (`agent_pi.py`), which exits when the agent goes idle. So in print
   mode the compaction and the returned note may never happen inside the process. Candidate
   bridge: the factory already continues sessions by id, so after a pi exit with a pending handoff,
   re-invoke the same `--session-id` and let the extension's session-recovery path ("reload,
   resume … rebuild the handoff from the session") finish the cycle. The spike decides whether that
   works unmodified, needs a small adapter in `agents.send`, or blocks the plan.
3. **Two-arm A/B, small N** ([[small-n-before-fanout]]). Same brief, same roster, same harness.
   The only difference is that the builder loads the extension via `harness_engineering:`.
   Thresholds are chosen so the treatment arm **will** cross them. The shipped 10/20/30% would
   fire in only ~3 of 15 historical runs; start from `soft=5% warn=10% buffer=5%` (~52k/105k/157k)
   and keep every line above pi's `keepRecentTokens` (20k).

## Relevant Files

### Existing — modified
- `adws/adw_sssf_config/sssf.selfcompact.config.yaml` — *new sibling roster* (see New), never an edit to the default, same rule as `sssf.dsflash41`
- `adws/adw_modules/agent_pi.py` / `agents.py` — only if the spike needs a resume-on-pending-handoff adapter
- `sandbox_mount/guest/` — only if the extension's runtime needs anything the guest lacks (it claims no npm deps; pi's loader supplies them)
- `NEXTSTEPS.md` — result entry per stage

### Existing — deleted
- none

### New
- `adws/adw_data/harness_engineering/self-compact/` — vendored copy of `apps/self-compact/extensions/self-compact/` (MIT) plus its `.pi/self-compact/` prompt files, pinned to a recorded upstream commit
- `adws/adw_sssf_config/sssf.selfcompact.config.yaml` — the default roster plus the builder's `harness_engineering` entry and threshold flags

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

### Phase 1: Is there rot to fix?

#### 1. Read the curves

- [ ] Confirm both back refs are `complete`, and that a baseline greenfield arm has run on that harness with the context curve recorded
- [ ] For the baseline, hfix and fixval: map each defect-introducing edit (from the reviews' findings and the post-acceptance hit-test) to its turn and occupancy. hfix and fixval predate the curve, so reconstruct their occupancy from `events.tokens` per call where possible, and label it as reconstructed
- [ ] Write the finding: do defects concentrate above ~15–20% occupancy, or not

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] A NEXTSTEPS entry with the occupancy-at-defect table exists — proves the decision to continue (or stop) rests on measurement
- [ ] If there is no concentration: mark the remaining phases `fail — no rot signal at our session lengths`, set status to `abandoned` only on Ron's word, and stop

### Phase 2: Feasibility spike (host-local, no VM)

#### 1. Print mode vs the handoff

- [ ] Vendor the extension at a recorded upstream commit into `adws/adw_data/harness_engineering/self-compact/`
- [ ] On the host, with the spike thresholds lowered hard (`soft=2% warn=3% buffer=1%` on a 1M model is still ~30k, so pick a task that reads enough files to cross it; the extension README's "read every file in chunks" prompt works), run `pi -p --mode json -e <ext> --session-id X …` and record: does `self_compact` get called, does pi exit, is a compaction entry written to the session file, is the note present
- [ ] If the cycle does not complete in print mode, re-invoke with the same `--session-id` and a neutral "continue" prompt, and record whether the extension's recovery returns the note verbatim
- [ ] Decide: works as-is / needs a resume adapter (sketch it) / blocked (and why)

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] The session JSONL contains a compaction entry and a message whose text equals the saved `note_to_self` byte for byte — proves the handoff contract holds under the factory's invocation, not just under RPC
- [ ] The spike's `raw_output.jsonl` shows the forced-phase tool block firing (a non-`self_compact` tool call refused with a reason naming `self_compact`) — proves the lock works through `--mode json`

### Phase 3: Two-arm A/B

#### 1. Pre-register

- [ ] Write the arm definitions and predictions into NEXTSTEPS **before** mounting (the fixval pre-registration pattern). Primary outcome: defects found by hit-test after acceptance. Secondary: review-score trajectory, regressions introduced in revise phases, total tokens, builder turns. Qualitative: the `note_to_self` texts, read in full

#### 2. Run and judge

- [ ] Mount two greenfield arms: default roster vs `sssf.selfcompact`; same brief as hfix
- [ ] Judge per [[fanout3-results]]: never rank on accept/reject; reconcile cost via generation ids before teardown ([[toolchain-unpin-plan]])

#### Validation — Phase 3

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] The treatment arm's curve shows at least one compaction cycle in the builder, and the control's shows none — proves the manipulation actually happened (an arm that never crossed a threshold is a void run, not a result)
- [ ] NEXTSTEPS result entry with the pre-registered outcomes filled in, including the verdict on the discontinuity tension

## Global Validation

- [ ] Every stage's decision (continue / stop / blocked) is written in NEXTSTEPS with its evidence
- [ ] The default roster `sssf.config.yaml` is byte-identical to its pre-plan state unless Ron promotes the extension explicitly

## Notes

**Why builder only.** It is the only seat that gets past 20%. It is not the only long-lived one:
`_agent_session_id` rejoins *any* agent's session by name and model, so the reviewer also carries
one window across review_1..3 (hfix: 153k at its last turn). The reviewer is therefore a second
candidate seat, and it is the seat that missed a sibling bug on its third pass. Keep it out of the
first A/B, because one manipulated seat keeps the result attributable.

**A possible third arm: a hard handoff.** A fresh builder session per revise phase, carrying only
the reviewer's findings, reproduces [[factory-handicap-is-four-things]]'s discontinuity. Three arms
would separate "long session" / "agent-chosen cut" / "forced cut". Worth it only if Phase 1 shows a
rot signal; otherwise it is an answer to a question nobody asked.

**What the notes are worth even if the A/B is null.** A `note_to_self` is the builder telling us,
in its own words, what it thinks it has done and what it is about to do. Compare that to the diff
and it becomes a direct read on the builder's self-model, which no current trace captures. Save
every note into the run artifacts.

**Risks.**
- The compaction summary is written by the same flash model. A bad summary plus a good note may
  still lose detail the reviewer's findings referenced. Read the summaries, not only the notes.
- Thresholds are percentages of the window, and the window differs by model (1M vs 1.05M). Pass
  absolute token values (`--compact-at 105k`) so both arms and any later roster compare like for like.
- The extension is from another repo and pinned to pi 0.85.1, which matches our lock. Any pi bump
  re-opens this spike.

**Cost of looking.** Phase 1 is free once the back refs exist. Phase 2 is host-local and cheap
(one flash model, one task). Only Phase 3 mounts VMs.

## Amendments

<details>
<summary>— no amendments yet</summary>

Post-execution changes are appended here, newest at the bottom, by the `update` and `sync` workflows.
</details>
