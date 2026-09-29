---
plan: team-default-consolidation
created: 2026-09-28T17:58:29-07:00
modified:
  - 2026-09-28T17:58:29-07:00
  - 2026-09-28T18:11:05-07:00
commits:
  - 4711419
  - edc2507
agents:
  - claude-opus-5-5
sessions:
  - 9d28666e-26a9-464e-b844-ceed596f84d8
back_refs:
  - specs/team-ownership-prompts.md — built the team arm this plan makes the default; its inputs must come out byte-identical
forward_refs: []
status: complete
---

# Plan: Make the team arm the default, freeze tdd as the control, and archive the dead rosters

## Purpose

This is NEXTSTEPS item 2b. After this change the team ADW (`adw_team_sdlc.py` + `sssf.team.config.yaml`)
is what you get when no workflow is named: `sbx lifecycle execute` defaults to `team`, and every
documented greenfield call uses it. `tdd` with `sssf.config.yaml` becomes a **frozen, named control**,
kept runnable and unchanged. The six rosters that nothing runs move to `archive/`. None of this may
change a single byte of either arm's inputs, so the meeting-planner run (item 3) doubles as the
post-cleanup smoke test.

## Problem

- **The defaults point at a workflow no experiment uses.** `just/sandbox/lifecycle/execute.just:48`
  defaults `ADW="sdlc"`, which is `adw_plan_build_test.py`. Every greenfield run since 09-18 passed
  `"" tdd` or `"" team` explicitly. The team arm is now the working hypothesis: team2 shipped 0 defects,
  and amort2 was exact where the control missed the half-cent tie (CHANGELOG 2026-09-26g, 2026-09-28d).
- **Six rosters are dead weight.** asymmetric, deepestseek, inverse, open-weights and top-speed still
  pin `0731`, which is not the default model. `dsflash41` duplicates the default. No code names any of
  them. Only two folder-wide globs reach them: `target_sync.py:333-341` (`VALIDATE_ROSTERS`) and
  `just obs rosters`. Docs mention them in `PLAYBOOK.md:71-72`, `fan_out_n.md:71`, and
  `prompts/demo/01-fan-out-five-rosters.md`, which is a demo that fans out three of them.
- **The obvious archive layout would break the greenfield sync.**
  `target_sync.py:forbidden_patterns()` (247-253) turns **every** directory name under `archive/` into a
  case-insensitive leak pattern. It was built for retired payload apps (`inkwell-20260815-053427` →
  `inkwell`). Something like `archive/adw_sssf_config/` would make `adw_sssf_config` forbidden, and
  every synced file would then "leak" (exit 2). I verified this against the code on 2026-09-28.

## Solution

Four decisions (Ron, 2026-09-28):

1. **Scope is rosters only. Every ADW stays.** The 12 upstream composables are referenced all over the
   sssf and orchestrator skills. `adw_prompt.py` is a provisioning check (`provision.sh:301-305`).
   Cutting ADWs becomes its own item later.
2. **`frontier` and `gemniflash` stay live.** Each is a working single-vendor roster, useful for an A/B.
3. **"`just adw` runs team" means the *orchestration* default.** It cannot literally mean a bare
   `just adw "prompt"`: just reads the first argument as the recipe name, and the bare `just adw` is the
   recipe list (`adws.just:25`), which stays. What changes is `execute`'s `ADW` default, plus every
   documented call site. The module also gets `alias control := tdd`, so the control has a name that
   says what it is.
4. **The leak check is narrowed rather than dodged.** `forbidden_patterns()` will read only `archive/`
   entries that match `ARCHIVE_SUFFIX` (`-YYYYMMDD-HHMMSS`). That suffix is exactly what `just app archive`
   writes (`app.just:36`), so every retired app is still a pattern. Factory retirements go under
   `archive/factory/`, which carries no suffix and so never becomes a pattern. The alternative was a
   directory name chosen never to appear in synced files, which is a trap waiting for the next person.

**The byte-identity contract.** Before the change, the base is `4711419`. After it, this must print
nothing:

