---
plan: team-ownership-prompts
created: 2026-09-26T12:13:13-07:00
modified:
  - 2026-09-26T12:13:13-07:00
  - 2026-09-26T13:05:00-07:00
  - 2026-09-26T12:45:00-07:00
commits:
  - 7a4a5b8
  - 685e2c0
  - b6439c5
agents:
  - claude-opus-5-5
sessions:
  - d6cf9c11-f0f6-4d04-ac42-25c46c25e80c
back_refs:
  - specs/tdd-red-gate-phase.md — the chain this plan's ADW copies (`adw_tdd_sdlc.py`), and the source of the "control stays untouched" precedent
forward_refs: []
status: complete
---

# Plan: Team-owned prompts and a living spec

## Purpose

Rewrite all six factory role prompts around one idea. **The agents are a team that owns the
outcome together, and they share one living spec.** Each role has its part. Every role starts from
"what are we solving for, and for whom?" instead of "what do I emit to get out of here?" Agents may
annotate the spec as they work. They may also *propose* changes to its requirements and expected
values, in the open, and the reviewer rules on each proposal.

This ships as a **treatment**: a new prompt set, a new roster and a new ADW. The current prompts,
roster and chains stay byte-identical as the control. Rolling back means choosing a config.

## Problem

We audited the prompts on 2026-09-26 (memory `project_factory-has-no-owner-of-intent`). Ron's
reading: every prompt is about "how do we get out of here?", not "what are we solving for?"
Specifically:

1. **The builder's job is to conform.** Its purpose line is "Implement the plan exactly." It is told
   "the plan is your spec", "the smallest change", and "you are graded by ONE process: `bun test`."
   Nothing says what the app is for or who uses it. Nothing lets the builder challenge a plan that
   is wrong on first principles.
2. **"By the time it files a finding you are gone" is false.** `_agent_session_id`
   (`adws/adw_modules/agents.py:244`) reconnects the builder, and the reviewer, to its own pi session
   on every revision. The harness already makes each agent answer for its work, and the prompt
   says the opposite.
3. **The why is dropped at the first handoff.** The planner is asked for "files to touch, changes to
   make, how to verify". It is never asked for the purpose, the user, the expected values, or the
   places where a wrong answer still looks right. The reviewer then judges against that plan, so a
   wrong value in the plan gets approved all the way down.
4. **The report is the exit.** Every `user.md` ends with "emit your Report JSON". The schemas have
   no field for what was checked and how, where the work departed from the plan, or what is still
   in doubt. harn7's failure was a reviewer asserting a root check it never ran (CHANGELOG
   2026-09-24f). The report form has no field where that gap would show.
5. **Most of each prompt is scar tissue.** About 80% of the builder prompt is tool contracts and
   "a previous builder did X". Each rule was earned, but together they tell the agent its main job
   is avoiding known mistakes.

Evidence that the lever is structural, not tonal (CHANGELOG 2026-09-24f):
- Every in-loop catch of a value defect came from an **enumerated** check. The harn5 reviewer swept
  the CAGED windows and caught the bug.
- The shipped misses came from checks that were **asserted, not run** (harn7).
- Reachable value defects shipped in 2 of 4 valid runs, both in data tables that no agent turned
  into pitches.

## Solution

Five decisions, each aimed at one of the problems above.

**D1. One living spec, with a fixed shape.** `<context_handoff_dir>/plan.md` stays the single spec
file that every role already reads. The planner writes it in a fixed form:

| Section | Who writes it | Mutable? |
|---|---|---|
| `## What we're solving for` | planner | **frozen** after `commit_plan` |
| `## Requirements` (ids `R1…Rn`) | planner | **frozen** |
| `## Expected values` (a table; ids `V1…Vn`: input → expected → derivation from first principles) | planner | **frozen** |
| `## Approach` | planner | free: anyone may annotate |
| `## Left to the builder` | planner | free |
| `## Traps` (where a wrong answer looks right) | planner | free; anyone may add |
| `## Team notes` | everyone, appending, signed `— <role> (<phase>)` | append |
| `## Amendments` (ids `A1…An`) | anyone proposes; **only the reviewer rules** | append; the ruling line is filled in by the reviewer |

The spec can grow, but its expected answers can't quietly change. The three frozen sections must
stay byte-identical to the copy committed at `commit_plan`. A change to a requirement or an expected
value is an **amendment**: a proposal with a first-principles reason, which the reviewer accepts or
rejects. The effective spec is the frozen sections plus the accepted amendments. A new gate enforces
the frozen sections mechanically, and a violation goes back to the agent that made it, as a
correction in its own session.

Why `context_handoff/plan.md` and not the `specs/` copy: every agent can write under
`context_handoff/`, because `writes:` restricts only the repo (see `sssf.config.yaml`, `defaults`
comment). No permission changes are needed. A new `sync_spec` code phase copies the annotated
spec over the `specs/` copy at the end of the run. So `git diff <commit_plan>..HEAD -- specs/<file>`
**is** the team's record, from brief to finished work. Failed runs keep it too, through
`snapshot_run_branch.sh`.

