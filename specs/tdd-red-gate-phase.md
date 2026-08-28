---
plan: tdd-red-gate-phase
created: 2026-08-27T18:58:46-07:00
modified:
  - 2026-08-27T18:58:46-07:00
commits:
  - 6dd748c
agents:
  - claude-fable-5
sessions:
  - cc-interactive-20260827
back_refs:
  - specs/payload-app-manifest.md — consumes `app.test_file` and `app.generated_tests_dir`; build that plan first
forward_refs: []
status: building
---

# Plan: Spec-to-Test Phase with a Red Gate

## Purpose

Add a test-designer agent to the ADW pipeline that turns the planner's spec into an executable
test file *before* the builder runs, gated by a mechanical proof that the tests are non-vacuous:
they must **fail** on the pre-build tree. A green smoke detector only proves it's on; you prove it
works by putting smoke under it. The red gate is the smoke. Ships as a new chain,
`adw_tdd_sdlc.py`, beside the untouched `adw_simple_sdlc.py` — the existing chain becomes the
control group for exactly the kind of A/B comparison this repo exists to run.

## Problem

The current chain (`adw_simple_sdlc.py`) is plan → build → test → review, where "test" runs a
suite that existed before the run started (`quality.py`'s `TEST_FILE`). Two consequences:

1. **The suite can't see the feature.** A run implementing triad playback is graded by tests
   written before triad playback was conceived. The fix loop repairs regressions; nothing
   mechanical checks the *new* behavior. That judgement falls entirely on the reviewer — a
   probabilistic agent with no executable stake in the ground.
2. **The gate model has a blind spot the repo has already paid for.** The 2026-08-15 harvest
   shipped a commit that silently dropped the real code because gates check claims
   (`diff_matches_claims`: "the files you named exist"), not behavior. A generated,
   spec-derived, red-then-green suite is the cheapest behavioral gate available.

The gate philosophy in `gates.py` — "verify the envelope's CLAIMS, never guesses… Gates check
what is mechanically checkable" — extends cleanly: *"these tests test something"* is mechanically
checkable as *"they fail before the build exists."* `verdict_consistent` refutes a reviewer's
self-contradiction without reading the diff; `tests_red` refutes a vacuous test suite without
reading a single assertion.

## Solution

Five components, in dependency order:

**1. `TestDesignOutput` envelope** (`data_types.py`), following `BuildOutput`'s shape:

```python
class TestCase(BaseModel):
    name: str                       # the bun test name, verbatim
    requirement: str                # the plan requirement it proves, in the plan's words

class TestDesignOutput(EnvelopeBase):
    test_file: str = ""             # the one generated file, under app.generated_tests_dir
    cases: list[TestCase] = Field(default_factory=list)
    commit_message: str = ""        # consumed by the commit_tests git phase
```

`cases[].requirement` is not decoration: it's the traceability thread the reviewer follows
(plan requirement → named test), and later a best-of-N judge's scoring axis.

**2. `gates.tests_red` gate** (`gates.py`) — same `(envelope, run) -> GateReport` contract, four
checks, all mechanical, evidence recorded either way:

| Check | Passes when | What it refutes |
|---|---|---|
| containment | `envelope.test_file` is inside `app.generated_tests_dir`, exists, non-empty | designer wrote nothing, or wrote outside its lane |
| parses | `bun x oxlint@1.36.0 <file>` exits 0 | red-by-syntax-error (a broken file fails for the wrong reason) |
| RED | `bun test <file>` exits **non-zero** | vacuous tests — a suite that already passes has tested nothing |
| fixed suite untouched | `git diff --name-only` on `app.test_file` is empty | designer "helped" by editing the existing suite |

The RED check's output tail is kept as evidence in the report — it rides to the builder as "make
exactly this pass." Note what `parses` deliberately does NOT do: resolve imports. A TDD test
legitimately imports a module that doesn't exist yet (`import { wheel } from "./circle-wheel"`);
`bun build` would reject that, `oxlint` doesn't try. The residual ambiguity (import of a module
that will *never* exist) is accepted and backstopped by the reviewer — see Notes.

**3. Quality plumbing** (`quality.py`): `tests()` and `run_tests()` grow an
`extra_files: list[str] = []` parameter appended to the `bun test` argv. After the test-design
phase, the green bar means *fixed suite + generated suite*, in one command, reported through the
same `QualityResult` envelope shape every ADW already consumes.

