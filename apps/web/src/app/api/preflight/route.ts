import { NextRequest, NextResponse } from "next/server";
import {
  BinanceCredentialsMissingError,
  BinanceTransportError,
  BinanceWeb3Error,
  getBinance,
  postBinance,
} from "@/lib/binance/server";
import { findBscStockMarkets } from "@/lib/binance/rwa";
import {
  bscUsdtAddress,
  evmAddressPattern,
  normalizeStockQuote,
  usdtAmountFromCents,
  type RawQuote,
} from "@/lib/binance/quote-data";
import { validateSwapBuild, type RawSwapBuild, type UnsignedEvmTransaction } from "@/lib/binance/swap-preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SimulationResult {
  status?: string;
  failReason?: string | null;
  balanceChanges?: unknown[];
  allowanceChanges?: unknown[];
}

function simulationSummary(result: SimulationResult) {
  return {
    status: result.status ?? "UNKNOWN",
    failReason: result.failReason?.slice(0, 300) ?? null,
    balanceChanges: Array.isArray(result.balanceChanges) ? result.balanceChanges : [],
    allowanceChanges: Array.isArray(result.allowanceChanges) ? result.allowanceChanges : [],
  };
}

async function simulate(tx: UnsignedEvmTransaction) {
  return simulationSummary(await postBinance<SimulationResult>(
    "/api/v1/dex/pre-transaction/simulate",
    {
      binanceChainId: "56",
      evmTx: { from: tx.from, to: tx.to, value: tx.value, data: tx.data },
    },
  ));
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid preflight request." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const ticker = typeof payload.ticker === "string" ? payload.ticker.trim().toUpperCase() : "";
  const targetAddress = typeof payload.targetAddress === "string" ? payload.targetAddress : "";
  const walletAddress = typeof payload.walletAddress === "string" ? payload.walletAddress : "";
  const amountCents = payload.amountCents;
  if (
    !/^[A-Z0-9.]{1,10}$/.test(ticker) ||
    !evmAddressPattern.test(targetAddress) ||
    !evmAddressPattern.test(walletAddress) ||
    typeof amountCents !== "number" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1 ||
    amountCents > 1_000
  ) {
    return NextResponse.json({ error: "Enter a BSC stock, wallet address, and amount from $0.01 to $10.00." }, { status: 400 });
  }

  try {
    const market = await findBscStockMarkets(ticker);
    const asset = market.candidates.find((candidate) =>
      candidate.tokenContractAddress.toLowerCase() === targetAddress.toLowerCase(),
    );
    if (!asset) {
      return NextResponse.json({ error: "This BSC stock contract was not returned for the ticker." }, { status: 404 });
    }
    if (
      asset.session === "pause" ||
      (asset.restrictionReason !== null &&
        asset.restrictionReason !== "TRADING" &&
        asset.restrictionReason !== "MARKET_CLOSED")
    ) {
      return NextResponse.json({
        decision: { action: "BLOCK", reason: "ASSET_RESTRICTED" },
        market: { session: asset.session, restrictionReason: asset.restrictionReason, observedAtMs: market.observedAtMs },
        signingEnabled: false,
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const amount = usdtAmountFromCents(amountCents);
    const quoteRows = await getBinance<RawQuote[]>("/api/v1/dex/aggregator/quote", {
      binanceChainId: "56",
      amount,
      fromTokenAddress: bscUsdtAddress,
      toTokenAddress: asset.tokenContractAddress,
      userWalletAddress: walletAddress,
    });
    if (!Array.isArray(quoteRows)) throw new Error("Unexpected quote response");
    const quote = quoteRows
      .map((row) => normalizeStockQuote(row, asset.tokenContractAddress))
      .find((row) => row?.executionMode === "SWAP" && row.vendorName === "LiquidMesh" && row.inputAmount === amount);
    if (!quote) {
      return NextResponse.json({
        decision: { action: "WAIT", reason: "NO_SUPPORTED_SWAP_ROUTE" },
        market: { session: asset.session, restrictionReason: asset.restrictionReason, observedAtMs: market.observedAtMs },
        signingEnabled: false,
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const quoteReceivedAtMs = Date.now();
    // Binance documents an approximate 30-second quote lifetime; use 25 seconds here.
    const estimatedExpiryMs = quoteReceivedAtMs + 25_000;
    const slippagePercent = "0.5";
    const rawBuild = await getBinance<RawSwapBuild>("/api/v1/dex/aggregator/swap", {
      binanceChainId: "56",
      amount,
      fromTokenAddress: bscUsdtAddress,
      toTokenAddress: asset.tokenContractAddress,
      userWalletAddress: walletAddress,
      quoteId: quote.quoteId,
      slippagePercent,
      approveTransaction: "true",
      approveAmount: amount,
    });
    const validated = validateSwapBuild(
      rawBuild,
      quote,
      walletAddress,
      asset.tokenContractAddress,
      slippagePercent,
    );

    // These calls do not change chain state. The swap simulation observes the current
    // allowance, even when the approval simulation predicts success.
    const approvalSimulation = await simulate(validated.approval);
    const swapSimulation = await simulate(validated.swap);

    let action: "WAIT" | "BLOCK" = "WAIT";
    let reason = "LIVE_POLICY_AND_WALLET_CHECK_REQUIRED";
    if (asset.session === "unknown") {
      action = "BLOCK";
      reason = "UNKNOWN_MARKET_STATE";
    } else if (asset.session === "closed") {
      reason = "CLOSED_HOURS_OPT_OUT";
    } else if (asset.session !== "regular") {
      reason = "EXTENDED_HOURS_OPT_OUT";
    } else if (Date.now() >= estimatedExpiryMs) {
      reason = "QUOTE_EXPIRED";
    } else if (quote.priceImpactBps === null || Math.abs(quote.priceImpactBps) > 50) {
      reason = "QUOTE_QUALITY_NOT_WITHIN_POLICY";
    } else if (approvalSimulation.status !== "SUCCESS" || swapSimulation.status !== "SUCCESS") {
      action = "BLOCK";
      reason = "PREFLIGHT_FAILED";
    }

    return NextResponse.json({
      decision: { action, reason },
      signingEnabled: false,
      market: {
        session: asset.session,
        restrictionReason: asset.restrictionReason,
        observedAtMs: market.observedAtMs,
        nextOpenTimeMs: asset.nextOpenTimeMs,
      },
      quote: {
        quoteId: quote.quoteId,
        vendorName: quote.vendorName,
        executionMode: quote.executionMode,
        receivedAtMs: quoteReceivedAtMs,
        estimatedExpiryMs,
        amountIn: validated.amountIn,
        quotedAmountOut: validated.quotedAmountOut,
        minReceiveAmount: validated.minReceiveAmount,
        outputSymbol: quote.outputSymbol,
        outputDecimals: quote.outputDecimals,
        priceImpactBps: quote.priceImpactBps,
        slippagePercent: validated.slippagePercent,
      },
      execution: {
        router: validated.swap.to,
        spender: validated.spender,
        approval: validated.approval,
        swap: validated.swap,
        nonceSource: validated.swap.nonce === null ? "not supplied by Binance" : "Binance swap build",
      },
      simulations: { approval: approvalSimulation, swap: swapSimulation },
      simulationNote: "Each simulation reads current chain state. A successful approval simulation does not grant allowance for the separate swap simulation.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BinanceCredentialsMissingError) {
      return NextResponse.json({ error: "Binance Web3 API credentials are not configured.", code: "CREDENTIALS_MISSING" }, { status: 503 });
    }
    if (error instanceof BinanceWeb3Error) {
      const status = error.status === 429 ? 429 : error.code === 40375 ? 422 : error.code === 40367 ? 409 : 502;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    if (error instanceof BinanceTransportError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "UPSTREAM_TIMEOUT" ? 504 : 502 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preflight failed.", code: "PREFLIGHT_REJECTED" }, { status: 409 });
  }
}
