---
description: Install Factory In A Box — toolchain, deps, .env, and the sbx preflight for the Super Simple Software Factory (https://github.com/disler/super-simple-software-factory)
---

# Install Factory In A Box

## Purpose

Set up this repo for development: the **Inkwell** app, the **[Super Simple Software Factory](https://github.com/disler/super-simple-software-factory)** (the ADW engine this repo runs), and the host-only **sandbox mount system**. This checks the toolchain, installs app dependencies, verifies `.env`, and runs the `sbx` preflight, without starting any servers. It is an interactive, agentic process: ask the user when a choice is needed.

Two audiences, and the install serves both:

- **Run the loop** (mount throwaway VMs and let agents ship code): needs the full toolchain plus an exe.dev account and an OpenRouter provisioning key.
- **Read and observe** (understand the system, run the app and tests locally): needs only `git`, `bun`, and optionally `uv` + `just`. The exe.dev account and provisioning key are not required.

Gate hard on the read-and-observe core. Treat the mount-only credentials as a warning, not a failure, so an observer is never blocked.

## Variables

SOURCE_REPO: the directory this command runs from (repo root)
ENV_FILE: `.env` (copied from `.env.sample`; gitignored)
APP_DIR: `apps/inkwell`
VIZ_DIR: `.claude/skills/sssf/apps/visualizer`
CONFIG_DIR: `adws/adw_sssf_config/` (five model rosters)

## Instructions

- Run every check via Bash with `command -v` — do not assume anything is installed.
- Show a status line immediately after each check (`ok` / `warn` / `fail`).
- Auto-install what has a clean CDN installer (`bun`, `just`); ask before anything heavier.
- Never read or print API key values — only confirm a variable is set and non-empty.
- Never start a server or long-running process. `just inkwell test` is allowed (it exits); `just inkwell run` / `just obs ui` / `just sbx mount` are NOT part of install.
- Never run `just sbx mount` or any `lifecycle` phase here — mounting spends money and creates a billable VM. That is a deliberate post-install action.

## Workflow

### Step 1 — Check Prerequisites

Foundational (gate — stop and guide if missing):

- `git` — clone and the factory's own commits. Install: https://git-scm.com
- `bun` — serves Inkwell (:4501) and the visualizer. Auto-install: `curl -fsSL https://bun.sh/install | bash`

Standard (needed to run the loop; warn if missing):

- `uv` — runs the PEP-723 Python ADW scripts. Install: `curl -LsSf https://astral.sh/uv/install.sh | sh` (https://docs.astral.sh/uv/)
- `just` — the command surface (`inkwell`, `adw`, `sbx`, `obs`, `local`). Auto-install: `curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to ~/.local/bin` (https://just.systems)
- `python3` — the stdlib-only run-record helper (`sandbox_mount/host/run_record.py`). Usually preinstalled.
- `ssh` — the exe.dev control plane is SSH. Usually preinstalled.

Optional (only for a host-side orchestrator via `just local`; the VM image already has these, so they are NOT needed to mount):

- `claude` (https://claude.com/claude-code) · `pi` (https://github.com/badlogic/pi-mono)

### Step 2 — Check Environment

- If `.env` is missing, copy it: `cp .env.sample .env`, then tell the user which keys to fill.
- Confirm (never print) `OPENROUTER_PROVISIONING_KEY` is set and non-empty. Host-only, mints/revokes the per-run runtime keys. Get one at https://openrouter.ai/settings/keys.
  - If empty: `warn` — required only to mount a sandbox; fine to leave blank for read-and-observe.
- `OPENROUTER_API_KEY` (optional): only for running ADWs locally via `just local` / `just adw`. Inside a sandbox it is overwritten by a minted, capped runtime key.
- `ANTHROPIC_API_KEY` (optional): Claude Code on its own key.

### Step 3 — Install Dependencies

- App: `cd apps/inkwell && bun install` (gate — the app needs it).
- Visualizer (optional, only to boot `just obs ui` locally): `cd .claude/skills/sssf/apps/visualizer && bun install`. Skip with a note if the user only wants the app + factory.

### Step 4 — Verify Configuration

- `.env` exists.
- Rosters present: list `adws/adw_sssf_config/*.yaml` (expect four: default, frontier, gemniflash, team).
- Model registry present: `sandbox_mount/guest/models.json.tmpl` exists and each model carries a full four-field `cost` block (a partial block drops the whole roster). `just sbx manage doctor` also asserts this.
- Skills present: `.claude/skills/sssf/SKILL.md` and `.claude/skills/sssf-sandbox-orchestrator/SKILL.md`.

### Step 5 — Verify Readiness (never start anything)

- Versions: `bun --version`, `uv --version`, `just --version`, `git --version`.
- Namespaces resolve: `just --list inkwell adw sbx obs local` (each lists).
- App suite green: `just inkwell test` (30 tests — this exits, it does not serve).
- sbx preflight (only if `OPENROUTER_PROVISIONING_KEY` is set and `ssh exe.dev` is reachable): `just sbx manage doctor` — the six-check host preflight, ends with `sbx doctor: OK`. If the key is blank, mark this `skipped (mount-only)`, not failed.

### Step 6 — Report

Print a status table with `ok` / `warn` / `skip` / `fail` for every check above, then a ready count, then next steps as copy-pasteable commands:

```bash
claude                 # then /prime to orient on all three tiers
just inkwell run       # boot the app on :4501
just inkwell test      # the 30-test suite the factory runs
just sbx manage doctor # host preflight (needs the provisioning key)
just sbx mount my-task # stand up a throwaway VM -> running factory (billable; your call)
```

State plainly whether the setup is ready to **run the loop** (all mount prerequisites present) or ready to **read and observe** only (core toolchain present, mount credentials absent).
