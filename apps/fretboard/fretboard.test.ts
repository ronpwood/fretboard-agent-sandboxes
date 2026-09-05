import { describe, test, expect } from "bun:test";
import {
  VIEW_MODES,
  DEFAULT_VIEW,
  toViewMode,
  otherView,
  viewLabel,
  panelVisibility,
  type ViewMode,
} from "./view-mode.ts";
import {
  diatonicTriads,
  triadNotes,
  pitchClass,
  noteName,
  relativeMinorPc,
  relativeMajorPc,
  CIRCLE_OF_FIFTHS_MAJORS,
  NOTE_NAMES,
  type Quality,
} from "./theory.ts";
import {
  WHEEL_SEGMENTS,
  WHEEL_SEGMENT_COUNT,
  WHEEL_GEOMETRY,
  segmentAt,
  selectionForKey,
  keyForSelection,
  relativeSelection,
  neighborIndices,
  polarPoint,
  wedgePath,
  labelPoint,
  ringLabel,
  type WheelRing,
} from "./circle-wheel.ts";
import { pitchAtFret, midiAtFret, STANDARD_TUNING, STANDARD_TUNING_MIDI, getAllFretboardNotes, filterFretboardNotes, noteRoleInTriad, type Fingering } from "./fretboard.ts";
import { findVoicings, bestVoicing } from "./voicing.ts";
import {
  A4_MIDI,
  A4_FREQUENCY,
  MAX_TOTAL_GAIN,
  NOTE_STAGGER_SECONDS,
  PROGRESSION_STEP_SECONDS,
  ENVELOPE_DEFAULTS,
  midiToFrequency,
  soundedNote,
  notesForPositions,
  notesForVoicing,
  progressionNotes,
  gainForVoiceCount,
  noteEnvelope,
  playbackDuration,
} from "./playback.ts";
import {
  clampVoicingIndex,
  stepVoicingIndex,
  voicingAt,
  voicingPositionLabel,
} from "./voicing-browser.ts";
import {
  layoutTriadOnStringSet,
  inversionRoles,
  STRING_SETS,
  type Inversion,
} from "./triad-layout.ts";
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  DEFAULT_PERSISTED_STATE,
  serializeState,
  parseState,
  toTonicPc,
  toMode,
  toDegreeIndex,
  toVoicingIndex,
  toInversion,
  toStringSetIndex,
  resolveDegreeIndex,
  type PersistedState,
} from "./persisted-state.ts";

describe("diatonicTriads", () => {
  test("C major", () => {
    const triads = diatonicTriads(0, "major");
    expect(triads.map((t) => t.root)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(triads.map((t) => t.quality)).toEqual([
      "major", "minor", "minor", "major", "major", "minor", "diminished",
    ]);
    expect(triads.map((t) => t.degree)).toEqual([
      "I", "ii", "iii", "IV", "V", "vi", "vii\u00b0",
    ]);
  });

  test("A natural minor", () => {
    const triads = diatonicTriads(9, "minor");
    expect(triads.map((t) => t.root)).toEqual([9, 11, 0, 2, 4, 5, 7]);
    expect(triads.map((t) => t.quality)).toEqual([
      "minor", "diminished", "major", "minor", "minor", "major", "major",
    ]);
    expect(triads.map((t) => t.degree)).toEqual([
      "i", "ii\u00b0", "III", "iv", "v", "VI", "VII",
    ]);
  });
});

describe("triadNotes", () => {
  const rows: [Quality, [number, number, number]][] = [
    ["major", [0, 4, 7]],
    ["minor", [0, 3, 7]],
    ["diminished", [0, 3, 6]],
    ["augmented", [0, 4, 8]],
  ];
  for (const [quality, expected] of rows) {
    test(quality, () => {
      expect(triadNotes(0, quality)).toEqual(expected);
    });
  }
});

describe("noteName key-aware spelling", () => {
  test("flat-side keys spell in-key accidentals flat", () => {
    const flatCases: [pc: number, keyTonicPc: number, expected: string][] = [
      [1, 1, "Db"],  // Db major I
      [6, 1, "Gb"],  // Db major IV (the prompt's Gb-not-F# case)
      [10, 1, "Bb"], // Db major V
      [3, 3, "Eb"],  // Eb major I
      [8, 3, "Ab"],  // Eb major IV
      [10, 5, "Bb"], // F major IV (the headline fix)
      [1, 8, "Db"],  // Ab major IV
      [3, 8, "Eb"],  // Ab major V
      [3, 10, "Eb"], // Bb major ii
      [10, 10, "Bb"],// Bb major I
    ];
    for (const [pc, keyTonicPc, expected] of flatCases) {
      expect(noteName(pc, keyTonicPc)).toBe(expected);
    }
  });

  test("sharp-side keys keep today's sharp spellings for every pc", () => {
    for (const keyTonicPc of [0, 2, 4, 6, 7, 9, 11]) {
      for (let pc = 0; pc < 12; pc++) {
        expect(noteName(pc, keyTonicPc)).toBe(NOTE_NAMES[pc]);
      }
    }
  });

  test("no keyTonicPc keeps today's spellings for every pc", () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(noteName(pc)).toBe(NOTE_NAMES[pc]);
    }
  });

  test("natural pcs are never respelled in flat keys", () => {
    for (const pc of [0, 2, 4, 5, 7, 9, 11]) {
      expect(noteName(pc, 1)).toBe(NOTE_NAMES[pc]);
    }
  });

  test("out-of-range pc still throws exactly as today", () => {
    expect(() => noteName(12)).toThrow(RangeError);
    expect(() => noteName(-1)).toThrow(RangeError);
    expect(() => noteName(1.5)).toThrow(RangeError);
    expect(() => noteName(12, 5)).toThrow(RangeError);
  });

  test("headline: F major's IV triad root spells Bb with key context", () => {
    const iv = diatonicTriads(5, "major").find((t) => t.degree === "IV")!;
    expect(noteName(iv.root, 5)).toBe("Bb");
  });
});

describe("pitchAtFret", () => {
  const rows: [number, number, number][] = [
    [0, 0, 4],
    [0, 3, 7],
    [1, 3, 0],
    [2, 2, 4],
    [4, 1, 0],
    [5, 12, 4],
    [3, 0, 7],
  ];
  for (const [str, fret, expected] of rows) {
    test(`string ${str} fret ${fret}`, () => {
      expect(pitchAtFret(str, fret)).toBe(expected);
    });
  }

  test("throws on out-of-range string", () => {
    expect(() => pitchAtFret(6, 0)).toThrow();
    expect(() => pitchAtFret(-1, 0)).toThrow();
  });

  test("throws on negative fret", () => {
    expect(() => pitchAtFret(0, -1)).toThrow();
  });
});

