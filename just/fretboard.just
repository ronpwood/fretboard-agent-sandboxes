# just/fretboard.just — the `fretboard` namespace: boot and test the app itself.
#
# Loaded from the root justfile:
#     mod fretboard 'just/fretboard.just'
#
# A module inherits NOTHING from its parent — not variables, not settings, and
# its cwd defaults to this file's directory. Hence the three lines below.
# Recipes run bash (not the root's interactive zsh): they call real binaries
# only, and that keeps them identical on the host and inside a sandbox.
set working-directory := '..'
set positional-arguments
set dotenv-load

# list the fretboard commands
default:
    @just --list fretboard

# Static, no-backend app: index.html loads main.ts as a module, so `bun
# index.html` IS the server — Bun's built-in HTML dev server, not a script we
# wrote. It defaults to :3000, hence PORT set explicitly below.

# boot the app: just fretboard run [4501] — PORT env override
run PORT="4501":
    #!/usr/bin/env bash
    set -euo pipefail
    echo "fretboard → http://localhost:{{PORT}}"
    PORT={{PORT}} bun apps/fretboard/index.html

# boot with hot-reload-on-save, for working on the app
dev PORT="4501":
    #!/usr/bin/env bash
    set -euo pipefail
    echo "fretboard (watch) → http://localhost:{{PORT}}"
    PORT={{PORT}} bun --hot apps/fretboard/index.html

# the suite the factory's test phase runs, by name
test:
    bun test apps/fretboard/fretboard.test.ts
