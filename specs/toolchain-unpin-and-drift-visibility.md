---
plan: toolchain-unpin-and-drift-visibility
created: 2026-08-30T10:06:08-07:00
modified:
  - 2026-08-30T10:06:08-07:00
commits:
  - 0f90d24
agents:
  - claude-fable-5
sessions:
  - cc-interactive-20260830
back_refs:
  - specs/payload-app-manifest.md — observe's per-app boot command reads `app.dir`/`app.name` from the manifest; the proxy's upstream contract is what `just app swap` must preserve
forward_refs: []
status: building
---

# Plan: Unpin bun, and make toolchain drift visible instead of frozen

## Purpose

Remove the `BUN_VERSION="1.3.14"` pin from `provision.sh` without re-exposing the mount to the
failure that forced it, by moving the sandbox's serving layer off the one bun surface that has a
network *policy* (the HTML dev server) and onto surfaces that only have *configuration*. Then
replace "pin and forget" with "float, record the baseline, report drift at the gate" for the whole
toolchain — so a version move shows up as a line in the gate output and the run record on the day
it happens, instead of as a mystery 403 three phases later or as a pin nobody has raised in a year.

## Problem

NEXTSTEPS `Session (2026-08-21b)` left this open. The pin fixed the day; the class is untouched:

- **The pin is debt with a date on it.** 1.3.14 is already superseded (1.4.0, 2026-08-20). Every
  mount runs a bun that receives no fixes, and nothing in the repo will ever tell anyone that. The
  only signal that the pin is stale is a future breakage that forces a bump — the precise
  "invisible over time" failure mode this plan exists to kill.
- **The rest of the toolchain is still unpinned and unobserved.** `just` is pulled from a CDN at
  latest; `uv`, `pi`, `claude`, `python` arrive in the exeuntu image at whatever version the image
  carries that day. None of their versions are recorded anywhere a post-mortem can find them. The
  2026-08-21 fan-out burned an afternoon establishing *which* tool moved.
- **The August diagnosis was half wrong, and the wrong half is what makes unpinning look scary.**
  Re-tested this session against real 1.4.0 and 1.3.14 binaries (installed into the scratchpad,
  never the system) with the actual fretboard app:

  | August belief | Measured 2026-08-30 |
  |---|---|
  | "`--host` is not a flag (bun reads the value as a filename)" | `--host=<STR>` / `--hostname=<STR>` **exist** in 1.4.0's HTML wrapper — equals-form only. `--host 0.0.0.0` (space) is parsed as a second HTML file. `--host=0.0.0.0` binds `*:PORT`. |
  | "Neither behaviour is configurable" | The **bind** is configurable. The **Host check** is not — it is a DNS-rebinding guard in `src/runtime/bake/DevServer.rs` (`is_allowed_host_header`) that allows `localhost`, `*.localhost`, any IP literal, and the configured hostname. `<vm>.exe.xyz` fails it under every flag combination. No `allowedHosts` knob in 1.4.0 and none on `main` today. |
  | "A `Bun.serve` wrapper is version-independent" (the reverted `serve_app.ts`) | Only with `development: false`. The reverted file ran in the default dev mode, which routes through the same `DevServer` guard — it 403s on 1.4.0 too. It was reverted for the wrong reason and would have failed for a different one. |
  | "1.3.14 binds 0.0.0.0" (observe.just comment) | 1.3.14 binds `localhost` too (`[::1]` on macOS). The exe.dev proxy reaches loopback fine; the Host check was always the only wall. |

  The bind fix alone is therefore worthless, and any serving layer that goes through bun's dev
  server will be subject to whatever policy bun's security team adds next.

## Solution

Three moves, in dependency order. Each phase is independently useful and independently
revertible; the plan stops making sense only if Phase 1 is skipped.

