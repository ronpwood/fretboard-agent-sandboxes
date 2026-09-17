---
plan: greenfield-target
created: 2026-09-15T08:11:29-07:00
modified:
  - 2026-09-15T08:11:29-07:00
  - 2026-09-17T05:30:04-07:00
commits:
  - a32190b
  - 5145d53
  - e440589
  - c19c3ad
  - e1efec6
agents:
  - claude-opus-5[1m]
  - claude-opus-5[1m]
sessions:
  - cc-interactive-20260915
  - 81d4f414-33e2-42a8-86ee-469f12ff2a87
back_refs:
  - specs/payload-app-manifest.md — the manifest reader (`adws/adw_modules/manifest.py`) this plan extends with named targets
  - specs/greenfield-cof-experiment.md — defines the greenfield-sandboxes clean room and the manual manifest-flip procedure this plan replaces
  - specs/tdd-red-gate-phase.md — `adw_tdd_sdlc.py` / `just adw tdd`, the chain a greenfield team runs end to end
forward_refs: []
status: complete
---

# Plan: Greenfield target — per-run `--target` for sandbox mounts

## Purpose

Make "send a team at a blank codebase" a first-class, one-flag option. After this plan:
`just target sync greenfield --push` regenerates the clean-room repo
(`~/Dev/learning/greenfield-sandboxes` → `github.com/ronpwood/greenfield-sandboxes`) from **this**
repo's factory at HEAD, and `just sbx mount <id> --target greenfield` mounts a VM on that clean
room. The mount is pinned to the synced commit and never mentions the current payload app. Then
`just sbx lifecycle execute <id> prompts/greenfield.md "" tdd` runs the full TDD chain
(`adw_tdd_sdlc.py`), and harvest brings the commits home to the greenfield checkout. The default
(no `--target`) behaves exactly as today.

## Problem

The clean room exists (built 2026-08-28), but using it today has four problems:

1. **Factory drift.** The greenfield repo is a frozen copy of the factory from 2026-08-28. On
   2026-09-15 twenty factory files differ from this repo: `agent_pi.py`, `data_types.py`,
   `provision.sh`, `run_record.py`, `models.json.tmpl`, the three roster configs, and the
   observe/setup/execute recipes. A VM runs the factory inside the repo it cloned, so a greenfield
   run today would lack generation-id capture, the app proxy, `refresh`, the toolchain lock,
   today's glm-5.3/gemini-3.8-flash roster, and every rate fix. Every factory improvement has to be
   hand-copied, and nothing tells you when the copies diverge.
2. **Target selection is a global, manual file flip.** FILL, observe and refresh read the **host**
   checkout's `app.manifest.yaml` (`fill.just:20-23`, `observe.just:37-40`, `refresh.just:68-69`).
   The documented procedure (`specs/greenfield-cof-experiment.md` §Run procedure, step 2) is
   `cp ~/Dev/learning/greenfield-sandboxes/app.manifest.yaml app.manifest.yaml`, then
   `git checkout app.manifest.yaml` afterwards. That is global state: fretboard and greenfield runs
   can't run at the same time, a forgotten revert silently points the next fretboard mount at
   greenfield, and the run record doesn't say which codebase a run used.
3. **No pin.** Unless someone passes a sha by hand, FILL clones whatever `main` is at that moment,
   so a sync landing mid-fan-out gives arms different starting bytes.
4. **Harvest can't bring greenfield work home.** `harvest.just` fetches the bundle into the host
   repo, but a greenfield bundle's prerequisite (`commit_sha`) is a greenfield commit the host
   history doesn't have, so `git bundle verify` fails. The 2026-08-28 run worked around it by
   fetching kept bundles into the greenfield checkout by hand.

What must NOT regress: the clean room's reason to exist. It is a separate repo with fresh history
so that no arm can reach the reference implementation through `git log`, `archive/`, `specs/` or
`app_docs/`. Cloning this repo and deleting fretboard on the VM would bring that leak back, and is
rejected (see Notes).

## Solution

Three mechanisms plus a docs pass. The first two are generic over any number of targets; greenfield
is simply the first one.

**1. Named targets (`targets/<name>.yaml`, host-only).** A target file is a manifest (the same
`app:` + `source:` sections `manifest.py` already validates) plus a host-only `target:` section
that describes how to sync it. The root `app.manifest.yaml` stays the implicit `default` target.
`manifest.py` gains `--target NAME`; names are accepted only if `targets/NAME.yaml` exists
(`^[a-z0-9][a-z0-9-]*$`, no paths), per the fusion-harness hardening lesson.

