// Pure guitar-tuning logic. No DOM.

export const STANDARD_TUNING: number[] = [4, 9, 2, 7, 11, 4];
export const STRING_COUNT = 6;

// MIDI note numbers for the six open strings in standard tuning,
// low string (E2, index 0) to high string (E4, index 5).
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

// Octave-aware helpers for real audio playback. Unlike pitchAtFret above,
// these retain the octave so a sounded note has a true pitch.

export function midiAtFret(stringIndex: number, fret: number): number {
  if (!Number.isInteger(stringIndex) || stringIndex < 0 || stringIndex > 5) {
    throw new RangeError(`stringIndex out of range: ${stringIndex}`);
  }
  if (!Number.isInteger(fret) || fret < 0) {
    throw new RangeError(`fret out of range: ${fret}`);
  }
  return STANDARD_TUNING_MIDI[stringIndex] + fret;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function frequencyAtFret(stringIndex: number, fret: number): number {
  return midiToFrequency(midiAtFret(stringIndex, fret));
}
