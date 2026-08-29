# Plan: Fretboard Explorer Feature

Add an interactive **Fretboard Explorer** view mode (`ViewMode = "explorer"`) to `apps/fretboard`. This mode provides a full-neck (frets 0–12 across all 6 strings) SVG visualization of chord and scale notes in the selected key, with role/interval labeling, interactive note auditioning via Web Audio, and display filtering.

---

## User Context & Requirements

- **Goal**: Give users a full 12-fret neck diagram showing all note occurrences across all strings for the selected chord or key/scale.
- **Location**:
  - `apps/fretboard/view-mode.ts` (extend `ViewMode` type to `"chord" | "triad" | "explorer"`)
  - `apps/fretboard/fretboard.ts` (pure functions for full fretboard note generation, filtering, and role calculations)
  - `apps/fretboard/persisted-state.ts` (support `"explorer"` view state persistence)
  - `apps/fretboard/index.html` (add Fretboard Explorer view button, `#explorer-panel` markup, SVG `#explorer-diagram`, controls, and styling)
  - `apps/fretboard/main.ts` (DOM wiring, SVG neck & note marker rendering, filter/label mode state, note click audio playback, and "Play All" arpeggio)
  - `apps/fretboard/fretboard.test.ts` (unit tests for view-mode extension, fretboard note calculations, role mapping, and persistence)
- **Constraints**:
  - Web Audio API only (`AudioContext`, `OscillatorNode`, `GainNode`). Zero external dependencies or npm packages.
  - Pure modules (`fretboard.ts`, `theory.ts`, `view-mode.ts`, `persisted-state.ts`) remain DOM-free and side-effect free.
  - Overlapping note playback must handle AudioContext state safely without throwing.
  - Existing suite in `fretboard.test.ts` must remain green.
  - `oxlint` must report 0 lint errors.

---

## Detailed Step-by-Step Implementation

### Step 1: Extend View Mode in `apps/fretboard/view-mode.ts`

1. Update `ViewMode` type definition:
   ```ts
   export type ViewMode = "chord" | "triad" | "explorer";
   ```
2. Update `VIEW_MODES`:
   ```ts
   export const VIEW_MODES: readonly ViewMode[] = ["chord", "triad", "explorer"];
   ```
3. Update `toViewMode(value: unknown)`:
   - Check `value === "chord" || value === "triad" || value === "explorer"` before returning; fallback to `DEFAULT_VIEW`.
4. Update `otherView(view: ViewMode)`:
   - Cycle through views or handle `"explorer"` gracefully (e.g. cycle `chord` -> `triad` -> `explorer` -> `chord`).
5. Update `viewLabel(view: ViewMode)`:
   - Return `"Fretboard explorer"` for `"explorer"`.
6. Update `panelVisibility(view: ViewMode)`:
   - Return `{ chord: view === "chord", triad: view === "triad", explorer: view === "explorer" }`.

### Step 2: Add Fretboard Pure Logic Helpers to `apps/fretboard/fretboard.ts`

1. Define `FretboardNotePosition` type:
   ```ts
   export type FretboardNotePosition = {
     stringIndex: number; // 0..5 (0 = low E, 5 = high E)
     fret: number;        // 0..12
     pitchClass: number;  // 0..11
     midi: number;        // MIDI note number (e.g. 40..76)
   };
   ```
2. Implement `getAllFretboardNotes(maxFret: number = 12): FretboardNotePosition[]`:
   - Returns array of all 78 positions (6 strings x 13 frets 0..12).
   - Uses `pitchAtFret(s, f)` and `midiAtFret(s, f)` for pure math calculations.
3. Implement `filterFretboardNotes(notes: FretboardNotePosition[], targetPcs: number[]): FretboardNotePosition[]`:
   - Returns positions where `targetPcs.includes(note.pitchClass)`.