**1. Serve through a Host-rewriting loopback proxy (`sandbox_mount/guest/app_proxy.ts`).** The
dev server keeps running exactly as today — `bun index.html`, default bind, live rebundle — but on
an internal loopback port. A ~25-line `Bun.serve` on `0.0.0.0:4501` forwards every request to it
with `Host: localhost:<upstream>`. This satisfies the guard by the one rule it can never remove
(`localhost` is always allowed — that is the guard's *purpose*), keeps the dev server's rebuild-on-
request semantics that the "watch the agent build" URL depends on, and is app-agnostic: an app
swap to a `server.ts`-style app just changes the upstream. Verified this session on both 1.3.14 and
1.4.0: `200` with `Host: vm-abc.exe.xyz`, bundle chunks served, an edit to `index.html` visible on
the next request without restart.

Rejected alternatives are in Notes. The short version: `development: false` works but freezes the
bundle at boot (observe leaves a listening port alone, so the public URL would show the pre-ADW app
for the whole run); `--host=<vm>.exe.xyz` would need the VM's own public name to resolve to a local
interface; and staying pinned is the debt.

**2. Unpin bun behind a declared baseline (`sandbox_mount/guest/toolchain.lock`).** One line per
tool: name, known-good version, mode (`pin` / `float` / `image`). `provision.sh` reads the file
instead of a hardcoded variable. bun goes to `float`: fresh VMs get latest, provision asserts what
it *requested* (a pin still fails hard on mismatch; a float records what it got), and a
`BUN_VERSION=x.y.z` env override forwarded by `setup.just` is the one-mount escape hatch if a
release is bad on a fan-out day.

**3. Make drift a first-class gate output.** A sixth gate assertion, **F — toolchain report**,
runs `toolchain_report.sh` on the box: table of `tool · baseline · actual · status`, JSON into the
run record (`toolchain` field), exit non-zero only for a `pin` mismatch. Covers the golden-VM path
(which never runs an install step) because it inspects binaries at gate time. The bump ritual
becomes mechanical: gate F says `DRIFT bun 1.3.14 → 1.4.1`, observe passes `[6/6]`, you copy the
reported version into `toolchain.lock` in a commit that names the run id. The baseline is the newest
version that has *proven* itself, not the newest version that exists — a ratchet, not a freeze.

## Relevant Files

### Existing — modified
- `just/sandbox/lifecycle/observe.just` — `[2/6]` boots the dev server on the internal port, then the proxy on `$APP_PORT`; both idempotent via the existing `listening()`; fix the stale "bun binds 0.0.0.0 by default" comment
- `sandbox_mount/guest/provision.sh` — step 2 reads `toolchain.lock`; honours `BUN_VERSION` override; step 3 (`just`) gains the same treatment; step 9 summary delegates to `toolchain_report.sh`; the 30-line 1.4.0 comment shrinks to a pointer at this plan + NEXTSTEPS
- `just/sandbox/lifecycle/setup.just` — forwards `BUN_VERSION` over ssh; adds gate assertion F; records `toolchain` into the run record; header comment "five-assertion" → six
- `sandbox_mount/host/run_record.py` — add `toolchain` to `FIELDS` with `"json"` coercion (unknown keys are rejected today, so this is required, not optional)
- `PLAYBOOK.md` — a "Toolchain baseline" subsection: the three modes, the escape hatch, the bump ritual
- `NEXTSTEPS.md` — close the 2026-08-21b thread with the corrected diagnosis and a pointer here

### Existing — deleted
- *(none — the reverted `serve_app.ts` is already gone; do not resurrect it)*

### New
- `sandbox_mount/guest/app_proxy.ts` — the Host-rewriting loopback proxy (code in Notes)
- `sandbox_mount/guest/app_proxy_selftest.sh` — runs dev server + proxy against a given bun binary and the app dir, curls with a foreign `Host`, exits non-zero on anything but 200/200; this is how the proxy is proven against any bun version without a VM
- `sandbox_mount/guest/toolchain.lock` — the baseline file (format in Notes)
- `sandbox_mount/guest/toolchain_report.sh` — reads the lock, prints the table, `--json` for the run record, exit 1 only on a `pin` mismatch; shared by provision step 9 and gate F

## Implementation Phases

Status markers: `- [ ]` idle · ``- [ ] `wip` `` in progress · `- [x]` complete · ``- [ ] `fail` `` failed (with reason).

All work on a branch (`toolchain-unpin`), verified on a real box before merge. The August process
note stands: framework changes to the serving layer do not go straight to `main`.

### Phase 1: Serving layer independent of dev-server policy

Pin stays at 1.3.14 throughout this phase. The only behavioural change is *how* :4501 is served;
proving that on the known-good bun isolates the proxy from the unpin.

#### 1. Write the proxy and its self-test

- [x] `git switch -c toolchain-unpin`
- [x] Create `sandbox_mount/guest/app_proxy.ts` per the code in Notes — upstream host is `localhost`, **not** `127.0.0.1` (the dev server binds `localhost`, which is `[::1]` on some stacks; the prototype's first run failed exactly here)
- [x] Create `sandbox_mount/guest/app_proxy_selftest.sh <bun-binary> <app-dir>` per Notes; make it executable
- [x] Run the self-test against the host's bun and against a 1.4.0 installed into `$TMPDIR` via `BUN_INSTALL=$TMPDIR/bun140 bash -s bun-v1.4.0` — both must pass before touching observe

#### 2. Wire observe

- [x] In `observe.just`, add `APP_UPSTREAM_PORT=4502` beside `APP_PORT`; `[2/6]` becomes: start `bun index.html` with `PORT=$APP_UPSTREAM_PORT` (unchanged command otherwise), `wait_listen $APP_UPSTREAM_PORT`, then start `PORT=$APP_PORT UPSTREAM=$APP_UPSTREAM_PORT bun $HOME/app/sandbox_mount/guest/app_proxy.ts` with the same nohup/redirect/`< /dev/null` triple, `wait_listen $APP_PORT`
- [x] Both starts stay guarded by `listening()` so a re-run reports "already listening" per port and never stacks a second process
- [x] Log files: keep `~/${APP_NAME}-app.log` for the dev server; add `~/${APP_NAME}-proxy.log`; the failure branch tails whichever port failed
- [x] Replace the `listening()` comment ("bun binds 0.0.0.0 by default…") with the truth: the dev server is loopback-only *by design* now, the proxy is the wildcard bind, and the `:PORT$` suffix match works for both
- [x] Extend the per-app boot comment: an app swap that ships its own server sets `APP_UPSTREAM_PORT` to wherever that server listens and leaves the proxy alone

#### 3. Prove it on a box, pinned

- [x] `just sbx mount proxy-check` (still bun 1.3.14) — must end at observe `[6/6]` with `app 200 anonymous`
- [x] `ssh <vm> 'ss -ltn'` shows `:4502` on a loopback address and `*:4501`
- [x] Open `https://<vm>.exe.xyz/` in a browser; the fretboard renders (bundle chunks served through the proxy, not just the HTML)
- [x] `just sbx lifecycle observe <id>` a second time reports "already listening" for both ports
- [x] `just sbx lifecycle teardown <id>`

#### Validation — Phase 1

> **Loop gate.** Do not start Phase 2 until every box below is `[x]`, or is `fail`-marked with a reason.

- [x] `bash sandbox_mount/guest/app_proxy_selftest.sh "$(command -v bun)" apps/fretboard` — proxy passes a foreign Host on the host's bun
- [x] `BUN_INSTALL=$TMPDIR/bun140 bash -c 'curl -fsSL https://bun.sh/install | bash -s bun-v1.4.0' >/dev/null && bash sandbox_mount/guest/app_proxy_selftest.sh $TMPDIR/bun140/bin/bun apps/fretboard` — proxy passes on the exact version that broke the fan-out
- [x] `just sbx mount proxy-check 2>&1 | grep -E '\[6/6\]|app +200 anonymous'` — a real box on the pinned bun serves publicly through the proxy
- [x] `git diff main -- apps/` is empty — nothing in the payload app changed; serving is the sandbox's concern

### Phase 2: Unpin bun behind a declared baseline

#### 1. The lock file and the reader

- [x] Create `sandbox_mount/guest/toolchain.lock` per Notes, seeded `bun 1.3.14 float`, `just 1.46.0 float`, and `image` rows for `uv`, `pi`, `claude`, `python` with version `unknown` (gate F treats `unknown` as record-only until the first mount fills it in)
- [x] In `provision.sh`, replace `BUN_VERSION="1.3.14"` with a read of the lock: `want=$(awk '$1=="bun"{print $2}' …)`, `mode=$(awk '$1=="bun"{print $3}' …)`; `${BUN_VERSION:-}` from the environment overrides both (forces `pin` at that version)
- [x] `pin` mode keeps today's behaviour byte-for-byte (version-aware replace + post-install assertion). `float` mode: install latest only if bun is absent; never downgrade or upgrade an existing binary (a golden-copied VM keeps its bun and gate F reports it); assert only that *something* runnable landed
- [x] Apply the same reader to step 3 (`just`): the installer supports `--tag <version>` for `pin`; `float` is the current behaviour
- [x] Shrink the 1.4.0 comment block to ~6 lines: what happened, that the serving layer no longer depends on it, and `see specs/toolchain-unpin-and-drift-visibility.md`. Delete the sentence claiming `--host` is not a flag — it is false

#### 2. The escape hatch

- [x] `setup.just`: `"${SSH[@]}" "BUN_VERSION='${BUN_VERSION:-}' bash app/sandbox_mount/guest/provision.sh"` — an empty value must be a no-op, a set value must reach the guest
- [x] Document the invocation in the recipe's header comment: `BUN_VERSION=1.3.14 just sbx mount <id>` pins one mount without a commit

#### 3. Prove float on a box

- [ ] `wip` `just sbx mount unpin-check` — provision prints `bun 1.4.x (float, baseline 1.3.14)`; observe `[6/6]` `app 200 anonymous`
- [ ] On the same box: `BUN_VERSION=1.3.14 just sbx lifecycle setup <id>` replaces bun with 1.3.14 (the version-aware replace path), then `just sbx lifecycle observe <id>` still passes — the escape hatch and the pin path both work
- [ ] Teardown

#### Validation — Phase 2

> **Loop gate.** Do not start Phase 3 until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] `! grep -q 'BUN_VERSION="1' sandbox_mount/guest/provision.sh` — the hardcoded pin is gone
- [ ] `! grep -q 'not a flag' sandbox_mount/guest/provision.sh` — the false claim is gone
- [ ] `awk '$1=="bun"{print $3}' sandbox_mount/guest/toolchain.lock` prints `float`
- [ ] `just sbx mount unpin-check 2>&1 | grep -E 'bun 1\.[4-9]|\[6/6\]|app +200 anonymous'` — a floating bun newer than the old pin serves publicly
- [ ] `bash -n sandbox_mount/guest/provision.sh` — still parses

### Phase 3: Drift visibility for the whole toolchain

#### 1. The report script

- [ ] Create `sandbox_mount/guest/toolchain_report.sh`: for each lock row, resolve the actual version (`bun --version`, `just --version | awk '{print $2}'`, `uv --version | awk '{print $2}'`, `pi --version`, `claude --version | awk '{print $1}'`, `python3 --version | awk '{print $2}'`), print `tool  baseline  actual  status` where status ∈ `ok` / `DRIFT` / `MISSING` / `record` (baseline `unknown`), `--json` emits `{"bun":"1.4.0",…}`, exit 1 only when a `pin` row's actual ≠ baseline
- [ ] `provision.sh` step 9 calls it in place of the six `say "<tool> $(…)"` lines — one source of truth for "what is on this box"

#### 2. Gate F and the run record

- [ ] `run_record.py`: append `"toolchain"` to `FIELDS`, `"toolchain": "json"` to `_COERCE`
- [ ] `setup.just`: after E, `echo "[gate] F toolchain report"`, run `toolchain_report.sh` over ssh (table to the terminal), then `--json` captured and stored via `"$RR" set {{RUN_ID}} "toolchain=<json>"`; `gate_fail "assertion F — pinned tool mismatch"` on non-zero; DRIFT lines never fail the gate by themselves
- [ ] Update the "five-assertion" wording (header comment, `3/3 health gate (5 assertions)`) to six
- [ ] Seed the `image` rows in `toolchain.lock` from the first gate-F output of a real mount, in the same commit as the mount's run id

#### Validation — Phase 3

> **Loop gate.** Do not start Phase 4 until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] `just sbx mount drift-check 2>&1 | grep -A8 '\[gate\] F'` — the table prints with one row per lock entry and no `MISSING`
- [ ] `sandbox_mount/host/run_record.py show <id> | python3 -c 'import json,sys; r=json.load(sys.stdin); assert r["toolchain"]["bun"]'` — the versions landed in the record
- [ ] `sed -i.bak 's/^bun .* float$/bun 0.0.1 pin/' sandbox_mount/guest/toolchain.lock && ssh <vm> 'bash app/sandbox_mount/guest/toolchain_report.sh'; echo "exit $?"; mv sandbox_mount/guest/toolchain.lock.bak sandbox_mount/guest/toolchain.lock` — a `pin` mismatch exits 1 (copy the edited lock to the box first; FILL clones from the remote, so a local edit does not travel on its own)
- [ ] `! grep -q 'unknown' sandbox_mount/guest/toolchain.lock` — every image row is seeded

