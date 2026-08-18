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
  type Quality,
} from "./theory.ts";
import {
  pitchAtFret,
  STANDARD_TUNING,
  STANDARD_TUNING_MIDI,
  midiAtFret,
  midiToFrequency,
  frequencyAtFret,
} from "./fretboard.ts";
import { findVoicings, bestVoicing } from "./voicing.ts";
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

describe("fretboard MIDI / frequency helpers", () => {
  const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  const openFreqs = [
    midiToFreq(40), // E2
    midiToFreq(45), // A2
    midiToFreq(50), // D3
    midiToFreq(55), // G3
    midiToFreq(59), // B3
    midiToFreq(64), // E4
  ];

  test("open strings resolve to their correct frequencies", () => {
    expect(STANDARD_TUNING_MIDI).toEqual([40, 45, 50, 55, 59, 64]);
    for (let s = 0; s < 6; s++) {
      expect(frequencyAtFret(s, 0)).toBeCloseTo(openFreqs[s], 8);
    }
  });

  test("fretted note matches hand-computed MIDI math", () => {
    // A string (index 1, open MIDI 45); 3rd fret = C4 = MIDI 48.
    expect(midiAtFret(1, 3)).toBe(48);
    expect(midiToFrequency(48)).toBeCloseTo(midiToFreq(48), 8);
    expect(frequencyAtFret(1, 3)).toBeCloseTo(midiToFreq(48), 8);
    // High E string (index 5, open MIDI 64); 5th fret = A4 = MIDI 69 = 440Hz.
    expect(midiAtFret(5, 5)).toBe(69);
    expect(frequencyAtFret(5, 5)).toBeCloseTo(440, 8);
  });

  test("a note 12 frets higher is exactly double the frequency", () => {
    for (let s = 0; s < 6; s++) {
      expect(frequencyAtFret(s, 12) / frequencyAtFret(s, 0)).toBeCloseTo(2, 8);
      expect(midiAtFret(s, 12)).toBe(midiAtFret(s, 0) + 12);
    }
  });

  test("length of STANDARD_TUNING_MIDI matches string count", () => {
    expect(STANDARD_TUNING_MIDI.length).toBe(STANDARD_TUNING.length);
  });
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
    expect(panelVisibility(DEFAULT_VIEW)).toEqual({ chord: true, triad: false });
    expect(VIEW_MODES[0]).toBe(DEFAULT_VIEW);
  });

  test("toggling lands on the other view and back", () => {
    expect(otherView("chord")).toBe("triad");
    expect(otherView("triad")).toBe("chord");
    for (const v of VIEW_MODES) {
      expect(otherView(otherView(v))).toBe(v);
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
    expect(viewLabel("chord")).not.toBe(viewLabel("triad"));
  });
});
