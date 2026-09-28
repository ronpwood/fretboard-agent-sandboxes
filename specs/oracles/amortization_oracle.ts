// Independent oracle for the amortization brief (NEXTSTEPS item 3, step 3). Written 2026-09-28,
// BEFORE any run mounted, from the domain's own formulas, so no run can shape it. HOST-ONLY:
// specs/ is not in targets/greenfield.yaml sync_paths, and must never be.
//
// Two layers, because rounding is a design decision the run is free to make:
//   1. schedule(): the exact schedule under an EXPLICIT convention. A sweep judges the app
//      against the convention its V table declares, never against a convention we prefer.
//   2. invariants(): true under EVERY reasonable convention. A sweep can check these with no
//      knowledge of what the run decided, so they are the part that cannot be argued away.
//
// Money is integer cents throughout; rates are APR in percent. Lossy-key analogues the sweep
// should aim at: APR used as a monthly rate (or /100 forgotten), payment not rounded consistently
// with the schedule, the last-payment remainder dropped or double-counted, the zero-rate case,
// and extra payments that shorten the term vs ones that lower the payment.

export type PaymentRounding = "nearest" | "up" | "none";

export interface Convention {
  /** how the level payment is rounded to cents ("none" keeps fractional cents) */
  payment: PaymentRounding;
  /** round each period's interest to the cent (true) or carry fractional cents (false) */
  roundInterest: boolean;
  /** the final payment absorbs the remainder so the balance ends at exactly 0 */
  adjustFinal: boolean;
}

/** The convention most US lenders and calculators use: the one to expect absent a declaration. */
export const STANDARD: Convention = { payment: "nearest", roundInterest: true, adjustFinal: true };

export interface Loan {
  principalCents: number;
  aprPercent: number;
  months: number;
  /** extra principal paid every period, applied after the scheduled payment (cents) */
  extraCents?: number;
  /** payments per year; 12 unless the app offers another frequency */
  periodsPerYear?: number;
}

export interface Row {
  n: number;
  paymentCents: number; // scheduled + extra, as actually paid this period
  interestCents: number;
  principalCents: number;
  balanceCents: number; // after this period
}

const round = (x: number, mode: PaymentRounding) =>
  mode === "nearest" ? Math.round(x) : mode === "up" ? Math.ceil(x - 1e-9) : x;

/**
 * Interest in whole cents on a whole-cent balance, EXACT: balance x APR / (100 x periodsPerYear),
 * rounded half up, in integer arithmetic. 2026-09-28: the float form Math.round(bal * r) turned an
 * exact half-cent tie (278,600c x 15%/12 = 3,482.5c) into 3,482.4999... and rounded it DOWN; the
 * amort2 planner's exact-decimal key was right and this oracle was wrong (CHANGELOG 2026-09-28d).
 */
export function interestCents(balanceCents: number, aprPercent: number, periodsPerYear = 12): number {
  const [whole, frac = ""] = String(aprPercent).split(".");
  const num = BigInt(balanceCents) * BigInt(whole + frac);
  const den = 100n * BigInt(periodsPerYear) * 10n ** BigInt(frac.length);
  return Number((2n * num + den) / (2n * den)); // floor(x + 1/2) for x >= 0
}

/** Periodic rate as a fraction, from APR in percent. The first lossy-key trap lives here. */
export const periodicRate = (aprPercent: number, periodsPerYear = 12) => aprPercent / 100 / periodsPerYear;

/** Level payment in cents: P·r / (1 − (1+r)^−n), or P/n at r = 0. Unrounded. */
export function exactPayment(loan: Loan): number {
  const r = periodicRate(loan.aprPercent, loan.periodsPerYear);
  const P = loan.principalCents, n = loan.months;
  return r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
}

export function payment(loan: Loan, c: Convention = STANDARD): number {
  return round(exactPayment(loan), c.payment);
}

export function schedule(loan: Loan, c: Convention = STANDARD): Row[] {
  const r = periodicRate(loan.aprPercent, loan.periodsPerYear);
  const pay = payment(loan, c), extra = loan.extraCents ?? 0;
  const rows: Row[] = [];
  let bal = loan.principalCents;
  // extra payments shorten the term, so the loop runs to payoff, capped well past n
  for (let n = 1; bal > (c.roundInterest ? 0 : 1e-6) && n <= loan.months * 2; n++) {
    const interest = c.roundInterest ? interestCents(bal, loan.aprPercent, loan.periodsPerYear) : bal * r;
    let principal = pay - interest + extra;
    const last = n === loan.months || principal >= bal;
    if (last && c.adjustFinal) principal = bal;
    else principal = Math.min(principal, bal);
    bal = bal - principal;
    if (Math.abs(bal) < 1e-6) bal = 0;
    rows.push({ n, paymentCents: principal + interest, interestCents: interest, principalCents: principal, balanceCents: bal });
    if (last && c.adjustFinal) break;
  }
  return rows;
}

export interface Totals { payments: number; totalPaidCents: number; totalInterestCents: number; finalPaymentCents: number }

