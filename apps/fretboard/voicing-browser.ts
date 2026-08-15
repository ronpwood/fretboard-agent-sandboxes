// Pure selection logic for stepping through a ranked list of voicings.
// No DOM.

import type { Fingering } from "./fretboard.ts";

/** Clamp an arbitrary index into [0, count - 1]. Returns 0 for an empty list. */
export function clampVoicingIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(index) || !Number.isInteger(index)) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

/** Move `delta` places through a list of `count` voicings, clamped at both ends (no wrap). */
export function stepVoicingIndex(index: number, count: number, delta: number): number {
  return clampVoicingIndex(clampVoicingIndex(index, count) + delta, count);
}

/** The voicing at `clampVoicingIndex(index, list.length)`, or null for an empty list. */
export function voicingAt(list: readonly Fingering[], index: number): Fingering | null {
  if (list.length === 0) return null;
  return list[clampVoicingIndex(index, list.length)];
}

/** "3 of 10" — 1-based, human-facing. Returns "" (empty string) when count is 0. */
export function voicingPositionLabel(index: number, count: number): string {
  if (count <= 0) return "";
  return `${clampVoicingIndex(index, count) + 1} of ${count}`;
}
