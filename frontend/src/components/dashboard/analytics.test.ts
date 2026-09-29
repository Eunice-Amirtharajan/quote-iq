import {
  dealPace,
  deltaTone,
  formatCurrency,
  formatCurrencyCompact,
  formatMonth,
  formatPctChange,
  formatPpChange,
  formatShortDate,
  pctChange,
  rateDomain,
  staleTier,
  trendExtremes,
  truncate,
  type ApprovalRateMonth,
} from "./analytics";

const month = (m: string, rate: number | null): ApprovalRateMonth => ({
  month: m,
  sent: 10,
  approved: 5,
  rejected: 2,
  rate,
});

describe("formatting", () => {
  it("formats whole euros with thousands separators", () => {
    expect(formatCurrency(18450.4)).toBe("€18,450");
  });

  it.each([
    [84_200_000, "€84.2M"],
    [1_000_000, "€1.0M"],
    [18_460, "€18.5K"],
    [950.6, "€951"],
    [0, "€0"],
  ])("compacts %d to %s", (n, expected) => {
    expect(formatCurrencyCompact(n)).toBe(expected);
  });

  it("formats ISO months with and without the year", () => {
    expect(formatMonth("2026-01")).toBe("Jan");
    expect(formatMonth("2025-12", true)).toBe("Dec 2025");
  });

  it("formats short dates in UTC", () => {
    expect(formatShortDate("2026-08-28T23:30:00.000Z")).toBe("28 Aug");
    expect(formatShortDate("2026-09-05T00:00:00.000Z")).toBe("05 Sep");
  });

  it("truncates long text with an ellipsis", () => {
    expect(truncate("Bauer Logistics GmbH", 10)).toBe("Bauer Log…");
    expect(truncate("Short", 10)).toBe("Short");
  });
});

describe("pctChange", () => {
  it("returns the change as a percentage to 1dp", () => {
    expect(pctChange(112, 100)).toBe(12);
    expect(pctChange(97.8, 100)).toBe(-2.2);
  });

  it("returns null when there is no base to compare against", () => {
    expect(pctChange(50, 0)).toBeNull();
  });
});

describe("deltas", () => {
  it("maps a delta to a tone", () => {
    expect(deltaTone(2.1)).toBe("up");
    expect(deltaTone(-3)).toBe("down");
    expect(deltaTone(0)).toBe("neutral");
    expect(deltaTone(null)).toBe("neutral");
  });

  it("formats point and percentage changes with arrows", () => {
    expect(formatPpChange(2.1)).toBe("↑ +2.1 pp");
    expect(formatPpChange(-3)).toBe("↓ -3 pp");
    expect(formatPpChange(0)).toBe("0 pp");
    expect(formatPpChange(null)).toBe("—");
    expect(formatPctChange(12)).toBe("↑ +12%");
    expect(formatPctChange(null)).toBe("—");
  });
});

describe("staleTier", () => {
  it.each([
    [14, "watch"],
    [20, "watch"],
    [21, "warning"],
    [27, "warning"],
    [28, "critical"],
    [115, "critical"],
  ])("puts %i days in the %s tier", (days, tier) => {
    expect(staleTier(days)).toBe(tier);
  });
});

describe("rateDomain", () => {
  it("pads around the data and snaps to 5pp", () => {
    expect(rateDomain([61.3, 41.2, null, 55])).toEqual([35, 70]);
  });

  it("clamps to 0–100", () => {
    expect(rateDomain([2, 98])).toEqual([0, 100]);
  });

  it("falls back to the full range with no data", () => {
    expect(rateDomain([null, null])).toEqual([0, 100]);
  });
});

describe("trendExtremes", () => {
  it("finds peak, trough and month-on-month change", () => {
    const result = trendExtremes([
      month("2026-06", 70),
      month("2026-07", 58.2),
      month("2026-08", 76.1),
      month("2026-09", 78.6),
    ]);

    expect(result.peak?.month).toBe("2026-09");
    expect(result.trough?.month).toBe("2026-07");
    expect(result.momPp).toBe(2.5);
  });

  it("skips months with no decisions", () => {
    const result = trendExtremes([month("2026-07", null), month("2026-08", 60), month("2026-09", null)]);

    expect(result.peak?.month).toBe("2026-08");
    expect(result.trough?.month).toBe("2026-08");
    expect(result.momPp).toBeNull();
  });

  it("returns nothing when no month has a rate", () => {
    expect(trendExtremes([month("2026-09", null)])).toEqual({
      peak: undefined,
      trough: undefined,
      momPp: null,
    });
  });
});

describe("dealPace", () => {
  it("rates a stage against the full cycle, matching the concept's examples", () => {
    expect(dealPace(3.2, 14.8)).toBe("fast"); // 0.22× the cycle
    expect(dealPace(11.6, 14.8)).toBe("avg"); // 0.78×
    expect(dealPace(14.8, 14.8)).toBe("avg"); // the full cycle itself
    expect(dealPace(18.4, 14.8)).toBe("slow"); // 1.24×
  });

  it("uses inclusive boundaries at 0.5× and 1.1×", () => {
    expect(dealPace(5, 10)).toBe("avg");
    expect(dealPace(11, 10)).toBe("avg");
    expect(dealPace(11.1, 10)).toBe("slow");
  });

  it("returns null without data to compare", () => {
    expect(dealPace(null, 14.8)).toBeNull();
    expect(dealPace(3, null)).toBeNull();
    expect(dealPace(3, 0)).toBeNull();
  });
});
