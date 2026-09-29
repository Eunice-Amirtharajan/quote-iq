import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import StalePipelineTable from "./StalePipelineTable";
import type { StalePipeline, StaleQuotation } from "./analytics";

const quote = (n: number, daysStale: number): StaleQuotation => ({
  id: `q-${n}`,
  quotationNumber: `QT-2026-${String(n).padStart(4, "0")}`,
  title: `Quote ${n}`,
  clientId: "c-1",
  clientName: "Bauer Logistics",
  repName: "Anna Schmidt",
  total: 38200,
  sentAt: "2026-08-28T10:00:00.000Z",
  daysStale,
});

function renderTable(pipeline: StalePipeline) {
  return render(
    <MemoryRouter>
      <StalePipelineTable pipeline={pipeline} />
    </MemoryRouter>,
  );
}

const pipeline = (items: StaleQuotation[], totalCount = items.length): StalePipeline => ({
  thresholdDays: 14,
  totalCount,
  totalValue: 412_300,
  items,
});

describe("StalePipelineTable", () => {
  it("renders each stale quotation with a link to its detail page", () => {
    renderTable(pipeline([quote(847, 31)]));

    expect(screen.getByRole("link", { name: "QT-2026-0847" })).toHaveAttribute("href", "/quotations/q-847");
    expect(screen.getByText("Quote 847")).toBeInTheDocument();
    expect(screen.getByText("€38,200")).toBeInTheDocument();
    expect(screen.getByText("28 Aug")).toBeInTheDocument();
  });

  it("pairs every urgency colour with a written tier", () => {
    renderTable(pipeline([quote(1, 31), quote(2, 23), quote(3, 15)]));

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("31d").nextSibling).toHaveTextContent("Critical");
    expect(within(rows[1]).getByText("23d").nextSibling).toHaveTextContent("Warning");
    expect(within(rows[2]).getByText("15d").nextSibling).toHaveTextContent("Watch");
  });

  it("reports the true total and value at risk, not just the returned rows", () => {
    renderTable(pipeline([quote(1, 31)], 72));

    expect(screen.getByText(/Showing 1 most critical · 71 more · sorted by days stale desc/)).toBeInTheDocument();
    // Amounts use the viewer's locale (en-IN groups this as 4,12,300), so build the expectation the same way
    expect(screen.getByText(`€${(412_300).toLocaleString()} total at risk`)).toBeInTheDocument();
  });

  it("shows the 6 most critical rows and expands to the full list", async () => {
    const user = userEvent.setup();
    renderTable(pipeline(Array.from({ length: 12 }, (_, i) => quote(i + 1, 40 - i))));

    expect(screen.getAllByRole("row")).toHaveLength(7); // header + 6
    // Remaining quotes sit between the threshold and the next most stale (34d)
    expect(screen.getByText(/6 more between 14–34 days/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show 12" }));
    expect(screen.getAllByRole("row")).toHaveLength(13);
    await user.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByRole("row")).toHaveLength(7);
  });

  it("shows the rep as a short-name chip, keeping numeric suffixes whole", () => {
    renderTable(pipeline([quote(1, 31), { ...quote(2, 30), repName: "Load Test Rep 17" }]));

    expect(screen.getByText("Anna S.")).toHaveAttribute("title", "Anna Schmidt");
    expect(screen.getByText("Load 17")).toHaveAttribute("title", "Load Test Rep 17");
  });

  it("hides the expand control when everything already fits", () => {
    renderTable(pipeline([quote(1, 31)]));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing is stale", () => {
    renderTable(pipeline([]));
    expect(screen.getByText("No SENT quotations have been waiting more than 14 days")).toBeInTheDocument();
  });
});
