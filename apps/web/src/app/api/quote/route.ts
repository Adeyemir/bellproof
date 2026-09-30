import { NextRequest, NextResponse } from "next/server";
import { getBinance, BinanceCredentialsMissingError, BinanceTransportError, BinanceWeb3Error } from "@/lib/binance/server";
import { findBscStockMarkets } from "@/lib/binance/rwa";
import {
  bscUsdtAddress,
  evmAddressPattern,
  normalizeStockQuote,
  usdtAmountFromCents,
  type RawQuote,
} from "@/lib/binance/quote-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid quote request." }, { status: 400 });
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
    const asset = market.candidates.find(
      (candidate) => candidate.tokenContractAddress.toLowerCase() === targetAddress.toLowerCase(),
    );
    if (!asset) {
      return NextResponse.json({ error: "This contract was not found for the ticker on BSC." }, { status: 404 });
    }
    if (
      asset.session === "pause" ||
      (asset.restrictionReason !== null &&
        asset.restrictionReason !== "TRADING" &&
        asset.restrictionReason !== "MARKET_CLOSED")
    ) {
      return NextResponse.json({ error: "This asset currently has an unknown or restricted market state." }, { status: 409 });
    }
    const amount = usdtAmountFromCents(amountCents);
    const raw = await getBinance<RawQuote[]>("/api/v1/dex/aggregator/quote", {
      binanceChainId: "56",
      amount,
      fromTokenAddress: bscUsdtAddress,
      toTokenAddress: asset.tokenContractAddress,
      userWalletAddress: walletAddress,
    });
    if (!Array.isArray(raw)) throw new Error("Unexpected quote response");
    const routes = raw
      .map((route) => normalizeStockQuote(route, asset.tokenContractAddress))
      .filter((route) => route !== null && route.inputAmount === amount);
    return NextResponse.json({
      ticker,
      tokenSymbol: asset.tokenSymbol,
      platformId: asset.platformId,
      session: asset.session,
      receivedAtMs: Date.now(),
      estimatedTtlMs: 30_000,
      routes,
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
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "UPSTREAM_TIMEOUT" ? 504 : 502 },
      );
    }
    return NextResponse.json({ error: "Quote service is unavailable." }, { status: 502 });
  }
}
