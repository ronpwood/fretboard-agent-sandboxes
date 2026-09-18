# Playbook: single-VM sandbox run

The happy path, command by command, for mounting one VM, watching it build a real
feature, fixing a bug it introduced, and bringing the result home. This is the same
sequence run in the first end-to-end smoke test (`triad-playback`), with the detours
(a missing SSH `known_hosts` entry, a stale `origin` remote) left out — those are
recorded in `NEXTSTEPS.md` if you want the debugging story. Replace `<run-id>` with
whatever name you pick; it becomes the VM's hostname and public URL.

## 1. Mount a VM

```
just sbx mount <run-id>
```

One command runs all four setup phases in order and stops (teardown is always a
separate, explicit step):

| phase | what it does |
|---|---|
| `create` | mints a capped ($50 default) OpenRouter runtime key, boots the VM, waits for SSH |
| `fill` | clones this repo onto the VM, writes the runtime key to `app/.env` |
| `setup` | runs `provision.sh`, then a 6-assertion health gate (git integrity, model registry, live roster ping, cost reporting, remaining credit, toolchain report). A gate block that prints `FAIL` but reports `PASS` is a bug, not a flaky model — see `debug_a_failed_gate` §3 |
| `observe` | starts the app's dev server on loopback (`:4502`) behind a Host-rewriting proxy (`:4501`), plus the observability dashboard (`:4600`), makes the app URL public |
| `refresh` | (5b, on demand) bounces **only** the dev server so the review URL serves a freshly built bundle — run it after an ADW commits, before you trust what the browser shows |

It prints a summary when done:

```
app  https://<run-id>.exe.xyz/
obs  https://<run-id>.exe.xyz:4600/
```

Open the `app` URL in any browser — no login needed, it's the one anonymous port.
Open the `obs` URL in a browser you're already signed into exe.dev with — it's
owner-gated, and shows the same trace DB every ADW run below writes to live.

## 2. Run a task end-to-end (plan → build → test → commit)

```
just sbx lifecycle execute <run-id> prompts/09-triad-playback.md
```

This is detached — it returns immediately with a PID, and the VM keeps working after
your terminal moves on. Watch it:

```
just sbx run cmd <run-id> 'tail -f run.log'
```

or query the trace DB directly instead of the raw log:

```
just sbx run cmd <run-id> 'just obs sessions'
just sbx run cmd <run-id> 'just obs phases <adw_id>'
```

The `PROMPT` argument can be a path (read from the sandbox's own checkout, exactly
what got cloned in `fill`) or inline text. Default workflow is `sdlc`: plan → build →
deterministic test/fix loop → commit, landing on a dedicated `sbx/<run-id>` branch so
harvest can bundle exactly this run's work.

## 3. Picking a model roster

Every roster lives at `adws/adw_sssf_config/*.yaml` — `sssf.config.yaml` (the
default), `sssf.frontier.config.yaml`, `sssf.open-weights.config.yaml`,
`sssf.deepestseek.config.yaml`, `sssf.top-speed.config.yaml`. See who's in one:

```
just obs rosters
```

There is no roster flag on `mount` itself — it threads through as a `CONFIG`
argument on two of the individual phases instead:

| command | CONFIG is argument # | what it affects |
|---|---|---|
| `just sbx lifecycle setup <run-id> [CONFIG]` | 2nd | which roster gate C live-pings during the health check |
| `just sbx lifecycle execute <run-id> <prompt> [CONFIG] [ADW] [*EXTRA]` | 3rd | which roster the ADW actually uses to plan/build/review |

`mount`'s automated chain always calls `setup` with no `CONFIG`, so it validates the
default roster (`sssf.config.yaml`). If you want to run against a different one, call
`setup` again by hand with that roster before you `execute` against it:

```
just sbx lifecycle setup   <run-id> adws/adw_sssf_config/sssf.frontier.config.yaml
just sbx lifecycle execute <run-id> prompts/09-triad-playback.md adws/adw_sssf_config/sssf.frontier.config.yaml
```

An empty string `""` means "use the default" — needed as a placeholder if you want to
skip `CONFIG` but still pass the arguments after it (see the bug-fix example below).

## 4. Fixing a bug the ADW shipped

Once you know exactly what's wrong (read the diff, don't guess), a full `sdlc` re-plan
is wasted work — skip straight to `build-test` (builder → deterministic test, no
planning phase):

```
just sbx lifecycle execute <run-id> "Fix <precise description of the bug and the exact fix>" "" build-test
```

