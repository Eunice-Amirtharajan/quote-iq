import { DIVERGING, LOW_SAMPLE_FILL, MIN_SAMPLE, TEAM_ROW, bucketLabel, cellStyle, deltaPp, heatmapLayout } from "./heatmap";

const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

describe("deltaPp", () => {
  it("is the rep's rate minus the team's, to 1dp", () => {
    expect(deltaPp(44.2, 59.2)).toBe(-15);
    expect(deltaPp(77.6, 59.2)).toBe(18.4);
  });

  it("is null without both rates", () => {
    expect(deltaPp(null, 59)).toBeNull();
    expect(deltaPp(60, null)).toBeNull();
  });
});

describe("cellStyle", () => {
  it("colours a rep at the team average neutral grey with dark ink", () => {
    expect(cellStyle(60, 60, 100)).toEqual({ fill: rgb(DIVERGING.neutral), ink: "#0f1117", lowSample: false });
  });

  it("saturates to the diverging poles at ±20pp and beyond, with white ink", () => {
    expect(cellStyle(85, 60, 100)).toMatchObject({ fill: rgb(DIVERGING.above), ink: "#ffffff" });
    expect(cellStyle(35, 60, 100)).toMatchObject({ fill: rgb(DIVERGING.below), ink: "#ffffff" });
    expect(cellStyle(95, 60, 100).fill).toBe(rgb(DIVERGING.above)); // clamped
  });

  it("goes blue above the team and red below, keeping dark ink on pale cells", () => {
    const above = cellStyle(65, 60, 100); // +5pp
    const below = cellStyle(55, 60, 100); // -5pp
    const [ar, , ab] = above.fill.match(/\d+/g)!.map(Number);
    const [br, , bb] = below.fill.match(/\d+/g)!.map(Number);
    expect(ab).toBeGreaterThan(ar); // bluer
    expect(br).toBeGreaterThan(bb); // redder
    expect(above.ink).toBe("#0f1117");
  });

  it(`greys out cells with fewer than ${MIN_SAMPLE} decided deals`, () => {
    expect(cellStyle(100, 60, MIN_SAMPLE - 1)).toEqual({ fill: LOW_SAMPLE_FILL, ink: "#9ca3af", lowSample: true });
    expect(cellStyle(100, 60, MIN_SAMPLE).lowSample).toBe(false);
  });

  it("treats a band with no decided deals as low sample", () => {
    expect(cellStyle(null, 60, 0).lowSample).toBe(true);
  });
});

describe("heatmapLayout", () => {
  const layout = heatmapLayout(["<5k", "5k–20k", ">20k"], ["a", "b"], {
    width: 700,
    nameWidth: 100,
    headerHeight: 30,
    rowHeight: 40,
    teamGap: 10,
  });

  it("splits the space right of the names into equal columns in bucket order", () => {
    const cols = ["<5k", "5k–20k", ">20k"].map((b) => layout.column(b));
    expect(cols[0].x).toBeCloseTo(100, 0);
    expect(cols[1].x).toBeGreaterThan(cols[0].x + cols[0].width);
    expect(cols[2].x + cols[2].width).toBeCloseTo(700, 0);
    expect(new Set(cols.map((c) => c.width.toFixed(3))).size).toBe(1);
  });

  it("stacks rep rows under the header and puts the team row after a gap", () => {
    expect(layout.row("a").y).toBeGreaterThanOrEqual(30);
    expect(layout.row("b").y).toBeGreaterThan(layout.row("a").y);
    expect(layout.row(TEAM_ROW).y).toBe(30 + 2 * 40 + 10);
    expect(layout.height).toBe(30 + 2 * 40 + 10 + 40);
  });
});

describe("bucketLabel", () => {
  it("formats band keys as euro ranges", () => {
    expect(bucketLabel("<5k")).toBe("< €5k");
    expect(bucketLabel("5k–20k")).toBe("€5k – €20k");
    expect(bucketLabel(">20k")).toBe("> €20k");
  });
});