**4. Roster + prompts**: a `test_designer` agent in `sssf.config.yaml` with write access to
`apps/*/tests/generated/` and nothing else in the repo — the containment that makes the gate's
fourth check nearly redundant and lets `permissions.py` enforce what the prompt only asks.
System/user prompts under `adws/adw_data/prompt_engineering/test_designer/`, following the
planner/reviewer conventions.

**5. The chain** (`adw_tdd_sdlc.py`), cloned from `adw_simple_sdlc.py`:

```
engineer(request) -> planner -> git(commit_plan)
        -> test_designer  [gates: artifacts_exist, tests_red]   <- NEW
        -> git(commit_tests)                                    <- NEW: 4th work product
        -> builder -> code(test: fixed + generated) [-> fix loop, bounded]
        -> reviewer [-> revise loop, bounded] -> code(retest if revised)
        -> git(commit_build) -> code(changes) -> documenter -> git(commit_docs)
```

Four commits, four work products, four authors. A failed red gate travels back to the *same*
test-designer session as a correction, exactly like every other gate violation. The builder's
`previous` envelope is the test design (whose `notes_for_next_agent` carries the plan path and
the red failure output); the fix loop is byte-identical to today's — "make red go green" is
already what it does.

## Relevant Files

### Existing — modified

- `adws/adw_modules/data_types.py` — add `TestCase`, `TestDesignOutput`
- `adws/adw_modules/gates.py` — add `tests_red`
- `adws/adw_modules/quality.py` — `tests()`/`run_tests()` accept `extra_files`
- `adws/adw_sssf_config/sssf.config.yaml` — `test_designer` roster entry (other four rosters: see Notes / deferred)
- `just/adws.just` — add a `tdd` recipe mapping to the new script (execute.just already passes the recipe name through: `adw {{ADW}}`, so the sandbox needs nothing else)

### Existing — deleted

- (none)

### New

