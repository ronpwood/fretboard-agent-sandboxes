// Pure guitar-tuning logic. No DOM.

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
