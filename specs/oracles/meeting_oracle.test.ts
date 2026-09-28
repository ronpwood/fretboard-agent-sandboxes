// Self-test: the rule-based oracle agrees with tzdb (Intl) over 2025–2030. Intl appears HERE ONLY.
import { test, expect } from "bun:test";
import * as O from "./meeting_oracle";

const fmt = new Map<string, Intl.DateTimeFormat>();
function intlOffset(id: string, t: number): number {
  let f = fmt.get(id);
  if (!f) fmt.set(id, (f = new Intl.DateTimeFormat("en-US", { timeZone: id, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })));
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60000) * 60000) / 60000);
}
const MIN = 60000;

test("offsets match tzdb hourly and at every transition ±1 min, 2025–2030", () => {
  let n = 0; const bad: string[] = [];
  for (const z of O.ZONES) {
    for (let t = Date.UTC(2025, 0, 1); t < Date.UTC(2031, 0, 1); t += 3600_000) {
      n++; if (O.offsetAt(z, t) !== intlOffset(z.id, t) && bad.length < 10) bad.push(`${z.id} ${new Date(t).toISOString()}`);
    }
    for (let y = 2025; y <= 2030; y++) for (const tr of O.transitions(z, y)) for (const d of [-MIN, 0, MIN]) {
      n++; if (O.offsetAt(z, tr + d) !== intlOffset(z.id, tr + d)) bad.push(`${z.id} transition ${new Date(tr + d).toISOString()}`);
    }
  }
  console.log(`${n} instants compared`);
  expect(bad).toEqual([]);
});

test("each DST zone has exactly 2 transitions a year", () => {
  for (const z of O.ZONES.filter((z) => z.rule !== "none")) for (let y = 2025; y <= 2030; y++) expect(O.transitions(z, y).length, `${z.id} ${y}`).toBe(2);
});

test("probes: the right-looking-wrong corners", () => {
  const P = O.PROBES, d = O.difference;
  expect(d("America/New_York", "Europe/London", P.ordinary2026)).toBe(300);
  expect(d("America/New_York", "Europe/London", P.usEuGapSpring2026)).toBe(240);
  expect(d("America/New_York", "Europe/London", P.usEuGapAutumn2026)).toBe(240);
  expect(d("Europe/London", "Australia/Sydney", P.sydneyJan2026)).toBe(660);
  expect(d("Europe/London", "Australia/Sydney", P.sydneyJul2026)).toBe(540);
  expect(d("Europe/London", "Australia/Sydney", P.sydneyApr2026Between)).toBe(600);
  expect(O.fromWall(O.zone("America/New_York"), P.nySpringGap2026)).toHaveLength(0);
  expect(O.fromWall(O.zone("America/New_York"), P.nyAutumnOverlap2026)).toHaveLength(2);
  expect(O.fromWall(O.zone("Europe/London"), P.londonSpringGap2026)).toHaveLength(0);
  const lh = O.fromWall(O.zone("Australia/Lord_Howe"), P.lordHoweAutumnOverlap2026);
  expect(lh).toHaveLength(2); expect(lh[1] - lh[0]).toBe(30 * MIN);
  expect(O.fromWall(O.zone("Asia/Kathmandu"), Date.UTC(2026, 5, 1, 9))).toEqual([Date.UTC(2026, 5, 1, 3, 15)]);
});

test("overlap: NY 9-17 + London 9-17 is 3h in June but 4h in the March gap week", () => {
  const ps = [{ zone: "America/New_York", startH: 9, endH: 17 }, { zone: "Europe/London", startH: 9, endH: 17 }];
  const len = (d: number) => O.overlap(ps, d, d + 86400_000).reduce((s, [a, b]) => s + (b - a), 0) / 3600_000;
  expect(len(Date.UTC(2026, 5, 15))).toBe(3);
  expect(len(Date.UTC(2026, 2, 20))).toBe(4);
  // Tokyo + NY + London: no common working hour at all
  expect(O.overlap([...ps, { zone: "Asia/Tokyo", startH: 9, endH: 17 }], Date.UTC(2026, 5, 15), Date.UTC(2026, 5, 16))).toEqual([]);
});