- `adws/adw_tdd_sdlc.py` — the TDD chain; `adw_simple_sdlc.py` stays untouched as control
- `adws/adw_data/prompt_engineering/test_designer/system.md` — role contract
- `adws/adw_data/prompt_engineering/test_designer/user.md` — task template (planner's `{{prompt}}`/`{{previous_envelope}}`/`{{context_handoff_dir}}` variable convention)
- `prompts/11-tdd-smoke.md` — a small, real fretboard feature prompt for the end-to-end smoke run

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

### Phase 1: Types, gate, and gate self-test

The gate is the load-bearing novelty, so it lands first and gets tested in both directions —
smoke under the detector — before any agent depends on it.

#### 1. Data types

- [x] Add `TestCase` and `TestDesignOutput` to `data_types.py`, matching the file's existing comment style and field-per-line layout

#### 2. The gate

- [x] Add `tests_red(envelope, run) -> GateReport` to `gates.py` with the four checks from Solution; reuse `TAIL_CHARS` evidence truncation; read `generated_tests_dir` and the fixed `test_file` via `manifest.load()` (back_ref: payload-app-manifest)
- [x] Design it like `tests_pass`: no hidden state, every check recorded with evidence whether green or red

#### 3. Self-test the gate in both directions

- [x] Sanity-check the RED primitive both ways at the shell (see validation below) — a passing dummy must exit 0, a failing dummy non-zero, so the gate's exit-code reading stands on measured ground
- [x] Exercise `tests_red` itself against three fixtures in `apps/fretboard/tests/generated/`: an already-passing file (gate must FAIL — vacuous), a properly failing file (gate must PASS), a syntax-broken file (gate must FAIL on `parses`); run via a short `uv run` driver with a stub envelope, then delete the fixtures

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `printf 'import {test,expect} from "bun:test";\ntest("t",()=>expect(1).toBe(1));\n' > /tmp/green.test.ts && bun test /tmp/green.test.ts; echo "exit=$?"` — prints `exit=0` (the vacuous case is detectable)
- [x] `printf 'import {test,expect} from "bun:test";\ntest("t",()=>expect(1).toBe(2));\n' > /tmp/red.test.ts && bun test /tmp/red.test.ts; echo "exit=$?"` — prints a non-zero exit (exit=1 measured; the red case is detectable)
- [x] Gate fixture run — `tests_red` returns FAIL / PASS / FAIL for the passing / failing / syntax-broken fixtures respectively, with the reason readable in each check's note
- [x] `git status --porcelain apps/fretboard/tests/` — fixtures cleaned up, nothing left behind

### Phase 2: Quality plumbing

#### 1. `extra_files` through the test blocks

- [x] `quality.tests(run, extra_files=[])` appends the extra paths to the `bun test` argv; `run_tests(run, extra_files=[])` passes through; zero-arg behavior byte-identical to today (existing callers in `adw_simple_sdlc.py` etc. unchanged) — implemented as `extra_files: list[str] | None = None` to avoid a mutable default; same call contract

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `uv run adws/adw_quality.py "tdd plumbing regression check"` — the existing deterministic chain is still green with no callers passing `extra_files` (adw 578bda2d, 2/2 phases)
- [x] `grep -n "extra_files" adws/adw_modules/quality.py` — the parameter exists on both `tests` and `run_tests`

### Phase 3: Roster entry and prompts

#### 1. `test_designer` in the roster

- [x] Add the agent to `sssf.config.yaml`: purpose "Turn the plan's requirements into an executable test file that fails until the build satisfies it; touch nothing else"; `writes: [apps/*/tests/generated/]` (confirm glob semantics against `permissions.py` before committing to the pattern); tools `read, grep, find, ls, bash, write`; start on the roster default model with `thinking: high`; pick an unused lane color (`#34d399`) — glob confirmed: the plan's trailing-`/` pattern would hit `_matches`'s prefix branch first and literal-match the `*`; shipped as `apps/*/tests/generated/**`
- [x] Verify `permissions.py` enforces the `writes` containment for a path that doesn't exist yet (the dir is created by the first write — confirm the check is prefix-based, not existence-based) — `permitted()` is pure string/pattern matching; driver confirmed a nonexistent `tests/generated/x.test.ts` is allowed and `main.ts`/fixed suite/manifest/gates.py are rejected

#### 2. Prompt engineering

- [x] `system.md` — follow the planner/reviewer file structure (Purpose / Instructions). Contract: read `plan.md` from the previous envelope; write exactly ONE file, `<generated_tests_dir>/<adw_id>.test.ts`; one test per plan requirement, named so a human can match test to requirement; imports MAY reference modules the plan says will be created — that is what TDD red looks like; the suite MUST fail on the current tree and the failures must be assertion- or import-shaped, never syntax errors; report `TestDesignOutput` with every case's `requirement` in the plan's own words; include the file's standing conventions (bare tool names, exit-status judging, scratch to /tmp)
- [x] `user.md` — the `{{prompt}}` / `{{previous_envelope}}` / `{{context_handoff_dir}}` variable template, mirroring `planner/user.md`

#### Validation — Phase 3

> **Loop gate.** Do not start Phase 4 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `uv run python -c "import yaml,sys; yaml.safe_load(open('adws/adw_sssf_config/sssf.config.yaml'))"` (or the repo's equivalent load path) — config still parses
- [x] `ls adws/adw_data/prompt_engineering/test_designer/` — `system.md` and `user.md` exist
- [x] `permissions.py` containment check — a simulated write to `apps/fretboard/main.ts` by `test_designer` is rejected; a write to `apps/fretboard/tests/generated/x.test.ts` is allowed (driver ran `permitted()` against the real loaded config, 6/6 cases correct)

### Phase 4: The chain

#### 1. `adw_tdd_sdlc.py`

- [x] Clone `adw_simple_sdlc.py`; insert the `test_design` agent phase (gates: `artifacts_exist`, `tests_red`) and `commit_tests` git phase between `commit_plan` and `build`; `REQUIRED_AGENTS = ["planner", "test_designer", "builder", "reviewer", "documenter"]`
- [x] Builder's `previous` is the `TestDesignOutput` envelope; the test-design phase's `notes_for_next_agent` must carry the plan path and the red-run failure tail (instructed in `user.md`'s Task step 5 and Report contract)
- [x] Every `test_N` / `retest` phase passes `extra_files=[test_design.test_file]` — the green bar is fixed + generated, always together
- [x] Rewrite the module docstring in the file's own voice: four commits, four work products, four authors; the smoke-detector rationale for the red gate
- [x] Add the `tdd` recipe to `just/adws.just` beside `sdlc`, so `just sbx lifecycle execute <run-id> <prompt> tdd …` reaches it unchanged

#### Validation — Phase 4

> **Loop gate.** Do not start Phase 5 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `uv run python -m py_compile adws/adw_tdd_sdlc.py` (via the same uv script env the ADWs use) — the script parses
- [x] `uv run adws/adw_tdd_sdlc.py --help` — argparse contract matches the sibling scripts (`prompt`, `--config`, `--adw-id`)
- [x] `just adw` — the `tdd` recipe is listed

### Phase 5: Smoke test — the whole detector, with smoke

#### 1. Author the smoke prompt

- [ ] Write `prompts/11-tdd-smoke.md`: one small, genuinely new fretboard behavior (something the current suite cannot already cover — e.g. a small theory helper with crisp input/output semantics), phrased like the existing numbered prompts

#### 2. Run it

- [ ] `uv run adws/adw_tdd_sdlc.py prompts/11-tdd-smoke.md` locally, end to end
- [ ] Inspect the trace: the red gate ran and recorded a genuine RED before the build; the same generated file is green in the final test phase

#### Validation — Phase 5

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] `git log --oneline -6` — four run commits in order: plan, tests, code, docs, each in its author-agent's words
- [ ] The generated `<adw_id>.test.ts` is on the branch, under `tests/generated/`, and `bun test <that file>` passes on the final tree
- [ ] `bun test apps/fretboard/fretboard.test.ts` — the fixed suite is untouched and green
- [ ] The trace's `tests_red` gate report shows the pre-build failure evidence (the smoke that proved the detector)

## Global Validation

- [ ] `uv run adws/adw_quality.py "post-tdd regression check"` — the deterministic chain is green
- [ ] `uv run adws/adw_simple_sdlc.py --help` — the control-group chain is untouched and intact
- [ ] Both specs' checkboxes reconciled and this plan's frontmatter synced

## Notes

**Why a new script instead of editing `adw_simple_sdlc.py`.** Three reasons, in strength order:
(1) this repo is a comparison rig — same prompt through `sdlc` vs `tdd` is precisely the
experiment worth running, and editing the original destroys the control group; (2) the repo
already speaks this idiom (seven `adw_*.py` chain variants); (3) rollback is `git rm` of one
file, not a revert threaded through a shared chain.

**The import-shaped red ambiguity, stated honestly.** The gate proves the suite fails; it cannot
prove it fails *for the right reason*. A test importing `./circle-wheel` before that module exists
is legitimate TDD red; a test importing `./cirlce-wheel` (typo) is a bug that produces
indistinguishable exit codes. Mitigations, in order: `oxlint` kills syntax-level junk; the
containment check kills misplaced files; `cases[].requirement` gives the reviewer a checklist to
catch a test that never starts asserting; and the builder's fix loop will slam into an
unsatisfiable import within `MAX_FIX_LOOPS` and fail loudly rather than silently. Parsing bun's
failure output to classify assertion-vs-import failures was considered and rejected for v1 —
it's output-scanning, which the repo's own prompts forbid agents from doing ("judge by exit
status, never by scanning output for words"); the harness should hold itself to the same rule
until there's evidence the ambiguity bites in practice.

**Overfit risk — the builder teaching to the test.** The builder now optimizes against tests a
model wrote, and both could be wrong in compatible ways. Backstops: the reviewer still judges
against `plan.md` (the human-adjacent artifact), the fixed suite still guards existing behavior,
and `MAX_FIX_LOOPS`/`MAX_REVISION_LOOPS` bound the damage. This is strictly better than today,
where the new behavior has *no* executable check at all.

**Model choice for the test-designer.** Deliberately started on the roster default rather than a
premium pick: whether test design needs a frontier model is exactly the kind of question the
five-roster fan-out answers empirically. Don't pre-decide it in config.

**The best-of-N hook (deferred, but the reason `cases[].requirement` exists).** Once N sandboxes
run the same prompt through the TDD chain, every candidate carries a spec-derived suite. Running
candidate A's build against candidate B's tests (and vice versa) turns the currently-manual
"rank the diffs by eye" harvest step into a scored matrix — the automated judge from the
2026-08-19 notes, nearly for free. Not in this plan; recorded so the envelope design doesn't have
to be retrofitted.

**Other rosters (deferred).** Only `sssf.config.yaml` gets the `test_designer` entry here. The
other four roster files gain it when the fan-out experiment actually needs them — copying config
five ways before one chain has proven out is premature.

**Sandbox execution path (verified, no work needed).** `execute.just:91` runs
`adw {{ADW}} …` — the recipe name is already a parameter. The `tdd` recipe in `just/adws.just`
is the only integration point; create/fill/setup/observe/harvest are untouched.

## Amendments

<details>
<summary>— no amendments yet</summary>

Post-execution changes are appended here, newest at the bottom, by the `update` and `sync` workflows.
</details>
