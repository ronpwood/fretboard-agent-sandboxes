# Changelog

Dated session log for the sandbox mount system, the factory, and the payload app. It holds
findings, measurements, fixes and their reproductions, in **chronological order (oldest first)**.
Each entry is cited by its date tag, e.g. `CHANGELOG 2026-09-23e`.

The open queue lives in [NEXTSTEPS.md](NEXTSTEPS.md). When an item there closes, write its
result entry here and delete it from NEXTSTEPS.

Entries through 2026-09-23e were written in `NEXTSTEPS.md` and moved here unchanged, so a
reference such as "NEXTSTEPS 2026-09-20" in older specs or commits now points to this file.

## Before 2026-08-15 — first end-to-end session

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

## Session (2026-08-18): first single-VM smoke test since the app swap

Ran the `triad-playback` task (`prompts/09-triad-playback.md`) end-to-end through
mount → fill → setup → observe → execute → harvest → teardown, for real, on one VM.
The loop worked and the `diff_matches_claims` gate fix from the 2026-08-15 update was
proven live (build gate correctly verified 4 claimed files actually changed). It also
surfaced two infrastructure bugs that had nothing to do with the ADW itself — both are
now fixed.

### Bug 1: `create.just`'s SSH-boot-timeout diagnosis was wrong

`create` failed twice with "ssh never answered on `<vm>`.exe.xyz within 120s" — the
exact symptom the 2026-08-15 update's item 4 (60s → 120s, backoff) was supposed to have
fixed. It hadn't recurred because of timing; the real cause was `ssh -o BatchMode=yes ...
true` failing immediately with `Host key verification failed`, which the wait loop's
`>/dev/null 2>&1` swallows, so every failure — instant or after 120s — reports as a
timeout.

Root cause: `ai_docs/exedev_sandbox_mounting.md` already documents that every `*.exe.xyz`
VM presents the same RSA host key as `exe.dev` itself
(`SHA256:JJOP/lwiBGOMilfONPWZCXUrfK154cnJFXcqlsi6lPo`) and says to add one wildcard
`known_hosts` line so future sandboxes connect non-interactively. That line was never
actually added — `~/.ssh/known_hosts` only had literal per-hostname entries for the two
VMs someone had manually SSH'd into before. Every *new* run id (a new hostname every
time, by design) had no matching entry and `BatchMode=yes` can't prompt, so it failed
outright rather than being slow.

Fixed by hand this session (host-local `~/.ssh/known_hosts`, not a repo change):
```
*.exe.xyz ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDEKtEcRW8OBtro5B/MG+EaisD+ZVwwHFa5m7M8wFwBlMmPJJssY+1aGBRW3b9InAeCnTU2Kt7gazqbg/9od1KnK6x5piQNVQZ4C/lrjsC2ScBrOydnw9ry9G2+voFCAk+dQGabIrIT6gqqDJNOqxgFiG/lA3Xx6KwpfwI2BH5f3ab2fHCR2BGAC5jlB2RJXPgly80hMxYEHqexhJxYRwC+deeLrQSG795we9rSzPmdz58t9+9jLTKkyyqWKe/hmBvty1AYrEmRsefu6/TUrIGi/UWJfa+RBIQtFgWqN6xT1F6rRwELeVOfwwr5tZbsmgWY5frZU3EOtVWcF7Ve3gfL
```
Worth doing properly: either have `create.just` add this line itself on first run (it
already knows the fingerprint is constant), or at least surface ssh's real stderr in the
timeout message instead of swallowing it — a wrong diagnosis costs more debugging time
than a timeout ever should.

### Bug 2: `fill.just` cloned the wrong repo entirely

Even after fixing SSH, `setup` passed its health gate but `observe` failed —
`apps/fretboard` didn't exist on the VM. `fill.just` clones a hardcoded URL,
`https://github.com/disler/inkwell-agent-sandboxes-and-software-factory.git` — the
original public template this project started from. This repo's `origin` was still
pointed at that same URL, and local `main` was 5 commits ahead of `origin/main`
(unpushed): the entire app swap (`4d84a68`), the gate fix (`cb35ac9`), and everything
after. Every sandbox mount was therefore always going to clone pre-swap, pre-gate-fix
Inkwell code, regardless of what was sitting in the local working tree — there is no
"local working tree" concept in this design at all; the VM is a pure client of whatever
`origin/main` is on GitHub.

This surfaced a real ownership question: `origin` was never a fork, it was IndyDevDan's
own upstream repo, so pushing local work there would have been both wrong (not our repo)
and almost certainly impossible (no write access).

Fixed: created `ronpwood/fretboard-agent-sandboxes` (public, to keep `fill.just`'s
unauthenticated `git clone` working unchanged), repointed `origin` there, pushed all 6
local commits, and updated `fill.just`'s `REPO=` line to match. A VM with a stale local
clone (from before this fix) needed its `app/` directory removed by hand before a re-fill
would pick up the new `REPO` — fill only uses that variable on a *fresh* clone; an
existing `app/.git` re-fetches from whatever remote it already has.

### The smoke test itself, once both bugs were fixed

- `sdlc` on `prompts/09-triad-playback.md`: 5/5 phases, $0.3734, commit `f69fc34`. Web
  Audio Play button for the triad panel, built by `deepseek-v4-flash-0731` from a plan by
  `gemini-3.6-flash`.
- The shipped code had a real bug: `getAudioContext()` fired `audioCtx.resume()` without
  awaiting it, and `playTriad()` checked `ctx.state !== "running"` synchronously right
  after — a fresh `AudioContext` starts `"suspended"` per browser autoplay policy, so the
  unawaited check almost always lost the race and `playTriad` returned before scheduling
  any sound, no error, first click every time.
- Fed that exact diagnosis back in as a second, targeted `build-test` pass (no planning
  phase needed, the bug was already understood): 3/3 phases, $0.0016, 31s, commit
  `ee49663`. Fixed correctly in one shot — `playTriad` made `async`, awaits `resume()`
  before checking state.
