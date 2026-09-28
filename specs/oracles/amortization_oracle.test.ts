// Self-test: the oracle agrees with published anchors and with its own convention-free invariants.
import { test, expect } from "bun:test";
import * as O from "./amortization_oracle";

test("published payment anchors (standard convention)", () => {
  expect(O.payment({ principalCents: 200_000_00, aprPercent: 6, months: 360 })).toBe(1199_10);
  expect(O.payment({ principalCents: 250_000_00, aprPercent: 7, months: 360 })).toBe(1663_26);
  expect(O.payment({ principalCents: 100_000_00, aprPercent: 5, months: 180 })).toBe(790_79);
  expect(O.payment({ principalCents: 12_000_00, aprPercent: 0, months: 12 })).toBe(1000_00);
});

test("schedule closes to zero and matches the closed-form balance", () => {
  const loan = { principalCents: 200_000_00, aprPercent: 6, months: 360 };
  const rows = O.schedule(loan);
  expect(rows.length).toBe(360);
  expect(rows.at(-1)!.balanceCents).toBe(0);
  expect(rows[0].interestCents).toBe(1000_00); // 200k × 0.5%
  expect(Math.abs(rows[119].balanceCents - O.balanceAfter(loan, 120, O.payment(loan)))).toBeLessThan(100);
});

test("every grid loan satisfies the invariants under every convention", () => {
  const convs: O.Convention[] = [
    O.STANDARD,
    { payment: "up", roundInterest: true, adjustFinal: true },
    { payment: "none", roundInterest: false, adjustFinal: true },
  ];
  for (const loan of O.GRID) for (const c of convs) {
    const bad = O.invariants(loan, O.schedule(loan, c));
    expect(bad, `${JSON.stringify(loan)} ${JSON.stringify(c)}`).toEqual([]);
  }
});

test("the invariants catch the lossy-key traps", () => {
  const loan = { principalCents: 200_000_00, aprPercent: 6, months: 360 };
  // APR applied as if it were the monthly rate
  expect(O.invariants(loan, O.schedule({ ...loan, aprPercent: 72 })).length).toBeGreaterThan(0);
  // remainder dropped: final payment not adjusted
  const loose = O.schedule(loan, { payment: "nearest", roundInterest: true, adjustFinal: false });
  const dropped = loose.map((r, i) => (i === loose.length - 1 ? { ...r, balanceCents: r.balanceCents + 500 } : r));
  expect(O.invariants(loan, dropped).length).toBeGreaterThan(0);
  // extra payment ignored
  const withExtra = { ...loan, extraCents: 200_00 };
  expect(O.invariants(withExtra, O.schedule(loan)).length).toBeGreaterThan(0);
});

test("extra payments shorten the term and cut interest", () => {
  const base = { principalCents: 200_000_00, aprPercent: 6, months: 360 };
  const a = O.totals(O.schedule(base)), b = O.totals(O.schedule({ ...base, extraCents: 200_00 }));
  expect(b.payments).toBeLessThan(a.payments);
  expect(b.totalInterestCents).toBeLessThan(a.totalInterestCents);
  console.log("200k@6%/30y:", a, "\n+ $200/mo:", b);
});

test("half-cent ties round half up, exactly (the float tie that fooled the first oracle)", () => {
  expect(O.interestCents(278_600, 15)).toBe(3483); // 3482.5 exactly
  expect(O.interestCents(320_000_00, 6.5)).toBe(1733_33);
  expect(O.interestCents(350_000_00, 6.875)).toBe(2005_21); // 2005.208…
  expect(O.totals(O.schedule({ principalCents: 10_000_00, aprPercent: 15, months: 24 })).totalInterestCents).toBe(1636_82);
});
