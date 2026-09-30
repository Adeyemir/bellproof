import { describe, expect, it } from "vitest";
import { normalizeMarketSession } from "./rwa-status";

describe("live RWA market session values", () => {
  it("normalizes the observed paused state and preserves documented states", () => {
    expect(normalizeMarketSession("paused")).toBe("pause");
    expect(normalizeMarketSession("premarket")).toBe("premarket");
    expect(normalizeMarketSession("regular")).toBe("regular");
  });

  it("does not infer a tradable session from Binance's unknown value", () => {
    expect(normalizeMarketSession("unknown")).toBe("unknown");
    expect(normalizeMarketSession(null)).toBe("unknown");
  });
});
