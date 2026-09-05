Add a "Play progression" control that plays the I–IV–V–vi diatonic progression of the
currently selected key, in sequence, as four short strummed chords.

Why it matters: playback.ts already gives pure planning functions (`notesForVoicing`,
`noteEnvelope`, `playbackDuration`), main.ts already has `playNotes`, and `theory.ts`
already builds the full diatonic chord set via `diatonicTriads`. Hearing I–IV–V–vi in
the selected key — the harmonic motion that makes the circle of fifths matter — is
exactly the intuition this app exists to build, and it is currently unreachable: you can
only play one chord at a time.

Where: apps/fretboard/playback.ts (new pure function to combine several chords' notes
into one correctly-offset sequence), apps/fretboard/main.ts (the button, wiring — the
only file that touches AudioContext/DOM), apps/fretboard/index.html (the button, near
the existing `#chord-play` button), apps/fretboard/fretboard.test.ts (new tests).

The one gotcha that matters, read before starting: `playNotes` in main.ts calls
`stopAllVoices(ctx)` unconditionally on every call — it exists to cut off whatever was
previously sounding before playing something new. If you call `playNotes` once per chord
in the progression, each chord's `playNotes` call will immediately kill the chord before
it, and you'll hear nothing but the last chord. Do not call `playNotes` four times.
Instead, build ONE combined `SoundedNote[]` list spanning the whole progression — each
chord's notes offset by that chord's own start time in the sequence, on top of the
existing intra-chord arpeggio stagger `notesForVoicing` already applies — and call
`playNotes` exactly once with the combined list.

Done means:
1. New pure function in playback.ts, e.g.
   `progressionNotes(voicings: readonly (Fingering | null)[], opts?: { stepSeconds?: number }): SoundedNote[]`
   — takes one `Fingering` per chord (a `null` entry means "no voicing found, skip this
   chord"), and returns every sounded note of every chord concatenated into one list,
   each note's `offset` shifted by `chordIndex * stepSeconds` (default a fixed constant,
   e.g. 0.9s) plus its own intra-chord stagger. A `null` voicing contributes zero notes
   without throwing.
2. A "Play progression" button appears in the chord-diagram panel near the existing
   voicing-prev/voicing-next/chord-play controls.
3. Clicking it takes the triads at diatonic degree indices 0, 3, 4, and 5 (I, IV, V, vi
   in major mode; i, iv, v, VI in minor mode) from `diatonicTriads(state.tonicPc,
   state.mode)`, looks up each one's first voicing the same way the chord diagram already
   does (`findVoicings(triad.notes, triad.root)[0]`), builds the combined note list via
   `progressionNotes`, and calls `playNotes` once. All four chords are audibly distinct
   in sequence, none is cut off by the next `playNotes` call clobbering it.
4. Changing the key or mode and clicking again plays the new key's I–IV–V–vi with no
   extra clicks.
5. New tests in fretboard.test.ts cover `progressionNotes` directly (no AudioContext, no
   DOM): two single-note fingerings produce two notes whose offsets differ by exactly
   `stepSeconds`; a `null` entry among the fingerings is skipped and does not shift later
   chords' offsets by an extra step; a fingering with multiple sounded strings preserves
   `notesForVoicing`'s existing intra-chord stagger on top of the chord's step offset.
6. bun test apps/fretboard/fretboard.test.ts stays green. oxlint stays clean on
   apps/fretboard.

Constraints:
- `progressionNotes` stays in playback.ts, pure — no DOM, no AudioContext, matching every
  other function in that module.
- Reuse `findVoicings`/`notesForVoicing`, don't duplicate voicing-search or
  note-offsetting logic that already exists.
- The per-chord step interval is a fixed constant, not a user-facing tempo control.
- No new dependencies.