### Phase 4: Bump ritual, docs, and closing the thread

#### 1. Documentation

- [ ] `PLAYBOOK.md`: add "Toolchain baseline" — the lock format, the three modes and which tools sit in which, `BUN_VERSION=` for a one-mount pin, and the ritual: *gate F reports DRIFT → observe `[6/6]` passes → edit the lock to the reported version → commit with the run id in the message*. Explicitly: the baseline is the newest version that has passed observe, never the newest that exists
- [ ] `NEXTSTEPS.md`: a session entry under the existing 2026-08-21b one that records the corrected diagnosis (the four-row table above), what shipped, and that the five-arm fan-out is unblocked
- [ ] `observe.just` and `provision.sh` no longer contain any statement about bun's bind address that is not true of both 1.3.14 and 1.4.0

#### 2. Merge

- [ ] PR from `toolchain-unpin` to `main`; merge only after Phases 1–3 boxes are all `[x]`
- [ ] Update this plan's `status` and `commits`

#### Validation — Phase 4

> **Loop gate.** The plan is not complete until every box below is `[x]`, or is `fail`-marked with a reason.

- [ ] `grep -n 'Toolchain baseline' PLAYBOOK.md` — the section exists
- [ ] `grep -n 'toolchain-unpin-and-drift-visibility' NEXTSTEPS.md` — the thread points here
- [ ] `git log --oneline main | head -5` shows the merge; `git branch --merged main | grep toolchain-unpin`

