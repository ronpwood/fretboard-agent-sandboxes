// Pure guitar-tuning logic. No DOM.

export const STANDARD_TUNING: number[] = [4, 9, 2, 7, 11, 4];
export const STRING_COUNT = 6;

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
