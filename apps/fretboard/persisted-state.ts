// Serialize / parse / validate the UI selection state that survives a reload.
// Pure — no DOM, no storage access. main.ts owns the localStorage calls.

import { DEFAULT_VIEW, toViewMode, type ViewMode } from "./view-mode.ts";
import { STRING_SETS, type Inversion } from "./triad-layout.ts";

/** localStorage key. Namespaced so other apps on the same origin can't collide. */
export const STORAGE_KEY = "circle-of-fifths-fretboard:v1:state";

/** Bump when the shape changes; a record with any other version is discarded. */
export const STORAGE_VERSION = 1;

export type PersistedState = {
  tonicPc: number;            // 0..11
  mode: "major" | "minor";
  degreeIndex: number;        // 0..6, index into diatonicTriads()
  view: ViewMode;
  voicingIndex: number;       // >= 0, clamped against the real list on restore
  inversion: Inversion;
  stringSetIndex: number;     // 0..STRING_SETS.length - 1
};

/** What a fresh load shows: C major, degree I, chord view, first voicing, root position, D–G–B. */
export const DEFAULT_PERSISTED_STATE: PersistedState = Object.freeze({
  tonicPc: 0,
  mode: "major",
  degreeIndex: 0,
  view: DEFAULT_VIEW,
  voicingIndex: 0,
  inversion: "root",
  stringSetIndex: 2,
});

/** JSON for storage: the state plus its version tag. */
export function serializeState(state: PersistedState): string {
  return JSON.stringify({ version: STORAGE_VERSION, ...state });
}

/** Narrow an untrusted value to an integer tonic pitch class 0..11, else the default. */
export function toTonicPc(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 11) {
    return value;
  }
  return DEFAULT_PERSISTED_STATE.tonicPc;
}

/** Narrow an untrusted value to "major" | "minor", else "major". */
export function toMode(value: unknown): "major" | "minor" {
  if (value === "major" || value === "minor") return value;
  return DEFAULT_PERSISTED_STATE.mode;
}

/** Narrow an untrusted value to an integer degree index 0..6, else 0. */
export function toDegreeIndex(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6) {
    return value;
  }
  return DEFAULT_PERSISTED_STATE.degreeIndex;
}

/** Narrow an untrusted value to a non-negative integer voicing index, else 0. */
export function toVoicingIndex(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return DEFAULT_PERSISTED_STATE.voicingIndex;
}

/** Narrow an untrusted value to an Inversion, else "root". */
export function toInversion(value: unknown): Inversion {
  if (value === "root" || value === "first" || value === "second") return value;
  return DEFAULT_PERSISTED_STATE.inversion;
}

/** Narrow an untrusted value to a valid index into STRING_SETS, else 2. */
export function toStringSetIndex(value: unknown): number {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < STRING_SETS.length
  ) {
    return value;
  }
  return DEFAULT_PERSISTED_STATE.stringSetIndex;
}

/**
 * Best-effort read of an untrusted stored string. Never throws.
 * Returns DEFAULT_PERSISTED_STATE for null/empty/corrupt/non-object/wrong-version input,
 * and per-field defaults for fields that are missing or invalid.
 */
export function parseState(raw: string | null | undefined): PersistedState {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ...DEFAULT_PERSISTED_STATE };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PERSISTED_STATE };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ...DEFAULT_PERSISTED_STATE };
  }

  const record = parsed as Record<string, unknown>;
  if (record.version !== STORAGE_VERSION) {
    return { ...DEFAULT_PERSISTED_STATE };
  }

  return {
    tonicPc: toTonicPc(record.tonicPc),
    mode: toMode(record.mode),
    degreeIndex: toDegreeIndex(record.degreeIndex),
    view: toViewMode(record.view),
    voicingIndex: toVoicingIndex(record.voicingIndex),
    inversion: toInversion(record.inversion),
    stringSetIndex: toStringSetIndex(record.stringSetIndex),
  };
}

/** The degree actually usable for a chord list of `triadCount` entries; null when empty. */
export function resolveDegreeIndex(index: number, triadCount: number): number | null {
  if (triadCount <= 0) return null;
  if (!Number.isInteger(index) || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(index, 0), triadCount - 1);
}
