import { describe, expect, it } from "vitest";
import { evaluateLiveBuy, type LiveBuyInput } from "./live-buy-policy";

const nowMs = Date.parse("2026-09-30T14:30:00Z");
const base: LiveBuyInput = {
  nowMs,
  market: { session: "regular", openState: true, restrictionReason: "TRADING", observedAtMs: nowMs - 1_000 },
  proposal: { side: "BUY", reason: "REBALANCE_REQUIRED", currentStockWeightBps: 0, targetStockWeightBps: 5_000, driftBps: 5_000, proposedTradeCents: 500, totalValueCents: 1_000 },
  amountCents: 200,
  amountIn: "2000000000000000000",
  quote: { estimatedExpiryMs: nowMs + 25_000, priceImpactBps: 10, slippagePercent: "0.5" },
  wallet: { chainId: "56", usdtBalance: "10000000000000000000", usdtAllowance: "2000000000000000000", bnbBalance: "100000000000000000", gasPrice: "1000000000", observedAtMs: nowMs },
  swapGas: "350000",
  swapGasPrice: "1000000000",
  approvalSimulation: { status: "SUCCESS" },
  swapSimulation: { status: "SUCCESS" },
};

describe("funded BSC buy policy", () => {
  it("permits a funded, approved, simulated rebalance", () => {
    expect(evaluateLiveBuy(base)).toMatchObject({ action: "TRADE", signingEnabled: true, approvalAllowed: false });
  });
  it("allows exact approval before swap simulation can pass", () => {
    const input = { ...base, wallet: { ...base.wallet, usdtAllowance: "0" }, swapSimulation: { status: "FAILED" } };
    expect(evaluateLiveBuy(input)).toMatchObject({ action: "WAIT", reason: "APPROVAL_REQUIRED", signingEnabled: false, approvalAllowed: true });
  });
  it("waits outside the regular session and blocks an unknown session", () => {
    expect(evaluateLiveBuy({ ...base, market: { ...base.market, session: "premarket", openState: false } }).reason).toBe("EXTENDED_HOURS_OPT_OUT");
    expect(evaluateLiveBuy({ ...base, market: { ...base.market, session: "unknown" } }).reason).toBe("UNKNOWN_MARKET_STATE");
  });
  it("rejects an amount above the actual basket proposal", () => {
    expect(evaluateLiveBuy({ ...base, amountCents: 501 }).reason).toBe("TRADE_EXCEEDS_POLICY_OR_PROPOSAL");
  });
  it("rejects insufficient token balance, gas, failed simulation, and expiring quotes", () => {
    expect(evaluateLiveBuy({ ...base, wallet: { ...base.wallet, usdtBalance: "0" } }).reason).toBe("INSUFFICIENT_USDT");
    expect(evaluateLiveBuy({ ...base, wallet: { ...base.wallet, bnbBalance: "0" } }).reason).toBe("INSUFFICIENT_BNB_FOR_GAS");
    expect(evaluateLiveBuy({ ...base, swapSimulation: { status: "FAILED" } }).reason).toBe("SWAP_SIMULATION_FAILED");
    expect(evaluateLiveBuy({ ...base, quote: { ...base.quote, estimatedExpiryMs: nowMs + 4_999 } }).reason).toBe("QUOTE_EXPIRED");
  });
});
