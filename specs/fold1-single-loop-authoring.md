---
plan: fold1-single-loop-authoring
created: 2026-10-29T09:11:56-07:00
modified:
  - 2026-10-29T09:11:56-07:00
  - 2026-10-29T13:45:00-07:00
  - 2026-10-29T14:40:00-07:00
  - 2026-10-29T16:30:00-07:00
commits:
  - 294627f
agents:
  - claude-opus-5-5
sessions:
  - 2026-10-29 article review (claude.com "when to fold subagents into your main agent loop")
back_refs:
  - specs/team-ownership-prompts.md — the team chain and charter this arm runs unchanged
  - specs/team-default-consolidation.md — sssf.team-sonnet is the frozen default a challenger must beat
forward_refs: []
status: abandoned
---

# Plan: fold1 — one session authors the spec, the tests and the build

## Purpose

Ask whether the team arm improves when the three authoring seats share one context window. Planner,
test designer and builder become **one continuous session**. The reviewer stays a separate,
fresh-context agent, and every gate, prompt, write lane and model is held identical to
`sssf.team-sonnet`. The run answers Ron's two questions:

- **Q1:** does an agent that wrote the spec still propose amendments to it?
- **Q2:** does writing the tests and the code in one mind short the independence the red-suite step
  exists for?

## Problem

The source is the article "Building agents: when to fold subagents into your main agent loop"
(claude.com, read 2026-10-29). Its claim is that a single loop with progressively disclosed skills
often beats a subagent chain, because handoffs lose detail. Its rule is to fold one unit and keep
the subagent only if the folded version scores worse on an end-to-end eval. The evidence is
anecdotal: one customer saw about 2× latency, and "several" deployments did better.

The handoff loss is our own documented failure. `adw_team_sdlc.py`'s docstring says "the why is gone
after the first handoff". The living spec and amendments are our workaround, and memory records that
discontinuity and no self-review compound. Each run passes **three fresh-context handoffs** before
the first review: planner → test_designer → builder.

We hold both extremes of the spectrum and nothing between them:
- **Bare Sonnet 5.5** (one loop, no gates): 31/32, MVP (CHANGELOG 2026-09-30e).
- **The all-Sonnet team** (five fresh contexts plus gates): 0 value defects on the meeting planner
  twice. One run was deployable and one MVP (s55m1 and s55m2, CHANGELOG 2026-10-03e and 2026-10-04b).

The article's shape is the untested middle: one loop with harness gates plus an independent
verifier.

## Solution

**One variable: session continuity across the authoring seats.**

- Add an optional `session:` key to `AgentConfig`. Agents naming the same key share one pi session,
  so each later send rejoins the same context window. That window still holds every earlier phase's
  prompts, tool calls and results.
- Write a new roster, `sssf.fold1.config.yaml`. It is `sssf.team-sonnet.config.yaml` byte-for-byte,
  plus `session: author` on `planner`, `test_designer` and `builder`.
- Run it on the existing `team` ADW. No chain code changes.

What this design holds identical, on purpose:

- **Prompts.** Each phase still sends its own role system prompt, charter and tool contracts. The
  role prompt is the progressively disclosed "skill": the same mind gets the planner's instructions,
  then the test designer's, then the builder's. A builder prompt that says a teammate wrote the spec
  is now false. That is accepted as part of the arm; the model can see its own history. See Notes.
- **Gates.** `spec_form`, `commit_plan` (freeze), `tests_red`, `commit_tests`, `spec_frozen`,
  `build_claims` and the rest still run between phases, in the harness, as the article prescribes for
  hard limits.
- **Write lanes.** `permissions.enforce` is per agent *name*, so during test design the folded
  session may still write only `apps/*/tests/generated/**`. Jumping ahead to product code is a
  breach, as today.
- **Reviewer and documenter.** Separate fresh-context agents, unchanged. The reviewer's independence
  is the article's own exception ("context isolation"), and our evidence for it is strong: mix1's
  cross-frame bug and harn5's value sweep. The documenter is left alone so it cannot become a second
  variable.
- **Fix and revise loops.** These already rejoin the builder session. Under fold1 that session also
  holds the plan and the tests, which is the point.

