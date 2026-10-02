// Independent oracle for the time-zone meeting-planner brief. Written 2026-09-28, before any run,
// from each zone's published DST RULE, so no run can shape it. HOST-ONLY: specs/ is never synced.
//
// Why rules, not Intl: an app built in a browser will read Intl/tzdb. An oracle that reads the same
// database agrees with the app by construction, and cannot catch anything the database gets "right"
// in a way the app then misuses. So the oracle encodes the rules itself. Intl appears ONLY in the
// self-test, to prove these rules match tzdb over the covered years (2025–2030), never in a sweep.
//
// Everything is UTC epoch milliseconds or "wall" milliseconds: a local wall-clock time encoded as
// Date.UTC(y, m-1, d, h, min). Offsets are minutes east of UTC. Lossy-key analogues a sweep should
// aim at: an offset taken "now" instead of at the meeting's instant; the hour that does not exist
// (spring gap) and the hour that happens twice (autumn overlap); the weeks when the US and the EU
// disagree about DST; southern-hemisphere DST running across New Year; 30- and 45-minute offsets;
// a meeting that is a different calendar DATE for some participants.

type Rule = "none" | "us" | "eu" | "au" | "lhi" | "nz";

export interface Zone { id: string; std: number; dst: number; rule: Rule }

// IANA ids so a sweep can drive an app that takes them; offsets and rules are what we assert.
export const ZONES: Zone[] = [
  { id: "UTC", std: 0, dst: 0, rule: "none" },
  { id: "America/Los_Angeles", std: -480, dst: -420, rule: "us" },
  { id: "America/Denver", std: -420, dst: -360, rule: "us" },
  { id: "America/Phoenix", std: -420, dst: -420, rule: "none" }, // Mountain time with no DST
  { id: "America/Chicago", std: -360, dst: -300, rule: "us" },
  { id: "America/New_York", std: -300, dst: -240, rule: "us" },
  { id: "America/Sao_Paulo", std: -180, dst: -180, rule: "none" }, // DST abolished 2019
  { id: "Europe/London", std: 0, dst: 60, rule: "eu" },
  { id: "Europe/Berlin", std: 60, dst: 120, rule: "eu" },
  { id: "Europe/Helsinki", std: 120, dst: 180, rule: "eu" },
  { id: "Asia/Dubai", std: 240, dst: 240, rule: "none" },
  { id: "Asia/Kolkata", std: 330, dst: 330, rule: "none" }, // +5:30
  { id: "Asia/Kathmandu", std: 345, dst: 345, rule: "none" }, // +5:45
  { id: "Asia/Tokyo", std: 540, dst: 540, rule: "none" },
  { id: "Australia/Sydney", std: 600, dst: 660, rule: "au" },
  { id: "Australia/Lord_Howe", std: 630, dst: 660, rule: "lhi" }, // DST shift is 30 minutes
  { id: "Pacific/Auckland", std: 720, dst: 780, rule: "nz" },
];
export const zone = (id: string) => ZONES.find((z) => z.id === id)!;

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** Day of month of the nth (1-based) Sunday, or the last Sunday when n = -1. */
function sunday(y: number, m: number, n: number): number {
  if (n > 0) { const dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return 1 + ((7 - dow) % 7) + 7 * (n - 1); }
  const last = new Date(Date.UTC(y, m, 0)); return last.getUTCDate() - last.getUTCDay();
}
const at = (y: number, m: number, d: number, h: number, mi: number, offMin: number) => Date.UTC(y, m - 1, d, h, mi) - offMin * MIN;