`ADW` (4th argument, default `sdlc`) picks the workflow — any recipe name from
`just adw`: `sdlc`, `simple-sdlc`, `build`, `build-test`, `build-review`,
`plan-build`, `plan-build-test-quality`, `quality`, `scout`, `document`, `ask`,
`prompt`. `build-test` and `build` have **no commit phase** — check
`git status --porcelain` on the VM afterward and commit by hand if the fix is real:

```
just sbx run cmd <run-id> 'git status --porcelain'
just sbx run cmd <run-id> 'git add -A && git commit -m "Fix <one-line summary>"'
```

## 5. Harvest the commits home

```
just sbx manage harvest <run-id>
just sbx manage traces <run-id> [sssf-session-id]   # the thinking, not the commits
```

No push credential ever lands on the VM (deliberate — the agent runs
`--dangerously-skip-permissions`), so this pulls the run's commits back as a git
bundle into a local ref instead: `refs/sandbox/<run-id>`. Inspect before touching any
branch you own:

```
git log --oneline --graph <base-sha>..refs/sandbox/<run-id>
git diff <base-sha>..refs/sandbox/<run-id>
```

## 6. Merge, once you like what you see

```
git merge --ff-only refs/sandbox/<run-id>
```

Applies to `default`-target runs only. For a greenfield (named-target) run, never merge into the
target's `main`; see § Greenfield runs → Keeping a result.

Fast-forwards cleanly because the run branch descends directly from the commit `fill`
pinned. If it doesn't fast-forward, something diverged — look before forcing anything.

## 7. Tear down

```
just sbx lifecycle teardown <run-id>
```

Order: check spend → pull artifacts → harvest again (idempotent, catches anything
committed after step 5) → refuse if the tree is dirty → revoke the OpenRouter key →
destroy the VM → close the run record. Verified this session: revoked key confirmed
absent from `https://openrouter.ai/api/v1/keys` before declaring success.

## Greenfield runs (a blank codebase)

Use this when you want a team to design and build an app **from nothing** — no reference
implementation to crib from — typically with the TDD chain. The codebase is a separate repo,
`github.com/ronpwood/greenfield-sandboxes` (checkout at `../greenfield-sandboxes`): the same factory,
an empty `apps/app` shell, and a prompt at `prompts/greenfield.md`. `targets/greenfield.yaml` in this
repo describes it; `just target list` shows every target.

### Why a separate repo (the leak rule)

A clone of *this* repo carries the reference app everywhere: `git log -p`, `archive/`, `specs/`,
`app_docs/`, harvested refs. Deleting `apps/fretboard` on the VM doesn't remove any of that. The clean
room has fresh history, so there is nothing to find. That's also why the sync is careful: it exports
only tracked factory files (`git archive HEAD`), drops the host app's `just/<app>.just` module and
`mod` line, fails on any mention of the host app name, archived app names, or the target's
`leak_patterns`, and commits with a neutral `factory sync <date>` message. Fix a leak hit **at the
source in this repo**. Never allowlist it.

### The commands

One-time prerequisite: the checkout must exist where `targets/greenfield.yaml` says
(`git clone https://github.com/ronpwood/greenfield-sandboxes.git ../greenfield-sandboxes`).

```bash
# 1. bring the clean room's factory up to this repo's HEAD (commit your factory changes first)
just target show greenfield                    # last sync: host_sha vs current HEAD
just target sync greenfield --dry-run          # diff stat + leak check + gates, then resets
just target sync greenfield --push             # commit + push to a PUBLIC repo (outward-facing); writes .sandbox/targets/greenfield.json

# 2. mount on it — fill pins to the last pushed sync's target_sha
just sbx mount gf-1 --target greenfield --limit 10

# 3. run the TDD chain ("" = default roster; name a roster file to pick another)
just sbx lifecycle execute <run-id> prompts/greenfield.md "" tdd
just sbx run cmd <run-id> 'tail -5 run.log'
just sbx lifecycle refresh <run-id>            # after it finishes, before you trust the review URL

# 4. bring it home — into the GREENFIELD checkout, not this repo
just sbx manage harvest <run-id>
git -C ../greenfield-sandboxes log --oneline <commit_sha>..refs/sandbox/<run-id>

# 5. tear down
just sbx lifecycle teardown <run-id>
```

`prompts/greenfield.md` resolves inside the VM's checkout, which is the greenfield repo, so it reads
that repo's own prompt file.

### Where commits land

A greenfield run's base commit exists only in the greenfield repo, so harvest verifies and fetches
the bundle into `../greenfield-sandboxes` (`target.checkout`). `refs/sandbox/<run-id>` lives **there**.
The bundle file stays at `.sandbox/runs/<run-id>.bundle` as usual.

### Fanning out N arms

