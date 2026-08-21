# ─── just/sandbox/observe.just — PHASE 5 · OBSERVE ────────────────────────────
# Make a mounted sandbox watchable from outside without reaching in: start the
# app (4501) and the trace UI (4600), retarget the HTTPS proxy, print URLs.
#
# IMPORTED by the root justfile, not a module: no `set` lines here (the root
# already owns `set dotenv-load` / `set positional-arguments`, and a duplicate
# setting is a hard error), and the root's variable scope is shared.
#
# HOST-ONLY in practice: this phase touches the exe.dev control plane, which a
# sandbox has no credential for. It needs NO
# secrets at all — no OpenRouter key of either kind is read or forwarded here.
#
# NEVER destroys the VM. Every failure below reports and exits non-zero with the
# box still up, because the evidence you need lives on it. `just sbx lifecycle teardown` stays
# an explicit, separate decision.

# Phase 5 · start both servers if down, expose 4501 anonymously, print the URLs
observe RUN_ID:
    #!/usr/bin/env bash
    set -euo pipefail

    RR="sandbox_mount/host/run_record.py"

    # The run record is the ONLY state shared across the six phases; nothing
    # else survives between them.
    VM=$("$RR" get {{RUN_ID}} vm_name)
    if [ -z "$VM" ]; then
        echo "observe: run record {{RUN_ID}} has no vm_name — run 'just sbx lifecycle create' first" >&2
        exit 1
    fi
    HOST="$VM.exe.xyz"

    APP_PORT=4501
    OBS_PORT=4600
    # The clone target is `app` relative to the exedev user's home, so this is
    # /home/exedev/app on a stock exeuntu VM. Expanded on the VM, not here.
    APP_DIR='$HOME/app/apps/fretboard'
    OBS_DIR='$HOME/app/.claude/skills/sssf/apps/visualizer'
    OBS_DB='$HOME/app/adws/adw_data/sssf.db'

    echo "── observe {{RUN_ID}} · vm $VM ──────────────────────────────"

    # ── 0. reachability ──────────────────────────────────────────────────────
    # Proven up front so that every `ss` probe below can read a non-zero exit as
    # "not listening" rather than "ssh is broken". All *.exe.xyz share one host
    # key and a wildcard known_hosts entry is already installed, so this is
    # non-interactive.
    if ! ssh "$HOST" 'true' >/dev/null 2>&1; then
        echo "observe: cannot ssh $HOST — VM left up for debugging" >&2
        exit 1
    fi
    echo "[1/6] ssh ok — $HOST"

    # `ss -ltn` column 4 is Local Address:Port. The proxy cannot reach a
    # 127.0.0.1 bind, so this is a REACHABILITY check, not just a liveness one:
    # only *:PORT and 0.0.0.0:PORT count as listening.
    #
    # MEASURED: `bun index.html` (Bun's HTML dev server) binds 127.0.0.1 in the
    # bun shipped by the exeuntu image, NOT 0.0.0.0 as an earlier comment here
    # assumed. A plain ":$1$" suffix match accepted that loopback bind, so all
    # five arms of a fan-out passed [2/6] and then died at [6/6] on an anonymous
    # 403 — the app was up, healthy, and answering 200 on localhost, unreachable
    # from outside. Matching on the bind address turns that into a failure at
    # the step that can still fix it. The app is now started via serve_app.ts,
    # which binds 0.0.0.0 (see below), so this check should pass on the first
    # probe; it stays strict because a silent regression to loopback is exactly
    # the failure it was written for.
    listening() {
        ssh "$HOST" 'ss -ltn' 2>/dev/null | awk '{print $4}' \
            | grep -Eq "^(\*|0\.0\.0\.0|\[::\]):$1\$"
    }

    # Poll rather than sleep-a-guess: bun is up in well under a second warm, but
    # a cold first read of dist/ is slower.
    wait_listen() {
        local port="$1" tries=0
        until listening "$port"; do
            tries=$((tries + 1))
            [ "$tries" -ge 20 ] && return 1
            sleep 1
        done
        return 0
    }

    # ── 1. app on 4501 ────────────────────────────────────────────────────────
    # Idempotent: observe is safe to re-run, and `just sbx mount` ends here, so a
    # second call must not stack a second bun on the same port.
    #
    # NOT `bun index.html`. That starts Bun's HTML dev server, which binds
    # 127.0.0.1 AND enforces a Host-header check — behind the exe.dev proxy that
    # is a 403 either way, and neither behaviour is configurable (--host is not
    # a flag in that mode, BUN_HOSTNAME and bunfig are ignored, and bridging the
    # loopback bind with socat just exposes the Host check underneath). All of
    # that was measured on a live box.
    #
    # sandbox_mount/guest/serve_app.ts wraps the same HTML entry in a plain
    # Bun.serve, which binds 0.0.0.0 and does no Host checking, while still
    # bundling main.ts via the HTML import. Same shape the visualizer uses on
    # :4600 — the one app that was reachable through the proxy all along.
    #
    # APP_HTML is absolute and expanded ON THE VM, so it is single-quoted here.
    echo "[2/6] app  :$APP_PORT"
    if listening "$APP_PORT"; then
        echo "       already listening — leaving it alone"
    else
        # All three detachment pieces are REQUIRED or ssh never returns: nohup
        # (survive session end), the redirect (release stdout/stderr), and
        # < /dev/null (release stdin). Dropping any one hangs this recipe.
        ssh "$HOST" "cd $APP_DIR && ( nohup env PORT=$APP_PORT APP_HTML=$APP_DIR/index.html bun \$HOME/app/sandbox_mount/guest/serve_app.ts > \$HOME/fretboard-app.log 2>&1 < /dev/null & echo \$! )" \
            | sed 's/^/       started pid /'
        if ! wait_listen "$APP_PORT"; then
            echo "observe: fretboard never bound 0.0.0.0:$APP_PORT — tail of ~/fretboard-app.log:" >&2
            echo "observe: (a 127.0.0.1 bind counts as NOT listening here — the proxy cannot reach it)" >&2
            ssh "$HOST" 'tail -n 40 $HOME/fretboard-app.log' >&2 || true
            exit 1
        fi
        echo "       up"
    fi

    # ── 2. visualizer on 4600 ────────────────────────────────────────────────
    # VERIFIED in the plan: the visualizer EXITS when sssf.db is missing. Check
    # for the db before spending a start attempt, so the error names the real
    # cause instead of showing an empty port.
    echo "[3/6] obs  :$OBS_PORT"
    if ! ssh "$HOST" "test -f $OBS_DB"; then
        echo "observe: $OBS_DB is missing on $VM." >&2
        echo "         The visualizer exits immediately without it. That db is created by" >&2
        echo "         sandbox_mount/guest/provision.sh (step 8, 'trace db') — re-run SETUP:" >&2
        echo "           just sbx lifecycle setup {{RUN_ID}}" >&2
        exit 1
    fi
    if listening "$OBS_PORT"; then
        echo "       already listening — leaving it alone"
    else
        # SSSF_DB goes BEFORE nohup, not after: `nohup VAR=x cmd` makes nohup
        # try to exec a program literally named "VAR=x". As a prefix on nohup
        # the assignment lands in its environment and bun inherits it.
        # The db path is passed explicitly because it resolves against the
        # server's cwd, and the server runs from the visualizer app dir.
        ssh "$HOST" "cd $OBS_DIR && ( SSSF_DB=$OBS_DB nohup bun run server/index.ts > \$HOME/visualizer.log 2>&1 < /dev/null & echo \$! )" \
            | sed 's/^/       started pid /'
        if ! wait_listen "$OBS_PORT"; then
            echo "observe: visualizer never bound :$OBS_PORT — tail of ~/visualizer.log:" >&2
            ssh "$HOST" 'tail -n 40 $HOME/visualizer.log' >&2 || true
            echo "         If it says 'sssf.db not found', SETUP did not initialize the trace db:" >&2
            echo "           sandbox_mount/guest/provision.sh  ->  just sbx lifecycle setup {{RUN_ID}}" >&2
            exit 1
        fi
        echo "       up"
    fi

    # ── 3. proxy ─────────────────────────────────────────────────────────────
    # MANDATORY. A fresh exeuntu VM proxies port 8000 (smallest EXPOSEd port
    # >= 1024); without this retarget https://$HOST/ hits nothing. set-public
    # applies to the primary port only — see the note printed at the end.
    echo "[4/6] proxy -> :$APP_PORT, public"
    ssh exe.dev share port "$VM" "$APP_PORT"
    ssh exe.dev share set-public "$VM"

    # ── 4. record ────────────────────────────────────────────────────────────
    echo "[5/6] recording ports"
    "$RR" set {{RUN_ID}} "ports={\"app\":$APP_PORT,\"obs\":$OBS_PORT}"

    # ── 5. verify ────────────────────────────────────────────────────────────
    # curl with no auth of any kind — that is the whole point of the app check.
    # No -L: a redirect is a result here, not something to follow.
    echo "[6/6] verifying"
    code_of() {
        curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1" || echo 000
    }

    # The public flag can lag the API call by a beat; retry before failing.
    APP_CODE=000
    for _ in 1 2 3 4 5 6; do
        APP_CODE=$(code_of "https://$HOST/")
        [ "$APP_CODE" = "200" ] && break
        sleep 2
    done
    if [ "$APP_CODE" != "200" ]; then
        echo "observe: app returned $APP_CODE anonymously at https://$HOST/ (want 200)" >&2
        echo "         VM left up. Check: ssh exe.dev share show $VM" >&2
        exit 1
    fi
    echo "       app  200 anonymous"

    # 307/401 anonymously is CORRECT for the obs port: alternate ports stay
    # auth-gated to users with VM access. Only a dead proxy (000) or a 5xx is a
    # real failure; anything else means the port is reachable and gated.
    OBS_CODE=$(code_of "https://$HOST:$OBS_PORT/")
    if [ "$OBS_CODE" = "000" ] || [ "$OBS_CODE" -ge 500 ]; then
        echo "observe: obs port unreachable at https://$HOST:$OBS_PORT/ (got $OBS_CODE)" >&2
        exit 1
    fi
    echo "       obs  $OBS_CODE anonymous — expected, it is owner-gated"

    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo "  app  https://$HOST/"
    echo "  obs  https://$HOST:$OBS_PORT/"
    echo "════════════════════════════════════════════════════════════"
    echo "  The obs URL opens fine in a browser already signed in to exe.dev."
    echo "  Ports 3000-9999 are auto-forwarded by the proxy but auth-gated;"
    echo "  only ONE port can ever be anonymous, and that is $APP_PORT."
