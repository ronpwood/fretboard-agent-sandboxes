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

06–08 are one product goal (writing-first redesign, all features kept but folded into menus) in
three creative directions — built for best-of-N: fire each at its own sandbox and compare.

09 targets `apps/fretboard`, the current payload app — 01–08 target `apps/inkwell`, archived at
`archive/inkwell-20260815-053427/` after `just app swap`. A prompt written against one app's file
paths will not resolve against another; check which app is live before firing an old one.

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