describe("bestVoicing known-answer fixtures", () => {
  test("C major", () => {
    expect(bestVoicing([0, 4, 7], 0)).toEqual([null, 3, 2, 0, 1, 0]);
  });
  test("G major", () => {
    expect(bestVoicing([7, 11, 2], 7)).toEqual([3, 2, 0, 0, 0, 3]);
  });
  test("D major", () => {
    expect(bestVoicing([2, 6, 9], 2)).toEqual([null, null, 0, 2, 3, 2]);
  });
  test("E minor", () => {
    expect(bestVoicing([4, 7, 11], 4)).toEqual([0, 2, 2, 0, 0, 0]);
  });
  test("A minor", () => {
    expect(bestVoicing([9, 0, 4], 9)).toEqual([null, 0, 2, 2, 1, 0]);
  });
});

describe("findVoicings invariants", () => {
  const cases: { name: string; tones: [number, number, number]; root: number; opts?: any }[] = [
    { name: "C major default", tones: [0, 4, 7], root: 0 },
    { name: "F# major default", tones: [6, 10, 1], root: 6 },
    { name: "D diminished default", tones: [2, 5, 8], root: 2 },
    { name: "C major shifted window", tones: [0, 4, 7], root: 0, opts: { minFret: 2, maxFret: 6 } },
  ];

  for (const { name, tones, root, opts } of cases) {
    test(name, () => {
      const maxSpan = opts?.maxSpan ?? 4;
      const minFret = opts?.minFret ?? 0;
      const maxFret = Math.min(opts?.maxFret ?? minFret + 4, minFret + 6);
      const voicings = findVoicings(tones, root, opts);
      expect(voicings.length).toBeGreaterThan(0);

      for (const voicing of voicings) {
        expect(voicing.length).toBe(6);

        const soundedIndices: number[] = [];
        for (let i = 0; i < voicing.length; i++) {
          if (voicing[i] !== null) soundedIndices.push(i);
        }
        expect(soundedIndices.length).toBeGreaterThan(0);

        const soundedPcs = soundedIndices.map((i) => pitchAtFret(i, voicing[i] as number));
        for (const tone of tones) {
          expect(soundedPcs).toContain(tone);
        }

        const lowest = soundedIndices[0];
        expect(pitchAtFret(lowest, voicing[lowest] as number)).toBe(root);

        const fretted = soundedIndices
          .map((i) => voicing[i] as number)
          .filter((f) => f > 0);
        if (fretted.length >= 2) {
          const span = Math.max(...fretted) - Math.min(...fretted);
          expect(span).toBeLessThanOrEqual(maxSpan);
        }

        for (const f of voicing) {
          if (f !== null) {
            expect(f).toBeGreaterThanOrEqual(minFret);
            expect(f).toBeLessThanOrEqual(maxFret);
          }
        }
      }

      // Ranking key should be non-decreasing across consecutive entries.
      function mutedCount(v: (number | null)[]) {
        return v.filter((f) => f === null).length;
      }
      function span(v: (number | null)[]) {
        const fretted = v.filter((f): f is number => f !== null && f > 0);
        if (fretted.length < 2) return 0;
        return Math.max(...fretted) - Math.min(...fretted);
      }
      function sum(v: (number | null)[]) {
        return v.reduce((s: number, f) => s + (f ?? 0), 0);
      }
      for (let i = 1; i < voicings.length; i++) {
        const a = voicings[i - 1];
        const b = voicings[i];
        const key = (v: (number | null)[]) => [mutedCount(v), span(v), sum(v)];
        const ka = key(a);
        const kb = key(b);
        let cmp = 0;
        for (let k = 0; k < 3; k++) {
          if (ka[k] !== kb[k]) {
            cmp = ka[k] - kb[k];
            break;
          }
        }
        expect(cmp).toBeLessThanOrEqual(0);
      }
    });
  }
});

describe("bestVoicing / findVoicings null case", () => {
  test("unreachable window returns null / empty", () => {
    expect(bestVoicing([0, 4, 7], 0, { minFret: 1, maxFret: 2 })).toBeNull();
    expect(findVoicings([0, 4, 7], 0, { minFret: 1, maxFret: 2 })).toEqual([]);
  });
});

describe("inversionRoles", () => {
  test("root", () => {
    expect(inversionRoles("root")).toEqual(["root", "third", "fifth"]);
  });
  test("first", () => {
    expect(inversionRoles("first")).toEqual(["third", "fifth", "root"]);
  });
  test("second", () => {
    expect(inversionRoles("second")).toEqual(["fifth", "root", "third"]);
  });
});

describe("layoutTriadOnStringSet", () => {
  test("C major root position on D-G-B strings (fixture)", () => {
    const result = layoutTriadOnStringSet(0, "major", "root", [2, 3, 4]);
    expect(result).toEqual([
      { string: 2, fret: 10, role: "root" },
      { string: 3, fret: 9, role: "third" },
      { string: 4, fret: 8, role: "fifth" },
    ]);
  });

  test("D major root position on D-G-B strings (octave-shifted anchor)", () => {
    const result = layoutTriadOnStringSet(2, "major", "root", [2, 3, 4]);
    expect(result).toEqual([
      { string: 2, fret: 12, role: "root" },
      { string: 3, fret: 11, role: "third" },
      { string: 4, fret: 10, role: "fifth" },
    ]);
  });

  const roots = [0, 3, 7, 9];
  const qualities: Quality[] = ["major", "minor", "diminished", "augmented"];
  const inversions: Inversion[] = ["root", "first", "second"];

  for (const root of roots) {
    for (const quality of qualities) {
      for (const inversion of inversions) {
        for (const stringSet of STRING_SETS) {
          test(`root=${root} quality=${quality} inversion=${inversion} set=${stringSet.join(",")}`, () => {
            const result = layoutTriadOnStringSet(root, quality, inversion, stringSet);
            expect(result).not.toBeNull();
            const positions = result!;
            expect(positions.length).toBe(3);

            const roles = inversionRoles(inversion);
            const notes = triadNotes(root, quality);
            const rolePc: Record<string, number> = {
              root: notes[0],
              third: notes[1],
              fifth: notes[2],
            };

            for (let i = 0; i < 3; i++) {
              expect(positions[i].string).toBe(stringSet[i]);
              expect(positions[i].role).toBe(roles[i]);
              expect(pitchAtFret(positions[i].string, positions[i].fret)).toBe(
                rolePc[positions[i].role]
              );
            }

            const frets = positions.map((p) => p.fret);
            expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(4);
          });
        }
      }
    }
  }
});

