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