```yaml
# targets/greenfield.yaml — host-only; never synced
app:                                  # MUST equal the checkout's own app.manifest.yaml app: section (sync enforces)
  name: app
  dir: apps/app
  entry: apps/app/main.ts
  test_file: apps/app/app.test.ts
  generated_tests_dir: apps/app/tests/generated
source:
  repo: https://github.com/ronpwood/greenfield-sandboxes.git
target:
  checkout: ../greenfield-sandboxes   # relative to this repo's root
  branch: main
  sync_paths:                         # factory allowlist, exported from HEAD via git archive
    - adws
    - just
    - sandbox_mount
    - .claude/skills/sssf
    - justfile
    - .env.sample
    - LICENSE
  owned:                              # target-owned; sync never writes or deletes these
    - apps/app
    - app.manifest.yaml
    - prompts
    - README.md
    - .gitignore
  leak_patterns:                      # extra, target-specific; app names are derived, never listed
    - circle of fifths
    - circle-of-fifths
```

**2. Per-run target in the lifecycle.** `create` accepts `--target NAME` (default `default`) and
writes it to a new run-record field `target`. `mount` already forwards `*FLAGS` to `create`, so
`just sbx mount gf-4 --target greenfield` needs no change to `mount.just`. From then on every phase
reads the target **from the run record**, never from a flag:

- `fill` gets `source.repo` via `manifest.py --target "$TARGET" get source.repo`. With no explicit
  `SHA`, it pins to `.sandbox/targets/<name>.json` → `target_sha` when that file exists and says
  `pushed: true`. The existing pin gate fails loudly if the sha isn't on the remote.
- `observe` and `refresh` get `app.name` / `app.dir` the same way.
- `harvest` fetches into `target.checkout` for non-default targets (the checkout has the base
  commit), and still into the host repo for `default`.
- A record with no `target` field (every run before this plan) reads as `default`.

**3. Sync (`just target sync <name> [--push]`).** This is a uv Python script,
`sandbox_mount/host/target_sync.py`, because it needs YAML, set arithmetic over paths, and a
dry-run report. Bash would be the wrong tool. Steps, in order, stopping at the first failure:

1. Preconditions: the target checkout exists, is clean, is on `target.branch`, and fast-forwards
   to `origin/<branch>`. The host tree is warned about if dirty; the export is from HEAD regardless.
2. Export: `git archive HEAD -- <sync_paths>` into a temp dir. Only **tracked** files, so
   `adws/adw_data/sessions/**` (untracked run debris full of app names) cannot leak.
3. Derived exclusions: drop `just/<host app.name>.just`, and strip the root `justfile` line
   `mod <host app.name> …`. Both are computed from the host manifest, so a future `just app swap`
   needs no edit here.
4. Mirror: for each sync path, make the checkout match the export exactly. Added, changed **and
   deleted** files propagate, and nothing under `owned` is touched. A sync path that overlaps an
   owned path is a config error.
5. Leak check over the exported tree only (owned files like `prompts/greenfield.md` legitimately
   say "Circle of Fifths"). Case-insensitive patterns = host `app.name` + every app name under
   `archive/` (dir name minus the `-YYYYMMDD-HHMMSS` suffix) + `target.leak_patterns`. Any hit
   fails the sync, prints `file:line`, and leaves the checkout **reset to its pre-sync state**.
6. Contract check: the checkout's own `app.manifest.yaml` `app:` section equals the target file's
   `app:` section.
7. Gates, run inside the checkout: `uv run adws/adw_modules/manifest.py get source.repo`,
   `bun build <app.entry> --outdir /tmp/<name>-build`, `bun test <app.test_file>`, and a load +
   `agents.validate` of every `adws/adw_sssf_config/*.yaml`.
8. Commit in the checkout with a **neutral** message, `factory sync <UTC date>`. It must never name
   this repo, which would leak via `git log`. No commit if nothing changed.
9. `--push` only: `git push origin <branch>`. Pushing is outward-facing, so it is an explicit flag.
10. Write `.sandbox/targets/<name>.json` (gitignored):
    `{synced_at, host_sha, target_sha, pushed}`. The host sha lives here and only here.

`--dry-run` stops after step 7 and prints the would-be diff stat plus the leak and gate results
without committing.

**4. Docs.** The final phase updates every user-facing and agent-facing surface so a human or an
agent booted into this repo discovers `--target`, `just target …`, the greenfield run recipe, and
where greenfield harvests land.

## Relevant Files

