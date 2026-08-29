// Pure guitar-tuning logic. No DOM.

import { triadNotes, type Quality } from "./theory.ts";

export const STANDARD_TUNING: number[] = [4, 9, 2, 7, 11, 4];
export const STRING_COUNT = 6;

/** MIDI note numbers of the open strings, low E (index 0) to high E (index 5). */
export const STANDARD_TUNING_MIDI: number[] = [40, 45, 50, 55, 59, 64];

export type Fingering = (number | null)[];

export function pitchAtFret(stringIndex: number, fret: number): number {
  if (!Number.isInteger(stringIndex) || stringIndex < 0 || stringIndex > 5) {
    throw new RangeError(`stringIndex out of range: ${stringIndex}`);
  }
  if (!Number.isInteger(fret) || fret < 0) {
    throw new RangeError(`fret out of range: ${fret}`);
  }
  return (STANDARD_TUNING[stringIndex] + fret) % 12;
}

/** Absolute MIDI note number sounded by a string/fret pair. */
export function midiAtFret(stringIndex: number, fret: number): number {
  if (!Number.isInteger(stringIndex) || stringIndex < 0 || stringIndex > 5) {
    throw new RangeError(`stringIndex out of range: ${stringIndex}`);
  }
  if (!Number.isInteger(fret) || fret < 0) {
    throw new RangeError(`fret out of range: ${fret}`);
  }
  return STANDARD_TUNING_MIDI[stringIndex] + fret;
}

/** One note occurrence on the full fretboard: string, fret, pitch class, and MIDI number. */
export type FretboardNotePosition = {
  stringIndex: number; // 0..5 (0 = low E, 5 = high E)
  fret: number;        // 0..12
  pitchClass: number;  // 0..11
  midi: number;        // MIDI note number (e.g. 40..76)
};

/** Every note position across all 6 strings for frets 0..maxFret (default 12). */
export function getAllFretboardNotes(maxFret: number = 12): FretboardNotePosition[] {
  if (!Number.isInteger(maxFret) || maxFret < 0) throw new RangeError(`maxFret out of range: ${maxFret}`);
  const notes: FretboardNotePosition[] = [];
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= maxFret; f++) {
      const midi = midiAtFret(s, f);
      notes.push({ stringIndex: s, fret: f, pitchClass: pitchAtFret(s, f), midi });
    }
  }
  return notes;
}

/** Filter positions to those whose pitch class is in `targetPcs`. */
export function filterFretboardNotes(
  notes: FretboardNotePosition[],
  targetPcs: readonly number[]
): FretboardNotePosition[] {
  const set = new Set(targetPcs);
  return notes.filter((n) => set.has(n.pitchClass));
}

/** "Root / third / fifth / other" for a pitch class within a chord described by root+quality. */
export function noteRoleInTriad(
  pc: number,
  rootPc: number,
  quality: Quality
): "root" | "third" | "fifth" | "other" {
  const [rb, tb, fb] = triadNotes(rootPc, quality);
  const norm = ((pc % 12) + 12) % 12;
  if (norm === rb) return "root";
  if (norm === tb) return "third";
  if (norm === fb) return "fifth";
  return "other";
}