describe("voicing browser selection", () => {
  test("clamps into range", () => {
    expect(clampVoicingIndex(-3, 5)).toBe(0);
    expect(clampVoicingIndex(9, 5)).toBe(4);
    expect(clampVoicingIndex(2, 5)).toBe(2);
    expect(clampVoicingIndex(0, 0)).toBe(0);
    expect(clampVoicingIndex(3, 0)).toBe(0);
    expect(clampVoicingIndex(NaN, 5)).toBe(0);
  });

  test("stepping clamps at both ends, never wraps", () => {
    expect(stepVoicingIndex(0, 3, -1)).toBe(0);
    expect(stepVoicingIndex(0, 3, 1)).toBe(1);
    expect(stepVoicingIndex(2, 3, 1)).toBe(2);
    expect(stepVoicingIndex(1, 3, -1)).toBe(0);
    expect(stepVoicingIndex(0, 0, 1)).toBe(0);
  });

  test("voicingAt / position label", () => {
    const list = findVoicings([0, 4, 7], 0);
    expect(voicingAt(list, 0)).toEqual(bestVoicing([0, 4, 7], 0)!);
    expect(voicingAt(list, 999)).toEqual(list[list.length - 1]);
    expect(voicingAt([], 0)).toBeNull();
    expect(voicingPositionLabel(0, list.length)).toBe(`1 of ${list.length}`);
    expect(voicingPositionLabel(999, list.length)).toBe(`${list.length} of ${list.length}`);
    expect(voicingPositionLabel(0, 0)).toBe("");
  });

  test("stepping walks the ranked list of a real chord", () => {
    // C major and G major both return several distinct voicings today.
    for (const [tones, root] of [[[0, 4, 7], 0], [[7, 11, 2], 7]] as const) {
      const list = findVoicings(tones as [number, number, number], root);
      expect(list.length).toBeGreaterThan(1);

      // Default is the top-ranked voicing.
      let index = 0;
      expect(voicingAt(list, index)).toEqual(bestVoicing(tones as [number, number, number], root)!);

      // Next moves to a different fingering; prev returns to the default.
      index = stepVoicingIndex(index, list.length, 1);
      expect(index).toBe(1);
      expect(voicingAt(list, index)).not.toEqual(voicingAt(list, 0)!);
      index = stepVoicingIndex(index, list.length, -1);
      expect(index).toBe(0);
      expect(voicingAt(list, index)).toEqual(list[0]);

      // Walking forward past the end parks on the last entry, and every visited
      // index yields a voicing.
      let walk = 0;
      for (let i = 0; i < list.length + 5; i++) {
        expect(voicingAt(list, walk)).not.toBeNull();
        walk = stepVoicingIndex(walk, list.length, 1);
      }
      expect(walk).toBe(list.length - 1);
    }
  });
});

describe("view mode", () => {
  test("exactly one panel is visible for every view", () => {
    for (const v of VIEW_MODES) {
      const visibility = panelVisibility(v);
      expect(Object.values(visibility).filter(Boolean).length).toBe(1);
    }
  });

  test("the default view is the chord diagram", () => {
    expect(DEFAULT_VIEW).toBe("chord");
    expect(panelVisibility(DEFAULT_VIEW)).toEqual({ chord: true, triad: false, explorer: false });
    expect(VIEW_MODES[0]).toBe(DEFAULT_VIEW);
  });

  test("toggling cycles through all the views", () => {
    expect(VIEW_MODES.length).toBe(3);
    let current: ViewMode = "chord";
    const seen: ViewMode[] = [];
    for (let i = 0; i < 3; i++) {
      current = otherView(current);
      seen.push(current);
    }
    expect(seen).toEqual(["triad", "explorer", "chord"]);
    for (const v of VIEW_MODES) {
      expect(panelVisibility(otherView(v))).not.toEqual(panelVisibility(v));
    }
  });

  test("unknown values fall back to the default", () => {
    expect(toViewMode("nonsense")).toBe(DEFAULT_VIEW);
    expect(toViewMode("")).toBe(DEFAULT_VIEW);
    expect(toViewMode(null)).toBe(DEFAULT_VIEW);
    expect(toViewMode(undefined)).toBe(DEFAULT_VIEW);
    expect(toViewMode(7)).toBe(DEFAULT_VIEW);
    expect(toViewMode("triad")).toBe("triad");
    expect(toViewMode("chord")).toBe("chord");
  });

  test("labels are distinct and non-empty", () => {
    for (const v of VIEW_MODES) {
      expect(viewLabel(v).length).toBeGreaterThan(0);
    }
    expect(viewLabel("chord")).toBe("Chord diagram");
    expect(viewLabel("triad")).toBe("Triad layout");
    expect(viewLabel("explorer")).toBe("Fretboard explorer");
    expect(viewLabel("chord")).not.toBe(viewLabel("triad"));
  });

  test("explorer view is recognized and exposed by every helper", () => {
    expect(toViewMode("explorer")).toBe("explorer");
    expect(VIEW_MODES).toContain("explorer");
    expect(panelVisibility("explorer")).toEqual({ chord: false, triad: false, explorer: true });
  });

  test("unknown values still fall back to the default", () => {
    expect(toViewMode("explorer")).toBe("explorer");
    expect(toViewMode("nosuchview")).toBe(DEFAULT_VIEW);
  });
});