### Existing — modified
- `adws/adw_modules/manifest.py` — add `--target NAME` to the CLI and `load_target(name)`, with name validation and a `list` subcommand; `get` keeps working unchanged when no target is given
- `sandbox_mount/host/run_record.py` — add `target` to `FIELDS`; `get <id> target` returns `default` when the stored value is null/missing
- `just/sandbox/lifecycle/create.just` — parse `--target NAME` / `--target=NAME`, validate it via `manifest.py list`, record it; update the unknown-flag message
- `just/sandbox/lifecycle/fill.just` — read `target` from the record; use `--target` for `source.repo`; default the pin from `.sandbox/targets/<name>.json` when no SHA is given and the file says pushed
- `just/sandbox/lifecycle/observe.just` — `app.name` / `app.dir` via the record's target; update the comment at lines 37-38 that claims the VM is a clone of this same repo
- `just/sandbox/lifecycle/refresh.just` — same as observe (lines 68-69)
- `just/sandbox/manage/harvest.just` — for non-default targets, verify and fetch the bundle into `target.checkout`, and print the read/diff commands with `git -C <checkout>`
- `just/sandbox/mount.just` — change the usage comment only (show `--target`); FLAGS already forward to create
- `justfile` — `mod target 'just/target.just'`
- `app.manifest.yaml` — comment only: name it the `default` target and point to `targets/`
- `just/app.just` — swap checklist: add a line that `targets/*.yaml` leak patterns derive app names automatically, so nothing needs editing there
- `README.md` — command surface + an end-to-end greenfield variant (Phase 6)
- `PLAYBOOK.md` — new section "Greenfield runs" (Phase 6)
- `TREE.md` — `targets/`, `just/target.just`, `sandbox_mount/host/target_sync.py`, `.sandbox/targets/` (Phase 6)
- `.claude/commands/prime.md` — mention targets in the priming read list (Phase 6)
- `.claude/skills/sssf-sandbox-orchestrator/SKILL.md` — add targets to the capability summary and routing (Phase 6)
- `.claude/skills/sssf-sandbox-orchestrator/cookbooks/mount_one.md` — `--target` (Phase 6)
- `.claude/skills/sssf-sandbox-orchestrator/cookbooks/fan_out_n.md` — sync-then-pin before a greenfield fan-out (Phase 6)
- `.claude/skills/sssf-sandbox-orchestrator/cookbooks/execute_work.md` — `prompts/greenfield.md "" tdd` form (Phase 6)
- `.claude/skills/sssf-sandbox-orchestrator/cookbooks/teardown_and_reap.md` — where greenfield harvests land (Phase 6)
- `.claude/skills/sssf-sandbox-orchestrator/references/run_record.md` — the `target` field (Phase 6)
- `.claude/skills/sssf-sandbox-orchestrator/references/phases.md` — per-phase target resolution (Phase 6)
- `.claude/skills/sssf-sandbox-orchestrator/cookbooks/just_command_model.md` — the `target` namespace (Phase 6)
- `NEXTSTEPS.md` — dated entry (Phase 6)
- `~/Dev/learning/greenfield-sandboxes/README.md` — target-owned: add "factory paths are generated by an upstream sync; edit only apps/, prompts/, README, .gitignore, app.manifest.yaml". Must not name the host repo (Phase 3)

### Existing — deleted
- none

### New
- `targets/greenfield.yaml` — the greenfield target definition (shape above)
- `sandbox_mount/host/target_sync.py` — the sync script (uv inline-script deps: `pyyaml`, `pydantic`)
- `just/target.just` — `just target list`, `just target show <name>`, `just target sync <name> [--push] [--dry-run]`
- `.sandbox/targets/greenfield.json` — gitignored sync provenance and pin, written by the sync

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

### Phase 1: Target registry and manifest reader

Teach `manifest.py` about named targets without changing default behavior.

#### 1. Target file

- [x] Create `targets/greenfield.yaml` with the shape in Solution. Copy the `app:` section byte-for-byte from `~/Dev/learning/greenfield-sandboxes/app.manifest.yaml`
- [x] Confirm `Manifest.model_validate` ignores the extra `target:` key (pydantic v2 default `extra="ignore"`); if the model forbids extras, load the file and pop `target` before validating

#### 2. `manifest.py` CLI

- [x] Parse `[--target NAME] get <dotted.key>`, and add `list`, which prints `default` followed by every `targets/*.yaml` stem
- [x] `load_target(name)`: `default` → the existing `load()`; otherwise require `re.fullmatch(r"[a-z0-9][a-z0-9-]*", name)` and that `REPO_ROOT/targets/<name>.yaml` is a file, else exit 1 with the list of known targets
- [x] Add a `get-target-section <name> <key>` subcommand (or a `--section target` flag) so sync and harvest can read `target.checkout` without a second YAML parser in bash
- [x] Keep the module importable (`from .manifest import load`) exactly as quality.py uses it

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `uv run adws/adw_modules/manifest.py get source.repo` — prints the fretboard repo URL (default unchanged)
- [x] `uv run adws/adw_modules/manifest.py --target greenfield get source.repo` — prints `https://github.com/ronpwood/greenfield-sandboxes.git`
- [x] `uv run adws/adw_modules/manifest.py --target greenfield get app.dir` — prints `apps/app`
- [x] `uv run adws/adw_modules/manifest.py list` — prints `default` and `greenfield`
- [x] `uv run adws/adw_modules/manifest.py --target ../app get app.dir; test $? -ne 0` — path traversal rejected
- [x] `uv run adws/adw_modules/manifest.py --target nope get app.dir; test $? -ne 0` — unknown target rejected with the known list
- [x] `diff <(yq '.app' targets/greenfield.yaml) <(yq '.app' ../greenfield-sandboxes/app.manifest.yaml)` (or the python equivalent) — app contract identical

### Phase 2: Per-run target through the lifecycle

Record the target at create; every later phase reads it from the record.

#### 1. Run record

- [x] Add `"target"` to `FIELDS` in `sandbox_mount/host/run_record.py` (mutable, not in `IMMUTABLE`, no coercion)
- [x] Make `get <id> target` print `default` when the value is null or the key is absent (old records)

