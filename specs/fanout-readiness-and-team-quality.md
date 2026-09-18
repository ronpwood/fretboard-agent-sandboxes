---
plan: fanout-readiness-and-team-quality
created: 2026-09-17T06:12:03-07:00
modified:
  - 2026-09-17T06:12:03-07:00
  - 2026-09-17T06:22:53-07:00
commits:
  - b3e4629
agents:
  - claude-opus-5[1m]
sessions:
  - 81d4f414-33e2-42a8-86ee-469f12ff2a87
back_refs:
  - specs/greenfield-target.md — named targets, `just target sync`, the pristine guard, and the gf-e2e-20260917-cbb166 run whose traces are this plan's baseline
  - specs/greenfield-cof-experiment.md — the hidden /20 rubric and the 2026-08-28 N=3 control scores (15 / 9 / 19) Phase 5 is judged against
  - specs/tdd-red-gate-phase.md — `adw_tdd_sdlc.py`, whose verify step Phase 3 changes
forward_refs: []
status: building
---

# Plan: Fan-out readiness + team quality

## Purpose

Make the next greenfield fan-out worth its money. First, fix what would make it lie: setup gates C/D/E
currently pass unconditionally, and the fan-out cookbook doesn't gate each arm's own roster. Then give
the teams on the VMs three things the 2026-09-17 run showed they lacked: a builder that knows its tool
contracts, a typecheck gate that actually type-checks, and a way to keep a rejected build instead of
losing it. Finish with a real, judged N=4 greenfield fan-out that measures whether any of it helped.
Arms are compared on rubric score first, with cost and tool-error rate beside it, because a cheap run
isn't the same as a good one.

## Problem

Evidence from `gf-e2e-20260917-cbb166` (traces at `.sandbox/traces/gf-e2e-20260917-cbb166/`, NEXTSTEPS
2026-09-17 and 2026-09-17b):

1. **Setup gates C/D/E are not enforced.** The mount log shows `FAIL openai/gpt-5.6-luna: … rate-limited
   upstream` immediately followed by `[gate] C PASS`. Gate D's `pi reports cost …` line and gate E's
   `limit/used/remaining` lines never printed. The gate runs as one heredoc fed to
   `ssh … 'bash -s'` (`just/sandbox/lifecycle/setup.just:163`). Gate D's
   `pi_cost="$(timeout 180 pi -p --mode json … 2>/dev/null | jq …)"` (line 232) has no `< /dev/null`.
   The working hypothesis: pi reads the rest of the heredoc from stdin, bash reaches EOF, the script
   exits 0, and `[ "$ping_fail" -eq 0 ] || exit 2` never runs. It is the only agent CLI inside a
   heredoc in `just/` (audited: `run/mod.just:86` and `local.just`/`orch/mod.just` are not heredocs).
2. **The fan-out cookbook is stale where it matters.**
   `.claude/skills/sssf-sandbox-orchestrator/cookbooks/fan_out_n.md`:
   - line 116 says `execute` "does not take a config argument" and teaches an ssh workaround.
     `execute RUN_ID PROMPT CONFIG="" ADW="sdlc"` has existed for weeks.
   - Both loops call `just sbx lifecycle setup "$ID"` without the arm's roster, so gate C pings the
     default roster for every arm (`setup RUN_ID CONFIG=""`).
   - Line 231 says a golden VM "bills continuously". It doesn't: the plan is a flat subscription
     (memory: exe.dev capacity & billing).
   - PLAYBOOK §1 advertises a "6-assertion health gate" that, per #1, is three assertions today.
3. **The builder fights its own tools.** Baseline, computed from the traces' `raw_output.jsonl`
   (`tool_execution_end` events):

   | agent | tool calls | errors | rate | breakdown |
   |---|---|---|---|---|
   | builder | 128 | 20 | 16% | 18 `edit` schema failures (`path: must have required properties path`: it sent `{edits:[…]}` with no `path`), 1 old text not found, 1 edit that changed nothing |
   | planner | 35 | 1 | 3% | 1 `ls` |
   | reviewer | 60 | 0 | 0% | — |
   | test_designer | 8 | 0 | 0% | — |

   Its thinking misdiagnosed the cause ("large edits fail, small succeed"), so it split edits and fell
   back to 32 whole-file writes. Build plus revise took 12.0M tokens and ~34 minutes. The builder's
   system prompt (`adws/adw_data/prompt_engineering/builder/system.md`, 14 lines) says nothing about
   how the tools behave.
