// Pure music theory logic: pitch classes, triads, and diatonic key construction.
// No DOM, no imports.

export const NOTE_NAMES: string[] = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

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

export function pitchClass(name: string): number {
  const idx = NOTE_NAMES.indexOf(name);
  if (idx === -1) {
    throw new RangeError(`Unknown note name: ${name}`);
  }
  return idx;
}

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

export const CIRCLE_OF_FIFTHS_MAJORS: string[] = [
  "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F",
];

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

export type Quality = "major" | "minor" | "diminished" | "augmented";

export type Triad = {
  degree: string;
  root: number;
  quality: Quality;
  notes: [number, number, number];
};

const QUALITY_INTERVALS: Record<Quality, [number, number]> = {
  major: [4, 7],
  minor: [3, 7],
  diminished: [3, 6],
  augmented: [4, 8],
};

export function triadNotes(root: number, quality: Quality): [number, number, number] {
  const [third, fifth] = QUALITY_INTERVALS[quality];
  return [
    ((root % 12) + 12) % 12,
    ((root + third) % 12 + 12) % 12,
    ((root + fifth) % 12 + 12) % 12,
  ];
}

const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_SCALE_STEPS = [0, 2, 3, 5, 7, 8, 10];

function classifyQuality(thirdInterval: number, fifthInterval: number): Quality {
  if (thirdInterval === 4 && fifthInterval === 7) return "major";
  if (thirdInterval === 3 && fifthInterval === 7) return "minor";
  if (thirdInterval === 3 && fifthInterval === 6) return "diminished";
  if (thirdInterval === 4 && fifthInterval === 8) return "augmented";
  // Fallback: pick the closest-matching quality by third interval alone.
  return thirdInterval === 4 ? "major" : "minor";
}

function romanNumeral(degreeIndex: number, quality: Quality): string {
  // degreeIndex is 0-based scale degree (0 = I/i)
  const numerals = ["I", "II", "III", "IV", "V", "VI", "VII"];
  let numeral = numerals[degreeIndex];
  if (quality === "minor" || quality === "diminished") {
    numeral = numeral.toLowerCase();
  }
  if (quality === "diminished") {
    numeral += "\u00b0";
  }
  if (quality === "augmented") {
    numeral += "+";
  }
  return numeral;
}

export function diatonicTriads(tonicPc: number, mode: "major" | "minor"): Triad[] {
  const steps = mode === "major" ? MAJOR_SCALE_STEPS : NATURAL_MINOR_SCALE_STEPS;
  const scalePcs = steps.map((s) => ((tonicPc + s) % 12 + 12) % 12);

  const triads: Triad[] = [];
  for (let i = 0; i < 7; i++) {
    const rootPc = scalePcs[i];
    const thirdPc = scalePcs[(i + 2) % 7];
    const fifthPc = scalePcs[(i + 4) % 7];

    const thirdInterval = ((thirdPc - rootPc) % 12 + 12) % 12;
    const fifthInterval = ((fifthPc - rootPc) % 12 + 12) % 12;
    const quality = classifyQuality(thirdInterval, fifthInterval);
    const degree = romanNumeral(i, quality);

    triads.push({
      degree,
      root: rootPc,
      quality,
      notes: [rootPc, thirdPc, fifthPc],
    });
  }
  return triads;
}
