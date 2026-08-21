# Plan: Interactive circle-of-fifths wheel for `apps/circle-of-fifths-fretboard`

Today the circle of fifths only exists as the *ordering* of the key `<select>`
(`CIRCLE_OF_FIFTHS_MAJORS` in `theory.ts`). Add a real, clickable wheel: 12 wedges,
each wedge showing a major key on the outer ring and its relative minor on the inner
ring, with the currently selected key highlighted. Clicking a wedge sets the key (and
the mode, because the outer ring means major and the inner ring means minor); changing
the existing dropdown or Major/Minor toggle re-highlights the wheel.

Everything happens inside `apps/circle-of-fifths-fretboard/`.

---

## Repo facts the builder needs first

1. **No build step, no dependencies.** No `package.json`, no `tsconfig.json`, no lockfile,
   no `node_modules`, no CDN links. `bun` serves the TypeScript directly
   (`bun apps/circle-of-fifths-fretboard/index.html`). Do not add any of those. Do not add
   a dependency or a framework. No canvas, no chart library — hand-built SVG only.
2. **The test gate is wired to an exact path.** `adws/adw_modules/quality.py` (~line 151)
   runs `bun test apps/circle-of-fifths-fretboard/fretboard.test.ts`. New tests go in that
   file (it may import new modules). Do not rename that file. Do not edit `quality.py`.
   It currently reports `231 pass / 0 fail`; it must still be green when you finish.
3. **`main.ts` is the only file that touches the DOM**, and it calls `init()` at module
   scope, so it cannot be imported from `bun test` (no DOM in the test runtime). Any logic
   that wants a test must live in a **pure module** with no DOM imports — the same split the
   app already uses for `theory.ts` / `fretboard.ts` / `voicing.ts` / `triad-layout.ts` /
   `voicing-browser.ts` / `view-mode.ts`.
4. House style: short top-of-file comment explaining the module, named exports, no default
   export, `.ts` extensions in import specifiers, 2-space indent, double quotes, JSDoc
   one-liners on exported functions.
5. Note names are **sharps only** (`NOTE_NAMES` in `theory.ts`). The wheel uses the same
   spellings (`F#`, `C#`, `G#`, `D#`, `A#`) so its labels match the dropdown exactly. Do not
   introduce flat spellings or an enharmonic-naming feature.
6. `bun` is on PATH (v1.3.x). Call it by bare name.
7. Out of scope, do not touch: audio playback; URL/hash/localStorage persistence; alternate
   tunings; 7th chords, church modes, harmonic/melodic minor; the internals of
   `renderChordDiagram`, `renderTriadDiagram`, `voicing.ts`, `voicing-browser.ts`,
   `triad-layout.ts`, `fretboard.ts`, `view-mode.ts` (all read-only for this task); the
   header view toggle.

---

## Behaviour to deliver

- A circle-of-fifths wheel renders as SVG in the left picker column, above the existing
  Key control.
- **12 wedges**, one per key, clockwise from 12 o'clock in circle-of-fifths order:
  C, G, D, A, E, B, F#, C#, G#, D#, A#, F.
- Each wedge is split into two concentric bands: **outer band = major key**, **inner band =
  its relative minor** (`Am` inside `C`, `Em` inside `G`, …). Both labels are on the wedge,
  so the relative pairing is visible at a glance.
- **Clicking the outer band** selects that major key → `state.mode = "major"`,
  `state.tonicPc` = that major's pitch class.
  **Clicking the inner band** selects the relative minor → `state.mode = "minor"`,
  `state.tonicPc` = the relative minor's pitch class.
- Selecting a key from the wheel updates the diatonic chord list, picks the tonic (I/i)
  triad as the selected chord, and redraws the chord diagram and triad layout.
- **Two-way sync:**
  - wheel click → `#key-select` value and the Major/Minor `aria-pressed` states update;
  - `#key-select` change or Major/Minor click → the matching wheel band shows as selected.
- **Highlighting** makes relationships legible:
  - the selected band is filled with the accent colour (`--accent`) and carries
    `aria-pressed="true"`;
  - the *other* band of the same wedge (the relative major/minor partner) gets a distinctly
    lighter "related" fill;
  - the two neighbouring wedges (one fifth up = clockwise, one fifth down = counter-clockwise)
    get a subtle outline so the nearest keys stand out;
  - everything else is the plain panel fill.
