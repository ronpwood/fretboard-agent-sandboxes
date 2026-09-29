# Edge-class calibration, on the corpus (2026-09-28)

Phase 1 of `specs/edge-class-gate.md`. Sources: CHANGELOG 2026-09-19c through 2026-09-28g, and the five
team specs under `.sandbox/runs/*-artifacts/specs/`. The extraction was done by two read-only agents.
I spot-checked the cited lines against the source (the fixval wedge and pitch lines, the hfix barre
lines, harn7 CAGED, and team1 labels), and checked mtg1 V35/V37/V38 against the spec itself.

## Result: the taxonomy as planned FAILS its own loop gate, in two ways

**1. Not every shipped defect is an edge defect.** Of 31 defects, 6 fit no class:
- dsv41's linear fret spacing
- hfix's double-applied barre transpose
- harn2's quiz grading
- harn7 and harn5's CAGED shape tables
- mtg1c's `classifyHour` fall-through

These are wrong **across the whole range**: a wrong formula or wrong table data, not an edge. An edge
gate cannot cover them and should not claim to. Ordinary per-instance `V` rows (the existing
"cover every variant" rule) are what catch them. **Scope decision: the gate covers edge defects only,
and whole-range defects are out of its scope by declaration.**

**2. Eight defects fit two classes**, mostly the enharmonic-spelling family (shared-key, shown or
degenerate). **Tie-break: classify by the MECHANISM that produces the wrong value, not by where it
is observed.** It resolves all eight:

| defect | two candidate classes | by mechanism |
|---|---|---|
| fixval 330° wedges (large-arc flag) | wrap / shown | **wrap**: the arc goes the long way round the cycle |
| fixval `freqOfPc` has no octave | wrap / shared-key | **shared-key**: every octave collapses to one key |
| dsv41 hard-coded octave 4 | shared-key / wrap | **shared-key**: same mechanism |
| harn2 F#/Gb as F (not E#) | shared-key / degenerate | **shared-key**: E# and F share a pitch class |
| harn7 F# major with F | shared-key / degenerate | **shared-key** |
| harn3 `Bbb` unparseable | degenerate / discontinuity | **degenerate**: the extreme spelling |
| team1 fretboard sharp-only labels | shown / shared-key | **shared-key**: `noteAt().name` collapses A#/Bb |
| amort1c calendar-year rollup labels | shown / span | **shown**: grouping correct, label wrong |

`shown` is reserved for a value that is computed right and then lost or mis-rendered: hfix's CSS fill
override, team1's 14/40 missing diagrams, amort1c's labels.

## Mapped edge defects (after the tie-break)

| run | defect | class | key row in that class? |
|---|---|---|---|
| fixval | wedges sweep 330° | wrap | no key (tdd) |
| fixval | pitch class with no octave | shared-key | no key |
| dsv41 | octave hard-coded to 4 | shared-key | no key |
| hfix | vii° gets the major barre (keyed on root) | shared-key | no key |
| hfix | 96 badges one colour (CSS override) | shown | no key |
| hfix | both interval qualities lit | shared-key | no key |
| harn2 | vii° as major (in-loop) | shared-key | no key |
| harn2 | F#/Gb as F (in-loop) | shared-key | no key |
| harn3 | minor falls into the major branch, 17/17 | shared-key | no key |
| harn3 | `Bbb` unparseable | degenerate | no key |
| harn7 | F# major with F | shared-key | no key |
| team1 | parallel major in 12 minor keys (in-loop) | shared-key | **no** ("beyond the answer key") |
| team1 | sharp-only fretboard labels, 12/24 keys | shared-key | **no** (named in its own Traps) |
| team1 | 14/40 diagrams missing | shown | **no** |
| amort1c | half-cent tie | rounding | no key (control) |
| amort1 | half-cent tie | rounding | **no** (no tie loan) |
| amort2 | (exact; the key pinned a tie) | rounding | **yes** |
| mtg1 | meeting across spring-forward | span | **"yes"**: see finding 3 |
| mtg1c | wrapped hours never core | wrap | no key (control) |
| mtg1c | end-inclusive core | boundary | no key (control) |

**Every class has a real instance except `discontinuity`.** It has zero shipped defects in the
corpus. It stays in, marked **unvalidated**.

## Finding 3, the one that changes the design: per-class coverage would NOT have caught mtg1

Class coverage of the five team keys (Y = a frozen row genuinely exercises the class, A = amendment
only, – = none):

| spec | boundary | span | wrap | discontinuity | rounding | degenerate | shared-key | shown |
|---|---|---|---|---|---|---|---|---|
| team1 | Y | Y | Y | – | – | Y | Y | – |
| team2 | Y | Y | Y | Y | Y | Y | Y | A |
| amort1 | Y | Y (weak) | – | Y | Y | Y | – | Y |
| amort2 | Y | Y | Y | Y | Y | Y | – | – |
| mtg1 | Y | **Y** | Y | A | – | Y | – | A |

**mtg1 already had `span` rows:** V35 (16:30+60m crosses workEnd), V37 (crosses sleepStart) and V38
(crosses sleepEnd). They are real spans across *limits*, so "each class cites ≥1 row" **passes mtg1**,
and the DST straddle ships anyway. The row that was missing was a span across **one specific limit**,
the DST transition, while the key covered spans across the work and sleep edges. team1 is similar.
It had `shared-key` rows (relative major/minor signatures) and still shipped two shared-key defects in
places the rows did not reach (minor-key features, and fretboard labels).

**Coverage has to be per LIMIT, not per class.** The planner first names the domain's limits (for mtg1:
work edges, sleep edges, the calendar day boundary, and the DST transition; R3 and its Traps show it
knew DST was one). `boundary` and `span` then need a row **per limit**, and the other six dimensions
stay global. Under that form, mtg1's key is forced to write "a meeting across the DST transition".

The plan's Phase 1 box "for mtg1, `span` = no row" is therefore **false**. That is the calibration
doing its job.
