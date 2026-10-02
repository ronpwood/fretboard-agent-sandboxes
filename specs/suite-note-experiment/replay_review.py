#!/usr/bin/env -S uv run
# /// script
# dependencies = ["pydantic", "python-dotenv", "pyyaml", "rich"]
# ///
"""Replay mtg1's FINAL review (review_3) on the host, with or without the suite note.

    cd <prepared worktree> && uv run <this file> --arm note|nonote --adw-id <id>

Run from a worktree prepared by prepare.sh: red commit + today's synced factory,
mtg1's build (995f853) uncommitted on top, and the plant applied. Everything the
team ADW's review_3 had is reproduced: the final plan.md and review_2's
value_sweep.ts in context_handoff/, the builder's last envelope, the same gates.
The ONLY difference between arms is whether the suite note is appended.

Imports the WORKTREE's adws (the synced factory), not this repo's.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd() / "adws"))

from adw_modules import agents, changes, gates, git_helper, session  # noqa: E402
from adw_modules.data_types import AgentCall, BuildOutput, PhaseParams, ReviewOutput  # noqa: E402
from adw_modules.manifest import load as load_manifest  # noqa: E402

import adw_team_sdlc as team  # noqa: E402  FINAL_REVIEW_NOTES, verbatim

HERE = Path(__file__).resolve().parent
MTG1 = HERE.parents[1] / ".sandbox/traces/mtg1-20260929-37d9cd/sessions/bcca0d92"
SPEC = "specs/bcca0d92_timezone-meeting-planner.md"
PLAN_SHA = "ae025db"        # mtg1's commit_plan: what spec_frozen compares against
CONFIG = "adws/adw_sssf_config/sssf.team.config.yaml"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--arm", choices=["note", "nonote"], required=True)
    ap.add_argument("--adw-id", required=True)
    ap.add_argument("--red-sha", required=True)
    args = ap.parse_args()

    cfg = agents.load_config(CONFIG)
    run = session.ensure(cfg, args.adw_id)
    handoff = Path(run.context_handoff_dir)
    for name in ("plan.md", "value_sweep.ts"):        # what review_3 found in its handoff
        shutil.copyfile(MTG1 / "context_handoff" / name, handoff / name)

    build = BuildOutput(**json.loads((MTG1 / "builder/envelope.json").read_text()))
    app = load_manifest().app
    suites = changes.capture_suites(run, args.red_sha, [app.test_file, app.generated_tests_dir])
    suite_note = changes.suite_notes(suites, amendments=True) if args.arm == "note" else ""
    previous = agents.with_notes(build, "\n\n".join(filter(None, [
        build.notes_for_next_agent, team.FINAL_REVIEW_NOTES, suite_note])))

    frozen = gates.spec_frozen(SPEC, PLAN_SHA)
    with run.phase(PhaseParams(name="review_3", kind="agent", owner="reviewer", retries=1,
                               description=f"replay of mtg1 review_3, arm={args.arm}")) as ph:
        ph.log(arm=args.arm, suite_added=suites.added, suite_removed=suites.removed,
               note_chars=len(suite_note))
        review = ph.call(AgentCall(output_type=ReviewOutput,
                                   prompt=(HERE / "brief.md").read_text(),
                                   previous=previous,
                                   gates=[gates.artifacts_exist, gates.verdict_consistent,
                                          frozen, gates.amendments_ruled, gates.values_swept]))

    out = HERE / "results" / f"{args.adw_id}-{args.arm}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(review.model_dump_json(indent=2))
    review_md = handoff / "review.md"
    if review_md.is_file():
        shutil.copyfile(review_md, out.with_suffix(".review.md"))
    print(f"{args.arm} {args.adw_id}: approved={review.approved} blocking={len(review.blocking)} -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