- **Accessibility / interaction:** each band is keyboard reachable (`tabindex="0"`,
  `role="button"`, `aria-label` like `"G major"` / `"E minor"`, `aria-pressed`), responds to
  Enter and Space as well as click, and shows a hover/focus fill change. The wheel `<svg>`
  itself carries `role="group"` and `aria-label="Circle of fifths"`. Text labels must not
  swallow clicks (`pointer-events: none` on the label text).
- Switching view (chord ↔ triad) does not disturb the wheel.

---

## File 1 — `apps/circle-of-fifths-fretboard/theory.ts` (edit, additive only)

Relative-key arithmetic is music theory, so it belongs here, not in the geometry module.
Append after `CIRCLE_OF_FIFTHS_MAJORS` (do not modify anything already in the file):

```ts
/** Semitones from a major tonic up to its relative minor tonic (C -> A). */
export const RELATIVE_MINOR_OFFSET = 9;

/** Pitch class of the relative minor of a major key (C -> A). */
export function relativeMinorPc(majorPc: number): number {
  return ((majorPc + RELATIVE_MINOR_OFFSET) % 12 + 12) % 12;
}

/** Pitch class of the relative major of a minor key (A -> C). */
export function relativeMajorPc(minorPc: number): number {
  return ((minorPc - RELATIVE_MINOR_OFFSET) % 12 + 12) % 12;
}
```

---

## File 2 (new) — `apps/circle-of-fifths-fretboard/circle-wheel.ts`

Pure: the wheel's model **and** its geometry. Imports only from `./theory.ts`. No DOM.

Angle convention (state it in the file comment): **degrees clockwise from 12 o'clock**, so
`polarPoint` is `x = cx + r * sin(rad)`, `y = cy - r * cos(rad)`. Wedge `i` is centred on
`i * 30` degrees, spanning `i * 30 - 15` to `i * 30 + 15`.

Exports (names are load-bearing — the tests below use them):

```ts
export type WheelRing = "major" | "minor";

export type WheelSelection = { index: number; ring: WheelRing };

export type WheelSegment = {
  index: number;        // 0..11, clockwise from the top; 0 is C
  majorPc: number;      // pitch class of the major key
  majorName: string;    // "C", "G", ... (from NOTE_NAMES, sharps only)
  minorPc: number;      // relative minor pitch class
  minorName: string;    // "A", "E", ...
  startAngle: number;   // degrees clockwise from 12 o'clock
  endAngle: number;
  midAngle: number;
};

/** Number of wedges — one per key in the circle. */
export const WHEEL_SEGMENT_COUNT = 12;

/** Drawing constants shared by the SVG viewBox and every path/label. */
export const WHEEL_GEOMETRY = {
  size: 320,          // viewBox is "0 0 320 320"
  cx: 160,
  cy: 160,
  outerRadius: 152,   // outside edge of the major band
  ringRadius: 108,    // border between major band and minor band
  innerRadius: 64,    // inside edge of the minor band (hub)
} as const;

/** The 12 wedges, in circle-of-fifths order starting at C at 12 o'clock. */
export const WHEEL_SEGMENTS: readonly WheelSegment[];

/** Wedge at any integer index, wrapping modulo 12 (accepts negatives). */
export function segmentAt(index: number): WheelSegment;

/** Which wedge + band a key highlights. */
export function selectionForKey(tonicPc: number, mode: "major" | "minor"): WheelSelection;

/** The key a wedge + band selects — inverse of selectionForKey. */
export function keyForSelection(selection: WheelSelection): { tonicPc: number; mode: "major" | "minor" };

/** The other band of the same wedge — the relative major/minor partner. */
export function relativeSelection(selection: WheelSelection): WheelSelection;

/** Wedge indices a fifth down (previous) and a fifth up (next), wrapping. */
export function neighborIndices(index: number): { previous: number; next: number };

/** Point on the wheel at radius r and angle degrees clockwise from 12 o'clock. */
export function polarPoint(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number };

/** SVG path `d` for one band of one wedge: an annular sector. */
export function wedgePath(index: number, ring: WheelRing): string;

/** Where the text label for one band sits (centre of that band's arc). */
export function labelPoint(index: number, ring: WheelRing): { x: number; y: number };

/** Screen-reader / tooltip label, e.g. "G major", "E minor". */
export function ringLabel(index: number, ring: WheelRing): string;
```