**D2. A shared team charter at the top of every prompt, and shared tool contracts at the bottom.**
`PromptEngineering` gains optional `preamble: list[str]` and `appendix: list[str]` fields. The
system prompt is rendered as preamble + role `system.md` + appendix, with the same variables.
- `team.md` (the preamble) says who the team is, what it is for, how the spec works, and the truth
  about continuity: *your session resumes, findings come back to you, you will answer for what you
  claim*. It also says what counts as a check.
- `tool_contracts.md` (the appendix) collects the hard-won tool and shell rules. At the moment they
  are copied, with drift, into all six prompts.

The control roster has neither field, so its rendered prompts don't change by a byte.

**D3. Each role prompt is rewritten as that role's part in the team's goal.** This is a full rewrite,
not a patch. Every earned rule survives: it moves to the appendix, or to the role section where it
belongs, and a phrase-survival check proves it (Phase 3 validation). Each role's section order:
*your part → how you work with the spec → how you check your work → what you hand back*.

**D4. Reports are claims with evidence.** The new fields are all optional with defaults, so the
control prompts still parse:
- `BuildOutput`: `checks[]` (claim, command, result), `departures[]` (from the plan, with the reason),
  and `open_questions[]`.
- `ReviewOutput`: `value_checks[]`, one per `V` id (input, expected, actual, met).
- `TestCase`: `spec_ids[]`, the `R`/`V` ids that each test proves.

**D5. A new chain, `adw_team_sdlc.py`.** It copies `adw_tdd_sdlc.py`, changing only:
- the gates for the team form
- the `sync_spec` phase
- the text of the phase descriptions and review notes

`adw_tdd_sdlc.py` and `adw_simple_sdlc.py` stay untouched, which follows the precedent in
`adw_tdd_sdlc.py`'s docstring. The roster `sssf.team.config.yaml` copies `sssf.config.yaml`: the
same models, the same thinking levels, the same `writes`. It adds the new prompt paths, the
preamble and appendix, and `edit` for the test designer and the reviewer, so they can annotate the
spec. The comparison is then prompts + chain, with models held constant.

## Relevant Files

### Existing — modified
- `adws/adw_modules/`
  - `data_types.py` — optional `preamble`/`appendix` on `PromptEngineering`; `BuildCheck`, `ValueCheck`; new optional fields on `BuildOutput`, `ReviewOutput` and `TestCase`
  - `agents.py` — `execute()` renders preamble + system + appendix when they are set; unchanged when unset
  - `gates.py` — four new gates: `spec_form`, `spec_frozen` (a factory), `amendments_ruled`, `values_swept`, plus a report-only `build_claims`
- `just/`
  - `adws.just` — a `team` recipe that runs `adw_team_sdlc.py`
- `NEXTSTEPS.md` — item 2 points to this spec; item 3's re-run names the team roster and ADW as its arm
- `CHANGELOG.md` — a dated entry when the plan is built (per memory `feedback_verify-and-document`)

### Existing — deleted
- *(none; the control set is kept on purpose)*

### New
- `adws/`
  - `adw_team_sdlc.py` — the team chain (D5)
- `adws/adw_modules/`
  - `team_spec.py` — parses `plan.md` into sections, `R`/`V` ids, and amendments with their rulings; used by the gates and by `sync_spec`
