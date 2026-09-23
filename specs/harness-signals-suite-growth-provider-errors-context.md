---
plan: harness-signals-suite-growth-provider-errors-context
created: 2026-09-23T08:33:36-07:00
modified:
  - 2026-09-23T08:33:36-07:00
commits:
  - 45ac892
agents:
  - claude-opus-5-5
sessions:
  - 098f5599-88b9-43e1-9fed-2ba4233f8b62
back_refs: []
forward_refs:
  - specs/context-rot-and-self-compact.md — consumes the per-turn context curve Phase 3 adds
status: draft
---

# Plan: Three harness signals: durable-suite growth, provider errors, and the context curve

## Purpose

Add three signals the trace does not record today. None changes what an agent does. Each makes a
run's outcome **explainable** instead of guessed at:

- did the builder grow the durable suite (NEXTSTEPS item 5)
- did an agent fail because the *provider* errored, not because the model wrote bad JSON (open item 2026-09-20b (5))
- how did each agent's context occupancy evolve turn by turn (the prerequisite for any context-rot experiment)

## Problem

1. **Suite growth is only noticed by the reviewer, and not reliably.** `tests_red` correctly
   forbids the test_designer from touching `app.test.ts`, so growing the durable suite is the
   builder's job. The reviewer flagged the non-growth twice. In hfix the builder grew it, and three
   of the new assertions pinned a defect. Nothing mechanical answers even the first question: did
   it grow?
2. **A provider error is reported as a model failure.** When an assistant turn ends with
   `stopReason: "error"`, pi puts the cause in `errorMessage` (verified in local sessions:
   `"errorMessage":"401: {\"message\":\"Missing Authentication header\"…`). `agent_pi.run` only
   uses `stopReason` to skip the occupancy reading (`agent_pi.py:394`), and the errored turn's text
   is empty or partial. `agents._parse_with_retries` then says "not valid JSON" and spends
   `JSON_FIX_ATTEMPTS` sends into the same broken provider path. The phase error ends up as
   `builder never produced valid BuildOutput JSON`, which blames the model and hides the cause.
   This matters most before any fan-out, where it shows up as model noise
   ([[small-n-before-fanout]]).
3. **Context occupancy is one number per agent.** `agent_sessions.context_tokens` is the *last*
   valid turn. Because the builder's session persists across build → revise_1 → revise_2
   (`agents._agent_session_id`), and pi never compacted in any run (peak 26% of a 1M window), that
   number equals the peak. But it cannot show *when* the window grew, or whether defects cluster
   late in long sessions. The per-turn value is already computed (`agent_pi.py:385`,
   `_context_tokens(usage)`) and then discarded.

## Solution

- **Suite growth: a measurement, reported, never failing.** Count the durable file's tests at the
  `commit_tests` checkpoint and after each builder phase, using bun's own reporter rather than a
  regex ([[measure-dont-eyeball]]). Record it as a gate check row that always passes, with the
  delta in its note, so it shows in `gate_results` and the console. Failing on "didn't grow"
  would reward the builder for writing filler tests, which is the pinned-defect failure mode in a
  new form. The reviewer already judges whether the tests are *correct*; give it the number.
- **Provider errors: classify at the source, stop before parsing.** Carry `stop_reason` and
  `error_message` of the final assistant turn on `PiResult`. In `_parse_with_retries`, an errored
  final turn raises a distinct `ProviderError` carrying the provider's message, with no JSON
  correction send. The phase error becomes `provider_error: <message>`.
- **Context curve: persist what is already computed.** Stamp each forwarded `agent_message`
  event with that turn's `context_tokens` and the model's window. It lands in `events.payload_json`
  with no schema change. A `just` query prints the curve per agent.

## Relevant Files

### Existing — modified
- `adws/adw_modules/agent_pi.py` — `PiResult.stop_reason`, `PiResult.error_message`; expose per-turn `context_tokens` to the event forwarder
- `adws/adw_modules/agents.py` — `ProviderError`; short-circuit in `_parse_with_retries`; context stamp in `_event_forwarder`
- `adws/adw_modules/gates.py` — `durable_suite_growth` gate (report-only), reusing `_junit_tally`
- `adws/adw_tdd_sdlc.py` — add the growth gate to the `build`, `fix_i` and `revise_i` phases; capture the baseline count after `commit_tests`
- `just/` traces recipe (locate with `rg -n 'traces' justfile just/`) — add a `context-curve <adw_id>` query
- `NEXTSTEPS.md` — result entry

### Existing — deleted
- none

### New
- none

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

### Phase 1: Provider errors are named as provider errors

#### 1. Capture on `PiResult`

- [ ] In `agent_pi.run`'s `message_end` handler, set `result.stop_reason = message.get("stopReason")` and `result.error_message = message.get("errorMessage") or ""` on every assistant turn, so the last one wins, same as `result.text`
- [ ] Add both fields to `PiResult` with defaults (`None`, `""`)

#### 2. Short-circuit the JSON retry

