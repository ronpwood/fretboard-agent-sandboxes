---
plan: what-the-bare-arm-actually-did
created: 2026-09-19T09:30:00-07:00
modified:
  - 2026-09-19T09:30:00-07:00
commits: []
agents:
  - claude-opus-5[1m]
sessions:
  - 609c01b7-75ec-4c74-af00-45fa9d061fea
back_refs:
  - specs/bare-claude-control-arm-results.md — the scorecard
  - specs/next-session-memo.md — §1 review loop, §2 agency gap
  - CHANGELOG.md — 2026-09-19
forward_refs: []
status: open
---

# What the bare arm actually did — a transcript reconstruction

Ron's objection, and it is correct: *"I'm not sure that the single bare Claude Code arm equates
perfectly to a mixture of agents being handed document assets with no communication protocol."*

It does not. Reconstructed from the 363-row transcript, here is what the 37 minutes were spent on.

## The shape of the run

| | phase | minutes | share |
|---|---|---|---|
| 0.0–5.6 | **recon** — repo, manifest, and *the grading criteria* | 5.6 | 15% |
| 5.9–20.5 | **build** — theory → guitar → audio → state → ui → styles, in dependency order | 14.6 | 40% |
| 20.5–25.9 | **gates + tests + self-check** | 5.4 | 15% |
| 25.9–36.8 | **observe, review, revise** | 10.9 | 30% |

**44% of the session happened after the code existed.** The agent spent more time verifying and
revising its own work than the factory's whole review loop is allowed to spend before being cut off
at `MAX_REVISION_LOOPS = 2`.

It ran the factory's own phase structure — recon, plan, build, test, review, revise — by itself,
with one unbroken context. It wrote **no plan artifact at all**, and wrote its tests *after* the
build, not before. It is not a TDD chain and it still produced 101 tests.

## It reviewed its own work three times, each with a purpose-built instrument

**1. Voicings (25.0 min).** Before trusting its chord library it wrote `/tmp/dbg.ts`, iterating
every shape at every one of twelve roots and printing any that failed to match the chord or put the
wrong note in the bass.

**2. Layout (26.2–33.0 min).** It wrote a PEP-723 Playwright script, screenshotted the app, cropped
the image into thirds with PIL, and **read the images back**. Then:

> *"The app works end to end. Now let me fix the layout voids, the clipped wheel caption, and a
> clipped fret number I spotted."*

Fix → re-screenshot → re-read → fix again. Several cycles.

**3. Audio (33.4 min).** It wrote `audio_check.py`, which launches chromium with
`--autoplay-policy=no-user-gesture-required`, **monkey-patches `window.AudioContext` to count
instances and inspect their state**, clicks "play the scale", and reports. Then:

> *"Audio confirmed working in a real browser. Now a cleanup pass to remove the dead exports I left
> behind."*

**This is the channel the factory is deaf on.** The bare arm built an instrument for it, unasked, in
a run where nothing in the brief mentioned sound.

## The moment that proves Ron's point

At 25.5 minutes, its own voicings check found that the C-shape dominant 7th violated the library's
contract. It **deleted the feature** and wrote the reason into the source:

```ts
// No C-shape dominant 7th: the grip guitarists actually play for open C7
// (x32310) drops the fifth, and this library's contract is that every offered
// shape contains every chord tone. The A shape covers the same roots.
```

That is a **reviewer's judgment, executed by the builder, using the builder's context.** It knew why
the shape existed, what contract it broke, and what covered the gap — because it was the same mind
that had written all three, twenty minutes earlier.

In the factory this decomposes badly. The reviewer would file "dom7-C produces an incomplete voicing"
as a finding. A *different* agent, in a *fresh session*, holding only an envelope, would then try to
fix it — with no memory of why the shape was added or that the A shape already covers those roots.
The likely outcome is a patched grip rather than a deleted one.

## So the gap is not one thing — it is at least four

| # | handicap | evidence | fixable? |
|---|---|---|---|
| 1 | **No tool discovery.** `tools:` is an allowlist with no search/fetch, so a factory agent cannot learn Playwright exists | 0 of 7 arms ever reached for a browser; the bare arm installed one in 26 minutes | cheap — one prompt line + a tool |
| 2 | **Context discontinuity.** Each phase is a fresh session handed an envelope | the dom7-C deletion needs build-context to make correctly | architectural |
| 3 | **No self-review before handoff.** The builder never sees its own output; the reviewer is the first eye, and by then the builder is gone | 44% of the bare arm's run was post-build self-review | medium — a verify step *inside* the build phase |
| 4 | **The review loop is truncated.** `MAX_REVISION_LOOPS = 2` breaks before revising, so the last review's findings are discarded in every run | `adw_tdd_sdlc.py:57` | trivial |

**(2) and (3) compound, and that is the part we had not seen.** Handing the factory's builder a
browser fixes less than it looks: it would observe its own work in a session that then evaporates,
and the revision would happen in a *different* session that never saw the screenshot. Discovery
without continuity buys a better bug report, not a better fix.

## What would actually discriminate

Ranked by information per dollar.

1. **Self-verify inside the build phase.** Give the builder `render_smoke.py` and one line saying
   chromium is on the box, and let it look before it hands off. Tests (1) and (3) together, changes
   no phase structure. **Cheapest real test of the whole hypothesis.**
2. **Raise `MAX_REVISION_LOOPS` to 3 and make the final review audit the delivered app**, not the
   last diff. Already queued; (4) is trivial and should just be fixed.
3. **Continuity probe — the deep one.** Run the chain with build → review → revise as *one resumed
   session* instead of three fresh ones, everything else identical. This isolates (2), the handicap
   we cannot price yet.
4. **Clean re-run of the bare arm** with `adws/` moved aside, to settle the stop-rule contamination.
   Lowest value: it tests tooling access, and the capability question is already answered.

## The honest reframing

The bare arm is **not** "one agent beats six." It is *the same six phases, run by one mind that
never lost its context and could look at its own work.* The factory's agents are not weaker. They
are **blindfolded between phases** — and that is a property of the harness we built, not of the
models we hired.
