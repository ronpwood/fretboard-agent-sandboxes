// Real constrained search over the fretboard for playable chord voicings.
// No DOM. No lookup tables keyed by chord name.

import { pitchAtFret, STRING_COUNT, type Fingering } from "./fretboard.ts";

export type VoicingOptions = {
  minFret?: number;
  maxFret?: number;
  maxSpan?: number;
};

type Candidate = Fingering;

function normalizeOptions(opts?: VoicingOptions): { minFret: number; maxFret: number; maxSpan: number } {
  const minFret = opts?.minFret ?? 0;
  if (minFret < 0) {
    throw new RangeError(`minFret must be >= 0, got ${minFret}`);
  }
  const requestedMaxFret = opts?.maxFret ?? minFret + 4;
  if (requestedMaxFret < minFret) {
    throw new RangeError(`maxFret (${requestedMaxFret}) must be >= minFret (${minFret})`);
  }
  // Clamp the window to at most 6 frets wide to keep the search space bounded
  // (6 strings x at most 8 fret choices + "muted" each).
  const maxFret = Math.min(requestedMaxFret, minFret + 6);
  const maxSpan = opts?.maxSpan ?? 4;
  return { minFret, maxFret, maxSpan };
}

function candidateFretsForString(
  stringIndex: number,
  minFret: number,
  maxFret: number,
  chordTones: readonly number[]
): (number | null)[] {
  const options: (number | null)[] = [null];
  for (let f = minFret; f <= maxFret; f++) {
    if (chordTones.includes(pitchAtFret(stringIndex, f))) {
      options.push(f);
    }
  }
  return options;
}

function isValid(
  candidate: Candidate,
  chordTones: [number, number, number],
  rootPc: number,
  maxSpan: number
): boolean {
  const soundedIndices: number[] = [];
  for (let i = 0; i < candidate.length; i++) {
    if (candidate[i] !== null) soundedIndices.push(i);
  }
  if (soundedIndices.length === 0) return false;

  // Rule 1: all three chord tones present among sounded strings.
  const soundedPcs = soundedIndices.map((i) => pitchAtFret(i, candidate[i] as number));
  for (const tone of chordTones) {
    if (!soundedPcs.includes(tone)) return false;
  }

  // Rule 2: lowest-indexed sounded string plays the root.
  const lowestSoundedIndex = soundedIndices[0];
  if (pitchAtFret(lowestSoundedIndex, candidate[lowestSoundedIndex] as number) !== rootPc) {
    return false;
  }

  // Rule 3: span among sounded, fretted (non-open) notes.
  const frettedFrets = soundedIndices
    .map((i) => candidate[i] as number)
    .filter((f) => f > 0);
  if (frettedFrets.length >= 2) {
    const span = Math.max(...frettedFrets) - Math.min(...frettedFrets);
    if (span > maxSpan) return false;
  }

  return true;
}

function frettedSpan(candidate: Candidate): number {
  const frettedFrets = candidate.filter((f): f is number => f !== null && f > 0);
  if (frettedFrets.length < 2) return 0;
  return Math.max(...frettedFrets) - Math.min(...frettedFrets);
}

function mutedCount(candidate: Candidate): number {
  return candidate.filter((f) => f === null).length;
}

function fretSum(candidate: Candidate): number {
  return candidate.reduce((sum: number, f) => sum + (f ?? 0), 0);
}

function lexicoKey(candidate: Candidate): number[] {
  return candidate.map((f) => (f === null ? -1 : f));
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const mutedDiff = mutedCount(a) - mutedCount(b);
  if (mutedDiff !== 0) return mutedDiff;

  const spanDiff = frettedSpan(a) - frettedSpan(b);
  if (spanDiff !== 0) return spanDiff;

  const sumDiff = fretSum(a) - fretSum(b);
  if (sumDiff !== 0) return sumDiff;

  const aKey = lexicoKey(a);
  const bKey = lexicoKey(b);
  for (let i = 0; i < aKey.length; i++) {
    if (aKey[i] !== bKey[i]) return aKey[i] - bKey[i];
  }
  return 0;
}

export function findVoicings(
  chordTones: [number, number, number],
  rootPc: number,
  opts?: VoicingOptions
): Fingering[] {
  const { minFret, maxFret, maxSpan } = normalizeOptions(opts);

  const perStringOptions: (number | null)[][] = [];
  for (let s = 0; s < STRING_COUNT; s++) {
    perStringOptions.push(candidateFretsForString(s, minFret, maxFret, chordTones));
  }

  const results: Candidate[] = [];
  const current: (number | null)[] = new Array(STRING_COUNT).fill(null);

  function recurse(stringIndex: number) {
    if (stringIndex === STRING_COUNT) {
      const candidate = current.slice();
      if (isValid(candidate, chordTones, rootPc, maxSpan)) {
        results.push(candidate);
      }
      return;
    }
    for (const option of perStringOptions[stringIndex]) {
      current[stringIndex] = option;
      recurse(stringIndex + 1);
    }
  }
  recurse(0);

  results.sort(compareCandidates);
  return results;
}

export function bestVoicing(
  chordTones: [number, number, number],
  rootPc: number,
  opts?: VoicingOptions
): Fingering | null {
  const all = findVoicings(chordTones, rootPc, opts);
  return all[0] ?? null;
}