/** [start, end) of DST in UTC for the DST period that BEGINS in year y. */
function dstWindow(z: Zone, y: number): [number, number] {
  switch (z.rule) {
    case "us": // 2nd Sun Mar 02:00 local standard -> 1st Sun Nov 02:00 local daylight
      return [at(y, 3, sunday(y, 3, 2), 2, 0, z.std), at(y, 11, sunday(y, 11, 1), 2, 0, z.dst)];
    case "eu": // last Sun Mar 01:00 UTC -> last Sun Oct 01:00 UTC, every EU zone at once
      return [Date.UTC(y, 2, sunday(y, 3, -1), 1), Date.UTC(y, 9, sunday(y, 10, -1), 1)];
    case "au": // 1st Sun Oct 02:00 std -> 1st Sun Apr (next year) 03:00 daylight
      return [at(y, 10, sunday(y, 10, 1), 2, 0, z.std), at(y + 1, 4, sunday(y + 1, 4, 1), 3, 0, z.dst)];
    case "lhi": // 1st Sun Oct 02:00 std -> 1st Sun Apr (next year) 02:00 daylight
      return [at(y, 10, sunday(y, 10, 1), 2, 0, z.std), at(y + 1, 4, sunday(y + 1, 4, 1), 2, 0, z.dst)];
    case "nz": // last Sun Sep 02:00 std -> 1st Sun Apr (next year) 03:00 daylight
      return [at(y, 9, sunday(y, 9, -1), 2, 0, z.std), at(y + 1, 4, sunday(y + 1, 4, 1), 3, 0, z.dst)];
    default:
      return [0, 0];
  }
}

/** Offset in minutes east of UTC for zone z at UTC instant t. */
export function offsetAt(z: Zone, t: number): number {
  if (z.rule === "none") return z.std;
  const y = new Date(t).getUTCFullYear();
  // a southern-hemisphere window that began last year can still be open in January–April
  for (const yy of [y - 1, y]) { const [s, e] = dstWindow(z, yy); if (t >= s && t < e) return z.dst; }
  return z.std;
}

/** The DST transitions (UTC instants) of zone z within calendar year y, sorted. */
export function transitions(z: Zone, y: number): number[] {
  if (z.rule === "none") return [];
  const out = [...dstWindow(z, y - 1), ...dstWindow(z, y)];
  return out.filter((t) => new Date(t).getUTCFullYear() === y).sort((a, b) => a - b);
}

/** Local wall-clock time of a UTC instant, as wall milliseconds. */
export const toWall = (z: Zone, t: number) => t + offsetAt(z, t) * MIN;

export interface Wall { y: number; mo: number; d: number; h: number; mi: number; dow: number }
export function wallParts(z: Zone, t: number): Wall {
  const w = new Date(toWall(z, t));
  return { y: w.getUTCFullYear(), mo: w.getUTCMonth() + 1, d: w.getUTCDate(), h: w.getUTCHours(), mi: w.getUTCMinutes(), dow: w.getUTCDay() };
}

/**
 * Every UTC instant that shows wall time `wall` in zone z. 0 results = the spring gap (that local
 * time never happens), 2 = the autumn overlap (it happens twice), 1 = the ordinary case. An app
 * that returns exactly one answer for every input is wrong on some input.
 */
export function fromWall(z: Zone, wall: number): number[] {
  const out = new Set<number>();
  for (const off of [z.std, z.dst]) { const t = wall - off * MIN; if (offsetAt(z, t) === off) out.add(t); }
  return [...out].sort((a, b) => a - b);
}

export interface Participant { zone: string; startH: number; endH: number; weekdaysOnly?: boolean }

/**
 * UTC intervals [start, end) inside [fromUtc, toUtc) when EVERY participant is inside their local
 * working window, at `stepMin` resolution. Evaluated per instant, so a DST change inside the range
 * is honoured, not averaged away.
 */
export function overlap(ps: Participant[], fromUtc: number, toUtc: number, stepMin = 15): Array<[number, number]> {
  const ok = (t: number) => ps.every((p) => {
    const w = wallParts(zone(p.zone), t), mins = w.h * 60 + w.mi;
    if (p.weekdaysOnly && (w.dow === 0 || w.dow === 6)) return false;
    return mins >= p.startH * 60 && mins < p.endH * 60;
  });
  const out: Array<[number, number]> = [];
  for (let t = fromUtc; t < toUtc; t += stepMin * MIN) {
    if (!ok(t)) continue;
    const last = out.at(-1);
    if (last && last[1] === t) last[1] = t + stepMin * MIN; else out.push([t, t + stepMin * MIN]);
  }
  return out;
}

