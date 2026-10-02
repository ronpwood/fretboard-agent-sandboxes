---
plan: suite-changes-to-reviewer
created: 2026-10-02T14:39:11-07:00
modified:
  - 2026-10-02T14:39:11-07:00
  - 2026-10-02T14:46:05-07:00
commits:
  - 688df8d
  - ee68a3e
agents:
  - claude-opus-5-5
sessions:
  - 287ef91c-3816-4441-a002-7d055b9f0ecd
back_refs:
  - specs/grader-integrity-and-teardown-fail-closed.md — replaces its reverted suites_protected path lock (Amendments, deviation 1)
forward_refs: []
status: complete
---

# Plan: Surface test-suite changes to the reviewer

## Purpose

Before every review in the team and tdd (control) ADWs, put into the reviewer's envelope every change to a
graded test suite since the red suite was committed. The removed and changed lines go in verbatim. Builders
keep the write access they need (growing `app.test.ts`, correcting red values under amendments), and a
weakening can no longer pass unread. This is NEXTSTEPS 7.1, and it replaces the path lock reverted on
2026-10-02.

## Problem

The 2026-10-02 audit of 56 harvested bundles (CHANGELOG 2026-10-02 §1b) found 28 runs that edited a suite
after `commit_tests`, all legitimately:

- builders grew `app.test.ts` by +125 to +419 lines
- red-suite edits were 2–12 line value corrections, e.g. mtg1 V67 930→1320 under amendment A2

A path rule can't tell those from a weakening, so the lock was reverted. Today nothing shows the reviewer
that a suite changed at all:

- `durable_suite_growth` (`gates.py:266`) reports a count to the trace and never reaches the reviewer.
- The reviewer gets the build envelope (`adw_team_sdlc.py:207`, `adw_tdd_sdlc.py:176`). It can open files,
  but nothing points it at a deleted assertion.

So a builder that turns a red test green by changing `toBe(930)` to `toBe(<whatever the code returns>)`
passes `test_i` and can be approved without anyone reading that hunk.

## Solution

**Deterministic capture, delivered through the existing door.** "What changed in the suites since the red
commit" is a git fact, so code computes it and the agent is only handed the result. That is the same split
as `changes.capture` and the documenter's diff.

1. **Pin the red commit.** Right after `commit_tests`, record `red_sha = git_helper.rev("HEAD")` in both
   ADWs. `commit()` stays unchanged.
2. **`changes.capture_suites(run, since, paths) -> SuiteChanges`.** This runs `git diff <since> -- <paths>`
   against the working tree, because review happens before `commit_build`. It lists untracked files under
   the suite paths by name, writes the full diff to `context_handoff/suite_changes.diff`, and collects every
   removed line (`-`, minus the `---` header) together with its file and hunk header.
3. **`changes.suite_notes(sc, amendments: bool) -> str`.** This is a short deterministic block:
   - the stat line (`+A −R across N file(s); new: …`) and the diff path
   - every removed line verbatim, up to 60 lines, then a pointer to the file
   - one rule sentence: *"Every assertion removed or loosened needs a reason you accept; an unexplained
     weakening is a blocking finding."*
   - in the team chain only, a second sentence: *"A changed expected value must trace to an accepted
     amendment."*

   When `R == 0`, the block is a single line: `test suites since red (<sha>): +A lines, nothing removed`.
   Nothing is ever silently absent.
4. **Attach before every `review_i`.** The reviewer's `previous` envelope becomes
   `agents.with_notes(build, suite_notes)`, or `FINAL_REVIEW_NOTES + "\n\n" + suite_notes` on the last
   review. `with_notes` already serializes into `previous_envelope`, so there is no new field and no prompt
   file change.
5. **Make it measurable.** In each review phase, call `ph.log(suite_added=A, suite_removed=R,
   suite_diff=<path>)`. A later run can then correlate "R > 0" with whether the review raised it.

Paths come from the manifest (`app.test_file`, `app.generated_tests_dir`), the same source `quality.py`
uses, so greenfield and app swaps carry over. Both arms get it. That repeats the 2026-10-02 rule that
harness-level grader integrity is not a control-arm confound: the control's prompt files are unchanged,
only the notes the ADW code already injects grow.