## Global Validation

- [ ] Two consecutive `just sbx mount` runs on different days both pass `[6/6]` with a floating bun and print gate F — the system runs unpinned and says what it ran on
- [ ] `git log -S'BUN_VERSION="1.3.14"' --oneline -- sandbox_mount/guest/provision.sh | head -1` names only the historical pin commit (`5d0de55`) and its removal — no re-pin crept back
- [ ] Re-run the blocked experiment: the five-roster fan-out on `prompts/10-circle-of-fifths-wheel.md`. Every arm reaches an ADW launch. (This is the item the 2026-08-21b session was trying to do; it is the real close.)

## Notes

### The Host-check rule, verbatim from bun 1.4.0 `src/runtime/bake/DevServer.rs`

```
/// DNS-rebinding guard for `/_bun/...` internal routes and the Chrome
/// DevTools `/.well-known/...` route. A rebound origin
/// (`attacker.com` → 127.0.0.1) presents `Host: attacker.com`; rejecting
/// non-loopback / non-IP / non-configured hostnames prevents the attacker's
/// page from reading bundled source via same-origin fetch.
```

`is_allowed_host_header` accepts, in order: `localhost` (case-insensitive), any `*.localhost`,
any IPv4/IPv6 literal (bracketed or not), and the configured `--host=` hostname. Everything else
→ `403 Blocked: Host header does not match the dev server`. A separate `is_allowed_dev_origin`
applies the same rule to the `Origin` header when present (browsers send it on WebSocket, POST,
CORS — not on a plain GET navigation).