describe("circle of fifths wheel", () => {
  describe("model", () => {
    test("has one wedge per key, indexed in order", () => {
      expect(WHEEL_SEGMENTS.length).toBe(12);
      expect(WHEEL_SEGMENT_COUNT).toBe(12);
      WHEEL_SEGMENTS.forEach((segment, i) => {
        expect(segment.index).toBe(i);
      });
      expect(WHEEL_SEGMENTS.map((s) => s.majorName)).toEqual([
        "C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F",
      ]);
    });

    test("major pitch classes ascend by a fifth and cover all 12", () => {
      for (let i = 1; i < 12; i++) {
        const prev = WHEEL_SEGMENTS[i - 1].majorPc;
        const curr = WHEEL_SEGMENTS[i].majorPc;
        expect(curr).toBe((prev + 7) % 12);
      }
      const majorPcs = WHEEL_SEGMENTS.map((s) => s.majorPc).slice().sort((a, b) => a - b);
      expect(majorPcs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

      for (let i = 1; i < 12; i++) {
        const prev = WHEEL_SEGMENTS[i - 1].minorPc;
        const curr = WHEEL_SEGMENTS[i].minorPc;
        expect(curr).toBe((prev + 7) % 12);
      }
      const minorPcs = WHEEL_SEGMENTS.map((s) => s.minorPc).slice().sort((a, b) => a - b);
      expect(minorPcs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });

    test("minor pc is the relative minor of the major pc, three wedges ahead", () => {
      WHEEL_SEGMENTS.forEach((segment) => {
        expect(segment.minorPc).toBe(relativeMinorPc(segment.majorPc));
        const relativeMajorSegment = segmentAt(segment.index + 3);
        expect(relativeMajorSegment.majorPc).toBe(segment.minorPc);
        expect(segment.minorName).toBe(noteName(segment.minorPc, segment.majorPc));
      });
    });

    test("spot checks for specific wedges", () => {
      expect(WHEEL_SEGMENTS[0].majorName).toBe("C");
      expect(WHEEL_SEGMENTS[0].minorName).toBe("A");
      expect(WHEEL_SEGMENTS[1].majorName).toBe("G");
      expect(WHEEL_SEGMENTS[1].minorName).toBe("E");
      expect(WHEEL_SEGMENTS[6].majorName).toBe("F#");
      expect(WHEEL_SEGMENTS[6].minorName).toBe("D#");
      expect(WHEEL_SEGMENTS[7].majorName).toBe("Db");
      expect(WHEEL_SEGMENTS[7].minorName).toBe("Bb");
      expect(WHEEL_SEGMENTS[8].majorName).toBe("Ab");
      expect(WHEEL_SEGMENTS[8].minorName).toBe("F");
      expect(WHEEL_SEGMENTS[9].majorName).toBe("Eb");
      expect(WHEEL_SEGMENTS[9].minorName).toBe("C");
      expect(WHEEL_SEGMENTS[10].majorName).toBe("Bb");
      expect(WHEEL_SEGMENTS[10].minorName).toBe("G");
      expect(WHEEL_SEGMENTS[11].majorName).toBe("F");
      expect(WHEEL_SEGMENTS[11].minorName).toBe("D");
    });
  });

  describe("selection sync", () => {
    test("keyForSelection(selectionForKey(pc, mode)) round trips for all keys", () => {
      for (let pc = 0; pc < 12; pc++) {
        for (const mode of ["major", "minor"] as const) {
          const key = keyForSelection(selectionForKey(pc, mode));
          expect(key).toEqual({ tonicPc: pc, mode });
        }
      }
    });

    test("selectionForKey(...keyForSelection(sel)) round trips for all wedges/rings", () => {
      for (let index = 0; index < 12; index++) {
        for (const ring of ["major", "minor"] as const) {
          const key = keyForSelection({ index, ring });
          const selection = selectionForKey(key.tonicPc, key.mode);
          expect(selection).toEqual({ index, ring });
        }
      }
    });

    test("named selection cases", () => {
      expect(selectionForKey(pitchClass("A"), "minor")).toEqual({ index: 0, ring: "minor" });
      expect(selectionForKey(pitchClass("C"), "major")).toEqual({ index: 0, ring: "major" });
      expect(selectionForKey(pitchClass("E"), "minor")).toEqual({ index: 1, ring: "minor" });
    });

    test("relativeSelection flips the ring, keeps the index, and is its own inverse", () => {
      for (let index = 0; index < 12; index++) {
        for (const ring of ["major", "minor"] as const) {
          const selection: { index: number; ring: WheelRing } = { index, ring };
          const related = relativeSelection(selection);
          expect(related.index).toBe(index);
          expect(related.ring).toBe(ring === "major" ? "minor" : "major");
          expect(relativeSelection(related)).toEqual(selection);

          const original = keyForSelection(selection);
          const relatedKey = keyForSelection(related);
          if (ring === "major") {
            expect(relatedKey.tonicPc).toBe(relativeMinorPc(original.tonicPc));
          } else {
            expect(relatedKey.tonicPc).toBe(relativeMajorPc(original.tonicPc));
          }
        }
      }
    });

    test("segmentAt wraps modulo 12, including negatives", () => {
      expect(segmentAt(12)).toEqual(segmentAt(0));
      expect(segmentAt(-1)).toEqual(segmentAt(11));
    });

    test("neighborIndices returns a fifth up and a fifth down, wrapping", () => {
      for (let index = 0; index < 12; index++) {
        const { previous, next } = neighborIndices(index);
        expect(next).toBe((index + 1) % 12);
        expect(previous).toBe((index + 11) % 12);
      }
      expect(neighborIndices(0)).toEqual({ previous: 11, next: 1 });
      expect(neighborIndices(11)).toEqual({ previous: 10, next: 0 });
    });

    test("ringLabel produces readable, distinct labels", () => {
      expect(ringLabel(0, "major")).toBe("C major");
      expect(ringLabel(0, "minor")).toBe("A minor");
      const labels = new Set<string>();
      for (let index = 0; index < 12; index++) {
        for (const ring of ["major", "minor"] as const) {
          const label = ringLabel(index, ring);
          expect(label.length).toBeGreaterThan(0);
          labels.add(label);
        }
      }
      expect(labels.size).toBe(24);
    });
  });

  describe("geometry", () => {
    test("wedges span exactly 30 degrees and tile 360 degrees", () => {
      WHEEL_SEGMENTS.forEach((segment) => {
        expect(segment.endAngle - segment.startAngle).toBe(30);
        expect(segment.startAngle).toBeLessThan(segment.midAngle);
        expect(segment.midAngle).toBeLessThan(segment.endAngle);
      });
      for (let i = 0; i < 11; i++) {
        expect(WHEEL_SEGMENTS[i].endAngle).toBe(WHEEL_SEGMENTS[i + 1].startAngle);
      }
      const totalSpan = WHEEL_SEGMENTS.reduce(
        (sum, s) => sum + (s.endAngle - s.startAngle),
        0
      );
      expect(totalSpan).toBe(360);
    });

    test("polarPoint places points at expected clock positions", () => {
      const top = polarPoint(160, 160, 100, 0);
      expect(top.x).toBeCloseTo(160);
      expect(top.y).toBeCloseTo(60);

      const right = polarPoint(160, 160, 100, 90);
      expect(right.x).toBeCloseTo(260);
      expect(right.y).toBeCloseTo(160);

      const bottom = polarPoint(160, 160, 100, 180);
      expect(bottom.x).toBeCloseTo(160);
      expect(bottom.y).toBeCloseTo(260);
    });

    test("wedgePath emits a well-formed, in-bounds annular sector path", () => {
      for (let index = 0; index < 12; index++) {
        for (const ring of ["major", "minor"] as const) {
          const d = wedgePath(index, ring);
          expect(d.startsWith("M")).toBe(true);
          expect(d.endsWith("Z")).toBe(true);
          const arcCount = (d.match(/A/g) || []).length;
          expect(arcCount).toBe(2);

          const numbers = d.match(/-?\d+(\.\d+)?/g) || [];
          expect(numbers.length).toBeGreaterThan(0);
          for (const n of numbers) {
            const value = Number(n);
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(WHEEL_GEOMETRY.size);
          }
        }
      }
    });

    test("labelPoint sits within the correct band radius", () => {
      const { cx, cy, outerRadius, ringRadius, innerRadius } = WHEEL_GEOMETRY;
      for (let index = 0; index < 12; index++) {
        const majorPoint = labelPoint(index, "major");
        const majorDist = Math.hypot(majorPoint.x - cx, majorPoint.y - cy);
        expect(majorDist).toBeGreaterThanOrEqual(ringRadius);
        expect(majorDist).toBeLessThanOrEqual(outerRadius);

        const minorPoint = labelPoint(index, "minor");
        const minorDist = Math.hypot(minorPoint.x - cx, minorPoint.y - cy);
        expect(minorDist).toBeGreaterThanOrEqual(innerRadius);
        expect(minorDist).toBeLessThanOrEqual(ringRadius);
      }
      const cMajorLabel = labelPoint(0, "major");
      expect(cMajorLabel.y).toBeLessThan(WHEEL_GEOMETRY.cy);
    });

    test("radii are ordered sensibly", () => {
      const { innerRadius, ringRadius, outerRadius, size } = WHEEL_GEOMETRY;
      expect(innerRadius).toBeLessThan(ringRadius);
      expect(ringRadius).toBeLessThan(outerRadius);
      expect(outerRadius).toBeLessThan(size / 2);
    });
  });
});

describe("midiAtFret", () => {
  test("open strings equal STANDARD_TUNING_MIDI", () => {
    expect(STANDARD_TUNING_MIDI).toEqual([40, 45, 50, 55, 59, 64]);
    for (let s = 0; s < 6; s++) {
      expect(midiAtFret(s, 0)).toBe(STANDARD_TUNING_MIDI[s]);
    }
  });

  test("strictly ascending low to high open strings", () => {
    for (let s = 1; s < 6; s++) {
      expect(STANDARD_TUNING_MIDI[s]).toBeGreaterThan(STANDARD_TUNING_MIDI[s - 1]);
    }
  });

  test("consistent with pitch-class math", () => {
    for (let s = 0; s < 6; s++) {
      expect(STANDARD_TUNING_MIDI[s] % 12).toBe(STANDARD_TUNING[s]);
      for (let f = 0; f <= 15; f++) {
        expect(midiAtFret(s, f) % 12).toBe(pitchAtFret(s, f));
      }
    }
  });

  test("an octave up is +12", () => {
    for (let s = 0; s < 6; s++) {
      for (let f = 0; f <= 12; f++) {
        expect(midiAtFret(s, f + 12)).toBe(midiAtFret(s, f) + 12);
      }
    }
  });

  test("fixtures", () => {
    expect(midiAtFret(0, 0)).toBe(40);
    expect(midiAtFret(1, 3)).toBe(48);
    expect(midiAtFret(5, 0)).toBe(64);
    expect(midiAtFret(0, 12)).toBe(52);
  });

  test("throws on out-of-range inputs", () => {
    expect(() => midiAtFret(6, 0)).toThrow();
    expect(() => midiAtFret(-1, 0)).toThrow();
    expect(() => midiAtFret(0, -1)).toThrow();
    expect(() => midiAtFret(0.5, 0)).toThrow();
  });
});

describe("getAllFretboardNotes", () => {
  test("returns all 78 positions across 6 strings and frets 0..12", () => {
    const notes = getAllFretboardNotes();
    expect(notes.length).toBe(6 * 13);
    expect(notes.length).toBe(78);
  });

  test("low E open string is MIDI 40 (pitch class 4)", () => {
    const lowE = getAllFretboardNotes().find((n) => n.stringIndex === 0 && n.fret === 0)!;
    expect(lowE).toBeDefined();
    expect(lowE.midi).toBe(40);
    expect(lowE.pitchClass).toBe(4);
  });

  test("high E 12th fret is MIDI 76 (pitch class 4)", () => {
    const highE = getAllFretboardNotes().find((n) => n.stringIndex === 5 && n.fret === 12)!;
    expect(highE).toBeDefined();
    expect(highE.midi).toBe(64 + 12);
    expect(highE.midi).toBe(76);
    expect(highE.pitchClass).toBe(4);
  });

  test("midi and pitchClass are consistent with the pure helpers", () => {
    for (const note of getAllFretboardNotes()) {
      expect(note.midi).toBe(midiAtFret(note.stringIndex, note.fret));
      expect(note.pitchClass).toBe(pitchAtFret(note.stringIndex, note.fret));
    }
  });

  test("honors a custom max fret", () => {
    expect(getAllFretboardNotes(5).length).toBe(6 * 6);
    expect(getAllFretboardNotes(0).length).toBe(6);
  });
});

describe("filterFretboardNotes", () => {
  test("keeps only the target pitch classes (C major triad)", () => {
    const filtered = filterFretboardNotes(getAllFretboardNotes(), [0, 4, 7]);
    expect(filtered.length).toBeGreaterThan(0);
    for (const note of filtered) {
      expect([0, 4, 7]).toContain(note.pitchClass);
    }
  });

  test("an empty target list yields no matches", () => {
    expect(filterFretboardNotes(getAllFretboardNotes(), [])).toEqual([]);
  });
});

describe("noteRoleInTriad", () => {
  test("C major: 0 is root, 4 is third, 7 is fifth, anything else is other", () => {
    expect(noteRoleInTriad(0, 0, "major")).toBe("root");
    expect(noteRoleInTriad(4, 0, "major")).toBe("third");
    expect(noteRoleInTriad(7, 0, "major")).toBe("fifth");
    expect(noteRoleInTriad(3, 0, "major")).toBe("other");
  });

  test("maps correctly across all qualities", () => {
    const cases: [Quality, { root: number; third: number; fifth: number }][] = [
      ["major", { root: 0, third: 4, fifth: 7 }],
      ["minor", { root: 0, third: 3, fifth: 7 }],
      ["diminished", { root: 0, third: 3, fifth: 6 }],
      ["augmented", { root: 0, third: 4, fifth: 8 }],
    ];
    for (const [quality, expected] of cases) {
      expect(noteRoleInTriad(expected.root, 0, quality)).toBe("root");
      expect(noteRoleInTriad(expected.third, 0, quality)).toBe("third");
      expect(noteRoleInTriad(expected.fifth, 0, quality)).toBe("fifth");
      expect(noteRoleInTriad(expected.root + 1, 0, quality)).toBe("other");
      expect(triadNotes(0, quality)).toEqual([expected.root, expected.third, expected.fifth]);
    }
  });

  test("normalizes pitch classes outside 0..11", () => {
    expect(noteRoleInTriad(12, 0, "major")).toBe("root");
    expect(noteRoleInTriad(16, 0, "major")).toBe("third");
    expect(noteRoleInTriad(-8, 0, "major")).toBe("third");
    expect(noteRoleInTriad(-5, 0, "major")).toBe("fifth");
  });
});

describe("midiToFrequency", () => {
  test("A4 anchor", () => {
    expect(A4_MIDI).toBe(69);
    expect(midiToFrequency(A4_MIDI)).toBe(A4_FREQUENCY);
  });

  test("octaves", () => {
    expect(midiToFrequency(57)).toBeCloseTo(220, 6);
    expect(midiToFrequency(81)).toBeCloseTo(880, 6);
  });

  test("known value: middle C", () => {
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
  });

  test("low E of the guitar", () => {
    expect(midiToFrequency(midiAtFret(0, 0))).toBeCloseTo(82.4069, 3);
  });

  test("strictly increasing with constant semitone ratio", () => {
    const semitoneRatio = 2 ** (1 / 12);
    let prev = midiToFrequency(40);
    for (let m = 41; m <= 80; m++) {
      const curr = midiToFrequency(m);
      expect(curr).toBeGreaterThan(prev);
      expect(curr / prev).toBeCloseTo(semitoneRatio, 6);
      prev = curr;
    }
  });

  test("throws on non-finite input", () => {
    expect(() => midiToFrequency(NaN)).toThrow();
    expect(() => midiToFrequency(Infinity)).toThrow();
  });
});

describe("notes for a displayed shape", () => {
  test("muted strings are silent", () => {
    const voicing = bestVoicing([0, 4, 7], 0)!;
    expect(voicing).toEqual([null, 3, 2, 0, 1, 0]);
    const notes = notesForVoicing(voicing);
    expect(notes.length).toBe(5);
    expect(notes.map((n) => n.string)).toEqual([1, 2, 3, 4, 5]);
    expect(notes.map((n) => n.midi)).toEqual([48, 52, 55, 60, 64]);
    expect(notes.some((n) => n.string === 0)).toBe(false);
  });

  test("frequencies agree with the pitch math", () => {
    const voicing = bestVoicing([0, 4, 7], 0)!;
    for (const note of notesForVoicing(voicing)) {
      expect(note.frequency).toBe(midiToFrequency(note.midi));
      expect(note.midi).toBe(midiAtFret(note.string, note.fret));
    }
  });

  test("offsets stagger correctly", () => {
    const voicing = bestVoicing([0, 4, 7], 0)!;
    const notes = notesForVoicing(voicing);
    expect(notes[0].offset).toBe(0);
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i].offset).toBeGreaterThan(notes[i - 1].offset);
      expect(notes[i].offset).toBeCloseTo(i * NOTE_STAGGER_SECONDS, 9);
    }

    const scaled = notesForVoicing(voicing, { stagger: 0.1 });
    scaled.forEach((n, i) => expect(n.offset).toBeCloseTo(i * 0.1, 9));

    const zero = notesForVoicing(voicing, { stagger: 0 });
    zero.forEach((n) => expect(n.offset).toBe(0));

    expect(() => notesForVoicing(voicing, { stagger: -0.1 })).toThrow();
  });

  test("empty cases yield []", () => {
    expect(notesForVoicing([null, null, null, null, null, null])).toEqual([]);
    expect(notesForPositions([])).toEqual([]);
  });

  test("every sounded note belongs to the chord", () => {
    const cases: [[number, number, number], number][] = [
      [[0, 4, 7], 0],
      [[7, 11, 2], 7],
      [[9, 0, 4], 9],
    ];
    for (const [tones, root] of cases) {
      const voicings = findVoicings(tones, root).slice(0, 3);
      for (const voicing of voicings) {
        const notes = notesForVoicing(voicing);
        const nonNullCount = voicing.filter((f) => f !== null).length;
        expect(notes.length).toBe(nonNullCount);
        for (const note of notes) {
          expect(tones).toContain(note.midi % 12);
        }
      }
    }
  });

  test("triad layouts produce correct notes", () => {
    const cases: [number, "major" | "minor"][] = [
      [0, "major"],
      [9, "minor"],
    ];
    for (const [root, quality] of cases) {
      for (const stringSet of STRING_SETS) {
        for (const inversion of ["root", "first", "second"] as Inversion[]) {
          const layout = layoutTriadOnStringSet(root, quality, inversion, stringSet)!;
          expect(layout).not.toBeNull();
          const notes = notesForPositions(layout);
          expect(notes.length).toBe(3);
          for (let i = 1; i < notes.length; i++) {
            expect(notes[i].string).toBeGreaterThan(notes[i - 1].string);
            expect(notes[i].offset).toBeGreaterThan(notes[i - 1].offset);
          }
          const rolePc: Record<string, number> = {
            root: triadNotes(root, quality)[0],
            third: triadNotes(root, quality)[1],
            fifth: triadNotes(root, quality)[2],
          };
          const sortedLayout = layout.slice().sort((a, b) => a.string - b.string);
          notes.forEach((note, i) => {
            expect(note.midi % 12).toBe(rolePc[sortedLayout[i].role]);
          });
        }
      }
    }
  });

  test("notesForPositions does not mutate input and sorts unordered input", () => {
    const positions = [
      { string: 4, fret: 1 },
      { string: 1, fret: 3 },
      { string: 2, fret: 2 },
    ];
    const before = positions.map((p) => ({ ...p }));
    const notes = notesForPositions(positions);
    expect(positions).toEqual(before);
    expect(notes.map((n) => n.string)).toEqual([1, 2, 4]);
  });

  test("soundedNote", () => {
    const note = soundedNote(2, 5);
    expect(note.offset).toBe(0);
    expect(note.midi).toBe(midiAtFret(2, 5));
    expect(note.frequency).toBe(midiToFrequency(midiAtFret(2, 5)));
  });
});

