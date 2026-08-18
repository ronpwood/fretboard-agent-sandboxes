# Plan: Triad Audio Playback Feature

Add a "Play" button to the triad layout panel in the fretboard app that plays the current triad's three notes in ascending pitch order using the Web Audio API.

## User Context & Requirements

- **Goal**: Allow users to hear the triad's 3 notes played out loud as a short ascending arpeggio (lowest string's note to highest string's note) based on the current triad selection, inversion, and string set.
- **Location**:
  - `apps/fretboard/index.html` (Play button markup & styling)
  - `apps/fretboard/main.ts` (DOM wiring, button state handling, AudioContext playback)
  - `apps/fretboard/fretboard.ts` (Octave-aware MIDI pitch & frequency calculations)
  - `apps/fretboard/fretboard.test.ts` (Unit tests for frequency/MIDI helper functions)
- **Constraints**:
  - Web Audio API only (`AudioContext`, `OscillatorNode`, `GainNode`). No audio libraries, no external dependencies.
  - All DOM/AudioContext logic stays in `main.ts`. Pure modules (`fretboard.ts`, `theory.ts`, `triad-layout.ts`, etc.) remain DOM-free and side-effect free.
  - Envelope: apply attack/decay gain envelopes (e.g., linear ramp up, linear decay down) to avoid audio clicks.
  - Existing `pitchAtFret` signature and pitch-class-only (0–11) behavior must remain untouched.
  - Overlapping playback or repeated button clicks must not cause errors or stuck/hung AudioContexts.

---

## Detailed Step-by-Step Implementation

### Step 1: Add MIDI & Frequency Helpers to `apps/fretboard/fretboard.ts`

1. Define `STANDARD_TUNING_MIDI` array corresponding to the 6 open strings in Standard Tuning (E2, A2, D3, G3, B3, E4):
   `export const STANDARD_TUNING_MIDI: number[] = [40, 45, 50, 55, 59, 64];`
2. Implement `midiNoteAtFret(stringIndex: number, fret: number): number`:
   - Validate `stringIndex` (must be integer between 0 and 5, inclusive; throw `RangeError` if invalid).
   - Validate `fret` (must be integer >= 0; throw `RangeError` if invalid).
   - Return `STANDARD_TUNING_MIDI[stringIndex] + fret`.
3. Implement `midiToFrequency(midi: number): number`:
   - Return $440 \times 2^{(midi - 69) / 12}$.
4. Implement `frequencyAtFret(stringIndex: number, fret: number): number`:
   - Return `midiToFrequency(midiNoteAtFret(stringIndex, fret))`.

### Step 2: Add Unit Tests in `apps/fretboard/fretboard.test.ts`

Add a new test block `describe("frequencyAtFret / MIDI helpers", ...)`:
1. **Open String Frequencies**:
   - Verify all 6 open strings (fret 0) resolve to their correct frequencies:
     - String 0 (E2): ~82.41 Hz
     - String 1 (A2): 110.0 Hz
     - String 2 (D3): ~146.83 Hz
     - String 3 (G3): ~196.00 Hz
     - String 4 (B3): ~246.94 Hz
     - String 5 (E4): ~329.63 Hz
2. **Hand-Computed MIDI Math / Fretted Notes**:
   - Verify `midiNoteAtFret(1, 12)` is 57 (A3) and frequency is 220.0 Hz.
   - Verify `midiNoteAtFret(5, 5)` is 69 (A4) and frequency is 440.0 Hz.
   - Verify `midiNoteAtFret(0, 0)` is 40.
3. **Octave Doubling (12 Frets Higher)**:
   - Verify for strings 0 through 5 that `frequencyAtFret(s, 12)` is exactly double `frequencyAtFret(s, 0)`.
4. **Range Error Handling**:
   - Verify `midiNoteAtFret` and `frequencyAtFret` throw `RangeError` for negative frets, non-integer frets, or out-of-range string indices (< 0 or > 5).

