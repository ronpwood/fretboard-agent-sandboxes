# just/app.just — the `app` namespace: swap the payload app that lives under
# `apps/` without touching the factory that builds it.
#
# Loaded from the root justfile:
#     mod app 'just/app.just'
#
# This only moves files. It deliberately does NOT touch
# adws/adw_modules/quality.py, just/inkwell.just, or sssf.config.yaml — those
# encode per-app commands (lint/typecheck/build/test) that differ by tech
# stack and can't be templated safely. `swap` ends by printing exactly what
# still needs rewiring; do that in a normal conversation with Claude, not by
# scripting it here.
#
# A module inherits NOTHING from its parent — cwd defaults to this file's
# directory, hence `set working-directory`.
set working-directory := '..'
set positional-arguments
set dotenv-load

# list the app commands
default:
    @just --list app

# archive every app currently under apps/, without swapping a new one in
archive:
    #!/usr/bin/env bash
    set -euo pipefail
    ts=$(date +%Y%m%d-%H%M%S)
    mkdir -p archive
    shopt -s nullglob
    moved=0
    for dir in apps/*/; do
        name=$(basename "$dir")
        dest="archive/${name}-${ts}"
        echo "archiving apps/${name} -> ${dest}"
        mv "$dir" "$dest"
        moved=1
    done
    if [ "$moved" -eq 0 ]; then
        echo "apps/ is already empty — nothing to archive"
    fi

# list what's in archive/
list:
    @ls -1 archive 2>/dev/null | grep -v README.md || echo "archive/ is empty"

# archive the current app(s) and copy a new one in as apps/<name>:
#   just app swap ../path/to/new-app blog2
swap SOURCE NAME:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d "{{SOURCE}}" ]; then
        echo "error: source '{{SOURCE}}' is not a directory" >&2
        exit 1
    fi
    if [ -e "apps/{{NAME}}" ]; then
        echo "error: apps/{{NAME}} already exists — pick a different name or remove it first" >&2
        exit 1
    fi
    just app archive
    mkdir -p "apps/{{NAME}}"
    rsync -a --exclude='.git' --exclude='node_modules' "{{SOURCE}}/" "apps/{{NAME}}/"
    echo ""
    echo "apps/{{NAME}} is in place. The factory still points at the old app —"
    echo "nothing below runs until this is fixed:"
    echo ""
    echo "  1. Inspect apps/{{NAME}}'s real lint / typecheck / build / test commands"
    echo "  2. Rewrite adws/adw_modules/quality.py:"
    echo "       - path references apps/inkwell/* -> apps/{{NAME}}/*"
    echo "       - rename run_inkwell_tests / run_inkwell_quality, and update their"
    echo "         callers (grep -rn run_inkwell adws/*.py)"
    echo "  3. Rewrite just/inkwell.just (or rename the module) for {{NAME}}"
    echo "  4. Update sssf.config.yaml protected_files / writes if paths moved"
    echo "  5. Run one ADW end-to-end to confirm the quality gates pass"
    echo ""
    echo "Ask Claude to do steps 1-5 in a fresh conversation — this command only moved files."