#### 2. create

- [x] Parse `--target NAME` and `--target=NAME` alongside `--limit`; the default is `default`
- [x] Validate **before anything is created** (next to the existing preflight): `uv run adws/adw_modules/manifest.py list | grep -qx "$TARGET"`
- [x] After `"$RR" create`, `"$RR" set "$RUN_ID" target="$TARGET"`; echo `target:  $TARGET`
- [x] Update the unknown-flag message to `(supported: --limit N, --target NAME)`

#### 3. fill

- [x] `TARGET=$("$RR" get {{RUN_ID}} target)`; `REPO=$(uv run adws/adw_modules/manifest.py --target "$TARGET" get source.repo)`
- [x] If `PIN` is empty, `TARGET != default`, and `.sandbox/targets/$TARGET.json` exists with `pushed: true`, then `PIN=target_sha` and echo `pin from last sync: <sha> (synced_at)`. If the file exists but `pushed: false`, warn that the local sync commit isn't on the remote and continue unpinned
- [x] Rewrite the comment at lines 20-22 to describe target resolution

#### 4. observe and refresh

- [x] Both read `TARGET` from the record and pass `--target "$TARGET"` to both `manifest.py get` calls
- [x] Fix observe's comment at lines 37-38: the VM's `app/` is a clone of the **target's** `source.repo`, whose relative `app.dir` the target file declares

#### 5. mount usage

- [x] In `just/sandbox/mount.just`, add `[--target NAME]` to the recipe's doc comment; FLAGS already forward to `create`

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `just --dry-run sbx lifecycle create x --target greenfield` (or reading the recipe text) — the flag is parsed; no VM is created in validation
- [x] `sandbox_mount/host/run_record.py create t-000000 && sandbox_mount/host/run_record.py get t-000000 target` — prints `default`; then `set t-000000 target=greenfield` + `get` prints `greenfield`; delete the test record afterwards
- [x] `sandbox_mount/host/run_record.py get $(sandbox_mount/host/run_record.py list | python3 -c 'import json,sys;print(json.load(sys.stdin)[-1]["run_id"])') target` — an old record reads as `default`
- [x] `grep -n 'manifest.py get' just/sandbox/lifecycle/*.just | grep -v -- '--target'` — returns nothing (no phase reads the root manifest implicitly)
- [x] `just sbx manage doctor` — preflight still OK

### Phase 3: Sync

Build `target_sync.py` + `just target`, then run the first real sync.

#### 1. Script

- [x] `sandbox_mount/host/target_sync.py <name> [--push] [--dry-run]`, uv inline script, steps 1-10 exactly as in Solution
- [x] Mirror with Python (walk the export vs. the checkout under each sync path), not `rsync --delete`, so the `owned` guard is enforced in code: refuse any write or delete whose path is under an owned prefix
- [x] On leak or gate failure after the mirror: `git -C <checkout> reset --hard HEAD && git -C <checkout> clean -fd -- <sync_paths>`, which restores the pre-sync state (the precondition guaranteed a clean tree, so this destroys nothing)
- [x] **The script contains no literal app names.** Every forbidden name is derived (host `app.name`, `archive/` dir names) or comes from the target file, which is never synced. The script itself is under `sandbox_mount/`, so it passes through its own leak check
- [x] Leak scan skips binary files (null byte in the first 8KB) and reports `path:line: pattern`
- [x] Exit codes: 0 synced (or nothing to do), 1 precondition/config error, 2 leak found, 3 gate failed, 4 push failed (the local commit is kept, and the json records `pushed: false`)

#### 2. just module

- [x] `just/target.just` with `set working-directory := '..'` and `set positional-arguments` (module convention, see `just/app.just`); recipes `list`, `show NAME` (prints the target file plus the `.sandbox/targets/NAME.json` provenance), `sync NAME *FLAGS` → `uv run sandbox_mount/host/target_sync.py "$@"`, passing args positionally and never interpolating them into shell text
- [x] `mod target 'just/target.just'` in the root `justfile`

#### 3. First real sync

- [x] `just target sync greenfield --dry-run` — review the diff stat. Expect the ~20 drifted files plus everything added since 2026-08-28 (`sandbox_mount/guest/app_proxy.ts`, `toolchain.lock`, `sandbox_mount/host/check_rates.py`, `just/sandbox/lifecycle/refresh.just`, `just/sandbox/manage/traces.just`, …)
- [x] Resolve any leak hits **at the source in this repo**, never by allowlisting. Known hit to expect: `just/sandbox/lifecycle/create.just:82-85` tags VMs `--tag inkwell`. Rename the tag to `sssf` and confirm nothing filters on the old tag (`git grep -n 'tag inkwell'` shows only those lines; `reap`/`list` select by run record, not tag). Also expect the `justfile` `mod fretboard` line (handled by derived exclusion)
- [x] Update the greenfield README (target-owned) with the "generated factory paths" note, and commit it in the checkout **before** the sync (the precondition requires a clean tree)
- [x] With the user's go-ahead (this pushes to a public repo): `just target sync greenfield --push`

