export interface BasketSnapshot {
  stockValueCents: number;
  stableValueCents: number;
  targetStockWeightBps: number;
  driftThresholdBps: number;
}

export type ProposalSide = "BUY" | "SELL" | "HOLD";
export type ProposalReason =
  | "REBALANCE_REQUIRED"
  | "DRIFT_BELOW_THRESHOLD"
  | "NO_PORTFOLIO_VALUE"
  | "INVALID_PORTFOLIO";

export interface RebalanceProposal {
  side: ProposalSide;
  reason: ProposalReason;
  currentStockWeightBps: number;
  targetStockWeightBps: number;
  driftBps: number;
  proposedTradeCents: number;
  totalValueCents: number;
}

export function proposeRebalance(snapshot: BasketSnapshot): RebalanceProposal {
  const { stockValueCents, stableValueCents, targetStockWeightBps, driftThresholdBps } = snapshot;
  const totalValueCents = stockValueCents + stableValueCents;
  const base = {
    currentStockWeightBps: 0,
    targetStockWeightBps,
    driftBps: 0,
    proposedTradeCents: 0,
    totalValueCents,
  };
  if (
    !Number.isSafeInteger(stockValueCents) || stockValueCents < 0 ||
    !Number.isSafeInteger(stableValueCents) || stableValueCents < 0 ||
    !Number.isSafeInteger(totalValueCents) ||
    !Number.isSafeInteger(targetStockWeightBps) || targetStockWeightBps < 0 || targetStockWeightBps > 10_000 ||
    !Number.isSafeInteger(driftThresholdBps) || driftThresholdBps < 0 || driftThresholdBps > 10_000
  ) {
    return { ...base, side: "HOLD", reason: "INVALID_PORTFOLIO" };
  }
  if (totalValueCents === 0) {
    return { ...base, side: "HOLD", reason: "NO_PORTFOLIO_VALUE" };
  }

  const total = BigInt(totalValueCents);
  const basisPointDenominator = BigInt(10_000);
  const currentStockWeightBps = Number(
    (BigInt(stockValueCents) * basisPointDenominator + total / BigInt(2)) / total,
  );
  const targetStockValueCents = Number(
    (total * BigInt(targetStockWeightBps) + BigInt(5_000)) / basisPointDenominator,
  );
  const differenceCents = targetStockValueCents - stockValueCents;
  const driftBps = Math.abs(currentStockWeightBps - targetStockWeightBps);
  const evidence = { ...base, currentStockWeightBps, driftBps };
  if (driftBps < driftThresholdBps || differenceCents === 0) {
    return { ...evidence, side: "HOLD", reason: "DRIFT_BELOW_THRESHOLD" };
  }
  return {
    ...evidence,
    side: differenceCents > 0 ? "BUY" : "SELL",
    reason: "REBALANCE_REQUIRED",
    proposedTradeCents: Math.abs(differenceCents),
  };
}