### Step 3: Add Play Button Markup and Style in `apps/fretboard/index.html`

1. Inside `#triad-panel`, near the `.legend` element, add the Play button:
   ```html
   <div class="triad-actions" style="margin-top: 0.75rem;">
     <button id="play-triad-btn" type="button">Play</button>
   </div>
   ```
2. Add CSS rule for `#play-triad-btn`:
   ```css
   #play-triad-btn {
     padding: 0.35rem 0.75rem;
     background: #22242f;
     color: var(--text);
     border: 1px solid var(--border);
     border-radius: 4px;
     cursor: pointer;
     font-size: 0.9rem;
   }
   #play-triad-btn:disabled {
     opacity: 0.4;
     cursor: default;
   }
   ```

### Step 4: Wire Play Button & Web Audio Playback in `apps/fretboard/main.ts`

1. Import `frequencyAtFret` from `./fretboard.ts`.
2. Cache DOM reference:
   `const playTriadBtn = document.getElementById("play-triad-btn") as HTMLButtonElement;`
3. Update `renderTriadDiagram()`:
   - When no chord is selected (`!state.selected`), set `playTriadBtn.disabled = true;`.
   - When no layout is found for string set (`!layout`), set `playTriadBtn.disabled = true;`.
   - When valid `layout` is present, set `playTriadBtn.disabled = false;`.
4. Implement lazy `AudioContext` acquisition function `getAudioContext()`:
   ```ts
   let audioCtx: AudioContext | null = null;
   function getAudioContext(): AudioContext {
     if (!audioCtx) {
       const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
       audioCtx = new AudioCtx();
     }
     if (audioCtx.state === "suspended") {
       audioCtx.resume();
     }
     return audioCtx;
   }
   ```
5. Implement `playTriadArpeggio()`:
   - Verify `state.selected` is present.
   - Calculate current layout:
     `const layout = layoutTriadOnStringSet(chord.root, chord.quality, state.inversion, STRING_SETS[state.stringSetIndex]);`
   - If `!layout`, return.
   - Call `getAudioContext()`.
   - Iterate over `layout` array (3 items: index 0 low string, index 1 mid string, index 2 high string):
     - For note index `i` (0, 1, 2):
       - Calculate `freq = frequencyAtFret(pos.string, pos.fret)`.
       - `t = ctx.currentTime + i * 0.25` (250 ms spacing between notes).
       - Create `osc = ctx.createOscillator()`, `gain = ctx.createGain()`.
       - `osc.type = "triangle"` (smooth guitar-like sound).
       - `osc.frequency.setValueAtTime(freq, t)`.
       - Envelope:
         - `gain.gain.setValueAtTime(0, t);`
         - `gain.gain.linearRampToValueAtTime(0.25, t + 0.02);` (20 ms attack)
         - `gain.gain.linearRampToValueAtTime(0, t + 0.40);` (380 ms decay)
       - Connect `osc -> gain -> ctx.destination`.
       - `osc.start(t);`
       - `osc.stop(t + 0.40);`
   - Wrap playback logic in `try ... catch` to prevent any unhandled AudioContext errors.
6. Attach event listener in `attachListeners()`:
   `playTriadBtn.addEventListener("click", playTriadArpeggio);`

---

## Verification Plan

### Automated Verification
Run the existing and new unit tests:
```bash
bun test apps/fretboard/fretboard.test.ts
```
Run oxlint to ensure code cleanliness:
```bash
bunx oxlint apps/fretboard
```

### Criteria for Success
1. `bun test apps/fretboard/fretboard.test.ts` passes with 0 failures, including all new tests covering frequency resolution, open strings, fretted notes, and 12-fret octave doubling.
2. `bunx oxlint apps/fretboard` passes with 0 lint errors.
3. DOM Play button in `index.html` is correctly positioned in the triad layout panel and disabled when no chord or layout exists.
4. Clicking Play plays 3 ascending notes for the selected triad/inversion/string-set without errors.