## Relevant Files

### Existing — modified
- `adws/adw_modules/`
  - `data_types.py` — `AgentConfig.session: Optional[str] = None`; comment that agents sharing a key share one pi context window
  - `agents.py` — `_agent_session_id` and `save_agent_map` keyed by `agent.session or agent.name`; `validate()` refuses a shared session whose agents differ in `model` or `coding_agent`
- `just/`
  - `adws.just` — a `fold1` recipe: the team chain on the fold1 roster
- `NEXTSTEPS.md` — queue entry for this spec
- `CHANGELOG.md` — pre-registration (Phase 3), then one result entry per pair

### Existing — deleted
- None.

### New
- `adws/adw_sssf_config/`
  - `sssf.fold1.config.yaml` — team-sonnet plus `session: author` on three seats, and nothing else
- `adws/adw_modules/`
  - `session_share_selftest.py` — two agents with one key resolve to one session id; a model mismatch fails `validate()`

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

| Phase | Purpose | Done when | Status |
|---|---|---|---|
| [1. Shared-session mechanism](#phase-1-shared-session-mechanism) | `session:` key, plus pi resume behaviour proven on the host | selftest green; resume probe answers recorded | `complete` |
| [2. The fold1 roster](#phase-2-the-fold1-roster) | roster and recipe; prove it differs only by `session:` | diff shows 3 added lines; local dry run joins one session | `complete` |
| [3. Pre-registration](#phase-3-pre-registration) | measures and predictions on record before any outcome | Ron approves the CHANGELOG entry | `idle` |
| [4. Pilot pair](#phase-4-pilot-pair) | fold1-a and ctl-a, concurrent, same pin | both judged by the s55m1 sweep | `complete` |
| [5. Replicate pair and decision](#phase-5-replicate-pair-and-decision) | fold1-b and ctl-b; apply the decision rule | result entry written; NEXTSTEPS item closed | `fail` |

### Phase 1: Shared-session mechanism

#### 1. Config key

- [x] Add `session: Optional[str] = None` to `AgentConfig` (`adws/adw_modules/data_types.py`), with a comment in the file's existing style.
- [x] In `agents.py`, `_agent_session_id` looks up and stores under `key = agent.session or agent.name`. `save_agent_map` writes the same key, and the stored entry keeps the `model` check, so a model change still starts a new session. **Built differently:** `agent_map.json` stays keyed by agent name, since the visualizer's `agent_sessions` mirror and the traces recipe read it that way. Each entry gains a `session` field, and `_agent_session_id` falls back to any entry with the same `session` and `model`.
- [x] `validate()`: agents sharing a `session` must share `model` and `coding_agent`. They may differ in `thinking`, `tools`, `writes` and prompts, which pi takes per send.
- [x] Check `run.agent_map` consumers (`grep -rn agent_map adws/`) and the tracer's `agent_session_row`, and adjust any that assume one agent per session id. Only `runner.py` (the map itself) and `agents.py` read it. `agent_session_row` keys on the agent and takes the session id as data, so three rows sharing one id is fine.

#### 2. Selftest

- [x] `adws/adw_modules/session_share_selftest.py`, in the shape of `permissions_selftest.py`: two agents sharing a key get the same id, an unshared agent gets its own, and a model mismatch raises on `validate()`. It also checks that the builder's own fix/revise re-entry stays in the shared session.

#### 3. pi resume probe (host, pi 1.3.0 per toolchain.lock)

The design rests on how pi treats per-send flags when it resumes a session. That is a claim to
check, not inherit. Run three probes with two sends each into one `--session-id`:

- [x] **System prompt.** Send 1: `--system-prompt "Your codename is ALPHA"`. Send 2: `--system-prompt "Your codename is BETA"`, asking "codename?". BETA means the prompt is replaced per send, which the design assumes. ALPHA, or both, changes the arm: record it and stop for Ron. **BETA**, effectively a replace. See Notes for the source-level proof.
- [x] **Thinking.** Send 2 with a different `--thinking` level is accepted, and the raw output shows the new level. `thinking_level_change: high` was recorded on resume.
- [x] **Tools.** Send 1 calls a tool that send 2's `--tools` omits (for example `write`). Send 2 does not error on history containing a call to a tool now filtered out. This matters because the planner has `subagent_*` tools and the builder does not. It read back `hello-fold1` with no error.

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `uv run --with pydantic --with pyyaml --with python-dotenv --with rich python -m adws.adw_modules.session_share_selftest` — sharing, isolation and mismatch refusal behave as specified ok (0 failures).
- [x] `uv run --with pydantic --with pyyaml python -m adws.adw_modules.permissions_selftest` — write lanes unchanged for every roster, including the new one 400 cells OK. The fold1 roster doesn't exist until Phase 2, so this is re-run in Phase 2's gate.
- [x] `uv run --with pydantic --with pyyaml --with python-dotenv --with rich python -m adws.adw_modules.agent_pi_selftest` — the pi wrapper still parses events OK.
- [x] The three probe outcomes are written into this plan's Notes, with the pi version

### Phase 2: The fold1 roster

#### 1. Roster

- [x] `cp sssf.team-sonnet.config.yaml sssf.fold1.config.yaml`. Add `session: author` under `planner`, `test_designer` and `builder`, and replace the header comment with a fold1 header that cites this spec.

#### 2. Recipe

- [x] In `just/adws.just`, add a `fold1 *ARGS` recipe beside `team`: `uv run adws/adw_team_sdlc.py --config adws/adw_sssf_config/sssf.fold1.config.yaml "$@"`. The sandbox launch passes the config explicitly anyway (Phase 4).

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `diff <(grep -v '^#' adws/adw_sssf_config/sssf.team-sonnet.config.yaml) <(grep -v '^#' adws/adw_sssf_config/sssf.fold1.config.yaml)` — exactly three added `session: author` lines; nothing else differs outside comments Exactly 3 lines.
- [x] `uv run --with pydantic --with pyyaml --with python-dotenv --with rich python -c "import sys; sys.path.insert(0,'adws'); from adw_modules import agents; agents.validate(agents.load_config('adws/adw_sssf_config/sssf.fold1.config.yaml'), ['planner','test_designer','builder','reviewer','documenter'])"` — the roster loads and validates It validates. The permissions selftest now covers it: 460 cells OK.
- [x] A cheap local smoke on the host (`prompts/11-tdd-smoke.md` via the team chain on the fold1 roster, in a throwaway git worktree, with `PI_PATH` set to pi 1.3.0) shows that the **history carries over**: one pi session file under `sessions/<adw>/author/pi_sessions/` holds the planner's, test designer's and builder's turns in order, and the reviewer's session is separate. Matching `session_id`s in `agent_map.json` are **not** evidence. Smoke 1 had matching ids and three fresh sessions (Amendments). **Smoke 2 (`fold1smk2`, 2026-10-29): met.** There is one file, `author/pi_sessions/…-author-d329.jsonl`, holding Plan Task → Test Design Task → Build Task in order, with a `preamble`-only system update at each boundary. The reviewer and documenter have their own sessions. 13/13 phases, approved on review 1, $0.65. There were 3 ordinary gate corrections, all resolved in-session (`spec_form` traps, `tests_red` suite failed to load, `values_swept` coverage), none of them `spec_frozen`, and 0 amendments, as expected on a smoke brief.

### Phase 3: Pre-registration

Write a CHANGELOG entry in the s55m1 pre-registration's shape (2026-10-03d) and get Ron's approval
before mounting. Nothing above the mount record changes after the approval commit.

#### 1. Hold and name the drift

- [ ] Brief `prompts/meeting-planner.md`, oracle `specs/oracles/meeting_oracle.ts`, GRID and sweep rules verbatim from 2026-09-28f / 2026-10-03d.
- [ ] Both arms of each pair run on the **same greenfield pin**, synced once after Phases 1–2 (`just target sync greenfield --push`) and never mid-pair.
- [ ] s55m1 and s55m2 are cited as historical controls only. Name the factory drift since their pin `a16a6c3`: node 24, pi 1.3.0 and the toolchain ratchet. The fresh ctl-a and ctl-b runs are the real controls.

#### 2. Measures (recorded per run, both arms)

Primary, unchanged from s55m1:
- **M0:** reachable value defects by our sweep, every known class (DST span with `spanPower`, gap walls, `Intl` labels), plus Ron's verdict (deployable, MVP or not).

Q1, amendments by the author of the spec:
- **M1:** amendments proposed from `test_design`, `build`, `fix_*` and `revise_*` phases. The `### A<n> — <role> (<phase>)` heading attributes each one. Count them, and give their targets and rulings.
- **M2:** `spec_frozen` corrections, meaning attempts to edit the frozen sections in place, per phase. This is a mind revising its own draft instead of amending it.
- **M3:** silent closures: review findings that name behaviour no V row covers and that the builder closed in code with no amendment.

Q2, test independence:
- **M4:** V coverage of the generated suite at `commit_tests`, as the fraction of effective V ids with at least one assertion. Read the suite and do not grep for ids (memory: measure, don't eyeball).
- **M5:** what slipped past the arm's own suite: `review_1` blocking findings that are **value** defects, each checked against the oracle. This is the shared-blind-spot signal. A suite written by the builder's own mind should let more through.
- **M6:** suite edits by build-side phases, from the captured suite diff against `red_sha` (added and removed counts), and for each removed or changed assertion whether it was weakened. This is teaching to the test.
- **M7:** the `tests_red` first-try pass and any permission breach during `test_design` (product code written early).

Cost and process, recorded and never scored (memory: cost is recorded, never scored):
- **M8:** wall clock per phase, tokens, $, review count, and peak context occupancy of the `author` session as a share of 1M.

#### 3. Predictions (a miss is a result)

- [ ] **P1 (Q1):** fold1 proposes **fewer** build-side amendments (M1) than its paired control, and **at least one** across the two fold1 runs. Zero in both would mean the author never challenges its own spec.
- [ ] **P2 (Q1):** fold1 shows **more** `spec_frozen` corrections (M2) than its control.
- [ ] **P3 (Q2):** fold1's M5 (value defects reaching review_1) is **≥** the control's in each pair.
- [ ] **P4 (Q2):** fold1's M4 coverage is within 10 points of the control's. Independence loss shows up in *what* is asserted, not in *how much*.
- [ ] **P5 (primary):** fold1 ships zero reachable value defects in both runs (M0), matching s55m1/s55m2.
- [ ] **P6:** fold1's wall clock to `commit_build` is shorter than its control's in both pairs.

#### 4. Decision rule (the article's, made concrete)

- **fold1 replaces the default** only if, across both pairs, M0 is no worse (defects ≤ control), Ron's verdict is no worse, and M5 is no worse.
- Otherwise the team default stands and fold1 goes to the CHANGELOG as a measured negative.
- A split result (one pair each way) is **not** a decision. Ron chooses between a third pair and closing.

#### Validation — Phase 3

> **Loop gate.** Do not start Phase 4 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] The CHANGELOG pre-registration entry is committed, with Ron's approval quoted
- [ ] `just target show greenfield` — host_sha equals the commit that contains Phases 1–2

### Phase 4: Pilot pair

Two arms at once, which memory says the shared vCPU handles (3–5 concurrent arms proven). **$40
key limit each.** Expected cost $3–6 per run, from s55m1 at $3.61 and s55m2 at $2.55.

#### 1. Mount and run

- [x] `just sbx mount fold1a --target greenfield --limit 40 --config adws/adw_sssf_config/sssf.fold1.config.yaml`
- [x] `just sbx mount ctla --target greenfield --limit 40 --config adws/adw_sssf_config/sssf.team-sonnet.config.yaml`
- [x] `just sbx lifecycle execute <fold1a-id> prompts/meeting-planner.md adws/adw_sssf_config/sssf.fold1.config.yaml team`
- [x] `just sbx lifecycle execute <ctla-id> prompts/meeting-planner.md adws/adw_sssf_config/sssf.team-sonnet.config.yaml team`
- [x] Mount-time check: on fold1a, the planner, test_designer and builder pi processes all carry the **same** `--session-id`. On ctla they carry three different ones.

#### 2. Judge

- [x] Run the s55m1 sweep (M0) and collect M1–M8 for both runs. Reconcile cost by generation ids **before** teardown (memory: toolchain-unpin-plan).
- [x] Ron's verdict on each app, given blind if practical (arm labels hidden).
- [x] Write a CHANGELOG result entry for the pair. Harvest per the sandbox-merge memory: cherry-pick, never ff.
- [x] Tear down both.

#### Validation — Phase 4

> **Loop gate.** Do not start Phase 5 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] Both runs reached a verdict. A run lost to a non-model cause (mount, provider, deadlock) is rerun, not counted, and its cause is recorded (memory: n3-set-results)
- [x] The pilot result entry exists, with every P1–P6 marked met, missed or no power

### Phase 5: Replicate pair and decision

#### 1. Replicate

- [ ] `fail` fold1b and ctlb run exactly as Phase 4, on the same pin. — not run: Ron closed fold1 after the pilot (CHANGELOG 2026-10-29d)

#### 2. Decide

- [ ] `fail` Apply the decision rule from Phase 3. Write the closing CHANGELOG entry: P1–P6 across N=2, the Q1 and Q2 answers in one paragraph each, and the decision. — not run: Ron closed fold1 after the pilot (CHANGELOG 2026-10-29d)
- [ ] `fail` If fold1 wins: a separate, Ron-approved change makes it the default, following team-default-consolidation's procedure. This plan does not flip the default. — not run: Ron closed fold1 after the pilot (CHANGELOG 2026-10-29d)
- [ ] `fail` Delete the NEXTSTEPS item, and update memory with a `project_fold1-results` entry. — not run: Ron closed fold1 after the pilot (CHANGELOG 2026-10-29d)

#### Validation — Phase 5

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] `fail` `grep -n "fold1" NEXTSTEPS.md` — no open item remains — not run: Ron closed fold1 after the pilot (CHANGELOG 2026-10-29d)
- [ ] `fail` `grep -n "fold1" CHANGELOG.md` — pre-registration, pilot and closing entries all present — not run: Ron closed fold1 after the pilot (CHANGELOG 2026-10-29d)

## Global Validation

- [ ] `git diff 294627f -- adws/adw_team_sdlc.py adws/adw_data/prompt_engineering_team/` — empty. Chain and prompts are untouched, so the arm differs by session continuity alone.
- [ ] `uv run --with pydantic --with pyyaml python -m adws.adw_modules.session_share_selftest && uv run --with pydantic --with pyyaml python -m adws.adw_modules.permissions_selftest` — the mechanism and the lanes both hold on the final tree
- [ ] Four judged runs (2 fold1, 2 control) on one greenfield pin, each with M0–M8 recorded

## Notes

**Pilot result (CHANGELOG 2026-10-29c):** one value-defect class each, and they are different classes (ctla: DST span via a linear end; fold1a: midnight DST gap → null day bounds). Ron's verdict was non-blind: ctla conditional Deploy, fold1a MVP. Q1: the author did amend its own spec (A1, test_design). Q2: no shorting seen (M4 100%/100%, M6 no weakening). The pilot alone decides nothing.

**Why fold three seats at once, against the article's "one at a time".** The article's rule targets
systems with many overlapping domain subagents. Ours has one authoring chain whose handoffs are the
hypothesis, and Ron's two questions are about that chain as a unit. Folding the planner alone would
answer neither: it says nothing about tests written by the builder's mind. If fold1 wins, the
one-at-a-time ablation becomes interesting. Unfold `test_designer` (fold2: planner+builder shared,
test designer fresh). That is the cleanest single-seat test of Q2.

**Why the reviewer is never folded.** A reviewer that shares the builder's context reviews its own
reasoning. The repo's best catches came from a fresh reader: mix1's cross-frame bug, the value
sweep, the planted cheat caught 6/6. The article keeps subagents for exactly this kind of isolation.
Folding it would test something different and riskier, with no article support.

**Why prompts stay byte-identical, including the false "your teammate wrote this" framing.** Holding
them lets the arm isolate continuity. The alternative was a one-line bridge note ("you wrote the spec
and tests earlier in this session; this is your next phase"). It is truthful and probably helps, but
it is a second variable. If fold1 loses narrowly, a fold1b with the bridge note is the obvious
follow-up, and the harness-restraint memory argues it should be tested, not assumed.

**What "shorting independence" would look like, concretely.** In the control, the test designer
writes red tests from the spec alone, and the builder meets them cold. In fold1, the mind that writes
the tests already has the plan's design in context and will write the code next. Three failure
shapes are possible:

- (a) Tests assert what it intends to build rather than what the spec says (M4 content, M5).
- (b) Tests omit the cases it finds hard, because it knows they are hard (M5).
- (c) The build phase edits its own tests more freely (M6).

The control's counterweight is that the builder may edit suites by design (memory:
suite-edits-are-a-channel), so (c) is not new, only possibly more frequent. The frozen spec and the
reviewer's sweep are the backstop. Q2 asks whether that backstop now does work the suite used to do.

**What "amending your own spec" would look like.** The charter tells every phase to amend, not edit.
A mind that wrote the spec has the least reason to doubt it, which is the case for P1's "fewer". It
also has the most context on where the spec was guessed, which is the case against it. A
build-phase amendment from fold1 that is accepted and correct would be the most informative single
artifact the run can produce. It would show self-correction across a freeze with no handoff.

**Rejected measures.**
- *Cross-suite runs* (arm A's generated suite against arm B's app). Greenfield apps choose their own
  module shapes, so suites will not compile across arms. That would be a measure of API drift, not
  test strength.
- *Planted mutants per app.* They are informative, but each app needs hand-built mutants and the
  oracle already measures the outcome directly. Revisit only if M5 is ambiguous.

**Risks.**
- **Context occupancy.** The author session holds plan, tests, build and up to three fix and two
  revise loops. The builder historically peaks at ≤26% of 1M, and plan plus tests may add 10–15
  points. Still no compaction, but record M8: rot, not overflow, is the known risk (memory:
  context-occupancy-no-compaction).
- **pi resume semantics** (Phase 1 probe). If the system prompt does not replace per send, the
  session carries the planner's prompt while acting as builder, or both prompts at once. That is a
  different arm, so stop and re-plan rather than run it.
- **Prompt cache.** Changing the system prompt per phase busts the cached prefix at each phase
  boundary. This affects cost only; record it, don't score it.
- **N=2.** harn3 showed that one run is sampling. A split pair is not a result, so the decision rule
  says so in advance.

**Phase 1 probe results (2026-10-29, pi 1.3.0 = toolchain.lock, installed to a scratch prefix;
host pi is 0.99.2; `openrouter/anthropic/claude-sonnet-5.5`; total cost under $0.01).**
- **System prompt: effectively replaced per send.** The model's own answer, `CODENAME=BETA; EARLIER=none`, was not
  taken as evidence. pi records every `--system-prompt` as a system message in the session, in a `preamble`
  section: send 1 stored `{"preamble": "...ALPHA."}` and send 2 stored `{"preamble": "...BETA."}`. pi-ai's
  `resolveTranscript` keeps mid-conversation system messages only when the model's compat sets
  `supportsMidConvoSystemMessages`. Otherwise `collapseSystemMessages` sends one head message built by
  `getCurrentSystemMessage`, which merges sections **by name**, so the later preamble overwrites the earlier one.
  Our host `~/.pi/agent/models.json` and the guest `models.json.tmpl` both route this model through
  `openai-completions` with **no compat block**, so the flag defaults to false (`openai-completions.js`
  ~l.1296). Net: each phase's request carries only that phase's role prompt.
  - **This holds only while that's true.** If a model entry gains `supportsMidConvoSystemMessages: true`, or the
    model moves to pi's built-in `anthropic-messages` catalog entry, the old prompts stay in the history as
    "Updated system prompt section" messages. The latest still wins, but the history keeps them. Check this at
    any models.json change during the experiment.
  - Side effect: the head system message changes at every phase boundary, so the cached prefix is lost there.
    That's cost only, as predicted.
- **Thinking: applied per send.** The p2 and t2 session files record `thinking_level_change: low → high` on
  resume. Reasoning-token counts were 0 even on a *fresh* `high` call for these easy prompts, so they can't
  discriminate. The recorded level change is the evidence.
- **Tools: a history with a now-filtered tool is fine.** Send 1 (`read,write`) wrote `probe.txt` via `write`.
  Send 2 (`read` only) resumed that history and read it back with no error.
- Probe gotchas, for anyone repeating this: `pi -p` blocks on a non-TTY stdin (agent_pi passes DEVNULL; a
  shell probe needs `</dev/null`), and Sonnet 5.5 on OpenRouter rejects `--thinking off` ("Reasoning is
  mandatory"). The probe script is not kept; it's 30 lines of the above.

**Side check, nearly free, not part of this plan.** The article names a `prompt-audit` Claude API
skill that flags outdated instructions. Running it read-only over
`adws/adw_data/prompt_engineering_team/` fits the harness-restraint memory (ablate coaching at each
model refresh). Queue it separately if it surfaces anything.

## Amendments

<details>
<summary>2026-10-29T13:45:00-07:00 — Phase 1 complete; agent_map keying differs from the plan</summary>

Phase 1 was built and its gate passed. One deviation from task 1.1: `agent_map.json` stays keyed by agent
name, with a `session` field per entry, instead of being keyed by `agent.session or agent.name`. The reason is
that external readers (the visualizer's `agent_sessions` type, the traces recipe) expect one entry per agent.
The pi resume probe confirmed the design's assumption, with a dependency on models.json compat that is now
recorded in Notes.
</details>

<details>
<summary>2026-10-29T14:30:00-07:00 — Phase 2 smoke caught a Phase 1 defect: matching ids, three fresh sessions</summary>

Smoke 1 (`fold1smk`, throwaway worktree, pi 1.3.0) passed 15/15 phases for $0.69, and `agent_map.json` showed
planner, test_designer and builder on one id, `sssf-fold1smk-author-da51`. **Nothing was folded.** pi resolves
`--session-id` inside `--session-dir`, and `agents.execute` passed a per-agent `<agent>/pi_sessions` directory, so
each seat opened a fresh session that happened to have the same id. The evidence: three session files with that
id, one per agent dir, each starting with its own role's task.

Fix: `_pi_session_dir(run, agent)` keys the directory by `agent.session or agent.name`. Unshared agents keep the
same path as before. `session_share_selftest` now asserts the directory. A mutation check (reverting to per-agent
dirs) makes it fail.

The Phase 2 smoke gate originally asked for "one session_id in agent_map.json", and the broken mechanism would
have passed it. It now asks for history continuity in the session file. The general lesson: test what the
mechanism is *for* (shared context), not its identifier.
</details>

<details>
<summary>2026-10-29T15:10:00-07:00 — Phase 3 drafted (CHANGELOG 2026-10-29b); P1 and M1 sharpened against the control record</summary>

Reading the controls changed P1. In s55m1 and s55m2 **every** build-side amendment came from a revise phase,
turning a reviewer finding into V rows. Neither proposed one before review. "fold1 proposes fewer amendments"
therefore sits at a floor of 0 and cannot be measured. The pre-registration splits M1 into M1a (pre-review,
recorded only) and M1b (amend-vs-code-only when review finds a value or requirement gap; both controls amended every
time), and P1 now predicts on M1b. P2's control baseline was verified: 14/14 `spec_frozen` checks passed first time
across both controls. The CHANGELOG entry supersedes this plan's Phase 3 §2–§3 wherever they differ. Ron approved it as written
2026-10-29.
</details>

<details>
<summary>2026-10-29T16:30:00-07:00 — closed by Ron after the pilot; status abandoned (human decision)</summary>

Ron chose not to run the replicate pair: "it really comes down to the logic, which failed its mark on both counts."
fold1 showed no advantage, and the team default stands. Phase 5 is marked `fail` with that reason. The `session:`
key and the fold1 roster remain, inert unless named. Follow-ups are in NEXTSTEPS 0d (bare Sonnet on the meeting
planner; an Opus builder seat).
</details>
