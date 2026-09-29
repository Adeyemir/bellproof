export type MarketSession =
  | "premarket"
  | "regular"
  | "postmarket"
  | "overnight"
  | "closed"
  | "pause";

export type DecisionAction = "TRADE" | "WAIT" | "BLOCK";

export type DecisionReason =
  | "WRONG_CHAIN"
  | "STALE_MARKET_DATA"
  | "UNKNOWN_MARKET_STATE"
  | "INVALID_POLICY_INPUT"
  | "MARKET_STATUS_CONFLICT"
  | "ASSET_RESTRICTED"
  | "MARKET_PAUSED"
  | "EXTENDED_HOURS_OPT_OUT"
  | "CLOSED_HOURS_OPT_OUT"
  | "DRIFT_BELOW_THRESHOLD"
  | "NO_ROUTE"
  | "QUOTE_EXPIRED"
  | "QUOTE_QUALITY_UNKNOWN"
  | "TRADE_CAP"
  | "DAILY_CAP"
  | "SLIPPAGE_CAP"
  | "PRICE_IMPACT_CAP"
  | "PREFLIGHT_REQUIRED"
  | "PREFLIGHT_FAILED"
  | "READY_TO_SIGN";

export interface MarketObservation {
  chainId: string;
  session: MarketSession | "unknown";
  openState: boolean;
  restrictionReason: string | null;
  observedAtMs: number;
  nextOpenTimeMs: number | null;
}

export interface ExecutableQuote {
  receivedAtMs: number;
  ttlMs: number;
  priceImpactBps: number | null;
}

export interface ExecutionPolicy {
  allowExtendedHours: boolean;
  allowClosedHours: boolean;
  driftThresholdBps: number;
  maxTradeRegularCents: number;
  maxTradeOutsideCents: number;
  maxDailySpendCents: number;
  maxSlippageBps: number;
  maxPriceImpactBps: number;
  maxMarketDataAgeMs: number;
}

export interface DecisionInput {
  nowMs: number;
  market: MarketObservation;
  quote: ExecutableQuote | null;
  policy: ExecutionPolicy;
  driftBps: number;
  proposedTradeCents: number;
  dailySpentCents: number;
  requestedSlippageBps: number;
  preflight: "NOT_RUN" | "SUCCESS" | "FAILED";
}

export interface Decision {
  action: DecisionAction;
  reason: DecisionReason;
  session: MarketSession | "unknown";
  nextOpenTimeMs: number | null;
}

const restrictedReasons = new Set([
  "ASSET_PAUSED",
  "ASSET_LIMITED",
  "MARKET_PAUSED",
  "MARKET_MAINTENANCE",
  "UNSUPPORTED",
]);

function result(input: DecisionInput, action: DecisionAction, reason: DecisionReason): Decision {
  return {
    action,
    reason,
    session: input.market.session,
    nextOpenTimeMs: input.market.nextOpenTimeMs,
  };
}

