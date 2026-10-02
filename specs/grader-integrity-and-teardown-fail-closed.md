---
plan: grader-integrity-and-teardown-fail-closed
created: 2026-10-02T14:15:53-07:00
modified:
  - 2026-10-02T14:15:53-07:00
  - 2026-10-02T14:52:00-07:00
commits:
  - d432f8c
  - 50c11a0
agents:
  - claude-opus-5-5
sessions:
  - 287ef91c-3816-4441-a002-7d055b9f0ecd
back_refs: []
forward_refs:
  - specs/suite-changes-to-reviewer.md — the replacement for the reverted suites_protected lock
status: complete
---

# Plan: Grader integrity and fail-closed teardown

## Purpose

Fix the two trust defects at the top of the 2026-10-02 adversarial review
([review doc](https://claude.ai/code/artifact/6f58443e-d65d-4201-baaf-08d0543f1031), items 1 and 2):

- **Grader integrity.** No agent may change the inputs that judge it: the prompt sets, the harness and the test suites.
- **Fail-closed teardown and reap.** An unknown answer from the VM control plane or from ssh must stop the teardown, never count as "gone" or "clean". Agent traces must be on the host before the key dies.

Both are invariants, not coaching, so they belong in the harness permanently.

## Problem

**1. The graded agents can write the grader's inputs.** `adws/adw_modules/permissions.py:142-150` checks `always_writable(cfg)` first. That is the whole `data_dir` (`adws/adw_data/`), checked before `protected_files`. `data_dir` also holds tracked files:

- `prompt_engineering/`
- `prompt_engineering_team/`
- `harness_engineering/bash_timeout.ts`
- `harness_engineering/subagents.ts`
- `fixtures/`

The test suites are not protected at all. An offline probe against `sssf.team.config.yaml` at d432f8c reproduced all three holes:

```
adws/adw_data/prompt_engineering_team/reviewer/system.md  reviewer True   builder True
apps/fretboard/fretboard.test.ts                           reviewer False  builder True
apps/fretboard/tests/generated/x.test.ts                   reviewer False  builder True
```

The prompts are re-read on every call, so a prompt edit made during `revise_1` drives `review_2`. `commit_all` (`git add -A`) then commits it. The only "fixed suite untouched" check runs once, in `tests_red` at test-design time (`gates.py:244`). That check is the only thing behind the docstrings at `gates.py:146,218`, which say the suite "is not its file to edit".

**2. Teardown and reap treat a failed check as a pass.**

- `just/sandbox/lifecycle/teardown.just:71`: if `exe.dev ls` fails, the recipe substitutes `{"vms":[]}` and sets `VM_ALIVE=0`. Teardown then skips artifacts (:110), harvest (:149) and the dirty check (:168). It still revokes the key (:193), closes the record (:211) and prints "✓ teardown complete". The result is a live VM with unharvested work, a dead key and a closed record that hides it.
- `teardown.just:169`: if ssh fails, `DIRTY=$(… || true)` is empty, the tree reads as clean, and the VM is destroyed.
- `teardown.just:127`: the tar list omits `adws/adw_data/sessions/`, which holds the `raw_output.jsonl` traces with the generation ids used for cost reconciliation. That directory is gitignored, so it is not in the bundle either. It survives only if someone remembers `just sbx manage traces`. Claude Code transcripts from `sbx run agent` (`~/.claude/projects` on the VM) are never pulled.
- `just/sandbox/manage/reap.just:45`: same `ls` fallback. One blip classes every open run as "vm no longer exists" (:79-80), and `--yes` revokes their keys mid-run.
- `manage/list.just:20-24` already states the rule all of this breaks: "unknown is distinct from gone".

## Solution

### Item 1: enforce in `permitted()`, for every roster

Two derived lists, computed in code rather than YAML, so all six rosters and any future one inherit them.

```python
def always_writable(cfg) -> list[str]:
    # The session runtime only: the per-run sessions/ tree. NOT the rest of
    # data_dir, which holds the tracked prompt sets and harness extensions.
    return [cfg.defaults.data_dir.rstrip("/") + "/sessions/"]

def never_writable(cfg) -> list[str]:
    # The rest of data_dir: what every agent is judged BY. No `writes` entry unlocks it.
    return [cfg.defaults.data_dir.rstrip("/") + "/"]

def suites_protected() -> list[str]:
    # The graded suites, from the manifest so an app swap carries them.
    # Unlockable by naming: test_designer's `apps/*/tests/generated/**` still writes its lane.
    app = load_manifest().app
    return [app.test_file, app.generated_tests_dir.rstrip("/") + "/"]

def permitted(path, agent, cfg) -> bool:
    if any(_matches(path, p) for p in always_writable(cfg)):
        return True                                    # own session runtime
    if any(_matches(path, p) for p in never_writable(cfg)):
        return False                                   # grader inputs: no exceptions
    if any(_matches(path, p) for p in (agent.writes or [])):
        return True                                    # naming unlocks a protected path
    if any(_matches(path, p) for p in cfg.defaults.protected_files + suites_protected()):
        return False
    return agent.writes is None
```

How this lands in practice:

- **Breaches are prevented, not just detected.** `enforce()` already rolls back out-of-scope writes. A builder that edits the suite after `commit_tests` gets it checked back out. With ≤3 such paths the run continues loudly (`RECOVERED_LIMIT`); with more, it aborts with `PermissionBreach`.
- **No separate post-build diff gate is needed.** The review proposed one; it would duplicate this enforcement.
- **`never_writable` comes before `writes` on purpose.** The documenter's `writes: ["**/*.md"]` matches `adws/adw_data/prompt_engineering_team/**/system.md`. If `writes` were checked first, the documenter could still rewrite every prompt.

**Decision: this applies to the control (`tdd`) arm too.** The control's prompts stay frozen (`just/adws.just:74-76`). What changes is shared harness enforcement, which is an invariant. A control that can tamper with its own grader is a broken control, not a frozen one. The change is recorded in CHANGELOG, together with what the retro audit (Phase 3) found about past runs.

### Item 2: unknown aborts; traces before revoke

| Probe | Today | After |
|---|---|---|
| `exe.dev ls` in teardown | failure → `{"vms":[]}` → "gone" | failure or unparseable → abort before anything changes |
| `exe.dev ls` in reap | failure → every run "orphaned" | failure → refuse (dry run and `--yes`) |
| dirty tree | ssh failure → empty → "clean" | remote prints `SBX_TREE_OK` last; anything else aborts |
| traces | separate manual recipe | teardown step 2b calls `manage traces`, which aborts on failure; `--no-traces` is the deliberate skip |
| `run agent` transcripts | never pulled | `manage traces` also pulls `~/.claude/projects` when present |

`manage traces` gets the same sentinel treatment, because a bare `run agent` VM has no `adws/adw_data/sessions/`. A missing directory there is normal, while an ssh failure must abort. One probe ssh reports what exists, then rsync pulls only that:

```bash
PROBE=$(ssh $SSH_OPTS "$VM.exe.xyz" '[ -d app/adws/adw_data/sessions ] && echo sessions;
  ls app/adws/adw_data/sssf.db >/dev/null 2>&1 && echo db; [ -d .claude/projects ] && echo claude;
  echo SBX_PROBE_OK' < /dev/null) || { echo "!! traces: could not reach $VM"; exit 1; }
[ "$(printf '%s\n' "$PROBE" | tail -n1)" = SBX_PROBE_OK ] || { echo "!! traces: probe incomplete"; exit 1; }
```

Verification is offline. A `PATH`-prepended shim for `ssh`, `curl` and `rsync` drives each failure path and asserts that no `DELETE` ever reaches the key API. Proving fail-closed needs no VM. A live check is optional (Phase 3).

## Relevant Files

### Existing — modified

- `adws/adw_modules/`
  - `permissions.py`: narrow `always_writable` to `sessions/`; add `never_writable` and `suites_protected`; reorder `permitted()`; update the module docstring and the `always_writable` docstring
  - `data_types.py`: the comment on `ConfigDefaults.protected_files` (:389-391) notes the derived lists that are always added to it
  - `gates.py`: the docstrings at :146 and :218 now describe enforced fact; the `tests_red` "fixed suite untouched" check stays (it catches the test_designer, which `suites_protected` now also blocks)
- `just/sandbox/lifecycle/`
  - `teardown.just`: the `ls` failure aborts (:71); a parse failure aborts (:72-73); new step 2b traces with `--no-traces`; `SBX_TREE_OK` sentinel (:169); header comment lists the new order and flag
- `just/sandbox/manage/`
  - `reap.just`: the `ls` failure refuses (:45)
  - `traces.just`: probe sentinel; pull `~/.claude/projects` to `.sandbox/traces/<id>/claude-projects/` (no `--delete`)
- `.claude/skills/sssf-sandbox-orchestrator/`
  - `SKILL.md`: teardown flags gain `--no-traces`; teardown now pulls traces
  - `references/phases.md`: same
- `./`
  - `CHANGELOG.md`: dated entry with the results (feedback rule: results go here)
  - `NEXTSTEPS.md`: remove items 1–2 from the open queue if listed; add nothing that is done

### New

- `adws/adw_modules/`
  - `permissions_selftest.py`: offline matrix of `permitted()` over every roster in `adws/adw_sssf_config/`; exit 1 on any wrong cell
- `sandbox_mount/host/`
  - `teardown_selftest.sh`: shim-driven teardown/reap failure-path test; exit 0 only if every case behaves

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

| Phase | Purpose | Done when | Status |
|---|---|---|---|
| [1. Grader integrity](#phase-1-grader-integrity) | No agent can write prompts, harness or graded suites | selftest red at d432f8c, green after, on all 6 rosters | `complete` |
| [2. Fail-closed teardown and reap](#phase-2-fail-closed-teardown-and-reap) | Unknown aborts; traces pulled before revoke | shim selftest: every failure case aborts with no DELETE; happy path completes | `complete` |
| [3. Audit and record](#phase-3-audit-and-record) | Know whether past runs were tainted; write it down | retro audit run over all bundles; CHANGELOG entry committed | `complete` |

### Phase 1: Grader integrity

Write the selftest first, and watch it fail on the current code before fixing anything.

#### 1. Selftest (red first)

- [x] Create `adws/adw_modules/permissions_selftest.py`. For each `adws/adw_sssf_config/*.yaml`, load `SSSFConfig(**yaml.safe_load(...))` and assert this matrix for every agent in it. A `test_designer` exists in the team and tdd rosters; skip rows for agents a roster doesn't have.

  | Path | builder | reviewer | test_designer | documenter | planner |
  |---|---|---|---|---|---|
  | `adws/adw_data/sessions/x/context_handoff/review.md` | ✓ | ✓ | ✓ | ✓ | ✓ |
  | `adws/adw_data/prompt_engineering_team/reviewer/system.md` | ✗ | ✗ | ✗ | ✗ | ✗ |
  | `adws/adw_data/prompt_engineering/builder/system.md` | ✗ | ✗ | ✗ | ✗ | ✗ |
  | `adws/adw_data/harness_engineering/bash_timeout.ts` | ✗ | ✗ | ✗ | ✗ | ✗ |
  | `<manifest test_file>` | ✗ | ✗ | ✗ | ✗ | ✗ |
  | `<manifest generated_tests_dir>/x.test.ts` | ✗ | ✗ | ✓ | ✗ | ✗ |
  | `<manifest app dir>/main.ts` | ✓ | ✗ | ✗ | ✗ | ✗ |
  | `specs/x.md` | ✓ | ✗ | ✗ | ✓ | ✓ |
  | `adws/adw_modules/gates.py` | ✗ | ✗ | ✗ | ✗ | ✗ |

  The last three rows are regression rows: they must hold before and after. Print one line per failing cell, exit 1 if any fail, and print `permissions selftest: N cells OK` on success. Paths come from `manifest.load()`, not literals, so an app swap keeps the test valid. Where a roster's writes legitimately differ from the table (for example a documenter without `specs/`), make the expectation read that agent's `writes`, not a hard-coded ✓.
- [x] Run it at d432f8c and confirm it fails on the prompt, harness and suite rows. Paste the failing-cell count into the CHANGELOG draft. → 156 of 340 cells WRONG (4 adw_data rows × 34 agents; fixed suite + generated lane × 10 `writes: None` agents).

#### 2. Fix `permitted()`

- [x] In `permissions.py`, implement `always_writable` → `data_dir/sessions/`, and add `never_writable` and `suites_protected` with the order shown in Solution. Import `load as load_manifest` from `.manifest`, as `quality.py:33` does. → built; `suites_protected` later REVERTED on the Phase 3 audit (see Amendments). Shipped: `never_writable` only.
- [x] Rewrite the `always_writable` docstring. Its premise ("the runtime is normally ignored") is exactly why narrowing is safe: `sessions/` and `sssf.db*` are gitignored (`.gitignore:151,155`), so nothing else in `data_dir` is legitimately written during a phase.
- [x] Add one paragraph to the module docstring on the two tiers: never writable (grader inputs) and protected-unless-named (the suites, the factory code).
- [x] Update the `data_types.py:389-391` comment and the `gates.py:146,218` docstrings. → data_types updated; gates.py docstrings already state the rule, now enforced — left unchanged.

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `uv run --with pydantic --with pyyaml python -m adws.adw_modules.permissions_selftest` exits 1 at d432f8c (`git stash` the fix, or run against `git worktree add /tmp/… d432f8c`): proves the test sees the hole
- [x] Same command exits 0 after the fix: proves the hole is closed on every roster
- [x] `uv run --with pydantic --with pyyaml python -c "from adws.adw_modules import permissions"` succeeds: no import cycle from the manifest import
- [x] `just --list adw` and `git diff --stat` show no change to `adws/adw_data/prompt_engineering*/` or any roster YAML: the control prompts and rosters are untouched

### Phase 2: Fail-closed teardown and reap

Selftest first, with the same red-then-green discipline.

#### 1. Shim selftest

- [x] Create `sandbox_mount/host/teardown_selftest.sh` (bash, `set -euo pipefail`, in the style of `sandbox_mount/guest/app_proxy_selftest.sh`):
  - `T=$(mktemp -d)` holds `bin/ssh`, `bin/curl`, `bin/rsync`, `calls.log` and `trap cleanup EXIT`.
  - Each shim appends its argv to `$T/calls.log`, with any `Bearer …` token redacted to `Bearer ***`, and behaves per `$FAKE_MODE`:
    - `ssh … exe.dev ls --json`: `ls-fail` exits 255; `ls-garbage` prints `not json`; otherwise prints `{"vms":[{"vm_name":"$FAKE_VM"}]}`.
    - `ssh … exe.dev rm`: exits 0.
    - `ssh … <vm>.exe.xyz <cmd>`: the trace probe prints `SBX_PROBE_OK` (exits 255 in `traces-fail`). The dirty check prints `SBX_TREE_OK` (exits 255 in `dirty-fail`; prints ` M x\nSBX_TREE_OK` in `dirty-real`). Anything else exits 0 with no output.
    - `curl`: on `-X DELETE`, print `204`. On a URL ending `/keys`, print `{"data":[]}`, or for reap a fixture holding one `sbx-selftest-…` key with the record's hash. On a URL ending `/key`, print `{"data":{"usage":0.01}}`.
    - `rsync`: exits 0 and `mkdir -p`s its last argument.
  - For each case, create a throwaway record with `sandbox_mount/host/run_record.py create selftest-td-$RANDOM`, then `set … vm_name=$FAKE_VM key_hash=deadbeef`. Write a dummy `.sandbox/runs/<id>.key`. Run `PATH="$T/bin:$PATH" OPENROUTER_PROVISIONING_KEY=dummy just sbx lifecycle teardown <id> --no-harvest`. Cleanup removes the record file (`run_record.py path <id>`), `.sandbox/runs/<id>-artifacts` and `.sandbox/traces/<id>`.
  - Assertions per case:

    | `FAKE_MODE` | expect exit | `DELETE` in calls.log | record closed |
    |---|---|---|---|
    | `ls-fail` | ≠0 | no | no |
    | `ls-garbage` | ≠0 | no | no |
    | `traces-fail` | ≠0 | no | no |
    | `dirty-fail` | ≠0 | no | no |
    | `dirty-real` | ≠0 | no | no |
    | `happy` | 0 | yes | yes |
    | `reap ls-fail` (`just sbx manage reap --yes`, open record) | ≠0 | no | — |

  - Print one `PASS`/`FAIL` line per case, and exit 1 on any `FAIL`.
- [x] Run it at d432f8c. Expect `ls-fail`, `ls-garbage`, `dirty-fail` and `reap ls-fail` to FAIL, and `traces-fail` to FAIL as well (teardown doesn't call traces yet). Record which cases failed. → 6 FAIL, `happy` PASS. `ls-fail`/`ls-garbage` printed "✓ teardown complete" after revoking; reap revoked an open run's key. `dirty-real` red at HEAD is a shim artifact (the shim keys on the new sentinel), not a defect. Selftest hardened during build: each case must also print its own abort phrase, so an unrelated error cannot pass a fail-closed case.

#### 2. Teardown

- [x] `:71-77`: replace the fallback with an abort. Name the cause and say that nothing was changed:
  ```bash
  VM_LIST=$(ssh "${SSH_OPTS[@]}" exe.dev ls --json < /dev/null 2>/dev/null) || {
      echo "!! could not list VMs (exe.dev ls failed). Unknown is not gone: nothing touched. Re-run teardown."; exit 1; }
  RC=0; printf '%s' "$VM_LIST" | VM="$VM" python3 -c '
  import json,os,sys
  try: names={v.get("vm_name") for v in json.load(sys.stdin).get("vms",[])}
  except Exception: sys.exit(2)
  sys.exit(0 if os.environ["VM"] in names else 1)' || RC=$?
  case "$RC" in 0) VM_ALIVE=1 ;; 1) VM_ALIVE=0 ;; *) echo "!! exe.dev ls returned unparseable output: nothing touched"; exit 1 ;; esac
  ```
- [x] New step **2b, traces**, after artifacts and before harvest, only when `VM_ALIVE=1`. Run `just sbx manage traces "$RUN_ID"`; on failure, print the same three-line abort as harvest (re-run, or `--no-traces` to skip deliberately) and `exit 1`. Add `--no-traces` to the flag parser and its error message.
- [x] `:169`: sentinel dirty check:
  ```bash
  TREE=$(ssh "${SSH_OPTS[@]}" "$VM".exe.xyz \
      'if [ -d app ]; then cd app && git status --porcelain || exit 9; fi; echo SBX_TREE_OK' < /dev/null) || {
      echo "!! could not read $VM's working tree: unknown is not clean. VM left alive."; exit 1; }
  [ "$(printf '%s\n' "$TREE" | tail -n1)" = SBX_TREE_OK ] || { echo "!! tree check incomplete: VM left alive."; exit 1; }
  DIRTY=$(printf '%s\n' "$TREE" | sed '$d')
  ```
- [x] Header comment (:8-21): the order now reads spend → artifacts → traces → harvest → dirty → revoke → destroy. Add one sentence: "every probe fails closed: an answer we could not get aborts, never defaults."

#### 3. Traces

- [x] Add the probe sentinel from Solution. Gate each rsync on its probe line: sessions with `--delete` as today; db; and, when `claude` is present, `rsync -az -e "ssh $SSH_OPTS" "$VM.exe.xyz:.claude/projects/" "$DEST/claude-projects/"` with **no** `--delete`.
- [x] Keep `SESSION` narrowing working; it applies to the sessions pull only.
- [x] Print a `claude:` line in the summary when that pull ran.

#### 4. Reap

- [x] `:45`: change it to `… > "$TMPD/vms.json" || { echo "!! could not list VMs: refusing. Unknown is not gone, and reap would revoke live runs."; exit 1; }`. This applies to the dry run too, since a dry run that lists every run as orphaned misleads just as badly.

#### 5. Skill docs

- [x] `.claude/skills/sssf-sandbox-orchestrator/SKILL.md` and `references/phases.md`: add `--no-traces` wherever `--no-harvest` is documented, plus one line saying that teardown pulls traces (and Claude transcripts) itself.

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `bash sandbox_mount/host/teardown_selftest.sh` at d432f8c: the failure cases FAIL, which proves the test sees the defects
- [x] `bash sandbox_mount/host/teardown_selftest.sh` after the fix: all 7 cases PASS, which proves fail-closed and that the happy path still completes → PASS ×7; red ×6 re-confirmed by `git stash -- just/`
- [x] `grep -n "echo '{\"vms\":\[\]}'" just/sandbox/lifecycle/teardown.just just/sandbox/manage/reap.just` prints nothing: the fallback is gone from both → only match is the explanatory comment at teardown.just:77
- [x] `grep -n '|| true)' just/sandbox/lifecycle/teardown.just`: no remaining match on a probe that gates a destructive step (the checkpoint and artifact `|| true` are best-effort reads and may stay; list each survivor and why) → survivors: spend reads :111/:118 (recorded "unavailable", gates nothing — see Amendments), checkpoint :143, artifact tar :148, rmdir :154. None gates revoke or destroy.
- [x] `just --summary` parses: no recipe syntax error
- [x] `ls .sandbox/runs | grep selftest-` prints nothing: the selftest cleans up after itself

### Phase 3: Audit and record

#### 1. Retro audit: were past results tainted?

- [x] For each of the 56 bundles in `.sandbox/runs/*.bundle`, clone it into a temp dir (`git clone -q <bundle> $T/r`). Find the commit range after the test-designer's commit, which has its own author (check `git log --format='%an %s'` in one bundle to learn the naming). List the files touched under `adws/adw_data/` and under each run's manifest `test_file` / `generated_tests_dir`:
  `git -C $T/r log --format='%h %an %s' --name-only <commit_tests>..HEAD -- adws/adw_data ':(glob)apps/*/*.test.ts' ':(glob)apps/*/tests/generated/**'`
- [x] Classify each hit: → ran via a scratch script (fetch each bundle into a clone of its base repo: this repo or `../greenfield-sandboxes`). 56 bundles: 0 touched `adws/adw_data` prompts or harness; 28 suite edits, all legitimate (durable growth, plus red-value corrections tied to amendments); 6 clean; 19 n/a; 3 unreadable (gf-1/2/3, prerequisites outside history). Classify each hit: legitimate (test_designer's own commit, a documenter `.md` outside `adw_data`) or tamper (a builder, reviewer or documenter changing a prompt, the harness or a suite after `commit_tests`). Bundles without `commit_tests` (pre-TDD arms, bare `run agent`) are "n/a — no red suite".
- [x] Note that commit history cannot see a prompt edited and then reverted within a run. State that limit in the result rather than overclaiming.

#### 2. Record

- [x] Write the CHANGELOG.md entry dated 2026-10-02 (or the build date):
  - the two defects
  - red/green selftest output for both selftests (cell counts, case table)
  - the audit result with its stated limit
  - the control-arm note: control prompts unchanged; harness enforcement now applies to it; runs before this date ran without it
- [x] NEXTSTEPS.md: drop items 1–2 from the open queue if present, and keep only remaining work (the review's items 3–7).
- [x] Update the memory file that covers the review if one exists; otherwise none is needed. The results live in CHANGELOG.

#### 3. Optional live check (costs one short VM; Ron's call)

- [x] `just sbx mount selftest-live`, then `just sbx run agent <id> "say hi"` (creates `~/.claude/projects`), then `just sbx lifecycle teardown <id>`. Confirm that `.sandbox/traces/<id>/claude-projects/` exists, which verifies the `~/.claude/projects` path assumption, and that teardown ends ✓. Skip this if Ron declines, and say so in the CHANGELOG.

#### Validation — Phase 3

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] The audit table (bundle · arm · hits · classification) is in the CHANGELOG entry, with every bundle accounted for
- [x] `git log -1 --stat` shows the CHANGELOG entry and both selftests committed together with the fixes
- [x] Optional live check either ran (output in CHANGELOG) or is recorded as skipped with the reason

## Global Validation

- [x] `uv run --with pydantic --with pyyaml python -m adws.adw_modules.permissions_selftest` exits 0: grader inputs are closed on every roster
- [x] `bash sandbox_mount/host/teardown_selftest.sh` exits 0: teardown and reap fail closed, and the happy path works
- [x] `git diff d432f8c --stat -- adws/adw_data/prompt_engineering adws/adw_data/prompt_engineering_team adws/adw_sssf_config` is empty: no prompt or roster changed, so the arms stay comparable
- [x] The CHANGELOG entry exists with the selftest output and the audit result

## Notes

**Why prevention in `permitted()` rather than a post-build suite-diff gate.** The review proposed a gate that diffs both suites against the `commit_tests` sha after every builder phase. `enforce()` already runs after every agent phase, already rolls back out-of-scope writes, and already aborts above `RECOVERED_LIMIT`. Adding the suites to the protected set gets prevention, rollback and the trace record from code that exists. A gate would be a second mechanism for one rule, and it detects after the fact instead of undoing. Rejected for that reason.

**Why `never_writable` is not unlockable by `writes`.** `writes` unlocking `protected_files` is a deliberate design (`permissions.py:146-147`); it is how test_designer gets its lane. But `"**/*.md"` (the documenter) and `specs/` style globs are broad. For the grader's own inputs, no glob should be able to reach them by accident, so they sit above the `writes` check. The suites stay unlockable, because test_designer must write `tests/generated/`.

**What a rolled-back suite edit looks like to the builder.** The edit silently vanishes after the phase, and the console notes it. The next `test_i` runs the original suite. That is the right outcome: the builder's prompt already says the suite is not its to edit, and now the harness agrees. A builder that keeps fighting (>3 paths) aborts the run, which is visible in the trace as `PermissionBreach`.

**The documenter's spec rewrite (review finding, low) is not fixed here.** `specs/` is the planner's lane and the documenter matches it through `**/*.md`. Closing it needs `spec_frozen` on the documenter phase, which is a team-ADW change, not a permissions one. Deferred to the review's item list.

**Deferred from the harness review, and why:**

- **pid-liveness check in teardown (medium).** This guards against tearing down a running agent. It is useful, but it is a different defect (a wrong-time teardown, not a teardown that fails open). One `kill -0` over ssh, with the same sentinel pattern. Next in line.
- **`traces` `--delete` on the host copy (low).** When teardown calls traces, the VM is the source of truth at that moment, so `--delete` is correct there. It only bites on a manual re-pull after a VM-side wipe. Left as is.
- **`mount` not forwarding `--config` (medium).** Unrelated to fail-open. It belongs with the 5.5 roster work (item 5).

**Selftest faithfulness.** An unfaithful test double is an attractive nuisance (fan-out 2 lesson). The shims model only the shapes teardown parses, and those shapes are already "Verified shape" comments in teardown.just (:65, :89). The `happy` case is the guard against an over-permissive shim: if the shim were wrong, the happy path would fail too, rather than everything silently passing. The optional live check is the one place the real `exe.dev`/`~/.claude` shapes are re-confirmed.

**Risk: `suites_protected()` reads the manifest at call time.** On a greenfield target the manifest is the target's own, and its suite paths are what should be protected. If `manifest.load()` raises (no manifest), `permitted()` must not crash the run mid-phase. Catch the error and return `[]` with a console note? No: a missing manifest already breaks `quality.py` at import, so let it raise loudly. Recorded so the builder doesn't add a silent fallback, which would be this plan's own defect class.

## Amendments

<details>
<summary>2026-10-02T14:52:00-07:00 — suite protection reverted on the retro audit; abort-phrase pinning added to the teardown selftest</summary>

**Deviation 1: `suites_protected()` was built, then removed.** The plan assumed the builder must never edit the
graded suites; the review finding and `gates.py:146,218` both said so. The Phase 3 audit of 56 bundles showed that
is false for this factory. Builders add durable tests to `app.test.ts` by prompt. They also correct red-suite values
under accepted amendments: mtg1 V67 930→1320 via A2, a recorded win, would have been rolled back, and the build
rejected. A path rule cannot separate a correction from a weakening. What shipped is the half the audit confirms:
`never_writable` (prompts, harness, fixtures), which no bundle ever touched. The selftest's suite rows now expect
`writes`-derived answers, and its red count at d432f8c is 136 (was 156 with the suite rows hard-✗). The replacement
control, surfacing post-`commit_tests` suite hunks to the reviewer, is queued in NEXTSTEPS 7.1.

**Deviation 2: the teardown selftest is stricter than planned.** Each case must also print its own abort phrase, so
an abort for an unrelated error cannot pass a fail-closed case. The `record` helper sets a global instead of being
called in `$(...)`: the first draft lost its cleanup list in the subshell and left throwaway records behind, which
were removed.

**Live check** ran with Ron's approval (`failclosed-live-20261002-5049e8`): a real dirty tree refused teardown with
the VM left alive; the clean teardown then pulled the Claude transcript, revoked the key and destroyed the VM.
</details>
