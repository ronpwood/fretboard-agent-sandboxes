# Key-aware note names: flat spellings for flat-side keys

## Goal

The fretboard app's note-naming is sharps-only (`NOTE_NAMES` in `theory.ts`), so
any note rendered while a flat-side key is selected is misspelled: F major's IV
chord shows "A#" where every real chart says "Bb", and the same wrong spelling
hits Bb, Eb, Ab, and Db majors — half of `CIRCLE_OF_FIFTHS_MAJORS`. This change
makes `noteName` key-aware so notes rendered inside the currently selected key
use that key's side of the circle consistently: flat-side keys spell accidentals
flat (Db, Eb, Gb, Ab, Bb), sharp-side keys keep today's sharp spellings.

This is deliberately the simplified "which side of the circle is this key on"
heuristic, NOT full per-scale-degree letter spelling. A key is either sharp-side
or flat-side; every accidental pitch class displayed in that key uses that side's
spelling.

- Flat-side keys (major tonics): Db (pc 1), Eb (pc 3), F (pc 5), Ab (pc 8), Bb (pc 10).
- Flat spelling set (accidental pcs that get respelled in flat keys): 1→Db, 3→Eb, 6→Gb, 8→Ab, 10→Bb.
- Everything else unchanged: C and the sharp-side keys G, D, A, E, B, F# keep today's sharp spellings byte-for-byte.

## Files to touch

1. `apps/fretboard/theory.ts` — `noteName` signature + plain flat-name data.
2. `apps/fretboard/main.ts` — pass key context at every in-key render site.
3. `apps/fretboard/fretboard.test.ts` — new tests (additive).

Do NOT touch: `circle-wheel.ts`, `fretboard.ts`, `voicing.ts`, `triad-layout.ts`,
`voicing-browser.ts`, `playback.ts`, `persisted-state.ts`, `view-mode.ts`,
`index.html`. `pitchClass`, `triadNotes`, `diatonicTriads`, voicing search, triad
layout, playback, and persisted state must all remain byte-identical.

---

## Step 1 — `apps/fretboard/theory.ts`: key-aware `noteName`

Keep `NOTE_NAMES` exactly as-is (it remains the sharp-side table and the
no-context answer).

Add plain, testable data right below `NOTE_NAMES`:

```ts
/** Pitch classes that are spelled flat when the selected key is on the flat side. */
export const FLAT_SIDE_PCS: readonly number[] = [1, 3, 6, 8, 10];

/** Flat spellings for the accidental pcs in FLAT_SIDE_PCS, keyed by pc. */
export const FLAT_SIDE_NAMES: Readonly<Record<number, string>> = {
  1: "Db",
  3: "Eb",
  6: "Gb",
  8: "Ab",
  10: "Bb",
};

/** Major-key tonics whose keys are spelled with flats: Db, Eb, F, Ab, Bb. */
export const FLAT_SIDE_TONICS: ReadonlySet<number> = new Set([1, 3, 5, 8, 10]);
```

Change `noteName` (additive — the second parameter is optional):

```ts
export function noteName(pc: number, keyTonicPc?: number): string {
  if (!Number.isInteger(pc) || pc < 0 || pc > 11) {
    throw new RangeError(`Pitch class out of range: ${pc}`);
  }
  if (keyTonicPc !== undefined && FLAT_SIDE_TONICS.has(keyTonicPc)) {
    const flatName = FLAT_SIDE_NAMES[pc];
    if (flatName !== undefined) return flatName;
  }
  return NOTE_NAMES[pc];
}
```

Rules baked in here:

- pc validation is the FIRST statement and is byte-identical to today (same
  `RangeError`, same message) — DoD: "throws on out-of-range pc exactly as it
  does today", for both with and without a key.
- `keyTonicPc === undefined` → returns `NOTE_NAMES[pc]` exactly as before.
- `keyTonicPc` in the flat set + pc in the flat-name table → flat spelling.
- Natural pcs (0, 2, 4, 5, 7, 9, 11) are never in the flat-name table, so they
  cannot be respelled.