4. Implement `noteRoleInTriad(pc: number, rootPc: number, quality: Quality): "root" | "third" | "fifth" | "other"`:
   - Derives chord pitch classes using `triadNotes(rootPc, quality)` and returns `"root"`, `"third"`, `"fifth"`, or `"other"`.

### Step 3: Update Persistence in `apps/fretboard/persisted-state.ts`

1. `parseState` relies on `toViewMode`, which now accepts `"explorer"`.
2. Verify state serialization and deserialization with `view: "explorer"` round-trips cleanly.

### Step 4: Add HTML & CSS for Fretboard Explorer in `apps/fretboard/index.html`

1. In `<header>` `#view-toggle`:
   ```html
   <button id="view-explorer" type="button" role="radio" aria-pressed="false" data-view="explorer">Fretboard explorer</button>
   ```
2. In `<main>` `section.stage`:
   Add the Fretboard Explorer panel markup:
   ```html
   <div class="stage-panel" id="explorer-panel" hidden>
     <h2>Fretboard explorer</h2>
     <div class="explorer-controls">
       <div>
         <label for="explorer-filter">Filter notes</label>
         <select id="explorer-filter" aria-label="Filter notes">
           <option value="chord" selected>Selected chord notes</option>
           <option value="key">Key / scale notes</option>
         </select>
       </div>
       <div>
         <label for="explorer-label-mode">Marker labels</label>
         <select id="explorer-label-mode" aria-label="Marker labels">
           <option value="name" selected>Note name (e.g. C, E, G)</option>
           <option value="role">Role / degree (e.g. R, 3rd, 5th)</option>
           <option value="pc">Pitch class (0–11)</option>
         </select>
       </div>
       <div class="triad-play-controls">
         <button id="explorer-play" type="button" class="play-button" aria-label="Play all neck notes">&#9654; Play all</button>
       </div>
     </div>
     <svg id="explorer-diagram" viewBox="0 0 740 180" role="img" aria-label="12-fret guitar fretboard diagram"></svg>
     <div class="legend">
       <span><span class="swatch" style="background: var(--root-color);"></span>Root</span>
       <span><span class="swatch" style="background: var(--third-color);"></span>Third</span>
       <span><span class="swatch" style="background: var(--fifth-color);"></span>Fifth</span>
       <span><span class="swatch" style="background: var(--accent);"></span>Scale / Other</span>
     </div>
     <p id="explorer-caption" class="wheel-caption" aria-live="polite"></p>
   </div>
   ```
3. Add CSS rules in `<style>`:
   - `.explorer-controls`: flexbox layout matching `.triad-controls`.
   - `.fret-line`: stroke `#2b2e3d` or `#4a4e69`, nut fret 0 line thicker (`#edf0f7`).
   - `.string-line`: horizontal lines, varying stroke widths from string 0 (1.8px) to string 5 (0.8px).
   - `.fret-inlay`: dark circular inlays at frets 3, 5, 7, 9 (single dot) and fret 12 (double dot).
   - `.explorer-marker`: SVG circle markers with hover effects and focus-visible outlines.

### Step 5: Wire DOM, SVG Rendering, and Audio Playback in `apps/fretboard/main.ts`

1. Add explorer state variables:
   ```ts
   let explorerFilter: "chord" | "key" = "chord";
   let explorerLabelMode: "name" | "role" | "pc" = "name";
   ```
2. Cache DOM element references:
   - `viewExplorerBtn`, `explorerPanel`, `explorerFilterSelect`, `explorerLabelModeSelect`, `explorerPlayBtn`, `explorerDiagramSvg`, `explorerCaption`.
