# prompts

Work orders for the factory. Each numbered file is written to be passed VERBATIM as the prompt
argument — goal, acceptance criteria, constraints, and an explicit out-of-scope list, so the run
lands somewhere a deterministic test can check.

| File | Shape |
| --- | --- |
| `01-fts5-search.md` | data layer / algorithmic — FTS5 index, ranking, snippets |
| `02-revision-history.md` | data model — snapshots, diff, restore |
| `03-scheduled-publishing.md` | state machine / time — `scheduled` status, `publish_at`, sweep |
| `04-export-import.md` | I/O round trip — markdown front matter, bundle, import |
| `05-public-permalink.md` | new surface — server-rendered `/p/:slug` read view |
| `06-redesign-quiet-room.md` | redesign — the app as a quiet room; chrome leaves until called |
| `07-redesign-editorial.md` | redesign — typography-first editorial instrument |
| `08-redesign-progressive-focus.md` | redesign — progressive disclosure, full power in layers |
| `09-triad-playback.md` | feature, frontend-only — Web Audio playback of the triad panel's current inversion |
| `13-enharmonic-respelling.md` | correctness fix — key-aware note naming, flat keys stop showing sharp spellings |
| `14-progression-playback.md` | feature, frontend-only — Web Audio playback of the I–IV–V–vi diatonic progression |
| `15-seventh-chords.md` | feature — diatonic 7th chords (Imaj7...viim7b5) as a parallel mode of the chord-diagram panel |
| `16-alternate-tunings.md` | feature, narrow scope — Drop D / DADGAD / Open G in the fretboard-explorer panel only |

06–08 are one product goal (writing-first redesign, all features kept but folded into menus) in
three creative directions — built for best-of-N: fire each at its own sandbox and compare.

13–16 are four independent features ranked by pedagogical value per unit of implementation risk
(13 highest, 16 lowest — see each file's "Why it matters" for the reasoning): 13 is a correctness
fix and the cheapest change of the four; 14 is small and ships well alongside it; 15 budgets for a
multi-module change but stays scoped to one panel; 16 is deliberately the narrowest possible slice
of a much larger, lower-priority feature. Fire independently or as a fan-out to compare — they
touch disjoint files (theory.ts+main.ts render sites / playback.ts+main.ts / theory.ts+voicing.ts /
fretboard.ts+main.ts) and can run in parallel sandboxes without colliding, but 13's key-aware
`noteName` signature change is worth landing first since 14/15/16 don't depend on it.

09 and 13–16 target `apps/fretboard`, the current payload app — 01–08 target `apps/inkwell`,
archived at `archive/inkwell-20260815-053427/` after `just app swap`. A prompt written against one
app's file paths will not resolve against another; check which app is live before firing an old one.

The five differ in shape on purpose: fire the same one at several models and the spread is worth
reading. Fire five different ones at one target and they collide — one detached SDLC at a time.

## Fire one

```bash
just adw sdlc "$(cat prompts/01-fts5-search.md)"
```

Every prompt is a plain string, so it works with any ADW in the roster — `plan`, `build`,
`build-test`, `simple-sdlc` — and anywhere the factory runs. Where to run it is a separate
decision this file deliberately does not make.

The unnumbered files here are earlier one-off runs, kept as examples of the terse form.
