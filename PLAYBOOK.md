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
| `setup` | runs `provision.sh`, then a 5-assertion health gate (git integrity, model registry, live roster ping, cost reporting, remaining credit) |
| `observe` | starts the app (`:4501`) and the observability dashboard (`:4600`), makes the app URL public |

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

## One end-to-end example, start to finish

```
just sbx mount triad-playback
# ... open the printed app URL, confirm it looks right ...
just sbx lifecycle execute triad-playback prompts/09-triad-playback.md
just sbx run cmd triad-playback 'tail -f run.log'
# ... "ADW complete" box appears, exit and reload the app URL, try the feature ...
# found a real bug reading the diff, so:
just sbx lifecycle execute triad-playback "Fix <exact bug + exact fix>" "" build-test
just sbx run cmd triad-playback 'git add -A && git commit -m "Fix <summary>"'
just sbx manage harvest triad-playback
git log --oneline --graph <base-sha>..refs/sandbox/triad-playback
git merge --ff-only refs/sandbox/triad-playback
just sbx lifecycle teardown triad-playback
```
