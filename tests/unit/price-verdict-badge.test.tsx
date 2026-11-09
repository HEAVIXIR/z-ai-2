import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PriceVerdictBadge from "@/components/listings/PriceVerdictBadge";

describe("PriceVerdictBadge legacy parity", () => {
  it.each([
    ["BELOW_RANGE", "UNDERPRICED"],
    ["IN_RANGE", "FAIR"],
    ["ABOVE_RANGE", "OVERPRICED"],
  ] as const)("maps %s to %s", (status, label) => {
    const html = renderToStaticMarkup(<PriceVerdictBadge status={status} />);
    expect(html).toContain(label);
    expect(html).toContain(`Price verdict: ${label}`);
  });

  it("does not invent a verdict when price data is insufficient", () => {
    expect(
      renderToStaticMarkup(<PriceVerdictBadge status="INSUFFICIENT" />),
    ).toBe("");
  });
});