Measured matrix on 1.4.0 with `--host=0.0.0.0`:

| `Host:` | result |
|---|---|
| `localhost`, `localhost:4599`, `*.localhost` | 200 |
| `127.0.0.1:4599`, `0.0.0.0`, `192.168.1.50:4599` | 200 |
| `vm-abc.exe.xyz`, `vm-abc.exe.xyz:4599`, `example.com` | 403 |
| `Host: vm-abc.exe.xyz` + `X-Forwarded-Host: localhost` | 403 (not consulted) |

The proxy works because it changes the one thing the guard reads. The guard is *correct* for its
purpose; the sandbox is simply not the threat model it was written for.

### Options for the serving layer

| | Version-independent? | Live rebundle? | Cost | Verdict |
|---|---|---|---|---|
| **Loopback proxy, Host rewritten** | Yes — relies only on `localhost` being allowed, the guard's own invariant | Yes (verified: edit visible next request, both versions) | 1 file, ~25 lines, one extra process | **Chosen** |
| `Bun.serve({development:false, routes})` | Yes (verified 200 on 1.4.0) | **No** — bundle fixed at boot; observe leaves a live port alone, so the public URL shows the pre-ADW app all run | 1 file, ~15 lines | Fallback if the dev server ever refuses loopback too |
| `--host=<vm>.exe.xyz` | No — needs that name to resolve to a local interface on the VM; also silently sets the *bind* to it | Yes | 0 files | Rejected |
| `bun index.html --host=0.0.0.0` alone | No — fixes the bind, not the check | Yes | 0 files | Rejected; this is the August `--host` attempt done right, and it still 403s |
| Stay pinned | — | Yes | 0 files | The debt |
| Upstream `allowedHosts` | Would be | Yes | An issue on oven-sh/bun | Worth filing; not on `main` as of 2026-08-30. Do not wait for it |