**No gate.** Checking that the review "addressed" the suite diff would mean classifying free text by regex,
and that has burned this project before (memory: measure, don't eyeball). Visibility plus a traced count is
the build. Whether the reviewer acts on it is an experiment question (Notes).

## Relevant Files

### Existing — modified

- `adws/adw_modules/`
  - `changes.py`: add `capture_suites()` and `suite_notes()` next to `capture()`/`as_envelope()`, in the same deterministic-capture style
  - `data_types.py`: add the `SuiteChanges` model beside `ChangeSet`
- `adws/`
  - `adw_team_sdlc.py`: pin `red_sha` after `commit_tests`; build the suite notes before each `review_i` (`amendments=True`); merge them with `FINAL_REVIEW_NOTES`; log the counts
  - `adw_tdd_sdlc.py`: the same, with `amendments=False`
- `./`
  - `CHANGELOG.md`: result entry at build time
  - `NEXTSTEPS.md`: delete 7.1 once built; the follow-up experiment goes in as a new item only if Ron wants one

### New

- `adws/adw_modules/`
  - `suite_changes_selftest.py`: offline test in a temp git repo; exit 1 on any wrong assertion

## Data Models

### New
- `adws/adw_modules/data_types.py` (in memory; never persisted except as the diff file and the phase log)
  - `SuiteChanges` / `SuiteChanges(BaseModel)`: the git facts about suite edits since the red commit
    - `SuiteChanges.since`: short sha of the red commit
    - `SuiteChanges.files`: tracked suite files that differ
    - `SuiteChanges.untracked`: new, uncommitted files under the suite paths
    - `SuiteChanges.added`: insertions across the suite files
    - `SuiteChanges.removed`: deletions across the suite files (the number that matters)
    - `SuiteChanges.removed_lines`: `list[str]`, each `"<file> <hunk header> | <line>"`, in diff order
    - `SuiteChanges.diff_path`: `context_handoff/suite_changes.diff`

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

| Phase | Purpose | Done when | Status |
|---|---|---|---|
| [1. Capture and notes](#phase-1-capture-and-notes) | Deterministic suite diff and its note text | selftest green in a temp repo; replay on mtg1 shows the V67 `-` line | `complete` |
| [2. Wire into both ADWs](#phase-2-wire-into-both-adws) | Every review gets the note; counts traced | both ADWs import and compile; envelope carries the note on review_i and the final review | `complete` |
| [3. Record](#phase-3-record) | Write it down | CHANGELOG entry committed; NEXTSTEPS 7.1 removed | `complete` |

### Phase 1: Capture and notes

Selftest first, red before the code exists.

#### 1. Selftest

- [x] Create `adws/adw_modules/suite_changes_selftest.py`, run as `uv run --with pydantic --with pyyaml python -m adws.adw_modules.suite_changes_selftest`. It builds a throwaway repo in `tempfile.mkdtemp()` with `apps/a/a.test.ts` (fixed) and `apps/a/tests/generated/r.test.ts` (red). It commits that as "red", then, in the working tree:
  - appends 3 lines to `a.test.ts` (growth)
  - changes `expect(x).toBe(930)` to `expect(x).toBe(1320)` in `r.test.ts` (a correction, shape-identical to mtg1 V67)
  - deletes one `expect(y).toBe(2);` line from `r.test.ts` (a weakening)
  - adds an untracked `apps/a/tests/generated/new.test.ts`

  It then `os.chdir`s into the temp repo (`git_helper` runs in cwd) and asserts:
  - `added == 4`, `removed == 2`, `files` has both paths, and `untracked == ["apps/a/tests/generated/new.test.ts"]`
  - `removed_lines` contains `toBe(930)` and `expect(y).toBe(2);`, each prefixed with its file
  - `diff_path` exists and contains both hunks
  - `suite_notes(sc, amendments=True)` contains both removed lines verbatim, the stat line, `new.test.ts`, and the amendment sentence; `amendments=False` omits that sentence
  - **zero case:** a fresh repo with only appended lines gives `removed == 0`, and the note is exactly one line containing `nothing removed`
  - **truncation:** 70 removed lines produce exactly 60 in the note, followed by the pointer to `diff_path`

  The script prints `suite_changes selftest: N checks OK` or each failure, and exits 1 on any failure. A `run` stub needs only `context_handoff_dir`, set to a temp dir.
- [x] Run it before writing the code. It must fail on the missing import (`ImportError`); record that. → failed with `AttributeError: … no attribute 'capture_suites'` (the module existed, the function did not).

#### 2. Implement

- [x] Add `SuiteChanges` to `data_types.py` beside `ChangeSet`.
- [x] Add `capture_suites(run, since: str, paths: list[str]) -> SuiteChanges` to `changes.py`. Use `git diff --numstat <since> -- <paths>` for the counts, `git diff <since> -- <paths>` for the text, and `git ls-files --others --exclude-standard -- <paths>` for new files. Add a path-limited variant to `git_helper` only if needed (`diff_text_paths(base, paths)`). Keep `_git` raising on error: a failed capture must fail the phase loudly, never yield an empty "nothing changed".
- [x] Add `suite_notes(sc: SuiteChanges, amendments: bool) -> str` with the exact wording from Solution item 3, and `MAX_NOTE_LINES = 60` as a module constant.

#### 3. Replay on real history (offline)

- [x] Using the 2026-10-02 audit clone (`/private/tmp/claude-501/audit/greenfield`, refs `refs/audit/mtg1-20260929-37d9cd/*`; re-create it with `audit.py` if gone), `git worktree add` a scratch checkout at the parent of the build commit `995f853`, then apply `995f853` uncommitted (`git cherry-pick -n`) so the edit sits in the working tree, as at review time. Find the red sha: the mtg1 commit that adds `tests/generated/` (`git log --format=%h --diff-filter=A -- apps/app/tests/generated`). Run `capture_suites` + `suite_notes(amendments=True)` from that worktree, and paste the note into the CHANGELOG draft. Expected: the `toBe(930)` removal and the V67 title line appear verbatim, `removed` ≈ 3 (numstat said 2 in the generated file plus 1 in `app.test.ts`), and the note fits in well under 60 removed lines. → `+298 -3 across 2 file(s)`; the 3 removed lines are the V67 title (930), `toBe(930)`, and one changed import in app.test.ts. Note in /private/tmp/claude-501/replay-mtg1-note.txt.

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `uv run --with pydantic --with pyyaml python -m adws.adw_modules.suite_changes_selftest` exits 0: proves counts, removed-line capture, untracked listing, the zero case and truncation
- [x] The replay note for mtg1 contains `toBe(930)`: proves it surfaces a real amendment-tied correction from history
- [x] `uv run --with pydantic --with pyyaml python -m adws.adw_modules.permissions_selftest` still exits 0: no collateral damage to Phase 1 of the back-ref plan

### Phase 2: Wire into both ADWs

#### 1. Team ADW

- [x] `adw_team_sdlc.py`: in the `commit_tests` phase, after `commit(ph, test_design)`, set `red_sha = git_helper.rev("HEAD")` and `ph.log(red_sha=git_helper.short_sha(red_sha))`.
- [x] Define `suite_paths = [manifest test_file, manifest generated_tests_dir]` once. Read them from the manifest the way `quality.py` does (`load_manifest().app`).
- [x] Inside the review loop, before `ph.call`, compute `sc = changes.capture_suites(run, red_sha, suite_paths)` and `notes = changes.suite_notes(sc, amendments=True)`. Pass `previous=agents.with_notes(build, FINAL_REVIEW_NOTES + "\n\n" + notes if final else notes)`. → built as builder notes + final notes + suite note (see Amendments). Then `ph.log(suite_added=sc.added, suite_removed=sc.removed, suite_diff=sc.diff_path)`.

#### 2. Control (tdd) ADW

- [x] `adw_tdd_sdlc.py`: the same three edits, with `amendments=False`. Do **not** touch `adws/adw_data/prompt_engineering/*`. The control's prompts stay frozen; only ADW-injected notes change, which is the decision recorded on 2026-10-02.

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `cd adws && uv run --with pydantic --with pyyaml --with python-dotenv --with rich python -c "import adw_team_sdlc, adw_tdd_sdlc"`: both ADWs import, so no name or syntax errors
- [x] `grep -n "capture_suites\|suite_notes\|red_sha" adws/adw_team_sdlc.py adws/adw_tdd_sdlc.py` shows the pin, the capture inside the review loop, and the log in **both** files
- [x] `git diff --stat -- adws/adw_data/prompt_engineering adws/adw_data/prompt_engineering_team adws/adw_sssf_config` is empty: no prompt or roster change
- [x] Envelope check (offline): run a short snippet that builds a `BuildOutput`, applies the same expression the loop uses for `final=False` and `final=True`, and asserts `notes_for_next_agent` holds the suite note, with `FINAL_REVIEW_NOTES` before it on the final review. This proves the final review doesn't drop either note.

### Phase 3: Record

#### 1. CHANGELOG and NEXTSTEPS

- [x] CHANGELOG entry: what the reviewer now receives, with the mtg1 replay note pasted as the worked example; selftest output; the "no gate, measured instead" decision; both arms get it.
- [x] NEXTSTEPS: delete 7.1. Ask Ron whether to queue the follow-up experiment (Notes), and add it only if yes. → Ron said yes; queued as the new NEXTSTEPS 7.1.

#### Validation — Phase 3

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `grep -n "^## 2026-10-0" CHANGELOG.md` shows the new entry
- [x] `grep -n "7.1\|Surface suite edits" NEXTSTEPS.md` no longer finds the open item
- [x] `git log -1 --stat` shows the code, the selftest, the CHANGELOG and this plan in one commit

## Global Validation

- [x] `uv run --with pydantic --with pyyaml python -m adws.adw_modules.suite_changes_selftest` exits 0
- [x] `uv run --with pydantic --with pyyaml python -m adws.adw_modules.permissions_selftest` exits 0
- [x] `bash sandbox_mount/host/teardown_selftest.sh` exits 0: unrelated, but cheap insurance that nothing shared broke
- [x] `git diff 688df8d --stat -- adws/adw_data/prompt_engineering adws/adw_data/prompt_engineering_team adws/adw_sssf_config` is empty

## Notes

**Why removed lines and not the whole diff in the note.** A weakening shows up as a `-` line: a deleted
`expect`, or the old side of a changed value. Growth is all `+` lines and can run to 400 per run. Putting
every `-` line in the envelope keeps the note proportional to the risk. The full diff sits one `read` away.
60 lines covers every run in the audit: the largest was gf2-1, with 31 removed from `app.test.ts` plus 4
from the red suite.

**Why the working tree and not a commit range.** In both ADWs the build is committed only after an approved
review (`commit_build`), so at review time the builder's edits are uncommitted. `git diff <red_sha>` (tree,
not `..HEAD`) is the correct view. The revise loop keeps editing the same tree, so each `review_i` sees the
cumulative suite change since red, which is what a reviewer should judge.

**What this does not catch.** A weakening in a non-suite file the suite depends on, such as a test helper or
a fixture outside the manifest's two paths, is not captured. In the audit every edit landed in the two
manifest paths. A builder could also weaken by *adding* a line (e.g. `test.skip`, an early `return`). That
shows up as a `+` line, which only the full diff carries. Worth a later deterministic check for `.skip`,
`.only` and `todo` additions; that is a token match, not free-text classification. Deferred.

**The follow-up experiment (ask Ron before queueing).** Plant one weakening in a replay and see whether a
reviewer with this note flags it, against a reviewer without it. Cheapest form: a single `review` call on a
fixed build tree, two arms, N small. No VM is needed if it runs on the host against the scratch worktree.
This would turn "visible" into "acted on".

**Harness restraint.** The rule sentence(s) are invariants, not coaching: "an unexplained weakening is
blocking" will not date with model generations. The `MAX_NOTE_LINES` budget might; revisit at the next model
refresh along with the other ablation candidates.

**Rejected:**
- A gate that greps the review for the suite file name, which is regex classification of free text.
- Re-locking the suites for the builder only outside amendment phases, which would need phase-aware
  permissions for a problem visibility solves.
- Diffing `--word-diff`: harder for a model to read than plain unified `-`/`+`.

## Amendments

<details>
<summary>2026-10-02T14:46:05-07:00 — reviewer notes preserve the builder's own; header-parsing guard; experiment queued</summary>

**Deviation 1: note composition.** The plan's expression (`FINAL_REVIEW_NOTES + suite_note`, or `suite_note`
alone) would have overwritten `build.notes_for_next_agent`, because `with_notes` replaces the field. Non-final
reviews used to receive the builder's own notes untouched. Built instead as
`"\n\n".join(filter(None, [build.notes_for_next_agent, FINAL_REVIEW_NOTES if final else "", suite_note]))`.
Side effect: the final review now also keeps the builder's notes, which it previously dropped. Checked
offline for both cases.

**Deviation 2: extra selftest case.** A removed TS line beginning `-- ` appears as `--- …` inside a hunk. The
first parser read every `--- ` as a file header and would have dropped it. `capture_suites` now treats
`---`/`+++` as headers only between `diff --git` and the first `@@`. Selftest grew 22 → 23 checks.

**Small:** red failed with `AttributeError` (the module existed) rather than `ImportError`. The mtg1 replay
needed `sys.path` pinned to this repo, because the greenfield checkout carries its own `adws/`.

**Phase 3:** Ron approved the follow-up experiment; it is NEXTSTEPS 7.1.
</details>