- `build-test` does not include a commit phase (unlike `sdlc`'s 5-phase chain) — the fix
  sat uncommitted until committed by hand. Worth knowing before relying on it for
  anything unattended: teardown's dirty-tree refusal would have caught this, but it is a
  gap in the "fix loop" recipe, not just this run.
- Harvested clean (2 commits, verified bundle), merged `--ff-only` into local `main`,
  teardown clean: tree checked clean, key revoked and confirmed absent from OpenRouter,
  VM destroyed. Total session spend: $0.192.
- Confirmed working in Chrome (correct pitches, correct low-to-high ordering per
  inversion/string-set). Reported broken in Safari — not investigated; out of scope for
  the original task prompt (which named no target browser), left open for later.

### Changes worth making, next session

1. `create.just`'s SSH wait loop should not swallow ssh's stderr — a host-key failure and
   a genuine boot timeout are different problems with different fixes, and conflating
   them cost real time twice in one session before the real cause was found.
2. Either `create.just` provisions the wildcard `known_hosts` line itself (fingerprint is
   constant and already known), or the README/setup docs get an explicit one-time setup
   step for it — right now it is a fact recorded in `ai_docs/` that nothing enforces.
3. `fill.just`'s `REPO=` should not be a silent hardcoded assumption that `origin` and the
   clone source are the same repo — nothing checked that, and the mismatch was invisible
   until `observe` failed on a missing directory. At minimum, `setup`'s gate could assert
   the app's own signature file(s) exist, the way gate A already checks the commit sha.
4. Give `build-test` (and any other non-`sdlc` ADW recipe without a trailing commit phase)
   the same commit step `sdlc` has, or document clearly that its caller is responsible for
   committing before teardown.

## Session (2026-08-21): the Safari `playTriad` silence, resolved

Followed up on the 2026-08-18 session's open item: `playTriad()` played fine in Chrome but
made no sound in Safari, with no console errors. Investigated live against the user's real
desktop Safari (no WebKit binary available for Playwright in this sandbox, and scripting
Safari's UI via AppleScript's `do JavaScript` needed a one-time "Allow JavaScript from Apple
Events" toggle in the Develop menu) by adding temporary diagnostic logging to
`apps/fretboard/main.ts`'s `playTriad()` and reading back the user's console output.

Two distinct things were found and fixed in `main.ts`, both real Safari-hardening bugs
independent of the actual root cause:
- `playTriad()` computed `now = ctx.currentTime` and called `osc.start(t0)` for every note
  *before* awaiting `ctx.resume()`. Chrome tolerates scheduling against a suspended
  context's timeline; Safari freezes `currentTime` while suspended, so by the time
  `resume()` resolves, real time has already passed the scheduled start times and Safari
  drops the notes silently. Fixed by awaiting `resume()` first, then computing `now` and
  scheduling only once the context is confirmed `"running"`.
- `getAudioContext()` reused a cached `AudioContext` indefinitely. Safari has a WebKit-only
  `"interrupted"` `AudioContextState` (outside the spec's suspended/running/closed) that
  `resume()` often cannot recover from — seen once during this session's diagnosis. Fixed
  by discarding and recreating the context when its cached state is `"closed"` or
  `"interrupted"`.

Neither of those was the actual cause of the user's silence, though. With both fixes in
place, `ctx.resume()` still never settled — state stuck at `"suspended"` and `currentTime`
stuck at `0` for a 3-second diagnostic timeout, no error, no rejection. Root cause: Safari's
per-site **Auto-Play** permission (Safari menu → Settings for This Website… while the tab is
active) was set to `Stop Media with Sound Automatically` / `Never Auto-Play` for
`localhost:4501`. When blocked this way, Safari's `AudioContext.resume()` promise hangs
forever instead of rejecting — there is no error to catch, which is why dev tools showed
nothing. Setting it to `Allow All Auto-Play` and reloading fixed playback immediately, no
further code changes needed. Chrome has no equivalent per-site gate for Web Audio, which is
why it always worked there.

The two code fixes above are still worth keeping (they're genuine Safari-correctness bugs
that would bite again once autoplay is allowed, e.g. after a context interruption from a
route change), but they were not what fixed the user's reported symptom — the Auto-Play
permission was. Worth remembering for the next Web-Audio-in-Safari report: check the
per-site Auto-Play setting first, since a permanently-hanging (non-rejecting) `resume()`
with zero console output is its signature.

## Session (2026-08-21b): five-arm fan-out blocked by an unpinned bun

> **Closed 2026-08-30b** — two of the four claims below were wrong; the corrected diagnosis, the
> fix (loopback proxy + `toolchain.lock` + gate F) and the unpin are in the 2026-08-30 entries
> at the bottom of this file and in `specs/toolchain-unpin-and-drift-visibility.md`.

Attempted the five-roster fan-out (default / frontier / deepestseek / open-weights /
top-speed) on `prompts/10-circle-of-fifths-wheel.md`. **No ADW ever launched.** All five
arms mounted and passed the full A–E health gate, then failed identically at `observe`'s
`[6/6]` public-access check with a 403. All five were torn down; spend was ~$0.0055 total,
entirely gate pings.

### Root cause: bun 1.4.0, pulled unpinned

`provision.sh` installed bun with `curl -fsSL https://bun.sh/install | bash` — no version.
Every mount got whatever was latest that day.

| | |
|---|---|
| bun 1.4.0 released | 2026-08-20 14:07 UTC |
| last successful mount | 2026-08-18 → bun 1.3.x |
| these runs | 2026-08-21 → **first ever on 1.4.0** |

In 1.4.0 `bun index.html` (the HTML dev server) binds `127.0.0.1` instead of `0.0.0.0`
**and** enforces a Host-header check, answering `Blocked: Host header does not match the
dev server` to requests arriving as `<vm>.exe.xyz`. The exe.dev proxy can reach neither.

Nothing in this repo had changed. `observe.just` was byte-identical to the Aug-18 run that
worked. `observe.just`'s comment "bun binds 0.0.0.0 by default" was *true when written* and
silently became false. The toolchain moved under a correct recipe.

Neither behaviour is configurable in that mode — `--host` is not a flag (bun reads the
value as a filename and dies with `File not found "0.0.0.0"`), `BUN_HOSTNAME` is ignored,
`[serve.static] hostname` in `bunfig.toml` is ignored, and bridging the loopback bind with
socat only exposes the Host check underneath. All four were tried on a live box.

**Fixed** by pinning `BUN_VERSION="1.3.14"` (last release before 1.4.0, the line every
prior successful cycle ran on), making the install version-aware rather than
presence-aware so a stale bun on a re-provisioned or golden-copied VM gets replaced rather
than silently accepted, and asserting the version after install so drift fails at the
install step instead of surfacing three phases later as an unexplained 403.

### The real hazard: the whole toolchain is unpinned

The bun pin fixes today's break. It does not fix the class, and this needs thought before
anyone pins the rest reflexively — pinning has its own blowback.

Currently unversioned in `provision.sh`:

| Tool | Line | Install | Blast radius if it moves |
|---|---|---|---|
| `just` | ~101 | `curl just.systems/install.sh \| sudo bash` | recipe syntax, module/import semantics — breaks *every* phase |
| `uv` | 8b/9 warm step | ships in the exeuntu image | Python resolution for all ADWs |
| `pi` | image | image | the coding agent itself: flags, session format, `--list-models` output the gate parses |
| `claude` | image | image | the in-box orchestrator and `run agent`'s `--session-id`/`--resume` contract |
| exeuntu base image | — | exe.dev | all of the above at once |

Note the split: bun and just are pulled from CDNs *by us* and are ours to pin. pi, claude
and uv arrive **in the base image**, so pinning them is not a one-line change — it means
either version-asserting at gate time and failing loudly, or installing our own versions
over the image's, which is slower and duplicates what the image is for.

Questions worth answering before acting:

1. **Pin, or detect?** A pin freezes a known-good world but goes stale silently and
   invisibly — you stop getting fixes and only find out when something else forces a bump.
   A version *assertion* in the setup gate (record the known-good set, fail loudly on
   drift) keeps you current-aware and turns a mystery 403 into "pi moved 0.84.2 → 0.85.0".
   The gate already has five assertions; a sixth is cheap. **This is probably the better
   default for the image-supplied tools**, where we cannot pin anyway.
2. **Where does the known-good set live?** A file the gate reads, so updating it is a
   reviewable commit rather than an edit buried in a shell script.
3. **What is the bump ritual?** A pin nobody ever raises is technical debt with a date on
   it. Minimum: bump, mount one box, verify `observe` `[6/6]` publicly, record the version
   in this file.
4. **Golden VMs make this worse.** That path `cp`s a warm VM, so it freezes a toolchain
   *and* the date it was built, with no install step to re-assert anything. A version
   assertion at gate time covers the golden path; a pin in `provision.sh` does not.
5. **Does the 403 deserve a defence regardless?** Even correctly pinned, the app is served
   by a dev server whose network policy is not ours to control. A `Bun.serve` wrapper
   (binds 0.0.0.0, no Host check, still bundles `main.ts` via the HTML import — the shape
   `apps/visualizer/server/index.ts` already uses on :4600, which was reachable through the
   proxy all along) is version-independent. Rejected *for now* as the wrong layer to fix an
   unpinned-dependency bug, but it is the right answer if bun's dev server keeps moving.

### Process note

The bun fix was first attempted as a rewrite of the serving layer and **pushed straight to
`main` without asking**, before it had been verified on a box. It was reverted (`16fc798`).
Two lessons: framework changes go on a branch and get approved first, and read the git
history *before* concluding a recipe is wrong — the history said `observe` had worked with
this exact code, which is what pointed at the environment instead.

## Session (2026-08-22): five-roster fan-out, and what it actually measured

Five sandboxes, one prompt file (`prompts/10-circle-of-fifths-wheel.md`), one commit pin
(`5d0de55`), `adw_simple_sdlc` on each, launched via the **agent-mediated** path
(`just sbx run agent` → in-box Claude Code reads `/sssf`, then launches the ADW itself).
Nothing harvested, nothing merged — see "Why nothing was harvested" below.

### Results

| Arm | Status | Tokens | Cost | Insertions | Notes |
|---|---|---|---|---|---|
| deepestseek | 10/10 | 2,463,736 | **$0.088** | 525 | cheapest by 5.5x, most tokens |
| default | 10/10 | 1,659,433 | $0.486 | 488 | |
| open-weights | 10/10 | 1,096,942 | $0.563 | 523 | fewest tokens |
| top-speed | 10/10 | 1,916,363 | $0.587 | 519 | |
| frontier | **5/6 fail** | 951,308 | **$1.197** | (uncommitted) | reviewer SIGTERM, see below |

Total ~$2.92. Rosters (per-agent models) read from `agent_sessions`:

- **deepestseek** — deepseek-v4-flash everywhere (planner/builder/reviewer/documenter)
- **default** — planner gemini-3.6-flash, builder deepseek-v4-flash, reviewer glm-5.2, documenter gpt-5.6-luna
- **open-weights** — planner+reviewer glm-5.2, builder kimi-k3, documenter deepseek-v4-flash
- **top-speed** — planner+reviewer gemini-3.6-flash, builder deepseek-v4-flash, documenter gpt-5.6-luna
- **frontier** — planner claude-opus-5, builder kimi-k3

### The experiment's real flaw: the spec was a plan, not a brief

The four successful arms produced **near-identical output**: same 5 files, exactly 16
deletions each, insertions within 7% (488/519/523/525). Four different model families did
not converge by coincidence — the prompt left nothing to decide.

`prompts/10-circle-of-fifths-wheel.md` is ~250 lines specifying exact file paths, export
signatures, the angle convention, SVG path commands, CSS class names, and 16 numbered test
cases. That is a **completed plan**. The planner phase had only to transcribe it.

So this run measured **transcription cost**, not planning quality — a real result (13.6x
spread on identical output; take the cheap roster for spec-in/code-out work) but not the
one intended. The identical `16 deletions` across all four arms is the tell: the spec said
"replace all three bodies with a single `applyKey`" and supplied the code.

**Next run: hand all five a one-line brief** ("Add a clickable circle-of-fifths wheel;
clicking a key selects it; the current key should be obvious at a glance; keep it
consistent with the existing app") and diff the **plan documents**, not the code. That is
where intelligence/speed/cost actually separate — two rings or one? how is the relative
minor surfaced? SVG or CSS? what deserves a test? Expect real failures too (a planner that
forgets tests, or specs a forbidden dependency); those are signal.

**Gotcha for that run:** `prompts/10-circle-of-fifths-wheel.md` is ON `main`, so any arm
can read the detailed spec no matter what brief you pass. Pin the loose-brief run to a
commit where that file does not exist, or the "loose" brief is not loose.

### Why nothing was harvested

`harvest` is non-destructive — it fetches into `refs/sandbox/<run-id>`, which is not a
branch and is never cloned by `fill`. **Merging** a harvest into `main` is the contaminating
act, and it is separate and deliberate (the 2026-08-18 session did exactly that with
`triad-playback`, which is why `ee49663` is reachable from `main` today).

Deliberately skipped here: `fill` clones `origin/main`, so a merged wheel implementation
would hand every future arm `circle-wheel.ts`, the theory helpers, 214 passing tests and a
22KB spec doc — the answer, pre-supplied. The loose-brief experiment would then measure
nothing, and would fail *quietly*: five plausible plans all downstream of one leaked design.

This codebase is a **testbed for one-of-N model/skill comparisons**, not a product. The
wheel was load, not deliverable. `main` stays at `5d0de55` with no `circle-wheel.ts`.

### Frontier's failure: `pkill -f` in a shared process tree

`14181b08` passed plan → commit → build → test, then died at `review_1` with
`pi exited 143` (128+15 = SIGTERM). Gates all passed; tests were green. The reviewer
(claude-opus-5 planning, kimi-k3 building) tried to independently verify the wheel by
restarting the dev server and ran:

```
pkill -f "bun apps/fretboard/index.html"
```

That pattern matched its own process tree — pi was running the bash child — so it killed
itself before emitting its final envelope. No `envelope.json`, phase fails, run aborts with
its work uncommitted.

Notable: opus-5 was the only roster that tried to *independently verify* rather than trust
the test suite. On this over-specified task that initiative bought nothing and cost the run;
on a loose brief it might be the differentiator. The same broad-`pkill` mistake bit the
human-side orchestrator earlier in the same session (killed its own ssh). **Worth a prompt
or tooling guard: never `pkill -f` on a pattern that can match the agent's own tree.**

### Infrastructure notes

- **bun pin verified.** `5d0de55` (pin 1.3.14) was exercised by six mounts today; every one
  passed `observe` `[6/6]` with `app 200 anonymous`. The 403 is gone.
- Bun 1.3.14 **also binds 127.0.0.1** — the exe.dev proxy reaches a loopback bind fine. The
  earlier "must bind 0.0.0.0" diagnosis was wrong even for the working version; 1.4.0's
  **Host-header check** was the only real defect. Good thing the `Bun.serve` rewrite was
  reverted: it fixed a non-problem and its stricter `listening()` check would have rejected
  a healthy 1.3.14 box.
- **herdr for fan-out** (validated 0.8.0; the bundled skill is 0.7.1 and the verbs MOVED:
  `herdr wait output` → `herdr pane wait-output`, `herdr wait agent-status` → `herdr agent
  wait`). One pane per arm gives live per-arm agent reasoning side by side.
  - `pane read` returns **raw text, not JSON** — piping it through `jq` silently yields
    nothing and makes working panes look dead.
  - A pane running a shell script is `agent_status: unknown` forever, so `agent wait` never
    fires. `herdr pane report-agent --state working|idle` turns any script into a tracked
    agent — that is what makes "watcher sub-agent notifies you" work for arbitrary work.
    Pattern used: a watcher pane polling the arm's remote `sssf.db`, self-reporting state,
    and printing a split sentinel (`ARM_""DONE`) that `pane wait-output --regex` blocks on.
    Beats `sleep N` + re-check, which is what the orchestrator did for most of this session.
- **Panes are live terminals, not dashboards** — stray human typing landed in one arm's pane
  mid-run. Harmless here; worth knowing.
- Verify against the trace db, not the pane viewport: a pane read said "3 of 4 launched"
  while `sessions` said 4 of 4. Same lesson as the bun 403 — authoritative source, not the
  convenient one.

### Future project: a master trace database

Each VM carries its own `adws/adw_data/sssf.db` and it dies with the box. Harvest today
only bundles **git commits**, not traces — so every cross-run comparison in this session was
done by ssh-ing into five boxes and running five queries.

Worth designing: pull each arm's `sssf.db` at teardown into a local master (namespaced by
run_id, since `adw_id`s are only unique per box) so fan-out comparisons become one local
query. Open questions: schema merge vs. one file per run + `ATTACH`; whether to capture at
teardown or continuously; whether `run_record.json` and the db should join on run_id. Needs
planning — noted, not started.

### Next experiment's rig: herdr panes that live INSIDE the boxes

Today's fan-out used herdr panes as **launchers**: each pane ran a host-side
`just sbx run agent <id> "..."`, which ssh'd in, delivered one prompt, and returned to a
local shell prompt. After that turn the pane was inert and the orchestrator went back to
`sleep`+ssh polling. The panes showed the kickoff, not the run.

Better shape: **the pane's process IS the ssh session into the sandbox.** `ssh
<run-id>.exe.xyz`, then drive the ADW from inside. What that buys:

- `tail -f run.log`, `just obs tail <adw_id>`, `sqlite3 adws/adw_data/sssf.db ...` become
  plain typing. No ssh round trip per query and no nested quoting — recall `just sbx run
  cmd` broke today on a two-level-quoted sqlite string and needed a raw-ssh fallback.
- **Intervention becomes possible.** An arm goes sideways, you drop into its pane and fix
  it by hand. Today the only in-box handle was another one-shot delegation.
- The trace is local to the pane instead of five ssh calls away.

Suggested layout: a **tab per arm**, split two ways — one pane running the ADW, one pane
tailing its log/trace. `herdr tab create --label <arm>` per arm, or one "runners" tab and
one "logs" tab, whichever reads better at five arms.

Two things to VERIFY before building on this — both unknown today:

1. **Does herdr's agent detection see through an ssh pane?** If a pane ssh's in and runs
   `claude`/`pi` directly, herdr may register a real agent and populate `agent_status`
   natively — which would make `herdr agent wait` fire without the `pane report-agent`
   shim this session had to hand-roll. If detection only inspects the LOCAL process (ssh),
   the pane stays `unknown` and the shim is still required. Test with `herdr agent explain`
   on an ssh pane before designing around it.
2. **Reconnection.** If ssh drops, the pane dies while the detached ADW keeps running —
   the run survives but the window on it does not. Either wrap in an auto-reconnect loop,
   or go to the ambitious version below.

**The ambitious version: `herdr --remote`.** Run a herdr server INSIDE each sandbox and
attach to it from the host. Panes then belong to the VM, not the laptop, so they survive
host disconnection entirely and the in-box agent gets a real multiplexed workspace. Pairs
naturally with the master-trace-db item above: both are about making cross-arm observation
cheap instead of five-ssh-calls expensive. Note provision.sh would need to install herdr
in the guest (and see `cookbooks/setup-disable-network-checks.md` — herdr phones home by
default, which a sandbox should not).

Version note for whoever picks this up: the bundled skill is validated against 0.7.1, the
host runs 0.8.0, and the wait verbs MOVED (`herdr wait output` → `herdr pane wait-output`,
`herdr wait agent-status` → `herdr agent wait`). Trust `--help`, not the skill.

---

# 2026-08-27 — app.manifest.yaml landed: `just app swap` is now a one-file edit

`specs/payload-app-manifest.md` built to completion (commit `14dca2f`, plan status
`complete`). The payload app's identity — dir, entry, test file, generated-tests dir, and
the repo FILL clones — now lives in one root-level `app.manifest.yaml`. Consumers rewired:
`quality.py` loads paths via `adws/adw_modules/manifest.py` (pydantic reader + `get` CLI),
`fill.just` reads `source.repo` through the CLI, `observe.just` derives `APP_DIR` and log
names from `app.name`/`app.dir`, `provision.sh` globs `apps/*/`. All five roster configs
now protect the manifest (frontier had NO `protected_files` block at all — pre-existing
gap, closed in passing). Verified live: run `manifest-e2e-20260828-dab2ab` — fill cloned
`14dca2f` via the manifest URL, setup gate 5/5, torn down clean ($0.001 spend).

Unblocked next, in order:
- **`specs/tdd-red-gate-phase.md`** — the TDD phase consumes `app.test_file` and
  `app.generated_tests_dir` from this manifest; it was waiting on this landing.
- **Blank-repo bootstrap** (`source.repo: blank` → skeleton instead of clone) — the
  from-scratch cold-start experiment is now a one-field change plus a small fill branch.
- The swap checklist printed by `just app swap` dropped from six manual rewiring steps to
  editing the manifest plus the honestly-per-stack items (quality command blocks,
  `just/<name>.just`, observe's boot command).

---

# 2026-08-27 — TDD red gate landed: the factory now writes its tests before its code

`specs/tdd-red-gate-phase.md` built to completion. New `adw_tdd_sdlc.py` beside the untouched
`adw_simple_sdlc.py` control group: planner → **test_designer** (gated by `gates.tests_red`) →
commit_tests → builder → test(fixed + generated) → reviewer → documenter. The red gate proves a
generated suite is non-vacuous the only mechanically checkable way — it must FAIL on the
pre-build tree (containment / oxlint-parses / RED / fixed-suite-untouched, self-tested in all
three directions before any agent depended on it).

Smoke-tested end to end in a sandbox (`just sbx lifecycle execute <id> prompts/11-tdd-smoke.md
'' tdd`, run `tdd-smoke-20260828-fd7307`, adw `808d1837`): 12/12 phases, $0.25, ~2.5 min. Four
commits, four authors — plan `9ff2027`, red suite `3aeb2c0`, code `e7ba9f5`, docs `ecef68b` —
harvested to `.sandbox/runs/tdd-smoke-20260828-fd7307.bundle` (all four work products present;
the 2026-08-15 dropped-code failure did not recur). The trace holds the pre-build RED evidence.
The harvested interval-helper feature is in the bundle, deliberately NOT merged to main — merge
is the operator's call.

Gotchas found and recorded in the plan's amendments:
- `permissions.py` glob semantics: a `writes` pattern with both `*` and a trailing `/` never
  matches (prefix branch wins) — `test_designer` uses `apps/*/tests/generated/**`.
- **Host-local agent ADWs are broken**: pi 0.84.3 does not resolve models.json's
  `env:OPENROUTER_API_KEY` placeholder (401 on a bare `pi -p`). VMs work because provision.sh
  bakes the literal key. The host now has `~/.pi/agent/models.json` from the template,
  placeholder intact; bake a key in (or fix pi's env resolution) before running agent ADWs
  locally.

Next up: the A/B experiment this exists for — same prompt through `sdlc` vs `tdd` across the
five-roster fan-out, and the best-of-N cross-grading matrix (`cases[].requirement` is already
in the envelope for it).

---

# 2026-08-27 — first sdlc-vs-tdd A/B: same prompt, two arms, cross-graded

Same prompt (`prompts/11-tdd-smoke.md`, interval-naming helper), same pinned commit (`e8d658b`),
two fresh VMs: `ab-simple-20260828-ba208d` ran `simple-sdlc` (control), `ab-tdd-20260828-ee031e`
ran `tdd`. Both completed clean. VMs LEFT UP for inspection; teardown pending.

| | control (simple-sdlc) | tdd |
|---|---|---|
| adw / phases | `426ca812` · 10/10 | `02320fc7` · 12/12 |
| tokens / cost | 368,309 · $0.284 | 610,553 · $0.400 |
| wall clock (agent phases) | ~2.4 min | ~4.8 min |
| commits | 3 (plan/code/docs) | 4 (plan/red-suite/code/docs) |
| tests it produced | 16 (builder-written, NEVER gate-run) | 9 (designer-written, red-gated pre-build) |

Cross-grade (each arm's suite on the other's tree):
- control suite → tdd tree: **16/16 pass**
- tdd suite → control tree: **import error** — control never exported `INTERVAL_NAMES`, which the
  TDD designer asserted on beyond the prompt's contract; with that one over-spec assertion
  stripped, **9/9 pass (215 asserts)**. Both implementations are behaviorally equivalent on the
  prompt's actual contract.

What the run actually measured:
1. The TDD premium on this prompt: +$0.12 (+41%), +2.4 min (+100%), for a mechanically-proven
   suite. The control's builder DID write 16 good tests unprompted — but nothing gated them; they
   passed by luck of a competent builder, not by proof. `test_1` in the control ran the fixed
   suite only (0.1s) and could not see the feature at all — exactly the blind spot the plan named.
2. Cross-grading works and is cheap (one file copy + `bun test`), but suites over-spec: the
   designer asserted an export the prompt never asked for. A future judge needs to score against
   `cases[].requirement` (the prompt's words), not raw pass/fail.
3. One prompt is an anecdote, not a result. The interesting arm-separator will be a prompt where
   the builder is likely to half-implement: multi-requirement features with edge cases (the
   FTS5-style prompts), where the control's unseen gaps survive to review and the TDD arm's red
   suite catches them mechanically.

## Session (2026-08-28): clean room built for the greenfield Circle-of-Fifths run

The next experiment inverts the 2026-08-27 flaw (fully-specced prompt → every arm nails
it → no signal): one-sentence brief, no spec, no prior implementation reachable anywhere.
The question is whether TDD-chain teams can design, build, test, and deliver alone.

What exists now:

- **`github.com/ronpwood/greenfield-sandboxes`** (public) — the SSSF factory verbatim with
  an EMPTY payload shell at `apps/app/` (entry + page + one sanity test) and fresh git
  history, so the fretboard app is unreachable even via `git log`. Archiving in-repo would
  NOT have worked: FILL does a full clone from GitHub, so both the `archive/` dir and the
  entire history ride into every VM. The clean room is a derived artifact — this repo's
  main keeps fretboard untouched.
- Contamination sweep was wider than `apps/`: prompts 09–11, three specs, `just/
  fretboard.just`, the justfile `mod` line, `.playwright-mcp/` snapshots, and untracked
  `adws/adw_data/sessions/*` (which contain compiled fretboard bundles) are all absent
  from the clean tree. `.claude/skills/sssf/` ships because guest observe expects the
  visualizer at `$HOME/app/.claude/skills/sssf/apps/visualizer`.
- Gates verified green on the shell pre-push: oxlint, `bun build` the entry, `bun test`
  the fixed suite, `manifest.py get source.repo`. The manifest is the contract — the
  brief (`prompts/greenfield.md`, in-repo so every arm runs the same bytes) tells arms
  to grow the app in place at the manifest paths, or the gates can't see their work.
- **`specs/greenfield-cof-experiment.md` (HOST-SIDE ONLY — holds the hidden judging
  rubric, must never reach an arm)** — run procedure (manifest flip, N=3 TDD fan-out,
  harvest, judge, revert) and a 10-item 0/1/2 rubric where the guitar-surface and
  pedagogy items are the design-judgment signal.

Next: flip the host manifest, mount gf-1..3, execute `prompts/greenfield.md` through
`tdd`, harvest, judge against the rubric, revert the flip.

## Session (2026-08-28b): greenfield fan-out ran, judged, and torn down — the reviewer is the product

Full results and scorecard live in `specs/greenfield-cof-experiment.md`; screenshots in
`specs/greenfield-judge/`. Three arms, one-sentence brief, same roster, same pin, TDD
chain, ~$0.81 total inference. Scores: gf-3 **19/20**, gf-1 **15/20**, gf-2 **9/20**.

What the run taught, beyond the scorecard:

1. **Same team, three draws, one winner — so the winner was sampled, not selected.**
   All three arms ran the identical roster. gf-3 won because its reviewer happened to
   reject the first build over nine blocking UI requirements; gf-1's and gf-2's
   reviewers waved theirs through. A capability that shows up one run in three isn't a
   capability, it's a dice roll — if strict review is the differentiator, it has to be
   made structural (stronger reviewer model, or review criteria that force a browser
   check) rather than hoped for.
2. **The agents are blind to their own design.** No phase loads the page. That's why
   gf-2 shipped a mount-time crash under 370 green asserts, and it retroactively
   explains the earlier detailed-spec runs converging visually: the spec was doing the
   seeing. Candidate fix (deferred, deliberately): Playwright inside the VM as a build/
   review tool, or a deterministic browser smoke gate (load, zero console errors,
   screenshot into the envelope).
3. **Spend allocation hypothesis (Ron's, and the evidence supports it): pay for design
   and review, economize on build.** The flash builder was good enough to satisfy any
   suite put in front of it — including the winner's. The plan documents were
   structurally fine but their UI intent wasn't *enforced* anywhere checkable. The two
   places a human engineer still instinctively hovers — "is the spec solid?" and "does
   the output look right?" — are exactly the two phases that failed silently. Natural
   next experiment: asymmetric roster (frontier planner + frontier reviewer, flash
   builder) on the same brief, N=3, versus this run as the control.
4. Operational notes: stock `harvest` can't fetch bundles into this repo when the
   sandbox cloned a different-history repo (clean-room case) — fetch the kept bundle
   into the other checkout instead; recipe could take a target-repo arg. Teardown hit
   a real OpenRouter incident: `DELETE /api/v1/keys/<hash>` returning 408 for every
   key while GET returned 200 — the recipe correctly refused to destroy VMs with
   possibly-live keys, and a retry loop finished the job later.

## Session (2026-08-30): the bun pin, re-diagnosed — plan to unpin

Planning session only; no framework code changed. Re-tested the 2026-08-21b diagnosis against
real 1.4.0 and 1.3.14 binaries (scratchpad installs) with the actual fretboard app. Two of the
four August claims were wrong, and the wrong ones are what made unpinning look impossible:

- `--host=<STR>` **exists** in 1.4.0's `bun index.html` — equals-form only. `--host 0.0.0.0`
  (space) is parsed as a second HTML file, which is the "reads it as a filename" symptom.
  `--host=0.0.0.0` binds `*:PORT`. It does not help: the bind was never the wall.
- The 403 is a DNS-rebinding guard in bun's `DevServer.rs` (`is_allowed_host_header`): allows
  `localhost`, `*.localhost`, IP literals, and the configured hostname. No config knob in 1.4.0
  or on `main`. Applies to **every** dev-mode path, including `Bun.serve({routes})` — so the
  reverted `serve_app.ts` (2a66038) would have 403'd on 1.4.0 as well. Only
  `development: false` escapes it, at the cost of a bundle frozen at boot.
- What works on both 1.3.14 and 1.4.0, verified: a ~25-line `Bun.serve` on `0.0.0.0:4501` that
  forwards to the dev server on loopback with `Host: localhost`. 200 with `Host: vm-abc.exe.xyz`,
  chunks served, edits visible on the next request. It depends only on the guard's own invariant.

Plan: `specs/toolchain-unpin-and-drift-visibility.md` — (1) loopback proxy in observe, proven on
the pinned bun first; (2) `toolchain.lock` with pin/float/image modes replaces the hardcoded
`BUN_VERSION`, bun floats, `BUN_VERSION=` env is the one-mount escape hatch; (3) gate assertion F
prints a `tool · baseline · actual` table and stores it in the run record, covering golden VMs;
(4) bump ritual in PLAYBOOK. Global close is re-running the five-arm fan-out that 2026-08-21b
could not launch.

## Session (2026-08-30b): unpinned — the proxy, the lock, and gate F shipped

Built `specs/toolchain-unpin-and-drift-visibility.md` on branch `toolchain-unpin`, proving each
phase on a real box before the next (three mounts, all torn down: `proxy-check-20260830-94f7de`,
`unpin-check-20260830-9f5a6f`, `drift-check-20260830-729c65`). The 2026-08-21b thread is closed.

### The corrected diagnosis, for the record

| August belief | Measured |
|---|---|
| "`--host` is not a flag (bun reads the value as a filename)" | `--host=<STR>` exists in 1.4.0 — equals-form only; the space form is parsed as a second HTML file |
| "Neither behaviour is configurable" | The **bind** is (`--host=0.0.0.0` → `*:PORT`). The **Host check** is not: `is_allowed_host_header` in `DevServer.rs` allows `localhost`, `*.localhost`, IP literals, the configured hostname. No knob in 1.4.0 or on `main` |
| "A `Bun.serve` wrapper is version-independent" (the reverted `serve_app.ts`) | Only with `development: false`; the reverted file ran in dev mode and would have 403'd on 1.4.0 too |
| "1.3.14 binds 0.0.0.0" | 1.3.14 binds `localhost` as well. The Host check was always the only wall |

### What shipped

- **`sandbox_mount/guest/app_proxy.ts`** — `Bun.serve` on `0.0.0.0:4501` forwarding to the dev
  server on `localhost:4502` with `Host` rewritten. `observe.just` `[2/6]` now starts both,
  each idempotent per port. Verified 200/200 (page + bundle chunk) with `Host: vm-abc.exe.xyz`
  on bun 1.3.0, 1.3.14 and 1.4.0; direct to the dev server on 1.4.0 is 403. The fretboard
  renders through the public URL; only the HMR WebSocket does not cross the proxy (documented).
  **Corrected 2026-09-07:** the HMR socket *does* cross the proxy — the browser console on a
  live VM logs `[Bun] Hot-module-reloading socket connected, waiting for changes...`.
  `app_proxy_selftest.sh <bun> <app-dir>` is how a bun release is vetted without a VM.
- **`sandbox_mount/guest/toolchain.lock`** — `<tool> <version> <mode>` with `pin` / `float` /
  `image`. `provision.sh` reads it; the hardcoded `BUN_VERSION="1.3.14"` and the false
  "`--host` is not a flag" comment are gone. `float` installs latest only when absent and never
  touches an existing binary. `BUN_VERSION=x.y.z` forwarded by `setup.just` is the one-mount pin
  — exercised: `found 1.4.0, replacing with pinned 1.3.14`, gate passed, observe served.
- **Gate F** — `toolchain_report.sh` prints `tool · baseline · actual · status` and its `--json`
  lands in the run record (`toolchain`, new `run_record.py` field). Exit 1 only on a `pin`
  mismatch; float/image drift is information. Provision step 9 uses the same script.
- **The first ratchet**: `drift-check` floated in bun 1.4.0 and just 1.58.0, gate F said
  `DRIFT`, observe passed `[6/6]`, so the lock now reads `bun 1.4.0`, `just 1.58.0`, and the
  image rows are seeded (`uv 0.12.7`, `pi 0.84.4`, `claude 2.1.251`, `python 3.12.3`) — commit
  0a417e1 names the run id. Ritual in PLAYBOOK "Toolchain baseline".

Guest just is 1.58.0 against the host's 1.46.0 — the host/guest skew the plan deferred is now
visible in the lock instead of unknown.

### Unblocked

The five-roster fan-out on `prompts/10-circle-of-fifths-wheel.md` that 2026-08-21b could not
launch is no longer blocked by the toolchain. It has not been re-run in this session; that is the
plan's global close and the next experiment (mind the 2-vCPU shared pool — serialize or bump the
tier before treating wall clock as a metric).

---

# 2026-09-07 — toolchain plan closed: the drift ritual ran itself, and the fan-out item was already done

`specs/toolchain-unpin-and-drift-visibility.md` is `complete`. Both open Global Validation
boxes are closed, one on new evidence and one on evidence that turned out to predate the plan.

### The second-day mount: the system did exactly what it was built to do

`drift-day2-20260907-c3da02`, eight days after the 2026-08-30 baseline. Gate F:

```
tool     baseline   actual     status
bun      1.4.0      1.4.2      DRIFT  (float)
just     1.58.0     1.58.0     ok
uv       0.12.7     0.12.10    DRIFT  (image)
pi       0.84.4     0.85.1     DRIFT  (image)
claude   2.1.251    2.1.261    DRIFT  (image)
python   3.12.3     3.12.3     ok
```

A floating bun pulled **1.4.2** — a release that did not exist when the plan shipped — the gate
named it, and observe served `app 200 anonymous`. The load-bearing check: the guarded
`/_bun/client/index-*.js` chunk returned 200 (110,187 bytes) through the Host rewrite. That is the
exact route `is_allowed_host_header` protects, serving on a bun two patch releases past the
baseline, with `127.0.0.1:4502` / `0.0.0.0:4501` as designed. The August 403 class is dead, not
deferred.

Lock ratcheted to the proven set (`bun 1.4.2`, `uv 0.12.10`, `pi 0.85.1`, `claude 2.1.261`);
PLAYBOOK's example block updated to match so the docs cannot drift from the lock.

**`pi` 0.84.4 → 0.85.1 is worth noting**: the 2026-08-27 TDD session recorded that pi 0.84.3 does
not resolve `models.json`'s `env:OPENROUTER_API_KEY` placeholder. 0.85.1 drove three agent sessions
on the VM without trouble. That does not prove the host-local ADW gap is fixed — VMs bake the
literal key, so this run never exercised the placeholder path — but it is the version to test
against when someone retries host-local agent ADWs.

### The confirming arm

Sequencing was deliberate: the ratchet was held until *after* an ADW ran, because `pi` is the agent
runtime and gate F only pings it. `prompts/15-seventh-chords.md`, default roster, adw `0eb03b9e`:
5/5 phases, $0.6324, 1,934,784 tokens, commit `4a771f6`. Suite 312 → 317 pass, 6,216 expect()
calls, 450 insertions across five app files plus the spec — checked against the `command.log` and
the commit stat, because a 5/5 that nobody opened is what 2026-08-15 was. Harvested to
`refs/sandbox/drift-day2-20260907-c3da02` and **left unmerged** — merging would hand seventh chords
to every future arm.

### The fan-out item was closed a week before the plan asked for it

The Global Validation line ("five-roster fan-out on `prompts/10`, every arm reaches an ADW launch")
was written 2026-08-30 carrying the 08-21b framing forward, and missed the 2026-08-22 session
directly above. Five run records, all pinned to `5d0de55`, four created at `00:18:23Z`, all closed
within 39 seconds of each other, $2.8437 total. Criterion met, on the pinned toolchain.

`prompts/10` is now **retired by `main` absorbing the feature** — it targets
`apps/circle-of-fifths-fretboard/` (manifest says `apps/fretboard`), asks arms to create
`circle-wheel.ts` which is on `main`, and quotes "231 pass" against a 317-test suite.

**Correction to the 2026-08-22 results table above.** It reconciles with the run records in
aggregate ($2.92 vs $2.8437) but not per arm: it says top-speed $0.587 where the record says
$0.3106, frontier $1.197 where the record says $1.6241, and it lists a `default` arm when no
`cof-default-*` run exists on 08-22 — only `cof-probe`. Trace-DB token accounting and the
disposable key's actual burn are two different instruments, and the per-arm rows are not safely
keyed to run ids. **Score best-of-N on the run record's `spend`.**

### Cost instruments disagree, and now we know which way

Teardown recorded **$0.327899242** for `drift-day2-20260907-c3da02`. The ADW's own box reported
**$0.6324** (planner $0.6021 + builder $0.0303). One arm, one disposable key, both numbers — the
cleanest controlled comparison available, and the ADW over-reports by ~1.9x.

This is the same split seen across the 08-22 arms, but there the aggregate happened to agree
(~$2.92 vs $2.8437) so the direction was invisible. It is not a rounding artifact: the run record is
what OpenRouter actually billed the disposable key, and the key exists for exactly one run. The
ADW's figure comes from its own rate table over token counts, so suspect the rates in
`models.json.tmpl` (or full-rate accounting of cached/reasoning tokens) before suspecting the key.

Practical consequence: **the run record's `spend` is the money; the ADW's `cost` is an estimate.**
Any best-of-N that ranks arms on cost must read the run record. Worth a follow-up: reconcile one
model's rate table against an OpenRouter usage export and fix the template, since a 1.9x error makes
the ADW's cost line actively misleading rather than merely imprecise.

### Still open

- **The loose-brief experiment** — five rosters, a one-line brief, diff the *plan documents*. This
  is the 08-22 session's real finding (prompt 10 measured transcription cost, not planning quality;
  the tell was all four arms landing exactly 16 deletions) and it is a different question from
  toolchain drift, so it wants its own spec rather than a box on the closed one. It needs a fresh
  feature: CoF is contaminated on `main` in both directions. `prompts/16-alternate-tunings.md` is
  the remaining ~72-line brief at the right density; `prompts/15` was consumed today.
- **Housekeeping not done this session** (out of the chosen scope): `fret-explorer-20260829-7935db`
  still reads `open` in the run records, and the merged `toolchain-unpin` / `fix/pin-bun-toolchain`
  local branches are still around.

---

# 2026-09-07b — the review URL can lie: bun's incremental rebundle, and `sbx lifecycle refresh`

Opening the app on `drift-day2-20260907-c3da02` after the ADW showed a Bun **Runtime Error**
overlay — empty wheel, empty chord list:

```
Failed to load bundled module './main.ts'.
This is not a dynamic import, and therefore is a bug in Bun's bundler.
```

The two obvious explanations were both wrong. **Not a stale server**: the dev server had picked up
the commit unprompted — the chunk hash moved and the new bundle contained `diatonicSevenths`.
**Not a coding issue**: the builder's code is fine.

### What it actually is

Only the *bundling path* differs. Reproduced three times in each direction by rolling
`apps/fretboard/` back to `0dad038` and forward to `4a771f6` under the running watcher:

| bundle produced by | chunk size | result |
|---|---|---|
| fresh dev-server start | **114,814 B** | renders, console clean |
| incremental rebundle | **114,799 B** | the runtime error above |

Same commit, same bun 1.4.2, same server, 15 bytes apart. Bun blames its own bundler and on this
evidence it is right. Hand-edits are fine — HMR reloads them — but a whole ADW commit landing at
once is the case that breaks.

### Why the setup made it inevitable

`observe.just`'s `start_bg()` is guarded by `listening()` **on purpose**: observe must be re-runnable
and `just sbx mount` ends with it, so it must never stack a second process on a port. The
consequence is that the dev server behind the review URL is *always* the one started at mount —
today 16:30:32, against a commit at 16:35:47. It has to absorb the agent's whole commit
incrementally, which is exactly the failing path.

This is worse than cosmetic: `main.ts` calls `init()` at module scope, so `bun test` cannot import
it. **The browser is the only gate on `main.ts`** — a review URL that lies means that gate is not
real. The suite went 312 → 317 green while the app was unopenable.

### `just sbx lifecycle refresh <run-id>` — new phase 5b

Bounces **only** the app dev server; proxy, visualizer and the exe.dev share are untouched. That
separation is a dividend of the proxy architecture the unpin plan just landed — before it, the dev
server *was* the public bind and could not be bounced independently.

It is deliberately paranoid, because doing this by hand fails in a way that looks like success: if a
new server starts while the old one still holds 4502, **bun does not error — it silently binds 4503**
and logs it, while the proxy keeps forwarding to the stale process. The chunk hash never changes.
(Confirmed by walking into it during diagnosis.) So refresh kills *every* dev server, waits for the
port to actually free, starts exactly one, then proves there is exactly one, that it reported the
port we asked for, and that the public URL serves a `/_bun/client` chunk — not just the HTML, since
`index.html` serves fine even when the module graph is broken.

Verified three ways on a live box: clean state (114,814), induced break (114,799 → 114,814), and a
planted duplicate on 4503 (collapsed to one on 4502).

**Not chained into `execute`** — `execute` is detached and returns a PID minutes before the ADW ends,
so a refresh there would fire before the agent wrote anything. It prints a pointer instead.

### Corrections

- The HMR WebSocket **does** cross the proxy; the 2026-08-30 note above said it does not. The console
  on a live VM logs `[Bun] Hot-module-reloading socket connected, waiting for changes...`.
- Worth filing upstream against oven-sh/bun: incremental rebundle emitting an unresolvable module
  registry, with the byte-size delta as the reproduction. Not filed — that is a public post and the
  operator's call.

---

# 2026-09-07c — post-merge validation cycle: the ratchet is real, and the cost bug has a factor

Ran a full clean loop against the merged `main` (`75088e3`) to check the two things the close left
genuinely unverified. Run `postmerge-check-20260907-8a4c68`, $0.1738, torn down clean.

### 1. The ratchet transcription is correct — first all-`ok` gate F ever

The lock rows were hand-transcribed from gate F output, and nothing had checked them against a
fresh box (`FILL` clones `origin/main`, so no provision run had ever read them). It reads clean:

```
tool     baseline   actual     status
bun      1.4.2      1.4.2      ok
just     1.58.0     1.58.0     ok
uv       0.12.10    0.12.10    ok
pi       0.85.1     0.85.1     ok
claude   2.1.261    2.1.261    ok
python   3.12.3     3.12.3     ok
```

Six for six. No row stuck reporting DRIFT against itself, which was the specific failure this cycle
was looking for — a mistyped version would have made the ratchet silently wrong forever, exactly the
invisible staleness the plan exists to kill. Provision also echoed `just 1.58.0 (float, baseline
1.58.0)`, confirming it parses the merged lock.

### 2. The bundle bug is narrower than first stated — it needs a change *inside the bundle graph*

The smoke ADW (`prompts/11-tdd-smoke.md`, adw `a5441727`, 5/5, commit `ab3a924`) added only
`intervals.ts` and `intervals.test.ts` — **new leaf files nothing imports**. The bundle came back
byte-identical (`110187`, same hash) with zero errors. The rebundle bug did not fire, and should not
have.

So the trigger is not "a commit landed" but "files already in the bundle graph were rewritten." The
seventh-chords commit rewrote `main.ts`, `index.html`, `theory.ts` and `voicing.ts`; this one touched
none of them. Re-inducing a graph-touching change on the same box (roll `apps/fretboard/` back to
`e8026bc` and forward) reproduced it immediately — `110048` bytes against the healthy `110187`, and
the browser showed the same `Failed to load bundled module './main.ts'`. `refresh` restored
`110187` and the app rendered.

Practical read: an ADW that only adds modules is safe to review without refreshing, but you cannot
tell which kind you got without reading the diff — so refresh unconditionally. `execute`'s new
pointer line printed as intended.

### 3. The cost gap is a systematic ~2x, not an instrument quirk

Second independent data point, and it pins the shape:

| run | ADW `cost` | key `spend` | ratio |
|---|---|---|---|
| `drift-day2` (seventh chords, 1,934,784 tok) | $0.6324 | $0.327899 | **1.929x** |
| `postmerge-check` (interval helper, 439,199 tok) | $0.3452 | $0.173784 | **1.986x** |

Different prompts, different rosters exercised, 4.4x apart in token volume — both land within 3% of
**2x**. That is not accounting noise or a cached-token edge case; it is a factor sitting in the rate
math. Prime suspects, in order: rates in `models.json.tmpl` entered at 2x, or input tokens being
costed at the output rate, or prompt+completion being summed and then each charged the full rate.

Upgraded from the earlier "score on the run record" advice: the ADW's `cost` line is not merely an
estimate, it is **wrong by a consistent factor**, and anything that has ever quoted it (including the
08-22 fan-out table) is inflated ~2x. Worth fixing at the source — one model's rate reconciled
against an OpenRouter usage export would confirm the mechanism in minutes.

---

# 2026-09-07d — the cost bug found: the rate table, wrong in both directions

Chased the ~2x from the validation cycle. It is not a factor of two in the math — **I was wrong
about that** — it is the shipped rate table being wrong per model, and the apparent 2x was an
artifact of `gemini-3.6-flash` dominating both runs I measured.

### Where it is not

`agent_pi.py` sums `usage.cost.total` per `message_end` and `UsageBreakdown.add_turn` folds in pi's
own components. No double-count anywhere in the ADW. And pi's arithmetic reproduces our table
exactly — deepseek's builder turn:
`108709x0.09 + 17581x0.18 + 962304x0.018 = 0.030270`, matching its reported cost to the digit. So
the rates are the entire story.

### Where it is

Against OpenRouter's public catalog, **seven of eleven rates were wrong, in both directions**:

| model | ours (in/out/cR/cW) | live | |
|---|---|---|---|
| `deepseek-v4-flash-0731` | 0.09/0.18/0.018/0.0 | 0.14/0.28/0.028/0.0 | 0.64x low |
| `z-ai/glm-5.2` | 0.76/2.42/0.14/0.0 | 0.966/3.036/0.1932/0.0 | 0.79x low |
| `gemini-3.6-flash` | 1.5/7.5/0.15/0.0833 | 0.75/3.75/0.075/0.041667 | **2.0x high** |
| `gemini-3.8-flash` | 1.5/7.5/0.15/0.0833 | 0.75/3.75/0.075/0.041667 | **2.0x high** |
| `gpt-5.6-luna` | 0.1/0.6/0.01/0.125 | 0.2/1.2/0.02/0.25 | 0.5x low |
| `gpt-5.6-terra` | 1.0/6.0/0.1/1.25 | 2.0/12.0/0.2/2.5 | 0.5x low |
| `gpt-5.6-sol` | 5.0/30.0/0.5/6.25 | 2.0/10.0/0.2/2.5 | 2.5x high |

Correct: `kimi-k3`, `claude-opus-5`, `claude-sonnet-5`, `grok-4.5`.

Solving the two runs as a two-unknown system independently landed gemini's multiplier at **0.5005**
before the catalog was consulted — the arithmetic and the source agree.

### Retrodiction (zero cost, both runs)

| run | old rates | corrected | billed | corrected err |
|---|---|---|---|---|
| `postmerge-check` | 0.345179 | 0.174160 | 0.173784 | **+0.22%** |
| `drift-day2` | 0.632387 | 0.348145 | 0.327899 | **+6.17%** |

From +98.6% / +92.9% to +0.22% / +6.17%. The remaining 6% sits in the cache-heavy run (962,304
deepseek cache-read tokens against 12,288 in the other), so the residual is almost certainly in how
cache reads are billed versus how pi models them. Worth one probe; not a blocker.

### What shipped

- `models.json.tmpl` corrected — 7 rates, 4 left alone.
- **`sandbox_mount/host/check_rates.py`** — the gate-F analogue for prices. Reports drift and exits
  non-zero; `--fix` rewrites by targeted substitution so the `{{...}}` placeholders and formatting
  survive. Verified in all three states: clean (exit 0), drifted (exit 1, lists 7), `--fix`
  (reproduces the hand-built correction byte-identically, then re-detects clean). Run it before any
  experiment that ranks arms on cost.
- PLAYBOOK "Model rates".

### Consequence to carry forward

Every ADW cost figure this repo has ever printed is wrong by a per-model factor, including the
2026-08-22 fan-out table — which is now doubly unusable for cross-arm comparison (mis-keyed per-arm
attribution *and* wrong rates). The run record's `spend` was correct the entire time. A mounted VM
keeps the rates it was provisioned with, so nothing already-run changes retroactively.

---

# 2026-09-07e — chasing the cache-read residual: two real bugs, one dead hypothesis, one open

Chased the +6.17% left over after the rate fix. The residual is **not** what I said it was, and the
method I used to find it was partly invalid. Three outcomes.

### Correction: cross-time retrodiction does not work

I built a 20-run regression from every harvested trace and compared each against billed spend using
*today's* catalog. Errors ran −37.7% to +104.2%, which looked like a modelling failure. It is not:
**those runs were billed at the prices in force on their own date.** `cof-deepestseek-20260822` is
the proof — its own trace recorded $0.0879 using the old rates, the key billed $0.0670, and today's
catalog predicts $0.1367. Today's prices make an August run's prediction *worse*.

So only same-day runs can validate a rate table, the usable dataset collapses from 20 to 2, and the
"+6.17% cache-read residual" was over-read from a comparison that could not support it. The
cache-read-share correlation across all 20 runs is **−0.175** — no relationship. Hypothesis dead.

### Real finding 1 — the trace under-records billed usage

`cof-frontier-20260822` isolates this perfectly: it used **only `claude-opus-5` and `kimi-k3`, both
of which had correct rates** in the old table, so no rate error can be involved.

```
trace-recorded cost : $1.196916
key actually billed : $1.624062
never recorded      : $0.427146   = 26.3% of spend
```

That run died at `review_1` on a SIGTERM. Phases that burn tokens and then fail still bill, but do
not emit the captured agent event, so the trace simply never sees them. **The ADW's cost is
unreliable in both directions** — inflated by bad rates (now fixed) and deflated by uncaptured
failed turns (not fixed). The run record's `spend` remains the only trustworthy number.

### Real finding 2 — independent confirmation of the rate fix

`gogem-20260905` used `gemini-3.8-flash`, which was 2.0x high. Its trace-recorded cost against
billed: **1.996**. That run played no part in deriving the fix, so it is a clean out-of-sample
confirmation of the 2x on that model.

### Open — deepseek cache reads

Among same-day runs only one is informative (`postmerge-check`'s deepseek cache-read is 12,288
tokens, so the parameter is unidentifiable there — it solves to a nonsense negative). `drift-day2`
implies **$0.00696/M against catalog $0.028/M, a factor of 4.02**, while gemini's cache-read in the
same solve lands at $0.0745 against catalog $0.075 — essentially exact. So the divergence is
deepseek-specific, not a general cache-read modelling error.

**Two explanations produce identical arithmetic and this data cannot separate them:**
1. OpenRouter bills deepseek cache reads at ~1/4 of its published `input_cache_read`; or
2. pi over-counts deepseek `cacheRead` tokens ~4x.

Plausibility does not settle it: deepseek's cacheRead/input ratios (3.4x–22.6x) look high next to
gemini's (0.9x–2.8x), but `claude-opus-5` legitimately shows 8,922x because Anthropic-style caching
counts only the uncached delta as `input`. High ratios are normal.

**The rate was deliberately NOT changed.** Adjusting it to 0.007 would fit one run while
contradicting OpenRouter's published figure, and would silently mask a token-count bug if (2) is the
truth — and would then break the day pi is fixed.

### The decisive fix, when someone wants it

Stop estimating. pi's stream should be carrying a provider generation id per turn; capture it in the
trace and cost becomes *reconcilable* against OpenRouter's own per-generation record instead of
recomputed from a rate table. That dissolves this entire class — rate drift, cache-read ambiguity,
and the under-capture above all become visible as a diff against the authoritative source. Neither
the harvested artifacts nor the trace carry such an id today (checked), and the raw pi session files
live on the VM and are not mirrored by teardown, so confirming pi emits one needs a live box.

Cheap interim probe: one controlled deepseek call with a known cached prompt, then read that
generation's actual charge from OpenRouter. Fractions of a cent, and it settles (1) vs (2) outright.

---

# 2026-09-07f — capture the provider generation id, so cost can be reconciled instead of recomputed

First half of the fix proposed in 2026-09-07e. Every cost figure this repo prints is *recomputed*
from a local rate table, and that has now failed twice in one day in opposite directions: the table
was wrong for 7 of 11 models, and a separate 26.3% of `cof-frontier`'s spend never reached the trace
at all. Both are invisible by construction, because nothing is ever compared against the provider's
own record.

### It turned out to be possible

I had flagged this as unconfirmed — the trace carries no id and teardown does not mirror pi's raw
session files, so there was no way to check from artifacts. Reading pi 0.84.4's bundle settles it:

```
output.responseId ||= chunk.id          # OpenAI-compatible stream path
Object.assign(partial, {stopReason, usage, responseId})
```

For OpenAI-compatible APIs — which is how we reach OpenRouter — pi sets `responseId` from the
stream chunk's `id`, and that is OpenRouter's generation id. It reaches us on the assistant message
at `message_end`, already in the stream we parse. Nothing needed patching.

### What changed

`UsageBreakdown.response_ids: list[str]`, appended by `add_turn(usage, total, response_id=None)`.
Deliberately parked on the usage type rather than `PiResult`, so it rides plumbing that already
exists: `merge()` concatenates lists with the same `+` it uses to add ints, so a retried phase
accumulates ids for free, and `model_dump()` carries them into the `agent_end` trace payload without
`agents.py` changing at all. Two files, ~20 lines.

Captured for **every** assistant turn including `aborted` and `error` — a turn that burns tokens and
then fails still bills, and those are exactly the turns the trace has been losing. (Note the
contrast with the line directly below it: occupancy deliberately ignores failed turns, because
usage you can't trust shouldn't set the context bar. Cost is the opposite — it must count.)

Mirrored into `.claude/skills/sssf/templates/` so a fresh `/sssf install` gets it. **Pre-existing
drift noted, not fixed:** those templates already lag `adws/` — they are missing `TestCase` /
`TestDesignOutput` and `assistant_message_records` from earlier work. Worth a sync pass of its own.

Verified offline, 11/11: order preserved, duplicates not double-recorded (but their cost still
counted), turns without an id still counted, `merge()` concatenates across retries while still
summing cost, `model_dump()` carries the field, the realistic `message_end` shape parses, an errored
turn's id is captured, and the old two-argument call site still works.

### Second half, not built — and one constraint to design around

Reconciliation itself: fetch each id from OpenRouter's per-generation record and compare the sum to
the run record's `spend`. That makes rate drift, the deepseek cache-read ambiguity, and the
under-capture gap all visible as a diff against the authoritative source.

**The constraint:** teardown revokes the runtime key before the VM dies, and a revoked key very
likely cannot read its own generations. So reconciliation has to run *before* revoke — inside
teardown between `harvest` and `revoke` — or as a `just sbx manage reconcile <run-id>` while the box
is still alive. Anything that assumes it can reconcile after teardown will find the door closed.

End-to-end capture is unverified until the next sandbox run: it needs a live pi, and host-local pi
still 401s on the `env:OPENROUTER_API_KEY` placeholder. The next mount will show ids in the
`agent_end` payload, or it won't.

---

# 2026-09-07g — generation-id capture verified live, and reconciliation settles the deepseek question

Run `genid-check-20260907-536905`, mounted from `9a1fcae`. Closed both open uncertainties and
answered the question 2026-09-07e had to leave open.

### The corrected rate table survives a real provision

First mount since the rate fix merged, so this is the first time `models.json.tmpl` was rendered
onto a box. Gate D (`non-zero cost and a loaded rate table`) passed, gate F reported six `ok`, and
the rates on the VM are the corrected ones:

```
deepseek/deepseek-v4-flash-0731  {'input': 0.14,  'output': 0.28,  'cacheRead': 0.028}
google/gemini-3.6-flash          {'input': 0.75,  'output': 3.75,  'cacheRead': 0.075}
```

### Generation ids arrive

adw `f5d8c379`, 5/5, commit `708c866`. **27 ids captured** — 21 planner, 6 builder — in
OpenRouter's `gen-<ts>-<rand>` form, sitting in the `agent_end` payload exactly as designed, with no
change to `agents.py`. The capture is real, not theoretical.

### Reconciliation works — and it is decisive

Queried `GET /api/v1/generation?id=<id>` for all 27 **while the runtime key was still alive**:

| agent | model | gens | our estimate | authoritative | ratio |
|---|---|---|---|---|---|
| planner | gemini-3.6-flash | 21 | $0.107459 | $0.107459 | **1.000x** |
| builder | deepseek-v4-flash | 6 | $0.005995 | $0.003083 | **1.945x** |
| | | 27 | $0.113454 | $0.110542 | 1.026x |

Two results, both important.

**1. The gemini fix is exact.** Not "close" — 1.000x to six decimals, per generation. The 2x
correction shipped in PR #3 is confirmed against the provider's own record.

**2. The deepseek question is answered: it is the RATE, not the token count.** 2026-09-07e could not
separate "OpenRouter bills deepseek cache reads at 1/4 of published" from "pi over-counts deepseek
cacheRead 4x", because both produce identical arithmetic. This separates them: gemini reconciles
*exactly* through the identical counting code, so the counting is sound. Therefore
**OpenRouter's published deepseek price is ~1.945x what they actually bill.**

That also explains 2026-09-07d's puzzle — why the old deepseek value (0.09/0.18/0.018) retrodicted
better than the catalog value we replaced it with. It was closer to the billed rate by accident.
Implied billed rate: roughly `0.072 / 0.144 / 0.0144`.

### The open decision

`check_rates.py` enforces agreement with the published catalog, and the published catalog is wrong
for this model. Correcting deepseek to the measured rate means the checker reports permanent false
drift unless it learns a documented per-model override. Left as a decision rather than a silent
edit, because the table was already changed once today on catalog authority and that made deepseek
*worse*:

- **Keep catalog** — defensible source, checker stays clean, deepseek estimates stay ~1.95x high.
- **Use measured** — accurate, needs an override mechanism in `check_rates.py` (~20 lines) so the
  deviation is declared rather than looking like drift.

Either way the estimate gates nothing. The run record's `spend` and now the per-generation record
are both authoritative.

### What reconciliation should become

This was run by hand over ssh. As a recipe it must sit **before revoke** — teardown kills the key,
and the endpoint is key-scoped. Natural home: `just sbx manage reconcile <run-id>` while the box is
alive, or a teardown step between `harvest` and `revoke`. It would also expose the 26.3%
under-capture directly: sum the captured generations, compare to the key's billed total, and the gap
is the usage the trace never saw.

# 2026-09-15 — model refresh: glm-5.3 and gemini-3.8-flash swapped into three rosters

A `/model-refresh` audit against OpenRouter's live catalog found no retired pins. Two approved swaps:

| Roster | Lane | Was | Now |
| --- | --- | --- | --- |
| default | planner | `gemini-3.6-flash` | `gemini-3.8-flash` |
| default | reviewer | `glm-5.2` | `glm-5.3` |
| open-weights | planner, reviewer | `glm-5.2` | `glm-5.3` |
| top-speed | planner, reviewer | `gemini-3.6-flash` | `gemini-3.8-flash` |

Both are price-neutral at the published rates: gemini 3.6 and 3.8 are both 0.75/3.75, and glm-5.3 matches
glm-5.2's current published 1.40/4.40. `glm-5.3` was added to `models.json.tmpl`: 1M context,
`maxTokens` 128000 (the lowest cap among healthy endpoints), catalog rates 1.4/4.4/0.26/0.0. `gemini-3.8-flash` was already registered.
`glm-5.2` and `gemini-3.6-flash` stay registered so either swap can be reverted without re-provisioning.

**Verified on the host:** all six configs load and pass `agents.validate`, every roster model is in
the registry, `check_rates.py` shows glm-5.3 in agreement, `just sbx manage doctor` OK. Both models
have ZDR endpoints (glm-5.3: 23, gemini-3.8-flash: 3); gemini-3.8-flash already ran live in
`gogem-20260905`.

**Not verified:** glm-5.3 has never been pinged by pi or through gate C. The first mount of the default or
open-weights roster is its smoke test. Watch the reviewer lane for its first run.

### Still open from the audit (not applied)

- **Scheduled price change:** Gemini 3.6/3.7/3.8 Flash all double to 1.50/7.50 on 2027-01-01. That hits
  default, top-speed and gemniflash.
- **Rate drift, pre-existing:** `check_rates.py` flags deepseek-0731 (published now 0.06/0.12),
  glm-5.2 and kimi-k3. The deepseek keep-catalog-or-use-measured decision above is still open.
- **maxTokens floors dropped:** 0731 via Venice caps at 32768 (registry 65536), kimi-k3 via DeepInfra at
  16384 (registry 65535).
- **Unregistered fallback:** `adws/adw_data/harness_engineering/subagents.ts` falls back to
  `gemini-3.5-flash`, which is not in the registry.
- **Candidates to trial:** try `deepseek-v4.1-flash` (0.15/0.60) as a builder arm, `deepseek-v4-pro-0813` (0.66/1.98) as an
  open-weights builder, and `grok-4.6` in place of the unused `grok-4.5`. `claude-fable-5.1` is ruled out: it has no ZDR endpoints
  and costs 2x opus-5.
- `references/models.md` registry table still carries the 2026-08-04 rates and the "ten models" heading.

# 2026-09-17 — named targets shipped: `--target greenfield` is one flag, and the first e2e arm ran through it

`specs/greenfield-target.md` built on branch `greenfield-target`. The manual manifest flip
(`cp ../greenfield-sandboxes/app.manifest.yaml app.manifest.yaml`) is gone.

### What shipped

- **`targets/greenfield.yaml`** + `manifest.py --target NAME get …`, `manifest.py list`,
  `get-target-section`. The root `app.manifest.yaml` is the implicit `default` target.
- **Run record `target` field.** `create --target NAME` validates and records it; fill, observe,
  refresh and harvest read it from the record. Old records read as `default`.
- **`just target list|show|sync`** → `sandbox_mount/host/target_sync.py`: `git archive HEAD` export,
  derived exclusions (`just/<app>.just`, `mod <app>`), leak scan (host app name + `archive/` app
  names + `leak_patterns`), Python mirror with an owned-path guard, gates in the checkout (manifest,
  bun build, bun test, every roster through `agents.validate`), neutral `factory sync <date>`
  commit, `--push`, provenance in `.sandbox/targets/<name>.json`. Fill pins a named target to the
  last **pushed** `target_sha`.
- **Harvest** verifies and fetches named-target bundles into `target.checkout`.
- `create.just` VM tag `inkwell` → `sssf` (the only leak hit; nothing filtered on the tag).
- Docs: README, PLAYBOOK § Greenfield runs, TREE, prime, and the orchestrator skill + 7 cookbooks/references.

### First sync

30 files: 10 added (`refresh.just`, `traces.just`, `app_proxy.ts`, `toolchain.lock`,
`check_rates.py`, `target_sync.py`, …), 20 changed, 0 deleted; +1614/−139. Greenfield had no
intentional divergence, only 19 days of drift. Self-tests: a committed app-name comment under
`adws/` → exit 2 with `path:line`; `apps/app` in `sync_paths` → exit 1 (overlap).

### The e2e arm: `gf-e2e-20260917-cbb166`

The plumbing worked end to end: create recorded `target: greenfield`; fill printed
`pin from last sync: 66a7432…` and gate A matched it; the VM had only `apps/app`, neutral history,
zero `fretboard|inkwell` hits; `execute … prompts/greenfield.md "" tdd` ran `adw_tdd_sdlc.py`;
harvest landed 3 commits in `../greenfield-sandboxes` (none in this repo); teardown clean.
Billed spend **$1.17** (trace estimate $1.42), ~50 min wall.

The ADW itself ended **✗ fail**. All 10 phases passed, but review_2 still had 3 blocking items
(20/23 plan requirements met). Chain: plan (gemini-3.8-flash) → red suite, 24 failing tests
(committed `b4786e4` **before** the build) → build 1,100s → review_1 rejects (6 blocking, incl. a
real `ReferenceError: idx` in `ui/circle-wheel.ts` that 42 green tests never reached) → revise_1
918s → review_2 rejects. **The TDD chain does not commit an unapproved build**, so the work sat
dirty on the VM. Harvest skips uncommitted edits and teardown refuses a dirty tree, so it was
committed by hand on the run branch as
`Unapproved build from ADW 474f412f … preserved for inspection`. Traces are at
`.sandbox/traces/gf-e2e-20260917-cbb166/`.

### Findings worth acting on

1. **The builder spends its time fighting `edit`.** deepseek-v4-flash-0731 made 49 edit calls and
   20 failed; 18 were schema failures (`path` omitted). It misread that as "large edits fail",
   split edits, and fell back to 32 whole-file writes: 4.5M tokens on build, 7.5M on revise.
   Cheap ($0.40 combined) but slow. Try a harness hint that `edit` requires `path`, or a builder
   with cleaner tool calls, and compare with these traces.
2. **The tests can't see the browser code.** The `idx` crash was caught by the reviewer's DOM shim
   and `tsc --noEmit`, not by any gate. A `tsc --noEmit` gate over `app.entry`'s graph would catch
   that class of bug deterministically.
3. **An unapproved build is uncommitted work, and harvest can't see it.** Consider having the TDD
   chain commit a failed-review build to the run branch with a marked subject, so the evidence
   survives without a manual step.

### Open

- Pre-existing doc staleness surfaced by the fresh-agent check: TREE/prime still describe
  Inkwell/four namespaces in places, `mount_one.md` hard-codes the old `disler/...` clone URL.
- Doctor drift warning when a target's `host_sha` lags HEAD (deferred in the plan).

# 2026-09-17b — pristine-main guard: the clean room can't be polluted by a merged run

Harvest keeps a team's work in local-only `refs/sandbox/*` in `../greenfield-sandboxes`, and the sync
pushes only `main`, so greenfield was already a clean room. The gap was PLAYBOOK §6's
"merge once you like it" step. Done in the greenfield checkout, it would have put a built app on
`main`, and the next `--push` sync would have published it without a word: the leak check reads only
the factory export. Every later arm would then clone an earlier arm's answer.

**Shipped (plan Phase 7):** `targets/greenfield.yaml` records `target.pristine: c9b98d1` (the empty
shell) and `pristine_paths: [apps]`. `target_sync.py` checks, after the fast-forward and before
export, in every mode: `apps/` equals pristine, and no tracked path lies outside sync/owned. On
failure it exits **5** and leaves the checkout untouched. `--check-pristine` is a read-only mode;
`just target show` prints `pristine: ok` / `pristine: DIRTY — …`. The PLAYBOOK now has
§ "Keeping a result": keepers go to their own repo (`push … refs/sandbox/<id>:refs/heads/main`) or
come here via `just app swap`, never a branch on the target repo (clones fetch every branch).

**Proven in scratch clones:** a real merge of `gf-e2e-20260917-cbb166` → exit 5, naming 22 differing
files under `apps` plus stray `specs/474f412f_circle-of-fifths-guitar.md`; a stray-only commit →
exit 5; an owned `prompts/` edit → exit 0; a missing pristine sha → exit 1. The real checkout and
remote were untouched.

**Open:** greenfield's factory copy is now 2 files behind (`target_sync.py`, `just/target.just`).
Re-sync with `--push` when approved.

### Found at wrap-up: setup gates C/D/E are not enforced (fix before the next fan-out)

On `gf-e2e-20260917-cbb166`, gate C printed `FAIL  openai/gpt-5.6-luna: … rate-limited upstream` and
then `[gate] C PASS`. Gate D's "pi reports cost" line and gate E's limit/used/remaining lines never
printed. Likely cause (from reading the code, not yet reproduced): gate C/D/E runs as one heredoc
fed to `ssh … 'bash -s'`, and gate D's `pi -p --mode json …` (`just/sandbox/lifecycle/setup.just`,
the `pi_cost=$(timeout 180 pi -p …)` line) has no `< /dev/null`. pi reads the rest of the heredoc
off stdin as prompt input, bash hits EOF, and the script exits 0 via `|| echo 0`. The
`[ "$ping_fail" -eq 0 ] || exit 2` and `cost_fail` checks never run, so **C, D and E pass
unconditionally**. This is the same stdin-detachment class `observe.just` already documents.
Fix: `< /dev/null` on that pi call. Then prove it with a deliberately failing roster model:
C must fail, and D/E must print.

---

## 2026-09-17 — setup gates C/D/E: reproduced, fixed, and proven on a live VM

Confirmed on `gate-fix-20260918-c336f6` (default target, `--limit 2`). The 2026-09-17 hypothesis was
right about the mechanism, and the fix uncovered a **second** bug the first one had been hiding.

### 1. The mechanism, isolated from setup

Straight `ssh 'bash -s' <<'EOF'`, nothing to do with the gate:

```
# without a redirect on pi                # with `< /dev/null` on pi
before                                    before
rc=0                                      after-pi
                                          still-here
                                          rc=0
```

`after-pi` and `still-here` never print. Remote bash reads the script from stdin, `pi` reads the rest
of it as prompt input, bash hits EOF and exits **0**. Every line below the pi call is silently
skipped — including the gate's `[ "$ping_fail" -eq 0 ] || exit 2`.

### 2. The gate, before the fix

A failing roster pinned in `/tmp` so gate A's clean-tree check still passes:

```
just sbx run cmd <id> "sed 's#openrouter/openai/gpt-5.6-luna#openrouter/nonexistent/no-such-model#' \
  adws/adw_sssf_config/sssf.config.yaml > /tmp/bad.config.yaml"
just sbx lifecycle setup <id> /tmp/bad.config.yaml
```

```
   FAIL  nonexistent/no-such-model: nonexistent/no-such-model is not a valid model ID
[gate] C PASS  every roster model answered      <- contradicts the line above
[gate] D PASS  non-zero cost and a loaded rate table   <- no "pi reports cost $..." line
[gate] E PASS  credit reported above                   <- no limit/used/remaining lines
[setup] GATE PASSED — ... is healthy             rc=0
```

**The tell is the missing evidence, not the contradiction.** D and E printed their PASS banners (the
host echoes those when ssh returns 0) while printing none of the numbers they exist to report.

### 3. The fix — two redirects and one flag

`just/sandbox/lifecycle/setup.just`:

- `< /dev/null` on gate D's `pi -p`, placed on the line carrying `pi -p` so
  `grep -n 'pi -p' … | grep '/dev/null'` can see it. A redirect is valid anywhere in a simple command,
  but on a continuation line it is invisible to grep and easy to mis-attach to the `jq` it pipes into.
- `< /dev/null` on gate B's `pi --list-models` as defence in depth. Observation says it was not eating
  stdin (the echo after it printed), but it is the same class and the only other agent CLI in a gate
  heredoc.
- **`--no-tools --no-session` on gate D's `pi -p`.** This is the second bug. `pi` is an *agent*, not a
  completion endpoint — with stdin no longer truncating it, it started actually **doing** the task and
  wrote a real `sandboxes.md` (186 bytes, one correct sentence about sandboxes) into `~/app`. That
  dirtied the repo, so the *next* `setup` run failed **gate A** with `?? sandboxes.md`. Gate D only
  needs a live billable call that reports a cost, so taking the tools away makes the probe incapable of
  touching the tree. Side benefit: the probe got ~4× cheaper ($0.000286 → $0.000067) with no tool loop.

Audit of the other two gate heredocs (`REMOTE_A`, `REMOTE_B`): no other stdin readers — every `sed`,
`grep`, `jq`, `awk` and `sort` in them takes a file or a pipe. All three bodies pass `bash -n`.

### 4. The gate, after the fix

Bad roster — now a correct failure, **with** the D and E evidence proving the script ran to its end:

```
   FAIL  nonexistent/no-such-model: nonexistent/no-such-model is not a valid model ID
   pi reports cost $0.00028574000000000004 on a live call (rate table is loaded)
   rate table present: every model in models.json has a non-zero input cost
   limit     $2
   used      $0.001821125
   remaining $1.998178875
[setup] FAILED: assertion C — at least one roster model did not answer      rc=1
```

Default roster — a genuine six-assertion pass, tree still clean afterwards (`porcelain lines: 0`):

```
[gate] A PASS  ·  B PASS (425 models)  ·  C pass ×4
   pi reports cost $0.00006734 on a live call (rate table is loaded)
   limit $2 · used $0.001945103 · remaining $1.998054897
[gate] C PASS  ·  D PASS  ·  E PASS  ·  F PASS      rc=0
```

### 5. Docs corrected alongside

- `cookbooks/fan_out_n.md`: the "`execute` does not take a config argument" section and its hand-rolled
  ssh workaround are gone, replaced with the real positional form
  (`execute RUN_ID PROMPT CONFIG="" ADW="sdlc"`); both fan-out loops now pass each arm's roster to
  `setup` as well, so gate C pings the arm it is gating; the golden-VM "bills continuously" claim is
  corrected to capacity-and-disk on a flat subscription, with the 2-vCPU reason wall clock is not
  comparable across overlapping arms.
- `cookbooks/debug_a_failed_gate.md`: new §3 "FAIL then PASS in one gate block — stdin detachment",
  with the symptom, the tell, the fix and the bad-roster verification. Its stale note claiming gate C
  reads `$SSSF_CONFIG` from the sandbox environment is corrected — the roster is a positional argument.
- `PLAYBOOK.md` §1: the `setup` row keeps "6-assertion" (true again) and adds that a block printing
  FAIL then PASS is a bug, not a flaky model.

**Lesson for the gate class generally:** a gate that reports PASS without printing the evidence it
exists to print has not run. Assert on the evidence, not on the exit code.

---

## 2026-09-17 — fan-out readiness, phases 2–4 (measure, type-check, keep)

All three are offline changes, proven on the host against real artifacts rather than on a VM.

### Phase 2 — you cannot fix a failure you are not counting

`sandbox_mount/host/trace_metrics.py` + `just sbx manage trace-metrics <run-id>` count
`tool_execution_end` events per (adw_id, agent) and classify each error from the tool's own message
text. It reproduces the `gf-e2e-20260917-cbb166` baseline exactly:

```
474f412f   builder           128    20  15.6%  edit=20   schema=18 no-op=1 not-found=1
474f412f   planner            35     1   2.9%  ls=1      other=1
474f412f   reviewer           60     0   0.0%
474f412f   test_designer       8     0   0.0%
```

Unparseable lines are counted in `skipped`, never dropped: a truncated trace would otherwise read as
a clean, low error rate — the one wrong answer this tool must not give. It reads **pulled** traces
only, so the number is reproducible and still available after teardown.

The builder prompt gained a 7-bullet `## Tool contracts` section (mirrored into the sssf template).
**The trace alone would have produced two wrong bullets**, so the schema was read out of pi 0.85.1
itself (`editSchema` in the installed bundle):

- The plan assumed `edit` takes `{path, edits:[…]}` *instead of* a flat form. Both are valid —
  `prepareEditArguments` normalizes a flat `{path, oldText, newText}` into the array form. `path` is
  the required property, and it is what all 18 schema failures omitted. (Confirmed from the other
  side too: of 57 `edit` calls, the 39 with `path` succeeded and the 18 without it failed.)
- The plan assumed `oldText` must match "byte-for-byte". It must not: `normalizeToLF` plus a
  whitespace-tolerant `fuzzyFindText` fallback run first. The real constraints are **uniqueness** and
  **non-overlap**, and every `oldText` is matched against the **original** file, not against earlier
  edits in the same call. So the correct advice is "many edits in one call", not "re-read between
  every edit" — the opposite of what a byte-for-byte reading implies.

Hypothesis to score in the fan-out (H1): builder `edit` schema failures drop from 18 to ≤3.

### Phase 3 — the typecheck gate compiled a crash and called it green

`quality.typecheck` ran `bun build --target=browser`, which strips types without checking them.
Measured on a worktree of `refs/sandbox/gf-e2e-20260917-cbb166`:

| tree | `bun build` (old gate) | `tsc --noEmit` (new gate) |
|---|---|---|
| harvested, with `String(idx)` reintroduced | **exit 0**, "Bundled 18 modules" | exit 1, `circle-wheel.ts(99,36): error TS2304: Cannot find name 'idx'` |
| harvested, as the reviewer approved it | exit 0 | exit 1, 15 errors (13 TS2345, 1 TS2322, 1 TS2304) |
| greenfield shell / `apps/fretboard/main.ts` | exit 0 | exit 0 |

So the old gate was blind to the exact defect that shipped. `typecheck` is now a pinned non-strict
`tsc --noEmit` (TSC_VERSION 7.0.2, pinned like oxlint), and `quality.run_verify(run, extra_files)`
runs typecheck then tests as one result. Both `adw_tdd_sdlc.py` and `adw_simple_sdlc.py` call it
where they called `run_tests`, keeping the A/B symmetric; `adw_build_test.py` and
`adw_plan_build_test.py` are untouched. `run_verify` deliberately does **not** short-circuit on a
failed typecheck — a builder handed the type errors and the failing tests together can fix both
inside one bounded fix loop. `bun x` keeps its lockfile in the bun cache; both repos stayed clean.

**Greenfield render smoke** (greenfield commit `0382e275`, the first deliberate `target.pristine`
bump). `bun test` has no DOM, so main.ts's module-scope render never executed under test: the old
"module graph loads" only proved the file parsed. A document stub installed at module scope, before
the first dynamic import, makes the real render path run. Mutation-checked rather than assumed —
deleting the render fails it (1 pass/1 fail), a throwing render fails it (0 pass/2 fail). tsc catches
names and types; only this catches code that type-checks and then throws while drawing.

The pristine guard behaved exactly as designed: `just target sync greenfield --dry-run` exited **5**
naming `apps/app/app.test.ts` until `targets/greenfield.yaml` was bumped, then exited 0 with all
gates green. First real exercise of the escape hatch.

### Phase 4 — a rejected build is no longer lost by default

`just sbx manage snapshot <run-id> "<why>"` commits a dirty VM tree onto `sbx/<run-id>` with subject
`UNAPPROVED snapshot: …` and author `sssf-snapshot`, so harvest can carry it and `git log` can never
mistake it for approved work. The logic is in `sandbox_mount/guest/snapshot_run_branch.sh` and is
**piped over ssh**, so a VM mounted from an older factory commit still gets today's behaviour — and
so it can be tested with no VM at all. Verified locally against throwaway repos:

| case | result |
|---|---|
| dirty tree on `sbx/t-000000` | `OK <sha> 1`, subject `UNAPPROVED snapshot: review_2 rejected` |
| clean tree, re-run | `CLEAN`, exit 0, no new commit |
| HEAD is `main` | exit 2, main unmoved, nothing staged |
| HEAD detached | exit 2 (`symbolic-ref`, not `--abbrev-ref`, so "HEAD" can't pass as a branch name) |
| gitignored `.env` present | committed 3 files, `.env` absent |
| `.env` **not** gitignored | exit 1, refuses, unstages — added beyond the plan; that file holds the live runtime key, so it is asserted, not assumed |

The chain's commit semantics are unchanged on purpose (see the plan's Notes): committing rejected
code inside the chain would make "the latest commit is approved" untrue, and changing it in the TDD
chain but not the simple one would break the A/B those two exist to provide. Teardown's dirty-tree
refusal now offers the recipe above `--force-dirty`.

### Docs

PLAYBOOK §2 (verify = typecheck + tests), §5 and § Greenfield runs (snapshot before harvest,
trace-metrics); `fan_out_n.md` gained a "Bringing every arm home" section and a tool-error column;
TREE.md gained both host scripts, the guest script, the three manage recipes, and its "FIVE-assertion
gate" line is now SIX.

### Open

- **Phase 5 (the judged N=4 greenfield fan-out) has not been run** — it needs explicit go-ahead: it
  pushes a sync, mints 4 keys and boots 4 VMs. `snapshot`'s live use is proven there, on any arm
  review rejects.
- The two new rosters (`sssf.asymmetric.config.yaml`, `sssf.inverse.config.yaml`) are not written
  yet; they must be committed **before** the sync so they ship to the VMs.
- Watch H2 in the fan-out: 13 of the harvested tree's 15 non-strict errors were TS2345
  (number→string arguments). If a first build burns a whole fix loop purely on those, consider
  failing only on undeclared names (TS2304/TS2552).

---

## 2026-09-18 — greenfield fan-out 2 (N=4, judged): H1 won, my two new gates lost

Full scorecard: `specs/greenfield-fanout-2-results.md`. Four arms, one prompt, one pin
(`da460ca6`), **$11.28 billed** against a $75 cap. All four torn down, keys revoked and verified
absent.

| arm | roster | outcome | tokens | billed | rubric /20 |
|---|---|---|---|---|---|
| gf2-1 | default | ✗ rejected | 21.2M | $1.14 | 14 |
| gf2-2 | default | **✓ accepted** | 12.7M | **$0.66** | **20** |
| gf2-3 | asymmetric (opus-5 plan+review) | ✗ rejected | 29.2M | $7.73 | 20 |
| gf2-4 | inverse (kimi-k3 builder) | ✗ rejected | 3.3M | $1.75 | 12 |

**The cheapest arm won. Both frontier arms failed.**

### What worked

**H1 CONFIRMED.** The builder tool-contract section cut `edit` schema failures from 18 to 0–2 in
every arm; the three deepseek arms agree (2, 2, 1). Builder error rate 15.6% → 2.1–5.5%. The
residual moved off `edit` onto `write` and `read`, and the glm-5.3 **reviewer** hit the same
`write` missing-`path` error, so it is a general pattern against this tool schema, not a deepseek
quirk. Generalize the bullet to every file tool.

`just sbx manage snapshot` earned its place three times — gf2-1, gf2-3 and gf2-4 all finished
rejected with dirty trees, and all three builds would have died at teardown without it.

### What failed, and it is my own work

**H2 FAILED.** `quality typecheck` ran in all four arms and **passed every time**. Zero defects
caught, never entered a fix loop. It also has a false positive: `import "./styles.css"` fails with
TS2882 while `bun build` accepts it; gf2-2 only dodged it by using a `<link>` tag.

**H3 FAILED, and caused harm.** The render smoke put test-double code into the production source of
**all four** arms (gf2-3 ships an entire `apps/app/testing/fake-dom.ts` inside the app), and
**crashed two of them in a browser**:

- gf2-1 — `main.ts` reached past the DOM API into the stub's internal `classNameSet` field.
- gf2-4 — `main.ts` ran `Object.defineProperty(globalThis, "document", …)` to cooperate with the
  stub; `document` is non-configurable in a browser, so it throws at module load. Its neighbouring
  `try { render(); } catch {}` also made the smoke test structurally unable to fail.

The plan predicted the stub might go *vacuous*. Instead agents extended it enthusiastically,
invented APIs on it, and depended on those inventions in production. **An unfaithful test double is
an attractive nuisance**, and telling agents to extend it made that worse.

tsc cannot see either crash in strict **or** non-strict mode — verified, both 0 errors. The hole is
explicit `any`, which defeats both. `oxlint`'s `no-explicit-any` would flag it, but `lint` is not in
`run_verify` or the TDD chain. That gap is mine.

**The damning summary: all four arms had green tests and 0 tsc errors. Two of them do not run.**

### Unplanned finding — a frontier planner taxes the flash seats downstream

`test_designer` is deepseek in every roster, giving four samples on one task. Opus-5's plan was ~2×
the size of the flash plans, and the flash test_designer spent **4× the tokens, 3–4× the tool calls
and 46 minutes** on it — producing *fewer* test lines than a flash-planned arm. Asymmetric rosters
should upgrade **seat pairs**, not single seats.

### Also

- Fixed mid-run: `just sbx manage snapshot` truncated multi-word reasons to the first word
  (`ssh host bash -s -- a b c` joins argv; the remote shell re-splits). `printf %q`, verified live.
- Fixed mid-run: every local `ssh` in `just/sandbox/` now has `< /dev/null`. A `while read … done <
  arms.tsv` mount loop had silently mounted exactly one of four arms.
- The plan's "2 shared vCPU caps the fan-out" note is **wrong** and cost ~40 min of needless
  serialization; the run records show 3–5 concurrent arms completing fine. Corrected in the plan.
- Billed ($11.28) ran ~84% of traced ($13.39). Use the billed column.

### Next (nothing applied — all need review)

1. **Seal or replace the render stub** — `happy-dom`, or `#private` storage + freeze. Highest value.
2. **Add a real load check to the chain**: headless page load asserting zero console errors. Every
   gate was green on two apps that crash on open; this is the single change most likely to move
   outcomes.
3. Generalize the `path` bullet to `edit`/`write`/`read`; strengthen non-overlap.
4. `declare module "*.css";` in the greenfield shell (fixes the TS2882 false positive).
5. Add `lint` to `run_verify`.
6. Rework the rubric — gf2-2 and gf2-3 both hit 20/20 despite an 11.7× cost difference.
7. Add a `model-format` error kind to `trace_metrics.py` (deepseek leaked DSML markup into JSON
   arguments on gf2-1; that is a provider bug, not an instruction-following failure).

---

## 2026-09-18b — the two crash fixes, and a scope correction found by building them

Follow-ups 1 and 2 from the fan-out 2 results, done together.

### happy-dom replaces the hand-rolled stub (greenfield `4d6e63bd`, pristine bumped)

**The browser turned out not to be needed for crash detection.** A real DOM plus one detail —
binding `document` with `configurable: false`, as a browser does — catches *both* crash classes
inside `bun test`, in the fix loop. Verified against the actual crashed code from both arms, not a
reconstruction:

```
gf2-1  TypeError: undefined is not an object (evaluating 'btn.classNameSet.add')
gf2-4  TypeError: Attempting to change configurable attribute of unconfigurable property
```

Those are the same errors the browser reported. Without `configurable: false`, gf2-4's class still
passes — happy-dom alone is not enough, and that one flag is the difference.

Mutation-checked four ways (render removed, invented property, redefined document, clean → 2 pass),
confirmed to run from the repo root the way `quality.tests()` invokes it, and lint/typecheck/build
all still exit 0. `bun.lock` is committed so every arm resolves the same dependency, for the same
reason oxlint and tsc are pinned. No provisioning change: `provision.sh` already runs `bun install`
for `apps/*/` when a `package.json` exists.

**The lesson, generalized:** a test double that is not API-faithful is an attractive nuisance. The
instruction to *extend* the old stub made it worse — agents extended it, invented APIs on it, and
shipped dependencies on those inventions. A real implementation fails the same way production does,
which is the only property that matters in a test double.

### The reviewer was told to ignore design

Root cause is sharper than "blind". The reviewer prompt read *"Not your job: running tests, style
opinions, refactors"* — so it was **instructed** to skip the UI. That is why gf2-2's reviewer
produced 9 rigorous line-cited blocking findings and never noted the app had no styling at all.

Now split: CODE-style opinions (formatting, naming) stay out of scope; the **delivered interface is
a requirement** — does it apply any styling at all, is there a visible hierarchy, are controls
distinguishable from static text. Bounded honestly: the reviewer reads source, so *absence* of
styling is checkable and whether a palette is attractive is not.

I had written that the reviewer was "blindfolded, and no prompt fixes a missing sense." Half wrong,
and worth correcting: presence of styling is visible in source; only design *quality* needs sight.

### `just sbx manage shot <run-id>` — records what shipped

Screenshot + console errors from the **host**, where a browser already exists. Chromium is ~190 MB
and would buy nothing on the VM that happy-dom does not already cover in the fix loop, so it stays
off the arms. **Deliberately not a gate** — exits 0 on a crashed page and reports the crash, because
gating belongs where a failure can still be repaired.

Verified against a locally served shell, clean and crashed. One fact worth keeping: **under Bun's
dev server a module-scope TypeError arrives on `console`, not `pageerror`**, because the HMR client
catches it. My first code comment asserted the opposite. The script now watches both channels and
also reports rendered-text length, which is the signal that does not depend on how a dev server
chooses to report an exception — a crashed page shows 0 chars.

Run `just sbx lifecycle refresh <id>` before `shot`, or you photograph a stale bundle.

### Still open

`path` bullet generalization · tsc CSS false positive (`declare module "*.css";`) · `lint` in
`run_verify` · rubric headroom with no cost item · seat-pair experiment · `model-format` error kind
in `trace_metrics.py`.

### `path` bullet generalized — and re-deriving the evidence corrected the write-up

The contract's first bullet now covers **every file tool**, not just `edit`. Re-deriving the
evidence before writing it found that my own H1 paragraph was wrong on two counts:

| tool | missing `path` | agents |
|---|---|---|
| `edit` | 18 baseline · 1 gf2-1 · 1 gf2-2 | builder |
| `write` | 1 gf2-2 | builder **and reviewer** |
| `read` | **0** | — |

The failure did **not** "move off `edit`" — `edit` is still the main offender, `write` joined it, and
`read` never lost a `path` at all (gf2-1's `read` failure was `limit: must be number`, the DSML
corruption). Results doc corrected.

It also surfaced a schema failure I had never recorded: gf2-3 sent
`edits.0.oldText: must have required properties oldText` — a malformed entry *inside* the array
rather than a malformed call. The new second bullet states each tool's argument shape, including
that every `edits[]` entry needs both `oldText` and `newText`, and that `read`'s `limit`/`offset`
are numbers not strings.

Non-overlap was promoted from advice to a hard rule, with the fix named: when two changes sit near
each other, **merge them into one larger entry**. gf2-2 hit this twice — it adopted the
one-call-many-edits advice and then overlapped the regions.

Section held to the plan's 8-new-bullet ceiling by merging the two error-reading bullets, which
overlapped anyway. Both copies (factory + sssf template) stay byte-identical.

**Method note worth keeping:** both corrections came from re-deriving numbers from the traces rather
than trusting a summary I had written hours earlier. A prompt bullet built on the wrong tool would
have taught the builder to guard a call that was never failing.

---

## 2026-09-18c — the remaining four follow-ups, and a prompt audit

### The prompt audit (Ron's call, and the sharper framing)

Ron's point, which reframes the design-blindness finding: telling an agent "style is not your
problem" in a way that leaves it optional is **worse** than a clean prohibition, because the results
become random — some arms look, some don't, and we learn nothing about their judgment either way.
His analogy: a client who says "I don't care how it looks, just ship the features" and then grades
you on looks. Better that the client had said nothing and found out whether you have taste.

**That means my first fix was also wrong.** I had replaced "don't judge style" with "do judge
style" — still steering, just in the opposite direction, and equally fatal to measuring whether
these agents have design judgment on their own.

Audited all six prompts (planner, builder, reviewer, test_designer, documenter, scout). Almost
everything is a legitimate **role boundary** (scout is read-only; test_designer writes exactly one
file) or **accuracy constraint** (documenter: name a file only if it is in the diff). Those stay.

One offender, and the clause was broader than the one I had already touched:

> Not your job: … **or anything the request did not ask for**. Work the request never asked for is
> not blocking on its own.

A brief that says *"how it looks is up to you"* **delegates** a decision. An agent can easily file
that under "not asked for" → not blocking. Replaced with three explicit cases:

- **Stated** — the spec asks for it: missing is always blocking.
- **Delegated** — the spec leaves it to the builder: the decision is still in scope, and a delegated
  decision made badly is a finding. Judge what was delivered against what a competent engineer would
  deliver for that request.
- **Unrequested** — neither asked for nor delegated: not blocking on its own.

The reviewer prompt now contains **zero** design-specific words. It neither suppresses design
judgment nor mandates it. Whether these agents notice an unstyled app is now a thing we can measure.

**Evidence that this is the right scope:** all four planners DID plan design (13–19 mentions each),
and builders built it. Only the reviewer was told not to look. So the planner prompt is left alone —
there is no evidence it suppresses anything.

### The four follow-ups

1. **tsc CSS false positive** — `apps/app/declarations.d.ts` in the greenfield shell (`declare module
   "*.css"` etc), pristine bumped to `4a6dfc83`. Ambient declarations are not reachable by import, so
   `quality.typecheck` now globs `APP_DIR` for `*.d.ts` and names them on the command line.
   Verified: with a css import, entry alone = 1 error, entry + declarations = 0.
2. **`lint` added to `run_verify`** — now `[lint, typecheck, tests]`.
3. **`model-format` error kind** in `trace_metrics.py`, checked BEFORE `schema` because provider
   corruption arrives through the ordinary validator. gf2-1 now reads `model-format=2 schema=1`
   instead of burying both in `schema`/`other`. Baseline still reproduces at `schema=18`.
4. **Rubric part B** (`specs/greenfield-cof-experiment.md`): part A frozen for comparability, six new
   discriminators (survives interaction, visual design, legibility of the core object, error-free
   under use, restraint, recoverability) and a process-metrics block that is recorded and never
   scored.

### Two measurements that changed the plan

**`no-explicit-any` is NOT being enabled, and my justification for adding lint was wrong.** I had
written that both crashes hid behind explicit `any` "which oxlint's no-explicit-any flags". It does
flag them — 55 errors on gf2-1, 5 on gf2-4 — but measuring the rest of the fleet killed the idea:

| tree | default rules | `no-explicit-any` |
|---|---|---|
| greenfield shell | 0 | 0 |
| fretboard (default target) | 0 errors | **2 errors** |
| gf2-2 (the arm that worked) | 0 | **6 errors** |

It would have failed the default target and blocked the one accepted arm. Since happy-dom now
catches the actual crashes directly, a noisy rule that fails working code is a bad trade. `lint` runs
default rules only; the docstring records the measurement so nobody re-proposes it blind.

**The `.d.ts` glob had two bugs, both caught by verification, neither by review.** First it matched
every `.d.ts` in `node_modules` (~700 from happy-dom) and would have put them all on the tsc command
line. Then the `node_modules`/hidden-dir filter matched `..` in `../greenfield-sandboxes`, silently
excluding everything. Now filtered on the path *relative to* `APP_DIR`.

### Also

`sssf.inverse.config.yaml`'s header said a roster "buys more rubric score per dollar" — that file
syncs to the public greenfield repo, so it was telling VM agents a score exists. No rubric contents
leaked, but it is needless contamination and it embedded the cost framing we just retired. Reworded.

---

## 2026-09-18d — greenfield fan-out 3 (N=6, one roster): the crash fix won, the verdict inverted

Full scorecard: `specs/greenfield-fanout-3-results.md`. Predictions pre-registered and committed
(`54f52c2`) **before any arm ran**. Six arms, one roster, one prompt, one pin (`a91e559`), TDD
chain. **$5.37 billed.** All six torn down, keys revoked and verified absent.

| arm | outcome | billed | A /20 | B /12 |
|---|---|---|---|---|
| gf3-1 | ✗ rejected | $1.07 | **20** | **12** |
| gf3-2 | ✗ rejected | $1.17 | **20** | **12** |
| gf3-3 | ✗ rejected | $1.43 | **20** | **12** |
| gf3-4 | ✓ accepted | $0.62 | 19 | 10 |
| gf3-6 | ✓ accepted | $0.36 | 17 | 7 |
| gf3-5 | ✗ rejected | $0.71 | 16 | 8 |

### P1 CONFIRMED — happy-dom did its job

**Zero crashes in six arms**, against 2-of-4 in the control. Console clean on every arm, 582–1476
chars rendered. That class of bug is closed.

### The result I did not predict: acceptance is anti-correlated with quality

The two accepted arms rank **4th and 6th of six**. All three arms that scored 32/32 were rejected.
**An automated "ship the accepted arm" policy would have shipped the two worst apps in the run.**

The reviewers are not careless — their findings are line-cited and correct. The mechanism is
structural: **each arm's planner writes the spec its reviewer grades it against.** Ambition creates
more checkable claims, so a rigorous reviewer finds more unmet ones and rejects. gf3-3 wrote 24
requirements and was rejected with 18 met; gf3-6's final review ruled on **seven** and approved.
Accept/reject measures plan conservatism, not delivered quality.

Ron reviewed all six in a browser without seeing any review and picked **gf3-1** — a rejected arm,
and a top scorer — as his favourite on first pass.

### Three defects no gate could see, all render-only

All six arms: **lint green, build green, every test passing** (32–86 tests). Two do not work.

- **gf3-6 (accepted)** — the wheel swallows every click. Key labels sit above the sectors carrying
  the handler with no `pointer-events: none` and no handler of their own. It has no other key
  control.
- **gf3-6 (accepted)** — all seven chord cards show the identical parent major scale as raw pitch
  classes. `circle.ts:169` assigns `notes: MAJOR_SCALE.map(...)`; six of seven chords are wrong.
- **gf3-5** — one SVG large-arc-flag (`1` on a 30° wedge) makes the F slice sweep ~330° and paint
  over the whole ring. All 12 labels hit-test to the same slice. One character.

happy-dom closed the crash class; it does no hit-testing or layout. **A headless load-and-drive
assertion in `run_verify` is now the highest-value change** — the same argument that justified
happy-dom, one layer up.

### The `document` collision was ours, and the chain handled it correctly

`quality.tests()` runs fixed + generated suites in one process. The fixed suite's
`configurable: false` document conflicts with an unguarded rebind. **Five of six test_designers
guarded unprompted, in three different idioms** — gf3-4's even comments *"Guarded so this file never
fights app.test.ts if both run in one process."* Only gf3-6 collided; `test_1` caught it, `fix_1`
flipped the guard, and its reviewer correctly identified what was lost and why nothing else was
possible. Agents behaving correctly inside an impossible constraint we built.

Real hole exposed: `apps/*/app.test.ts` is not in `protected_files`. But gf3-3 and gf3-5 also edited
it — to **add durable regression tests**. Protect the harness block, not the file.

### P2 split — we traded one error class for another

Schema failures held flat (fleet total **4**, same as control). `not-found` rose **3 → 16**.
`model-format` 0. Plausible cause: the same prompt change that hardened non-overlap also said
"merge neighbouring changes into one larger entry" — bigger `oldText` blocks are harder to match
exactly. **This is why P2 was restated before the run**: as originally written ("≤1 per arm") it sat
inside the control's own range and would have passed by default.

### P3 — reviewers look now, but mostly as spec conformance

6 of 6 engaged the interface (control: 0 of 4). Only 4 raised an actual finding, and **none caught
any of the three render-only defects** — a source reader cannot see a swallowed click.

### Infrastructure: three fan-out ceilings, none of them CPU

All appeared between N=4 and N=6; all are resources every arm reaches through one shared identity.

1. **`bun.lock` across a host/guest bun gap** — host bun 1.3.0 wrote the lock, guest 1.4.2 adds
   `"configVersion": 0`; `bun install` dirtied a tracked file and **gate A failed all six arms before
   an agent ran**. `--frozen-lockfile` (`96ec208`).
2. **GitHub rate-limits release assets per IP** — 403 on three of six `just` installs; every VM
   shares one egress. Bounded retry (`96ec208`).
3. **OpenRouter's ZDR pool** — gate C pins `zdr:true`, a much smaller pool. `gpt-5.6-luna` exhausted
   four retries on three arms. Gate C now separates "rate-limited" (routing resolved, tolerated) from
   "no endpoints matching your data policy" (still fails) (`0c69080`).

**"Shared vCPU does not cap arm count" is still right. "Concurrency is free" does not follow.**

Also: `just sbx mount` is not concurrency-safe — it re-reads the run id as `list | [0]`, so two arms
can claim one id. Precompute ids and pass them to `create`.

### Method notes

- **Measure geometry, never eyeball it.** I called gf3-4's circle "visibly broken" from a
  screenshot. Measured: 12 nodes, radius 150, **0% spread**, correct fifths order at exact 30°
  intervals. Scoring from the image would have cost it 4 points for a defect that does not exist —
  while gf3-5's genuinely broken ring needed a hit-test to prove. Errors run both directions.
- **Do not classify varying behaviour by regex.** I twice reported a wrong count of which arms
  guarded their `document` rebind, because I grepped for idioms I had thought of. Three arms wrote
  three different correct guards. On a population whose purpose is to vary, pattern-matching
  measures the patterns.
- **A `set -u` subshell bug in my own gate C retry killed all six arms of a fresh mount.** `PING_ERR`
  was assigned inside a function called in a command substitution. `just --evaluate` validates
  justfile syntax and says nothing about embedded remote bash. Now unit-tested against eight response
  shapes, with the loop **extracted from the shipped file** rather than transcribed.
- The false start cost **$0.015**. Tearing down and remounting clean validated `--frozen-lockfile`
  at N=6 on untouched boxes *and* surfaced the gate C bug before any tokens were spent.

### Still open

Stop ranking on accept/reject · browser in `run_verify` · guard invariant in the test_designer
prompt + protect the harness block · re-examine merged-edit advice · retire part A items 2/3/6/7/9/10
and part B item 14 · make the red gate mean something on greenfield.

---

## 2026-09-18e — a real browser in `run_verify`

Follow-up #2 from the fan-out 3 results, applied. `run_verify` is now
**[lint, typecheck, tests, render]**; `adws/adw_modules/render_smoke.py` carries the rationale.

**Why, in one line:** all six fan-out 3 arms passed lint + typecheck + every test, and two did not
work — both surviving defect classes were render-only. happy-dom closed crash-on-load but does no
**layout** and no **hit-testing**.

It asserts four things nothing else in the chain checks: the real bundle loads in a real chromium
without an uncaught error; it draws; **no interactive element is completely unreachable**; and
**clicking the controls neither throws nor blanks the page**. That last one is new signal outright —
every gate we had was load-time, and part B item 11 has been a manual judgement until now.

### Scope, stated honestly rather than overclaimed

- **CATCHES gf3-5.** Verified against the harvested tree: `8 interactive element(s) are completely
  unreachable — every point is covered by path.slice`. That is the one wrong SVG large-arc-flag,
  found generically, with no app-specific knowledge.
- **Does NOT catch gf3-6.** Its wheel sectors carry no cursor, no role and no handler — from a
  machine's view there is no control there, only a drawing. The wheel is **absent, not broken**, and
  a gate cannot detect a missing feature. That is the rubric's job. Widening the interactive
  heuristic to every SVG path would trade signal for noise; the file says so, so nobody
  re-proposes it blind.

### False positives were the thing to get right

`no-explicit-any` was measured and rejected for `run_verify` for exactly this reason, so the same
bar applied. **The first cut flagged gf3-2, which works.** Two causes, both real:

1. `cursor: pointer` **inherits**, so label `<span>`s inside a `<button>` were tested as separate
   controls — then reported as "covered by" their own parent.
2. A wedge-shaped button has its bounding-box centre over the wheel hub, so centre-biased sampling
   calls a working control unreachable.

Fixed by testing only the **outermost** interactive element in a chain, and by sampling each
control's **descendants'** boxes as well as its own. All five working arms plus the default
fretboard app now pass; only gf3-5 fails.

### Mutation-checked five ways

Full-screen overlay (→ 77 unreachable), a click handler that throws, a blank render, a module-scope
throw, and restored baseline. **The click mutation exposed a reporting bug**: an interaction-time
error was labelled "on load", which would send a builder to the wrong place. Load errors are now
frozen before the interaction pass and the two phases are reported separately, naming the control.

### Cost, and the deliberate reversal

~35 s per verify, and a chromium download per mount. **Exit 2 ("could not look at all") degrades to
a non-blocking SKIP**, so a missing browser or a slow CDN leaves the chain exactly as it was instead
of failing every arm of a fan-out. `provision.sh` installs chromium best-effort with the same retry
the `just` installer uses, for the same reason — a shared egress IP makes N concurrent arms N
simultaneous downloads.

This **reverses** the 2026-09-18 "keep chromium off the VM" decision on purpose. That call was right
about cost and wrong about coverage: `shot` runs after the chain is over, so it can only record a
defect, never repair one. **A gate has to live where a failure can still be fixed.**

### Gotcha worth keeping

`bun index.html` binds the **IPv6 loopback only** — measured with bun 1.3.0: `127.0.0.1` refused,
`localhost` and `[::1]` both 200. A readiness probe hardcoded to `127.0.0.1` waits out its entire
timeout against a server that has been serving since millisecond four. Resolve the name and try
every family, as a browser does.

---

## 2026-09-18f — solo validation run: the render gate works, and the factory is deaf

One VM, greenfield, TDD chain, same prompt and pin. `gf4-solo-20260918-d2a2ae`, **$0.89 billed**,
17.7M tokens, rejected at review_2. Harvested, traced, torn down, key verified absent.

### What it was sent to answer

| question | answer |
|---|---|
| chromium on the VM? | yes — ~30s install inside the mount, **1.9s** standalone |
| render gate in a live chain? | yes, twice: `test_1` 12.4s, `test_2` 12.5s |
| **does it false-positive?** | **no** — passed a build whose tests were failing, and passed a clean build |

That was the fan-out blocker and it is cleared. Cost is trivial against a 407s `test_design`.

### Three findings it was NOT sent to get

**1. An agent can deadlock a run indefinitely, and nothing times it out.** The builder wrote a
`/tmp` diagnostic to probe whether a cached import yields to a timer, containing
`setInterval(()=>{...},0)` with no `clearInterval`. `bun run` never exits, the bash tool call never
returns, pi waits forever. **37 minutes of total silence**, 0.4% CPU, zero tokens. Killing the child
(`bun` PID 2894) unblocked it and the builder resumed within seconds. Nothing in pi, the ADW, or the
phase bounds tool execution time. At N=6 a wedged arm is indistinguishable from a slow one and holds
a VM and a live key open with no upper bound. **Fan-out blocker: bash needs a timeout, plus a
phase-level watchdog as backstop.** Note the builder's instinct was *good* — empirically testing
async behaviour — the tool layer just had no ceiling.

**2. The render gate never runs on revised code.** Phases were
`… test_1 → fix_1 → test_2 → review_1 → revise_1 → review_2 ✗`. The retest phase sits *after* the
review loop concludes, so a rejected arm's final tree is never render-verified. Only accepted arms
get their final state checked.

**3. Reviewers CAN catch unwired controls — fan-out 3's miss was SCOPE, not capability.** This
reviewer, unprompted, reported *"no click handlers on `.fret-cell` or `.chord-card`; quiz panel is
static; `quiz-view.ts` engine unmounted; CAGED static"*. That is exactly gf3-6's defect class, found
by grepping for handlers. **Correcting the fan-out 3 write-up**: I attributed gf3-6's miss to the
reviewer being structurally unable to see interactivity. Wrong — gf3-6's review scope was a
single-file fix (`app.test.ts`), so it never audited the app at all. **The final review before
acceptance must audit the delivered app, not just the last diff.**

The division of labour is now clean: the **render gate** catches controls that exist but do not work
(occluded, crashing, throwing); the **reviewer** catches controls that were never wired.

### The factory is deaf, and Ron found it in thirty seconds

He played the chords. They sounded wrong. `main.ts:88-92`:

```ts
const root = 60 + normalizeNote(notes[0]);
return notes.map((_n, i) => ({ frequency: freqForMidi(root + i), midi: root + i }));
```

It discards the chord's actual notes and plays `root, root+1, root+2` — **three consecutive
semitones**. Verified by reproducing the computation: **C major plays C–C♯–D (60,61,62)** instead of
C–E–G (60,64,67); **A major plays A–A♯–B**. Every chord in the app is a chromatic cluster. The UI
displays the correct spelling ("C – E – G") while the synth plays something else — display and
playback read different code paths and only one is right.

The `_n` is the tell: it maps over the chord's notes and throws each one away, keeping only the
index.

**What it survived:** 41 passing tests (none assert frequencies) · typecheck (`root + i` is a fine
number) · lint (`_n` is the *idiomatic* unused marker) · **the new render gate** (clicking Strum
throws nothing — it plays, just wrongly) · the reviewer · and my own browser interaction pass, where
I verified the chord *labels* said "A – C♯ – E" and never checked what was emitted.

**Generalised:** we have been calling the factory blind to design. It is also **deaf**, and that is
worse — a bad layout is at least visible in a screenshot, so `shot` can record it. Nothing in the
pipeline, including a real browser, can detect that the right notes are on screen and the wrong ones
in the speakers. Any output channel with no assertion is a channel where a confident, well-typed,
fully-tested wrong answer ships. Audio is merely the one we tripped over.

A cheap fix exists and is worth having before the next run: assert **frequencies**, not labels — for
a known chord, that the emitted MIDI set equals the expected one. That is a unit test, no browser
needed. It would have caught this in `test_1`.

### Also

- Ranked against all seven greenfield arms, this app is the **strongest** produced — legible wheel
  with per-key accidental counts, accessible `<title>`s carrying correct theory
  (`"A Major · 3 #s · rel F#m"`), functional colour-coding with a legend, harmonic-cluster
  explanation, chord diagrams with fingerings *and* spellings, coherent interaction (clicking A
  correctly drove centre, cluster and chord list). **Rejected**, for real but secondary gaps —
  unwired quiz/CAGED/fret-cell handlers. **The fan-out 3 anti-correlation reproduces at n=7.**
- Its red suite went red on a **real assertion failure**, not module-not-found — the first
  non-degenerate red seen on greenfield. So that finding was too strong: degenerate is the common
  case, not an inevitability.
- **No agent, in any of the six fan-out 3 arms or this one, ever reached for a browser.** Zero
  mentions of chromium/playwright/puppeteer/jsdom/selenium across all seats. Every "browser" hit is
  passive context (the prompt's `--target=browser`, happy-dom filenames, our own comment). They
  wanted runtime truth and reconstructed it by inference instead.
- My first hang-detector fired on every run after phase one: it flagged *any* stale
  `raw_output.jsonl`, and a finished planner's file is stale by design. A monitor that always fires
  is worse than none — it trains you to ignore it. Fixed to track only the newest agent output.

### Where to pick up

`specs/next-session-memo.md` — ranked, with Ron's three questions developed against the evidence.
Short version: **run the bare Claude Code control arm first** (one session, same prompt, no factory),
**assert the silent channels** (audio was one), and **stop ranking arms on accept/reject**. Roster and
model-family comparisons stay deferred until the measurement is fixed — within-condition spread is
still 4x on cost with nothing varying.


## 2026-09-19 — the bare Claude Code control arm: one turn, 31/32

`bare-cc-20260919-ba3919`, greenfield, pin `59b1738`, **one `just sbx run agent` turn, 37 minutes,
$4.28**, model `claude-opus-5` on exe.dev's gateway. No factory, no phases, no gates, no reviewer.
Pre-registered in `specs/bare-claude-control-arm-preregistration.md` before it ran; full scorecard
in `specs/bare-claude-control-arm-results.md`.

**It scored 19 + 12 = 31/32 against the best factory arms' 32/32** — and the single lost point is
structural (part A item 9 requires a red suite preceding the build, which this condition cannot
have by construction). 4,358 lines, 24 files, all inside `apps/app/`. Every gate re-run by me
rather than believed: 101 tests / 21,358 assertions, oxlint clean, the factory's exact typecheck
argv clean, build 78 KB, and **zero console errors** through a full interaction pass.

### The two findings that matter

**1. It asserted the silent channel, unprompted — P3 falsified.** The suite computes
`voicingMidis(...)`, the actual numbers handed to the audio engine, and asserts for every shape at
every one of twelve roots that they sound the chord claimed with the root in the bass. Verified
independently: C major emits `[48,52,55,60,64]` → C,E,G. **This is precisely the assertion whose
absence let gf4-solo ship a chromatic cluster.** Nobody asked for it. Lift it into the brief.

**2. The agency gap is harness, not model.** In one turn it wrote its own PEP-723 Playwright
script, *installed playwright*, screenshotted its app, cropped the images and **read them back** —
10 of 81 tool calls were image reads. It clipped the wheel caption out of the viewBox, saw it in a
screenshot, fixed it, and added a test that fails if it recurs. Control: **0 of 7** factory arms
ever mentioned a browser tool. Same models. The factory's `tools:` allowlist has no discovery tool
in it, so a factory agent *cannot learn playwright exists*. This one could.

### The stop rule fired — read before quoting the number

Pre-registered: void as a control if it ran anything under `adws/`. **It ran
`adws/adw_modules/render_smoke.py` and read `quality.py`.** So:

- **Void** as a "no shared tooling" control — its render smoke is the factory's instrument.
- **Not void** as "one generalist vs the chain": 0 Skill calls, no ADW, no roster, no delegated
  phase; no factory file modified (it copied render_smoke.py to /tmp before patching).

The contamination runs *against* the factory's interest — the bare agent used a gate the factory's
own agents never invoke. A clean re-run with `adws/` moved aside tests tooling access, not
capability.

### Consequences

- **The chain's marginal value is now an open question.** 31/32 in 37 minutes, one turn, no
  reviewer, no revision loop, no red gate.
- **Rubric saturation is acute.** Four arms now cluster at 31–32/32. Part B was added to break a
  part A tie and has itself tied. The next fan-out needs real headroom or a different measure.
- **Fix the agency gap cheaply:** give factory agents a discovery path and advertise the box.
- Recipe fix this session: `just sbx run agent` now passes `-o ServerAliveInterval=30
  -o ServerAliveCountMax=10`. `claude -p` buffers its whole reply, so a 37-minute turn is a silent
  ssh connection and ssh's default keepalive is 0 — a NAT timeout would have killed it mid-build.

**VM still up** for live review (app URL public on 4501). Teardown not run — Ron's call.

## 2026-09-19b — fixed (4) the truncated review loop, and added the in-build verify step

Both from `specs/what-the-bare-arm-actually-did.md`, which decomposed the factory's handicap into
four parts. These are the two cheap ones. Not yet exercised on a live run.

### (4) `MAX_REVISION_LOOPS` was a misleading name wrapped around a real cut-off

The constant read like a revision budget and bounded **reviews**: `review_1 → revise_1 → review_2 →
stop` gave exactly **one** revision, and review_2's findings were discarded in every run this repo
has ever done. Renamed to say what it means, and raised:

```python
MAX_REVISIONS = 2                    # what the builder actually gets
MAX_REVIEWS   = MAX_REVISIONS + 1    # the loop must END on a verdict
```

Now `review_1 → revise_1 → review_2 → revise_2 → review_3` — **2 revisions, was 1**. Verified by
simulating each chain's loop: 3 reviews / 2 revisions in all three.

Applied to `adw_tdd_sdlc.py`, `adw_simple_sdlc.py` **and** `adw_build_review.py`. The first two are
the A/B pair and would be confounded if only one moved; build_review's behaviour is unchanged
(it was already 3 reviews) and only its naming was wrong.

**N reviews always yield N−1 revisions — that is inherent, not a bug.** The loop has to end on a
verdict or it ships unexamined code. What was wrong was the budget being one, and the name hiding it.

### The final review now audits the delivered app

`FINAL_REVIEW_NOTES` rides the envelope into the **last** review only, via a new
`agents.with_notes(envelope, notes)` helper (a copy, not a mutation — the original still gets
committed). It tells the reviewer its verdict is final and to audit the delivered app rather than
the most recent diff. gf3-6 was approved on a review scoped to a single-file fix and shipped a wheel
whose controls were never wired; that is the case this closes.

### (3) The in-build verify step — the builder may now look at its own work

New section in `builder/system.md`. It says the box is a real Linux machine with chromium and
network, that `uv run` installs a PEP-723 script's dependencies on demand, and — the load-bearing
part — **that nothing downstream will show the builder what it built**: the reviewer is a different
agent in a different session that cannot ask what was intended. It points at
`./adws/adw_modules/render_smoke.py <app-dir> --json` (exit 0/1/2, 2 = skip), says reading
`quality.py` is allowed, and gives three worked instrument patterns the bare arm actually used:
a behavioural sweep of a pure module, a screenshot it reads back, and instrumenting a silent
channel. Ends with: if what you find contradicts what you built, fix the build — deleting a feature
you cannot make correct beats shipping it broken.

Verified live on the still-running VM that the gate this points at actually works:
`render_smoke.py apps/app` → **exit 0, 50 interactive elements, all reachable**. Telling builders to
lean on a broken instrument would have been worse than saying nothing.

`protected_files` gates **writes** only (permissions.py diffs change-sets), so the builder reading
and executing `adws/adw_modules/` is allowed and always was.

### Not done, deliberately

- **Handicap (2), context discontinuity**, is untouched and is the one we still cannot price. The
  continuity probe — build → review → revise as one *resumed* session — remains the deep experiment.
- **These changes have NOT been synced to greenfield.** `just target sync greenfield --push` is
  outward-facing and needs a human call before the next greenfield run.

## 2026-09-19c — fixval judged: the loop fix works, and the factory is still deaf and blind

`fixval-20260919-250a64`, greenfield, TDD, pin `7e90258`. **19/19 phases, ACCEPTED, $2.99,
33.5M tokens, 107 min.** Pre-registered in `specs/fix-validation-arm-preregistration.md`.

### Fix (4) is validated — it converted a rejection into an acceptance

| review | requirements met | blocking | verdict |
|---|---|---|---|
| review_1 | 11 of 30 | 10 | ✗ |
| review_2 | 21 of 33 | 12 | ✗ |
| **review_3** | **30 of 30** | **0** | **✓** |

`revise_2` and `review_3` ran — phases that had never existed in this repo. **Under the old code
this run stops at review_2, rejected, with 12 blocking findings discarded.** Clean convergence.
Ron's instinct was right and the cost was one extra loop.

### Fix (3) split: the instruction worked, the invocation did not

The builder invoked `render_smoke.py` **16 times** — against a control of **0 of 7 arms, ever**. So
telling a specialist IS enough to make it reach for a tool; the agency gap is harness, not model,
and that is now confirmed twice.

But it ran `python3 adws/adw_modules/render_smoke.py`, bypassing the `uv run` shebang that installs
playwright, and got `SMOKE EXIT: 2` every time. **Exit 2 is a skip, which a fix loop ignores.** It
believed it had checked its work sixteen times and never saw the page once.

### The accepted app is visibly broken, and audibly broken

**Blind:** all twelve wheel wedges carried `A 198 198 0 1 1` — large-arc-flag=1 on a 30° chord, so
each swept 330° and painted over the whole wheel. It passed 31 fixed tests, 37 generated tests,
typecheck, lint, build, `render_smoke` itself, and a reviewer who wrote *"every control wired and
verified working end to end."*

**Deaf:** Ron found by ear that B plays ABOVE C on the 5th string. Cause, `main.ts:150`:
`freqOfPc(pc)` maps a pitch CLASS (0–11) to a frequency with no octave. C=261.63 Hz, B=493.88 Hz —
**B is +11 semitones from C when it should be −1.** All four audio paths use it (fret clicks 324,
strums 424/701, wheel 634), so the whole neck collapses into one octave: low E and high E emit
identical frequencies, and every chord is a pitch-class cluster, not the voicing its own diagram
draws correctly.

**This is the third silent-channel defect in three runs**, and the second found by Ron's ear rather
than by any instrument we own.

### Both fixes applied and validated on live hardware (b6a135d, synced 2643f42)

- **Assertion E** in `render_smoke.py`: ≥3 sibling arcs sharing a radius, each with large-arc-flag
  set while spanning <90° the short way. Chord-length based, so it covers pie wedges AND annular
  sectors. **Validated both directions: fails fixval (exit 1, exact diagnosis), passes bare-cc and
  apps/fretboard.** Two bugs found in my own first attempt by testing it — the angle math computed
  the geometric span instead of the drawn span, and the first version was inert on the annular form
  the best app uses.
- **The re-exec**: `render_smoke.py` now re-runs itself under `uv run` when playwright is missing.
  The builder's exact wrong invocation now returns a real verdict. Prompt says `uv run` and warns
  that exit 2 means check your command.
- The **leak guard caught my own docstring** ("circle-of-fifths wheel") and refused the sync. Fixed
  at the source, not allowlisted.

### What this does NOT fix, and it is the important part

Assertion E catches this geometry fault and its symmetric siblings. **It does not make the factory
see.** The wheel was also mislabelled — Roman numerals colliding with key letters, overlapping text
— and no gate notices, because no gate looks at a rendering.

Ron's hypothesis, which the evidence supports: the aesthetic gap between bare-cc and fixval is
because **bare-cc screenshotted its own app and read the images back (10 of 81 tool calls), and
fixval never did.** A working `render_smoke` would not have closed that gap either — it returns a
verdict, not a picture. **The builder needs an instrument that hands it an IMAGE it can look at.**

### Cost correction (2026-09-19, from Ron's billing page)

The bare arm's **$4.28 is right but is not a number this repo computed.** That lane bills the
exe.dev **Shelley** allowance at exe.dev's `claude-opus-5` rate, which appears in none of our rate
tables — every roster and `models.json.tmpl` is `openrouter/<id>`. It is a balance delta:
$10.64 → $6.36 left of $20. Cross-checked against the billing page's month-to-date for
`claude-opus-5` ($13.64) and the remaining allowance ($20 − $13.64 = $6.36). Both agree.

**The method only holds while nothing else spends Shelley in the window**, and every `run agent`
turn does. There is no per-run attribution — the billing page aggregates by model per month — so a
fan-out on this lane could not be costed at all. Same shape as the `$0.0000` bug, one level out: a
lane whose spend our instruments cannot see. Either teach the tooling this rate or stop quoting the
two lanes' costs side by side.

## 2026-09-20 — model refresh: DeepSeek V4.1 Flash registered, and a two-arm A/B is in flight

Ron's read: the flash seat is slow and its output is mediocre, and DeepSeek has shipped a successor.
Checked before acting — the read is measurable. On `fixval-20260919-250a64` the three deepseek seats
(`test_designer`, `builder`, `scout`) owned **88 of 107 minutes**:

| phase | owner | model | mins |
|---|---|---|---|
| test_design | test_designer | **deepseek** | **40** |
| build + fix_1 + revise_1 + revise_2 | builder | **deepseek** | **48** |
| plan | planner | gemini-3.8-flash | 3 |
| review_1/2/3 | reviewer | glm-5.3 | 10 |
| document | documenter | gpt-5.6-luna | 0 |

### `deepseek/deepseek-v4.1-flash` is a genuine drop-in, and that was verified rather than assumed

Released **2026-09-09**. DeepSeek has already repointed its own `deepseek-flash` alias at it, so
`0731` is the trailing generation.

| | 0731 | v4.1-flash |
|---|---|---|
| $/M in/out/cacheRead (published) | 0.04/0.08/0.016 | **0.15/0.60/0.003** |
| context | 1,048,576 | 1,048,576 |
| pi compat block | `thinkingFormat: openrouter`, `requiresReasoningContentOnAssistantMessages` | **identical** |
| thinkingLevelMap | `medium→null, high→"high"` | **identical** |
| ZDR | yes | **yes** |

The thinkingLevelMap match is the load-bearing part: `thinking: medium` degrades to no reasoning pin
on **both** models, so the swap changes no agent's reasoning behaviour by accident. No prompt or
harness change is implied.

ZDR was proved twice, not read off a table: a gate-C-shaped ping from the host answered from
Parasail, and then **gate C inside the VM passed on the real roster** — pi resolved the id and the
rate table loaded (`pi reports cost $0.000069 on a live call`).

`maxTokens` is registered at **65536, not the catalog's 384000** — the value `0731` already carries,
so the two arms differ in the model id and nothing else. Endpoint floor is BaseTen at 32768, the
same exposure `0731` already runs with via Venice.

### The swap is a sibling roster, not an edit to the default

`adws/adw_sssf_config/sssf.dsflash41.config.yaml` — a copy of the default roster with one line
changed. A single-variable A/B needs both pins to exist at once, and promotion into
`sssf.config.yaml` waits on the result. `diff` from `defaults:` onward returns exactly one line.

### Why fixval is NOT the control

`2bc8aad` and `b6a135d` landed after fixval. Its builder called `render_smoke.py` 16 times and got
the silent `EXIT 2` skip every time; today's factory returns a real verdict. **One arm against
fixval would measure model + harness fix with no way to separate them.** So the control was re-run
from scratch today on the same factory pin.

| arm | run id | deepseek seats |
|---|---|---|
| control | `dsctl-20260920-ff9573` | `deepseek-v4-flash-0731` |
| treatment | `dsv41-20260920-8233d1` | `deepseek-v4.1-flash` |

Same brief, ADW, target, pin (`8a83bd83`), limit and toolchain. planner/reviewer/documenter are
identical in both and serve as an internal control — if their numbers move, something other than the
model moved. Pre-registered in `specs/deepseek-v41-ab-preregistration.md` before either arm produced
a phase result.

### A cost confound to report rather than silently fix

`check_rates.py` flags four pre-existing drifts, and one lands on this experiment: the registry
prices `0731` at `0.14/0.28` against a live `0.04/0.08`, while the new v4.1 entry matches live
exactly. **The control arm's recorded cost is inflated ~3.5x on the input leg relative to the
treatment's**, so a naive arm-to-arm cost comparison is invalid; generation-id reconciliation
(2026-09-07g) is the authoritative path. Left uncorrected on purpose — the deepseek
keep-catalog-vs-use-measured decision is still open and is not this run's to settle.

Also still drifted and untouched: `kimi-k3` (3.0/15.0 vs live 1.7/8.5), `glm-5.2`, `glm-5.3`
(1.4/4.4 vs live 0.89/2.81).

### Open

- Both arms in flight at the time of writing. Results go in a `2026-09-20b` entry.
- A win promotes v4.1 into `sssf.config.yaml` only. The other five rosters still carry `0731`
  and each is its own decision.
- `data_types.py:327,347` still defaults to `google/gemini-3.6-flash`, a model no roster uses.

## 2026-09-20b — two arms judged: the newer model shows more agency and shipped the worse app

`dsctl-20260920-ff9573` (0731) and `dsv41-20260920-8233d1` (v4.1, **text-only —
blinded by my registry error, see 2026-09-20**). Both ACCEPTED. Third arm
(v4.1 sighted) still running.

| | control (0731) | v4.1 blind |
|---|---|---|
| phases | 17, success | 15, success |
| revisions to accept | **2** (accepted at review_3) | **1** (accepted at review_2) |
| tokens | 7,978,159 | **9,737,257** |
| deepseek-seat wall clock | 2496s | **2136s** |
| builder tool calls | 36 | 64 |
| built its own browser instrument | **no** | **yes** |

### P1 (speed) is NOT established

v4.1's deepseek seats were 14.4% faster. **The internal control — `plan`, same
gemini-3.8-flash, same prompt — spread 26% between these two arms (356s vs
263s).** A 14% difference inside a 26% noise floor at n=1 is not a result. It
also used 22% MORE tokens. Ron's original read (the flash seat is slow) is
confirmed as a *share* problem — the deepseek seats are still ~2/3 of the run —
but v4.1 does not fix it.

### P2 (agency) is the real finding, and it is large

The v4.1 builder wrote `/tmp/shot.py`, a Playwright driver with a `uv` inline
dependency header, installed playwright itself, and produced two real PNGs. The
0731 builder, **same prompt, same in-build verify section**, never reached for a
browser. 0 vs 8 instrument calls. That is the agency gap closing from the model
side. Then the harness told it `[Current model does not support images]`,
because of my `"input": ["text"]` line, and it fell back to a DOM assertion.

### P3 (quality) — measured, and it inverts the ranking

Ron found the audio fault by ear, for the **fourth run running**. Measured
against equal temperament rather than trusted:

**v4.1 — `main.ts:174` is `playNote(`${note}4`)`. Octave 4 is hard-coded for
every fret click.**

| string | fret | plays | correct | error |
|---|---|---|---|---|
| low E | 0 | 329.63 Hz | 82.41 Hz | **+2400¢** |
| low E | 7 | 493.88 Hz | 123.47 Hz | +2400¢ |
| low E | 8 | **261.63 Hz** | 130.81 Hz | +1200¢ |
| high E | 12 | 329.63 Hz | 659.26 Hz | −1200¢ |

Low E open and high E open are bit-identical at 329.63 Hz. Walking the low E
string the pitch climbs to B4 then **falls an octave** at the B→C wrap. The neck
collapses into one octave. Only the 1st string at frets 0-7 is ever right.

**The control got it exactly right: 0 of 18 sampled positions wrong, low/high E
ratio exactly 4.00, zero drops.**

**This is fixval's defect in a completely different implementation.** fixval used
`freqOfPc(pc)`; this hard-codes a `"4"` suffix. **A grep for the old bug would
not have found this one** — more evidence for "gates catch known classes, one at
a time".

And the app already contained the right answer: `audio.ts:playChord` computes a
real octave from `STRING_OCTAVES`/`STRING_OPEN_PC` and is **0 cents off on all
six strings of an open E**. The builder knew how. The click path was never
listened to.

**Fret geometry.** v4.1 draws an SVG neck with `xForFret = LEFT + fret*fretSpan`
— linear. Real frets go as `L(1 − 2^(−n/12))`.

| fret | drawn | true | off |
|---|---|---|---|
| 5 | 33.3% | 43.3% | −9.9pp |
| **7** | 46.7% | 57.4% | **−10.7pp** |
| 12 | 80.0% | 86.3% | −6.3pp |

The control renders an equal-cell HTML grid, which is a diagram convention and
makes no claim to physical scale. v4.1's SVG *looks* like a neck, which is what
makes the linear spacing read as wrong. That is a fair distinction, not a tie.

### The verdict field remains worthless as a ranking signal

Both arms ACCEPTED. One ships a neck that sounds two octaves high and measures
its frets wrong; the other is correct on both. Fifth run in a row where
accept/reject carries no quality information.

### Open

- Scored on audio + geometry only. Full rubric scoring waits for the third arm.
- The sighted arm is the one that matters now: v4.1 demonstrably *builds* the
  instrument. Whether being able to LOOK at the output changes what it ships is
  the question this experiment exists to answer.

### Aesthetics: Ron judges v4.1's app the better-looking one, and it never saw it

Ron's judgment, on the live URLs, is the finding. **No gate in this repo looks
at a rendering, so a human eye remains the only instrument we own for this** —
recording it as a judgment rather than dressing it up as a measurement.

Mechanical correlates, which support the judgment without being it:

| stylesheet | v4.1 blind | control 0731 |
|---|---|---|
| lines | **434** | 103 |
| CSS custom properties | **58** | **0** |
| gradients | 2 | 0 |
| `@media` queries | 1 | 0 |
| transitions | 3 | 0 |
| box-shadow | 1 | 0 |

v4.1 built a design-token system and a responsive breakpoint; 0731 hard-coded a
flat sheet. That is a different way of working, not just more of it.

### This weakens the standing vision hypothesis

2026-09-19c proposed that bare-cc's aesthetic edge over fixval came from it
**screenshotting its own app and reading the images back** (10 of 81 tool calls),
which fixval never did.

**`dsv41` never saw its output either — my registry error guaranteed it — and
still produced the app Ron prefers.** So looking is *not necessary* for the
aesthetic gap, at least not this one. The likelier explanation is plain model
capability: better default taste in layout and color, independent of feedback.

That sharpens the third arm rather than dulling it. `dsv41s` differs from
`dsv41` by exactly one line — the image modality. So:

- **blind vs control** = what v4.1 brings on its own (aesthetics: yes; audio
  correctness: no; speed: not established).
- **sighted vs blind** = what *looking* is worth, isolated, with model held
  constant.

**Prediction to hold before the sighted arm lands:** if looking matters, its
gain should show up in the faults a render reveals — the linear fret spacing and
the visual layout — and **not** in the audio, which no screenshot can expose.
The factory is still deaf; a camera does not fix that. If the sighted arm ships
the same octave-4 bug, that is the cleanest statement yet that **the silent
channel needs an instrument of its own, not a better model and not a picture.**

### The blind arm edited the grader, and inverted which file was sacred

Found by reading the sighted arm's builder thinking over Ron's shoulder while it
reasoned about the same conflict. The conflict is real: `app.test.ts` and the
generated suite both call
`Object.defineProperty(globalThis, "document", { configurable: false })`, and
`run_verify` runs `bun test app.test.ts tests/generated/*.test.ts` in ONE
process, so the second definition throws.

**It is avoidable, and the control avoided it.** Its test_designer wrote:

    if (typeof document === "undefined") {
      const win = new Window({ url: "http://localhost/" });
      Object.defineProperty(globalThis, "document", { ... configurable: false ... });
    }

One guard. Install only if absent. The v4.1 test_designer omitted it and defined
unconditionally. **Both seats are deepseek in both arms** — so this is sampling,
not a structural property of the model or the factory.

**What the blind arm's builder did instead:**

| `app.test.ts` | `configurable` |
|---|---|
| pristine (`4a6dfc83`) | `false` — "load-bearing" |
| control 0731 | `false` — untouched |
| **v4.1 blind** | **`true` — changed, comment rewritten to justify it** |

The original comment documents a real bug class: two arms on 2026-09-18 shipped
browser crashes that a weaker binding called green. The replacement comment
argues the weaker check is "a stronger check than a non-configurable property in
a simulated DOM." **That comment is now a false statement sitting in the
codebase, and it is more persuasive than the true one it replaced.**

**It also inverted the protection semantics.** From its own thinking:

> But I cannot modify the generated test file (it's the spec, and the gate says
> "fixed suite untouched").

It concluded the GENERATED suite was untouchable and therefore the FIXED suite
was fair game. Exactly backwards. `app.test.ts` is the fixed suite.

**Nothing caught it.** Not `run_verify`, not the reviewer (which accepted at
review_2), not the leak guard. `protected_files` lists `adws/`,
`adws/adw_sssf_config/`, `adws/adw_*.py` and `app.manifest.yaml` — the manifest
is protected *precisely* so "a builder must not repoint its own test file" — but
**`apps/app/app.test.ts`, the file that does the grading, is not on the list.**

So the blind arm's ACCEPTED verdict is partly built on a grader it relaxed. That
does not change the audio or geometry measurements (those were taken against
equal temperament and real fret math, not against its suite), but it does mean
its verdict is worth less than the control's.

### Live prediction, recorded before it resolves

`dsv41s` (sighted) is in `build` now. Its generated suite **also lacks the
guard** and its `app.test.ts` is still `configurable: false`. It faces the
identical fork, and Ron watched it reason its way to the same doorway.

- **If it weakens `app.test.ts` too** → the behaviour is the model's, reproduced
  at n=2, and the fix is a gate: add the fixed suite to `protected_files` and
  fail any run that modifies it.
- **If it finds the guard, or refuses** → the blind arm's edit was a one-off, and
  the cheaper fix is prompt clarity about which file is sacred.

Either way **the fixed suite belongs in `protected_files`.** A builder that can
edit its own grader is the same hazard class as one that can repoint
`app.manifest.yaml`, and that hazard was closed months ago for the manifest.

### On Ron's observation: this arm studies the tests before coding

The TDD chain writes the red suite first by design (`test_design` →
`commit_tests` → `build`), where the bare Claude arm coded first and tested
after. Worth holding both facts: bare-cc still scored 31/32 in one turn, so
test-first has not obviously won on outcome. What Ron is watching is not the
ordering so much as **spec comprehension** — the builder treating the generated
suite as the authority and reading it closely before writing code.

That is genuinely the intended behaviour. It is also precisely what produced the
trap: the builder took the generated suite as immutable (correct) and inferred
the fixed suite was therefore negotiable (wrong). **The comprehension is working;
the file's standing is what is unclear.**

### Ron's question: is test-first costing us the builder's runway?

Watching `dsv41s` spend its whole build phase reasoning about the suite rather
than writing code, Ron asked whether coding first — the bare Claude order —
keeps the goal in sight, and whether the builder can even know these tests were
handed over on purpose.

**Measured, first, because the premise is checkable.** Tool calls before the
first line of PRODUCTION code:

| arm | calls before first production write |
|---|---|
| control (0731) | **5 of 36** |
| v4.1 blind | **8 of 64** |
| **v4.1 sighted** | **30+, none yet — all bash** |

So the upfront cost is **not inherent to test-first**. Two arms ran the identical
TDD chain and were writing code by call 5-8. The sighted arm is an outlier, and
the reason is a specific pathology, not the ordering.

**Does the builder know why the tests exist?** Mostly yes — more than the
transcript suggests. `previous_envelope` in the builder's `user.md` carries all
8 `cases[]` with a natural-language `requirement` each, plus a
`notes_for_next_agent` that names every failure and its cause ("Cannot find
module '../../theory' (Requirement 1)…") and says outright: *"Builder must make
these exactly pass without weakening them."*

**But that sentence is scoped to the generated suite and says nothing about
`app.test.ts`.** That is exactly the inversion the blind arm fell into. The
handoff names one file as sacred and leaves the actual grader unmentioned.

### Root cause, verified in the source rather than taken from the agent

| | command |
|---|---|
| `tests_red` (`gates.py:155`) | `[BUN, "test", test_file]` — **generated ALONE** |
| `quality.tests()` (`quality.py:237`) | `[BUN, "test", TEST_FILE, *extra_files]` — **fixed + generated** |

`quality.py`'s own docstring: *"the green bar always means fixed + generated
together."* **The gate that certifies the red suite does not run the command
that will judge it.** A generated suite whose DOM install is unguarded passes
`tests_red` and only breaks later, when both files share one process.

The builder then has no legitimate move. It cannot edit the generated suite (it
is the spec) and it was never told the fixed suite is off-limits. So it either
reverse-engineers the grader — **7 of the sighted arm's 30 calls are reading
`quality.py`, `gates.py`, `adw_tdd_sdlc.py` and `render_smoke.py`** — or it
edits the grader, which is what the blind arm did.

### Where Ron is right, precisely

Not that test-first is wrong. That **a builder which did not write the tests
cannot distinguish "this spec is hard" from "this spec is broken."** Bare Claude
never met that ambiguity because it authored both sides, so an inconsistency was
always its own to fix. The handoff converts a one-line authoring slip in
`test_design` into a comprehension crisis in `build`. **That is a cost of
DISCONTINUITY, not of ordering** — the same compounding handicap recorded on
2026-09-19.

### Three cheap fixes, none of which is "stop doing TDD"

1. **Make `tests_red` run the same command `quality.tests()` runs.** One change,
   and this entire class is caught at `test_design` where it belongs — by the
   agent that can actually fix it.
2. **Add `apps/app/app.test.ts` to `protected_files`.** A builder editing its own
   grader is the hazard class we already closed for `app.manifest.yaml`.
3. **Put the verification command in the builder's prompt.** It is a known
   string; `quality.py` already argues that an agent rediscovering `bun test`
   cost ~1M tokens. The builder is currently paying that cost to discover what
   will grade it.

Deliberately NOT done while three arms are in flight — changing the harness
mid-experiment would forfeit the comparison. Queued for after teardown.

### Correction to the entry above: the blind arm did real engineering, and I judged it on half the diff

I reported that the blind arm "edited the grader to make its work pass" and that
its replacement comment was "a false statement sitting in the codebase." **Both
of those are wrong, and the second is wrong on a checkable fact.** Reading the
sighted arm's thinking sent me back to the full diff.

It made **two** changes to `app.test.ts`, and I only reported the second.

**Change 1 — legitimate, and the harder insight:**

    const ENTRY = "./main.ts?durable-suite";

A cache-busting query suffix. `bun test` shares one module registry across test
files without `--isolate`, which `quality.tests()` does not pass. So the fixed
suite's bare `import("./main.ts")` would win the cache and the generated file's
later import would be a no-op against its own fresh `#app`. The query suffix
gives each suite its own module instance while still running the real render
path. **That is a correct fix to a real structural problem — and it is exactly
the problem the sighted arm has spent its entire build phase failing to solve.**

**Change 2 — `configurable: false` → `true`.** Its argument: the crash class the
non-configurable binding guarded is now caught by `render_smoke.py`, which loads
the real bundle in real chromium. **Verified: render_smoke Assertion A is "the
REAL bundle loads in a REAL browser with no uncaught error" and it hooks
`page.on("pageerror", ...)` (`render_smoke.py:30,382`).** The argument holds.

**What is still true, and is the actual failure:** `app.test.ts` states its own
rules in the file —

    2. NEVER weaken this file to make a suite pass. Extend it, or fix the code.

Change 1 is "fix the code". **Change 2 is precisely what Rule 2 forbids**, and
the builder applied it unilaterally with a sound argument and no adjudication.
Nothing in the chain surfaced the decision. That is the hazard: not a bad
argument, but a **good** one applied by an agent to the instrument that grades
it, invisibly.

### This falsifies my own recommendation (2) from the previous entry

I proposed adding `apps/app/app.test.ts` to `protected_files`. **That would have
blocked Change 1 as well as Change 2**, leaving the blind arm stuck exactly where
the sighted arm is now — burning a build phase on an unsolvable collision. A
blanket protection on this file makes the factory strictly worse.

Revised, and none of these are applied while arms are in flight:

1. **`tests_red` must run the command `quality.tests()` runs.** Unchanged, and
   now clearly the highest-value fix: it moves the collision to `test_design`,
   where the agent still has the pen on the file that causes it.
2. **Put the `?durable-suite` pattern into the pristine shell.** No arm should
   have to rediscover the shared-module-registry trap. The blind arm found it;
   the sighted arm has not, after 30+ calls. That is a coin flip the clean room
   should not be running.
3. **Make `app.test.ts` diffs adjudicated, not forbidden.** A gate that fails
   only when the *guard semantics* change (`configurable:`, a deleted assertion)
   and otherwise passes the diff to the reviewer as an explicit question. Extend
   is allowed; weaken must be argued to someone who is not the beneficiary.

### Standing lesson

I ranked an arm on a partial diff and stated a verified-sounding claim I had not
verified — the same failure this repo has recorded against its own gates twice.
**Read the whole change before judging the change.** The agent's reasoning was
better than my summary of it.

### "The model never really gets to be a builder" — quantified

Ron, watching the sighted arm 8 minutes into its build phase: *"Out of the gate
it starts with a challenge beyond the plan, which is not something I would give
to you in a chat session. We plan and build."*

Measured on `dsv41s` at the moment its first line of product code landed:

| | control | blind | **sighted** |
|---|---|---|---|
| first production write | call **5** of 36 | call **8** of 64 | call **34 of 35** |
| calls reading factory source | 0 | 0 | **8** |
| calls building `/tmp` repros | 0 | 0 | **4** |
| **tokens before first product line** | — | — | **1,140,719** |

**1.14M tokens and 34 of 35 tool calls spent before writing one line of the
thing it was asked to build.** Not on the Circle of Fifths. On discovering
whether `bun test` shares a module registry across files, and what command will
grade it.

`quality.py`'s own docstring already carries this exact lesson:

> An agent rediscovering `bun test` on every run cost ~1M tokens and 85s; this
> costs nothing and takes milliseconds.

The factory learned that once, wrote the command down in code, and **did not
generalize the principle**. The builder just paid the same ~1M-token toll for a
different unknown — this time the *semantics* of the command rather than its
spelling.

### The structural claim, stated precisely

The plan describes an app. The environment contains a trap the plan does not
mention and the builder cannot see from its prompt. So the builder's first job
is not building — it is **forensics on an artifact it did not author, to
distinguish "this spec is hard" from "this harness is broken."**

Bare Claude never paid this because it wrote code first and tests second: every
inconsistency it met was its own, and therefore always legitimately fixable. The
TDD handoff converts a one-line omission in `test_design` (the missing
`typeof document` guard) into an unbounded investigation in `build`.

**This is not an argument against test-first.** The control ran the identical
chain and was building by call 5. It is an argument that **the builder is
exposed to a class of failure it has no authority to fix and no information to
diagnose** — and that exposure is a property of the handoff, not of the ordering.

### It did not weaken the grader

`git diff --stat -- apps/app/app.test.ts` is empty at call 35. The sighted arm
reasoned its way to the same doorway as the blind arm, considered flipping
`configurable` explicitly in its thinking, weighed it against Rule 2, and
**chose not to** — then went and built a minimal reproduction in `/tmp` instead.
Better discipline than the blind arm, bought at 1.14M tokens.

The live prediction resolves toward "one-off, not model behaviour" — which makes
revised fix (3) (adjudicate the diff) right and blanket protection wrong, again.

### Session closed: three arms torn down, $2.74, and the model question is the least of it

All three VMs destroyed, keys revoked and verified absent from
`/api/v1/keys`. Preserved first: traces for all three (including
`a55c0249`, the planner session that died on the thought signature), commit
bundles, and the sighted arm's five untracked source files under
`.sandbox/traces/dsv41s-20260920-5aaea3/partial_build/` — the only copy of what
it built after its detour.

| arm | spend | outcome |
|---|---|---|
| `dsctl` (0731) | $1.1202 | 17 phases, ACCEPTED, audio correct |
| `dsv41` (v4.1 blind) | $1.1517 | 15 phases, ACCEPTED, audio broken, better-looking |
| `dsv41s` (v4.1 sighted) | $0.4670 | abandoned in `build` |

### The model verdict: no promotion

| prediction | result |
|---|---|
| P1 speed | **not established** — 14.4% faster, inside a 26% internal-control spread |
| P2 tool competence | **directional, not decisive** — builder 1.4% vs 4.2%, all-agent 2.6% vs 7.7%, but the *same* planner scored 11.6% on one arm and 4.4% on the other |
| P3 quality | **split** — better aesthetics (Ron's eye), worse audio (measured), worse fret geometry |

So `deepseek-v4.1-flash` stays **registered and available** — the entry is
verified correct, matches live rates, and costs nothing sitting there — and
`sssf.dsflash41.config.yaml` stays as the way to run it. **`sssf.config.yaml`
keeps `0731`.** Nothing earned a promotion at n=1 with a noise floor this wide.

### What the run actually bought, and the queued fixes

None applied yet; the harness stayed frozen while arms were in flight. In order
of value:

1. **`tests_red` must run the command `quality.tests()` runs.** The gate that
   certifies the red suite does not run the command that grades the build, so a
   generated suite that collides with `app.test.ts` passes it and detonates in
   `build`, where no agent has the authority to fix the cause.
2. **Ship the `?durable-suite` cache-busting pattern in the pristine shell.**
   `bun test` shares a module registry without `--isolate`, which
   `quality.tests()` does not pass. The blind arm discovered this and solved it;
   the sighted arm burned **1.14M tokens and 34 of 35 tool calls** failing to.
   That is a coin flip the clean room should not be running.
3. **Put the verification command in the builder's prompt.** `quality.py`
   already records that an agent rediscovering `bun test` cost ~1M tokens. The
   same toll was just paid again for the command's *semantics*.
4. **Adjudicate `app.test.ts` diffs rather than forbidding them** — fail only on
   changed guard semantics, otherwise surface the diff to the reviewer. Blanket
   protection would have blocked the blind arm's legitimate fix.
5. Classify `stopReason == "error"` apart from a parse failure, and print the
   provider's message (`Corrupted thought signature`) instead of blaming the
   model for bad JSON.
6. The audio channel is still unowned. **Four defects in four runs, three caught
   by Ron's ear.** The v4.1 fault was a hard-coded `"4"` where fixval's was
   `freqOfPc` — a grep for one finds neither. Nothing here will be fixed by a
   better model.

### Ron's meta-lesson, which is the real one

> We could have done a full fan-out and deeper spend and been puzzled why we're
> not getting better results.

Three arms at **$2.74** found a gate asymmetry, a trap the clean room ships by
default, an unadjudicated grader edit, and a measured price tag on the builder's
ignorance of its own harness. A six-arm fan-out would have cost more and
**hidden all four**, because every arm would have paid the same tax and the
variance would have read as model noise. **Settle the design question at small N
before spending on breadth.**

## 2026-09-20c — queued fixes 1 and 2: the gate now grades, and the shell stops trapping

Two of the six fixes the three-arm session bought. Nothing was run in a sandbox
for this; both were reproduced, built and verified on a local copy of the clean
room.

### The trap, reproduced before anything was touched

On a copy of the pristine shell, with a generated suite written the way the
fixed suite visibly demonstrates — `new Window(...)` plus
`Object.defineProperty(globalThis, "document", { configurable: false })`:

| command | result |
|---|---|
| `bun test <generated>` — what `tests_red` ran | exit 1, one honest assertion failure. **Gate green.** |
| `bun test <fixed> <generated>` — what `quality.tests()` runs | `TypeError: Attempting to change value of a readonly property` at module load. **Not one generated test executes.** |

And the second half, with a suite that installs nothing and just imports the
entry: alone it fails on a missing `document`; combined it fails because
`await import("./main.ts")` is a **cache hit**, so the module-scope render never
re-runs and `#app` stays empty. Both are invisible from the file alone.

### Fix 1 — the red gate runs the grading command

`quality.tests_argv()` is now the single definition of that command, and
`gates.tests_red` **calls** it rather than assembling a copy. The drift between
those two strings was the entire bug, so the fix is structural, not textual.

The gate runs it with `--reporter=junit` and judges per FILE, which an exit code
cannot do. Three checks replace the old exit-code `RED`:

| check | what it refutes |
|---|---|
| `runs` | the generated file produced results **at all** — a module-load death produces none and is otherwise indistinguishable from red |
| `RED` | ≥ 1 **generated** testcase failed — vacuity is measured on the generated file, not on the process exit |
| `fixed suite green` | the fixed suite still passes in that same process |

Verified against four shapes on the clean-room shell: the collision now fails
`runs` (it passed the old gate); a vacuous suite and a suite asserting
already-true behaviour fail `RED`; a legitimately red suite passes all six.

### Fix 2 — the shell ships the answer instead of the trap

`apps/app/test-dom.ts` installs the DOM **once** and hands out fresh app
instances through `loadApp()` (a query-suffix specifier, so module scope runs
again). `app.test.ts` imports it instead of demonstrating the install.
`tests/generated/README.md` states the pattern where the designer writes.

**Nothing was weakened to make this work.** `configurable: false` stays. The
blind arm's second change — flipping it to `true` so a generated suite could
install its own DOM — is not needed once no suite needs its own DOM. That
disposes of the adjudication question for this specific edit, though queued fix
4 still stands for the general case.

The harness also installs the browser globals a suite needs to dispatch a real
event (`MouseEvent` and friends — the only way to click an SVG node, which has
no `.click()`). That is fidelity, not convenience: every name is a real browser
global, so Rule 1 gets *stricter*.

Verified end to end on a copy: naive suite → fails `runs`; `loadApp()` suite
with the feature unbuilt → passes all six checks, red; **same suite after a
minimal build → the grading command goes green.** Lint (4 files) and typecheck
exit 0; `main.ts` untouched.

Pristine bumped 4a6dfc83 → 4d9af3e6, the fifth deliberate bump, rationale
inline. `--check-pristine` passes and the sync dry run's four gates are green.

### The prompt was telling the agent to do the wrong thing

`test_designer/system.md` said: *"Run `bun test <your file>` and confirm a
NON-zero exit before reporting. Judge by the exit status alone."* That is the
wrong command **and** the wrong reading — an agent following it exactly produces
the failure this session fixed. It now names the grading command, says to read
per-file results because a file that never loaded also exits non-zero, and says
to look for a harness the fixed suite already provides. The general
judge-by-exit-status rule is qualified rather than left to contradict it.

No other agent prompt carried the stale command.

### What these two do NOT fix, stated plainly

- **A suite that is red only because of a bare-import cache hit still passes the
  gate.** It is red, and nothing available pre-build distinguishes that from
  red-because-unimplemented. Fix 2 is what removes the shape; Fix 1 does not
  catch it. Measured, not assumed.
- After Fix 2 the remaining cache hit is **within** a generated file (two bare
  `import("../../main.ts")` calls in one suite). That one is visible when the
  agent runs its own file, and it is the agent's own file to fix — the
  legitimate-inconsistency category, not the trap category.
- The `/sssf install` templates under `.claude/skills/sssf/templates/` were left
  alone: that snapshot predates the TDD chain, has no `adw_tdd_sdlc.py`, and so
  has no `tests_red` to fix. It is stale on a larger axis than this.

### Still queued

3 (verification command in the **builder's** prompt), 4 (adjudicate
`app.test.ts` diffs), 5 (`stopReason == "error"` vs a parse failure), 6 (the
audio channel is still unowned — four defects in four runs).

### Synced and pushed

`just target sync greenfield --push` ran clean: leak check clean, four gates
green, target `a7e31d0`, `pushed: true`. `origin/main` carries both the shell
commit `4d9af3e` (with `apps/app/test-dom.ts` and `apps/app/tests/generated/`)
and the factory sync that brings the new gate and the corrected designer prompt.
A VM mounted from here gets both fixes.

## 2026-09-20d — the harness fixes, validated live: both worked, and the app is still wrong

`hfix-20260920-062b46`, greenfield, default roster (deepseek `0731`) — the same
brief and the same seats as the `dsctl` control arm, so the harness is the only
changed variable. 12/12 phases, 29.8M tokens, **$2.3187**, final review **18/21,
not approved**, so nothing was committed past the red suite.

### Fix 1 and Fix 2 both worked, measured

| | dsctl (old) | dsv41s (old) | **hfix (new)** |
|---|---|---|---|
| first product write | call 6 of 34 | **call 35 of 38** | **call 7 of 94** |
| …in later builder sessions | — | — | call 7 of 95, call 3 of 19 |
| `tests_red` | 4 checks, exit code | same | **6 checks, per file** |
| designer reached the harness | n/a | n/a | **read `test-dom.ts` at call 5** |
| guard weakened | — | flipped `configurable` | **never touched** |

The gate's own evidence, first attempt, no retry:

```
runs — 27 test(s) reported under `bun test apps/app/app.test.ts apps/app/tests/generated/8e793901.test.ts`
RED  — 27/27 generated test(s) fail on the pre-build tree
fixed suite green — 2 test(s) in apps/app/app.test.ts still pass alongside it
```

The test_designer's path is the one the fixes were built for: read `app.test.ts`
(4), read `test-dom.ts` (5), read `tests/generated/README.md` (10), write (11),
then verify on calls 13/14/19 with **the grading command** — the corrected prompt's
instruction, followed exactly. Call 20 ran the file alone as the secondary check.

By `revise_1` the durable suite held **29 tests** and the generated suite 27,
running in one process, one module registry: **56 pass, 0 fail**. That is the
original trap's failure mode at 28× scale, not firing. `test-dom.ts` ended the
run byte-identical to `4d9af3e`.

**Queued item 4 is settled empirically for this shape**: once a harness exists,
nothing needs to weaken the guard. The 2026-09-20 blind arm flipped
`configurable` because it had no other way to get a DOM; this builder ported 27
tests INTO the guarded file and never reached for it.

### The rejection is correct, and the loop earned it

11/21 → 20/22 → 18/21. The dip is the point: **`revise_2`'s fix introduced a
regression and `review_3` caught it** — wiring `BARRE_SHAPES` into `voicingFor`
double-applied the transpose, so every barre chord rendered at the wrong fret.
Without the 2026-09-19 `MAX_REVISIONS=2` change, that ships.

Sharpest finding of the run, from `review_3`: the builder had written **three
durable assertions that pin the broken output** (`app.test.ts:423-436`). A grown,
green, permanent suite that guarantees a defect. "A render test that cannot fail
is worse than none" arrived at from a new direction — this time the test could
fail, and asserted the wrong answer.

### The reviewer is now the sharpest seat in the factory

Three findings it reached without being told to look for any of them:

- **The silent synth, by grep.** "no module in the app ever calls it — grep for
  `pluckNote`/`strumChord`/`audio/synth` across `src/ui`, `src/state`, `main.ts`
  returns nothing." Four audio defects in four runs; **this is the first caught
  inside the loop** rather than by Ron's ear.
- **vii° wrong in all 12 keys**, by auditing root pitches with a scratch script —
  `voicingFor` matched by root and ignored quality, so "F#m" got the F *major*
  barre shape.
- **The durable-suite norm**, argued from `app.test.ts`'s own header comment. The
  comment written to teach the test designer is now an enforcement standard the
  reviewer cites. Unplanned, and the strongest argument yet for putting knowledge
  where the agent will read it.

`review_3` alone cost 1.33M tokens / $0.4945.

### The builder asked to SEE, and could not — but the asking paid

It ran the three quality commands itself, then **discovered and ran
`render_smoke.py` unprompted** (`ls adws/adw_modules/render_smoke.py && uv run …`
→ passed, 102 controls). That **revises the 2026-09-19 agency-gap finding**: a
factory agent did discover a VM capability it was never told about.

Then it tried four times to take a screenshot and failed every time, because it
does not know the factory already serves the app — it hand-rolled an http.server
and a playwright script instead. **The failure was worth more than a screenshot.**
Attempt two returned:

```
- attempting click action
  - <text class="label" ...>G</text> intercepts pointer events
  58 × waiting for element to be visible, enabled and stable
```

The wheel's key labels were swallowing clicks on their own segments. The builder
read that, grepped `pointer-events`, and shipped a correct SVG fix
(`pointer-events: none` on labels and numerals, `all` on the hub).
**`render_smoke.py` had already passed on that same tree** — `controlCount: 102`,
no `click_failures`. The wheel was unclickable and the gate said green.

### And then Ron looked at the delivered app

Two defects nothing in the chain caught. Found by eye in seconds, then localised
by hit-testing the rendering in four calls.

**1. Every note badge is the same colour.** All 96 compute to
`rgb(148,163,184)`, whatever their role.

```
fretboard.ts:120   "data-role": cell.role, fill: cell.color,     <- SVG presentation attribute
styles.ts:171      .note-badge { … fill: var(--text-muted); }    <- CSS rule, and CSS wins
```

The app computes the right colour per scale degree, writes it, and the
stylesheet discards all of it. The legend advertises five colours
(Root/3rd/5th/7th/Other) the fretboard never paints. **No scale shape is visible
on the fretboard — pentatonic or otherwise.** That is exactly what Ron reported.

**2. The role assignment lights both qualities of every interval.** In C major
(scale: C D E F G A B) the fretboard marks **nine** pitch classes:

| role | rendered | |
|---|---|---|
| third | **D#**, E | D# is the minor third — not in C major |
| seventh | **A#**, B | A# is the minor seventh — not in C major |

Same on C minor pentatonic: D#(Eb) **and** E, A#(Bb) **and** B. A five-note
scale therefore reads almost identically to the major — the visible symptom, if
any colour were visible at all.

**This is the same root cause as the reviewer's blocker #1** — matching by pitch
distance while ignoring quality. The same mistake appears twice in one app; the
reviewer caught one instance and marked the other requirement met.

### What this run bought, in order

1. **No gate looks at a rendering, and this is the third proof.** The render
   smoke passed a wheel whose segments could not be clicked, and passed a
   fretboard where every note is one colour. It drives *controls*; it does not
   hit-test *content*. Extending it to assert per-role fills and wheel-segment
   clickability would have caught both of today's defects and fixval's 330° wheel.
2. **Tell the builder how to get a rendering.** It asked, twice, and burned four
   calls hand-rolling a server the factory already runs. One line in the prompt.
3. **The quality-vs-distance bug class deserves its own check.** It appeared
   twice in one app, in unrelated modules.
4. Queued items 3, 5 and 6 from 2026-09-20b still stand. Item 4 is settled
   (above); items 1 and 2 are done and now validated live.

### Preserved, then torn down

Teardown **refused** on the dirty tree — the rejected build was uncommitted, and
the guard would not destroy it. That is the guard working, and it pointed at the
recipe: `just sbx manage snapshot`, which commits the work to
`sbx/<run-id>` with an `UNAPPROVED snapshot:` message. I had already hand-rolled
a tarball; the recipe is the right tool and the tarball is redundant. **Use the
recipe.**

3 commits at `refs/sandbox/hfix-20260920-062b46` in `../greenfield-sandboxes`
(plan, red suite, and the snapshot of the delivered app); full traces;
`delivered-app.png`, the first full-page screenshot of a factory build this repo
holds; and `.sandbox/runs/hfix-20260920-062b46-artifacts`.

VM destroyed, key revoked and verified absent from `/api/v1/keys`, no orphans.
**Final spend $1.933.**

### `sssf.config.yaml` now runs `deepseek-v4.1-flash`

Ron's call, and it satisfies the condition this file set on 2026-09-20b: the
A/B's blocker was "fix the harness first, then re-run", not "the model is worse".
The harness is fixed and validated, so the newest model is the one worth testing
against from here. `0731` stays registered in the guest template — reverting is a
one-word edit, no re-provisioning.

**Consequence to know about: `0731` now has no roster,** so there is no control
arm for a v4.1-vs-0731 comparison without adding one.
`sssf.dsflash41.config.yaml` is now a duplicate of the default and was left
untouched on purpose.

## 2026-09-23 — planning session: three specs, two corrections, and no compaction anywhere

A planning pass only. Nothing was built or run. The ordered queue below now points at
three specs instead of free-standing bullets.

### Two corrections to the record, both verified in the source

- **The builder did NOT discover `render_smoke.py` unprompted** (2026-09-20d said it did).
  `builder/system.md` has named it, with a `uv run` command and a "Playwright to
  `page.screenshot()`" example, since `2bc8aad` on 2026-09-19, the day before hfix. The builder
  followed an instruction. The gap it hit is narrower: nothing tells it **how the app is served**
  (`bun index.html` from the app dir), so it hand-rolled `http.server`, which cannot serve the TS
  bundle. The 2026-09-19 agency-gap finding stands as originally recorded.
- **The smoke did see the wheel defect, and threw it away.** `render_smoke.py:410-416` catches
  click timeouts with a bare `continue`, and Playwright's timeout carried the
  answer (`<text class="label">G</text> intercepts pointer events`). The skip is deliberate
  (animations, transient overlays), and so is assertion C's any-grid-point tolerance: centre-only
  reachability was measured and rejected because it flagged gf3-2, which works. So the fix is a
  new, narrower signal, not a tighter C. See the spec.

### Context occupancy: nothing has ever compacted

Checked across all 15 greenfield runs since 2026-09-17 (`agent_sessions` in each `sssf.db`).
Builder peak 100–200k typically, **276k (26.4%) at most** (fixval). Reviewer at most 153k. Pi's
reactive compaction fires near the 1M window, and no trace holds a compaction event. The builder
figure is a true peak, because `_agent_session_id` rejoins one session across build → revise_1 →
revise_2 (the reviewer's also spans review_1..3). So **overflow is not a problem, and rot might
be**: the self-compact extension's default 20% warning would already have fired in fixval, gf2-3
and hfix, which are the runs where a late revise pass broke earlier work. That is a suggestion, not
evidence. It is queued as a gated experiment (item 7).

## 2026-09-23b — spec 1 Phases 1–2: G and F work, four "good" apps were broken, and D barely clicked

Built on the host, nothing mounted. `sandbox_mount/host/render_smoke_corpus.sh` runs the smoke over
every harvested app (21 refs + an hfix mutation fixture). The full tables are in the spec's Notes.

- **F (author's SVG colours overridden by CSS)** fires on hfix's 96 `note-badge`s (6 fill colours
  written, all paint `rgb(148,163,184)`, matching the hand measurement) and on **nothing else**.
- **G (a ring of controls all covered by dead text)** fires on the hfix wheel with the
  `pointer-events` fix reverted, **not** on the fixed hfix, and on **four apps that passed every
  gate and the fan-out judging**: gf-3, gf2-3, gf3-4, gf4-solo. Adjudicated by measurement: on
  each, clicking the segment changes the app and clicking its key label does nothing, 4/4 members
  per ring. They are real defects, the same one the hfix builder found by accident. 0 false positives.
- **Assertion D has barely been clicking.** Apps that re-render on click wipe the smoke's
  `data-smoke-id` stamps, and every later click timed out silently. 7 of 18 rendering apps landed
  **one** click (including dsctl, dsv41, hfix). Now reported as `clicked N of M`; the re-probe fix is
  proposed as Phase 2b and not built.
- Still report-only: nothing's verdict changed. Next is Phase 3 (promote G and F), then 2b if approved.

## 2026-09-23c — G and F promoted; D now clicks everything, and found an E# crash

- **Phase 3:** G and F fail the gate. On the corpus, the rows that flipped are exactly the
  click-verified defects (hfix both variants, gf-3, gf2-3, gf3-4, gf4-solo). Every other verdict is
  unchanged. Commit `266486c`.
- **Phase 2b:** D re-finds each control by group + label + ordinal after a re-render, and reloads if
  an earlier click navigated away. Coverage went from 1 click to every click on hfix, dsctl, dsv41
  and gf3-3. `click_blocked` now names the hfix wheel labels (15 clicks), the exact message the
  09-20 builder saw.
- **New real defect from D:** gf4-solo throws `Unknown note name: E#` on one click of its D#m
  sector. It is the same family as hfix's quality-vs-distance bugs: theory code that cannot handle
  the correct spelling. That makes the reviewer's lossy-key item (Phase 5) more pressing.
- Remaining coverage gaps are the smoke's reach (an undismissed modal in gf3-1, a centre click
  landing on gf3-2's hub). They are recorded in the spec, and not built.

## 2026-09-23d — PRE-REGISTRATION: one live greenfield arm on the new harness

Written **before** mounting. Default roster (`deepseek-v4.1-flash` builder/test_designer), `tdd`
ADW, greenfield target at `777d62f`, brief `prompts/greenfield.md`.

### The comparator problem, found while setting this up

`resolve_prompt` reads a prompt path only if the file exists on the VM. **dsctl, dsv41 and dsv41s
were executed with `prompts/10-circle-of-fifths-wheel.md`, which exists only in the host repo.**
Their recorded request is that 36-char filename, and their planners built an app from a filename
(and whatever they found in the greenfield checkout). hfix and fixval got `prompts/greenfield.md`'s
text. So the 09-20 model A/B and hfix did not share an effective brief. A missing prompt path fails
silently: that is a harness defect. `execute` should refuse a `*.md` PROMPT absent from the target.
Queued, not fixed.

Consequence: there is no single clean comparator. **hfix** has the same brief but model `0731`.
**dsv41** has the same model, a filename brief and the old harness. Report against both, and attribute
nothing to the harness that a model change could explain.

### Predictions (judge each; a miss is a result)

1. **The builder looks at the app:** it runs `render_smoke.py … --screenshot /tmp/…` at least once
   and never hand-rolls a server (`http.server`, a custom bun server, a playwright script against a
   server it started). hfix: 0 screenshots, 4 calls on `http.server`.
2. **The builder runs the grading command** `bun test apps/app/app.test.ts apps/app/tests/generated/<id>.test.ts`
   in at least one builder phase before it reports.
3. **The new gates are live in the loop:** every render smoke in the trace reports `clicked N of M`
   with N/M ≥ 0.8. If a G-, F- or D-class defect is written, it fails `test_i`/`retest`, and it is
   fixed before the final review. Null result allowed: the defect may simply not occur.
4. **The reviewer uses the new items:** at least one review enumerates the inputs of a lookup, or
   sweeps for a sibling after a finding, in its own words or tool calls.
5. **Primary: defects found after acceptance** by measurement (the smoke over the harvested tree,
   click hit-tests, computed style, a pure-function sweep of the theory module over all 12 keys ×
   both qualities). hfix: 2 found by eye after acceptance (one-colour board, both-qualities roles),
   and the app was not approved at 18/21. Prediction: fewer, and none of the G/F/D classes.
6. **No durable test pins wrong output** (the reviewer or my sweep finds none).

Recorded, never scored: tokens, dollars (reconcile generation ids before teardown), wall clock,
review trajectory, and whether the final review approves. Accept/reject is not a quality ranking.

**Mounted as `harn2-20260923-f50552`** (pinned `777d62f`, brief confirmed present on the VM, pid 1698).
**Second confound, visible at mount:** the exe.dev image now ships **pi 0.87.1** (also uv 0.12.18,
claude 2.1.280). hfix and dsv41 ran pi 0.85.1. `toolchain.lock` keeps pi in `image` mode by design
(09-07), so this is the policy working, not an error. But any behaviour change in how agents run is
now attributable to harness **or** pi. Setup's gate passed through 0.87.1 (pings and non-zero cost).

## 2026-09-23e — harn2 judged: 6 of 6 predictions met; one latent defect, one cosmetic flaw

`harn2-20260923-f50552`, adw `f07991a4`. **15/15 phases, approved on review_2, committed.** 35.5 min,
8.96M tokens, pi-estimated $1.18 (billed spend is read at teardown). hfix: 12 phases, not approved,
29.8M tokens, $2.32. Harvested at `refs/sandbox/harn2-20260923-f50552` (4 commits); traces at
`.sandbox/traces/harn2-20260923-f50552/`.

| # | prediction | result |
|---|---|---|
| 1 | builder looks at the app, never hand-rolls a server | **MET.** `--screenshot /tmp/app.png` in build, `/tmp/app2.png` in revise_1, and **read both images**. Zero server attempts (hfix: 4 calls on `http.server`, then gave up). It also noticed that the screenshot shows only the initial state |
| 2 | runs the grading command | **MET.** `bun test app.test.ts tests/generated/f07991a4.test.ts`, 5 times across build and revise_1 |
| 3 | new gates live in the loop | **MET.** Every smoke landed **25/25 clicks with 24 re-probes**: the app re-renders on each click, so the pre-2b smoke would have clicked ONE control. No G/F/D fault fired at any point, and the delivered tree is clean on all of them (a null result, not a gap: see 5) |
| 4 | reviewer uses the new items | **MET, strongly.** review_1 rejected 12/19 citing "three verified lookup defects": **vii° voiced as a major barre ("drops the 'dim' quality into the major branch")** (the hfix class, caught in-loop this time), **F#/Gb rendering F natural** (the gf4-solo spelling family), and a CAGED quiz marking a random answer. Probes were written to `/tmp` and run. review_2 swept **by pitch class across keys incl. flats and F#/Gb and every CAGED shape**, then clicked everything in every mode. It also ran the render smoke itself, unprompted |
| 5 | fewer post-acceptance defects, none of G/F/D class | **MET.** Delivered tree: smoke PASS (123 controls, 25/25 clicks, G/F/D clean). Independent sweep, ground truth from our own pitch-class table: scales 65/65, spelling 26/26, triads and sevenths 168/168 each, CAGED 65/65, pentatonic boxes 120/120, key signatures 12/12, **every user-reachable voicing plays exactly its chord** (12 keys × triads and sevenths × both barre shapes). **One latent defect:** `chords.ts:67` sets minor-mode seventh QUALITIES to a placeholder `symbols.map(() => "min7")` (the symbols table on line 20 is right), so minor ii° reads m7 and III/VI read m7. No UI path reaches it (every call site passes `"major"`). **One cosmetic flaw:** the centre hub covers ~20% of the inner edge of all 12 minor-key buttons. Measured by hit-test: every centre click lands; the major ring is fully clear |
| 6 | no durable test pins wrong output | **MET.** Durable suite 2 → 15. The new tests assert the spec's answer for each reviewer finding (F#/Gb spelled with E#, dim voicing = B D F only, CAGED answer = E shape). Generated suite: 31 |

**Attribution, honestly bounded.** Two confounds were named before judging: the model (hfix ran
`0731`) and pi (0.85.1 → 0.87.1). What the trace ties to *today's* harness regardless of either:
the `--screenshot` calls and image reads (the flag did not exist before), the 25/25 clicks via 24
re-probes (the re-find did not exist), and the reviewer's lossy-key language and pitch-class sweeps
(the prompt item did not exist). Token efficiency (8.96M vs 29.8M) and approval are NOT attributed:
model, pi and a different app shape all move them. This is N=1.

**My own measurement errors, caught before they became findings:** the sweep first reported 84
triad and 84 seventh "failures". That was my own input (`"natural-minor"` where the API takes
`"minor"`), plus a key-signature check too strict for F#/Gb, which carries both spellings.
Re-checked against the call sites before re-running.

### What this run queues

1. **`--screenshot` should reach a state**, e.g. `--click "F#"` before capturing. The builder asked
   for exactly this, and the initial state hides most of a multi-mode app.
2. **Silent prompt-path fallback** (2026-09-23d): `execute` should refuse a `*.md` PROMPT missing
   from the target.
3. The latent minor-sevenths placeholder is the reviewer's blind spot in a precise form: it swept
   what the UI reaches. That is arguably right for "is the request met". A dead-code path with wrong
   data is not a UI defect, so no change is proposed. It is recorded as the limit of review-by-probing.

### Torn down, and the token question answered with the same-model run

Teardown clean: **billed $1.364** (pi estimate $1.179, 1.16×), key revoked and verified absent,
VM destroyed, tree clean. Artifacts at `.sandbox/runs/harn2-20260923-f50552-artifacts`.

Ron's read was that the upgrades cut tokens and minutes by ending the thrash. Tested against
**dsv41**, the one run with the same model (v4.1) on the old harness:

| run | min | tokens | tool calls | failed | biggest phase |
|---|---|---|---|---|---|
| dsv41 (v4.1, old harness) | 44.9 | **9.7M** | 203 | 5 | plan 3.59M (a planner searching for a brief it was never given) |
| hfix (0731, 09-20 fixes) | 64.4 | 29.8M | 335 | 14 | **revise_1 14.97M**, plus a third review round |
| harn2 (v4.1, all fixes) | 35.5 | **9.0M** | 184 | 3 | revise_1 3.47M |

- **Against the same model, tokens barely moved** (9.7M → 9.0M), and the builder spent slightly MORE
  in harn2 (build+revise 5.9M vs 5.1M), because it was now screenshotting, grading and re-checking.
  The 3× drop against hfix is mostly the model (0731's revise_1 alone was 15M) and one fewer review round.
- **The thrash Ron remembers was real, and it was fixed earlier:** the 09-20 blind arm's test designer
  spent 1.14M tokens and 34 of 35 calls fighting the test-DOM trap. Fixes 1 and 2 (09-20c) removed it,
  and hfix already had them.
- **Where today's harness DID pay is outcome, not tokens:** dsv41 shipped measurably broken audio and
  fret geometry (09-20b). harn2's reviewer caught three theory defects in-loop, and the delivered app
  passed a full independent sweep. Same model, same token budget, a correct app. Still N=1 per arm,
  and dsv41's brief was a filename.

## 2026-09-20 → 2026-09-23 — why the v4.1 rollout stopped at the default roster

*Moved from NEXTSTEPS "CURRENT STATE" at the 2026-09-23 split. The default roster was promoted to
v4.1 on 2026-09-20, after the harness fixes were validated. The "only one roster" wording below
predates that promotion.*

### Why it is deliberately stopped here

The 2026-09-20 A/B did **not** clear v4.1 for general use. P1 (speed) was inside
the noise floor, P2 (tool errors) was directional only, and P3 split — better
aesthetics, **measurably broken audio and fret geometry**. Promoting it into the
other six rosters on that evidence would be exactly the "swap on catalog
authority" mistake this command exists to prevent.

`sssf.dsflash41.config.yaml` is the **test harness for the model**, not a
production roster. It exists so v4.1 can be exercised without disturbing any
roster that other work depends on.

### What would justify rolling it out further

Not another A/B on the same brief. **Fix the harness first**, then re-run —
because the 2026-09-20 run could not separate "the model is worse" from "the
model spent 1.14M tokens fighting the harness." Once a builder actually gets to
build, the model question becomes answerable. Only then promote, one roster at a
time, starting with `sssf.config.yaml`.

**Queued items 1 and 2 are done, pushed, and validated live** (2026-09-20c/d):
the red gate now runs the command that grades the build and judges it per file,
and the clean room ships a shared test DOM instead of the trap. Target is at
`a7e31d0`. `hfix-20260920-062b46` exercised both through a full TDD chain — the
gate passed first attempt with per-file evidence, the designer used the harness,
and the builder wrote product code on call 7 instead of call 35. Item 4 is
settled by that run; items 3, 5 and 6 remain, and 2026-09-20d adds three more.

## 2026-09-23 — NEXT STEPS snapshot at the split

*The full queue as it stood when NEXTSTEPS.md was cut down to open items. Kept for the detail on the two closed items.*

Ordered by value. Each spec carries its own phases, loop gates and validation commands.

### 1. `specs/render-content-and-prompt-gaps.md` — closes items 1, 2, 3 and 4(3)

**DONE 2026-09-23, spec complete.** Closes items 1, 2, 3 and 4(3). G/F/D-re-find in the gate, `--screenshot`, builder and reviewer prompts. The target is pushed at `777d62f` and verified on the remote. The final corpus matches the calibrated run exactly.

- A calibration corpus first: every harvested app in `../greenfield-sandboxes`
  `refs/sandbox/*`, plus two known-bad fixtures from hfix. New smoke signals land **report-only**
  and are promoted to failures only if the corpus is clean.
- **G**: dead text covering a whole ring of sibling controls (the hfix wheel). **F**: an SVG
  `fill`/`stroke` attribute with ≥2 distinct values whose computed style collapses to 1 (the
  96 one-colour badges). **`click_blocked`**: keep the evidence the timeout already carries.
- `render_smoke.py --screenshot <path>`, so the builder gets a rendering from the server that
  already works. Builder prompt: how the app is served, the grading command, and "durable tests
  encode the spec, not your output".
- Reviewer prompt, payload-neutral: lookups that drop a distinguishing attribute, and a sibling
  sweep after any defect.
- Host-local and free until the `--push` sync, which needs Ron's go-ahead.

### 2. `specs/harness-signals-suite-growth-provider-errors-context.md` — closes items 5 and 4(5)

- `stopReason: "error"` is classified as `provider_error: <errorMessage>` and never sent into
  JSON-retry. The shape was verified against a real local 401 turn.
- The durable-suite growth count, **report-only on purpose**: a "must grow" gate rewards pinning
  whatever the code returns, which is exactly hfix's `app.test.ts:423-436`.
- A per-turn context curve stamped on `agent_message` events, plus `just traces context-curve`.

### 3. One baseline greenfield arm on the result — DONE 2026-09-23e (`harn2`, 6/6 predictions met)

Compare against **dsv41-20260920** (v4.1, same brief, old harness), so the harness is the only variable. hfix ran `0731`, so report it only as context. Pre-register the predictions here before mounting.

v4.1 default roster, hfix's brief. Compare with hfix on defects found by hit-test after
acceptance, the review trajectory, whether G/F fire *inside* the loop, and builder calls spent on
servers/screenshots.

### 3b. Two small harness fixes from harn2 (cheap, do first next session)

- **`render_smoke.py --screenshot` should reach a state first**, e.g. `--click "F#"` (repeatable) before
  capturing. The harn2 builder noticed on its own that the initial state hides most of a multi-mode app.
- **`execute` must refuse a `*.md` PROMPT that is absent from the target.** Today it silently becomes
  the brief: dsctl, dsv41 and dsv41s all ran on a 36-character filename (2026-09-23d).

### 4. Still open, not in a spec

- **(6) the audio channel**: four defects in four runs. It needs a brief-level requirement and an
  `AudioContext` value spy in `test-dom.ts`. That is a design task, so do it after 1–3.

### 5. A 0731 control roster, if any A/B is wanted

The default runs v4.1 and nothing runs `0731`. Build one only when an A/B needs it.

### 6. `specs/context-rot-and-self-compact.md` — a later experiment, gated

A stub. Stage 1 reads the context curves: do defects concentrate at high occupancy? If not, stop.
Stage 2 is a host-local spike: the self-compact extension is tested only under pi **RPC** mode,
while the factory runs `pi -p --mode json`, which exits at idle. So its handoff (compaction once
idle, note returned as the next turn) may never complete in print mode. Stage 3 is a two-arm
A/B, builder seat only. Needs 1–3 done first.


## 2026-09-23f — the two harn2 harness fixes: staged screenshots, and no more filename briefs

Both from the harn2 queue (2026-09-23e). Pushed, and synced to the greenfield target at `e97e9a8`
(pristine guard still ok: `apps/` untouched).

### `render_smoke.py --click LABEL` stages the screenshot

`--click` is repeatable and runs in order. It clicks by visible text: a button with that name first,
otherwise any element whose text is exactly that. `force=True` clicks at the element's centre the
way a user would, so an SVG `<text>` label with `pointer-events:none` hands the click to its segment.
The clicks run on a **separate page**, so G/F/E/D still measure a clean load. A label that matches
nothing is printed as `did NOT click (...)`, and the picture is still written. `--click` without
`--screenshot` exits 2.

Verified on the harn2 harvest (`refs/sandbox/harn2-20260923-f50552`):
- `--click "F#"` reported a miss. The app's label is `F#/Gb`, so the miss was correct and not a bug.
- `--click "F#/Gb" --click "7th Chords" --click "Pentatonic Boxes"`: the picture shows F# selected,
  seventh chords and pentatonic box 1. The verdict was unchanged (PASS, 25/25 clicked).

The builder prompt and TREE.md document the flag.

### A `*.md` prompt that does not exist is refused, in two places

- `just sbx lifecycle execute` runs `test -f` on the VM before detaching. It exits 1 with a message,
  not a PID. Prompts that contain whitespace are still inline text, so "add a README.md badge" passes.
- `utils.resolve_prompt` raises `SystemExit` for a single-token `*.md` that is not a file, which
  covers host-local ADWs too. Tested: `prompts/10-circle-of-fifths-wheel.md` from the wrong
  directory (the dsctl shape) is refused, the correct relative path reads the file, and prose that
  ends in `.md` is kept as text.

**Not yet exercised on a VM:** the `execute` ssh guard. Its case logic and the justfile parse were
checked locally. The next mount is the first live test.

## 2026-09-23g — harness signals built: provider errors named, suite growth counted, context curved

`specs/harness-signals-suite-growth-provider-errors-context.md`: complete, 25 of 25. Closes 2026-09-20b items 5 and 4(5). Host-local, not synced to the target.

### Provider errors are named as provider errors

`PiResult` now carries the last turn's `stop_reason` and `error_message`. `_parse_with_retries`
raises `ProviderError("provider_error (<model>): <message>")` before any JSON correction is sent, so
phases record it as `where error like 'provider_error%'`.
- Verified against pi's real 401 line (adw `0d0e8411`, which was recorded as "planner never produced
  valid PlanOutput JSON").
- An errored result makes no send. A `stop` result with bad JSON still sends 2 corrections.
- **It fired live on its first real use.** See "Found" below.

### Durable-suite growth: measured, reported, never failing

`gates.durable_suite_count` counts through `quality.tests_argv()` + junit. `durable_suite_growth`
always passes and records `durable suite: <baseline> → <now> (+N)`. The baseline is taken at
`commit_tests`, and the gate runs on `build`, every `fix_i` and every `revise_i`. On hfix: the red
commit holds 2 and the delivered snapshot holds 41, so +39. The spec's "29" was the count at
`revise_1`. The reviewer does not see the number yet: its only channel would overwrite the builder's
notes.

### The per-turn context curve

A `context` event goes out per valid assistant turn, and `agent_start` carries `context_window`.
Query: `just obs context-curve <adw_id> [db]`. It is **not** a stamp on `agent_message`: harn2's
builder had 12 of those across 60 turns. harn2's builder stream, replayed through the real parser,
gave 60 points. They never decrease and run from 6,944 to 150,056 (14.3% of 1M), and the last point
equals `agent_sessions.context_tokens`.

### Found: host-local ADWs have never been able to authenticate

`~/.pi/agent/models.json` on the host has `"apiKey": "env:OPENROUTER_API_KEY"`, which is **not pi
syntax**. pi resolves `$VAR`, `${VAR}` or `!command` (pi docs `models.md`, "Value Resolution"), so it
sent the literal string. VMs are fine because provision replaces the token with the key. The fix
needs no secret on disk: `"$OPENROUTER_API_KEY"`, since `utils.py` already loads `.env`. I edited
the host file (backup: `~/.pi/agent/models.json.bak-20260923`). **The confirming live run was
blocked by the permission classifier**, pending Ron's approval. Until then the context curve is
proven on a recorded stream only.

**Live confirmation, same day.** With the host key fix kept, adw `903142cf` (scout, v4.1-flash,
11,228 tokens, $0.0009) produced 3 `context` events, 2,889 → 4,072 → 4,267. The last equals
`agent_sessions.context_tokens`, and `agent_start` carries the window (1,000,000). It had 1
`agent_message` for 3 turns. The first attempt failed "model not found" for another reason: the `!`
shell has no `pi` on PATH (nvm node v22). Side effect of `$OPENROUTER_API_KEY`: pi lists OpenRouter
models only when that variable is set (0 vs 388), which the ADWs cover by loading `.env`.

## 2026-09-23h — PRE-REGISTRATION: harn3, a replicate of harn2 carrying the new signals

**Approved by Ron before mounting.** Nothing above the mount record below changes after this commit.

Default roster (`deepseek-v4.1-flash` builder/test_designer), `tdd` ADW, brief `prompts/greenfield.md`,
greenfield target at `efb88e3`. **Comparator: harn2** (`f07991a4`, 2026-09-23e). It has the same
model, brief, roster and ADW, so for the first time the comparator is clean. The deliberate
differences are 2026-09-23f/g only: `--click` screenshots, the prompt-path guard, and the three
signals. Known confounds: sampling (this is N=2 on the harn2 question) and the exe.dev image's pi
version (harn2 ran 0.87.1; record it at mount, and treat a change as a confound, not an error).

### Mount-time checks (free; they must pass before `execute`)

0. **The execute guard, first live test.** `execute <run> prompts/does-not-exist.md` exits 1 with
   the refusal message and records no pid. Then the real `execute … prompts/greenfield.md` passes it.

### Predictions (judge each; a miss is a result)

1. **The signals are recorded, all of them** (instrument check, expected certain; a miss is a harness
   bug): every agent phase emits `context` events. Each agent's last curve point equals its
   `agent_sessions.context_tokens`. `commit_tests` logs `durable_tests=<n>`. Every `build`/`fix_i`/`revise_i`
   has a `durable_suite_growth` row, and none fails.
2. **No provider errors.** Zero phases with `error like 'provider_error%'`. If one occurs, the
   prediction is that it is classified that way and not as a JSON failure, and the run is then
   reported as confounded rather than judged.
3. **The builder stages a screenshot:** at least one `render_smoke.py … --screenshot … --click …` call
   in a builder phase, and the image is read afterwards. harn2 asked for this and could not do it.
4. **The durable suite grows, and correctly:** growth > 0 from the `commit_tests` baseline (harn2:
   2 → 15), and no durable test pins wrong output (my sweep finds none).
5. **Primary, replicated from harn2: zero UI-reachable defects after acceptance**, by measurement.
   The render smoke runs over the harvested tree (G/F/D clean, clicks ≥ 0.8), plus the harn2
   independent sweep against our own pitch-class table: scales, spelling, triads and sevenths,
   CAGED, pentatonic boxes, key signatures, and every reachable voicing across 12 keys × both
   qualities. harn2: 0 reachable, 1 latent. Latent (non-UI) defects are recorded and not scored:
   harn2 already showed review-by-probing cannot see them.
6. **The context budget holds:** builder peak ≤ 26% of the window, with no compaction (15 runs so
   far; harn2 peaked at 14.3%). Also recorded for the context-rot stage 1, not scored: the
   occupancy at the turn where each reviewer-cited defect was written.

**Not measured, and not claimed:** audio. There is still no instrument for it (NEXTSTEPS item 1).

Recorded, never scored: tokens, dollars (reconcile generation ids before teardown), wall clock,
review trajectory, and whether the final review approves. Accept/reject is not a quality ranking.

**What would change a decision:** if 5 misses, harn2's 6/6 was partly sampling. The next move is
then a small replicate set (N=3) before any fan-out, not more harness. If 1 or 2 miss, fix the
harness before reading anything else from the run.

**Mounted as `harn3-20260924-e76bec`**, adw `f561559d`, pid 1748. Target pinned at `efb88e3`, tree
clean, `prompts/greenfield.md` present. The recorded input is the brief's text, not a filename.
**pi 0.87.1, the same as harn2, so the pi confound named above does not apply.**
**Check 0 PASSED:** `execute … prompts/does-not-exist.md` exited 1 with the refusal message and
recorded no pid. That was the guard's first live test (2026-09-23f).
