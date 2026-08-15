Add a Play button to the triad layout panel that plays the current triad's three notes
out loud, in the order its current inversion puts them on the fretboard, using the Web
Audio API.

Why it matters: the triad layout panel already shows root/first/second inversion as
three colored dots on three strings, but a diagram teaches the eye, not the ear.
Hearing the same three notes come out lowest-to-highest in a different order per
inversion is the actual point of that panel existing — right now it's silent.

Where: apps/fretboard/index.html (the button), apps/fretboard/main.ts (the only file
that touches the DOM — wiring and the AudioContext playback belong here),
apps/fretboard/fretboard.ts (add the new pitch/frequency helper next to the existing
STANDARD_TUNING it depends on — a new file is fine too if that reads cleaner),
apps/fretboard/fretboard.test.ts (new tests).

The one gotcha that matters, read before starting: `pitchAtFret` in fretboard.ts
deliberately returns only a pitch CLASS (0–11, via `% 12`) — it throws away octave on
purpose, because the diagram only ever needed to know which note name sounds, not which
octave. That is exactly the information real audio playback needs. Do not try to
recover it from pitchAtFret. Add a second, octave-aware function instead (e.g. a real
MIDI-note-number tuning table for the six open strings — standard tuning is E2 A2 D3 G3
B3 E4, MIDI 40/45/50/55/59/64 low string to high — plus fret to get a note's MIDI
number, plus the standard MIDI-to-frequency formula). Leave pitchAtFret's existing
signature and behavior untouched; the chord diagram and the voicing search both depend
on it staying pitch-class-only.

Done means:
1. A "Play" button appears in the triad panel (near the existing legend/caption),
   disabled exactly when the panel already shows "no layout found" or no chord is
   selected — same disabled logic voicing-prev/voicing-next already use as a pattern.
2. Clicking it plays the three notes of whatever `layoutTriadOnStringSet` currently
   returns — the CURRENT inversion and CURRENT string set, not a hardcoded one — as a
   short ascending arpeggio (low string's note first), each note audibly at its real
   pitch (the low string's note sounds lower than the high string's, even when they
   share a pitch class).
3. Switching the inversion dropdown or the string-set dropdown and pressing Play again
   audibly reflects the new layout with no extra clicks — this is the whole feature.
4. New unit tests in fretboard.test.ts cover the new frequency/MIDI helper directly
   (no AudioContext, no DOM): the six open strings resolve to their correct
   frequencies, a fretted note matches hand-computed MIDI math, and a note 12 frets
   higher on the same string is exactly double the frequency of the open string.
5. Clicking Play again while a previous playback is still sounding does not throw or
   leave a stuck/hung AudioContext — overlapping the sounds or cutting the previous one
   off are both fine, an unhandled error is not.
6. bun test apps/fretboard/fretboard.test.ts stays green. oxlint stays clean on
   apps/fretboard.

Constraints:
- Web Audio API only (AudioContext, OscillatorNode, GainNode). No audio libraries, no
  new dependencies, no package.json — this app has none today and should still have
  none after.
- All AudioContext/DOM code stays in main.ts. The pure modules (theory.ts, fretboard.ts,
  voicing.ts, triad-layout.ts, voicing-browser.ts, view-mode.ts) stay dependency-free and
  DOM-free, same as every existing function in them — the new MIDI/frequency function
  belongs with them, the AudioContext calls that use it do not.
- Give each played note a short attack/decay gain envelope (a linear or exponential
  ramp is enough) rather than a hard on/off — an un-enveloped square/sine wave clicks
  audibly at start and stop.

Out of scope: playing the chord-diagram voicing (this is the triad panel only, not the
chord panel), volume or instrument controls, autoplay on chord/inversion change without
clicking Play, keyboard shortcuts, MIDI export, and any backend change — there is no
backend in this app.
