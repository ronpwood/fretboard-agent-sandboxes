// Pure playback planning: string/fret -> frequency, and the note/envelope
// timings a Web Audio caller schedules. No DOM, no AudioContext.

import { midiAtFret, type Fingering } from "./fretboard.ts";

export const A4_MIDI = 69;
export const A4_FREQUENCY = 440;

/** Equal-tempered frequency in Hz for a MIDI note number. */
export function midiToFrequency(midi: number): number {
  if (!Number.isFinite(midi)) {
    throw new RangeError(`midi must be finite: ${midi}`);
  }
  return A4_FREQUENCY * 2 ** ((midi - A4_MIDI) / 12);
}

/** One note the caller should sound. `offset` is seconds after playback start. */
export type SoundedNote = {
  string: number;
  fret: number;
  midi: number;
  frequency: number;
  offset: number;
};

/** Fixed spacing between successive notes of one shape. Not a user-facing control. */
export const NOTE_STAGGER_SECONDS = 0.025;

/** A single note, sounded on its own (offset 0). */
export function soundedNote(stringIndex: number, fret: number): SoundedNote {
  const midi = midiAtFret(stringIndex, fret);
  return {
    string: stringIndex,
    fret,
    midi,
    frequency: midiToFrequency(midi),
    offset: 0,
  };
}

/** Notes for placed positions (e.g. a TriadPosition), low string first. */
export function notesForPositions(
  positions: readonly { string: number; fret: number }[],
  opts?: { stagger?: number }
): SoundedNote[] {
  const stagger = opts?.stagger ?? NOTE_STAGGER_SECONDS;
  if (stagger < 0) {
    throw new RangeError(`stagger must be >= 0, got ${stagger}`);
  }
  const sorted = positions.slice().sort((a, b) => a.string - b.string);
  return sorted.map((pos, i) => {
    const note = soundedNote(pos.string, pos.fret);
    return { ...note, offset: i * stagger };
  });
}

/** Notes for a 6-slot fingering; `null` slots (muted strings) are skipped. */
export function notesForVoicing(
  fingering: Fingering,
  opts?: { stagger?: number }
): SoundedNote[] {
  const positions: { string: number; fret: number }[] = [];
  for (let s = 0; s < fingering.length; s++) {
    const fret = fingering[s];
    if (fret !== null) {
      positions.push({ string: s, fret });
    }
  }
  return notesForPositions(positions, opts);
}

/** Default step time between chord onsets in a progression sequence. */
export const PROGRESSION_STEP_SECONDS = 0.9;

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

/** Per-voice peak gain, scaled so N simultaneous voices do not clip. */
export const MAX_TOTAL_GAIN = 0.8;

export function gainForVoiceCount(count: number): number {
  const n = Number.isFinite(count) && count > 0 ? count : 1;
  return MAX_TOTAL_GAIN / Math.max(1, n);
}

/** Absolute times/levels for one note's gain envelope. */
export type NoteEnvelope = {
  startAt: number;
  peakAt: number;
  peakGain: number;
  sustainAt: number;
  sustainGain: number;
  releaseAt: number;
  stopAt: number;
};

export const ENVELOPE_DEFAULTS = {
  attack: 0.01,
  decay: 0.12,
  duration: 1.2,
  release: 0.25,
  sustainRatio: 0.6,
};

export function noteEnvelope(
  startTime: number,
  peakGain: number,
  opts?: Partial<typeof ENVELOPE_DEFAULTS>
): NoteEnvelope {
  const merged = { ...ENVELOPE_DEFAULTS, ...opts };
  const startAt = startTime;
  const peakAt = startAt + merged.attack;
  const sustainAt = peakAt + merged.decay;
  let releaseAt = startAt + merged.duration;
  releaseAt = Math.max(releaseAt, sustainAt + 0.001);
  const stopAt = releaseAt + merged.release;
  const sustainGain = peakGain * merged.sustainRatio;

  return {
    startAt,
    peakAt,
    peakGain,
    sustainAt,
    sustainGain,
    releaseAt,
    stopAt,
  };
}

/** When the last voice of a set has fully stopped, relative to playback start. */
export function playbackDuration(
  notes: readonly SoundedNote[],
  opts?: Partial<typeof ENVELOPE_DEFAULTS>
): number {
  if (notes.length === 0) return 0;
  const merged = { ...ENVELOPE_DEFAULTS, ...opts };
  const maxOffset = Math.max(...notes.map((n) => n.offset));
  return maxOffset + merged.duration + merged.release;
}
