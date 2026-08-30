Add diatonic seventh chords (Imaj7, iim7, iiim7, IVmaj7, V7, vim7, viim7b5) as a "7ths"
mode of the chord-diagram panel, alongside the existing plain triads.

Why it matters: the app currently only builds triads. It has no way to show or play a
dominant 7th, which is the single chord that explains WHY V pulls to I — the sound is
the theory. Extending `diatonicTriads` to 7th chords is real, contained music-theory
work: `theory.ts` already derives each diatonic triad's quality from its scale degrees
(`classifyQuality`), so the same pattern extends to a 4-note chord by also grabbing the
7th scale degree and classifying the interval from root to it. Note that seventh-chord
quality is NOT derivable from triad quality alone — V and IV are both major triads in a
major key, but V takes a dominant 7th (b7) while IV takes a major 7th. The classification
has to look at the actual scale degree, the same way `diatonicTriads` does today.

Where: apps/fretboard/theory.ts (new types + `diatonicSevenths`), apps/fretboard/voicing.ts
(loosen the 3-tuple type so the existing search works on 4 tones — see below),
apps/fretboard/index.html (a "7ths" toggle in the chord-diagram panel),
apps/fretboard/main.ts (wiring, limited to the chord-diagram panel only — see scope),
apps/fretboard/fretboard.test.ts (new tests).

Scope, read before starting: keep this change additive and confined to the chord-diagram
panel. Do NOT touch `Triad`, `noteRoleInTriad`, `triad-layout.ts`, or `state.selected`'s
type — the triad-layout ("Triad layout") panel and the fretboard-explorer panel are both
built around exactly 3 roles (root/third/fifth) by name and design, and neither needs to
change for this feature. When the "7ths" toggle is off, everything behaves exactly as it
does today. When it's on, ONLY the chord-diagram panel's chord list and voicing search
switch to the 7-tone chord set; the triad-layout panel and explorer keep operating on
plain triads, unaffected. This is deliberately the low-risk path — forking a parallel
4-note flow for one panel — rather than generalizing every triad-shaped module in the app.
Also: `voicing.ts`'s `findVoicings`/`bestVoicing`/`isValid` already don't care how many
chord tones they're matching (`for (const tone of chordTones)` isn't 3-specific) — the
only thing hardcoding "3" is the `[number, number, number]` type annotation. Loosening
that to `readonly number[]` is the whole change needed there; no algorithm changes.

Done means:
1. theory.ts exports a `SeventhQuality` type ("major7" | "dominant7" | "minor7" |
   "half-diminished7" | "diminished7"), a `Seventh` type (`{ degree: string; root:
   number; quality: SeventhQuality; notes: [number, number, number, number] }`), and
   `diatonicSevenths(tonicPc: number, mode: "major" | "minor"): Seventh[]` returning 7
   entries. For C major it must return exactly: Imaj7 (C E G B), iim7 (D F A C), iiim7 (E
   G B D), IVmaj7 (F A C E), V7 (G B D F), vim7 (A C E G), viim7b5 (B D F A).
2. voicing.ts: `findVoicings`/`bestVoicing`/`isValid` accept `readonly number[]` for
   chord tones instead of a fixed 3-tuple. Every existing 3-tone call site keeps
   compiling and behaves identically (regression-covered by the existing test suite,
   unmodified).
3. The chord-diagram panel gets a "7ths" toggle. Off (default): unchanged current
   behavior. On: the chord list renders `diatonicSevenths(state.tonicPc, state.mode)`'s 7
   entries (e.g. "V7 — G7") instead of `diatonicTriads`'s; selecting one searches for a
   voicing containing all 4 tones via `findVoicings` and renders/plays it using the
   diagram's existing root-vs-non-root coloring (no new per-role color needed — the
   diagram doesn't distinguish third/fifth today either); the caption states the chord's
   full name (e.g. "G7: ...").
4. Toggling "7ths" does not change the Triad-layout panel or Fretboard-explorer panel's
   rendering, state, or behavior in any way — verify by confirming `state.selected`'s
   type, `triad-layout.ts`, and `noteRoleInTriad` are untouched by this change.
5. New tests in fretboard.test.ts: `diatonicSevenths` matches the 7 expected C-major
   chords above exactly (degree, quality, and notes); at least one flat/sharp-tonic key
   classifies correctly too; `findVoicings` given a real 4-tone dominant-7 set (G7: G, B,
   D, F) returns at least one fingering containing all 4 pitch classes; every existing
   `findVoicings`/`diatonicTriads` test still passes unmodified.
6. bun test apps/fretboard/fretboard.test.ts stays green. oxlint stays clean on
   apps/fretboard.

Constraints:
- Bun + TypeScript only, matching the app's existing zero-dependency style.
- Don't add per-role (third/fifth/seventh) coloring to the chord diagram — that's
  separate scope from this task.
- No new dependencies, no persistence of the "7ths" toggle across reloads.

Out of scope: seventh chords in the triad-layout panel or fretboard explorer, per-role
coloring in the chord diagram, extended/altered chords (9ths, 11ths, sus, add-chords),
inversions of seventh chords, non-diatonic (secondary-dominant) seventh chords, and
persisting the toggle state.
