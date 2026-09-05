# Implementation Plan: Play Diatonic Progression Control (I–IV–V–vi)

## Summary

Add a "Play progression" control in the chord diagram panel of the fretboard explorer that plays the diatonic I–IV–V–vi progression of the currently selected key in sequence as four short strummed chords.

`playNotes` in `apps/fretboard/main.ts` unconditionally calls `stopAllVoices(ctx)` to cut off previously sounding voices on each invocation. Calling `playNotes` once per chord would cause each subsequent chord to abruptly cut off the previous chord, leaving only the final chord audible. To solve this, a new pure function `progressionNotes` in `apps/fretboard/playback.ts` concatenates all notes across all chords into a single `SoundedNote[]` sequence with appropriate per-chord step offsets plus intra-chord arpeggio stagger, so `playNotes` can be called exactly once.

---

## Files to Touch

1. `apps/fretboard/playback.ts`:
   - Export constant `PROGRESSION_STEP_SECONDS = 0.9`
   - Export pure function `progressionNotes(voicings: readonly (Fingering | null)[], opts?: { stepSeconds?: number }): SoundedNote[]`
2. `apps/fretboard/index.html`:
   - Add `<button id="progression-play" type="button" class="play-button" aria-label="Play progression">&#9654; Play progression</button>` inside `.voicing-controls` in `#chord-panel`.
   - Add `flex-wrap: wrap` to `.voicing-controls` CSS to accommodate the new button cleanly across viewport widths.
3. `apps/fretboard/main.ts`:
   - Import `progressionNotes` from `./playback.ts`.
   - Query `const progressionPlayBtn = document.getElementById("progression-play") as HTMLButtonElement;`.
   - Attach click listener to `progressionPlayBtn`:
     - Retrieve diatonic triads via `diatonicTriads(state.tonicPc, state.mode)`.
     - Extract degrees `[0, 3, 4, 5]` (I, IV, V, vi).
     - Map each degree to its first voicing via `findVoicings(triad.notes, triad.root)[0] ?? null`.
     - Generate combined notes list via `progressionNotes(voicings)`.
     - Call `playNotes(notes)` once.
4. `apps/fretboard/fretboard.test.ts`:
   - Import `PROGRESSION_STEP_SECONDS` and `progressionNotes` from `./playback.ts`.
   - Add test suite covering:
     - Two single-note fingerings produce notes whose offsets differ by exactly `stepSeconds`.
     - A `null` entry is skipped and does not shift later chords' offsets by an extra step.
     - Multi-string voicing preserves intra-chord stagger (`NOTE_STAGGER_SECONDS`) on top of chord step offset.
     - Default `stepSeconds` matches `PROGRESSION_STEP_SECONDS` (0.9s).
     - Empty inputs or array of all nulls return `[]`.
     - Negative `stepSeconds` throws `RangeError`.

---

## Detailed Implementation Steps

### Step 1: Pure Playback Planning in `apps/fretboard/playback.ts`

- Add and export constant:
  ```ts
  /** Default step time between chord onsets in a progression sequence. */
  export const PROGRESSION_STEP_SECONDS = 0.9;
  ```
- Implement `progressionNotes`:
  ```ts
  /**
   * Combines multiple chord voicings into a single sounded note timeline.
   *
   * Each valid fingering is scheduled at `chordIndex * stepSeconds` plus that
   * voicing's intra-chord arpeggio stagger. `null` voicings contribute zero
   * notes and are skipped without shifting subsequent chords' offsets by an extra step.
   */
  export function progressionNotes(
    voicings: readonly (Fingering | null)[],
    opts?: { stepSeconds?: number }
  ): SoundedNote[] {
    const stepSeconds = opts?.stepSeconds ?? PROGRESSION_STEP_SECONDS;
    if (stepSeconds < 0) {
      throw new RangeError(`stepSeconds must be >= 0, got ${stepSeconds}`);
    }

    const result: SoundedNote[] = [];
    let chordIndex = 0;

    for (const fingering of voicings) {
      if (!fingering) continue;
      const chordOffset = chordIndex * stepSeconds;
      const notes = notesForVoicing(fingering);
      for (const note of notes) {
        result.push({
          ...note,
          offset: chordOffset + note.offset,
        });
      }
      chordIndex++;
    }

    return result;
  }
  ```
- Characteristics:
  - Pure function, no DOM, no Web Audio.
  - Reuses existing `notesForVoicing(fingering)` for note generation and intra-chord arpeggiation stagger.
  - `null` entries are skipped without advancing `chordIndex`, satisfying the requirement that a null entry does not shift later chords' offsets by an extra step.

### Step 2: DOM & CSS in `apps/fretboard/index.html`

- In the `.voicing-controls` CSS rule (around line 168), add `flex-wrap: wrap;`:
  ```css
  .voicing-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }
  ```
- In the `#chord-panel` template (around line 337), add `#progression-play` next to `#chord-play`:
  ```html
  <div class="voicing-controls">
    <button id="voicing-prev" type="button" aria-label="Previous voicing">&#8592; Prev</button>
    <span id="voicing-position" aria-live="polite"></span>
    <button id="voicing-next" type="button" aria-label="Next voicing">Next &#8594;</button>
    <button id="chord-play" type="button" class="play-button" aria-label="Play chord">&#9654; Play chord</button>
    <button id="progression-play" type="button" class="play-button" aria-label="Play progression">&#9654; Play progression</button>
  </div>
  ```

### Step 3: Wiring in `apps/fretboard/main.ts`

- Import `progressionNotes` from `./playback.ts`:
  ```ts
  import {
    notesForPositions,
    notesForVoicing,
    soundedNote,
    noteEnvelope,
    gainForVoiceCount,
    progressionNotes,
    type SoundedNote,
  } from "./playback.ts";
  ```