```bash
git diff --stat 4711419 -- \
  adws/adw_modules adws/adw_data \
  adws/adw_team_sdlc.py adws/adw_tdd_sdlc.py \
  adws/adw_sssf_config/sssf.team.config.yaml adws/adw_sssf_config/sssf.config.yaml \
  sandbox_mount/guest/models.json.tmpl
```

That set is the whole input surface of both arms:

- **Prompts:** `prompt_engineering_team/` and `prompt_engineering/`.
- **Extensions:** `harness_engineering/`, which holds `bash_timeout.ts`, `subagents.ts` and `themeMap.ts`.
- **Gates:** everything in `gates.py`, plus `team_spec.py`.
- **Quality:** `quality.py`, `render_smoke.py` and `data_types.py`.
- **The two chains and their two rosters.**
- **The guest model registry.**

`adw_modules` is shared by every ADW, so this plan touches **nothing** in it.

## Relevant Files

### Existing — modified
- `sandbox_mount/host/`
  - `target_sync.py` — `forbidden_patterns()` takes only `ARCHIVE_SUFFIX`-matching `archive/` entries
- `just/sandbox/lifecycle/`
  - `execute.just` — `ADW="team"` default (line 48); comments at 23, 29, 35-36 and 91 say team/control instead of sdlc
- `just/`
  - `adws.just` — `alias control := tdd`; comment above `tdd` marking it the FROZEN control; the recipe bodies are unchanged
  - `target.just` — usage comment line 12: `"" tdd` → `""` (team is the default); mention `"" control` for the control arm
  - `app.just` — `list` (line 47) hides `factory/`, so it keeps listing only retired apps
- `archive/`
  - `README.md` — two kinds of entry now: suffixed payload apps, which are leak patterns, and `factory/`, which is inert factory history and never a pattern
- `./`
  - `PLAYBOOK.md` — §3 roster list (71-72) drops the archived three; line 209 greenfield usage → team default + control
  - `README.md` — line 211 usage → team default; line 141 "Twelve ADWs" → the true count (14)
  - `TREE.md` — roster listing and "12 workflows"/"14 ADW recipes" counts fixed (it is 14 scripts and 16 recipes, plus the alias)
  - `NEXTSTEPS.md` — item 2b removed on close; the CURRENT STATE roster table drops the six and gains the team roster
  - `CHANGELOG.md` — result entry `2026-09-28e` (or whichever tag is next)
- `.claude/skills/sssf-sandbox-orchestrator/`
  - `SKILL.md` — lines 91 and 114, `"" tdd` → team default / `control`
  - `cookbooks/fan_out_n.md` — line 71 example array without `asymmetric`; lines 82, 135 and 145 (see Notes on 145)
  - `cookbooks/execute_work.md` — lines 126 and 129
  - `references/models.md` — drop the archived rosters from any roster list (keep the `0731` registry notes)

### Existing — deleted
Nothing is deleted. The six rosters and the demo prompt are **moved** with `git mv`, so history follows them:
- `adws/adw_sssf_config/`
  - `sssf.asymmetric.config.yaml` → `archive/factory/rosters/`
  - `sssf.deepestseek.config.yaml` → `archive/factory/rosters/`
  - `sssf.inverse.config.yaml` → `archive/factory/rosters/`
  - `sssf.open-weights.config.yaml` → `archive/factory/rosters/`
  - `sssf.top-speed.config.yaml` → `archive/factory/rosters/`
  - `sssf.dsflash41.config.yaml` → `archive/factory/rosters/`
- `prompts/demo/`
  - `01-fan-out-five-rosters.md` → `archive/factory/prompts/demo/`. It fans out three archived rosters with `simple_sdlc` on a retired app's prompt, so the demo cannot run as written.

### New
- `archive/factory/`
  - `README.md` — what is here, why, the date, how to restore (`git mv` back; `0731` is still registered, so a restored roster runs without re-provisioning)

## Implementation Phases

Status markers: `- [ ]` idle · ``- [x] `wip` `` in progress · `- [x]` complete · ``- [x] `fail` `` failed (with reason).

