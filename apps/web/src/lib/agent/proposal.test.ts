import { describe, expect, it } from "vitest";
import { proposeRebalance } from "./proposal";

describe("agent rebalance proposal", () => {
  it("proposes the exact trim when stock weight exceeds its target", () => {
    expect(proposeRebalance({
      stockValueCents: 1_870,
      stableValueCents: 8_130,
      targetStockWeightBps: 1_500,
      driftThresholdBps: 300,
    })).toMatchObject({
      side: "SELL",
      reason: "REBALANCE_REQUIRED",
      currentStockWeightBps: 1_870,
      driftBps: 370,
      proposedTradeCents: 370,
    });
  });

  it("proposes a buy only when the threshold is met", () => {
    const basket = {
      stockValueCents: 1_000,
      stableValueCents: 9_000,
      targetStockWeightBps: 1_500,
      driftThresholdBps: 300,
    };
    expect(proposeRebalance(basket)).toMatchObject({ side: "BUY", proposedTradeCents: 500 });
    expect(proposeRebalance({ ...basket, driftThresholdBps: 600 })).toMatchObject({
      side: "HOLD",
      reason: "DRIFT_BELOW_THRESHOLD",
    });
  });

  it("holds with an empty or invalid portfolio", () => {
    expect(proposeRebalance({
      stockValueCents: 0,
      stableValueCents: 0,
      targetStockWeightBps: 1_500,
      driftThresholdBps: 300,
    }).reason).toBe("NO_PORTFOLIO_VALUE");
    expect(proposeRebalance({
      stockValueCents: Number.NaN,
      stableValueCents: 1_000,
      targetStockWeightBps: 1_500,
      driftThresholdBps: 300,
    }).reason).toBe("INVALID_PORTFOLIO");
  });
});