Implementation notes:

- Build `WHEEL_SEGMENTS` by mapping `CIRCLE_OF_FIFTHS_MAJORS` with `pitchClass`,
  `relativeMinorPc` and `noteName`. Freeze it (`Object.freeze` or `as const`-style
  `readonly`) so callers cannot mutate it.
- `selectionForKey`: for `"major"`, find the segment whose `majorPc === tonicPc`; for
  `"minor"`, find the segment whose `minorPc === tonicPc` (equivalently: the segment for
  `relativeMajorPc(tonicPc)`). Normalise the incoming pc with `((pc % 12) + 12) % 12`.
  Every pitch class appears exactly once per ring, so a lookup always succeeds; throw a
  `RangeError` if it somehow does not, matching `theory.ts`'s style.
- `keyForSelection`: `segmentAt(index)` then pick `majorPc`/`minorPc` and the matching mode.
- `wedgePath`: radii are `outerRadius`→`ringRadius` for `"major"` and `ringRadius`→
  `innerRadius` for `"minor"`. Emit `M` (outer start) → `A` (outer arc, `sweep-flag 1`) →
  `L` (down to the inner arc) → `A` (inner arc back, `sweep-flag 0`) → `Z`. Both arcs use
  `large-arc-flag 0` (30° sectors). Round coordinates to 2–3 decimals so the strings stay
  short and stable.
- `labelPoint`: radius midway between the band's two radii, at `midAngle`.
- Keep the module free of colour/CSS decisions — those live in `index.html` + `main.ts`.

---

## File 3 — `apps/circle-of-fifths-fretboard/index.html` (edit)

**Markup.** Inside `section.picker`, *before* the existing `<label for="key-select">`:

```html
<h2 class="wheel-heading">Circle of fifths</h2>
<svg id="circle-wheel" viewBox="0 0 320 320" role="group" aria-label="Circle of fifths"></svg>
<p id="wheel-caption" class="wheel-caption" aria-live="polite"></p>
```

The wheel is populated entirely by `main.ts`; leave the `<svg>` empty in the HTML. The
existing global `svg { width: 100%; height: auto; display: block; }` already makes it
responsive inside the 340px picker column.

**CSS.** Add to the existing `<style>` block, reusing the `:root` variables (add new
variables there if you need them, e.g. `--wheel-fill: #22242f;`,
`--wheel-related: #35506b;`):

- `.wheel-heading { margin: 0 0 .5rem; font-size: 1rem; font-weight: 600; }`
- `.wheel-caption { margin: .35rem 0 0; font-size: .8rem; color: var(--muted-text); text-align: center; }`
- `.wheel-wedge { fill: var(--wheel-fill); stroke: var(--border); stroke-width: 1; cursor: pointer; transition: fill .12s ease; }`
- `.wheel-wedge:hover { fill: #2e3140; }`
- `.wheel-wedge:focus-visible { outline: none; stroke: var(--accent); stroke-width: 2.5; }`
- `.wheel-wedge.is-related { fill: var(--wheel-related); }`
- `.wheel-wedge.is-neighbor { stroke: var(--muted-text); stroke-width: 1.75; }`
- `.wheel-wedge.is-selected { fill: var(--accent); stroke: #fff; stroke-width: 2; }`
- `.wheel-label { pointer-events: none; user-select: none; fill: var(--text); font-size: 13px; text-anchor: middle; dominant-baseline: middle; }`
- `.wheel-label.minor { font-size: 11px; fill: var(--muted-text); }`
- `.wheel-label.on-selected { fill: #12131a; font-weight: 600; }`

Do not restructure the rest of the stylesheet.

---

## File 4 — `apps/circle-of-fifths-fretboard/main.ts` (edit)

1. **Imports.** Add `WHEEL_SEGMENTS`, `WHEEL_GEOMETRY`, `selectionForKey`,
   `keyForSelection`, `relativeSelection`, `neighborIndices`, `wedgePath`, `labelPoint`,
   `ringLabel`, `type WheelRing` from `./circle-wheel.ts`. Cache
   `const wheelSvg = document.getElementById("circle-wheel") as unknown as SVGSVGElement;`
   and `const wheelCaptionEl = document.getElementById("wheel-caption") as HTMLParagraphElement;`
   alongside the other DOM lookups.