describe("progressionNotes", () => {
  test("two single-note fingerings produce two notes whose offsets differ by exactly stepSeconds", () => {
    const f1: Fingering = [null, null, null, null, null, 0];
    const f2: Fingering = [null, null, null, null, null, 2];
    const step = 0.8;
    const notes = progressionNotes([f1, f2], { stepSeconds: step });

    expect(notes.length).toBe(2);
    expect(notes[0].offset).toBeCloseTo(0, 9);
    expect(notes[1].offset).toBeCloseTo(step, 9);
    expect(notes[1].offset - notes[0].offset).toBeCloseTo(step, 9);
  });

  test("a null entry among the fingerings is skipped and does not shift later chords' offsets by an extra step", () => {
    const f1: Fingering = [null, null, null, null, null, 0];
    const f2: Fingering = [null, null, null, null, null, 2];
    const step = 0.75;
    const notes = progressionNotes([f1, null, f2], { stepSeconds: step });

    expect(notes.length).toBe(2);
    expect(notes[0].offset).toBeCloseTo(0, 9);
    expect(notes[1].offset).toBeCloseTo(step, 9);

    // Leading null is also skipped without delay
    const notesLeading = progressionNotes([null, f1], { stepSeconds: step });
    expect(notesLeading.length).toBe(1);
    expect(notesLeading[0].offset).toBeCloseTo(0, 9);

    // Null array yields empty list
    expect(progressionNotes([null, null])).toEqual([]);
    expect(progressionNotes([])).toEqual([]);
  });

  test("a fingering with multiple sounded strings preserves notesForVoicing's existing intra-chord stagger on top of the chord's step offset", () => {
    const cVoicing = bestVoicing([0, 4, 7], 0)!;
    const gVoicing = bestVoicing([7, 11, 2], 7)!;
    const step = 1.0;
    const notes = progressionNotes([cVoicing, gVoicing], { stepSeconds: step });

    const cNotes = notesForVoicing(cVoicing);
    const gNotes = notesForVoicing(gVoicing);
    expect(notes.length).toBe(cNotes.length + gNotes.length);

    // First chord notes match intra-chord stagger starting at 0
    for (let i = 0; i < cNotes.length; i++) {
      expect(notes[i].string).toBe(cNotes[i].string);
      expect(notes[i].fret).toBe(cNotes[i].fret);
      expect(notes[i].offset).toBeCloseTo(cNotes[i].offset, 9);
    }

    // Second chord notes match intra-chord stagger starting at step
    const offsetBase = cNotes.length;
    for (let j = 0; j < gNotes.length; j++) {
      expect(notes[offsetBase + j].string).toBe(gNotes[j].string);
      expect(notes[offsetBase + j].fret).toBe(gNotes[j].fret);
      expect(notes[offsetBase + j].offset).toBeCloseTo(step + gNotes[j].offset, 9);
    }
  });

  test("defaults stepSeconds to PROGRESSION_STEP_SECONDS when omitted", () => {
    const f1: Fingering = [null, null, null, null, null, 0];
    const f2: Fingering = [null, null, null, null, null, 2];
    const notes = progressionNotes([f1, f2]);
    expect(notes[1].offset).toBeCloseTo(PROGRESSION_STEP_SECONDS, 9);
  });

  test("throws RangeError on negative stepSeconds", () => {
    const f1: Fingering = [null, null, null, null, null, 0];
    expect(() => progressionNotes([f1], { stepSeconds: -0.1 })).toThrow(RangeError);
  });

  test("schedules a four-chord progression at consecutive steps", () => {
    const triads = diatonicTriads(0, "major");
    const voicings = [0, 3, 4, 5].map((idx) => findVoicings(triads[idx].notes, triads[idx].root)[0] ?? null);
    const step = 0.9;
    const notes = progressionNotes(voicings, { stepSeconds: step });
    expect(notes.length).toBeGreaterThan(12);

    const cNotes = notesForVoicing(voicings[0]!);
    const fNotes = notesForVoicing(voicings[1]!);
    const gNotes = notesForVoicing(voicings[2]!);
    const aNotes = notesForVoicing(voicings[3]!);
    expect(notes.length).toBe(cNotes.length + fNotes.length + gNotes.length + aNotes.length);

    expect(notes[0].offset).toBeCloseTo(0, 9);
    expect(notes[cNotes.length].offset).toBeCloseTo(step, 9);
    expect(notes[cNotes.length + fNotes.length].offset).toBeCloseTo(step * 2, 9);
    expect(notes[cNotes.length + fNotes.length + gNotes.length].offset).toBeCloseTo(step * 3, 9);
  });
});