- No validation/normalization of `keyTonicPc` is required — undefined or a
  non-matching value simply falls through to the sharp table. (main.ts only
  ever passes normalized pcs 0..11, see Step 2.)

---

## Step 2 — `apps/fretboard/main.ts`: pass key context at every in-key render site

### 2a. Import + helper

Add `relativeMajorPc` to the existing `./theory.ts` import block, then add one
small helper (place it near `currentTriads()`):

```ts
/** Major tonic that owns the spelling for notes rendered inside the key.
 * In minor mode the relative major carries the accidentals (D minor → F major →
 * flats; A minor → C major → sharps). */
function keyContextPc(): number {
  return state.mode === "major" ? state.tonicPc : relativeMajorPc(state.tonicPc);
}
```

### 2b. Update every `noteName(...)` call site whose note is IN the selected key

All of these become `noteName(<pc>, keyContextPc())`:

| # | Function | Line | Current call | Note |
|---|----------|------|--------------|------|
| 1 | `renderChordList` | ~308 | `noteName(triad.root)` | diatonic chord list button |
| 2 | `renderChordDiagram` | ~376 | `noteName(chord.root)` | "no voicing found" caption |
| 3 | `renderChordDiagram` | ~449 | `noteName(openPc)` | open-string marker aria-label |
| 4 | `renderChordDiagram` | ~467 | `noteName(pc)` | fretted-dot aria-label |
| 5 | `renderChordDiagram` | ~476 | `noteName(chord.root)` | chord caption |
| 6 | `renderTriadDiagram` | ~556 | `noteName(pc)` | triad dot name text |
| 7 | `renderTriadDiagram` | ~566 | `noteName(pc)` | triad dot aria-label |
| 8 | `explorerMarkerLabel` | ~631 | `noteName(pc)` | explorer marker label ("name" mode) |
| 9 | `renderExplorerDiagram` | ~770 | `noteName(pc)` | explorer marker aria-label |
| 10 | `renderExplorerDiagram` | ~778 | `noteName(pc)` AND `noteName(state.selected ? state.selected.root : state.tonicPc)` | play caption — BOTH calls get `keyContextPc()` |
| 11 | `renderExplorerDiagram` | ~794–795 | `noteName(state.selected.root)` / `noteName(state.tonicPc)` | explorer filter label |
| 12 | `renderExplorerDiagram` | ~796 | `targetPcs.map((p) => noteName(p))` | explorer caption note list |

No other `noteName` call exists in main.ts. `diatonicTriads(state.tonicPc,
state.mode)` already returns the correct roots for both modes, so passing
`keyContextPc()` to the existing pc at each site is all that's needed — no call
site's pc argument changes, only the added second argument.

Why every one of these sites is in-key:

- Chord list and chord/triad captions/labels render roots and tones of
  `state.selected` / diatonic triads, which always live in `diatonicTriads(state.tonicPc, state.mode)`.
- The explorer renders notes filtered by `explorerTargetPcs` — always the
  selected diatonic chord's tones or the diatonic key roots — so every marker is
  in-key, as is the play-caption and filter label.

Do NOT change this call (it is NOT a note inside the selected key — it names the
keys themselves, matching the app's key-name surface in `CIRCLE_OF_FIFTHS_MAJORS`,
the key `<select>`, and the wheel labels):

- `renderWheel` `wheelCaptionEl` (~879):
  `` `${noteName(state.tonicPc)} ${state.mode} — relative ...: ${noteName(relativeKey.tonicPc)}` ``

Leaving it sharp-named keeps the wheel caption consistent with the wheel wedge
labels (`minorName: noteName(minorPc)` in `circle-wheel.ts`, module-static, no
key context) and the key-select options ("A#" for pc 10), which the prompt
explicitly leaves out of scope ("any note name shown with no selected key" /
key-name surface). The enumerated scope is: diatonic chord list buttons,
chord-diagram and triad-panel captions/labels, and the fretboard-explorer's note
labels and caption. Do not touch `circle-wheel.ts` at all.

