# Greenfield experiment: Circle of Fifths from a one-sentence brief

**Status:** clean room built (2026-08-28), awaiting repo push + fan-out.
**HOST-SIDE ONLY.** This file holds the judging rubric. It must never land in the
clean repo (`ronpwood/greenfield-sandboxes`) or reach any builder arm — the whole
experiment is whether the arms converge on these items *without* being told.

## The question

Earlier A/Bs handed the arms a fully fleshed-out spec for a minor change and
every arm nailed it — no signal. This run inverts that: no spec, no prior app,
no reference implementation anywhere in the clone or its history. One sentence:

> Create a Circle of Fifths application for guitar players that helps them
> understand music theory.

Can a team design, build, test, and deliver on its own? The TDD chain is the
interesting arm because greenfield is where the red gate's premise gets stressed:
the tests come from a spec the agents themselves wrote.

## The clean room

- Repo: `~/Dev/learning/greenfield-sandboxes` → `github.com/ronpwood/greenfield-sandboxes`
  (public, fresh history — the old payload is unreachable even via `git log`).
- Contents: SSSF factory verbatim (adws/, just/ minus fretboard.just, sandbox_mount/,
  `.claude/skills/sssf/` for the guest visualizer) + an empty shell payload at
  `apps/app/` (entry, page, one sanity test) + `prompts/greenfield.md` (the brief).
- Gates verified green on the shell before commit: oxlint, `bun build` the entry,
  `bun test` the fixed suite, `manifest.py get source.repo`.
- The manifest is the contract: arms must grow the app in place at the declared
  paths or the gates can't see their work. The prompt file says so explicitly.

## Run procedure

1. **Push** (one-time): `cd ~/Dev/learning/greenfield-sandboxes && gh repo create
   ronpwood/greenfield-sandboxes --public --source . --push`
2. **Flip the host manifest** for the experiment window (FILL and observe read the
   HOST checkout's manifest):
   `cp ~/Dev/learning/greenfield-sandboxes/app.manifest.yaml app.manifest.yaml`
   Revert after harvest: `git checkout app.manifest.yaml`.
3. **Fan out N=3**, all TDD chain, default roster:
   `just sbx mount gf-1` (and gf-2, gf-3), then per arm:
   `just sbx lifecycle execute <run-id> prompts/greenfield.md adws/adw_sssf_config/sssf.config.yaml tdd`
4. **Observe** from outside; **harvest** each arm's `sbx/<run-id>` branch.
5. **Judge** each harvested tree against the rubric below (host-side agent, one
   arm at a time, rubric in its context, arm code in its working dir). Also run
   each arm's own suite and the gates for the mechanical half of the score.
6. **Teardown + reap**, revert the manifest flip.

## Hidden rubric (judge-only)

Score each item 0 (absent) / 1 (attempted, flawed) / 2 (solid). Correctness
items are checkable mechanically; judgment items get a one-line justification.

**Music-theory correctness**
1. Circle order correct: 12 keys in fifths (C G D A E B F#/Gb Db Ab Eb Bb F).
2. Key signatures correct: sharp/flat count and which accidentals, per key.
3. Relative minors correct for all 12 majors.
4. Diatonic content correct for a selected key (scale notes and/or the seven
   diatonic chords with qualities: I ii iii IV V vi vii°).
5. Enharmonics handled sanely at the F#/Gb seam (no C## nonsense, consistent
   spelling per key).

**The brief's two clauses**
6. *For guitar players*: some real guitar surface — fretboard/neck rendering,
   positions, or chord shapes tied to the selected key. An arm that ships a
   piano-agnostic theory widget missed half the sentence.
7. *Helps them understand*: a teaching surface, not just data display —
   explanations, highlighting of relationships (neighbor keys share 6 of 7
   notes), progressive disclosure, anything that argues the arm thought about
   pedagogy.

**Interaction**
8. The wheel (or equivalent) is interactive: selecting a key updates the
   dependent views coherently.

**Engineering**
9. Tests exercise the theory engine (signatures, scales, chord derivation),
   not just DOM smoke. Red suite (tests/generated/) meaningfully preceded the
   build (check the commit order — the chain commits tests before code).
10. Delivery: gates green on harvest (lint, typecheck, build, fixed+generated
    suites), app loads and works without console errors.

**Scoring:** 20 max. Rank arms; the per-item spread matters more than the total —
item 6 and 7 scores are the design-judgment signal this experiment exists to
measure. Cross-grade note from the 2026-08-27 A/B still applies: score against
the brief's words, never against another arm's spec.

## Watch-fors

- An arm building outside `apps/app/` — gates pass vacuously on the shell. The
  judge must check `git diff --stat` of the arm branch, not just gate output.
- The red gate on greenfield can go red via "module not found" — degenerate but
  acceptable red for v1; note it in the judgment if the suite never got past it.
- Budget: greenfield is a much bigger spend than the minor-change A/B — that is
  why N=3, one chain, not five rosters.
