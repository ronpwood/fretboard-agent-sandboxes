---
plan: payload-app-manifest
created: 2026-08-27T18:58:46-07:00
modified:
  - 2026-08-27T18:58:46-07:00
  - 2026-08-27T19:41:05-07:00
commits:
  - 6dd748c
  - 14dca2f
agents:
  - claude-fable-5
  - claude-fable-5
sessions:
  - cc-interactive-20260827
  - cc-interactive-20260827-build
back_refs: []
forward_refs:
  - specs/tdd-red-gate-phase.md — the TDD phase consumes this manifest's `app.test_file` and `app.generated_tests_dir`
status: complete
---

# Plan: Payload App Manifest — de-hardcode the app's identity

## Purpose

Extract the payload app's identity — where it lives, how it's entered, how it's tested, and
which repo the sandbox clones — out of Python constants and a bash literal into one declarative
file, `app.manifest.yaml`, that every layer reads. After this plan, `just app swap` means editing
one YAML file instead of performing surgery on `quality.py`, `fill.just`, `observe.just`, and
`provision.sh`.

## Problem

The app's identity is currently smeared across four files in three languages, and they don't know
about each other:

- `adws/adw_modules/quality.py:47-49` — `APP_DIR`, `ENTRY`, `TEST_FILE` as Python constants. Its
  own docstring admits these are "the only things that change when `just app swap` puts a
  different app under `apps/`."
- `just/sandbox/lifecycle/fill.just:20` — the clone URL
  `https://github.com/ronpwood/fretboard-agent-sandboxes.git` as a bash literal.
- `just/sandbox/lifecycle/observe.just:37` — `APP_DIR='$HOME/app/apps/fretboard'` as a bash
  literal (plus fretboard-named log files).
- `sandbox_mount/guest/provision.sh:157` — `for dir in apps/fretboard ...` in the bun-install
  loop.

