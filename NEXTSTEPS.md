# Next Steps

Notes from a first end-to-end session with the sandbox mount system: install → mount →
execute an ADW ("add dark / light mode") → observe live → harvest → teardown. The loop
worked. It also surfaced one real bug, caught only because the harvested commit was
checked before trusting it. Recorded here so the fix has the reproduction, not just the
symptom.

## What happened

- `just sbx mount my-task` failed twice before succeeding: once on an invalid
  `OPENROUTER_PROVISIONING_KEY` (a regular API key was used instead of a management key —
  OpenRouter's UI puts these in different places, `openrouter.ai/settings/management-keys`,
  not the API Keys page), once on the VM's SSH not answering inside the 60s boot window
  (the VM was fine seconds later — resumed the chain by hand from `fill` instead of
  re-minting a second VM+key).
- Once mounted, the full plan → build → test → commit chain ran cleanly: planner
  (`gemini-3.6-flash`) produced a plan, builder (`deepseek-v4-flash-0731`) implemented it,
  the existing 30-test suite passed, and a commit landed. Cost reported ($0.6749)
  reconciled exactly against OpenRouter's own usage dashboard.
- The dark/light toggle worked live in the browser on the running VM.
- The commit that was harvested back to the host contained **only the plan document**
  (`specs/91b90608_dark-light-mode.md`) — none of the actual `apps/inkwell/public/*`
  changes the builder implemented and that were visibly working. The teardown-time
  artifact backup didn't catch it either (it only mirrors `specs/`, `app_docs/`, and the
  trace DB). The VM was destroyed before this was noticed. The implementation is gone;
  only the plan survived.

## Root cause

`adws/adw_modules/data_types.py` — `BuildOutput` has a dedicated field for exactly this:

```python
class BuildOutput(EnvelopeBase):
    changed_files: list[str] = Field(default_factory=list)
    commit_message: str = ""
```

But the build phase's gate, in `adws/adw_plan_build_test.py`, only wires up:

```python
gates=[gates.artifacts_exist]
```

`gates.artifacts_exist` (in `adws/adw_modules/gates.py`) checks `envelope.artifacts` —
the field inherited from `EnvelopeBase`, not `changed_files`. The builder can leave
`artifacts` empty (or never populate it) and the gate iterates zero items and reports a
vacuous pass ("0 checked" — which was visible in the run log and should have been the
tell). Nothing downstream ever verified the builder actually changed what it claimed to.

## Changes worth making, most important first

All six items below are now DONE (2026-08-15). By the time this session ran, item 1's
build-phase gate was already `diff_matches_claims` (not `artifacts_exist`) everywhere
except `adw_plan_build_test.py` — the vacuous-pass hole existed in `diff_matches_claims`
itself too (an empty `changed_files` produced zero checks, zero violations, `passed=True`
regardless of which gate name was wired up), so the real fix is in the gate, not the name.

1. ~~**Wire the build-phase gate to `changed_files`, not `artifacts`.**~~ DONE.
   `gates.diff_matches_claims` (`adws/adw_modules/gates.py`, mirrored in
   `.claude/skills/sssf/templates/`) now asserts `changed_files` is non-empty as its own
   check, so it fails closed instead of vacuously passing. `adw_plan_build_test.py`'s two
   `BuildOutput` phases were also switched from `artifacts_exist` to `diff_matches_claims`,
   matching every other build/fix/revise phase in the codebase. Verified against empty,
   real, and bogus `changed_files`.

2. ~~**Refuse (or auto-stash) teardown when the VM's working tree is dirty.**~~ DONE, as
   refuse (not auto-stash — a stash nobody pops is exactly as lost as never harvesting).
   `teardown.just` runs `git status --porcelain` on the VM after harvest, before revoke/
   destroy, and aborts with the VM left alive if the tree is dirty. Escape hatch:
   `--force-dirty`.

3. ~~**Harvest the live trace DB, not whatever copy sits in the repo tree.**~~ DONE — and
   the root cause was more specific than "wrong copy": `tracer.py` runs `sssf.db` in WAL
   mode, so recent events sit in `sssf.db-wal` until checkpointed, and a plain copy of
   `sssf.db` alone can miss them even though the path was always correct. `teardown.just`
   now runs `PRAGMA wal_checkpoint(FULL)` on the VM immediately before pulling the
   artifact tar, best-effort (a failed checkpoint still copies whatever the main file has).