/** Minutes between two zones' clocks at instant t (b − a). Changes across a DST boundary. */
export const difference = (a: string, b: string, t: number) => offsetAt(zone(b), t) - offsetAt(zone(a), t);

/**
 * Probe instants chosen BEFORE any run: the edges where a right-looking answer goes wrong.
 * Extend only by adding.
 */
export const PROBES = {
  // the US and the EU disagree for ~3 weeks in March and ~1 week in Oct/Nov
  usEuGapSpring2026: Date.UTC(2026, 2, 20, 15), // NY on DST, London not: 4h apart, not 5
  usEuGapAutumn2026: Date.UTC(2026, 9, 28, 15), // London off DST, NY still on: 4h apart
  ordinary2026: Date.UTC(2026, 5, 15, 15), // 5h apart
  // southern hemisphere: Sydney-London difference swings between 9, 10 and 11 hours
  sydneyJan2026: Date.UTC(2026, 0, 15, 0),
  sydneyJul2026: Date.UTC(2026, 6, 15, 0),
  sydneyApr2026Between: Date.UTC(2026, 3, 1, 0), // London on DST, Sydney still on DST: 10h
  // local times that do not exist / happen twice
  nySpringGap2026: Date.UTC(2026, 2, 8, 2, 30), // wall 02:30 on 8 Mar 2026 in New York: none
  nyAutumnOverlap2026: Date.UTC(2026, 10, 1, 1, 30), // wall 01:30 on 1 Nov 2026 in New York: two
  londonSpringGap2026: Date.UTC(2026, 2, 29, 1, 30), // wall 01:30 on 29 Mar 2026 in London: none
  lordHoweAutumnOverlap2026: Date.UTC(2026, 3, 5, 1, 45), // wall 01:45 on 5 Apr 2026: two, 30 min apart
};

/**
 * SPAN POWER — run BEFORE pre-registering a sweep for the DST-span class (mtg1's: the meeting's end
 * read as start wall + duration, not as the true wall clock at the end instant).
 *
 * That defect changes a verdict only where the spec's own classifier gives a different answer for
 * the extrapolated end than for the true end. So a sweep's power is a property of the spec and its
 * profiles, not of how many checks "span a transition". mix1's sweep reported 16,796 span checks exact
 * with power 0: its AWAKE 07:00-22:00 window is tested first, and every transition is 00:59-03:59
 * local, so the class was unobservable under that spec (CHANGELOG 2026-10-02d). rmix1's first sweep
 * was blind the same way.
 *
 * `classify(startMin, endMin)` is the spec's verdict from a meeting's local start and end, in minutes
 * from the start's midnight (end may pass 1440). Pass the real rule, precedence included: a
 * boundary list cannot see that a work edge before 07:00 is masked by "asleep". Counts meetings that
 * cross the zone's OWN transition (15-minute starts), and those where the two ends disagree.
 * `biting === 0` means the profiles cannot expose the class: change them, or declare it unreachable.
 */
export function spanPower(classify: (startMin: number, endMin: number) => string,
                          durations: number[], years = [2026], zones = ZONES) {
  let spans = 0, biting = 0;
  for (const z of zones) for (const y of years) for (const T of transitions(z, y)) for (const dur of durations) {
    for (let t = Math.ceil((T - dur * MIN + 1) / (15 * MIN)) * 15 * MIN; t < T; t += 15 * MIN) {
      spans++;
      const start = toWall(z, t), day0 = Math.floor(start / DAY) * DAY, s0 = (start - day0) / MIN;
      const truth = (toWall(z, t + dur * MIN) - day0) / MIN;
      if (classify(s0, s0 + dur) !== classify(s0, truth)) biting++;
    }
  }
  return { spans, biting };
}
