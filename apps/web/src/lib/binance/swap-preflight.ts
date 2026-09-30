import { bscUsdtAddress, evmAddressPattern, type StockQuote } from "./quote-data";

const integerPattern = /^(0|[1-9]\d*)$/;
const calldataPattern = /^0x(?:[0-9a-fA-F]{2})+$/;

export interface RawSwapBuild {
  executionMode?: string;
  routerResult?: {
    binanceChainId?: string;
    vendorName?: string;
    fromTokenAmount?: string;
    toTokenAmount?: string;
    fromToken?: { tokenContractAddress?: string };
    toToken?: { tokenContractAddress?: string };
  };
  tx?: {
    from?: string;
    to?: string;
    data?: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
    maxPriorityFeePerGas?: string;
    nonce?: string;
    minReceiveAmount?: string;
    slippagePercent?: string;
    signatureData?: string[];
  };
}

export interface UnsignedEvmTransaction {
  chainId: "56";
  from: string;
  to: string;
  data: string;
  value: string;
  gas: string | null;
  gasPrice: string | null;
  maxPriorityFeePerGas: string | null;
  nonce: string | null;
}

export interface ValidatedSwapBuild {
  swap: UnsignedEvmTransaction;
  approval: UnsignedEvmTransaction;
  spender: string;
  amountIn: string;
  quotedAmountOut: string;
  minReceiveAmount: string;
  slippagePercent: string;
}

function matchesAddress(a: string | undefined | null, b: string): boolean {
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

function assertInteger(value: string | undefined, label: string, allowZero = false): string {
  if (!value || !integerPattern.test(value) || (!allowZero && BigInt(value) === 0n)) {
    throw new Error(`Invalid ${label} in Binance swap build`);
  }
  return value;
}

function slippageBasisPoints(percent: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(percent);
  if (!match) throw new Error("Invalid slippage limit");
  const basisPoints = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (basisPoints > 10_000n) throw new Error("Invalid slippage limit");
  return basisPoints;
}

export function expectedApprovalCalldata(spender: string, amount: string): string {
  if (!evmAddressPattern.test(spender) || !integerPattern.test(amount) || BigInt(amount) <= 0n) {
    throw new Error("Invalid approval spender or amount");
  }
  return `0x095ea7b3${spender.slice(2).toLowerCase().padStart(64, "0")}${BigInt(amount).toString(16).padStart(64, "0")}`;
}

export function validateSwapBuild(
  raw: RawSwapBuild,
  quote: StockQuote,
  walletAddress: string,
  stockAddress: string,
  slippagePercent: string,
): ValidatedSwapBuild {
  if (
    !evmAddressPattern.test(walletAddress) ||
    !evmAddressPattern.test(stockAddress) ||
    quote.executionMode !== "SWAP" ||
    quote.vendorName !== "LiquidMesh" ||
    !evmAddressPattern.test(quote.approveTarget ?? "") ||
    raw.executionMode !== "SWAP"
  ) {
    throw new Error("Unsupported or unverified stock swap route");
  }

  const router = raw.routerResult;
  const tx = raw.tx;
  if (
    router?.binanceChainId !== "56" ||
    router.vendorName !== quote.vendorName ||
    router.fromTokenAmount !== quote.inputAmount ||
    router.toTokenAmount !== quote.outputAmount ||
    !matchesAddress(router.fromToken?.tokenContractAddress, bscUsdtAddress) ||
    !matchesAddress(router.toToken?.tokenContractAddress, stockAddress) ||
    !matchesAddress(tx?.from, walletAddress) ||
    !matchesAddress(tx?.to, quote.approveTarget!) ||
    tx?.value !== "0" ||
    tx.slippagePercent !== slippagePercent ||
    !tx.data ||
    !calldataPattern.test(tx.data) ||
    tx.data.length > 40_000
  ) {
    throw new Error("Binance swap build does not match the selected quote and wallet");
  }

  const gas = assertInteger(tx.gas, "gas limit");
  if (BigInt(gas) > 10_000_000n) throw new Error("Binance swap gas limit exceeds the preflight cap");
  const gasPrice = assertInteger(tx.gasPrice, "gas price", true);
  const minReceiveAmount = assertInteger(tx.minReceiveAmount, "minimum receive amount");
  if (BigInt(minReceiveAmount) > BigInt(quote.outputAmount)) {
    throw new Error("Minimum receive exceeds the quoted output");
  }
  const lowestAllowedOutput = BigInt(quote.outputAmount) * (10_000n - slippageBasisPoints(slippagePercent)) / 10_000n;
  if (BigInt(minReceiveAmount) < lowestAllowedOutput) {
    throw new Error("Minimum receive exceeds the allowed slippage");
  }
  if (tx.nonce !== undefined) assertInteger(tx.nonce, "nonce", true);

  if (!Array.isArray(tx.signatureData) || tx.signatureData.length !== 1) {
    throw new Error("Expected one exact approval payload from Binance");
  }
  let approval: { approveContract?: unknown; approveTxCalldata?: unknown };
  try {
    approval = JSON.parse(tx.signatureData[0]);
  } catch {
    throw new Error("Invalid approval payload from Binance");
  }
  const spender = quote.approveTarget!;
  const approvalData = expectedApprovalCalldata(spender, quote.inputAmount);
  if (
    typeof approval.approveContract !== "string" ||
    !matchesAddress(approval.approveContract, spender) ||
    typeof approval.approveTxCalldata !== "string" ||
    approval.approveTxCalldata.toLowerCase() !== approvalData.toLowerCase()
  ) {
    throw new Error("Approval spender or amount does not match the quote");
  }

  return {
    swap: {
      chainId: "56",
      from: tx.from!,
      to: tx.to!,
      data: tx.data,
      value: tx.value,
      gas,
      gasPrice,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? null,
      nonce: tx.nonce ?? null,
    },
    approval: {
      chainId: "56",
      from: walletAddress,
      to: bscUsdtAddress,
      data: approval.approveTxCalldata,
      value: "0",
      gas: null,
      gasPrice: null,
      maxPriorityFeePerGas: null,
      nonce: null,
    },
    spender,
    amountIn: quote.inputAmount,
    quotedAmountOut: quote.outputAmount,
    minReceiveAmount,
    slippagePercent,
  };
}
