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