### `app_proxy.ts`

```ts
// sandbox_mount/guest/app_proxy.ts — public :PORT -> the app's dev server on loopback.
//
// bun's HTML dev server carries a DNS-rebinding guard (DevServer.rs,
// is_allowed_host_header) that 403s any Host that is not localhost, *.localhost,
// an IP literal, or its configured hostname. The exe.dev proxy arrives as
// <vm>.exe.xyz. Rewriting Host to localhost satisfies the guard by the one rule
// it exists to enforce, so this survives dev-server policy changes that a flag
// would not. The dev server keeps its default loopback bind and its live
// rebundling; this file is the only wildcard bind on the box.
//
// App-agnostic: UPSTREAM is wherever the current app listens. A swap to an app
// with its own server changes the port, not this file.
//
// Usage (from observe.just): PORT=4501 UPSTREAM=4502 bun app_proxy.ts
const PORT = Number(process.env.PORT ?? 4501);
const UPSTREAM = Number(process.env.UPSTREAM ?? 4502);

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    url.protocol = "http:";
    url.hostname = "localhost";   // NOT 127.0.0.1 — the dev server binds `localhost`, which may be [::1]
    url.port = String(UPSTREAM);
    const headers = new Headers(req.headers);
    headers.set("host", `localhost:${UPSTREAM}`);
    headers.delete("origin");     // the guard checks Origin too when present
    return fetch(url, { method: req.method, headers, body: req.body, redirect: "manual" });
  },
});
console.log(`app_proxy: 0.0.0.0:${server.port} -> localhost:${UPSTREAM} (Host rewritten)`);
```

Known limitation: WebSocket upgrades are not proxied, so the dev server's HMR socket
(`/_bun/hmr`) does not connect through the public URL. Rebundling still happens on the next
request (verified), which is what the observe URL needs; a browser reload shows the new build. If
HMR through the proxy is ever wanted, `Bun.serve` has a `websocket` handler — out of scope.

### `app_proxy_selftest.sh`

```bash
#!/usr/bin/env bash
# usage: app_proxy_selftest.sh <bun-binary> <app-dir>
# Boots the app's dev server on loopback and app_proxy.ts in front of it, then
# asks for / and the first bundle chunk with a foreign Host header. Exit 0 only
# on 200/200. Run it against any bun binary to prove the proxy on that version.
set -euo pipefail
BUN="$1"; APP="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"
UP=4702; PUB=4701; T="$(mktemp -d)"
( cd "$APP" && PORT=$UP nohup "$BUN" index.html >"$T/dev.log" 2>&1 </dev/null & echo $! >"$T/dev.pid" )
( PORT=$PUB UPSTREAM=$UP nohup "$BUN" "$HERE/app_proxy.ts" >"$T/proxy.log" 2>&1 </dev/null & echo $! >"$T/proxy.pid" )
trap 'kill $(cat "$T"/*.pid) 2>/dev/null || true; rm -rf "$T"' EXIT
sleep 3
H='Host: vm-abc.exe.xyz'
code=$(curl -s -o /dev/null -w '%{http_code}' -H "$H" "http://127.0.0.1:$PUB/")
js=$(curl -s -H "$H" "http://127.0.0.1:$PUB/" | grep -o -E 'src="[^"]+\.js"' | head -1 | sed 's/src="//;s/"//')
jscode=$(curl -s -o /dev/null -w '%{http_code}' -H "$H" "http://127.0.0.1:$PUB$js")
echo "bun $("$BUN" --version): / -> $code   $js -> $jscode"
[ "$code" = 200 ] && [ "$jscode" = 200 ]
```