---

## Step 3 — `apps/fretboard/fretboard.test.ts`: new `noteName` tests

Add `NOTE_NAMES` to the existing `./theory.ts` import list (it is already
exported). Add a new `describe("noteName key-aware spelling", ...)` block
(place it near the top, after `triadNotes`'s describe). Content:

1. **Flat-side keys spell in-key accidentals flat** — table-driven, one or more
   in-key accidental pc per flat key:

   ```ts
   const flatCases: [pc: number, keyTonicPc: number, expected: string][] = [
     [1, 1, "Db"],  // Db major I
     [6, 1, "Gb"],  // Db major IV (the prompt's Gb-not-F# case)
     [10, 1, "Bb"], // Db major V
     [3, 3, "Eb"],  // Eb major I
     [8, 3, "Ab"],  // Eb major IV
     [10, 5, "Bb"], // F major IV (the headline fix)
     [1, 8, "Db"],  // Ab major IV
     [3, 8, "Eb"],  // Ab major V
     [3, 10, "Eb"], // Bb major ii
     [10, 10, "Bb"],// Bb major I
   ];
   ```
   Each flat key (1, 3, 5, 8, 10) appears at least once with an in-key accidental.

2. **Sharp-side keys keep today's sharp spellings for every pc** — for each
   `keyTonicPc` in `[0, 2, 4, 6, 7, 9, 11]`, loop pc 0..11 and assert
   `noteName(pc, keyTonicPc) === NOTE_NAMES[pc]`.

3. **No `keyTonicPc` keeps today's spellings for every pc** — loop pc 0..11,
   assert `noteName(pc) === NOTE_NAMES[pc]` (guards DoD 1's byte-identical claim).

4. **Natural pcs are never respelled in flat keys** — for pc in
   `[0, 2, 4, 5, 7, 9, 11]`, `noteName(pc, 1) === NOTE_NAMES[pc]` (Db major, the
   flat key that contains every accidental).

5. **Out-of-range pc still throws exactly as today** — `noteName(12)`,
   `noteName(-1)`, `noteName(1.5)` throw `RangeError`; also
   `noteName(12, 5)` throws (with context).

6. (Recommended) **Headline regression wiring `diatonicTriads` + `noteName`** —
   F major's IV triad root spells "Bb" with key context:
   `const iv = diatonicTriads(5, "major").find((t) => t.degree === "IV")!;`
   `expect(noteName(iv.root, 5)).toBe("Bb");`

All existing tests are untouched.

---

## Step 4 — Verification

From repo root (all commands exit 0):

1. `bun test apps/fretboard/fretboard.test.ts` — full suite green (existing +
   new). Also runnable as `just fretboard test`.
2. `bunx oxlint apps/fretboard` — 0 errors (prompt's oxlint gate).
3. `bun build apps/fretboard/main.ts --outdir /tmp/fretboard-build` — type-checks
   main.ts (DOM file isn't covered by bun test).
4. Manual spot checks (chord list labels):
   - F major → IV entry shows "Bb" (not "A#").
   - Bb major → ii entry shows "Eb" (not "D#").
   - Db/Eb/Ab major → equivalents corrected (Gb/Db/Ab/Bb where accidentals appear).
   - C, G, D, A, E, B, F# major → identical to current behavior.
   - D minor shows flats (relative F major), A minor shows sharps (relative C major).

## Explicitly out of scope (do NOT implement)

- Full per-scale-degree letter-name spelling (G# vs Ab as a scale degree in an
  arbitrary key) — a key is only sharp-side or flat-side here.
- Double sharps/flats; notes rendered outside a key context (no selected key).
- A user-facing sharp/flat override toggle (auto-detect from selected key).
- `circle-wheel.ts`, the wheel caption, and the wheel/key-select key-name labels
  (they name keys, not in-key notes — unchanged).
- Any change to `pitchClass`, `triadNotes`, `diatonicTriads`, voicings, layout,
  playback, or persisted state.