2. **One key-change path.** Today the `keySelect` `change` handler and both mode buttons each
   set state inline and set `state.selected = null` (which leaves both diagrams showing the
   "Select a chord" placeholder). Replace all three bodies with a single function:

   ```ts
   function applyKey(tonicPc: number, mode: "major" | "minor") {
     state.tonicPc = ((tonicPc % 12) + 12) % 12;
     state.mode = mode;
     state.voicingIndex = 0;
     state.selected = diatonicTriads(state.tonicPc, state.mode)[0] ?? null;
     render();
   }
   ```

   Selecting the tonic triad (rather than `null`) is deliberate: the requirement is that
   picking a key on the wheel updates the chord list *and the diagrams*. Route the dropdown
   and both mode buttons through `applyKey` too, so all three controls behave identically.

3. **Control sync (`syncKeyControls`).** New function called from `render()`; it writes the
   DOM controls from state rather than from the click that happened:

   ```ts
   function syncKeyControls() {
     keySelect.value = String(state.tonicPc);
     modeMajorBtn.setAttribute("aria-pressed", String(state.mode === "major"));
     modeMinorBtn.setAttribute("aria-pressed", String(state.mode === "minor"));
   }
   ```

   Delete the now-redundant `setAttribute` lines from the mode-button listeners — the render
   pass owns them. `keySelect` already has an option for every pitch class (the 12 majors
   cover all 12 pcs), so a minor tonic such as A selects the `A` option correctly.

4. **`renderWheel()`.** Called from `render()` before/after `renderChordList()`:

   - `wheelSvg.replaceChildren();`
   - `const selection = selectionForKey(state.tonicPc, state.mode);`
     `const related = relativeSelection(selection);`
     `const { previous, next } = neighborIndices(selection.index);`
   - For each `segment of WHEEL_SEGMENTS`, for each `ring of ["major", "minor"] as const`:
     - build `el("path", { d: wedgePath(segment.index, ring), class: ... })` using the
       existing `el()` helper; compose the class list from `wheel-wedge` plus
       `is-selected` / `is-related` / `is-neighbor` as applicable;
     - set `role="button"`, `tabindex="0"`,
       `aria-label={ringLabel(segment.index, ring)}`, `aria-pressed` = selected;
     - `addEventListener("click", ...)` and `addEventListener("keydown", ...)` where the
       keydown fires on `"Enter"` or `" "` (call `event.preventDefault()` for Space) —
       both handlers do
       `const { tonicPc, mode } = keyForSelection({ index: segment.index, ring }); applyKey(tonicPc, mode);`
     - append a label via the existing `textNode()` helper at `labelPoint(segment.index, ring)`
       (nudge `y` by ~4 if you prefer explicit baselines over `dominant-baseline`), text
       `segment.majorName` for the major band and `${segment.minorName}m` for the minor band,
       class `wheel-label` (+ `minor`, + `on-selected` when that band is the selected one).
   - Set `wheelCaptionEl.textContent` to something like
     `` `${noteName(state.tonicPc)} ${state.mode} — relative ${state.mode === "major" ? "minor" : "major"}: ${noteName(relativeKeyPc)}` ``
     using `keyForSelection(related)`.
   - Because `render()` rebuilds the wheel from state, the "dropdown/toggle → wheel"
     direction of the sync needs no extra code.

5. **`render()`** becomes: `renderView(); syncKeyControls(); renderWheel(); renderChordList();
   renderChordDiagram(); renderTriadDiagram();`

6. **`init()`** keeps its current shape; `state.selected = triads[0]` already matches
   `applyKey`'s behaviour, and the first `render()` draws the wheel with C major selected.

---

## File 5 — `apps/circle-of-fifths-fretboard/fretboard.test.ts` (edit, additive)

Add the new imports at the top (alongside the existing ones) and append a
`describe("circle of fifths wheel", ...)` block at the end of the file. Do not modify or
delete existing tests. Cover at least:

**Model**
1. `WHEEL_SEGMENTS.length === WHEEL_SEGMENT_COUNT === 12`; `index` equals array position;
   `majorName` sequence equals `CIRCLE_OF_FIFTHS_MAJORS`.