- Query the button in DOM caching section:
  ```ts
  const chordPlayBtn = document.getElementById("chord-play") as HTMLButtonElement;
  const progressionPlayBtn = document.getElementById("progression-play") as HTMLButtonElement;
  ```
- In `attachListeners()`, add the click handler:
  ```ts
  const PROGRESSION_DEGREES = [0, 3, 4, 5] as const;

  progressionPlayBtn.addEventListener("click", () => {
    const triads = diatonicTriads(state.tonicPc, state.mode);
    const voicings = PROGRESSION_DEGREES.map((degIdx) => {
      const triad = triads[degIdx];
      if (!triad) return null;
      const found = findVoicings(triad.notes, triad.root);
      return found[0] ?? null;
    });
    playNotes(progressionNotes(voicings));
  });
  ```
- Key behaviors:
  - Reads `state.tonicPc` and `state.mode` on demand, so changing key or mode immediately plays the new progression on the next click without requiring extra clicks or re-binding.
  - Calls `playNotes` exactly once with the unified `SoundedNote[]`.
  - Independent of `state.selected` (plays the key's I–IV–V–vi progression regardless of which chord is currently selected).

### Step 4: Unit Testing in `apps/fretboard/fretboard.test.ts`

- Import `PROGRESSION_STEP_SECONDS` and `progressionNotes` from `./playback.ts`.
- Add test suite:
  ```ts
  describe("progressionNotes", () => {
    test("two single-note fingerings produce two notes whose offsets differ by exactly stepSeconds", () => {
      const f1: Fingering = [null, null, null, null, null, 0];
      const f2: Fingering = [null, null, null, null, null, 2];
      const step = 0.8;
      const notes = progressionNotes([f1, f2], { stepSeconds: step });

      expect(notes.length).toBe(2);
      expect(notes[0].offset).toBeCloseTo(0, 9);
      expect(notes[1].offset).toBeCloseTo(step, 9);
      expect(notes[1].offset - notes[0].offset).toBeCloseTo(step, 9);
    });

    test("a null entry among the fingerings is skipped and does not shift later chords' offsets by an extra step", () => {
      const f1: Fingering = [null, null, null, null, null, 0];
      const f2: Fingering = [null, null, null, null, null, 2];
      const step = 0.75;
      const notes = progressionNotes([f1, null, f2], { stepSeconds: step });

      expect(notes.length).toBe(2);
      expect(notes[0].offset).toBeCloseTo(0, 9);
      expect(notes[1].offset).toBeCloseTo(step, 9);

      // Leading null is also skipped without delay
      const notesLeading = progressionNotes([null, f1], { stepSeconds: step });
      expect(notesLeading.length).toBe(1);
      expect(notesLeading[0].offset).toBeCloseTo(0, 9);

      // Null array yields empty list
      expect(progressionNotes([null, null])).toEqual([]);
      expect(progressionNotes([])).toEqual([]);
    });

    test("a fingering with multiple sounded strings preserves notesForVoicing's existing intra-chord stagger on top of the chord's step offset", () => {
      const cVoicing = bestVoicing([0, 4, 7], 0)!;
      const gVoicing = bestVoicing([7, 11, 2], 7)!;
      const step = 1.0;
      const notes = progressionNotes([cVoicing, gVoicing], { stepSeconds: step });

      const cNotes = notesForVoicing(cVoicing);
      const gNotes = notesForVoicing(gVoicing);
      expect(notes.length).toBe(cNotes.length + gNotes.length);

      // First chord notes match intra-chord stagger starting at 0
      for (let i = 0; i < cNotes.length; i++) {
        expect(notes[i].string).toBe(cNotes[i].string);
        expect(notes[i].fret).toBe(cNotes[i].fret);
        expect(notes[i].offset).toBeCloseTo(cNotes[i].offset, 9);
      }

      // Second chord notes match intra-chord stagger starting at step
      const offsetBase = cNotes.length;
      for (let j = 0; j < gNotes.length; j++) {
        expect(notes[offsetBase + j].string).toBe(gNotes[j].string);
        expect(notes[offsetBase + j].fret).toBe(gNotes[j].fret);
        expect(notes[offsetBase + j].offset).toBeCloseTo(step + gNotes[j].offset, 9);
      }
    });

    test("defaults stepSeconds to PROGRESSION_STEP_SECONDS when omitted", () => {
      const f1: Fingering = [null, null, null, null, null, 0];
      const f2: Fingering = [null, null, null, null, null, 2];
      const notes = progressionNotes([f1, f2]);
      expect(notes[1].offset).toBeCloseTo(PROGRESSION_STEP_SECONDS, 9);
    });

    test("throws RangeError on negative stepSeconds", () => {
      const f1: Fingering = [null, null, null, null, null, 0];
      expect(() => progressionNotes([f1], { stepSeconds: -0.1 })).toThrow(RangeError);
    });
  });
  ```

---

## Verification Plan

1. **Run Unit Tests**:
   ```bash
   bun test apps/fretboard/fretboard.test.ts
   ```
   All tests, including new `progressionNotes` tests, must pass.

2. **Run Linter**:
   ```bash
   bunx oxlint apps/fretboard
   ```
   Ensure no new lint errors or warnings are introduced in `apps/fretboard`.

3. **Manual / Sanity Check**:
   - Check that `#progression-play` button is present and styled with `.play-button` in `#chord-panel`.
   - Verify that clicking `#progression-play` gathers `diatonicTriads(state.tonicPc, state.mode)` at degrees 0, 3, 4, 5 (I, IV, V, vi in major; i, iv, v, VI in minor) and schedules them in sequence.
