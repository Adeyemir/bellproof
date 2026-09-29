export const bscUsdtAddress = "0x55d398326f99059fF775485246999027B3197955";
export const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/;

export interface RawQuote {
  quoteId?: string;
  vendorName?: string;
  binanceChainId?: string;
  fromTokenAmount?: string;
  toTokenAmount?: string;
  tradeFee?: string | null;
  priceImpactPercent?: string | null;
  executionMode?: string;
  approveTarget?: string | null;
  fromToken?: { tokenContractAddress?: string; decimal?: string };
  toToken?: { tokenContractAddress?: string; tokenSymbol?: string; decimal?: string };
}

export interface StockQuote {
  quoteId: string;
  vendorName: string;
  executionMode: "RFQ";
  inputAmount: string;
  outputAmount: string;
  outputDecimals: number;
  outputSymbol: string;
  tradeFeeUsd: string | null;
  priceImpactBps: number | null;
  approveTarget: string | null;
}

export function usdtAmountFromCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 1_000) {
    throw new RangeError("Quote size must be between $0.01 and $10.00.");
  }
  // BSC USDT has 18 decimals; each cent is 10^16 base units.
  return (BigInt(cents) * BigInt("10000000000000000")).toString();
}

export function normalizeStockQuote(raw: RawQuote, targetAddress: string): StockQuote | null {
  const outputDecimals = Number(raw.toToken?.decimal);
  const priceImpact = raw.priceImpactPercent;
  const priceImpactBps = priceImpact === null || priceImpact === undefined
    ? null
    : Number(priceImpact) * 100;
  if (
    raw.binanceChainId !== "56" ||
    raw.executionMode !== "RFQ" ||
    !raw.quoteId ||
    !raw.vendorName ||
    !/^\d+$/.test(raw.fromTokenAmount ?? "") ||
    !/^\d+$/.test(raw.toTokenAmount ?? "") ||
    raw.fromToken?.tokenContractAddress?.toLowerCase() !== bscUsdtAddress.toLowerCase() ||
    raw.toToken?.tokenContractAddress?.toLowerCase() !== targetAddress.toLowerCase() ||
    raw.fromToken?.decimal !== "18" ||
    !Number.isInteger(outputDecimals) ||
    outputDecimals < 0 ||
    outputDecimals > 36 ||
    (priceImpactBps !== null && !Number.isFinite(priceImpactBps))
  ) {
    return null;
  }
  return {
    quoteId: raw.quoteId,
    vendorName: raw.vendorName,
    executionMode: "RFQ",
    inputAmount: raw.fromTokenAmount!,
    outputAmount: raw.toTokenAmount!,
    outputDecimals,
    outputSymbol: raw.toToken?.tokenSymbol || "stock token",
    tradeFeeUsd: raw.tradeFee ?? null,
    priceImpactBps,
    approveTarget: raw.approveTarget ?? null,
  };
}
