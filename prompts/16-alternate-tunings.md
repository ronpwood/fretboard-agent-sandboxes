Let the fretboard-explorer panel show the neck in alternate tunings (Drop D, DADGAD,
Open G) alongside today's Standard tuning, without touching any other panel.

Why it matters: this is the widest-blast-radius, lowest-mission-fit item of the four
features under consideration — the circle of fifths and diatonic harmony are
tuning-independent, so retuning serves fretboard/voicing exploration, a different need
than the app's teaching goal. Done here in full generality it would touch voicing
search, triad layout, chord diagrams, tests, and persistence all at once. This task
is deliberately scoped to just the first, safe step: thread an explicit tuning parameter
through `pitchAtFret`/`midiAtFret` instead of reading the module-level tuning constants
directly, and prove it end-to-end in exactly one place — the fretboard-explorer panel,
which already iterates every note on the neck and has no chord/voicing logic of its own.

Where: apps/fretboard/fretboard.ts (`pitchAtFret`, `midiAtFret`, `getAllFretboardNotes`
gain an optional tuning parameter; new named tuning presets), apps/fretboard/index.html
(a "Tuning" `<select>` in the explorer panel), apps/fretboard/main.ts (wiring, confined to
the explorer panel — the only file that touches the DOM), apps/fretboard/fretboard.test.ts
(new tests).

Verified before writing this: today, `STANDARD_TUNING`/`STANDARD_TUNING_MIDI` are read
ONLY inside fretboard.ts itself (`pitchAtFret`/`midiAtFret`); every other module
(voicing.ts, triad-layout.ts, playback.ts, main.ts) already goes through those two
functions rather than reading the constants directly. That means making the tuning an
explicit, optional, backward-compatible parameter on those two functions requires zero
changes anywhere else in the codebase to keep it compiling and passing.

Done means:
1. `pitchAtFret(stringIndex: number, fret: number, tuning: number[] = STANDARD_TUNING):
   number` and `midiAtFret(stringIndex: number, fret: number, tuningMidi: number[] =
   STANDARD_TUNING_MIDI): number` gain the optional 3rd parameter. Every existing call
   site across the codebase needs no changes — calling with just `(stringIndex, fret)`
   is byte-identical to current behavior.
2. `getAllFretboardNotes(maxFret?: number, tuningMidi?: number[]): FretboardNotePosition[]`
   gains an optional tuning parameter it threads through to `pitchAtFret`/`midiAtFret`,
   defaulting to standard tuning exactly as today.
3. fretboard.ts (or a new pure `tunings.ts` module) exports three named presets, each as
   a `{ pitchClasses: number[], midi: number[] }` pair, low string (index 0) to high
   (index 5): `DROP_D` (D A D G B E — low string down a whole step: pitch classes [2, 9,
   2, 7, 11, 4], MIDI [38, 45, 50, 55, 59, 64]), `DADGAD` (D A D G A D: pitch classes [2,
   9, 2, 7, 9, 2], MIDI [38, 45, 50, 55, 57, 62]), `OPEN_G` (D G D G B D: pitch classes
   [2, 7, 2, 7, 11, 2], MIDI [38, 43, 50, 55, 59, 62]).
4. The fretboard-explorer panel gets a "Tuning" `<select>` (Standard / Drop D / DADGAD /
   Open G). Changing it re-renders the explorer's note grid, string labels, and
   click-to-play using the selected tuning's pitch classes and MIDI numbers — clicking a
   note plays the retuned pitch, not the standard-tuning one.
5. The chord-diagram panel, triad-layout panel, diatonic chord list, and voicing search
   (`findVoicings`) are UNCHANGED by this feature — they keep using standard tuning
   regardless of what the explorer's selector shows. This is an explicit scope boundary,
   not a bug, and should not require touching voicing.ts or triad-layout.ts at all.
6. New tests in fretboard.test.ts: `pitchAtFret`/`midiAtFret` called with an explicit
   `DROP_D`/`DADGAD` tuning match hand-computed values (e.g. Drop D's open low string is
   D2/MIDI 38, not standard's E2/MIDI 40); called with no tuning argument, both functions
   are unchanged from their pre-existing behavior (regression check against the existing
   standard-tuning test cases); `getAllFretboardNotes` with an alternate tuning produces
   the expected pitch classes for at least the open strings.
7. bun test apps/fretboard/fretboard.test.ts stays green. oxlint stays clean on
   apps/fretboard.

Constraints:
- Bun + TypeScript only, matching the app's existing zero-dependency style.
- Every existing call site (voicing.ts, triad-layout.ts, playback.ts, and every
  `pitchAtFret`/`midiAtFret`/`getAllFretboardNotes` call in main.ts outside the explorer
  panel) needs zero code changes — this is purely additive.
- Tuning presets are plain exported data, no lookup-by-name string parsing beyond the
  `<select>`'s own option values.
- No persistence — the chosen tuning resets to Standard on page reload, same as any other
  transient UI state not already in `persisted-state.ts`.
- No new dependencies.

Out of scope: retuning the chord-diagram or triad-layout panels or voicing search,
persisting the chosen tuning, custom/user-defined tunings beyond the 3 named presets, 7-
or 8-string tunings, and capo modeling.