#### Validation — Phase 3

> **Loop gate.** Do not start Phase 4 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `just target list` — shows `default`, `greenfield`
- [x] `just target sync greenfield --dry-run; echo $?` — exit 0 with zero leak hits and all gates green
- [x] Leak-check self-test: on a scratch branch of this repo, commit a comment containing the host `app.name` into any file under `adws/`, run `just target sync greenfield --dry-run`, assert exit 2 and a `path:line` report naming that file, then delete the branch — proves the check fires on tracked factory files (owned paths are not scanned, so testing there proves nothing)
- [x] Owned-guard self-test: temporarily add `apps/app` to `sync_paths` in a scratch copy of the target file; assert exit 1 (config error: overlap)
- [x] `git -C ../greenfield-sandboxes log -1 --format=%s` — `factory sync <date>`, with no host repo name
- [x] `git -C ../greenfield-sandboxes grep -niE "$(uv run adws/adw_modules/manifest.py get app.name)|inkwell|circle of fifths" -- adws just sandbox_mount .claude justfile .env.sample` — no output (independent re-check of the leak scan)
- [x] `diff <(git ls-files adws sandbox_mount .claude/skills/sssf | sort) <(git -C ../greenfield-sandboxes ls-files adws sandbox_mount .claude/skills/sssf | sort)` — factory file lists identical (no output)
- [x] `python3 -c 'import json;d=json.load(open(".sandbox/targets/greenfield.json"));assert d["pushed"] and len(d["target_sha"])==40;print(d)'` — provenance written
- [x] `git ls-remote https://github.com/ronpwood/greenfield-sandboxes.git refs/heads/main` — equals `target_sha`

### Phase 4: Target-aware harvest

#### 1. harvest.just

- [x] Read `TARGET` from the record. For `default`, keep behavior byte-for-byte. Otherwise set `GIT=(git -C "$CHECKOUT")`, with `CHECKOUT` from the target file's `target.checkout` resolved against the repo root, and require it to be a git repo
- [x] Keep the bundle at `.sandbox/runs/<id>.bundle` (host-side, same as today). Run `verify` and `fetch --force "$BUNDLE" "refs/heads/$BRANCH:refs/sandbox/$RUN_ID"` with `"${GIT[@]}"`
- [x] The final echoes print the `git -C <checkout> log/diff` forms so copy-paste works
- [x] Teardown needs no change (it calls harvest). Confirm the teardown dirty-check still reads the VM, not the checkout

#### Validation — Phase 4

> **Loop gate.** Do not start Phase 5 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] Offline test with a synthetic bundle: in a temp clone of the greenfield checkout, create a branch `sbx/t-000000` with one commit on top of `target_sha`, run `git bundle create /tmp/t.bundle <target_sha>..sbx/t-000000`, then run the harvest fetch block (`git -C ../greenfield-sandboxes bundle verify /tmp/t.bundle && git -C ../greenfield-sandboxes fetch --force /tmp/t.bundle refs/heads/sbx/t-000000:refs/sandbox/t-000000`) — lands in the checkout; remove the ref afterwards
- [x] `git bundle verify /tmp/t.bundle` run in the **host** repo fails — proves routing is required, not cosmetic
- [x] Re-read `harvest.just`'s default branch: identical commands to before for `TARGET=default` (`git diff` limited to added branches)

### Phase 5: End-to-end greenfield run (live, costs money — needs the user's go-ahead)

One real arm, to prove the pieces compose. It mounts a VM and mints a key, so ask first, and use `--limit 10`.

#### 1. Run

- [x] `just sbx mount gf-e2e --target greenfield --limit 10` — fill prints `pin from last sync: <target_sha>`; gates A-F green; observe shows the shell app on the review URL
- [x] `just sbx run cmd <run-id> 'cat app.manifest.yaml | head -20 && ls apps && git log --oneline | head -3'` — greenfield manifest, only `apps/app`, neutral history
- [x] `just sbx run cmd <run-id> 'grep -rniE "fretboard|inkwell" --exclude-dir=node_modules --exclude-dir=.git . | head'` — no output on the VM
- [x] `just sbx lifecycle execute <run-id> prompts/greenfield.md "" tdd` — confirms `execute`'s `ADW` argument drives `just adw tdd` → `adw_tdd_sdlc.py`, and that a prompt path resolves inside the greenfield checkout. If CONFIG `""` is rejected, use `adws/adw_sssf_config/sssf.config.yaml`
- [x] Let it finish (`just sbx run cmd <run-id> 'tail -5 run.log'`), then `just sbx lifecycle refresh <run-id>` and look at the review URL
- [x] `just sbx manage harvest <run-id>` — commits land at `refs/sandbox/<run-id>` in `../greenfield-sandboxes`
- [x] `just sbx lifecycle teardown <run-id>` — clean close, key revoked

#### Validation — Phase 5