3. Implement `renderExplorerDiagram()`:
   - Set SVG viewBox to `0 0 740 180`.
   - Draw neck outline, 13 fret lines (fret 0 at x=50, fret 12 at x=710, spaced 55px apart; open string note markers placed at x=25).
   - Draw 6 horizontal string lines (string 5 high E at y=30, string 0 low E at y=150, spaced 24px apart).
   - Draw fret inlay markers at middle y=90 for frets 3, 5, 7, 9, and double dots at y=66 and y=114 for fret 12.
   - Determine target pitch classes based on `explorerFilter`:
     - If `"chord"`: chord pitch classes from `state.selected` (`triadNotes(state.selected.root, state.selected.quality)`), or empty if no chord selected.
     - If `"key"`: scale pitch classes derived from `diatonicTriads(state.tonicPc, state.mode).map(t => t.root)`.
   - Fetch all fretboard positions via `getAllFretboardNotes(12)` and filter using `filterFretboardNotes(notes, targetPcs)`.
   - For each matching note position:
     - Compute center `(x, y)`: open string (fret 0) at x=25; frets 1..12 placed in middle of fret span `(fret_start_x + fret_end_x) / 2`.
     - Determine note role via `noteRoleInTriad`. Apply swatch color (`--root-color`, `--third-color`, `--fifth-color`, or `--accent`).
     - Determine label text based on `explorerLabelMode`: `"name"` -> `noteName(pc)`, `"role"` -> `"R"`, `"3rd"`, `"5th"`, or scale degree, `"pc"` -> `pc.toString()`.
     - Create SVG `<g>` containing `<circle>` and `<text>`. Add `tabindex="0"`, `role="button"`, and `aria-label`.
     - Attach `click` and `keydown` (Enter/Space) handlers:
       - Trigger audio playback for the single note: create `soundedNote` at string & fret, schedule via Web Audio `noteEnvelope`.
       - Update `explorerCaption` with detailed text (e.g., "Playing C4 (Root of C major) on String 2 (D), Fret 10").
4. Wire view toggle buttons:
   - Handle `#view-explorer` click: update `state.view = "explorer"`, call `updateView()`, save state to localStorage.
5. Wire `#explorer-filter` and `#explorer-label-mode` `change` events:
   - Update `explorerFilter` and `explorerLabelMode`, re-render `renderExplorerDiagram()`.
6. Wire `#explorer-play` button click:
   - Collect all visible fretboard note positions sorted by MIDI note number ascending.
   - Call `notesForPositions` and schedule staggered arpeggio playback via `getAudioContext()`.

### Step 6: Add Unit Tests in `apps/fretboard/fretboard.test.ts`

Add test suites covering the new pure functions:
1. **View Mode Extensions**:
   - `toViewMode("explorer")` returns `"explorer"`.
   - `viewLabel("explorer")` returns `"Fretboard explorer"`.
   - `panelVisibility("explorer")` returns `{ chord: false, triad: false, explorer: true }`.
2. **`getAllFretboardNotes`**:
   - Returns exactly 78 positions for frets 0..12 across 6 strings.
   - Verifies low E open string is MIDI 40 (pitch class 4), high E 12th fret is MIDI 76 (pitch class 4).
3. **`filterFretboardNotes`**:
   - Correctly filters positions for pitch classes `[0, 4, 7]` (C major triad).
   - Verifies all returned notes have pitch classes 0, 4, or 7.
4. **`noteRoleInTriad`**:
   - Verifies pitch class 0 is `"root"`, 4 is `"third"`, 7 is `"fifth"` for C major.
   - Verifies correct role mapping for minor, diminished, and augmented triads.
5. **Persisted State Integration**:
   - Verifies `serializeState` and `parseState` handle `view: "explorer"` without loss or default fallback.

---

## Verification & Acceptance Criteria

1. **Unit Tests**: `bun test apps/fretboard/fretboard.test.ts` passes with all 287+ tests green.
2. **Linting**: `bun x oxlint@1.36.0 apps/fretboard` passes with 0 errors.
3. **View Toggling**: Toggling between "Chord diagram", "Triad layout", and "Fretboard explorer" updates button states and panel visibility cleanly.
4. **Full Neck SVG Rendering**: The 12-fret diagram renders frets, strings, inlays, and note markers accurately.
5. **Interactive Audio**: Clicking note markers on the fretboard or clicking "Play all" produces Web Audio output without errors.
