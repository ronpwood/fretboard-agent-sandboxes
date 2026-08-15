# Factory In A Box

> **A blog app, the software factory that builds it, and the throwaway sandbox that runs both.**
> For engineers who want agents shipping code without a human in the loop.

📺 Watch this video to get the full breakdown of this codebase: **[Factory In A Box on YouTube](https://youtu.be/SEI_qIW4o2c)**

<p align="center">
  <img src="images/09_factory_in_a_box.png" alt="Three nested tiers: the Inkwell app inside the factory inside a throwaway exe.dev VM, mounted and watched from the host" width="850">
</p>

Three tiers nest here: **Inkwell** (a minimalist blog-writing app), the **[Super Simple Software Factory](https://github.com/disler/super-simple-software-factory)** (deterministic Python owns the graph, coding agents are bounded phases inside it), and the **sandbox mount system** (six host-side phases that stand the other two up on a disposable VM in about 10 seconds). The app is the payload. **The point is the loop that ships it without you in the middle.**

You can get value from this repo two ways, and both are first-class:

- **Run it.** Mount a throwaway VM, point the factory at a task, and watch agents ship code in isolation. Follow [Install](#install), then [How to run it end to end](#how-to-run-it-end-to-end).
- **Read it.** Study a working out-of-the-loop system: the primitives, the credential boundary, the trace pipeline. You need almost nothing installed. Jump to [Who commands what](#who-commands-what) and [Watch it run](#watch-it-run).

<p align="center">
  <img src="images/19_factory_in_a_box_titled.png" alt="Factory In A Box: an idle out-sandbox orchestrator on your machine hands a prompt across the boundary to an in-sandbox orchestrator that drives the ADW agents; the software factory is agents plus code" width="800">
</p>

---

## Install

### Agentic Install

```bash
claude               # boot Claude Code in the repo root
/install             # set up toolchain, deps, and .env, then run the preflight
/prime               # orient on all three tiers (out-loop orchestrator, in-loop orchestrator, software factory), check live state
```

`/install` and `/prime` live in `.claude/commands/`. `/install` checks the toolchain, installs app deps, verifies `.env`, and runs the `just sbx manage doctor` preflight without starting anything. `/prime` then walks the agent through the command surface, the specs, and the measured gotchas.

Once oriented, you operate the whole system by talking to the agent. Two skills carry the knowledge, so you describe intent and the agent runs the right recipes:

- **`/sssf-sandbox-orchestrator`** drives the out-of-sandbox loop from plain English: mount a box, put work in, watch it, fan out best-of-N, harvest the XYZ sandbox, tear down. Thin skill, fat recipes: every action it takes is a `just sbx` command you could type yourself.
- **`/sssf`** drives the factory from inside a box: create, run, and observe the ADWs, and manage the agent roster.

### Manual Install

```bash
cp .env.sample .env                  # add OPENROUTER_PROVISIONING_KEY (host-only, never leaves)
just sbx manage doctor               # six-check preflight: ssh, key, helpers, rates, adw layer
just fretboard test                  # the payload app's suite, green
```

### Required Tech

Every resource this system leans on, what it does, and whether you actually need it. The right two columns matter: **running the full loop** asks for a bit of setup, but **reading and understanding** the system asks for almost nothing.

| Tech | Role in the system | Run the loop | Just read + observe |
|---|---|---|---|
| [`git`](https://git-scm.com) | clone the repo; the factory commits its own work | required | required |
| [`bun`](https://bun.sh) | serves Inkwell (:4501) and the observability UI | required | optional (only to boot the UI locally) |
| [`uv`](https://docs.astral.sh/uv/) | runs the PEP-723 Python ADW scripts | required | not needed |
| [`just`](https://just.systems) | the whole command surface (all four namespaces) | required | helpful (to read the recipes) |
| [exe.dev account](https://exe.dev) | the disposable VMs the factory runs inside | required to mount | not needed |
| [OpenRouter provisioning key](https://openrouter.ai/settings/management-keys) | mints and revokes the per-run inference keys | required to mount | not needed |
| [Claude Code](https://claude.com/claude-code) + [Pi](https://github.com/badlogic/pi-mono) | the coding agents that do the work | preinstalled on the VM | not needed |

Two credentials are the entire reason the sandbox is safe: the **exe.dev account** and the **OpenRouter provisioning key** live only on your host. Everything else is a fast, free toolchain install. If you only want to understand the design, clone the repo and read: no account, no key, nothing to spend.

---

## Why this exists

<p align="center">
  <img src="images/15_out_of_the_loop.png" alt="In the loop, every lap pulls you back in; out of the loop, the agent run loop orbits and you just read it" width="780">
</p>

A system that needs you at every step does not scale, and you become the key-man risk in your own factory. The goal is the right side of that diagram: the loop orbits, you read the trace. Isolation is what makes it safe to let go.

<p align="center">
  <img src="images/13_agent_in_the_box.png" alt="Agent out reaches through the wall into your environment; agent in lives in the same room as the codebase" width="780">
</p>

The controversial call, stated plainly: **the coding agents run inside the sandbox**, not outside it driving a remote shell. Claude Code and Pi are installed on the VM, in the same room as the codebase. The host keeps only a thin orchestrator and two credentials that never leave.

---

## Who commands what

<p align="center">
  <img src="images/11_who_commands_what.png" alt="Nested command tiers: the out-sandbox orchestrator manages sandboxes, the in-sandbox orchestrator runs the factory, ADW agents do the work" width="800">
</p>

Three command tiers, and each one commands only the tier inside it:

| Tier | Lives | Does |
| --- | --- | --- |
| **Out-sandbox super orchestrator** | your machine | mounts, fills, observes, harvests, tears down sandboxes |
| **In-sandbox orchestrator agent** | the VM, a resumable Claude Code session | receives delegated work, launches the factory, watches it, reports |
| **ADW agents** | bounded phases inside the factory | scout, plan, build, review, document |

<p align="center">
  <img src="images/12_tier_command_surface.png" alt="Each tier has one command surface: just sbx mount/execute/teardown, then just adw sdlc, then the agent phases" width="780">
</p>

Work crosses the boundary on one of two paths, and the difference is who pulls the trigger inside:

| Path | Verb | Mechanism |
| --- | --- | --- |
| **Direct** | a command | `just sbx lifecycle execute` detaches the factory process itself: reproducible, pid-tracked, zero orchestration tokens |
| **Agent-mediated** | a delegation | `just sbx run agent` briefs the in-sandbox orchestrator, and *it* launches the factory: judgment at the kickoff, conversational, resumable |

Every delegation opens with the equip line, so the in-box agent routes instead of improvising:

```bash
just sbx run agent <id> "If you have not already: READ and EXECUTE .claude/skills/sssf/SKILL.md. Then: <work>"
```

<p align="center">
  <img src="images/21_one_orchestrator_many_sandboxes.png" alt="One out-sandbox orchestrator (x1) on your machine commands many agent sandboxes (xN), each running its own in-sandbox orchestrator over the scout, plan, build, test, review software factory" width="780">
</p>

---

## Tier 1: Inkwell, the payload

<p align="center">
  <img src="images/07_inkwell_validated.png" alt="The Inkwell writing app: draft list on the left, markdown editor and live preview on the right" width="750">
</p>

A blog-writing app: drafts, a markdown editor with live preview, one-click publish. Bun plus `bun:sqlite`, zero dependencies, vanilla JS front end, port 4501. It is small on purpose: small enough to rebuild end to end, over and over, by agents. The 30-test suite is what the factory's test phase runs, by name, as code rather than an agent decision.

```bash
just fretboard run    # boot on :4501
just fretboard dev    # reload-on-save
just fretboard test   # the suite the factory runs
```

## Tier 2: the factory

<p align="center">
  <img src="images/01_factory_spine.svg" alt="The factory spine: a deterministic ADW script sequencing plan, build, and test phases with agents as bounded nodes" width="750">
</p>

Twelve ADWs (AI Developer Workflows) under `adws/`, each a thin `uv run` script whose docstring is its chain: `adw_simple_sdlc` runs plan, build, test, review, document with three separate commits. Typed envelopes carry context between phases; gates validate every claim, and a failure re-enters the same session as a correction, never a restart. **Agent proposes, code disposes.**

<p align="center">
  <img src="images/value/03_core_four.png" alt="An agent is four things: a model, a harness, tools, and a prompt, wired around a central agent node" width="750">
</p>

Under every phase is the same primitive: an agent is a model, a harness, tools, and a prompt. The factory holds those four constant and swaps only the prompt and the model per phase. Staffing is one config file, swappable per run: five rosters ship in `adws/adw_sssf_config/`, the cheap default, the frontier roster, pure DeepSeek, open-weights, and top-speed. Every model is `openrouter/<id>`, so the ids are identical on your laptop and inside every box.

The factory has its own standalone codebase at [disler/super-simple-software-factory](https://github.com/disler/super-simple-software-factory), the skill that stamps it into any repo. This repo just runs it.

## Tier 3: the sandbox

<p align="center">
  <img src="images/16_six_phase_run.png" alt="The run end to end: create, fill, setup on the host, execute inside, observe and teardown from the host, ~10s total cold mount" width="780">
</p>

Six phases take a blank exe.dev VM to a health-checked, running factory in about 10 measured seconds: create, fill, setup, execute, observe, teardown. Every phase is a `just` recipe a human could type; the run record on disk is the only state they share, so any crash leaves teardown a handle.

<p align="center">
  <img src="images/10_credential_boundary.png" alt="The credential boundary: the exe.dev account and provisioning key never leave the host; a per-run capped key crosses; a sandbox cannot mount sandboxes" width="750">
</p>

The whole repo ships to the VM. What a sandbox cannot do is *use* the orchestration half, because the exe.dev account and the OpenRouter provisioning key never leave the host. Each run gets a disposable `sbx-` key with a $50 cap, revoked at teardown. **One level of nesting, enforced by credentials rather than by deleting files.**

<p align="center">
  <img src="images/17_best_of_n.png" alt="Best-of-N: one prompt fans out to three software factories and the results come back ranked" width="750">
</p>

Fan-out is a loop over configs: one prompt, N rosters, N boxes. Teardown is never automatic, and harvest never merges: a run's commits come home as `refs/sandbox/<run-id>`, parked for a human to compare and choose the winner.

---

## How to run it end to end

<p align="center">
  <img src="images/20_command_tiers_pipeline.png" alt="A prompt on your machine wakes the idle out-sandbox orchestrator, crosses into the agent sandbox where the in-sandbox orchestrator runs the ADW agents in sequence: scout, plan, build, test, review, with a feedback loop back" width="780">
</p>

The main flow, top to bottom. Every command is a `just` recipe you could type by hand.

```bash
# 0. one-time: credentials + preflight
cp .env.sample .env               # add OPENROUTER_PROVISIONING_KEY (host-only)
just sbx manage doctor            # must end with: sbx doctor: OK

# 1. mount a throwaway VM into a running factory (~10s)
just sbx mount my-feature         # prints the resolved run id and two URLs

# 2. put work in (pick one path)
just sbx lifecycle execute <run-id> "add a word-count badge to the editor footer"   # direct, detached
just sbx run agent       <run-id> "READ and EXECUTE .claude/skills/sssf/SKILL.md. Then: <work>"  # delegated

# 3. watch from outside
just sbx manage list              # every run: state, VM alive, spend
just obs sessions                 # the ADW runs inside your boxes
just obs tail <adw_id>            # live event stream for one run

# 4. bring the commits home (safe, non-destructive, run any time)
just sbx manage harvest <run-id>  # commits land in refs/sandbox/<run-id>

# 5. tear it down (always an explicit human decision)
just sbx lifecycle teardown <run-id>
```

Or just ask. With `/sssf-sandbox-orchestrator` loaded, the same flow runs conversationally: "mount a sandbox and add a word-count badge," "spin up three and give me best-of-N," "harvest the winner." The skill picks the recipes; the typed `just` commands above stay the deterministic ground truth underneath.

Two handles, do not confuse them: **`<run-id>`** names the sandbox (it is also the VM name and the public hostname), while **`<adw_id>`** names one factory run inside that box. `just sbx manage list` counts sandboxes; `just obs sessions` counts the runs within them. A single box can host many ADW runs.

`just sbx mount` stops at `observe` on purpose: nothing chains into teardown, because a destroyed VM is the evidence and the artifacts, gone. Harvest is the exception you can run freely, because it only reads the box and only writes `refs/sandbox/`.

---

## Watch it run

<p align="center">
  <img src="images/14_observe_from_outside.png" alt="Observe from outside only: the out-sandbox orchestrator reads the app and agent view but never reaches in; traces flow up from the agents" width="780">
</p>

You watch from outside; you never reach in. Every phase, tool call, complete thought, and complete response streams into `sssf.db` as it happens (agents to sqlite to you, WAL so reads never block writers), and the visualizer polls it.

<p align="center">
  <img src="images/value/06_observability.png" alt="A swimlane of engineer, planner, and builder phases over time, every run recorded down into a sqlite store" width="750">
</p>

That trace is also the answer for the read-only audience: you do not have to run anything to understand the system, because every run it ever did is recorded. Query `adws/adw_data/sssf.db` directly, or boot the UI.

<p align="center">
  <img src="images/18_two_ports.png" alt="One sandbox, two ports: the app on a public port, the agent view auth-gated on a private one" width="750">
</p>

Each sandbox exposes two ports: the app is public, the agent view stays auth-gated to you. Ship the app; keep the factory floor private.

```bash
just obs ui                 # boot the observability UI
just obs sessions           # recent runs
just obs tail <adw_id>      # live event tail
just sbx manage list        # every sandbox: state, VM alive, spend
```

---

## The command surface

Five namespaces, and the namespace answers *where the work happens*:

```
justfile
├── fretboard   boot and test the app itself: run / dev / test
├── adw         the workflows: sdlc, build-test, scout, simple-sdlc … (runs IN a sandbox)
├── sbx         sandbox orchestration: mount, lifecycle, run, manage, orch (host-only)
├── obs         read the trace: sessions, phases, tail, procs, ui
└── local       boot an orchestrator agent on THIS machine: cc / pi / ipi
```

```bash
just sbx mount my-feature                                  # blank VM → running factory, ~10s
just sbx run cmd <id> 'tail -f run.log'                    # look inside, synchronously
just sbx manage harvest <id>                               # commits home → refs/sandbox/<id>
just sbx lifecycle teardown <id>                           # human decision, always
```

`TREE.md` is the file-by-file map of the whole repo, grouped by tier, if you want the full territory.

---

## Where it can still fail

Every one of these was measured on live hardware, and each cost a debugging cycle:

- **A just module inherits nothing.** Not variables, not settings, not the working directory. Every module re-declares what it needs; each missing line fails in a different silent way.
- **`pi --list-models` exits 0 while printing "No models available."** Health checks assert on output, never `$?`.
- **A partial cost block drops the whole roster.** pi requires all four rate fields; miss one and every run reports $0.0000 while genuinely spending.
- **Never `apt` in the mount path.** About 35s per package from the `dal` region; bun and just come from their own CDNs in about a second.
- **An unsynced golden-VM clone produced 5,641 zero-byte files** and every naive check passed. Gates check content, not existence.

The deep list lives in `.claude/skills/sssf-sandbox-orchestrator/references/gotchas.md`.

---

## License

MIT — see [`LICENSE`](LICENSE).

---

## Master Agentic Coding

Want to a clear hands on guide to building your software factory?

Master tactical agentic coding patterns with [Tactical Agentic Coding](https://agenticengineer.com/tactical-agentic-coding?y=fctinbox).

Don't want to pay for stuff? No problem: Follow the [IndyDevDan YouTube channel](https://www.youtube.com/@indydevdan) to improve your agentic coding advantage.

---

Stay Focused and Keep Building

- IndyDevDan
