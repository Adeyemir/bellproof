import { NextRequest, NextResponse } from "next/server";
import {
  BinanceCredentialsMissingError,
  BinanceTransportError,
  BinanceWeb3Error,
} from "@/lib/binance/server";
import { findBscStockMarkets } from "@/lib/binance/rwa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9.]{1,10}$/.test(ticker)) {
    return NextResponse.json(
      { error: "Enter a ticker with 1–10 letters, numbers, or periods." },
      { status: 400 },
    );
  }

  try {
    const result = await findBscStockMarkets(ticker);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof BinanceCredentialsMissingError) {
      return NextResponse.json(
        { error: "Binance Web3 API credentials are not configured.", code: "CREDENTIALS_MISSING" },
        { status: 503 },
      );
    }
    if (error instanceof BinanceWeb3Error) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status === 429 ? 429 : 502 },
      );
    }
    if (error instanceof BinanceTransportError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "UPSTREAM_TIMEOUT" ? 504 : 502 },
      );
    }
    return NextResponse.json(
      { error: "Market data is unavailable.", code: "MARKET_DATA_UNAVAILABLE" },
      { status: 502 },
    );
  }
}
