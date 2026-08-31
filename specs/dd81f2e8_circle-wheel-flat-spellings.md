# Plan: Circle-of-Fifths Wheel Flat-Side Note Spellings

## Problem Overview
The circle-of-fifths wheel in `apps/fretboard/circle-wheel.ts` currently displays sharp spellings even on its flat side (`C#`, `G#`, `D#`, `A#` major and their relative-minor labels). Although `theory.ts`'s `noteName(pc, keyTonicPc)` function supports key-aware flat spellings (landed in commit e8026bc), `circle-wheel.ts`'s `WHEEL_SEGMENTS` map sets `majorName` directly from the sharp-spelled `CIRCLE_OF_FIFTHS_MAJORS` array and computes `minorName` via `noteName(minorPc)` without passing `keyTonicPc`.

Existing tests in `apps/fretboard/fretboard.test.ts` assert the buggy sharps-only behavior at line 498 (`expect(WHEEL_SEGMENTS.map(s => s.majorName)).toEqual(CIRCLE_OF_FIFTHS_MAJORS)`) and in spot-check assertions.

## Proposed Changes

### 1. `apps/fretboard/circle-wheel.ts`
In `WHEEL_SEGMENTS` array mapping:
- Update `majorName` to use key-aware spelling by calling `noteName(majorPc, majorPc)`.
- Update `minorName` to use key-aware spelling by calling `noteName(minorPc, majorPc)`.

```typescript
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
```

### 2. `apps/fretboard/fretboard.test.ts`
Update model tests under `describe("circle of fifths wheel", () => describe("model", ...))`:

1. Update `s.majorName` array assertion:
   - Replace `expect(WHEEL_SEGMENTS.map((s) => s.majorName)).toEqual(CIRCLE_OF_FIFTHS_MAJORS)` with:
     ```typescript
     expect(WHEEL_SEGMENTS.map((s) => s.majorName)).toEqual([
       "C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"
     ]);
     ```

2. Update relative minor test (`"minor pc is the relative minor of the major pc, three wedges ahead"`):
   - Replace `expect(segment.minorName).toBe(relativeMajorSegment.majorName)` with `expect(segment.minorName).toBe(noteName(segment.minorPc, segment.majorPc))`.
   - Explanation: `segment.minorName` uses `segment.majorPc` as the key context. For sharp-side major keys (e.g. E major, majorPc=4), its relative minor (C# minor, minorPc=1) is spelled `C#` in E major context, whereas the major label at index+3 (pitch class 1) is `Db` in Db major context.

3. Update spot checks test (`"spot checks for specific wedges"`):
   - Update and expand spot checks to include flat-side wedges and verify flat spellings:
     ```typescript
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
     ```

## Verification Plan

Run test suite:
```bash
just fretboard test
```
Or directly:
```bash
bun test apps/fretboard/fretboard.test.ts
```
Expected result: All tests pass with 0 failures.