> **Loop gate.** Do not start Phase 6 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `sandbox_mount/host/run_record.py get <run-id> target` — `greenfield`
- [x] `test "$(sandbox_mount/host/run_record.py get <run-id> commit_sha)" = "$(python3 -c 'import json;print(json.load(open(".sandbox/targets/greenfield.json"))["target_sha"])')"` — the run started from the pinned sync
- [x] `git -C ../greenfield-sandboxes log --oneline <commit_sha>..refs/sandbox/<run-id> | wc -l` — > 0: the TDD chain's commits came home
- [x] `git -C ../greenfield-sandboxes log --format=%s <commit_sha>..refs/sandbox/<run-id>` — the red-suite commit precedes the build commit (TDD ordering)
- [x] `git status --short app.manifest.yaml` — empty: the root manifest was never touched

### Phase 6: Documentation — make the new capability discoverable to humans and agents

Every surface a person reads, or an agent is booted with, must say what exists after this plan:
the `default` vs named-target model, `just target list|show|sync`, `just sbx mount <id> --target
<name>`, the sync → pin → mount → `execute … tdd` → harvest recipe, where greenfield harvests land,
and the leak rule. Write it as current-state documentation. Historical specs
(`specs/greenfield-cof-experiment.md`, other `specs/*`) stay as they are.

#### 1. Human-facing

- [x] `README.md` — in "The command surface", add the `target` namespace and the `--target` flag. In "How to run it end to end", add a short greenfield variant block (sync → mount `--target greenfield` → execute `prompts/greenfield.md "" tdd` → harvest into the checkout)
- [x] `PLAYBOOK.md` — new section `## Greenfield runs (a blank codebase)` after §7: when to use it, the exact commands, why it's a separate repo (the leak rule), how to re-sync, where commits land, how to fan out N arms from one pinned sync, and the revert story (there's nothing to revert, because the root manifest is never flipped)
- [x] `TREE.md` — add `targets/`, `just/target.just`, `sandbox_mount/host/target_sync.py`, `.sandbox/targets/` with one-line purposes
- [x] `app.manifest.yaml` header comment — "the `default` target; named targets live in `targets/`"
- [x] `NEXTSTEPS.md` — dated entry: what shipped, the first sync's diff size, the e2e result, open items

#### 2. Agent-facing

- [x] `.claude/skills/sssf-sandbox-orchestrator/SKILL.md` — in the capability list and the routing table, add "mount on a named target / greenfield" pointing to `mount_one.md` and `fan_out_n.md`, and "sync a target" pointing to the new PLAYBOOK section or a short `references/targets.md` if SKILL.md routes only to cookbooks/references
- [x] `cookbooks/mount_one.md` — the `--target` flag, what `create` records, how to confirm it on the VM
- [x] `cookbooks/fan_out_n.md` — "greenfield fan-out": sync once with `--push`, then N mounts all pin to the same `target_sha`; never re-sync mid-fan-out
- [x] `cookbooks/execute_work.md` — the `execute <id> prompts/greenfield.md "" tdd` form, and that prompt paths resolve in the **target's** checkout
- [x] `cookbooks/teardown_and_reap.md` — non-default targets harvest into `target.checkout`, so look there for `refs/sandbox/<id>`
- [x] `cookbooks/just_command_model.md` — the `target` namespace in the command map
- [x] `references/run_record.md` — the `target` field, its default, and that old records read as `default`
- [x] `references/phases.md` — per phase: where the target is read (create writes it; fill/observe/refresh/harvest read it)
- [x] `.claude/commands/prime.md` — add `targets/` and the PLAYBOOK greenfield section to what `/prime` reads, so a primed agent knows the option exists
- [x] Add rubric guidance to the PLAYBOOK section and `fan_out_n.md`: judge rubrics live in this repo's `specs/`, never in a target's `prompts/` (sync can't carry them there, because `specs/` isn't a sync path, but a human could still paste one into a prompt)

#### Validation — Phase 6

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `git grep -n -- '--target' README.md PLAYBOOK.md .claude/skills/sssf-sandbox-orchestrator .claude/commands/prime.md` — hits in README, PLAYBOOK, mount_one, fan_out_n, and prime
- [x] `git grep -n 'just target' README.md PLAYBOOK.md TREE.md .claude/skills/sssf-sandbox-orchestrator` — the namespace is documented in all four places
- [x] `git grep -nE 'cp .*greenfield-sandboxes/app.manifest.yaml' -- ':!specs/'` — no output: the manual manifest flip is gone from current-state docs
- [x] Fresh-agent discoverability check: in a new session run `/prime`, then ask "how do I send a team at a blank codebase with the TDD chain?" — the answer names `just target sync greenfield --push`, `just sbx mount <id> --target greenfield`, `execute … tdd`, and where the harvest lands, without reading source code
- [x] `just --list target` and `just sbx mount --help`-equivalent (`just --show sbx::mount` or the recipe comment) — the recipe comments match the docs

## Global Validation

