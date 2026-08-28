Add an interval-naming helper to the fretboard app's theory layer: a new module that names
the musical interval between two pitch classes.

Why it matters: the app can spell triads and lay out voicings, but it has no vocabulary for
the distance between two notes — the single most basic thing a theory tool gets asked. Every
future feature that explains WHY a voicing sounds the way it does (interval readouts on hover,
chord-tone labeling beyond root/third/fifth) needs this primitive first.

Where: a NEW module apps/fretboard/intervals.ts (pure functions, no DOM, no imports beyond
theory.ts if needed), plus tests. No UI wiring in this task.

Done means:
1. `intervalSemitones(fromPc: number, toPc: number): number` returns the ascending distance
   from fromPc to toPc in semitones, always in 0..11 (from C to G is 7; from G to C is 5 —
   direction matters, wrap with mod 12).
2. `intervalName(semitones: number): string` maps 0..11 to exactly these short names, in
   order: "P1", "m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7".
3. `intervalBetween(fromPc: number, toPc: number): string` composes the two: the name of the
   ascending interval from fromPc to toPc (C to E is "M3", E to C is "m6").
4. Out-of-range input throws: intervalName outside 0..11, and either pitch class outside
   0..11, must throw an Error naming the bad value — never return a wrong name silently.

Constraints:
- Bun + TypeScript only, matching the app's existing zero-dependency style.
- Pitch classes are integers 0..11 with 0 = C, matching theory.ts's pitchClass/noteName.
- The existing suite apps/fretboard/fretboard.test.ts stays green and untouched.

Out of scope: enharmonic spelling (no "d5 vs A4" — 6 is always "TT"), compound intervals
(everything wraps mod 12), descending-interval names, any UI, and any change to existing
modules.
