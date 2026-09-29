import { describe, expect, it } from "vitest";
import {
  demoPolicy,
  evaluateDecision,
  type DecisionInput,
} from "./session-policy";

const nowMs = Date.UTC(2026, 8, 29, 16, 0, 0);

function input(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    nowMs,
    market: {
      chainId: "56",
      session: "regular",
      openState: true,
      restrictionReason: null,
      observedAtMs: nowMs - 1_000,
      nextOpenTimeMs: null,
    },
    quote: {
      receivedAtMs: nowMs - 1_000,
      ttlMs: 30_000,
      priceImpactBps: 12,
    },
    policy: demoPolicy,
    driftBps: 700,
    proposedTradeCents: 200,
    dailySpentCents: 0,
    requestedSlippageBps: 30,
    preflight: "SUCCESS",
    ...overrides,
  };
}

describe("session policy", () => {
  it("makes a regular-session trade ready to sign when all checks pass", () => {
    expect(evaluateDecision(input())).toMatchObject({
      action: "TRADE",
      reason: "READY_TO_SIGN",
    });
  });

  it("waits through ordinary market closure unless the user opted in", () => {
    const closed = input({
      market: {
        ...input().market,
        session: "closed",
        openState: false,
        restrictionReason: "MARKET_CLOSED",
      },
    });
    expect(evaluateDecision(closed).reason).toBe("CLOSED_HOURS_OPT_OUT");
    expect(
      evaluateDecision({
        ...closed,
        policy: { ...demoPolicy, allowClosedHours: true },
      }).action,
    ).toBe("TRADE");
  });

  it("uses the smaller outside-hours trade cap", () => {
    const closed = input({
      market: {
        ...input().market,
        session: "closed",
        openState: false,
        restrictionReason: "MARKET_CLOSED",
      },
      policy: { ...demoPolicy, allowClosedHours: true },
      proposedTradeCents: 400,
    });
    expect(evaluateDecision(closed)).toMatchObject({
      action: "BLOCK",
      reason: "TRADE_CAP",
    });
  });

  it("blocks a corporate-action pause even with closed-hours opt-in", () => {
    const paused = input({
      market: {
        ...input().market,
        session: "closed",
        openState: false,
        restrictionReason: "ASSET_PAUSED",
      },
      policy: { ...demoPolicy, allowClosedHours: true },
    });
    expect(evaluateDecision(paused)).toMatchObject({
      action: "BLOCK",
      reason: "ASSET_RESTRICTED",
    });
  });

  it("waits for fresh observations and quotes", () => {
    expect(
      evaluateDecision(
        input({ market: { ...input().market, observedAtMs: nowMs - 180_000 } }),
      ).reason,
    ).toBe("STALE_MARKET_DATA");
    expect(
      evaluateDecision(
        input({ quote: { receivedAtMs: nowMs - 30_000, ttlMs: 30_000, priceImpactBps: 12 } }),
      ).reason,
    ).toBe("QUOTE_EXPIRED");
  });

  it("blocks failed preflight checks and user cap breaches", () => {
    expect(evaluateDecision(input({ preflight: "FAILED" })).reason).toBe(
      "PREFLIGHT_FAILED",
    );
    expect(evaluateDecision(input({ dailySpentCents: 1_900 })).reason).toBe(
      "DAILY_CAP",
    );
    expect(evaluateDecision(input({ requestedSlippageBps: 75 })).reason).toBe(
      "SLIPPAGE_CAP",
    );
  });

  it("never trades an asset resolved on another chain", () => {
    expect(
      evaluateDecision(input({ market: { ...input().market, chainId: "1" } })),
    ).toMatchObject({ action: "BLOCK", reason: "WRONG_CHAIN" });
  });

  it("blocks unrecognized restriction codes and conflicting status", () => {
    expect(evaluateDecision(input({ market: {
      ...input().market,
      restrictionReason: "NEW_RESTRICTION",
    } })).reason).toBe("ASSET_RESTRICTED");
    expect(evaluateDecision(input({ market: {
      ...input().market,
      restrictionReason: "MARKET_CLOSED",
    } })).reason).toBe("MARKET_STATUS_CONFLICT");
  });

  it("rejects invalid route or policy numbers", () => {
    expect(evaluateDecision(input({ driftBps: Number.NaN })).reason).toBe("INVALID_POLICY_INPUT");
    expect(evaluateDecision(input({ quote: {
      receivedAtMs: nowMs - 1_000,
      ttlMs: 30_000,
      priceImpactBps: Number.NaN,
    } })).reason).toBe("INVALID_POLICY_INPUT");
    expect(evaluateDecision(input({ quote: {
      receivedAtMs: nowMs - 1_000,
      ttlMs: 30_000,
      priceImpactBps: null,
    } })).reason).toBe("QUOTE_QUALITY_UNKNOWN");
  });
});