4. ~~**Loosen or make adaptive the SSH boot-wait in `create.just`.**~~ DONE — 60s → 120s,
   fixed 2s polling → backoff growing to a 10s cap, and a failed wait now prints the exact
   manual-resume command (`just sbx lifecycle fill <run-id>`) instead of leaving it to be
   rediscovered by hand.

5. ~~**Reduce the OpenRouter key friction.**~~ DONE. `.env.sample` and `README.md` now
   point at `openrouter.ai/settings/management-keys` (not `/settings/keys`) with an
   explicit "different page" callout. `just sbx manage doctor` gained a live check that
   calls `/api/v1/keys` and names "wrong key type" on 401/403 instead of a bare failure;
   `create.just`'s mint-failure path gives the same diagnosis. Verified live against this
   host's real provisioning key.

6. ~~**Validate `models.json.tmpl` cost blocks at the source, not just in `doctor`.**~~
   DONE. `provision.sh` now runs the same cost-block schema check immediately after
   rendering `~/.pi/agent/models.json`, failing the provision step by name instead of
   waiting for a human to run `doctor` afterward. Verified against the real template
   (passes) and a deliberately broken one (fails, naming the exact model id).

## Opportunity: judged best-of-N

The mount → execute → harvest → teardown loop generalizes cleanly to fan-out: same
prompt, N model rosters, N sandboxes in parallel, N harvested branches to compare. The
merge step should **not** be automatic — either a human reviews the diffs, or a dedicated
verifier/judge agent scores each branch against explicit, checkable criteria (tests
green, benchmark numbers, diff size, adherence to the plan) and only recommends. Given
what just went wrong at 1x scale, item 1 above is a prerequisite for this — running best-
of-N before fixing the gate just multiplies the chance of "gate passed, code missing" by N.

## SWOT — Factory In A Box (Inkwell + SSSF + sandbox mount)

### Strengths

- Real credential isolation, not just documented: the exe.dev account and
  `OPENROUTER_PROVISIONING_KEY` never leave the host; sandboxes get a disposable, capped
  ($50) runtime key revoked at teardown — verified this session, including confirming the
  key's absence from OpenRouter's own key list after revocation.
- Deterministic control flow around non-deterministic agents: the ADW scripts are plain,
  readable Python owning the graph; agents only fill bounded phases.
- Idempotent, ordered lifecycle: six phases, one shared run-record file, explicitly
  ordered so a crash leaves a recoverable handle — proven this session by resuming
  fill → setup → observe by hand after a `create` timeout.
- Fast, cheap toolchain: no apt, no heavy base image, bun/just from CDN in seconds; the
  app itself is a zero-dependency Bun + `bun:sqlite` server.
- Unusually good documentation for the scale of the project — `TREE.md` and the `.just`
  recipe comments explain *why*, not just *what*.
- Cost accounting reconciles exactly against the upstream provider's own dashboard —
  confirmed this session ($0.6749 reported vs. $0.67 shown on OpenRouter).

### Weaknesses

- Self-reported verification with a confirmed real gap in it (see Root cause above).
- The fixed 30-test suite can't catch a missing feature it was never told to check for.
- Harvest only pulls committed git history; no working-tree safety net before teardown.
- External-service UX friction leaks into the workflow (key-type naming mismatch, boot
  timeout tuned too tight) — both hit firsthand this session.
- Single point of schema fragility in the model registry (partial cost block drops the
  entire roster silently).

### Opportunities

- Judged best-of-N fan-out (see above).
- Close the gate gap and add the pre-teardown dirty-tree check — both are small, specific
  fixes with an already-reproduced failure to test against.
- A pre-teardown trace DB sync, turning "we can't tell what happened" into a debuggable
  incident every time.

### Threats

- Two-vendor dependency (exe.dev + OpenRouter) for the whole "run the loop" experience;
  outages or UI/API drift on either side (as experienced) cost real setup time.
- Cost creep at scale: best-of-N multiplies the exact silent-failure vector found here by N,
  unless the gate fix lands first.
- Model roster drift as providers rename or deprecate IDs; `doctor` validates the key, not
  that every configured model ID still resolves.

### Update (2026-08-15)

All six items in "Changes worth making" above are now done — the gate gap (Weaknesses
item 1), the missing working-tree safety net (item 3), and the OpenRouter key-type
friction (item 4) are closed. The payload app is also no longer Inkwell: it was swapped
for a fretboard/music-theory app via `just app swap`, archived at
`archive/inkwell-20260815-053427/`. Model roster drift (the one remaining Threat) is
still open — nothing in this session touched it. Best-of-N fan-out no longer has the
gate prerequisite blocking it.
