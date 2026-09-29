import { NextRequest, NextResponse } from "next/server";
import { proposeRebalance } from "@/lib/agent/proposal";
import { basketValuesFromWallet, type WalletBalanceGroup } from "@/lib/binance/portfolio-data";
import { bscUsdtAddress, evmAddressPattern } from "@/lib/binance/quote-data";
import { findBscStockMarkets } from "@/lib/binance/rwa";
import { BinanceCredentialsMissingError, BinanceTransportError, BinanceWeb3Error, postBinance } from "@/lib/binance/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid portfolio request." }, { status: 400 });
  const payload = body as Record<string, unknown>;
  const ticker = typeof payload.ticker === "string" ? payload.ticker.trim().toUpperCase() : "";
  const targetAddress = typeof payload.targetAddress === "string" ? payload.targetAddress : "";
  const walletAddress = typeof payload.walletAddress === "string" ? payload.walletAddress : "";
  const targetStockWeightBps = payload.targetStockWeightBps;
  if (
    !/^[A-Z0-9.]{1,10}$/.test(ticker) ||
    !evmAddressPattern.test(targetAddress) ||
    !evmAddressPattern.test(walletAddress) ||
    typeof targetStockWeightBps !== "number" ||
    !Number.isSafeInteger(targetStockWeightBps) ||
    targetStockWeightBps < 0 || targetStockWeightBps > 10_000
  ) {
    return NextResponse.json({ error: "Enter a BSC wallet, supported stock, and target weight from 0% to 100%." }, { status: 400 });
  }
  try {
    const market = await findBscStockMarkets(ticker);
    const asset = market.candidates.find(
      (candidate) => candidate.tokenContractAddress.toLowerCase() === targetAddress.toLowerCase(),
    );
    if (!asset) return NextResponse.json({ error: "This contract was not found for the ticker on BSC." }, { status: 404 });
    const groups = await postBinance<WalletBalanceGroup[]>(
      "/api/v1/dex/balance/token-balances-by-address",
      {
        address: walletAddress,
        tokenContractAddresses: [targetAddress, bscUsdtAddress].map((tokenContractAddress) => ({
          binanceChainId: "56",
          tokenContractAddress,
        })),
        excludeRiskToken: "1",
      },
    );
    const values = basketValuesFromWallet(groups, targetAddress);
    return NextResponse.json({
      ticker,
      tokenSymbol: asset.tokenSymbol,
      observedAtMs: Date.now(),
      valuationSource: "Binance Wallet API tokenPrice",
      ...values,
      proposal: proposeRebalance({ ...values, targetStockWeightBps, driftThresholdBps: 300 }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BinanceCredentialsMissingError) {
      return NextResponse.json({ error: "Binance Web3 API credentials are not configured.", code: "CREDENTIALS_MISSING" }, { status: 503 });
    }
    if (error instanceof BinanceWeb3Error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status === 429 ? 429 : 502 });
    }
    if (error instanceof BinanceTransportError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "UPSTREAM_TIMEOUT" ? 504 : 502 });
    }
    return NextResponse.json({ error: "Wallet balances could not be valued safely." }, { status: 502 });
  }
}