export function totals(rows: Row[]): Totals {
  const totalPaidCents = rows.reduce((s, x) => s + x.paymentCents, 0);
  const totalInterestCents = rows.reduce((s, x) => s + x.interestCents, 0);
  return { payments: rows.length, totalPaidCents, totalInterestCents, finalPaymentCents: rows.at(-1)?.paymentCents ?? 0 };
}

/** Balance remaining after k periods, closed form (no extra payments). Cross-checks the schedule. */
export function balanceAfter(loan: Loan, k: number, payCents = exactPayment(loan)): number {
  const r = periodicRate(loan.aprPercent, loan.periodsPerYear), P = loan.principalCents;
  return r === 0 ? P - payCents * k : P * Math.pow(1 + r, k) - payCents * ((Math.pow(1 + r, k) - 1) / r);
}

/**
 * Convention-free checks on ANY schedule an app shows, in cents. `tol` absorbs one rounding
 * step per row. Returns the violated invariants (empty = consistent). This is what a sweep can
 * run against a schedule whose convention it does not know.
 */
export function invariants(loan: Loan, rows: Row[], tol = 1): string[] {
  const bad: string[] = [];
  const r = periodicRate(loan.aprPercent, loan.periodsPerYear);
  const exact = exactPayment(loan), extra = loan.extraCents ?? 0;
  let bal = loan.principalCents;
  if (!rows.length) return ["no rows"];
  rows.forEach((x, i) => {
    const want = bal * r;
    if (Math.abs(x.interestCents - want) > tol) bad.push(`row ${x.n}: interest ${x.interestCents} ≠ balance·r ${want.toFixed(2)}`);
    if (Math.abs(x.paymentCents - (x.interestCents + x.principalCents)) > tol) bad.push(`row ${x.n}: payment ≠ interest + principal`);
    if (Math.abs(bal - x.principalCents - x.balanceCents) > tol) bad.push(`row ${x.n}: balance does not fall by principal`);
    const isLast = i === rows.length - 1;
    // every non-final payment is the level payment (+ extra), to the cent
    if (!isLast && Math.abs(x.paymentCents - (exact + extra)) > tol) bad.push(`row ${x.n}: payment ${x.paymentCents} ≠ level ${(exact + extra).toFixed(2)}`);
    if (x.balanceCents > bal + tol) bad.push(`row ${x.n}: balance rose`);
    bal = x.balanceCents;
  });
  // the final payment clears the loan: either the balance is 0, or the remainder is sub-cent-per-row
  if (Math.abs(rows.at(-1)!.balanceCents) > tol * rows.length) bad.push(`final balance ${rows.at(-1)!.balanceCents} ≠ 0`);
  if (!extra && rows.length !== loan.months) bad.push(`${rows.length} rows ≠ term ${loan.months}`);
  if (extra && rows.length > loan.months) bad.push(`extra payments did not shorten the term (${rows.length} rows)`);
  const sumP = rows.reduce((s, x) => s + x.principalCents, 0);
  if (Math.abs(sumP - loan.principalCents) > tol * rows.length) bad.push(`Σ principal ${sumP} ≠ principal ${loan.principalCents}`);
  return bad;
}

/**
 * The input grid a sweep should cover: many instances, and the corners where right-looking
 * answers go wrong. Chosen before any run; extend only by adding rows, never by removing them.
 */
export const GRID: Loan[] = [
  // textbook mortgages
  { principalCents: 200_000_00, aprPercent: 6, months: 360 },
  { principalCents: 250_000_00, aprPercent: 7, months: 360 },
  { principalCents: 100_000_00, aprPercent: 5, months: 180 },
  { principalCents: 350_000_00, aprPercent: 6.875, months: 360 }, // fractional APR
  // car / personal loans
  { principalCents: 25_000_00, aprPercent: 4.9, months: 60 },
  { principalCents: 10_000_00, aprPercent: 12, months: 36 }, // r is exactly 1%
  { principalCents: 5_000_00, aprPercent: 24.99, months: 24 },
  // corners
  { principalCents: 12_000_00, aprPercent: 0, months: 12 }, // zero rate: P/n, no division by zero
  { principalCents: 10_000_00, aprPercent: 0, months: 7 }, // zero rate, remainder cents
  { principalCents: 1_000_00, aprPercent: 10, months: 1 }, // a single payment
  { principalCents: 100_00, aprPercent: 3, months: 12 }, // tiny: rounding dominates
  { principalCents: 1_000_000_00, aprPercent: 0.01, months: 480 }, // near-zero rate, long term
  // extra payments (term shortens, level payment unchanged)
  { principalCents: 200_000_00, aprPercent: 6, months: 360, extraCents: 200_00 },
  { principalCents: 25_000_00, aprPercent: 4.9, months: 60, extraCents: 100_00 },
  { principalCents: 10_000_00, aprPercent: 12, months: 36, extraCents: 5_000_00 }, // extra overshoots fast
  // ADDED 2026-09-28 AFTER amort2, as a regression row: an exact half-cent interest tie at row 19
  // that float arithmetic rounds the wrong way (found by checking amort2's key V17 against the oracle)
  { principalCents: 10_000_00, aprPercent: 15, months: 24 },
];