describe("voice gain", () => {
  test("single voice gets max gain", () => {
    expect(gainForVoiceCount(1)).toBe(MAX_TOTAL_GAIN);
  });

  test("non-increasing as count rises, always in (0, MAX_TOTAL_GAIN]", () => {
    let prev = gainForVoiceCount(1);
    for (let n = 2; n <= 6; n++) {
      const gain = gainForVoiceCount(n);
      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeLessThanOrEqual(MAX_TOTAL_GAIN);
      expect(gain).toBeLessThanOrEqual(prev);
      prev = gain;
    }
  });

  test("total headroom stays within MAX_TOTAL_GAIN", () => {
    for (let n = 1; n <= 6; n++) {
      expect(n * gainForVoiceCount(n)).toBeLessThanOrEqual(MAX_TOTAL_GAIN + 1e-9);
    }
  });

  test("degenerate counts behave like 1", () => {
    expect(gainForVoiceCount(0)).toBe(MAX_TOTAL_GAIN);
    expect(gainForVoiceCount(-3)).toBe(MAX_TOTAL_GAIN);
    expect(gainForVoiceCount(NaN)).toBe(MAX_TOTAL_GAIN);
  });
});

describe("note envelope", () => {
  test("strictly ordered timeline", () => {
    const optsList: Partial<typeof ENVELOPE_DEFAULTS>[] = [
      {},
      { duration: 0.05, attack: 0.001, decay: 0.001, release: 0.001 },
      { attack: 0.001 },
    ];
    for (const opts of optsList) {
      const env = noteEnvelope(1, 0.5, opts);
      expect(env.startAt).toBeLessThan(env.peakAt);
      expect(env.peakAt).toBeLessThan(env.sustainAt);
      expect(env.sustainAt).toBeLessThan(env.releaseAt);
      expect(env.releaseAt).toBeLessThan(env.stopAt);
    }
  });

  test("levels", () => {
    const env = noteEnvelope(0, 0.5);
    expect(env.peakGain).toBe(0.5);
    expect(env.sustainGain).toBeGreaterThan(0);
    expect(env.sustainGain).toBeLessThanOrEqual(env.peakGain);
  });

  test("translation invariance", () => {
    const a = noteEnvelope(2, 0.5);
    const b = noteEnvelope(7, 0.5);
    expect(b.startAt).toBeCloseTo(a.startAt + 5, 9);
    expect(b.peakAt).toBeCloseTo(a.peakAt + 5, 9);
    expect(b.sustainAt).toBeCloseTo(a.sustainAt + 5, 9);
    expect(b.releaseAt).toBeCloseTo(a.releaseAt + 5, 9);
    expect(b.stopAt).toBeCloseTo(a.stopAt + 5, 9);
  });

  test("defaults are respected", () => {
    const env = noteEnvelope(0, 0.5);
    expect(env.releaseAt - env.startAt).toBeCloseTo(ENVELOPE_DEFAULTS.duration, 9);
    expect(env.stopAt - env.releaseAt).toBeCloseTo(ENVELOPE_DEFAULTS.release, 9);
  });

  test("all fields are finite numbers", () => {
    const env = noteEnvelope(0, 0.5);
    for (const value of Object.values(env)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  test("playbackDuration exceeds every offset and is 0 for empty", () => {
    expect(playbackDuration([])).toBe(0);
    const voicing = bestVoicing([0, 4, 7], 0)!;
    const notes = notesForVoicing(voicing);
    const duration = playbackDuration(notes);
    const maxOffset = Math.max(...notes.map((n) => n.offset));
    expect(duration).toBeCloseTo(maxOffset + ENVELOPE_DEFAULTS.duration + ENVELOPE_DEFAULTS.release, 9);
    expect(duration).toBeGreaterThan(maxOffset);
  });
});

describe("persisted UI state", () => {
  test("round trip preserves a non-default state", () => {
    const s: PersistedState = {
      tonicPc: 7,
      mode: "minor",
      degreeIndex: 4,
      view: "triad",
      voicingIndex: 3,
      inversion: "second",
      stringSetIndex: 0,
    };
    expect(parseState(serializeState(s))).toEqual(s);
  });

  test("serialized JSON carries the version, and STORAGE_KEY is non-empty", () => {
    const parsed = JSON.parse(serializeState(DEFAULT_PERSISTED_STATE));
    expect(parsed.version).toBe(STORAGE_VERSION);
    expect(typeof STORAGE_KEY).toBe("string");
    expect(STORAGE_KEY.length).toBeGreaterThan(0);
  });

  test("round trips the explorer view without loss", () => {
    const s: PersistedState = {
      tonicPc: 2,
      mode: "minor",
      degreeIndex: 3,
      view: "explorer",
      voicingIndex: 1,
      inversion: "first",
      stringSetIndex: 1,
    };
    expect(parseState(serializeState(s))).toEqual(s);
    expect(parseState(serializeState(s)).view).toBe("explorer");
  });

  test("nothing stored falls back to defaults", () => {
    expect(parseState(null)).toEqual(DEFAULT_PERSISTED_STATE);
    expect(parseState(undefined)).toEqual(DEFAULT_PERSISTED_STATE);
    expect(parseState("")).toEqual(DEFAULT_PERSISTED_STATE);
  });

  test("corrupt input falls back to defaults and never throws", () => {
    const junk = [
      "{",
      "not json",
      "[]",
      "42",
      "null",
      "true",
      '"chord"',
      "[1,2,3]",
      '{"version":1',
    ];
    for (const raw of junk) {
      expect(() => parseState(raw)).not.toThrow();
      expect(parseState(raw)).toEqual(DEFAULT_PERSISTED_STATE);
    }
  });

  test("wrong or missing version discards the whole record", () => {
    const validFields = {
      tonicPc: 7,
      mode: "minor",
      degreeIndex: 4,
      view: "triad",
      voicingIndex: 3,
      inversion: "second",
      stringSetIndex: 0,
    };
    expect(parseState(JSON.stringify({ version: 0, ...validFields }))).toEqual(DEFAULT_PERSISTED_STATE);
    expect(parseState(JSON.stringify({ version: 99, ...validFields }))).toEqual(DEFAULT_PERSISTED_STATE);
    expect(parseState(JSON.stringify(validFields))).toEqual(DEFAULT_PERSISTED_STATE);
  });

  test("partial records keep good fields and default the rest", () => {
    const raw = JSON.stringify({ version: STORAGE_VERSION, tonicPc: 5, view: "triad" });
    const result = parseState(raw);
    expect(result.tonicPc).toBe(5);
    expect(result.view).toBe("triad");
    expect(result.mode).toBe(DEFAULT_PERSISTED_STATE.mode);
    expect(result.degreeIndex).toBe(DEFAULT_PERSISTED_STATE.degreeIndex);
    expect(result.voicingIndex).toBe(DEFAULT_PERSISTED_STATE.voicingIndex);
    expect(result.inversion).toBe(DEFAULT_PERSISTED_STATE.inversion);
    expect(result.stringSetIndex).toBe(DEFAULT_PERSISTED_STATE.stringSetIndex);
  });

  test("out-of-range and wrong-typed fields default individually", () => {
    const badFields = [
      { tonicPc: 12 },
      { tonicPc: -1 },
      { tonicPc: 1.5 },
      { tonicPc: "7" },
      { mode: "dorian" },
      { degreeIndex: 7 },
      { degreeIndex: -1 },
      { inversion: "third" },
      { stringSetIndex: 4 },
      { stringSetIndex: -1 },
      { voicingIndex: -2 },
      { voicingIndex: NaN },
      { view: 7 },
    ];
    const fieldName: Record<string, keyof PersistedState> = {
      tonicPc: "tonicPc",
      mode: "mode",
      degreeIndex: "degreeIndex",
      inversion: "inversion",
      stringSetIndex: "stringSetIndex",
      voicingIndex: "voicingIndex",
      view: "view",
    };
    for (const bad of badFields) {
      const raw = JSON.stringify({ version: STORAGE_VERSION, ...bad });
      const result = parseState(raw);
      const key = Object.keys(bad)[0] as keyof PersistedState;
      const name = fieldName[key];
      expect(result[name]).toEqual(DEFAULT_PERSISTED_STATE[name]);
    }

    expect(toTonicPc(11)).toBe(11);
    expect(toStringSetIndex(0)).toBe(0);
    expect(toDegreeIndex(6)).toBe(6);
    expect(toTonicPc("7")).toBe(DEFAULT_PERSISTED_STATE.tonicPc);
    expect(toMode("dorian")).toBe("major");
    expect(toVoicingIndex(-2)).toBe(0);
    expect(toInversion("third")).toBe("root");
  });

  test("a stale voicing index resolves against the real chord", () => {
    const list = findVoicings([0, 4, 7], 0);
    const stored = JSON.stringify({ version: STORAGE_VERSION, voicingIndex: 9999 });
    expect(clampVoicingIndex(parseState(stored).voicingIndex, list.length)).toBe(list.length - 1);
    expect(clampVoicingIndex(parseState(stored).voicingIndex, 0)).toBe(0);
  });

  test("a stale degree resolves against the real key", () => {
    expect(resolveDegreeIndex(6, 7)).toBe(6);
    expect(resolveDegreeIndex(7, 7)).toBe(6);
    expect(resolveDegreeIndex(-1, 7)).toBe(0);
    expect(resolveDegreeIndex(0, 0)).toBe(null);
    const degreeIndex = resolveDegreeIndex(3, 7)!;
    expect(diatonicTriads(0, "major")[degreeIndex].degree).toBe("IV");
  });

  test("defaults match the app's current defaults", () => {
    expect(DEFAULT_PERSISTED_STATE).toEqual({
      tonicPc: 0,
      mode: "major",
      degreeIndex: 0,
      view: DEFAULT_VIEW,
      voicingIndex: 0,
      inversion: "root",
      stringSetIndex: 2,
    });
    expect(DEFAULT_PERSISTED_STATE.stringSetIndex).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_PERSISTED_STATE.stringSetIndex).toBeLessThan(STRING_SETS.length);
  });
});
