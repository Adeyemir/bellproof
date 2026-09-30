import type { RebalanceProposal } from "./agent/proposal";
import type { BscWalletState } from "./bsc-rpc";
import type { MarketSession } from "./session-policy";

export interface LiveBuyInput {
  nowMs: number;
  market: {
    session: MarketSession | "unknown";
    openState: boolean;
    restrictionReason: string | null;
    observedAtMs: number;
  };
  proposal: RebalanceProposal;
  amountCents: number;
  amountIn: string;
  quote: { estimatedExpiryMs: number; priceImpactBps: number | null; slippagePercent: string };
  wallet: BscWalletState;
  swapGas: string;
  swapGasPrice: string;
  approvalSimulation: { status: string };
  swapSimulation: { status: string };
}

export interface LiveBuyDecision {
  action: "TRADE" | "WAIT" | "BLOCK";
  reason: string;
  signingEnabled: boolean;
  approvalAllowed: boolean;
}

function decision(action: LiveBuyDecision["action"], reason: string, approvalAllowed = false): LiveBuyDecision {
  return { action, reason, signingEnabled: action === "TRADE", approvalAllowed };
}

export function evaluateLiveBuy(input: LiveBuyInput): LiveBuyDecision {
  const { market, quote, wallet, proposal } = input;
  if (market.session === "unknown") return decision("BLOCK", "UNKNOWN_MARKET_STATE");
  if (market.session === "pause" ||
      (market.restrictionReason !== null && !["TRADING", "MARKET_CLOSED"].includes(market.restrictionReason))) {
    return decision("BLOCK", "ASSET_RESTRICTED");
  }
  if ((market.session === "regular" && !market.openState) ||
      (market.session === "closed" && market.openState) ||
      (market.session === "regular" && market.restrictionReason === "MARKET_CLOSED") ||
      (market.session === "closed" && market.restrictionReason === "TRADING")) {
    return decision("BLOCK", "MARKET_STATUS_CONFLICT");
  }
  if (market.session === "closed") return decision("WAIT", "CLOSED_HOURS_OPT_OUT");
  if (market.session !== "regular") return decision("WAIT", "EXTENDED_HOURS_OPT_OUT");
  if (input.nowMs - market.observedAtMs > 30_000 || market.observedAtMs > input.nowMs + 10_000) {
    return decision("WAIT", "STALE_MARKET_DATA");
  }
  if (quote.estimatedExpiryMs - input.nowMs < 5_000) return decision("WAIT", "QUOTE_EXPIRED");
  if (quote.priceImpactBps === null || Math.abs(quote.priceImpactBps) > 50 || quote.slippagePercent !== "0.5") {
    return decision("WAIT", "QUOTE_QUALITY_NOT_WITHIN_POLICY");
  }
  if (proposal.side !== "BUY" || proposal.reason !== "REBALANCE_REQUIRED") {
    return decision("WAIT", "NO_BUY_REBALANCE_PROPOSED");
  }
  if (input.amountCents < 1 || input.amountCents > 1_000 || input.amountCents > proposal.proposedTradeCents) {
    return decision("BLOCK", "TRADE_EXCEEDS_POLICY_OR_PROPOSAL");
  }
  if (BigInt(wallet.usdtBalance) < BigInt(input.amountIn)) return decision("BLOCK", "INSUFFICIENT_USDT");
  const approvalRequired = BigInt(wallet.usdtAllowance) < BigInt(input.amountIn);
  const gasUnits = BigInt(input.swapGas) + (approvalRequired ? 150_000n : 0n);
  const gasPrice = BigInt(wallet.gasPrice) > BigInt(input.swapGasPrice) ? BigInt(wallet.gasPrice) : BigInt(input.swapGasPrice);
  const gasReserve = gasUnits * gasPrice * 3n / 2n;
  if (BigInt(wallet.bnbBalance) < gasReserve) return decision("BLOCK", "INSUFFICIENT_BNB_FOR_GAS");
  if (approvalRequired) {
    if (input.approvalSimulation.status !== "SUCCESS") return decision("BLOCK", "APPROVAL_SIMULATION_FAILED");
    return decision("WAIT", "APPROVAL_REQUIRED", true);
  }
  if (input.swapSimulation.status !== "SUCCESS") return decision("BLOCK", "SWAP_SIMULATION_FAILED");
  return decision("TRADE", "READY_TO_SIGN");
}