| Phase | Purpose | Done when | Status |
|---|---|---|---|
| [1. Unblock the archive](#phase-1-unblock-the-archive) | Leak check stops treating non-app archive dirs as patterns | a scratch `archive/factory/` yields no new pattern; `inkwell` still does | `complete` |
| [2. Archive the rosters](#phase-2-archive-the-rosters) | Move six rosters + the dead demo | 4 rosters remain; byte-identity diff empty | `complete` |
| [3. Flip the defaults](#phase-3-flip-the-defaults) | team is the default workflow; tdd is the named control | `just --dry-run` shows `adw_team_sdlc.py` for execute's default | `complete` |
| [4. Docs](#phase-4-docs) | Operational docs match the code | no live doc names an archived roster or `"" tdd` as the default | `complete` |
| [5. Prove it on greenfield](#phase-5-prove-it-on-greenfield) | Sync passes; greenfield's arm inputs unchanged | sync exit 0; greenfield diff of arm inputs empty | `complete` |

### Phase 1: Unblock the archive

`archive/factory/` must exist before anything moves into it, so the leak check has to change first.

#### 1. Narrow `forbidden_patterns()`

- [x] In `sandbox_mount/host/target_sync.py:247-253`, add `if ARCHIVE_SUFFIX.search(d.name)` to the set comprehension, so only `<name>-YYYYMMDD-HHMMSS` directories contribute a pattern. Update the comment next to `ARCHIVE_SUFFIX` (line 66) to say this is now the *definition* of a retired-app archive.

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `mkdir -p archive/factory && uv run python -c "import sys; sys.path.insert(0,'sandbox_mount/host'); import target_sync as t, manifest; cfg=manifest.load_target('greenfield') if hasattr(manifest,'load_target') else {'leak_patterns':[]}; p=t.forbidden_patterns(cfg,'fretboard'); print(p); assert 'inkwell' in p and 'factory' not in p"`. This proves the retired app is still a pattern and the factory dir is not. Adapt the cfg loader to whatever `target_sync` uses at its call site. The asserts are the point.

### Phase 2: Archive the rosters

#### 1. Move the files

- [x] `git mv` the six rosters into `archive/factory/rosters/` and the demo into `archive/factory/prompts/demo/`.
- [x] Write `archive/factory/README.md`. Update `archive/README.md` for the two kinds of entry.
- [x] Leave `sssf.config.yaml`, `sssf.team.config.yaml`, `sssf.frontier.config.yaml` and `sssf.gemniflash.config.yaml` untouched, including their headers. `inverse` and `asymmetric` mention each other in their headers, and they move together.

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `ls adws/adw_sssf_config/` — exactly `sssf.config.yaml sssf.frontier.config.yaml sssf.gemniflash.config.yaml sssf.team.config.yaml`
- [x] `just obs rosters` — lists those four and exits 0
- [x] The byte-identity diff (see Solution) prints nothing
- [x] `grep -n 0731 sandbox_mount/guest/models.json.tmpl just/sandbox/lifecycle/setup.just` — both hits still present (the Do-NOT-tidy rule, and gate D's hardcoded ping)

### Phase 3: Flip the defaults

#### 1. `execute` defaults to team

- [x] Change `just/sandbox/lifecycle/execute.just:48` to `ADW="team"`. Rewrite the comments at 23, 29, 35-36 and 91 so they name `team` as the default and `control`/`tdd` as the frozen control. An empty `CONFIG` then gives the team roster through `adws.just:14`: `SSSF_CONFIG` never crosses ssh, so on the VM it falls back to the team default.

#### 2. Name the control

- [x] In `just/adws.just`, add `alias control := tdd` next to the `tdd` recipe, and a comment saying that `tdd` + `sssf.config.yaml` is the FROZEN control arm, not to be edited (see this spec). Leave both recipe bodies byte-identical.
- [x] Setup gate C's fallback (`setup.just:189`) still pings `sssf.config.yaml`. **Leave it.** The team roster is the default roster's models (`sssf.team.config.yaml:1`), so gate C covers both arms. Changing it would put a setup change into the same commit as the default flip for no gain.

#### Validation — Phase 3

> **Loop gate.** Do not start Phase 4 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `just --dry-run adw team x 2>&1 | grep -q 'adw_team_sdlc.py --config adws/adw_sssf_config/sssf.team.config.yaml'` — team recipe unchanged
- [x] `just --dry-run adw control x 2>&1 | grep -q 'adw_tdd_sdlc.py --config adws/adw_sssf_config/sssf.config.yaml'` — the alias resolves to the unchanged control
- [x] `grep -n 'ADW="team"' just/sandbox/lifecycle/execute.just` — the default is flipped
- [x] `just --list sbx::lifecycle` (or `just sbx lifecycle --list`) parses. This proves the edited module still loads.
- [x] The byte-identity diff still prints nothing

### Phase 4: Docs

#### 1. Operational docs

- [x] Edit every file listed under *Existing — modified* in `./`, `just/target.just`, and the orchestrator skill. The rule: the team arm is the default and needs no `ADW` argument; the control is `"" control` (or `"" tdd`); no live doc lists an archived roster.
- [x] Leave CHANGELOG, `specs/*` (results and preregistrations) and `ai_docs/` history alone. They are records, not instructions.
- [x] Leave `.claude/skills/sssf/templates/` alone. It is the upstream installer's stale partial copy, already out of step with `adws/`, and out of scope (see Notes).

#### Validation — Phase 4

> **Loop gate.** Do not start Phase 5 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `grep -rnE 'asymmetric|deepestseek|inverse\.config|open-weights|top-speed|dsflash41' --include='*.md' --include='*.just' --include='*.py' --include='*.yaml' . | grep -vE '^(\./)?(\.sandbox|archive|specs|CHANGELOG\.md|ai_docs)/?'` — no live reference to an archived roster (NEXTSTEPS may only mention them as archived)
- [x] `grep -rn '"" tdd' --include='*.md' --include='*.just' . | grep -vE '^(\./)?(\.sandbox|archive|specs|CHANGELOG\.md)'` — each surviving hit is explicitly labelled as the control arm

### Phase 5: Prove it on greenfield

This does the sync without the push. Item 3 already begins with `sync --push`, and pushing is outward.
**Run it with nvm node v22 on PATH** (memory: pi on node 24; the sync runs `bun`, which is unaffected, but the
existing NEXTSTEPS note says v22).

#### 1. Sync

- [x] Commit phases 1–4 on host `main`.
- [x] Note greenfield's HEAD, which should be `61a6e45` or later: `git -C ../greenfield-sandboxes rev-parse --short HEAD`.
- [x] `just target sync greenfield` (no `--push`).

#### Validation — Phase 5

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] The sync exits 0. The leak check, manifest, `bun build`, `bun test` and roster validation all pass.
- [x] `git -C ../greenfield-sandboxes diff --stat <pre-sync HEAD> HEAD -- adws/adw_modules adws/adw_data adws/adw_team_sdlc.py adws/adw_tdd_sdlc.py adws/adw_sssf_config/sssf.team.config.yaml adws/adw_sssf_config/sssf.config.yaml sandbox_mount/guest/models.json.tmpl` prints nothing. This proves the arms greenfield will run are byte-identical.
- [x] `ls ../greenfield-sandboxes/adws/adw_sssf_config/` — the same four rosters (the mirror deleted the six)
- [x] `git -C ../greenfield-sandboxes log -1 --format=%s -- prompts/meeting-planner.md` — the meeting-planner brief commit survived the sync

## Global Validation

- [x] The byte-identity diff against `4711419` prints nothing on host `main`
- [x] `git status` is clean, and `git log --stat 4711419..HEAD` shows only the files in Relevant Files plus the moves
- [x] NEXTSTEPS: item 2b is removed, item 3 is updated so step (3) mounts `team` (default) plus `control` on the same brief, and the CURRENT STATE table is corrected
- [x] The CHANGELOG entry records the base SHA, the four decisions and the byte-identity result

## Notes

**Why not literally make bare `just adw` run team.** `just adw` with no arguments lists recipes. With
arguments, the first one is the recipe name, so `just adw "a prompt"` would look up a recipe called
"a prompt". The only literal reading would make `default` the team recipe, and then a bare `just adw`
would fail on a missing prompt instead of showing the menu. The recipe name `team` is short enough to
type. What actually carried the old default was `sbx lifecycle execute`, and that is where the flip lands.

**`fan_out_n.md:145` passes `adws/adw_sssf_config/$ROSTER` explicitly.** On the team recipe, an explicit
`--config` wins (argparse keeps the last one). So a fan-out that names a non-team roster while calling
`team` runs the team *chain* on that roster's prompts. The default planner is never asked for the spec
form, so it fails `spec_form` (`adw_team_sdlc.py:44`). The doc edit should say: team fans out over
`sssf.team.config.yaml`-derived rosters only. For now that is one roster, so a team fan-out is N
replicates, not N models.

**Rejected: renaming `tdd` → `control`.** Six CHANGELOG entries and 30 spec lines say `tdd`. The alias
gives the control a clear name without making every historical record point at a recipe that no longer
exists.

**Rejected: moving gate C's fallback to the team roster.** Same models, no coverage gain, and it
couples a setup change to the default flip.

**Out of scope, recorded so it isn't lost:**
- **The ADW cut.** 12 composables, heavily referenced by `.claude/skills/sssf/` and the orchestrator's
  `just_command_model.md`. It needs its own inventory against the skill docs.
- **`.claude/skills/sssf/templates/`.** It is 11/14 ADWs, is missing `tdd`/`team`/`manifest`/`render_smoke`/`team_spec`,
  and has 335 lines of `gates.py` drift. An installer on it would install a factory without the arm we now
  default to. That belongs to the ADW cut or to a "re-template" item. It is synced to greenfield, but nothing
  there runs it.
- **The next lever** from NEXTSTEPS 2b: a gate requiring the key to hold a row per named edge class of the domain.

**Risk: the greenfield mirror deletes.** The sync mirrors the export into the checkout, so the six
rosters disappear from greenfield too. That is intended. Greenfield's history keeps them, and
`archive/factory/` holds the host copies.

**Risk: meeting-planner brief `61a6e45` is local and unpushed in greenfield.** The sync rewrites
factory paths, not `prompts/`, so the brief should survive. The last Phase 5 box checks it rather than
assuming it.

## Amendments

<details>
<summary>2026-09-28T18:11:05-07:00 — build deviations: more doc call sites, a corrected grep filter, a Phase 1 command fix, node v24</summary>

The build ran as planned, and every gate passed. Where it departed from the spec:

- **More doc files than listed.** The Phase 4 grep found live references the inventory had missed,
  all fixed:
  - `.claude/commands/install.md:71`: "expect five rosters".
  - `.claude/commands/prime.md:25`: `"" tdd`.
  - `references/kickoff_paths.md:30`: top-speed example → frontier.
  - `references/models.md`, three rows. The "In a roster?" column was stale: 0731 is now
    "registered only", and glm-5.3 and gemini-3.8 are "default + team".
  - `PLAYBOOK.md:109`: default `sdlc`.
  - `execute.just:9`: header comment.
  - `fan_out_n.md:123`: signature.
  - `README.md:147`: "five rosters ship".
- **`fan_out_n.md` loop reshaped.** It now loops over `"roster adw"` pairs (`ARMS=(…team… …control…)`),
  not over roster names. This follows the Notes finding that team only runs on the team roster.
- **The `tdd` recipe's comment was reordered.** `just --list` shows a recipe's *last* comment line,
  so the description now ends with "FROZEN CONTROL: …" instead of a spec path.
- **The Phase 1 validation command was wrong.** It needed `uv run --with pyyaml --with pydantic`
  and `target_sync.load_config('greenfield')`. The asserts are unchanged, and they passed.
- **The Phase 4 grep filters were wrong.** `grep -rn … .` prints paths without a `./` prefix, so
  `^\./(…)` excluded nothing. Both commands were corrected in place to `^(\./)?(…)`.
- **Phase 5 node.** It ran on default node v24, not v22. Memory `pi-on-node-24` (2026-09-28)
  supersedes the NEXTSTEPS note. The sync gates passed, including rosters.
- **Sync result.** Greenfield `b4906f7` ("factory sync 2026-09-29", on `61a6e45`), not pushed.
  The greenfield identity diff `61a6e45..HEAD` over the arm inputs is empty. Byte compares
  host↔greenfield of both chains, both rosters, `adw_modules` and `prompt_engineering_team` are
  identical.
</details>