- [ ] Define `class ProviderError(RuntimeError)` in `agents.py`
- [ ] At the top of each loop iteration in `_parse_with_retries`: if `result.stop_reason == "error"`, raise `ProviderError(f"provider_error ({agent model}): {result.error_message[:400]}")`. Do not send a correction. Pi has its own transient-error retry, so an error that reaches us is final for that send
- [ ] Make sure the phase's recorded `error` text starts with `provider_error`, so a trace query can split the classes: `select error from phases where error like 'provider_error%'`

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] Replay test: feed `agent_pi`'s line parser a captured errored `message_end` line (the local 401 sample under `adws/adw_data/sessions/`) and assert `stop_reason == "error"` and `error_message` starts with `401` — proves capture against pi's real shape, not an assumed one
- [ ] `uv run python -c` harness that calls `_parse_with_retries` with a fake `result` (`stop_reason="error"`) and a `send` that raises if called — proves no correction is sent and `ProviderError` is raised
- [ ] Same harness with `stop_reason="stop"` and bad JSON still retries `JSON_FIX_ATTEMPTS` times — proves the existing path is unchanged

### Phase 2: Durable-suite growth, measured

#### 1. Count with bun, not regex

- [ ] Add `gates.durable_suite_growth(baseline: int)`. It returns a gate that runs `bun test <app.test_file> --reporter=junit --reporter-outfile=/tmp/<run>-durable.xml`, tallies with `_junit_tally`, and records one **always-passing** check: `durable suite: <baseline> → <now> (+<delta>)`. If bun cannot load the file, record that as the note, still passing: the quality phase owns failing on it
- [ ] Verify the reporter flags against the pinned bun (1.4.2) first. `tests_red` already uses junit via `_junit_tally`, so copy its argv exactly rather than inventing one

#### 2. Wire into the TDD chain

- [ ] After `commit_tests` in `adw_tdd_sdlc.py`, capture the baseline count once (same counting function) and stash it on `run`
- [ ] Append `gates.durable_suite_growth(baseline)` to the gates of `build`, every `fix_i` and every `revise_i`
- [ ] Put the number where the reviewer reads it: include the latest growth note in the reviewer's `previous_envelope` path if that is a one-line change; otherwise leave it in `gate_results` and note the gap here

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] Against the hfix tree (`git -C ../greenfield-sandboxes archive refs/sandbox/hfix-20260920-062b46`): run the counter on the red-suite commit and on the snapshot commit; expect a positive delta (the snapshot's durable suite held 29) — proves the count matches a known run
- [ ] A gate report with a zero delta still reports `passed: true` — proves it is report-only
- [ ] `uv run adws/adw_tdd_sdlc.py --help` (or its import) succeeds — proves the wiring does not break chain construction

### Phase 3: The per-turn context curve

#### 1. Stamp the events

- [ ] Pass each assistant turn's `context_tokens` (the same value `_context_tokens(usage)` computes, and only for turns whose `stopReason` is not `aborted`/`error`, mirroring `agent_pi.py:394`) into the `agent_message` event payload as `context_tokens`, plus `context_window` once per agent from `agent_pi.context_window`
- [ ] No schema change: `events.payload_json` already carries arbitrary fields

#### 2. Query

- [ ] Add `just traces context-curve <adw_id>` (or extend the existing traces recipe; follow its pattern), printing per agent: phase, turn index, context_tokens, % of window. Point it at a run's `sssf.db` the same way the existing traces recipe does for harvested artifacts

#### Validation — Phase 3

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] A local short ADW run (cheapest roster, trivial request) produces `agent_message` events with `context_tokens` that rise monotonically within a phase — proves the stamp works on a real pi stream
- [ ] `just traces context-curve <that adw_id>` prints the curve; its last builder value equals `agent_sessions.context_tokens` — proves the curve and the existing summary agree
- [ ] `just target sync greenfield --dry-run; echo $?` prints `0`, then **ask Ron** before `--push`
- [ ] NEXTSTEPS entry recording all three signals and item 5 / 4(5) closed

## Global Validation

- [ ] `rg -n 'provider_error|ProviderError' adws/adw_modules/agents.py` and `rg -n 'durable_suite_growth' adws/adw_tdd_sdlc.py adws/adw_modules/gates.py` all hit — proves each signal is wired
- [ ] `git diff 45ac892 --stat` touches only the files listed in Relevant Files

## Notes

**Why growth is report-only, stated once more because it will be tempting to flip it.** Every gate
here teaches the agent what to optimise. "Durable suite must grow" is trivially satisfiable by
asserting whatever the code returns, which is exactly the hfix defect (`app.test.ts:423-436`). A
count answers "did it grow". Only a reader answers "did it grow correctly". Keep the count as
context for the reader.

**Provider errors vs a transient 429.** Pi retries transient provider errors internally (see pi
auto-retry settings). If an arm sees `provider_error` on a 429 that pi *should* have retried,
that is a pi config finding, not a reason to add our own retry here. Record it and look at pi's
retry settings; do not stack retry loops.

**The curve is for [[context-rot-and-self-compact]], but not only for it.** Once it exists,
"defects cluster in the late revise phases" or "the reviewer's third pass runs at 15% occupancy
and misses a sibling bug" become queryable instead of anecdotal. Cheap to add now, expensive to
reconstruct later. The traces are the one thing a torn-down VM leaves behind.

**Order.** Phase 1 first. It is the smallest change and the one that protects any run in between.
Phases 2 and 3 are independent of each other and could be built in parallel with `/orchestrate`.
That is probably not worth it at this size.

## Amendments

<details>
<summary>— no amendments yet</summary>

Post-execution changes are appended here, newest at the bottom, by the `update` and `sync` workflows.
</details>