- [x] `uv run adws/adw_modules/manifest.py get source.repo` — default target unchanged (fretboard)
- [x] `just sbx manage doctor` — host preflight OK
- [x] `just target sync greenfield --dry-run` — exit 0, zero leaks, gates green, "nothing to commit" right after a real sync
- [x] `git -C ../greenfield-sandboxes status --short` — clean
- [x] Phase 5 validation boxes all `[x]` — a real greenfield TDD arm mounted pinned, ran, harvested into the checkout, and tore down
- [x] `git status --short app.manifest.yaml` — the root manifest was never flipped at any point
- [x] `grep -c '^- \[ \]' specs/greenfield-target.md` — 0 (or only `fail`-marked items with reasons)

## Notes

### Rejected: strip the payload on the VM

The obvious "one flag" design clones this repo, then archives `apps/fretboard` and drops in an empty
shell plus a greenfield manifest. It's rejected because the leak is structural. `git log -p`,
`archive/`, `specs/c2479ca1_fretboard-explorer.md`, `app_docs/` and the harvested refs all sit in
the clone. `git clone --depth 1` plus deleting those dirs narrows it but is fragile: one new
directory that names the app and the clean room is gone without a word. A separate repo with fresh
history is the only design whose guarantee doesn't depend on remembering every place the app is
mentioned. The 2026-08-28 experiment spec reached the same conclusion.

### Rejected: `just app target greenfield` (a global manifest flip, as a recipe)

This is the user's first framing, and cheaper to build. It keeps all of Problem #2: it's global,
it blocks concurrent runs, a forgotten revert breaks the next mount, and the run record doesn't
capture the target. Per-run targeting costs one record field plus about 10 lines per phase file,
and gives concurrency and auditability for free.

### Why the leak check is designed the way it is

- **Scan the export, not the checkout.** Owned files are *supposed* to talk about the app to be
  built (`prompts/greenfield.md`).
- **Derive names; never list them in synced code.** A hardcoded `fretboard` in
  `target_sync.py` would fail its own scan, since the script lives under `sandbox_mount/`. Deriving
  from `app.name` + `archive/` also means the next `just app swap` extends the forbidden set with no
  edit.
- **Tracked files only (`git archive HEAD`).** `adws/adw_data/sessions/**` holds dozens of untracked
  files that name the app (planner prompts, bundles, event logs). An rsync of the working tree would
  ship them all.
- **Fix at the source, don't allowlist.** The only known hit, `--tag inkwell`, is stale naming
  anyway (the app is fretboard). A neutral `sssf` tag is better for both repos.
- **Commit messages are a channel too.** `factory sync <date>` only; the host sha lives in the
  gitignored json.
- **What it can't catch:** semantic leaks, like a factory prompt that happens to describe circle-of-fifths
  UI patterns. `adws/adw_data/prompt_engineering/**` is generic today; keep it that way.
  `leak_patterns` is where to add a phrase if one is ever found.

### Sync path accounting (2026-09-15)

| Path | Synced? | Why |
|---|---|---|
| `adws/` (tracked) | yes | the factory |
| `just/` minus `just/<app>.just` | yes | recipes; the app module is payload |
| `justfile` minus `mod <app>` | yes | root router |
| `sandbox_mount/` | yes | guest provisioning + host scripts (harmless on a VM, keeps parity) |
| `.claude/skills/sssf/` | yes | the in-VM factory skill + visualizer |
| `.claude/skills/sssf-sandbox-orchestrator/` | **no** | host-level skill; 20+ app mentions; agents in the VM run at factory level |
| `.claude/commands/`, other skills | **no** | host tooling; `install.md` names the app 10x |
| `.env.sample`, `LICENSE` | yes | generic |
| `apps/`, `app.manifest.yaml`, `prompts/`, `README.md`, `.gitignore` | **owned** | the target's identity |
| `archive/`, `specs/`, `app_docs/`, `ai_docs/`, `images/`, `NEXTSTEPS.md`, `PLAYBOOK.md`, `TREE.md`, `targets/` | **no** | history, rubrics, host docs |

`.gitignore` is owned rather than synced because the host's names `apps/inkwell/inkwell.db*`. The
cost is that new ignore rules must be added to greenfield by hand. That's acceptable, and noted in
the greenfield README.

### Pinning semantics

- The pin is the **pushed** sync commit. An unpushed local sync can't be cloned by a VM, so fill
  warns and runs unpinned rather than failing (the user may just be iterating). For fan-outs the
  fan_out cookbook requires `--push` first.
- An explicit `SHA` argument to fill still wins, so older greenfield commits (e.g. the exact
  2026-08-28 control bytes for a replication) stay reachable.
- `commit_sha` in the record keeps meaning "the sha actually checked out", so harvest's baseline
  logic is untouched.

### Things deliberately deferred

- **Per-target boot command.** observe/refresh hardcode `bun index.html`. The greenfield shell is a
  static Bun HTML app like fretboard, so it works today. If a target ever ships its own server, add
  optional `target.boot` then, not now.
