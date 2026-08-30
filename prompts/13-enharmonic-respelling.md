Make note names key-aware so flat keys display flat spellings instead of sharps.

Why it matters: `NOTE_NAMES` in theory.ts is sharps-only (C, C#, D, D#, E, F, F#, G, G#,
A, A#, B), and `noteName(pc)` always returns from that table. That means selecting the
key of F major shows its IV chord as "A#" everywhere a real chart, teacher, or method
book says "Bb". Same wrong spelling hits Bb, Eb, Ab, and Db majors — half of
`CIRCLE_OF_FIFTHS_MAJORS`. This is a correctness bug in an app whose whole purpose is
teaching the circle of fifths: the flat side of the circle is currently misspelled.

Where: apps/fretboard/theory.ts (the note-naming logic), apps/fretboard/main.ts (every
`noteName(...)` call site that renders a note inside a specific key context — the
diatonic chord list, chord/triad captions, and the explorer panel's note labels/caption),
apps/fretboard/fretboard.test.ts (new tests).

Scope, read before starting: this is deliberately the simplified "which side of the
circle is this key on" heuristic real chord apps use, not full diatonic
letter-uniqueness spelling (e.g. correctly distinguishing G# from Ab as a scale degree
in an arbitrary key). Getting that fully right is a much bigger job than this fix
justifies. Here, a key is either "sharp-side" or "flat-side," and every accidental pitch
class displayed while that key is selected uses that side's spelling consistently.

Among the app's 12 circle-of-fifths majors, the flat-side tonics are Db (pc 1), Eb (pc
3), F (pc 5), Ab (pc 8), and Bb (pc 10) — these need `Bb` not `A#`, `Eb` not `D#`, etc.
Everything else (C, and the sharp-side keys G, D, A, E, B, F#) keeps today's sharp
spellings unchanged.

Done means:
1. `noteName` gains an optional second parameter carrying key context, e.g.
   `noteName(pc: number, keyTonicPc?: number): string`. Called with just `pc` (as every
   existing call site does today), behavior is byte-identical to now — this is additive,
   not a breaking change to the signature's required arguments.
2. When `keyTonicPc` is one of the flat-side tonics (1, 3, 5, 8, 10), pitch classes 1, 3,
   6, 8, and 10 return their flat spelling (Db, Eb, Gb, Ab, Bb) instead of the sharp one
   — this covers accidentals that occur as scale degrees within that key (e.g. Db
   major's 4th degree is Gb, not F#, even though Db itself is pc 1).
3. `main.ts` passes key context at every render site whose note is "in" the currently
   selected key: the diatonic chord list buttons, the chord-diagram and triad-panel
   captions/labels, and the fretboard-explorer's note labels and caption. Use the
   effective major-key tonic for context — in minor mode, that is the relative major's
   tonic (`relativeMajorPc(state.tonicPc)`), not the minor tonic itself, so e.g. D minor
   (relative of F major) shows flats and A minor (relative of C major) shows sharps.
4. Selecting F major: the chord list's IV entry reads "Bb", not "A#". Selecting Bb
   major: its II entry reads "Eb" (ii chord), not "D#". Selecting Db, Eb, and Ab major
   show the equivalent corrected spellings. Selecting G, D, A, E, B, F#, or C major is
   visually unchanged from current behavior — no regression on the sharp side.
5. New tests in fretboard.test.ts: `noteName(pc, keyTonicPc)` returns the correct flat
   spelling for each of the 5 flat-side keys against at least one in-key accidental pc,
   returns the existing sharp spelling for every sharp-side key and for calls with no
   `keyTonicPc`, and throws on out-of-range `pc` exactly as it does today.
6. `bun test apps/fretboard/fretboard.test.ts` stays green. oxlint stays clean on
   apps/fretboard.

Constraints:
- Bun + TypeScript only, matching the app's existing zero-dependency style.
- No changes to `pitchClass`, `triadNotes`, `diatonicTriads`, voicing search, triad
  layout, playback, or persisted state — this is a display-only fix in the naming layer.
- Keep the flat-name table and the flat-side-tonic set as plain, testable data (an
  array/Set), not embedded string logic scattered across call sites.

Out of scope: full per-scale-degree letter-name spelling for edge cases outside the
app's 12 circle-of-fifths majors, double sharps/flats, a manual sharp/flat override
toggle for the user (auto-detect from the selected key is enough), and respelling notes
that are NOT rendered in a key context (e.g. any note name shown with no selected key).