- `adws/adw_data/prompt_engineering_team/`
  - `team.md` — the shared charter (preamble)
  - `tool_contracts.md` — the shared tool and shell rules (appendix)
  - `planner/system.md`, `planner/user.md` — the author of the spec's shape and of the frozen sections
  - `test_designer/system.md`, `test_designer/user.md` — turns `V` rows into red tests
  - `builder/system.md`, `builder/user.md` — owns making the spec true, and may challenge it
  - `reviewer/system.md`, `reviewer/user.md` — rules on amendments; sweeps every `V`
  - `documenter/system.md`, `documenter/user.md` — tells the story from brief to finished work, from the diff plus the spec's history
  - `scout/system.md`, `scout/user.md` — on-call recon for the team (it isn't in the chain, but it is in the set)
- `adws/adw_sssf_config/`
  - `sssf.team.config.yaml` — the treatment roster (D5)
- `adws/adw_data/fixtures/team_spec/`
  - `good.md`, `frozen_edited.md`, `amendment_unruled.md`, `no_values.md` — gate fixtures for the validation commands

## Data Models

### Existing
- `adws/adw_modules/data_types.py`
  - `PromptEngineering` — gains two optional fields
    - `PromptEngineering.preamble` — `list[str] = []`, paths rendered BEFORE `PromptEngineering.system`
    - `PromptEngineering.appendix` — `list[str] = []`, paths rendered AFTER `PromptEngineering.system`
  - `BuildOutput` — gains three optional fields
    - `BuildOutput.checks` — `list[BuildCheck] = []`
    - `BuildOutput.departures` — `list[str] = []`, each giving the plan item, what was done instead, and why
    - `BuildOutput.open_questions` — `list[str] = []`
  - `ReviewOutput` — gains `ReviewOutput.value_checks` — `list[ValueCheck] = []`
  - `TestCase` — gains `TestCase.spec_ids` — `list[str] = []`, e.g. `["R2", "V4"]`

### New
- `adws/adw_modules/data_types.py`
  - `BuildCheck` — one claim the builder makes, and how it knows
    - `BuildCheck.claim` — what is true of the build
    - `BuildCheck.command` — the command or script that showed it (a path under `/tmp` is fine)
    - `BuildCheck.result` — what it printed or returned, abridged, never paraphrased into "passed"
  - `ValueCheck` — one row of the reviewer's sweep
    - `ValueCheck.id` — a `V` id from the spec, or an accepted amendment's `V` id
    - `ValueCheck.input`, `ValueCheck.expected`, `ValueCheck.actual` — strings, as observed
    - `ValueCheck.met` — bool
- `adws/adw_modules/team_spec.py` (a plain dataclass, not persisted)
  - `TeamSpec` / `parse(text) -> TeamSpec`
    - `TeamSpec.sections` — `dict[heading, body]`, keyed by the exact `## ` heading text
    - `TeamSpec.value_ids`, `TeamSpec.requirement_ids` — `list[str]` in document order
    - `TeamSpec.amendments` — `list[Amendment]`, where `Amendment.id`, `Amendment.targets`, `Amendment.ruling` is one of `proposed | accepted | rejected`, and `Amendment.adds_value_ids` covers an accepted amendment that adds a `V` row

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

| Phase | Purpose | Done when | Status |
|---|---|---|---|
| [1. Harness support](#phase-1-harness-support) | Schema, rendering, spec parser, gates — all backward-compatible | Gates pass/fail correctly on fixtures; the control roster renders byte-identical prompts | `idle` |
| [2. The team chain](#phase-2-the-team-chain) | `adw_team_sdlc.py` + `just team` | Script imports clean; its phase list differs from the TDD chain only where D5 says | `idle` |
| [3. Shared charter and role prompts](#phase-3-shared-charter-and-role-prompts) | Write `team.md`, `tool_contracts.md`, and all six roles | Every earned rule survives (phrase check); no `{{` placeholder survives rendering | `idle` |
| [4. Roster, target sync, records](#phase-4-roster-target-sync-records) | `sssf.team.config.yaml`, greenfield sync, NEXTSTEPS/CHANGELOG, a draft pre-registration | Roster validates; greenfield carries the set; the re-run is written down with predictions | `idle` |

### Phase 1: Harness support

Every change here is additive, and a no-op for the control roster. That property is this phase's
main gate.

#### 1. Schema additions

- [x] Add `BuildCheck` and `ValueCheck` to `data_types.py` beside `TestCase` and `ReviewFinding`, following the file's comment style: say why each field exists.
- [x] Add `BuildOutput.checks`, `BuildOutput.departures`, `BuildOutput.open_questions`, `ReviewOutput.value_checks` and `TestCase.spec_ids`, all with empty defaults.
- [x] Add `PromptEngineering.preamble` and `PromptEngineering.appendix`, with empty defaults.

#### 2. Rendering

- [x] In `agents.execute()`, build `system_text` as each preamble file rendered, then `agent.prompt_engineering.system` rendered, then each appendix file rendered, joined by `\n\n---\n\n`. When both lists are empty, the result must be **exactly** today's `prompts.render(system, variables)`.
- [x] The saved audit copy (`prompts/system.md`) is the combined text, so the trace shows what the model actually received.

#### 3. `team_spec.py`

- [x] `parse(text)`: split on lines that start with `## ` (a heading inside a fenced code block does not count). Collect `R\d+` ids from the Requirements list items and `V\d+` ids from the first column of the Expected values table. Parse amendments from the `### A<n>` blocks in `## Amendments`. Each block holds the lines `**Targets:**`, `**Change:**`, `**Why (first principles):**` and `**Ruling:**`; the ruling starts with `proposed`, `accepted` or `rejected`.
- [x] `FROZEN = ("What we're solving for", "Requirements", "Expected values")`, the one place those names are defined. The gates and the prompts both use these exact strings.
- [x] `effective_value_ids(spec)` returns the frozen `V` ids plus the `V` ids added by accepted amendments.

#### 4. Gates

Each gate follows the existing contract: `gate(envelope, run) -> GateReport`, one check per item, and
evidence on both outcomes (see the `gates.py` module docstring).

- [x] `spec_form` (planner): all eight `##` sections are present with the exact headings. There is at least one `R` id and at least one `V` row. Every `V` row has a non-empty derivation cell. No amendment exists yet.
- [x] `spec_frozen(committed_spec_path, plan_sha)`, a factory used on every agent phase after `commit_plan`: for each `FROZEN` section, the body in `<context_handoff_dir>/plan.md` must equal the body in `git show <plan_sha>:<committed_spec_path>`. On a violation the note names the section and says: *"change it through an amendment in ## Amendments, not in place"*. The gate compares the section, not the whole file, so notes and amendments are free.
- [x] `amendments_ruled` (reviewer): after a review, no amendment has the ruling `proposed`. Every `accepted` or `rejected` ruling carries a reason after the colon.
- [x] `values_swept` (reviewer): `ReviewOutput.value_checks` covers every id in `effective_value_ids`. If `approved` is true, every one of them has `met` true. At least one declared artifact matches `<context_handoff_dir>/value_sweep.*` and exists and is non-empty, so a sweep that was never written fails. This does **not** re-run the sweep; see Notes.
- [x] `build_claims` (builder), **report-only** like `durable_suite_growth`: it records the count of `checks`, `departures` and `open_questions`. It never fails. Being report-only is deliberate; see Notes.

#### 5. Fixtures

- [x] Write `adws/adw_data/fixtures/team_spec/good.md`: a small but real spec (a triad-spelling feature) with all eight sections, R1–R3, V1–V4, one team note, and one `accepted` amendment that adds V5.
- [x] Write `frozen_edited.md`, which is `good.md` with one character changed in a `V` row, `amendment_unruled.md`, which is `good.md` plus an A2 still `proposed`, and `no_values.md`, which is `good.md` with an empty Expected values table.

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `cd adws && uv run python -c "from adw_modules import data_types, team_spec, gates, agents; print('ok')"` — everything imports.
- [x] `cd adws && uv run python -c "from adw_modules import team_spec as t; from pathlib import Path as P; s=t.parse(P('adw_data/fixtures/team_spec/good.md').read_text()); assert s.requirement_ids==['R1','R2','R3'], s.requirement_ids; assert t.effective_value_ids(s)==['V1','V2','V3','V4','V5']; print('parse ok')"` — the parser reads ids and the accepted amendment.
- [x] A scratch script (under the session scratchpad) that runs `spec_form` on all four fixtures and `amendments_ruled` on `good.md` / `amendment_unruled.md`. It must print pass for `good.md`, fail for `no_values.md` on `spec_form`, and fail for `amendment_unruled.md` on `amendments_ruled`. It exits non-zero if any expectation is wrong.
- [x] A scratch script that runs `spec_frozen` against a temporary git repo: it commits `good.md` as the spec, writes `frozen_edited.md` as `plan.md`, and expects fail naming `Expected values`. It then appends only a team note to the committed copy and expects pass.
- [x] `cd adws && uv run python -c "from adw_modules import agents, prompts; cfg=agents.load_config('adw_sssf_config/sssf.config.yaml'); v={'prompt':'x','previous_envelope':'(none)','context_handoff_dir':'/tmp/h'}; [print(a.name, 'IDENTICAL' if agents.system_text(a, v)==prompts.render(a.prompt_engineering.system, v) else 'DIFFERS') for a in cfg.agents]"` — every control agent prints `IDENTICAL`. This needs the combination logic factored into `agents.system_text(agent, variables)`; do it that way.
- [x] `git diff --stat 7a4a5b8 -- adws/adw_data/prompt_engineering adws/adw_tdd_sdlc.py adws/adw_simple_sdlc.py adws/adw_sssf_config/sssf.config.yaml` — prints nothing, so the control set is untouched.

### Phase 2: The team chain

#### 1. `adw_team_sdlc.py`

- [x] Copy `adw_tdd_sdlc.py`. Rewrite the docstring as the team chain's own explanation: why it exists, what differs from the TDD chain, and that the TDD chain is its control.
- [x] Plan phase gates: `[artifacts_exist, files_non_empty, spec_form]`.
- [x] After `commit_plan`, record `plan_sha = git_helper.rev("HEAD")` and `committed_spec`, which is the `specs/` path in `plan.artifacts`: the entry that is not under `context_handoff_dir`. If there isn't exactly one, raise before test design with a clear message.
- [x] Add `frozen = gates.spec_frozen(committed_spec, plan_sha)` to the gates of `test_design`, `build`, every `fix_i`, every `review_i` and every `revise_i`.
- [x] Add `build_claims` to the builder phases. Add `amendments_ruled` and `values_swept` to every review phase, beside the existing `artifacts_exist` and `verdict_consistent`.
- [x] Rewrite `FINAL_REVIEW_NOTES` in team terms. Keep its substance: it is the last review, audit the delivered app as a whole, and a control wired to nothing is blocking. Add that every `V` must be swept against the delivered app.
- [x] Add a `sync_spec` code phase (owner `git`) **after the review loop and before the `verified` branch**. It always runs. It copies `<context_handoff_dir>/plan.md` over `committed_spec` and logs `git diff --stat` for that file. It does not commit. On a verified run `commit_build` picks the file up; on an unverified run `snapshot_run_branch.sh` does. Its description says why it exists.
- [x] `REQUIRED_AGENTS` stays the same as the TDD chain's list.

#### 2. Recipe

- [x] In `just/adws.just`, add a `team *ARGS` recipe after `tdd`, with a one-line comment in the file's style: `# tdd chain run by a team: living spec, amendments, a value sweep in every review`.

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `uv run adws/adw_team_sdlc.py --help` — the script parses and imports under its PEP-723 header.
- [x] `diff <(grep -o 'name="[a-z_{}0-9]*"' adws/adw_tdd_sdlc.py) <(grep -o 'name="[a-z_{}0-9]*"' adws/adw_team_sdlc.py)` — the only difference is the added `sync_spec` phase.
- [x] `just --list adw | grep -w team` — the recipe is registered under the `adw` module (the root justfile has `mod adw 'just/adws.just'`).

### Phase 3: Shared charter and role prompts

Write these in plain, direct prose. **Lead with the goal.** Tool and shell mechanics go in the
appendix. Incident stories are kept only where the story itself teaches the lesson, and each is
shortened to one sentence. Never write "you will be gone" or anything that implies it.

#### 1. `team.md` (the preamble for all roles)

- [x] **The team and the goal.** Name the roles in chain order: planner, test designer, builder, reviewer, documenter, with the scout on call. The goal is that *the person who asked ends up with something that is right*, which is more than something that passed. Passing gates is necessary and not sufficient.
- [x] **The living spec.** List the eight sections and who writes each one. Say what may be freely annotated and what is frozen. Say that frozen text changes only through an amendment, and give the exact amendment block format (`### A<n> — <role> (<phase>)`, then `**Targets:**`, `**Change:**`, `**Why (first principles):**`, `**Ruling:** proposed`). Say that only the reviewer rules, and that a mechanical check enforces the frozen sections.
- [x] **Continuity, stated truthfully.** Your session resumes. Gate corrections, test failures and review findings come back to *you*, in the context where you made the decision. You will answer for every claim.
- [x] **What counts as a check.** A check is a command whose output you read. "Looks right" and "should work" are not checks. Enumerate inputs; don't sample three of them. Expected values come from first principles or from the spec, **never from the code under test**.
- [x] **Disagreement is part of the job.** If the spec looks wrong, say so in the spec: a team note for context, an amendment for a requirement or a value. Staying silent and complying is the failure mode this team exists to prevent.
- [x] **The gates, named.** One line each for what the mechanical checks verify in this chain, so no agent is surprised by one: `spec_form`, `spec_frozen`, `tests_red`, `diff_matches_claims`, `verdict_consistent`, `amendments_ruled`, `values_swept`, and the quality block.

#### 2. `tool_contracts.md` (the appendix for all roles)

- [x] Move over verbatim, then de-duplicate: the builder's whole `## Tool contracts` section, plus the shell lines repeated across all six old prompts (inherited PATH and bare tool names, judging by exit status and not by words, scratch output to `/tmp`).
- [x] Keep the builder-only mechanics out of here (render smoke, the grading command); they belong in the builder and test designer roles.

#### 3. The six roles

For each role, `system.md` follows this order: **your part → working with the spec → how you check →
what you hand back.** Each `user.md` keeps its `{{prompt}}`, `{{previous_envelope}}` and
`{{context_handoff_dir}}` variables and its JSON Report block, extended with the D4 fields. It
reframes the task as a contribution: "your part in this run is …; the spec is `plan.md`; start by
reading What we're solving for".

- [x] **planner**: owns defining what right looks like. Writes the eight-section spec. The Expected values table is the center of it: every data table, mapping or rule in the request becomes concrete input → expected rows, each derived from first principles, with the derivation written down. Traps names the plausible-but-wrong answers. Keep: list `specs/` before naming the file, the `_v2` suffix rule, copying with `cp` rather than retyping, the subagent guidance, and "do not implement".
- [x] **test_designer**: owns making the spec executable before the code exists. Every `V` row becomes an assertion, with the expected value **copied from the table** and `spec_ids` filled in. If a `V` row can't be tested as written, or looks wrong, propose an amendment and don't silently skip it. Keep every rule from the old prompt: one file, the grading command, one shared module registry, the oxlint check, reusing the fixed suite's harness, red from assertions and not syntax, never touching the fixed suite, and reading per-file results.
- [x] **builder**: owns making the spec true for the user. The plan is the planner's best understanding, not a contract. When first principles disagree with it, propose an amendment, record the departure in `departures`, and keep building the right thing. Keep: the grading command and why, durable tests that assert independently derived answers, the render smoke section, the silent-channel and screenshot examples, "if what you find contradicts what you built, fix the build", and no hand-rolled servers. The report's `checks` field is where "I looked" becomes evidence.
- [x] **reviewer**: owns the question "did the person who asked get what they needed?" It judges against the effective spec, meaning the frozen sections plus accepted amendments, and against What we're solving for. It rules on every proposed amendment, accepting or rejecting it with a first-principles reason, and it **may reject an amendment that makes the spec easier rather than more correct**. It writes `<context_handoff_dir>/value_sweep.<ext>` and runs it over every `V` against the delivered code, and `value_checks` in the report is that sweep's output. Keep: judging the code on disk and never the summary, lossy-key enumeration, sweeping for sibling defects, the stated/delegated/unrequested rule, changing no code, and "`status` is not the verdict".
- [x] **documenter**: owns telling the next engineer what was built and *why*. The why comes from the spec's Team notes and Amendments, and every claim about the code must be traceable to the diff. Keep: everything in the old prompt about naming files only from the diff, listing `app_docs/` first, the `_v2` rule, copying with `cp`, and never editing code.
- [x] **scout**: owns finding the ground truth the team will stand on. Read-only, cite paths, say plainly when nothing was found, and keep the subagent guidance. When a spec exists, add findings as a team note.

#### Validation — Phase 3

> **Loop gate.** Do not start Phase 4 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] Phrase-survival check, a scratch script. Every one of these strings must appear somewhere in `adws/adw_data/prompt_engineering_team/`: `uv run adws/adw_modules/render_smoke.py`, `--screenshot`, `--click`, `AudioContext`, `bun test <app.test_file>`, `oxlint@1.36.0`, `one module registry`, `fixed suite`, `Never overwrite an existing`, `cp "<context_handoff_dir>/plan.md"`, `cp "<context_handoff_dir>/document.md"`, `must not overlap`, `oldText`, `path`, `exit status`, `/tmp`, `bare name`, `subagent_create`, `changed_files`, `diff_path`, `Delegated`, `siblings`. The script exits non-zero and lists any string that is missing. It proves the earned rules came across.
- [x] `grep -rniE "you are gone|you('| a)re gone|by the time .* you" adws/adw_data/prompt_engineering_team/` — no matches.
- [x] `grep -rn "What we're solving for" adws/adw_data/prompt_engineering_team/ | wc -l` — at least 7 (the charter plus every role that reads the spec). The heading string must match `team_spec.FROZEN` exactly.
- [x] Render check: with the Phase 4 roster not yet present, render each role's system prompt as `team.md` + role `system.md` + `tool_contracts.md`, and each `user.md`, through `prompts.render` with dummy variables. Assert that no `{{` survives, and print each prompt's character count beside the control prompt's count. The counts are recorded, not gated.
- [x] **Ron reads `team.md` and `builder/system.md`** before Phase 4. This is the one human gate: the question is whether they read like ownership.

### Phase 4: Roster, target sync, records

#### 1. `sssf.team.config.yaml`

- [x] Copy `sssf.config.yaml`. Change only the following, and comment each change with its reason in the file's style:
  - every `prompt_engineering.system` and `.user` points to `prompt_engineering_team/<role>/`
  - every agent gets `preamble: [adws/adw_data/prompt_engineering_team/team.md]` and `appendix: [adws/adw_data/prompt_engineering_team/tool_contracts.md]`
  - `edit` is added to the tools of `test_designer` and `reviewer`, so they can annotate `plan.md`; their repo `writes` stay exactly as they are, and `permissions.py` still enforces them
  - each `purpose:` line is rewritten to match the new role
- [x] Models, thinking levels, `writes`, `harness_engineering` and `protected_files` stay **identical** to the default roster.

#### 2. Target sync

- [x] `just target sync greenfield` without `--push` first, and read the output. Then `--push` once it's clean. `adws/` and `just/` are already in `sync_paths`, so nothing in `targets/greenfield.yaml` needs to change.

#### 3. Records

- [x] `NEXTSTEPS.md`: item 2 points to this spec as the design that answers it. Item 3's re-run names its arm (`--config adws/adw_sssf_config/sssf.team.config.yaml`, `just team`) and its control (the default roster on `just tdd`, from the existing harn runs).
- [x] Draft the item-3 pre-registration in `NEXTSTEPS.md` as predictions, not results:
  - (P1) every review has a `value_checks` entry for every effective `V`, and a `value_sweep.*` artifact
  - (P2) at least one amendment is proposed and ruled on in the run
  - (P3) `spec_frozen` fires at most once per run and is resolved in-session
  - (P4) no reachable value defect ships in a `V`-covered area

  The primary outcome is P4, **judged independently by a sweep we write from first principles, not by the run's own sweep**. Mark that the harness-robustness fixes (item 1) should land first, or that any non-model loss is excluded per P2 of 2026-09-24b.
- [x] `CHANGELOG.md`: a dated entry saying what was built, what was verified (the Phase 1–3 validation results), and what was not, namely that no live run has happened.

#### Validation — Phase 4

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `cd adws && uv run python -c "from adw_modules import agents; cfg=agents.load_config('adw_sssf_config/sssf.team.config.yaml'); agents.validate(cfg, ['planner','test_designer','builder','reviewer','documenter']); print([ (a.name, a.model) for a in cfg.agents])"` — the roster validates, and its models match the default roster's (compare against the same one-liner on `sssf.config.yaml`).
- [x] `cd adws && uv run python -c "from adw_modules import agents; f=lambda p:[(a.name,a.model,a.thinking,a.writes) for a in agents.load_config(p).agents]; a,b=f('adw_sssf_config/sssf.config.yaml'),f('adw_sssf_config/sssf.team.config.yaml'); assert a==b,(a,b); print('models/thinking/writes identical')"` — the only differences between the rosters are prompts, preamble/appendix, tools and purpose.
- [x] A full render of every team agent through `agents.system_text` with the team roster — no `{{` survives, and each system prompt contains both the `team.md` heading and the `tool_contracts.md` heading.
- [x] `git -C ../greenfield-sandboxes log -1 --stat | grep -E "prompt_engineering_team|adw_team_sdlc|sssf.team"` — the clean room carries the set after the push.
- [x] `git diff --stat 7a4a5b8 -- adws/adw_data/prompt_engineering adws/adw_tdd_sdlc.py adws/adw_simple_sdlc.py adws/adw_sssf_config/sssf.config.yaml` — still prints nothing.

## Global Validation

- [x] Every Phase 1–4 validation box is `[x]`.
- [x] `git diff --stat 7a4a5b8 -- adws/adw_data/prompt_engineering adws/adw_tdd_sdlc.py adws/adw_simple_sdlc.py adws/adw_sssf_config/sssf.config.yaml` — prints nothing, so the control is byte-identical.
- [x] `grep -c '^- \[ \]' specs/team-ownership-prompts.md` — returns 0.
- [x] CHANGELOG and NEXTSTEPS are updated, and the item-3 pre-registration exists with P1–P4 and an independent judge for P4.

## Notes

**Why not merge the planner and builder (Ron's first idea)?** It is kept as a later arm, not rejected.
One continuous mind holding intent is what the bare Claude arm had (31/32 in one turn, memory
`project_bare-claude-control-arm`). It costs two things. The planner could no longer be a different
model from the builder. And the plan would stop being an independent answer key: a builder that
writes its own `V` table grades its own homework. This plan tests whether intent *can survive* a
handoff. The merged arm tests whether *avoiding* the handoff is better. Run them one at a time, this
one first. The merged arm is cheap later: `_agent_session_id` keys on agent name, so giving the plan
phase to `builder` in a copy of this chain would do it.

**Why a new ADW rather than a flag.** A gate that switches itself off when the spec lacks the team
headings is an unfaithful test double, and it would fail open in exactly the case that matters.
The repo has the precedent: `adw_simple_sdlc.py` was kept untouched as the TDD chain's control. The
cost is about 250 duplicated lines, and they will drift. Accept that until the team chain wins or
loses. If it wins, it replaces the TDD chain. It does not get merged into it.

**Why the frozen sections are compared byte for byte, not semantically.** Semantic comparison needs a
judge, and judges are what we're trying not to trust. Byte equality has one false positive that
matters, an agent re-saving the whole file with reformatted whitespace. The correction message
handles that ("change it through an amendment, not in place"), and the agent that did it is still
in its session to fix it. If P3 shows `spec_frozen` firing often on whitespace, normalize trailing
whitespace per line, and nothing more.

**Why `values_swept` checks coverage and artifact existence but does not re-run the sweep.** A
re-run would prove the sweep actually ran. It is the stronger gate, and it is the direct answer to
"asserted, not run". But the reviewer's sweep can be written in anything (ts, py, bun, or a
Playwright script), and re-running it deterministically is its own design problem. Coverage plus
artifact existence already forces the reviewer to *write* an enumeration per `V`, and harn5 vs harn7
says writing the enumeration is the difference. Promote to a re-run gate if the pre-registered run
shows value_checks that don't match the sweep's own output.

**Why `build_claims` is report-only.** A gate that fails on empty `checks` gets satisfied by
`[{"claim":"tests pass","command":"bun test","result":"pass"}]`, which is Goodhart in one line. It is
the same reasoning as `durable_suite_growth`: a count answers "did it happen", and only a reader
answers "did it happen well". The reviewer reads the checks; the gate just puts them in the trace.

**Only the reviewer rules on amendments, including its own?** An open decision. A reviewer that finds
the spec wrong can currently only write a team note and a finding. It must not accept its own
amendment. The assumption for v1 is that the reviewer cannot propose amendments, only rule on them.
A spec error found at review becomes a blocking finding that says "the spec is wrong at V3, because
…", and the builder proposes the amendment in revision, which the reviewer then rules on. That keeps
two agents on every change to the answer key, and it costs one revision round. Revisit this if P2
data shows the round being spent this way.

**The re-run confounds prompts and chain on purpose.** The treatment is "a team with a living spec",
which is prompts, gates and `sync_spec` together. We are not asking which one did it; we are asking
whether the value gap closes. If it does, a later ablation (team prompts on the TDD chain, no new
gates) separates the two. At N=1–2 that ablation would be noise anyway (memory
`feedback_small-n-before-fanout`).

**Ordering against NEXTSTEPS.** Item 1 (the bash timeout and the `provider_error` retry) is
independent of this plan and doesn't touch prompts. It should land before the item-3 re-run, not
before this plan. The planner in both rosters is `gemini-3.8-flash`, which was the source of the
thought-signature 400s, so without item 1 the re-run is at risk of losing mounts again.

**Cost of the added tokens.** `team.md` plus `tool_contracts.md` will be about 2–3k tokens per system
prompt, on every agent. Recorded, never scored (memory `feedback_cost-is-recorded-never-scored`).
The render check in Phase 3 records the character counts so it's visible.

**Deliberately out of scope:**
- the audio `AudioContext` value spy (NEXTSTEPS 4(6)); the builder prompt keeps its silent-channel section
- the render smoke's box-centre case
- any model or roster promotion
- the self-compact experiment

## Amendments

<details>
<summary>2026-09-26T13:05:00-07:00 — build deviations found while executing Phases 1–3</summary>

- **`agents.system_text_for`, not `agents.system_text`.** `execute()` already has a local named
  `system_text`, so a function of the same name would be shadowed. The Phase 1 validation used the
  new name.
- **Validation commands run under `uv run --with pydantic --with pyyaml --with python-dotenv --with rich`.**
  The repo has no project venv; the ADWs get their dependencies from PEP-723 headers, so a bare
  `uv run python -c` cannot import `data_types`.
- **Spec-gated agent phases get `retries=1`** (plan, build, every review). The gate loop in
  `agents.execute` raises on the first violation when `retries=0`, so without it a `spec_form` or
  `spec_frozen` violation would end the run instead of going back to the agent as a correction, which
  the plan's design assumed.
- **`commit_plan` re-copies `plan.md` over the `specs/` copy before committing.** A `spec_form`
  correction edits `plan.md` after the planner's own `cp`. A stale committed copy would then make
  `spec_frozen` blame the next agent for the planner's fix.
- **The team chain defaults to `sssf.team.config.yaml`**, and `just adw team` uses a `team_config`
  variable (`SSSF_CONFIG` still wins when set). On the default roster the chain would fail
  `spec_form` by construction.
- **`tool_contracts.md` gained one line not in any old prompt:** a command that never exits hangs
  your turn, so background servers and give probes a `timeout`. This is a prompt-level mitigation
  for harn4's hang. It does not replace NEXTSTEPS item 1's tool-level timeout.
- **The test designer's red check uses the grading command.** The old `user.md` step 4 said
  `bun test <your file>` alone, which contradicted its own system prompt.
- **Not covered:** `sync_spec` runs only if the chain reaches it. A run that dies on an exception
  (a gate failure after its retry, a provider error) skips it. The annotated `plan.md` still
  exists in the session's `context_handoff/`.
- **Phase 3 render sizes (recorded, not gated):** system prompts are 11.1k–16.5k chars, against a
  control of 1.4k–8.1k. The shared preamble and appendix add about 10.5k chars, roughly 2.6k tokens.
</details>

<details>
<summary>2026-09-26T12:45:00-07:00 — Phase 4 done; greenfield at 515efca</summary>

- **The roster's validation commands run from the repo root, with pi on PATH.** Roster paths are
  relative to the root. `agents.validate` and `just target sync` both call `pi --list-models`, which
  exists on the host only under nvm node v22 (`export PATH="$HOME/.nvm/versions/node/v22.21.0/bin:$PATH"`).
  Without it, every model reports "not found".
- **The planner's and test designer's purpose lines were reworded** to avoid a bare `: ` inside an
  unquoted YAML scalar, which fails the parse.
- **The roster comparison also checks `harness_engineering` and `defaults`**, which is stronger than
  the plan's command.
- **The scout keeps `write` without `edit`.** It appends its team note with bash. The plan only
  gave `edit` to the test designer and the reviewer.
- **Result:** CHANGELOG 2026-09-26a. NEXTSTEPS item 2 now points here, and item 3 carries the draft
  pre-registration (P1–P4, P4 judged by our own sweep).
</details>