export function evaluateDecision(input: DecisionInput): Decision {
  const { market, policy, quote } = input;

  if (market.chainId !== "56") return result(input, "BLOCK", "WRONG_CHAIN");
  if (
    !Number.isFinite(input.nowMs) ||
    !Number.isSafeInteger(input.proposedTradeCents) ||
    !Number.isSafeInteger(input.dailySpentCents) ||
    input.dailySpentCents < 0 ||
    !Number.isFinite(input.driftBps) ||
    !Number.isFinite(input.requestedSlippageBps) ||
    input.requestedSlippageBps < 0 ||
    Object.entries(policy).some(([, value]) =>
      typeof value === "number" && (!Number.isFinite(value) || value < 0),
    )
  ) {
    return result(input, "BLOCK", "INVALID_POLICY_INPUT");
  }
  if (
    !Number.isFinite(market.observedAtMs) ||
    market.observedAtMs > input.nowMs + 10_000 ||
    input.nowMs - market.observedAtMs > policy.maxMarketDataAgeMs
  ) {
    return result(input, "WAIT", "STALE_MARKET_DATA");
  }
  if (market.session === "unknown") return result(input, "BLOCK", "UNKNOWN_MARKET_STATE");
  if (market.session === "pause" || market.restrictionReason === "MARKET_PAUSED") {
    return result(input, "BLOCK", "MARKET_PAUSED");
  }
  if (market.restrictionReason && restrictedReasons.has(market.restrictionReason)) {
    return result(input, "BLOCK", "ASSET_RESTRICTED");
  }
  if (
    market.restrictionReason &&
    market.restrictionReason !== "TRADING" &&
    market.restrictionReason !== "MARKET_CLOSED"
  ) {
    return result(input, "BLOCK", "ASSET_RESTRICTED");
  }
  if (
    (market.session === "regular" && !market.openState) ||
    (market.session === "closed" && market.openState) ||
    (market.session === "closed" && market.restrictionReason === "TRADING") ||
    (market.session === "regular" && market.restrictionReason === "MARKET_CLOSED")
  ) {
    return result(input, "BLOCK", "MARKET_STATUS_CONFLICT");
  }
  if (market.session === "closed" && !policy.allowClosedHours) {
    return result(input, "WAIT", "CLOSED_HOURS_OPT_OUT");
  }
  if (
    ["premarket", "postmarket", "overnight"].includes(market.session) &&
    !policy.allowExtendedHours
  ) {
    return result(input, "WAIT", "EXTENDED_HOURS_OPT_OUT");
  }
  if (input.driftBps < policy.driftThresholdBps || input.proposedTradeCents <= 0) {
    return result(input, "WAIT", "DRIFT_BELOW_THRESHOLD");
  }
  if (!quote) return result(input, "WAIT", "NO_ROUTE");
  if (
    !Number.isFinite(quote.receivedAtMs) ||
    quote.receivedAtMs > input.nowMs + 10_000 ||
    !Number.isFinite(quote.ttlMs) ||
    quote.ttlMs <= 0 ||
    input.nowMs - quote.receivedAtMs >= quote.ttlMs
  ) {
    return result(input, "WAIT", "QUOTE_EXPIRED");
  }

  const outsideRegular = market.session !== "regular";
  const maxTradeCents = outsideRegular
    ? policy.maxTradeOutsideCents
    : policy.maxTradeRegularCents;
  if (input.proposedTradeCents > maxTradeCents) {
    return result(input, "BLOCK", "TRADE_CAP");
  }
  if (input.dailySpentCents + input.proposedTradeCents > policy.maxDailySpendCents) {
    return result(input, "BLOCK", "DAILY_CAP");
  }
  if (input.requestedSlippageBps > policy.maxSlippageBps) {
    return result(input, "BLOCK", "SLIPPAGE_CAP");
  }
  if (quote.priceImpactBps === null) {
    return result(input, "WAIT", "QUOTE_QUALITY_UNKNOWN");
  }
  if (!Number.isFinite(quote.priceImpactBps)) {
    return result(input, "BLOCK", "INVALID_POLICY_INPUT");
  }
  if (Math.abs(quote.priceImpactBps) > policy.maxPriceImpactBps) {
    return result(input, "WAIT", "PRICE_IMPACT_CAP");
  }
  if (input.preflight === "FAILED") return result(input, "BLOCK", "PREFLIGHT_FAILED");
  if (input.preflight !== "SUCCESS") return result(input, "WAIT", "PREFLIGHT_REQUIRED");

  return result(input, "TRADE", "READY_TO_SIGN");
}

export const demoPolicy: ExecutionPolicy = {
  allowExtendedHours: false,
  allowClosedHours: false,
  driftThresholdBps: 300,
  maxTradeRegularCents: 1_000,
  maxTradeOutsideCents: 300,
  maxDailySpendCents: 2_000,
  maxSlippageBps: 50,
  maxPriceImpactBps: 50,
  maxMarketDataAgeMs: 120_000,
};
