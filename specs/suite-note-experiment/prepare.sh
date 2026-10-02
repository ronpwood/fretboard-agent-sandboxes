#!/usr/bin/env bash
# usage: bash specs/suite-note-experiment/prepare.sh <dest-dir>
# One isolated worktree per review run, all byte-identical:
#   red c2375d5 + greenfield factory sync 526aa07 (committed: the red_sha)
#   + mtg1 build 995f853 applied UNCOMMITTED (as at review time)
#   + plant.patch (R10 sleep-first tier removed from the sort; the R10 ranking
#     assertion deleted from the red suite) — also uncommitted.
# Prints the red sha. Needs the audit clone with mtg1's bundle refs and refs/gf/main.
set -euo pipefail
A=/private/tmp/claude-501/audit/greenfield
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$1"
git -C "$A" worktree add -q --detach "$DEST" c2375d5
cd "$DEST"
git checkout -q refs/gf/main -- adws just justfile
git -c user.name=exp -c user.email=exp@local commit -q -m "red c2375d5 + factory sync 2026-10-02 (526aa07)"
RED=$(git rev-parse HEAD)
git cherry-pick -n 995f853 > /dev/null
git apply "$HERE/plant.patch"
( cd apps/app && bun install --frozen-lockfile > /dev/null )
echo "$RED"