Sync **once** with `--push`, then mount every arm. Each fill pins to the same `target_sha`, or pass
it explicitly (`python3 -c 'import json;print(json.load(open(".sandbox/targets/greenfield.json"))["target_sha"])'`).
Never re-sync mid-fan-out. The loop is in `.claude/skills/sssf-sandbox-orchestrator/cookbooks/fan_out_n.md`.

Judge rubrics live in **this** repo's `specs/`, never in the target's `prompts/`. The sync can't
carry them (`specs/` isn't a sync path), but a rubric pasted into the prompt hands every arm the
answer key.

### Keeping a result (never merge into a target's main)

The clean room's `main` must stay blank. If an arm's work lands on it, the next
`just target sync greenfield --push` would publish it, and every later arm would clone an earlier
arm's answer. So:

- **To compare or judge arms:** work from `refs/sandbox/<run-id>` in `../greenfield-sandboxes`. Harvest
  keeps them there, local-only, and the sync pushes only `main`.
- **To keep an app for real:** push its ref to a **separate** repo:
  `git -C ../greenfield-sandboxes push <other-repo-url> refs/sandbox/<run-id>:refs/heads/main`.
  Or bring it into this repo as the payload with `just app swap`.
- **Not a branch on the greenfield repo, either.** `git clone` fetches every branch, so a VM would
  have it one `git log --all` away.

The sync enforces this. `targets/greenfield.yaml` records `target.pristine`, the empty-shell commit.
Before exporting anything, every sync (including `--dry-run`) checks that `apps/` still matches that
commit and that no tracked path lies outside the sync and owned paths (a merged run brings `specs/`).
If either check fails, it exits **5** and leaves the checkout untouched. `just target show greenfield` prints
`pristine: ok` or `pristine: DIRTY — …`. To recover, reset `main` to the last `factory sync` commit.
If you are changing the shell **on purpose** (a new sanity test, a different `index.html`), commit
it in the greenfield repo and bump `target.pristine` in this repo, so the decision is recorded here.

### Re-syncing, and what you may edit in the clean room

Re-sync whenever factory paths change here (`adws/`, `just/`, `sandbox_mount/`,
`.claude/skills/sssf/`, `justfile`, `.env.sample`). A VM runs the factory in the repo it cloned, so a
stale clean room silently runs an old factory. In the greenfield repo, edit only what it owns:
`apps/`, `prompts/`, `README.md`, `.gitignore`, `app.manifest.yaml`. Everything else is overwritten by
the next sync. The sync refuses a dirty checkout, so commit owned edits first.

### Nothing to revert

The root `app.manifest.yaml` is never touched. The target lives in the run record (`target` field),
so a fretboard run and a greenfield run can be live at once, and a forgotten step can't point the
next mount at the wrong codebase. (The old procedure copied greenfield's manifest over the root one.
That is gone.)

### Adding another target

Create the repo with fresh history (`gh repo create`, a manual one-time step), give it an
`app.manifest.yaml` and an app shell, add `targets/<name>.yaml` (copy greenfield's; its `app:` section
must equal the new repo's manifest), then `just target sync <name> --dry-run`.

## Refresh the review URL after an ADW

`observe` starts the dev server once, at mount time, and its `listening()` guard
deliberately never restarts a live one — that idempotency is what makes `observe`
safe to re-run. The consequence: the server behind your review URL predates every
ADW you then run on that box.

bun rebundles on request when files change underneath it, and for hand-edits that
works. But when an ADW's commit lands — several files rewritten at once under the
running watcher — bun 1.4.2's **incremental** rebundle can emit a broken module
registry, and the browser shows:

```
Failed to load bundled module './main.ts'.
This is not a dynamic import, and therefore is a bug in Bun's bundler.
```

A fresh server start on the identical commit produces a working bundle (measured:
114,814 bytes vs the incremental 114,799). Reloading harder does not help — the
bytes on the wire are wrong.

```
just sbx lifecycle refresh <run-id>
```

This bounces the dev server only; the proxy, the dashboard and the exe.dev share
are untouched. It refuses to leave you with a silent half-fix: if a new server
started while the old one still held `:4502`, bun would **not** error — it would
quietly bind `:4503` while the proxy kept forwarding to the stale process. So
refresh kills every dev server, waits for the port to free, starts exactly one,
and then proves there is exactly one, on the right port, serving a real
`/_bun/client` chunk (the HTML alone serves fine even when the graph is broken).

**Why this matters beyond convenience.** `main.ts` calls `init()` at module scope,
so `bun test` cannot import it — the browser is the *only* gate on that file. A
review URL that lies means you have no gate on `main.ts` at all.

If the error survives a refresh, it is the app, not the bundler.

## Model rates

Same failure class as the toolchain lock, applied to prices: a table that is
right the day it is written, goes stale in silence, and surfaces as a number
nobody trusts. `sandbox_mount/guest/models.json.tmpl` carries a `cost` block per
model (`$` per **million** tokens); pi reads it and every ADW cost line is
derived from it.

```
uv run sandbox_mount/host/check_rates.py          # report drift, exit 1 if any
uv run sandbox_mount/host/check_rates.py --fix    # rewrite from the live catalog
```

It diffs what we ship against OpenRouter's public catalog and rewrites by
targeted substitution, so the `{{...}}` placeholders and the file's formatting
survive. A mounted VM keeps whatever rates it was provisioned with — re-mount to
pick up a fix.

**Run this before any experiment that ranks arms on cost.** On 2026-09-07 seven
of eleven rates were wrong in *both* directions — `gemini-3.6-flash` 2.0x high,
`gpt-5.6-luna` 2.0x low — so ADW cost lines were off by a per-model factor and
the 2026-08-22 fan-out table built from them is not comparable across arms.

**The run record is the money.** `spend` in the run record is what the
disposable OpenRouter key actually billed, and it was correct throughout. The
ADW's `cost` is an estimate off this table. When they disagree, the record wins.

## Toolchain baseline

The guest toolchain is **not pinned**. It floats, and every mount says what it ran on.
The baseline lives in `sandbox_mount/guest/toolchain.lock`, one row per tool:

```
bun     1.4.2    float
just    1.58.0   float
uv      0.12.10  image
pi      0.85.1   image
claude  2.1.261  image
python  3.12.3   image
```

| mode | who installs it | what `provision.sh` does | what gate F does on a mismatch |
|---|---|---|---|
| `float` | us, from the tool's CDN (`bun`, `just`) | installs **latest** if absent; never upgrades or downgrades an existing binary (a golden-copied VM keeps its age visible) | prints `DRIFT`, passes |
| `image` | the exeuntu base image (`uv`, `pi`, `claude`, `python`) | nothing | prints `DRIFT`, passes |
| `pin` | us, at exactly that version | version-aware replace + assert at install time | **fails the gate** |

Gate F (`[gate] F toolchain report`, the last assertion in `setup`) prints
`tool · baseline · actual · status` and stores the actuals in the run record as
`toolchain`, so "which version was that run on" is answered by
`sandbox_mount/host/run_record.py get <run-id> toolchain` forever after.

**One-mount pin, no commit.** If a fresh release is bad on a fan-out day:

```
BUN_VERSION=1.3.14 just sbx mount <run-id>            # this mount only
BUN_VERSION=1.3.14 just sbx lifecycle setup <run-id>   # re-pin a box that is already up
```

It forces `pin` at that version for that provision run and swaps whatever bun is on
the box. The lock is untouched.

**The bump ritual** — how a `DRIFT` becomes the new baseline:

1. Gate F reports `DRIFT bun 1.4.0 → 1.4.1` (float rows never fail on their own).
2. `observe` passes `[6/6]` with `app 200 anonymous` on that box.
3. Edit the row in `toolchain.lock` to the reported version.
4. Commit with the run id in the message (`toolchain.lock: ratchet baseline to <run-id>`).

The baseline is the newest version that has **passed observe**, never the newest that
exists — a ratchet, not a freeze. The serving layer is what makes floating safe: bun's
HTML dev server 403s any `Host` that is not `localhost`/an IP literal (a DNS-rebinding
guard added in 1.4.0), so `observe` keeps it on loopback and fronts it with
`sandbox_mount/guest/app_proxy.ts`, which rewrites `Host` on the way through. To vet a
bun release before it floats in, without a VM:

```
bash sandbox_mount/guest/app_proxy_selftest.sh <bun-binary> apps/fretboard
```

Background and the rejected alternatives: `specs/toolchain-unpin-and-drift-visibility.md`.

## One end-to-end example, start to finish

```
just sbx mount triad-playback
# ... open the printed app URL, confirm it looks right ...
just sbx lifecycle execute triad-playback prompts/09-triad-playback.md
just sbx run cmd triad-playback 'tail -f run.log'
# ... "ADW complete" box appears, exit ...
just sbx lifecycle refresh triad-playback   # REQUIRED before you believe the browser
# ... reload the app URL, try the feature ...
# found a real bug reading the diff, so:
just sbx lifecycle execute triad-playback "Fix <exact bug + exact fix>" "" build-test
just sbx run cmd triad-playback 'git add -A && git commit -m "Fix <summary>"'
just sbx manage harvest triad-playback
git log --oneline --graph <base-sha>..refs/sandbox/triad-playback
git merge --ff-only refs/sandbox/triad-playback
just sbx lifecycle teardown triad-playback
```