### `toolchain.lock`

```
# sandbox_mount/guest/toolchain.lock — the known-good toolchain baseline.
# <tool> <version> <mode>
#   pin    provision installs exactly this; gate F fails on mismatch
#   float  provision installs latest if absent; gate F reports drift, never fails
#   image  supplied by exeuntu; nothing installs it; gate F reports drift
# Bump ritual: gate F says DRIFT, observe passes [6/6], edit the row, commit with the run id.
bun     1.3.14   float
just    1.46.0   float
uv      unknown  image
pi      unknown  image
claude  unknown  image
python  unknown  image
```

Whitespace-separated so `awk '$1=="bun"{print $2,$3}'` reads it from bash with no parser. Comment
lines start with `#`. `unknown` means record-only.

### Why float, not a floor or a range

A floor (`>=1.3.14`) is what float already gives on a fresh VM. A range would need a comparator
and a policy for what "too new" means, and the whole point is that we cannot know a release is bad
until a mount runs on it. The mitigations for "a bad release lands on a fan-out day" are: (1) the
serving layer no longer touches the moving part; (2) gate F names the exact version that moved,
in the first thirty seconds; (3) `BUN_VERSION=` re-pins one mount without a commit; (4) the app's
own test suite runs under the new bun in every ADW test phase anyway.

### Why float mode never upgrades an existing binary

A golden-copied VM carries whatever bun it was built with. Silently upgrading it would make the
golden path *less* reproducible than a fresh mount, which inverts its purpose. Recording the drift
instead keeps the golden VM's age visible on every gate, which is the actual problem with golden
VMs the August session named (Q4).

### Host / guest skew — deferred

The host runs bun **1.3.0** and just 1.46.0; the guest ran 1.3.14 pinned and will float. The same
justfiles and the same app test suite run on both. This plan makes the guest's versions visible;
it does not assert the host's. A `just sbx manage doctor` line comparing the host's versions to
`toolchain.lock` is a five-line follow-up once the lock exists.

### Also deferred

- A `bun` column in `runs_table.py` — once several runs carry `toolchain`, the table is where
  a cross-run "which version was that on" answer belongs. Cheap; not needed to unblock.
- A `just sbx manage toolchain-accept <run-id>` recipe that rewrites the lock from a run record.
  The manual edit is one line and the commit message carries the run id; automate when the ritual
  has been done by hand enough times to know its shape.
- Filing `allowedHosts` for `bun index.html` upstream. The proxy makes it unnecessary here, but it
  is the right knob for anyone behind a reverse proxy and would let the proxy be deleted later.

### Process note carried forward

The 2a66038 → 16fc798 revert cycle happened because a serving-layer rewrite hit `main` before a
box had seen it. Every on-box task in this plan is on the `toolchain-unpin` branch, and FILL
clones from the *remote* — so the branch has to be pushed for a mount to exercise it. `just sbx
mount` passes its flags to `create` only (which accepts just `--limit`), so an on-branch mount is
the four lifecycle steps by hand, with the branch name as `fill`'s pin (it resolves "a short sha,
a tag or a branch" on the clone):

```bash
git push -u origin toolchain-unpin
just sbx lifecycle create proxy-check
ID=$(sandbox_mount/host/run_record.py list | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["run_id"])')
just sbx lifecycle fill "$ID" toolchain-unpin
just sbx lifecycle setup "$ID"
just sbx lifecycle observe "$ID"
```

Every `just sbx mount <name>` in the phase checklists above means this sequence until the branch
is merged.

## Amendments

<details>
<summary>— no amendments yet</summary>

Post-execution changes are appended here, newest at the bottom, by the `update` and `sync` workflows.
</details>