`just app swap` (`just/app.just:63-80`) ends by printing a six-step manual rewiring checklist —
that checklist is the evidence this abstraction is missing. It also blocks two experiments the
repo exists to run: from-scratch app bootstrap (repo source isn't configurable) and the
spec-to-test phase (test file locations must be data before a test-designer agent can be pointed
at them).

## Solution

One root-level manifest, one self-contained reader with a CLI, four consumers rewired to it.

**`app.manifest.yaml`** at the repo root (root-level, not inside `apps/<name>/`, so nothing has
to discover which app dir is "active" before it can read the manifest):

```yaml
# app.manifest.yaml — the single place the factory learns the payload app's identity.
# `just app swap` edits this file; quality.py, fill.just, and observe.just read it.
app:
  name: fretboard
  dir: apps/fretboard
  entry: apps/fretboard/main.ts                        # bun build target for typecheck/build
  test_file: apps/fretboard/fretboard.test.ts          # the fixed suite
  generated_tests_dir: apps/fretboard/tests/generated  # reserved — consumed by the TDD phase plan
source:
  repo: https://github.com/ronpwood/fretboard-agent-sandboxes.git   # what FILL clones into the VM
```

**`adws/adw_modules/manifest.py`** — pydantic model + `load()` + a `get` CLI. Two constraints
shape it:

1. It must be importable from other `adw_modules` files (`from .manifest import load` — but use
   NO relative imports *inside* manifest.py itself, see 2).
2. It must run standalone from bash (`uv run adws/adw_modules/manifest.py get source.repo`), which
   means: its own `# /// script` uv header (deps: `pydantic`, `pyyaml`) and zero relative imports —
   a file run by path has no package context.

```python
# CLI contract — this is what fill.just calls:
#   uv run adws/adw_modules/manifest.py get source.repo
#   -> https://github.com/ronpwood/fretboard-agent-sandboxes.git   (exit 0)
#   uv run adws/adw_modules/manifest.py get app.nope
#   -> error to stderr, exit 1 — a typo'd key must fail loudly, never print ""
```

The manifest is located by walking up from the module (or CWD for the CLI) to the repo root —
the same root `quality.py` already runs commands from (`run.repo_root`).

**Deliberately NOT in scope**: making the lint/typecheck/build/test *commands* data. The swap
message is right that per-stack commands "can't be templated safely" — the quality blocks stay
bun-shaped code; only the *paths* they operate on become data. Same for observe.just's
`bun index.html` boot command. A future app swap still rewrites those two spots; the manifest
shrinks the checklist, it doesn't pretend commands are portable.

## Relevant Files

### Existing — modified

- `adws/adw_modules/quality.py` — `APP_DIR`/`ENTRY`/`TEST_FILE` become reads from `manifest.load()`; the four quality blocks are untouched
- `just/sandbox/lifecycle/fill.just` — `REPO=` literal replaced by a manifest CLI call
- `just/sandbox/lifecycle/observe.just` — `APP_DIR` derived from `app.dir`; log filenames use `app.name`
- `sandbox_mount/guest/provision.sh` — bun-install loop globs `apps/*/` instead of naming `apps/fretboard` (no guest-side YAML read needed; `apps/` holds exactly one app by convention)
- `just/app.just` — `swap` recipe's printed checklist rewritten: step 2 becomes "edit `app.manifest.yaml`"; scaffold note added
- `adws/adw_sssf_config/sssf.config.yaml` — `app.manifest.yaml` added to `defaults.protected_files` (an agent must not be able to repoint its own grader's test file)

### Existing — deleted

- (none)

### New

- `app.manifest.yaml` — the manifest itself
- `adws/adw_modules/manifest.py` — pydantic schema, `load()`, `get` CLI

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

### Phase 1: Manifest file and reader

The schema and its single reader land first, alone, so every later phase is a mechanical rewire
against a proven interface.

#### 1. Author `app.manifest.yaml`

- [x] Write `app.manifest.yaml` at repo root with the schema from Solution, values matching today's constants exactly (byte-for-byte the same paths `quality.py:47-49` and `fill.just:20` hold now)

#### 2. Author `adws/adw_modules/manifest.py`

- [x] Pydantic models (`AppSection`, `SourceSection`, `Manifest`) with no relative imports and a `# /// script` uv header (`pydantic`, `pyyaml`)
- [x] `load(repo_root: Path | None = None) -> Manifest` — walks up to find `app.manifest.yaml`; raises with a clear message if missing
- [x] `get <dotted.key>` CLI — prints the scalar and exits 0; unknown key or missing file exits 1 with the error on stderr (never prints an empty string on the happy path)

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `uv run adws/adw_modules/manifest.py get app.dir` — prints `apps/fretboard`, exit 0
- [x] `uv run adws/adw_modules/manifest.py get source.repo` — prints the ronpwood fork URL, exit 0
- [x] `uv run adws/adw_modules/manifest.py get app.nope; echo "exit=$?"` — prints `exit=1`, error on stderr (typos fail loudly)

### Phase 2: Rewire the Python consumer

#### 1. `quality.py` reads the manifest

- [x] Replace the `APP_DIR`/`ENTRY`/`TEST_FILE` literals with values from `manifest.load()` (keep the same three module-level names so `lint`/`typecheck`/`build`/`tests` bodies stay diff-free)
- [x] Update the module docstring: "the only things that change on app swap" now points at `app.manifest.yaml`, not at this file

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `uv run adws/adw_quality.py "manifest rewire validation"` — the full deterministic quality chain (lint, typecheck, build, tests) passes through the manifest-driven paths; zero LLM agents involved (`REQUIRED_AGENTS` is empty in that script)
- [x] `grep -n "apps/fretboard" adws/adw_modules/quality.py` — zero hits; the file no longer knows the app's name

### Phase 3: Rewire the host recipes

#### 1. `fill.just` clone URL

- [x] Replace the `REPO=` literal with `REPO=$(uv run adws/adw_modules/manifest.py get source.repo)`; keep the "public repo, no auth" comment, now noting the value's source
- [x] Fail fast if the CLI call fails (`set -euo pipefail` already covers a non-zero exit; confirm the command substitution isn't in a context that swallows it)

#### 2. `app.just` swap checklist

- [x] Rewrite the printed six-step checklist: step 2 becomes "edit `app.manifest.yaml` (dir/entry/test_file/repo)"; step 5's provision.sh mention drops (Phase 4 makes it generic); keep the honest per-stack items (quality command blocks, `just/<name>.just`, observe boot command)

#### 3. Protect the manifest

- [x] Add `app.manifest.yaml` to `defaults.protected_files` in `adws/adw_sssf_config/sssf.config.yaml` — and mirror into the other four roster configs (`sssf.frontier`, `sssf.deepestseek`, `sssf.open-weights`, `sssf.top-speed`), which share the same defaults block — deviation: `sssf.frontier` had NO `protected_files` key at all; the full four-entry block was added there rather than appending to an existing one

#### Validation — Phase 3

> **Loop gate.** Do not start Phase 4 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `grep -n "github.com" just/sandbox/lifecycle/fill.just` — zero hardcoded URL hits
- [x] `grep -c "app.manifest.yaml" adws/adw_sssf_config/*.yaml` — all five roster files protect the manifest
- [x] `just app` — recipe list still renders (no just syntax breakage from the edits)

### Phase 4: Sandbox guest layer and end-to-end proof

#### 1. `observe.just`

- [x] Derive `APP_DIR` from `uv run adws/adw_modules/manifest.py get app.dir` (observe runs on the host, so the host checkout's manifest is authoritative); name log files from `app.name` instead of `fretboard`
- [x] Leave the `bun index.html` boot command as-is with a comment marking it per-app (same rationale as quality.py's command blocks)

#### 2. `provision.sh`

- [x] Change the bun-install loop from `for dir in apps/fretboard ...` to glob `apps/*/` — guest-side needs no manifest read; `apps/` holds exactly one payload by convention (enforced by `just app swap`'s archive-first behavior)

#### Validation — Phase 4

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `grep -rn "apps/fretboard" adws/ just/ sandbox_mount/` — zero hits outside comments; the factory and sandbox layers no longer name the app (`just/fretboard.just` at the repo root is the app's own module and is exempt)
- [x] `bash -n sandbox_mount/guest/provision.sh` — provision still parses
- [x] One live sandbox run — `just sbx lifecycle create/fill/setup` against a fresh VM, confirming fill clones from the manifest URL and provision's glob loop installs the app (mark `fail` with reason if credits/VM access block this; do not silently skip) — run `manifest-e2e-20260828-dab2ab`: fill cloned HEAD `14dca2f` via the manifest URL, setup gate passed 5/5; the glob loop enumerated `apps/fretboard/` and correctly *skipped* install because the app has no `package.json` (zero-dep Bun HTML entry — the old hardcoded loop skipped for the same reason); visualizer installed; VM torn down clean ($0.001 spend, key revoked)

## Global Validation

- [x] `uv run adws/adw_quality.py "post-manifest full check"` — the deterministic quality chain is green end-to-end (adw 2f65538f, 4/4 checks)
- [x] `bun test apps/fretboard/fretboard.test.ts` — the fixed suite passes, run exactly as `quality.py` will run it (287 pass, 0 fail)
- [x] `uv run adws/adw_modules/manifest.py get app.test_file` — prints the path the suite above just ran (reader and reality agree)
- [x] `git log --oneline -3` — work is committed with the plan/build/docs discipline the repo uses (`14dca2f`)

## Notes

**Why root-level, not `apps/<name>/app.yaml`.** A manifest inside the app dir is attractive (a
new app ships its own identity) but creates a discovery problem: something must know which dir
under `apps/` is active before it can read the file that says which dir is active. Root-level
kills the loop. The cost — `just app swap` edits a root file — is exactly one step on a checklist
that previously had six.

**Why the guest globs instead of reading YAML.** `provision.sh` runs on the VM where pyyaml isn't
guaranteed and every dependency fetch costs provisioning time. `apps/*/` is correct by the same
single-app convention `app swap` already enforces (archive-first). If the convention ever breaks
(two apps mounted), the glob makes provision install both — acceptable, arguably even right.

**Why commands stay code.** `quality.py`'s docstring and `app.just`'s swap message both argue the
same point from opposite ends: paths are data, commands are stack-specific judgement. A YAML field
holding `bun x oxlint@1.36.0` is a shell script wearing a config costume — it dodges review, and
`tests()`' own comment records why rediscovering commands cost "~1M tokens and 85s" once already.
This plan moves only what is safely data.

**Chicken-and-egg on fill.** `fill.just` runs on the *host* and reads the *host checkout's*
manifest — the clone target's manifest is irrelevant at fill time. No bootstrapping issue exists,
but it's worth stating because it looks like one.

**Deferred, deliberately:**
- *Blank-repo bootstrap* (`source.repo: blank` → skeleton instead of clone) — the from-scratch
  cold-start experiment. The manifest makes it a one-field change plus a small fill branch; do it
  as its own experiment after this lands.
- *Serve/boot command in the manifest* — needed only if a future app isn't a static Bun HTML entry.
- *`just/fretboard.just` renaming* — the app's own just module keeps its name; it's part of the
  payload, not the factory.

**Risk: uv cold start in recipes.** `uv run` in `fill.just`/`observe.just` adds a dependency-resolve
step on first call (~1s warm, more cold). If it annoys, the escape hatch is caching the value in the
run record at create time — noted, not planned.

## Amendments

<details>
<summary>— no amendments yet</summary>

Post-execution changes are appended here, newest at the bottom, by the `update` and `sync` workflows.
</details>

<details>
<summary>2026-08-27T19:41:05-07:00 — frontier config had no protected_files block; live run's "install" was a correct skip</summary>

Two contacts with reality during the build (commit `14dca2f`):

1. The plan assumed all five roster configs "share the same defaults block."
   `sssf.frontier.config.yaml` had **no `protected_files` key at all** — the other
   four had the three-entry block. Fix: the frontier config gained the full
   four-entry block (the three standard protections plus `app.manifest.yaml`)
   rather than an appended line. This also closes a pre-existing gap: frontier
   builders previously had no protected-files guard whatsoever.

2. Phase 4's live-run box says "provision's glob loop installs the app." The
   fretboard app has no `package.json` (zero-dependency Bun HTML entry), so the
   glob loop found `apps/fretboard/` and correctly took the skip branch — same
   behavior as the old hardcoded loop. The check's real target (the loop
   enumerates `apps/*/` generically and the mount still gates healthy) passed:
   run `manifest-e2e-20260828-dab2ab`, gate 5/5, torn down clean.
</details>