4. **The "typecheck" gate doesn't type-check.** `quality.typecheck` runs
   `bun build --target=browser <entry>` (`adws/adw_modules/quality.py:143`), which strips types without
   checking them. It isn't wired into the TDD or simple chains either: both call only
   `quality.run_tests`. Measured on the host today:
   - Reintroducing the `idx` bug (`String(idx)`, undeclared) into the harvested app: `bun build` exits
     **0**. Non-strict `tsc` reports `circle-wheel.ts(99,36): error TS2304: Cannot find name 'idx'`.
   - The harvested app **as the reviewer approved most of it** has 15 non-strict tsc errors: 13 TS2345
     (number passed where a string is expected), 1 TS2322, 1 TS2304 (`DiatonicChord`, an undeclared
     type). Strict mode (tsc 7's default) reports 17.
   - `apps/fretboard/main.ts` passes non-strict tsc with exit 0, so the default target isn't broken by
     the change.
5. **No phase loads the page.** The 2026-08-28 judge found agents are "blind to their own design"
   (`specs/greenfield-cof-experiment.md` § Findings). The `idx` crash was caught by the reviewer
   writing its own DOM shim, not by any gate.
6. **A rejected build is lost by default.** `adw_tdd_sdlc.py` deliberately leaves the code
   uncommitted when review rejects (its docstring: "a red suite with no code is exactly where a human
   picks TDD back up"). Harvest carries only commits, and teardown refuses a dirty tree. On
   2026-09-17 the build was saved by a hand-typed `ssh … git commit`. For a fan-out, where most arms
   may fail review, that manual step is N times as error-prone.

## Solution

Five phases. The first four are cheap and mostly offline; Phase 1 ends with one short live proof.
Phase 5 is the experiment and spends real money, so it needs explicit go-ahead.

- **Phase 1: make the gate and the cookbook tell the truth.** Reproduce the heredoc hypothesis on a
  VM, add `< /dev/null`, then prove gate C now fails on a model that can't answer, from a scratch roster
  in `/tmp` so gate A's clean-tree check still passes. Fix the three stale cookbook spots and the
  PLAYBOOK claim.
- **Phase 2: measure, then teach.** A host script, `sandbox_mount/host/trace_metrics.py`, turns pulled
  traces into a per-agent tool-call and error table (reproducing the baseline above exactly), exposed as
  `just sbx manage trace-metrics <run-id>`. Then add a short **Tool contracts** section to the builder's
  system prompt, written from the observed failures, not from general advice. The effect can only be
  measured live, so the hypothesis is recorded here and scored in Phase 5: builder `edit` schema
  failures drop from 18 to ≤3.
- **Phase 3: a gate the agents can't talk past.** `quality.typecheck` becomes non-strict `tsc --noEmit`
  over the entry graph, pinned like oxlint. A new `quality.run_verify(run, extra_files)` runs typecheck
  then tests as one `QualityResult`. The TDD **and** simple chains call it wherever they call
  `run_tests` today, so the A/B stays symmetric and a type error flows into the existing fix loop
  verbatim. Separately, greenfield's shell `app.test.ts` gains a render-smoke test (a tiny document stub
  installed before the entry imports, so the render path executes under `bun test`). That is an owned
  change on greenfield `main`, so it's the first deliberate `target.pristine` bump: it exercises the
  guard's escape hatch for real.
- **Phase 4: keep rejected work without changing the chain.** A host recipe,
  `just sbx manage snapshot <run-id>`, commits a dirty VM tree onto `sbx/<run-id>` with a marked subject
  (`UNAPPROVED snapshot: …`), refusing if HEAD is not the run branch. The logic lives in
  `sandbox_mount/guest/snapshot_run_branch.sh`, piped over ssh from the host so it works on a VM with
  any factory version and can be tested locally against a temp repo. Teardown's dirty-tree refusal
  names the recipe. The chain's commit semantics don't change (see Notes: why not in the chain).
- **Phase 5: the judged fan-out.** Re-sync greenfield, then N=4 TDD arms on one pin, same prompt:
  two on the default roster (the improved factory, directly comparable to the 2026-08-28 control), one
  on a new **asymmetric** roster (frontier planner and reviewer, flash builder: the experiment the
  2026-08-28 judge designed), and one on its **inverse** (flash planner and reviewer, frontier builder:
  Ron's hypothesis from the 2026-09-17 run, that a good plan still misses when the builder is weak). Snapshot each rejected arm, harvest, pull traces, judge host-side with the
  hidden rubric, and publish one scorecard.

## Relevant Files

### Existing — modified
- `just/sandbox/lifecycle/setup.just` — `< /dev/null` on gate D's `pi -p` (line 232), plus a comment naming the failure mode
- `.claude/skills/sssf-sandbox-orchestrator/cookbooks/fan_out_n.md` — replace the stale "does not take a config argument" section; pass the arm's roster to `setup` in both loops; correct the golden-VM billing claim; add the snapshot step and the trace-metrics column
- `.claude/skills/sssf-sandbox-orchestrator/cookbooks/debug_a_failed_gate.md` — note that a gate that prints FAIL and then PASS is a stdin-detachment bug, not a flaky model
- `PLAYBOOK.md` — §1 gate claim; `just sbx manage snapshot` beside harvest (§5) and in § Greenfield runs; the typecheck gate in §2's phase description
- `adws/adw_data/prompt_engineering/builder/system.md` — new `## Tool contracts` section
- `.claude/skills/sssf/templates/prompt_engineering/builder/system.md` — the same section, so stamped repos inherit it (the two files already differ; add the section only, don't reconcile the rest)
- `adws/adw_modules/quality.py` — `TSC_VERSION`, `typecheck` → tsc, new `run_verify`
- `adws/adw_tdd_sdlc.py` — `test_{i}` and `retest` call `quality.run_verify`; docstring
- `adws/adw_simple_sdlc.py` — the same two call sites; docstring
- `just/sandbox/manage/mod.just` — import `snapshot.just` and `trace_metrics.just` (or inline recipes, matching how `traces.just` is wired)
- `just/sandbox/lifecycle/teardown.just` — the dirty-tree refusal message suggests `just sbx manage snapshot <run-id>` first
- `targets/greenfield.yaml` — bump `target.pristine` to the new shell commit (Phase 3)
- `../greenfield-sandboxes/apps/app/app.test.ts` — render-smoke test (owned; committed in the greenfield checkout)
- `TREE.md` — the two new host scripts, the guest snapshot script, the new recipes
- `NEXTSTEPS.md` — dated entries for Phases 1–4 and the Phase 5 results

### Existing — deleted
- none

### New
- `sandbox_mount/host/trace_metrics.py` — per-agent tool calls, errors, error kinds, and rate from a pulled traces dir; `--json` for the scorecard
- `just/sandbox/manage/trace_metrics.just` — `just sbx manage trace-metrics <run-id>` (reads `.sandbox/traces/<run-id>/`; tells you to run `traces` first if it's missing)
- `sandbox_mount/guest/snapshot_run_branch.sh` — `snapshot_run_branch.sh <repo-dir> <run-id> <message>`: verify branch, `git add -A`, commit with the marked subject, print the sha
- `just/sandbox/manage/snapshot.just` — `just sbx manage snapshot <run-id> ["reason"]`
- `adws/adw_sssf_config/sssf.asymmetric.config.yaml` — copy of `sssf.config.yaml` with planner and reviewer on `openrouter/anthropic/claude-opus-5`; everything else unchanged
- `adws/adw_sssf_config/sssf.inverse.config.yaml` — copy of `sssf.config.yaml` with the builder on `openrouter/moonshotai/kimi-k3` (the frontier roster's builder); planner, reviewer, test_designer and documenter unchanged
- `specs/greenfield-fanout-2-results.md` — HOST-ONLY scorecard and findings for Phase 5 (rubric stays in `specs/greenfield-cof-experiment.md`)

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

### Phase 1: Make the gate and the cookbook tell the truth

A live VM is needed to prove the fix: the bug only exists across `ssh … bash -s`. Use one short mount
with `--limit 2` and tear it down at the end of the phase. It mints a key and boots a VM, so confirm
with the user before mounting.

#### 1. Reproduce before fixing

- [x] `just sbx mount gate-fix --limit 2` (default target). Record the run id — `gate-fix-20260918-c336f6`
- [x] Mechanism check, independent of setup: `ssh <vm>.exe.xyz 'bash -s' <<'EOF'` with body `echo before; x="$(timeout 60 pi -p --mode json --provider openrouter --model deepseek/deepseek-v4-flash-0731 'say hi' 2>/dev/null | head -c 20)"; echo after-pi; echo still-here` then `EOF`. Hypothesis confirmed if `after-pi` and `still-here` never print; repeat with `< /dev/null` on the pi call and confirm both print. Record both outputs in NEXTSTEPS
- [x] Failing-model roster on the VM, outside the repo so gate A stays clean: `just sbx run cmd <id> "sed 's#openrouter/openai/gpt-5.6-luna#openrouter/nonexistent/no-such-model#' adws/adw_sssf_config/sssf.config.yaml > /tmp/bad.config.yaml"`
- [x] `just sbx lifecycle setup <id> /tmp/bad.config.yaml; echo rc=$?` **before** the fix — expect the bug: `FAIL  nonexistent/no-such-model` printed, then `[gate] C PASS`, rc 0, no gate E credit lines. If it instead fails correctly, the hypothesis is wrong: stop, mark this task `fail` with what was seen, and diagnose before editing

#### 2. Fix

- [x] `just/sandbox/lifecycle/setup.just`: append `< /dev/null` to the `pi -p` invocation inside `pi_cost="$(…)"`, with a two-line comment: inside this heredoc, any command that reads stdin eats the rest of the gate script, and that is how C/D/E passed unconditionally until 2026-09-17
- [x] Audit the rest of the `REMOTE_CDE` heredoc and the other two gate heredocs in `setup.just` (lines ~109, ~139) for any other stdin reader (`pi`, `claude`, `ssh`, `read`, `cat` without a file); detach each one found, or record "none"
- [x] **Not in the plan — found by the fix.** `--no-tools --no-session` on the same `pi -p` call: pi is an agent, and once stdin stopped truncating it, it *did* the task and wrote `sandboxes.md` into `~/app`, failing the next run's gate A. Gate D needs a billable call that reports cost, not tools

#### 3. Cookbook and PLAYBOOK

- [x] `fan_out_n.md` § "2. `SSSF_CONFIG` — the roster": replace the "does not take a config argument" block, the ssh workaround and the "cleaner alternative" paragraph with the real form `just sbx lifecycle execute "$ID" "$PROMPT" "adws/adw_sssf_config/<roster>" <adw>`. Keep the note that gate C sees the roster only when it's passed to `setup`
- [x] `fan_out_n.md` both loops: `just sbx lifecycle setup "$ID" "adws/adw_sssf_config/${ARMS[$i]}"`; the greenfield loop gets a `ROSTERS` array the same way
- [x] `fan_out_n.md` golden-VM "Costs" paragraph: exe.dev is a flat subscription with shared vCPU (Individual Small: 2 vCPU / 8 GB across all VMs), so an idle golden VM costs capacity and disk, not dollars; cross-arm wall clock isn't comparable when arms overlap
- [x] `debug_a_failed_gate.md`: short entry "FAIL then PASS in one gate block" → stdin detachment in the gate heredoc; check for a command reading stdin
- [x] `PLAYBOOK.md` §1 setup row: keep "6-assertion" (true again after the fix) and add "a gate block that prints FAIL but reports PASS is a bug — see debug_a_failed_gate"

#### 4. Prove and tear down

- [x] `just sbx lifecycle setup <id> /tmp/bad.config.yaml; echo rc=$?` **after** the fix — expect `FAIL  nonexistent/no-such-model`, then `[gate] FAIL` naming assertion C, a non-zero rc, **and** the gate D cost line and gate E credit lines printed (proof the script now runs to its end)
- [x] `just sbx lifecycle setup <id>; echo rc=$?` with the default roster — `C PASS`, `D PASS` with a `pi reports cost $…` line, `E PASS` with credit lines, rc 0. If `gpt-5.6-luna` is rate-limited again, that's a correct C failure: record it and re-run once
- [x] `just sbx lifecycle teardown <id>` — clean; key absent from the list

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `grep -n 'pi -p' just/sandbox/lifecycle/setup.just | grep -c '/dev/null'` — prints `1`. Check the pi call's continuation lines by eye: the redirect must attach to `pi`, not to `jq`
- [x] The before and after outputs of the bad-roster setup are both recorded in NEXTSTEPS, showing PASS→FAIL and the D/E lines appearing
- [x] `git grep -n 'does not take a config argument\|bills continuously' .claude/skills/sssf-sandbox-orchestrator/cookbooks/fan_out_n.md` — no output
- [x] `grep -n 'lifecycle setup' .claude/skills/sssf-sandbox-orchestrator/cookbooks/fan_out_n.md` — every hit passes a roster argument
- [x] `sandbox_mount/host/run_record.py get <gate-fix run id> closed_at` — non-empty

### Phase 2: Measure the teams, then teach the builder its tools

#### 1. Trace metrics

- [x] `sandbox_mount/host/trace_metrics.py <traces-dir> [--json]` (stdlib-only, like `run_record.py`). For every `sessions/<adw_id>/<agent>/raw_output.jsonl`: count `tool_execution_end` events by `toolName`, count `isError`, and classify error text as `schema` (`Validation failed for tool`), `not-found` (`Could not find the exact text`), `no-op` (`No changes made`) or `other`. Print one row per (adw_id, agent): calls, errors, rate, per-tool errors, per-kind errors. `--json` emits the same as a list of objects. Skip unparseable lines and count them in a trailing `skipped` field, never silently
- [x] `just sbx manage trace-metrics <run-id>`: runs the script on `.sandbox/traces/<run-id>/`; if the dir is missing, exit 1 with `run: just sbx manage traces <run-id>` (traces are pulled, never read live)

#### 2. Builder tool contracts

- [x] Add `## Tool contracts` to `adws/adw_data/prompt_engineering/builder/system.md`, no more than 8 bullets, each tied to an observed failure:
  - `edit` takes `path` **and** `edits: [{oldText, newText}]`; every call needs `path`, even for a file you just read
  - A tool error names its cause. `Validation failed for tool "edit": path …` means a missing argument, not an edit that was too large. Read the error and fix the call; don't shrink the edit
  - `oldText` must match the file byte-for-byte, and must be unique. After any edit to a file, re-`read` it before the next edit to the same region
  - Prefer `edit` for changes to an existing file; use `write` for new files or a deliberate full rewrite, not as a fallback after edit errors
  - Several changes to one file go in one `edit` call as multiple entries in `edits`
- [x] Confirm the edit tool's real argument names against pi's own schema before writing the bullets: the failing trace shows `edits[].oldText` and the missing `path` (`grep -m1 '"Validation failed for tool' <builder raw_output.jsonl>` shows the received arguments). Don't document a field name the trace doesn't show
- [x] Add the identical section to `.claude/skills/sssf/templates/prompt_engineering/builder/system.md`

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `just sbx manage trace-metrics gf-e2e-20260917-cbb166` — reproduces the baseline exactly: builder 128 calls / 20 errors (schema 18, not-found 1, no-op 1), planner 35 / 1, reviewer 60 / 0, test_designer 8 / 0
- [x] `just sbx manage trace-metrics no-such-run; test $? -eq 1` — missing traces handled with the hint
- [x] `uv run --with pydantic --with pyyaml --with python-dotenv --with rich python -c 'import sys; sys.path.insert(0,"adws"); from adw_modules import agents; c=agents.load_config("adws/adw_sssf_config/sssf.config.yaml"); agents.validate(c,[a.name for a in c.agents]); print("ok")'` — the prompt file still resolves and validates
- [x] `grep -c '^- ' adws/adw_data/prompt_engineering/builder/system.md` — at most 6 original bullets plus 8 new ones (the section stays short)
- [x] `diff <(sed -n '/^## Tool contracts/,$p' adws/adw_data/prompt_engineering/builder/system.md) <(sed -n '/^## Tool contracts/,$p' .claude/skills/sssf/templates/prompt_engineering/builder/system.md)` — no output

### Phase 3: A typecheck gate that type-checks, and a render smoke

#### 1. `quality.py`

- [x] `TSC_VERSION = "7.0.2"` beside `OXLINT_VERSION` (measured 2026-09-17 via `bun x --package typescript tsc --version`), with a comment that bumping it is a deliberate change, like oxlint
- [x] `typecheck(run)`: `argv=[BUN, "x", "--package", f"typescript@{TSC_VERSION}", "tsc", "--noEmit", "--skipLibCheck", "--strict", "false", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--allowImportingTsExtensions", "--lib", "es2022,dom,dom.iterable", ENTRY]`. Update the module docstring: "typecheck" is now real type-checking of the entry graph, non-strict, so undeclared names and wrong argument types fail. `build` keeps `bun build`
- [x] `run_verify(run, extra_files=None) -> QualityResult`: `[typecheck(run), tests(run, extra_files)]`, failures and artifacts collected exactly like `run_quality`. Keep `run_tests` unchanged for the chains that still use it
- [x] `bun x` writes a lockfile under the bun cache, not the repo. Confirm `git status --short` stays clean after a typecheck on the host and on a VM (on 2026-09-17 the host stayed clean)

#### 2. Chains

- [x] `adw_tdd_sdlc.py`: `test_{i}` and `retest` call `quality.run_verify(run, extra_files=both_suites)`; rename the phase descriptions to "Typecheck, then run fixed + generated suites". Update the docstring's `Phases:` line (`code(verify: typecheck + fixed + generated)`)
- [x] `adw_simple_sdlc.py`: the same at both call sites (lines ~101 and ~137), with no `extra_files`; docstring likewise
- [x] Do **not** change `adw_build_test.py` / `adw_plan_build_test.py` (not fan-out chains; recorded in Notes)

#### 3. Greenfield render smoke (the first deliberate pristine bump)

- [x] In `../greenfield-sandboxes`, rewrite `apps/app/app.test.ts` so a minimal document stub is installed at the top of the file, **before** any import of `./main.ts` (module scope runs once, and the first import wins). Stub: `globalThis.document = { getElementById: (id) => id === "app" ? appEl : null }`, where `appEl` is a plain object with `textContent: ""`. Keep the existing "module graph loads" test and add "renders into #app on import", asserting `appEl.textContent !== ""`. A header comment tells agents: the stub is the render smoke; when the UI grows (`createElement`, SVG, events), extend the stub so this test keeps executing the real render path. Never delete it to make the suite pass
- [x] `bun test apps/app/app.test.ts` in the checkout — 2 pass
- [x] Commit in the checkout: `shell: render smoke — the fixed suite executes main.ts's render path`
- [x] Confirm the guard fires first: `just target sync greenfield --dry-run; echo $?` → `5`, naming `apps/app/app.test.ts`
- [x] Bump `target.pristine` in `targets/greenfield.yaml` to that commit's full sha, with a dated comment line saying why
- [x] `just target sync greenfield --dry-run; echo $?` → `0`

#### Validation — Phase 3

> **Loop gate.** Do not start Phase 4 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] Fixture — undeclared name: in a scratch worktree of `refs/sandbox/gf-e2e-20260917-cbb166` (`git -C ../greenfield-sandboxes worktree add $SCRATCH/wt refs/sandbox/gf-e2e-20260917-cbb166`), `sed` `String(keys[i].signature.count)` → `String(idx)` in `apps/app/ui/circle-wheel.ts`, then run the exact `typecheck` argv from `quality.py` → non-zero, output contains `TS2304: Cannot find name 'idx'`; `bun build --target=browser apps/app/main.ts --outdir $SCRATCH/b` → exit 0 (proves the old gate would have passed it). Remove the worktree
- [x] Fixture — clean shell: the typecheck argv run in `../greenfield-sandboxes` → exit 0
- [x] Default target: the typecheck argv run in this repo (entry `apps/fretboard/main.ts`) → exit 0
- [x] `uv run adws/adw_quality.py "typecheck gate smoke"` on the host is **not** run (Hard rule: never run ADWs on the host). Instead: `uv run --with pydantic --with pyyaml python -c 'import sys; sys.path.insert(0,"adws"); from adw_modules import quality; print(quality.TSC_VERSION, hasattr(quality,"run_verify"))'` → `7.0.2 True`
- [x] `grep -n 'run_verify' adws/adw_tdd_sdlc.py adws/adw_simple_sdlc.py` — 2 hits in each; `grep -n 'run_tests' adws/adw_tdd_sdlc.py adws/adw_simple_sdlc.py` — none
- [x] `just target show greenfield | grep 'pristine: ok'` — guard passes on the bumped sha
- [x] `git -C ../greenfield-sandboxes status --short` — empty

### Phase 4: Keep rejected work — `just sbx manage snapshot`

#### 1. Guest script

- [x] `sandbox_mount/guest/snapshot_run_branch.sh <repo-dir> <run-id> [reason]` (bash, `set -euo pipefail`):
  - `cd <repo-dir>`; refuse (exit 2) unless `git symbolic-ref --short HEAD` is exactly `sbx/<run-id>`. It must never commit to `main` or a detached HEAD
  - if `git status --porcelain` is empty: print `CLEAN` and exit 0
  - `git add -A`; commit with author `sssf-snapshot <sssf-snapshot@localhost>` and subject `UNAPPROVED snapshot: <reason or "uncommitted work at snapshot time">`; the body lists `git diff --cached --stat` and the newest `adws/adw_data/sessions/*/` adw_id, if any
  - print `OK <sha> <files-changed>`
- [x] It must not commit `.env` or anything gitignored. **Beyond the plan:** the script also *asserts* it — if `.env` stages, it refuses (exit 1) and unstages, because that file holds the live runtime key
- [x] It must not commit `.env` or anything gitignored. `git add -A` honors `.gitignore`; confirm `app/.env` is ignored in both repos' `.gitignore` (this repo and greenfield) before relying on it

#### 2. Recipe and teardown hint

- [x] `just/sandbox/manage/snapshot.just`: `snapshot RUN_ID *REASON`. Reads `vm_name` from the record, pipes the script over ssh (`ssh "${SSH_OPTS[@]}" "$VM".exe.xyz bash -s -- app "$RUN_ID" "$REASON" < sandbox_mount/guest/snapshot_run_branch.sh`) so the VM's factory version doesn't matter, then maps `CLEAN` / `OK …` / exit 2 to messages. On `OK`, print `next: just sbx manage harvest <run-id>`
- [x] Wire it into `just/sandbox/manage/mod.just` the same way `traces.just` is imported
- [x] `teardown.just`: the dirty-tree refusal adds `or keep it: just sbx manage snapshot <run-id> "<why>"` above the existing `--force-dirty` line

#### Validation — Phase 4

> **Loop gate.** Do not start Phase 5 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] Local, no VM: `git init $SCRATCH/snap && cd $SCRATCH/snap && git commit --allow-empty -m base && git switch -c sbx/t-000000 && echo x > f.ts` then `bash sandbox_mount/guest/snapshot_run_branch.sh $SCRATCH/snap t-000000 "review_2 rejected"` → `OK <sha> 1`, and `git -C $SCRATCH/snap log -1 --format=%s` starts with `UNAPPROVED snapshot: review_2 rejected`
- [x] Same repo, run again with a clean tree → `CLEAN`, exit 0, no new commit
- [x] Wrong branch: `git -C $SCRATCH/snap switch -q main 2>/dev/null || git -C $SCRATCH/snap switch -q -c main HEAD~1; echo y > g.ts` then the script → exit 2, no commit on main
- [x] Ignored files stay out: add `.env` to the scratch repo's `.gitignore`, create `.env`, snapshot → `.env` is not in `git show --stat HEAD`
- [x] `just --show sbx::manage::snapshot` parses; `grep -n 'manage snapshot' just/sandbox/lifecycle/teardown.just` — one hit
- [ ] Live use is proven in Phase 5 on any arm review rejects

### Phase 5: The judged greenfield fan-out (live — needs the user's go-ahead)

N=4, TDD chain, one pin, same prompt (`prompts/greenfield.md`, unchanged since 2026-08-28, so the
2026-08-28 scores are a fair control). This needs the user's explicit go-ahead: it pushes a sync, mints
4 keys and boots 4 VMs.

| arm | roster | planner | builder | reviewer | question it answers |
|---|---|---|---|---|---|
| gf2-1, gf2-2 | `sssf.config.yaml` | gemini-3.8-flash | deepseek-v4-flash | glm-5.3 | did the factory improvements (Phases 1–4) help? two arms show the spread within one setup |
| gf2-3 | `sssf.asymmetric.config.yaml` | **opus-5** | deepseek-v4-flash | **opus-5** | does frontier plan + review lift a flash builder? |
| gf2-4 | `sssf.inverse.config.yaml` | gemini-3.8-flash | **kimi-k3** | glm-5.3 | does a frontier builder carry a flash plan + review? |

#### 1. Prepare

- [ ] `wip` Commit Phases 1–4 in this repo, then `just target sync greenfield --dry-run` (expect the builder prompt, `quality.py`, both chains, setup, snapshot, trace-metrics as changes; pristine ok; zero leaks; gates green), then `just target sync greenfield --push` **with approval**. Record `PIN=target_sha`
- [x] `adws/adw_sssf_config/sssf.asymmetric.config.yaml`: copy of `sssf.config.yaml` with the `planner` and `reviewer` agents' `model:` set to `openrouter/anthropic/claude-opus-5`; header comment "the 2026-08-28 judge's designed next experiment: frontier plan + review, flash build". It must be committed **before** the sync above, so it ships to the VMs. `agents.validate` passes on the host, and `grep -n 'claude-opus-5' sandbox_mount/guest/models.json.tmpl` shows opus-5 is registered with four cost fields
- [x] `adws/adw_sssf_config/sssf.inverse.config.yaml`: copy of `sssf.config.yaml` with the `builder` agent's `model:` set to `openrouter/moonshotai/kimi-k3`; header comment "inverse of asymmetric: flash plan + review, frontier builder (2026-09-17 hypothesis: a good plan still misses when the builder is weak)". Committed before the sync; `agents.validate` passes; `grep -n 'moonshotai/kimi-k3' sandbox_mount/guest/models.json.tmpl` shows it registered with four cost fields
- [ ] Budget check before mounting: read rates from `models.json.tmpl` (on 2026-09-17: opus-5 5.0/25.0, kimi-k3 3.0/15.0 per M). The builder role consumed 12.0M tokens on 2026-09-17, so it's the expensive seat. Limits: default arms `--limit 10`, asymmetric `--limit 25`, inverse `--limit 30`. State all four limits to the user in the go-ahead request
- [ ] Capacity: the account has 2 shared vCPU across all VMs. Mount arms **one at a time** (provision and `bun install` are CPU-bound), and record in the scorecard that wall clock across concurrent arms isn't comparable. With four arms, consider starting executes in two waves (arms 1+3, then 2+4 once the first wave's builds finish) so no more than two builders run `bun test` at once; record which wave each arm was in

#### 2. Run

- [ ] For `i` in 1..4 (`ROSTER` = `sssf.config.yaml`, `sssf.config.yaml`, `sssf.asymmetric.config.yaml`, `sssf.inverse.config.yaml`): `ID=$(sandbox_mount/host/run_record.py new-id gf2-$i)`; `just sbx lifecycle create "$ID" --target greenfield --limit <limit>`; `fill "$ID" "$PIN"`; `setup "$ID" "adws/adw_sssf_config/$ROSTER"` (gate C now really pings that roster); `observe "$ID"`. Confirm `pin from last sync` / gate-A sha equals `PIN` for all four
- [ ] Execute all four: `just sbx lifecycle execute "$ID" prompts/greenfield.md "adws/adw_sssf_config/$ROSTER" tdd` (in waves, per the capacity task). Watch with `just sbx run cmd "$ID" 'tail -5 run.log'`, and wait for all four to exit (a background poll on each recorded pid)
- [ ] Per arm, after it exits: `just sbx lifecycle refresh "$ID"`; if `git status --porcelain` on the VM is non-empty, `just sbx manage snapshot "$ID" "<chain outcome, e.g. review_2 rejected: 20/23>"`; then `just sbx manage harvest "$ID"` and `just sbx manage traces "$ID"`
- [ ] Before teardown, screenshot each arm's review URL (home plus the two most important views), as `specs/greenfield-judge/` did. Record per-arm billed spend with `just sbx manage list` after teardown writes it

#### 3. Judge

- [ ] Host-side judge per arm, one at a time, in a scratch worktree of `refs/sandbox/<id>` in the greenfield checkout, with `specs/greenfield-cof-experiment.md` § Hidden rubric in its context. The rubric never enters a VM or `prompts/`
- [ ] Score columns per arm in `specs/greenfield-fanout-2-results.md`: rubric /20 (with per-item scores and one-line justifications) · chain outcome (accepted, or rejected at review N with requirements met/total) · `TestDesignOutput.cases[].requirement` coverage (cross-graded, per the 2026-08-27 lesson: generated suites over-spec) · typecheck exit and error count on the final tree · builder tool-error rate and `edit` schema failures (`trace-metrics`) · tokens · trace cost · **billed spend** (run record) · roster · wall clock (flagged non-comparable)
- [ ] A "vs control" table: 2026-08-28 gf-1/2/3 rubric scores (15 / 9 / 19) beside this run's four, plus the baseline builder tool-error figures (18 schema failures, 16% rate) beside the two default arms' figures
- [ ] Verdicts, one line each, on the five hypotheses: (H1) the builder tool contract cuts schema failures to ≤3; (H2) the tsc gate catches at least one real defect during a fix loop (grep each arm's `run.log` for `typecheck` failures); (H3) the render smoke surfaces a render crash before review, or its stub was extended rather than deleted; (H4) the asymmetric arm's rubric score beats both default arms by more than the default arms differ from each other, and at what cost ratio; (H5) the inverse arm's rubric score beats both default arms by more than their spread, and how it ranks against the asymmetric arm, i.e. which seat (plan+review vs build) buys more score per dollar. Also compare the inverse arm's builder tool-error rate against the default arms' (kimi-k3 with vs deepseek-flash with the same tool contract)

#### 4. Close

- [ ] Tear down all four: `just sbx lifecycle teardown "$ID"` (each clean; keys absent)
- [ ] `NEXTSTEPS.md` dated entry: the scorecard summary, the five verdicts, and anything that broke

#### Validation — Phase 5

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] `for id in <4 ids>; do sandbox_mount/host/run_record.py get $id target; sandbox_mount/host/run_record.py get $id commit_sha; done` — `greenfield` ×4, and all four shas equal `PIN`
- [ ] `for id in <4 ids>; do git -C ../greenfield-sandboxes rev-parse --verify -q refs/sandbox/$id; done` — four shas (every arm came home, rejected ones via snapshot)
- [ ] `for id in <4 ids>; do just sbx manage trace-metrics $id; done` — a row for every agent in every arm
- [ ] `specs/greenfield-fanout-2-results.md` exists with all columns filled for four arms, the vs-control table, and five verdicts
- [ ] `git grep -n -i 'hidden rubric\|/20' -- ../greenfield-sandboxes 2>/dev/null; git -C ../greenfield-sandboxes grep -n -i 'rubric' -- prompts` — no output (the rubric never left this repo)
- [ ] `for id in <4 ids>; do sandbox_mount/host/run_record.py get $id closed_at; done` — four timestamps; `just target show greenfield | grep 'pristine: ok'`

## Global Validation

- [ ] `just sbx manage doctor` — `sbx doctor: OK`
- [ ] `uv run adws/adw_modules/manifest.py get source.repo` — default target unchanged (fretboard)
- [ ] `just target sync greenfield --dry-run` — exit 0, `pristine: ok`, zero leaks, gates green, nothing to commit
- [ ] `git -C ../greenfield-sandboxes status --short` and `git status --short` — both empty
- [ ] `sandbox_mount/host/run_record.py list | python3 -c 'import json,sys; o=[r["run_id"] for r in json.load(sys.stdin) if not r.get("closed_at") and r["run_id"].startswith(("gate-fix","gf2-"))]; print(o); assert not o'` — no VM from this plan left open
- [ ] `grep -cE '^\s*- \[ \]' specs/fanout-readiness-and-team-quality.md` — 0, or only `fail`-marked items with reasons

## Notes

### Why snapshot is a recipe and not a chain change

The outline asked for "the TDD chain commits unapproved builds". The plan diverges on purpose:

- **The chain's current behavior is a documented design choice.** `adw_tdd_sdlc.py`'s docstring says a
  rejected run leaves plan and red suite committed and code dirty, "exactly where a human picks TDD back
  up". Committing rejected code on the run branch would make "the latest commit is approved" untrue.
- **A/B symmetry.** `adw_simple_sdlc.py` is the control group. Changing commit semantics in one chain
  and not the other would make arms harvest differently. Changing both touches the control.
- **It covers more than rejection.** A chain that crashes, times out or is killed also leaves a dirty
  tree. A host recipe covers every case; a chain branch covers one.
- **It's explicit.** The subject prefix `UNAPPROVED snapshot:` and a distinct author make a snapshot
  impossible to mistake for an approved build in `git log`.
- **Cost:** one extra command per rejected arm in the fan-out loop, and it's in the cookbook.

If Phase 5 shows people forgetting it, revisit: have teardown offer to snapshot instead of refusing.

### Typecheck: measured choices

| Choice | Measured | Decision |
|---|---|---|
| strict vs non-strict | harvested app: strict 17 errors, non-strict 15 | **non-strict**. The two strict-only errors (`possibly null`, `implicit any`) are style, not crashes. Fix loops are bounded (`MAX_FIX_LOOPS = 3`) and shouldn't be spent on them |
| entry-graph vs all files | tests import `bun:test`, which needs bun types | **entry graph only** (`tsc … ENTRY`). Test files aren't type-checked; `bun test` runs them |
| still noisy? | 13 of 15 non-strict errors are TS2345 number→string argument mismatches (e.g. `setAttribute("r", 10)`) | Accept. They're real type errors with one-line fixes, and the fix loop gets tsc's verbatim output. **Risk:** a first build with 15+ such errors could spend a fix loop on them. Watch H2 in Phase 5. If a fix loop is consumed purely by TS2345, consider `--noImplicitAny false`-style relaxations or a gate that fails only on TS2304/TS2552 (undeclared names) |
| fretboard | non-strict exit 0 | default target unaffected |
| pinning | tsc 7.0.2 via `bun x --package typescript@7.0.2` | pinned like oxlint; network on first use per VM (seconds) |

The render smoke is the complement, not a duplicate. tsc catches names and types. The smoke catches
things that type-check but throw at render (the 2026-09-17 "Minor Rock Journey" preset crash was a
logic error tsc can't see).

### The render smoke's weakness, and its kill criterion

A hand-rolled document stub only exercises what it implements. As the app grows, agents must extend it
or the test goes vacuous, and a lazy agent might delete it. The header comment forbids deletion, and
the judge checks H3. **Kill criterion:** if half or more of the Phase 5 arms spend a fix or revise loop
primarily on maintaining the stub, drop the smoke test (another pristine bump) and rely on tsc plus the
reviewer. Rejected alternative: `happy-dom` as a dev dependency. It needs a `package.json` and
`bun install` in a repo whose shell promises "no frameworks", changes provisioning for greenfield only,
and bumps pristine for a much larger surface.

### Why these four arms

- **Two default arms, not one:** the 2026-08-28 control showed 9-to-19 spread on one roster. One arm per
  condition can't separate a factory improvement from sampling noise; two default arms give at least a
  within-condition spread to compare against.
- **Asymmetric, not frontier:** the frontier roster puts kimi-k3 on the builder, so it changes the
  builder and the reviewer at once. The asymmetric roster keeps the flash builder (the one whose tool
  errors Phase 2 targets) and changes only plan and review, the lever the 2026-08-28 judge identified
  ("the reviewer is the product").
- **Inverse, added 2026-09-17:** re-reading the gf-e2e plan
  (`.sandbox/runs/gf-e2e-20260917-cbb166-artifacts/specs/474f412f_circle-of-fifths-guitar.md`), the plan
  was good: 23 concrete requirements, all checkable. The build still shipped a render crash and spent
  most of its time fighting `edit`. Asymmetric and inverse move opposite seats, so together they show
  whether the marginal dollar belongs on plan+review or on the builder. Kimi-k3 is the frontier
  roster's builder, so the builder seat is changed the way the frontier roster already changes it.
- **Confound to record, not fix:** the inverse arm changes the builder model **and** runs Phase 2's tool
  contract on a different model. Its tool-error rate is reported but not attributed to the contract.
- **N=4, not 5:** 2 shared vCPU. The five-roster run on 2026-08-22 had arms contending for CPU, which
  muddied wall clock and possibly a mount failure.

### What this plan doesn't do

- **No change to `adw_build_test.py` / `adw_plan_build_test.py`.** They aren't fan-out chains. Switching
  them to `run_verify` is a one-line follow-up if the gate proves itself.
- **No judge automation.** Judging stays a host-side agent pass per arm with the rubric in context, as on
  2026-08-28. Automating it (an ADW that scores `refs/sandbox/*`) is worth doing only after a second
  scorecard shows the rubric is stable.
- **No reviewer or test-designer prompt changes.** Their tool-error rates were 0%. If Phase 5 shows
  different, extend Phase 2's contract to them.
- **No pristine guard for the default target.** Fretboard runs merge by design.

### Risks

- **Phase 1's hypothesis could be wrong.** The mechanism check (task 1.2) is ordered before the fix so
  a wrong diagnosis stops the phase instead of shipping a no-op change that looks right.
- **Kimi-k3 on the builder seat is the priciest arm.** 12.0M builder tokens at 3.0/15.0 per M (cache
  reads cheaper) could reach tens of dollars; `--limit 30` is the hard stop. NEXTSTEPS 2026-09-15 also
  flags a dropped maxTokens floor for kimi-k3 via one provider (16384 vs the registry's 65535). A
  builder `write` of a large file could truncate. If the inverse arm's trace shows truncated writes,
  note it as a provider limit, not a model verdict.
- **Opus-5 cost on the asymmetric arm.** The planner used 1–2M tokens and the reviewer 0.75–1M per round
  on 2026-09-17 with flash models. At frontier rates that could be tens of dollars. The `--limit 25` key
  cap is the hard stop, and the go-ahead request states it. If the key exhausts mid-run, the arm is
  scored as-is and noted.
- **tsc on a VM needs npm registry egress** for the first `bun x`. Oxlint already does the same, so this
  path is proven; if it fails, the gate reports exit 127-style output rather than passing.
- **The sync pushes this plan's factory changes to a public repo.** Nothing here names the host app
  (the leak scan runs), but the builder prompt and tsc gate become visible there. That's intended.

## Amendments

<details>
<summary>2026-09-17T06:22:53-07:00 — Phase 5 grows to N=4: added the inverse arm (flash plan + review, kimi-k3 builder)</summary>

Ron's read of the gf-e2e-20260917-cbb166 plan: a team can have a good plan and still miss if the builder
is weak. The asymmetric arm tests the opposite seat (frontier plan + review). The inverse arm makes the
pair a controlled contrast. Changes: new `sssf.inverse.config.yaml`; the arm table; limits (inverse
`--limit 30`); a two-wave execute option for 2 shared vCPU; H5; every N=3 reference in Phase 5 and its
validation now N=4; Notes gained the rationale, the tool-contract confound, and the kimi-k3
cost/maxTokens risk. Phases 1–4 unchanged.
</details>
