#!/usr/bin/env bash
# usage: bash specs/suite-note-experiment/run_arm.sh <note|nonote> <adw-id>
# Prepares a fresh worktree and runs one replayed final review in it.
# pi runs under a scratch HOME whose models.json is the VM template (same model
# limits a VM run gets; the host's global ~/.pi config is never touched). The
# key travels by environment only — models.json says $OPENROUTER_API_KEY.
set -euo pipefail
ARM="$1"; ID="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
X=/private/tmp/claude-501/exp-suite
WT="$X/wt-$ID"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$HOME/.cache/uv}"
export OPENROUTER_API_KEY="$(grep -E '^OPENROUTER_API_KEY=' "$REPO/.env" | head -1 | cut -d= -f2- | tr -d "\"'")"
[ -n "$OPENROUTER_API_KEY" ] || { echo "no OPENROUTER_API_KEY in .env"; exit 1; }
RED=$(bash "$HERE/prepare.sh" "$WT")
cd "$WT"
HOME="$X/home" uv run "$HERE/replay_review.py" --arm "$ARM" --adw-id "$ID" --red-sha "$RED"