2. Each wedge's `majorPc` is a fifth (+7 semitones mod 12) above the previous wedge's, and
   the 12 `majorPc` values are all distinct (a permutation of 0..11). Same for `minorPc`.
3. `minorPc === relativeMinorPc(majorPc)` for every wedge, and `minorName` equals the
   `majorName` of the wedge three positions later (relative minor of C is A, which is the
   major of wedge 3) — the invariant that makes the wheel readable.
4. Spot checks: wedge 0 is `C` / `A`; wedge 1 is `G` / `E`; wedge 6 is `F#` / `D#`;
   wedge 11 is `F` / `D`.

**Selection sync (both directions)**
5. Round trip: for all 12 pitch classes × both modes,
   `keyForSelection(selectionForKey(pc, mode))` equals `{ tonicPc: pc, mode }`.
6. Round trip the other way: for every `index` 0..11 and both rings,
   `selectionForKey(...keyForSelection({ index, ring }))` equals `{ index, ring }`.
7. Named cases: `selectionForKey(pitchClass("A"), "minor")` is `{ index: 0, ring: "minor" }`
   (A minor lives on the C wedge); `selectionForKey(pitchClass("C"), "major")` is
   `{ index: 0, ring: "major" }`; `selectionForKey(pitchClass("E"), "minor")` is
   `{ index: 1, ring: "minor" }`.
8. `relativeSelection` flips the ring, keeps the index, and is its own inverse; the key it
   yields is the relative major/minor of the original key (`relativeMinorPc` /
   `relativeMajorPc` agreement).
9. `segmentAt` wraps: `segmentAt(12) === segmentAt(0)`, `segmentAt(-1) === segmentAt(11)`.
10. `neighborIndices(i).next` is the key a fifth up and `.previous` a fifth down, for every
    `i`, including the wrap at `i = 0` and `i = 11`.
11. `ringLabel` returns `"C major"` / `"A minor"` shapes, and all 24 labels are distinct
    and non-empty.

**Geometry**
12. Angles: every wedge spans exactly 30°, `startAngle < midAngle < endAngle`, wedge `i`'s
    `endAngle` equals wedge `i+1`'s `startAngle`, and the 12 spans sum to 360.
13. `polarPoint(160, 160, 100, 0)` is directly above the centre (`x ≈ 160`, `y ≈ 60`);
    `90` is to the right (`x ≈ 260`, `y ≈ 160`); `180` below. Use `toBeCloseTo`.
14. `wedgePath` for all 24 bands: starts with `"M"`, ends with `"Z"`, contains two `A`
    (arc) commands, and every numeric coordinate in it is finite and inside
    `[0, WHEEL_GEOMETRY.size]`.
15. `labelPoint` for the major band lies between `ringRadius` and `outerRadius` from the
    centre, and the minor band's between `innerRadius` and `ringRadius` (check the distance
    with `Math.hypot`); the C major label is near the top of the wheel
    (`y < WHEEL_GEOMETRY.cy`).
16. Radii ordering sanity: `innerRadius < ringRadius < outerRadius < size / 2`.

Style: `describe`/`test` with sentence-style names, plain `expect` — match the existing file.

---

## Verification

Run from the repo root; judge each by its exit status:

1. `bun test apps/circle-of-fifths-fretboard/fretboard.test.ts` — must exit 0, with the
   pre-existing 231 tests still passing plus the new ones.
2. `bun apps/circle-of-fifths-fretboard/index.html` and open the served URL to eyeball it:
   - the wheel renders 12 wedges with a major name outside and a minor name inside;
   - C major is highlighted on load, with A minor shown as its relative;
   - clicking the `E` outer band → dropdown reads `E`, Major is pressed, the chord list shows
     E / F#m / G#m / A / B / C#m / D#dim, and the chord diagram redraws;
   - clicking the inner band of the same wedge → dropdown reads `C#`, Minor is pressed,
     chord list is the C# natural-minor set;
   - changing the dropdown to `G` and clicking Minor → the inner band of the `A#`/`G`… wedge
     that carries `Gm` is the highlighted one, no wheel click needed;
   - tabbing to a wedge and pressing Enter selects it;
   - switching between Chord diagram and Triad layout leaves the wheel selection intact.
3. Confirm no new files beyond `circle-wheel.ts` and no dependency/config files were added
   (`git status --short`).
