---
plan: bare-sonnet-55-control-arm-results
created: 2026-09-30T14:10:00-07:00
modified:
  - 2026-09-30T14:10:00-07:00
commits: []
agents:
  - claude-opus-5-5
back_refs:
  - specs/bare-sonnet-55-control-arm-preregistration.md — predictions, committed 0ef0698 before the run
  - specs/bare-claude-control-arm-results.md — the Opus 5 arm (31/32, 37 min, $4.28)
  - specs/greenfield-cof-experiment.md — the frozen rubric
forward_refs: []
status: complete
---

# Bare Sonnet 5.5 control arm: results

**Run:** `bare-s55-20260930-f887d0` · greenfield @ `59b1738` · **one turn, 2 min 6 s** · **$0.33** (Shelley delta) ·
`claude-sonnet-5-5` served all 10 assistant messages · Claude Code 2.1.284 (declared deviation from 2.1.272).

## Verdict first: "would you use it?" (Ron, recorded before scoring)

> "It's a good looking app. lacks a few features from the Opus models run, but a great starting app that with a few
> prompts would work. Cost and speed are very impressive. The quality of Opus was ready to deploy, Sonnet did a great MVP."

## Headline

**It tied Opus 5 on the rubric (31/32) and lost clearly on the expert verdict.** That is the rubric-saturation finding
from 2026-09-19 again, now in its sharpest form. A 616-line MVP and a 4,358-line deploy-ready app score identically.
The 32-point rubric measures *correct and coherent*. It cannot see *complete*.

## Process: recorded, never scored

| | Opus 5 bare (09-19) | Sonnet 5.5 bare (today) |
|---|---|---|
| wall clock | 37 min | **2 min 6 s** (20:39:03Z → 20:41:09Z) |
| assistant messages / tool calls | 363 transcript rows / 81 | 43 rows, 10 messages / **5** |
| output tokens | — | 36,766 (cache read 367k, cache write 48k) |
| code | 4,358 lines / 24 files | **616 lines / 8 files** |
| tests | 101 / 21,358 asserts | 10 / 322 asserts |
| browser / runtime truth | playwright and read its own screenshots | **none** (its final message says so) |
| cost | $4.28 | **$0.33** ($6.28 → $5.95; the $0.08 gateway probe was outside the window) |
| commits | none | none |

**Shape of the turn:** read the manifest and shell, then wrote `theory.ts` and `views.ts` in one heredoc. A second
heredoc wrote `audio.ts`, `styles.ts`, `main.ts`, `index.html` and the tests, and ran test + strict tsc + build. One
`sed` fix-up followed (a wrong test index and unused imports). That was the only tool error.

## Scores (frozen rubric, 0/1/2)

| # | item | score | note |
|---|---|---|---|
| 1 | circle order | 2 | C G D A E B F♯ D♭ A♭ E♭ B♭ F |
| 2 | key signatures | 2 | all 24 keys dumped from `signature()`: counts, accidentals and their order correct |
| 3 | relative minors | 2 | inner ring correct for all 12 |
| 4 | diatonic content | 2 | all 24 scales and 7-chord sets correct, qualities included |
| 5 | enharmonics | 2 | F♯ major spells E♯; D♯m / E♯dim; flat side is consistent |
| 6 | guitar surface | 2 | chord diagrams per diatonic chord (open / E- / A-shape barre), 12-fret board, capo helper |
| 7 | teaching surface | 2 | roman numerals lit on the wheel, direction explanation, scale-degree labels, progressions with blurbs. Thin next to Opus, but it meets the item |
| 8 | interaction | 2 | wheel, mode, degree, labels, progressions all update dependent views |
| 9 | tests | **1** | theory exercised property-style over all roots × qualities; no red suite (structural, same as Opus) |
| 10 | delivery | 2 | tests 10/10, oxlint clean, the factory's exact tsc argv clean, build ok, 0 console errors |
| **A** | | **19/20** | |
| 11 | survives interaction | 2 | scripted pass over 24 wheel slots, both modes, 7 degrees, labels, 4 progressions, both play buttons, keyboard ←/Enter: coherent throughout |
| 12 | visual design | 2 | reads as designed: dark theme, clear hierarchy |
| 13 | core-object legibility | 2 | large wheel, legible labels |
| 14 | error-free under use | 2 | 0 errors; one warning is Bun's HMR socket, not the app |
| 15 | restraint | 2 | effort landed on the brief; nothing bolted on |
| 16 | recoverability | 2 | no reviewer; my worst finding (untested `OPEN_MIDI`) is a one-test fix |
| **B** | | **12/12** | |
| | **A+B** | **31/32** | |

**Cosmetic defects (not scored):** "No sharps or flats**..**" (doubled period). The F card's "E-shape barre, fret 1"
caption wraps awkwardly. The minor ii°–v–i uses natural-minor `v` (defensible).

## Tie-breakers

- **T2, silent-channel correctness: PASS.** C major emits `[48,52,55,60,64]` (same as Opus). All 36 triads
  (12 roots × maj/min/dim) played through `voicingMidi` have the exact chord pitch set with the root in the bass.
- **T1, silent-channel assertion: strict FAIL (near-miss).** The test asserts `voicingPcs` (from `OPEN_STRINGS`),
  root lowest, only chord tones. The audio plays `voicingMidi`, which reads a **separate** `OPEN_MIDI` table that no
  test touches. A drift between the two tables would ship silently. That is the gf4-solo shape, one layer upstream.

## Predictions

| | prediction | result |
|---|---|---|
| P1 | A+B ≥ 28, not beating 31 | **MET**: 31 |
| P2 | reaches for runtime truth unprompted | **FALSIFIED**: no browser, no HTTP. The final message flagged the gap honestly |
| P3 | T1 and T2 pass | **half**: T2 pass, T1 strict fail |
| P4 | no commit | **MET** (snapshot `d35d115`) |
| P5 | faster than 37 min | **MET** by ~18x |

**Stop rule: not tripped.** Nothing under `adws/`, no Skill call. This is a cleaner "no shared tooling" control than
the Opus arm, which ran `render_smoke.py`.

## What this changes

1. **The rubric is saturated to the point of being uninformative between competent arms.** Two bare arms tie at 31
   with a >7x gap in delivered surface and an expert verdict of "deploy" vs "MVP". Completeness (feature depth,
   test depth) needs its own measure, or "would you use it?" stays the primary outcome and the rubric is a floor.
2. **Runtime-truth seeking is model posture, not a Claude Code harness property.** The same harness and prompt got
   81 tool calls with self-screenshotting from Opus 5, and 5 blind tool calls from Sonnet 5.5. This partly revises the
   09-19 reading that the agency gap is "harness, not model". The harness *allows* it; the model decides.
3. **Sonnet 5.5 is a credible cheap first pass:** correct theory, correct audio, clean gates, for $0.33 in two minutes.
   A "Sonnet drafts → Opus/human completes" arm is the obvious follow-up. So is testing whether the same one-turn
   Sonnet arm, prompted to verify in a browser, closes the P2 gap.

## Artifacts

- commits: `refs/sandbox/bare-s55-20260930-f887d0` in `../greenfield-sandboxes` (snapshot `d35d115`)
- bundle: `.sandbox/runs/bare-s55-20260930-f887d0.bundle`
- transcript: `.sandbox/traces/bare-s55-20260930-f887d0/4f495c12-7a15-42e9-a56e-51f0b4e6f72b.jsonl`
- screenshots: `.sandbox/shots/bare-s55-20260930-f887d0.png`, `specs/greenfield-judge/judge-bare-s55-full.png`
