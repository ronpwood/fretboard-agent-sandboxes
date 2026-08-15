// Pure logic: lay out a triad's three roles across three adjacent strings, in a
// chosen inversion, searching for a compact fingering. No DOM.

import { triadNotes, type Quality } from "./theory.ts";
import { pitchAtFret } from "./fretboard.ts";

export const STRING_SETS: [number, number, number][] = [
  [0, 1, 2],
  [1, 2, 3],
  [2, 3, 4],
  [3, 4, 5],
];

export type Inversion = "root" | "first" | "second";
export type Role = "root" | "third" | "fifth";

export function inversionRoles(inversion: Inversion): [Role, Role, Role] {
  switch (inversion) {
    case "root":
      return ["root", "third", "fifth"];
    case "first":
      return ["third", "fifth", "root"];
    case "second":
      return ["fifth", "root", "third"];
  }
}

export type TriadPosition = { string: number; fret: number; role: Role }[];

const MAX_SEARCH_FRET = 15;

export function layoutTriadOnStringSet(
  root: number,
  quality: Quality,
  inversion: Inversion,
  stringSet: [number, number, number],
  opts?: { maxSpan?: number }
): TriadPosition | null {
  const maxSpan = opts?.maxSpan ?? 4;
  const roles = inversionRoles(inversion);
  const [rootPc, thirdPc, fifthPc] = triadNotes(root, quality);
  const rolePc: Record<Role, number> = { root: rootPc, third: thirdPc, fifth: fifthPc };

  const [lowString, midString, highString] = stringSet;
  const [lowRole, midRole, highRole] = roles;

  // Iterate the low-string anchor fret upward rather than fixing it greedily at
  // its lowest match; the low string's lowest match is sometimes unreachable
  // from the other two strings within maxSpan, but a higher-octave match on
  // the same string (same pitch class, +12 frets) may still work.
  for (let low = 0; low <= MAX_SEARCH_FRET; low++) {
    if (pitchAtFret(lowString, low) !== rolePc[lowRole]) continue;

    const midFret = findLowestFretInRange(midString, rolePc[midRole], low, maxSpan);
    if (midFret === null) continue;
    const highFret = findLowestFretInRange(highString, rolePc[highRole], low, maxSpan);
    if (highFret === null) continue;

    return [
      { string: lowString, fret: low, role: lowRole },
      { string: midString, fret: midFret, role: midRole },
      { string: highString, fret: highFret, role: highRole },
    ];
  }

  return null;
}

function findLowestFretInRange(
  stringIndex: number,
  targetPc: number,
  anchorFret: number,
  maxSpan: number
): number | null {
  const lo = Math.max(0, anchorFret - maxSpan);
  const hi = Math.min(MAX_SEARCH_FRET, anchorFret + maxSpan);
  for (let f = lo; f <= hi; f++) {
    if (pitchAtFret(stringIndex, f) === targetPc) {
      return f;
    }
  }
  return null;
}
