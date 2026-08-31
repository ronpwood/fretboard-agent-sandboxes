// Pure model and geometry for the circle-of-fifths wheel.
// No DOM. Angle convention: degrees clockwise from 12 o'clock, so
// polarPoint is x = cx + r * sin(rad), y = cy - r * cos(rad).
// Wedge i is centred on i * 30 degrees, spanning i * 30 - 15 to i * 30 + 15.

import {
  CIRCLE_OF_FIFTHS_MAJORS,
  noteName,
  pitchClass,
  relativeMinorPc,
} from "./theory.ts";

export type WheelRing = "major" | "minor";

export type WheelSelection = { index: number; ring: WheelRing };

export type WheelSegment = {
  index: number;
  majorPc: number;
  majorName: string;
  minorPc: number;
  minorName: string;
  startAngle: number;
  endAngle: number;
  midAngle: number;
};

/** Number of wedges — one per key in the circle. */
export const WHEEL_SEGMENT_COUNT = 12;

/** Drawing constants shared by the SVG viewBox and every path/label. */
export const WHEEL_GEOMETRY = {
  size: 320,
  cx: 160,
  cy: 160,
  outerRadius: 152,
  ringRadius: 108,
  innerRadius: 64,
} as const;

/** The 12 wedges, in circle-of-fifths order starting at C at 12 o'clock. */
export const WHEEL_SEGMENTS: readonly WheelSegment[] = Object.freeze(
  CIRCLE_OF_FIFTHS_MAJORS.map((rawMajorName, index) => {
    const majorPc = pitchClass(rawMajorName);
    const minorPc = relativeMinorPc(majorPc);
    const startAngle = index * 30 - 15;
    const endAngle = index * 30 + 15;
    const midAngle = index * 30;
    const majorName = noteName(majorPc, majorPc);
    const minorName = noteName(minorPc, majorPc);
    return Object.freeze({
      index,
      majorPc,
      majorName,
      minorPc,
      minorName,
      startAngle,
      endAngle,
      midAngle,
    });
  })
);

/** Wedge at any integer index, wrapping modulo 12 (accepts negatives). */
export function segmentAt(index: number): WheelSegment {
  const wrapped = ((index % WHEEL_SEGMENT_COUNT) + WHEEL_SEGMENT_COUNT) % WHEEL_SEGMENT_COUNT;
  return WHEEL_SEGMENTS[wrapped];
}

/** Which wedge + band a key highlights. */
export function selectionForKey(tonicPc: number, mode: "major" | "minor"): WheelSelection {
  const pc = ((tonicPc % 12) + 12) % 12;
  if (mode === "major") {
    const segment = WHEEL_SEGMENTS.find((s) => s.majorPc === pc);
    if (!segment) throw new RangeError(`No wedge for major pitch class: ${pc}`);
    return { index: segment.index, ring: "major" };
  }
  const segment = WHEEL_SEGMENTS.find((s) => s.minorPc === pc);
  if (!segment) throw new RangeError(`No wedge for minor pitch class: ${pc}`);
  return { index: segment.index, ring: "minor" };
}

/** The key a wedge + band selects — inverse of selectionForKey. */
export function keyForSelection(selection: WheelSelection): { tonicPc: number; mode: "major" | "minor" } {
  const segment = segmentAt(selection.index);
  if (selection.ring === "major") {
    return { tonicPc: segment.majorPc, mode: "major" };
  }
  return { tonicPc: segment.minorPc, mode: "minor" };
}

/** The other band of the same wedge — the relative major/minor partner. */
export function relativeSelection(selection: WheelSelection): WheelSelection {
  return { index: selection.index, ring: selection.ring === "major" ? "minor" : "major" };
}

/** Wedge indices a fifth down (previous) and a fifth up (next), wrapping. */
export function neighborIndices(index: number): { previous: number; next: number } {
  return {
    previous: segmentAt(index - 1).index,
    next: segmentAt(index + 1).index,
  };
}

/** Point on the wheel at radius r and angle degrees clockwise from 12 o'clock. */
export function polarPoint(cx: number, cy: number, radius: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.sin(rad),
    y: cy - radius * Math.cos(rad),
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** SVG path `d` for one band of one wedge: an annular sector. */
export function wedgePath(index: number, ring: WheelRing): string {
  const segment = segmentAt(index);
  const { cx, cy, outerRadius, ringRadius, innerRadius } = WHEEL_GEOMETRY;
  const outer = ring === "major" ? outerRadius : ringRadius;
  const inner = ring === "major" ? ringRadius : innerRadius;

  const outerStart = polarPoint(cx, cy, outer, segment.startAngle);
  const outerEnd = polarPoint(cx, cy, outer, segment.endAngle);
  const innerEnd = polarPoint(cx, cy, inner, segment.endAngle);
  const innerStart = polarPoint(cx, cy, inner, segment.startAngle);

  return [
    `M ${round(outerStart.x)} ${round(outerStart.y)}`,
    `A ${outer} ${outer} 0 0 1 ${round(outerEnd.x)} ${round(outerEnd.y)}`,
    `L ${round(innerEnd.x)} ${round(innerEnd.y)}`,
    `A ${inner} ${inner} 0 0 0 ${round(innerStart.x)} ${round(innerStart.y)}`,
    "Z",
  ].join(" ");
}

/** Where the text label for one band sits (centre of that band's arc). */
export function labelPoint(index: number, ring: WheelRing): { x: number; y: number } {
  const segment = segmentAt(index);
  const { cx, cy, outerRadius, ringRadius, innerRadius } = WHEEL_GEOMETRY;
  const outer = ring === "major" ? outerRadius : ringRadius;
  const inner = ring === "major" ? ringRadius : innerRadius;
  const radius = (outer + inner) / 2;
  return polarPoint(cx, cy, radius, segment.midAngle);
}

/** Screen-reader / tooltip label, e.g. "G major", "E minor". */
export function ringLabel(index: number, ring: WheelRing): string {
  const segment = segmentAt(index);
  return ring === "major" ? `${segment.majorName} major` : `${segment.minorName} minor`;
}