- **Target-specific rosters.** `execute`'s CONFIG argument already picks any synced roster.
- **Multiple clean rooms** (e.g. `greenfield-api`). The design supports them: add
  `targets/<name>.yaml`, create the repo with fresh history, and sync. Bootstrapping a brand-new
  target repo (`gh repo create`) stays a manual one-time step, documented in PLAYBOOK.
- **Auto-sync on mount.** Tempting, but it would push to a public repo as a side effect of a mount
  and break pin stability mid-fan-out. Sync stays explicit.
- **A CI or pre-push check that warns when greenfield is behind this repo's factory.**
  `just target show greenfield` prints `host_sha` against current HEAD. A drift warning in
  `just sbx manage doctor` ("greenfield synced from <sha>, factory has changed since: N files") is a
  cheap follow-up.

### Risks

- **Mirror deletes.** Step 4 deletes checkout files missing from the export. The owned guard, the
  clean-tree precondition and reset-on-failure bound the blast radius to sync paths inside a
  git-clean checkout, so everything is recoverable with `git reset`. Build the dry-run first and
  read its delete list on the first real sync.
- **Greenfield's factory copy had intentional differences.** The 2026-09-15 diff shows none: every
  difference is host-ahead drift, plus the `mod fretboard` line and the `.gitignore` app rules,
  both handled. Re-check the dry-run diff for any greenfield-only edit before the first push.
- **The public repo push is outward-facing.** It's gated behind `--push` and the user's explicit
  go-ahead in Phase 3.

## Amendments

<details>
<summary>2026-09-17T05:30:04-07:00 — built on branch greenfield-target; deviations from the plan as written</summary>

Built by `/build` in one session. All boxes `[x]`; nothing fail-marked. Greenfield repo commits:
`fe71e8f` (owned README note), `66a7432` (first sync, pinned by the e2e arm), `a765e92` (final sync).

**Approach changes**
- **Leak scan runs on the export before the mirror, not after.** A leak therefore never touches the
  checkout (exit 2, "checkout untouched"), and rollback is only needed for mirror/gate failures.
  The step numbering in `target_sync.py` is 1-9 (contract check folded into preconditions).
- **Derived justfile exclusion also removes the comment line(s) directly above `mod <app>` and one
  trailing blank line**, so the synced justfile matches greenfield's hand-edited one rather than
  leaving a dangling "boot and test the payload app itself" comment.
- **Mirror adds a `.gitignore` check**: an exported file the target's `.gitignore` would swallow is a
  config error (exit 1), because `git add -A` would silently skip it.
- **Gate `manifest` also asserts** the checkout's `source.repo` equals the target file's.
- **`get-target-section NAME KEY`** was chosen over a `--section` flag; lists print one item per line.
- **`just/target.just` and `target_sync.py` are synced into greenfield** (they live under sync paths).
  Harmless there: with no `targets/` dir, `just target list` prints only `default`.

**Ordering**
- Phase 6 docs were written while the Phase 5 TDD arm ran (~50 min); the Phase 5 gate was closed
  before the docs were committed and the final sync pushed. A second `--push` sync after Phase 6 was
  expected (`just/app.just`, `mount.just`, `harvest.just` are sync paths) and approved up front.

**Validation commands replaced**
- Phase 5 VM leak grep: `grep -rniE "fretboard|inkwell"` breaks `sbx run cmd` quoting (the `|`
  splits the host command); used `grep -rni -e fretboard -e inkwell` instead. No hits.
- `git status --short app.manifest.yaml` "empty" conflicts with Phase 6's own header-comment edit.
  Checked the intent instead: `git diff a32190b -- app.manifest.yaml` is two added `#` lines, zero
  changes to `app:`/`source:`, and the file is committed (status empty at the end).
- Fresh-agent discoverability: run as a no-context subagent following `prime.md` with docs only
  (no source, no specs). It named all four required commands/landing spots. Its gaps that this plan
  owned were fixed (refresh + public-push warning in README/PLAYBOOK, checkout prerequisite,
  `execute` ADW/CONFIG args in SKILL.md, namespace count in prime).

**Phase 5 outcome, and one manual step**
- The e2e arm (`gf-e2e-20260917-cbb166`) proved target → pin → clean room → `tdd` → harvest routing →
  teardown. The ADW itself ended `✗ fail` (review_2: 20/23 requirements, 3 blocking), and **the TDD
  chain does not commit an unapproved build**, leaving it dirty on the VM. It was committed by hand on
  the run branch (`b8e5df6`, subject names it unapproved) so harvest could carry it and teardown
  could run clean. "Red-suite commit precedes the build commit" is therefore verified against the
  chain's own `commit_tests` (`b4786e4`, phase 05) preceding `build` (phase 06); the build commit
  itself is the manual preservation commit. Traces pulled to `.sandbox/traces/gf-e2e-20260917-cbb166/`.

**Files touched beyond Relevant Files**
- `just/sandbox/lifecycle/create.just` tag rename (listed in Phase 3 tasks, not Relevant Files).
- `NEXTSTEPS.md` entry records findings: builder `edit` schema failures (20/49), no typecheck gate on
  browser code, unapproved builds left uncommitted.
</details>
