"use client";

import { useState, type FormEvent } from "react";
import {
  demoPolicy,
  evaluateDecision,
  type DecisionAction,
  type DecisionReason,
  type MarketSession,
} from "@/lib/session-policy";

interface MarketCandidate {
  ticker: string;
  companyName: string;
  platformId: "bstock" | "ondo";
  tokenSymbol: string;
  tokenContractAddress: string;
  session: MarketSession | "unknown";
  openState: boolean;
  restrictionReason: string | null;
  restrictionMessage: string | null;
  nextOpenTimeMs: number | null;
}

interface MarketResponse {
  observedAtMs: number;
  candidates: MarketCandidate[];
}

interface QuoteResponse {
  ticker: string;
  tokenSymbol: string;
  platformId: string;
  session: MarketSession;
  receivedAtMs: number;
  estimatedTtlMs: number;
  routes: Array<{
    quoteId: string;
    vendorName: string;
    executionMode: "RFQ";
    outputAmount: string;
    outputDecimals: number;
    outputSymbol: string;
    tradeFeeUsd: string | null;
    priceImpactBps: number | null;
  }>;
}

const explanations: Record<DecisionReason, string> = {
  WRONG_CHAIN: "Only BSC mainnet (chain 56) is in scope.",
  STALE_MARKET_DATA: "The market observation is too old to use.",
  UNKNOWN_MARKET_STATE: "The underlying session could not be verified.",
  INVALID_POLICY_INPUT: "A number or policy limit is invalid.",
  MARKET_STATUS_CONFLICT: "The reported session and open state disagree.",
  ASSET_RESTRICTED: "The issuer or asset has a trading restriction.",
  MARKET_PAUSED: "A market pause overrides all other settings.",
  EXTENDED_HOURS_OPT_OUT: "Extended-hours trading is disabled by this policy.",
  CLOSED_HOURS_OPT_OUT: "Closed-hours trading is disabled by this policy.",
  DRIFT_BELOW_THRESHOLD: "The rebalance is below the configured drift threshold.",
  NO_ROUTE: "No executable route is available.",
  QUOTE_EXPIRED: "The quote must be refreshed before execution.",
  TRADE_CAP: "The proposed trade exceeds the session's per-trade limit.",
  DAILY_CAP: "The trade would exceed the daily spending limit.",
  SLIPPAGE_CAP: "Requested slippage exceeds the user's limit.",
  PRICE_IMPACT_CAP: "The route's price impact exceeds the user's limit.",
  PREFLIGHT_REQUIRED: "The route-specific checks must pass before signing.",
  PREFLIGHT_FAILED: "A route-specific preflight check failed.",
  READY_TO_SIGN: "All checked policy gates passed. A wallet signature is still required.",
};

const actionStyles: Record<DecisionAction, string> = {
  TRADE: "border-lime-400/40 bg-lime-400/10 text-lime-300",
  WAIT: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  BLOCK: "border-rose-400/40 bg-rose-400/10 text-rose-200",
};

const sessions: MarketSession[] = [
  "regular",
  "premarket",
  "postmarket",
  "overnight",
  "closed",
  "pause",
];

function formatTime(timestamp: number | null): string {
  if (timestamp === null) return "Unavailable";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}

function formatTokenAmount(raw: string, decimals: number): string {
  try {
    const padded = BigInt(raw).toString().padStart(decimals + 1, "0");
    const whole = padded.slice(0, -decimals || undefined);
    const fraction = decimals ? padded.slice(-decimals).slice(0, 6).replace(/0+$/, "") : "";
    return fraction ? `${whole}.${fraction}` : whole;
  } catch {
    return "Unavailable";
  }
}

export function BellproofDashboard() {
  const [ticker, setTicker] = useState("NVDA");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketErrorCode, setMarketErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("5");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [session, setSession] = useState<MarketSession>("regular");
  const [amount, setAmount] = useState("5");
  const [impact, setImpact] = useState("20");
  const [allowExtended, setAllowExtended] = useState(false);
  const [allowClosed, setAllowClosed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [preflight, setPreflight] = useState<"NOT_RUN" | "SUCCESS" | "FAILED">("NOT_RUN");

  const nowMs = Date.parse("2026-09-29T14:30:00Z");
  const proposedTradeCents = Math.round(Number(amount) * 100);
  const priceImpactBps = Number(impact);
  const inputIsValid =
    Number.isFinite(proposedTradeCents) &&
    proposedTradeCents >= 0 &&
    Number.isFinite(priceImpactBps) &&
    priceImpactBps >= 0;
  const decision = inputIsValid
    ? evaluateDecision({
        nowMs,
        market: {
          chainId: "56",
          session: paused ? "pause" : session,
          openState: session === "regular" && !paused,
          restrictionReason: paused ? "MARKET_PAUSED" : null,
          observedAtMs: nowMs - 1_000,
          nextOpenTimeMs: null,
        },
        quote: { receivedAtMs: nowMs - 1_000, ttlMs: 30_000, priceImpactBps },
        policy: {
          ...demoPolicy,
          allowExtendedHours: allowExtended,
          allowClosedHours: allowClosed,
        },
        driftBps: 800,
        proposedTradeCents,
        dailySpentCents: 0,
        requestedSlippageBps: 30,
        preflight,
      })
    : null;

  async function lookUpMarket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMarket(null);
    setMarketError(null);
    setMarketErrorCode(null);
    setQuote(null);
    setQuoteError(null);
    try {
      const response = await fetch(`/api/market?ticker=${encodeURIComponent(ticker.trim().toUpperCase())}`, {
        cache: "no-store",
      });
      const body: MarketResponse | { error: string } = await response.json();
      if (!response.ok) {
        setMarketError("error" in body ? body.error : "Market lookup failed.");
        setMarketErrorCode("code" in body && typeof body.code === "string" ? body.code : null);
      } else {
        setMarket(body as MarketResponse);
      }
    } catch {
      setMarketError("The market service could not be reached.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchQuote(candidate: MarketCandidate) {
    setQuoteLoading(true);
    setQuote(null);
    setQuoteError(null);
    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: candidate.ticker,
          targetAddress: candidate.tokenContractAddress,
          walletAddress: walletAddress.trim(),
          amountCents: Math.round(Number(quoteAmount) * 100),
        }),
      });
      const body: QuoteResponse | { error: string } = await response.json();
      if (!response.ok) {
        setQuoteError("error" in body ? body.error : "Quote lookup failed.");
      } else {
        setQuote(body as QuoteResponse);
      }
    } catch {
      setQuoteError("The quote service could not be reached.");
    } finally {
      setQuoteLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-5 pb-16 pt-6 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-lime-300/40 bg-lime-300/10 text-xl font-bold text-lime-300">B</div>
          <div>
            <p className="text-lg font-bold tracking-tight">Bellproof</p>
            <p className="text-xs text-white/45">Session-aware execution for BSC stocks</p>
          </div>
        </div>
        <div className="rounded-full border border-lime-300/25 bg-lime-300/5 px-3 py-1 text-xs font-medium text-lime-300">Prototype · BSC mainnet</div>
      </header>

      <section className="grid gap-8 py-14 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.26em] text-lime-300">Know when to act</p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            A stock token can trade all night. <span className="text-lime-300">Should yours?</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-white/60">
            Bellproof checks the underlying session, asset restrictions, route quality, spending limits, and route-specific preflight before a rebalance can reach a wallet signature.
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm leading-6 text-white/60">
          <p className="mb-2 font-semibold text-white">Current build</p>
          <p>Live RWA discovery and market status are wired to the Binance Web3 API. The policy lab below uses clearly labeled sample inputs. Swaps and wallet signing are the next integration gate.</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-[#121a19] p-6 sm:p-8" aria-labelledby="market-heading">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-300">01 / Live data</p>
              <h2 id="market-heading" className="mt-3 text-2xl font-semibold tracking-tight">Find the real BSC asset</h2>
            </div>
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/50">Binance RWA Data</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-white/55">Searches exact tickers, keeps bStocks and Ondo contracts on chain 56, then reads each underlying market session.</p>
          <form onSubmit={lookUpMarket} className="mt-7 flex gap-3">
            <label htmlFor="ticker" className="sr-only">Stock ticker</label>
            <input id="ticker" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} maxLength={10} placeholder="Ticker, e.g. NVDA" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-[#0b1110] px-4 py-3 text-base font-medium uppercase outline-none placeholder:normal-case placeholder:text-white/30 focus:border-lime-300/60" />
            <button disabled={loading} type="submit" className="rounded-xl bg-lime-300 px-5 py-3 text-sm font-bold text-[#122015] transition hover:bg-lime-200 disabled:opacity-50">{loading ? "Checking…" : "Check ticker"}</button>
          </form>
          <div aria-live="polite" className="mt-6 min-h-24">
            {marketError && <div className="rounded-xl border border-amber-300/25 bg-amber-300/5 p-4 text-sm text-amber-100">{marketError}{marketErrorCode === "CREDENTIALS_MISSING" && <p className="mt-2 text-xs text-amber-100/65">For local setup, copy apps/web/.env.example to apps/web/.env.local and add your Binance Web3 API credentials.</p>}</div>}
            {market && market.candidates.length === 0 && <div className="rounded-xl border border-white/10 p-4 text-sm text-white/55">No supported bStocks or Ondo contract for {ticker.toUpperCase()} was returned on BSC. Try another ticker.</div>}
            {market && market.candidates.length > 0 && <div className="space-y-3">{market.candidates.map((candidate) => (
              <article key={`${candidate.platformId}:${candidate.tokenContractAddress}`} className="rounded-xl border border-white/10 bg-black/15 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{candidate.companyName || candidate.ticker} <span className="text-white/45">· {candidate.tokenSymbol}</span></p><p className="mt-1 text-xs uppercase tracking-widest text-lime-300">{candidate.platformId}</p></div><span className="rounded-full border border-white/15 px-3 py-1 text-xs capitalize text-white/75">{candidate.session}</span></div>
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2"><div><dt className="text-white/40">Underlying open</dt><dd className="mt-1">{candidate.openState ? "Yes" : "No"}</dd></div><div><dt className="text-white/40">Restriction</dt><dd className="mt-1">{candidate.restrictionReason ?? "None reported"}</dd></div><div><dt className="text-white/40">Next open</dt><dd className="mt-1">{formatTime(candidate.nextOpenTimeMs)}</dd></div><div><dt className="text-white/40">Contract</dt><dd className="mt-1 break-all font-mono">{candidate.tokenContractAddress}</dd></div></dl>
                {candidate.restrictionMessage && <p className="mt-3 text-xs text-amber-200">{candidate.restrictionMessage}</p>}
                <button type="button" disabled={quoteLoading} onClick={() => fetchQuote(candidate)} className="mt-4 rounded-lg border border-lime-300/35 px-3 py-2 text-xs font-semibold text-lime-300 hover:bg-lime-300/10 disabled:opacity-50">{quoteLoading ? "Requesting…" : "Get RFQ routes"}</button>
              </article>
            ))}<p className="pt-1 text-xs text-white/40">Response checked {formatTime(market.observedAtMs)}. Session status is informational; execution needs a new quote and the correct RFQ signing flow.</p></div>}
            {!market && !marketError && !loading && <p className="text-sm text-white/35">Enter a ticker to inspect the currently available BSC representation.</p>}
          </div>
          {market && market.candidates.length > 0 && <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-sm font-semibold">Live RFQ preview</p>
            <p className="mt-1 text-xs leading-5 text-white/45">Equity routes require a wallet address even for a quote. No wallet connection, approval, or order is made here.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_7rem]">
              <label className="text-xs text-white/50">Your BSC wallet address<input value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)} placeholder="0x…" autoComplete="off" className="mt-2 w-full rounded-xl border border-white/15 bg-[#0b1110] px-3 py-3 font-mono text-xs text-white outline-none focus:border-lime-300/60" /></label>
              <label className="text-xs text-white/50">USDT amount<input type="number" min="0.01" max="10" step="0.01" value={quoteAmount} onChange={(event) => setQuoteAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-[#0b1110] px-3 py-3 text-sm text-white outline-none focus:border-lime-300/60" /></label>
            </div>
            <div aria-live="polite" className="mt-4">
              {quoteError && <p className="rounded-lg border border-amber-300/25 bg-amber-300/5 p-3 text-xs text-amber-100">{quoteError}</p>}
              {quote && <div className="rounded-xl border border-white/10 bg-black/15 p-4 text-xs"><p className="font-semibold text-white">{quote.tokenSymbol} · {quote.platformId} · {quote.session}</p><p className="mt-1 text-white/40">{quote.routes.length} RFQ route(s) · received {formatTime(quote.receivedAtMs)} · estimated 30-second lifetime</p>{quote.routes.length === 0 && <p className="mt-3 text-amber-200">No valid RFQ route returned for this amount and wallet.</p>}{quote.routes.map((route) => <div key={route.quoteId} className="mt-3 border-t border-white/10 pt-3"><p className="font-semibold text-lime-300">{route.vendorName} · ≈ {formatTokenAmount(route.outputAmount, route.outputDecimals)} {route.outputSymbol}</p><p className="mt-1 text-white/50">Impact: {route.priceImpactBps === null ? "Unavailable" : `${route.priceImpactBps.toFixed(2)} bps`} · Fee: {route.tradeFeeUsd === null ? "Unavailable" : `$${route.tradeFeeUsd}`}</p><p className="mt-1 break-all font-mono text-white/30">Quote ID: {route.quoteId}</p></div>)}</div>}
            </div>
          </div>}
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#121a19] p-6 sm:p-8" aria-labelledby="policy-heading">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-300">02 / Policy lab</p><h2 id="policy-heading" className="mt-3 text-2xl font-semibold tracking-tight">Would Bellproof act?</h2></div>
            <span className="rounded-full border border-amber-300/25 bg-amber-300/5 px-3 py-1 text-xs text-amber-200">Simulation</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-white/55">Change hypothetical inputs to inspect the deterministic decision engine. These controls do not read live quotes or send transactions.</p>
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-white/50">Underlying session<select value={session} onChange={(event) => setSession(event.target.value as MarketSession)} className="mt-2 w-full rounded-xl border border-white/15 bg-[#0b1110] px-3 py-3 text-sm capitalize text-white outline-none focus:border-lime-300/60">{sessions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="block text-xs text-white/50">Trade size · USD<input type="number" min="0" max="100000" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-[#0b1110] px-3 py-3 text-sm text-white outline-none focus:border-lime-300/60" /></label>
            <label className="block text-xs text-white/50">Price impact · basis points<input type="number" min="0" max="10000" step="1" value={impact} onChange={(event) => setImpact(event.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-[#0b1110] px-3 py-3 text-sm text-white outline-none focus:border-lime-300/60" /></label>
            <label className="block text-xs text-white/50">Route preflight<select value={preflight} onChange={(event) => setPreflight(event.target.value as typeof preflight)} className="mt-2 w-full rounded-xl border border-white/15 bg-[#0b1110] px-3 py-3 text-sm text-white outline-none focus:border-lime-300/60"><option value="NOT_RUN">Not run</option><option value="SUCCESS">Passed (sample)</option><option value="FAILED">Failed (sample)</option></select></label>
          </div>
          <div className="mt-5 space-y-3 text-sm text-white/70">
            <label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={allowExtended} onChange={(event) => setAllowExtended(event.target.checked)} className="accent-lime-300" />Allow premarket, postmarket, and overnight</label>
            <label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={allowClosed} onChange={(event) => setAllowClosed(event.target.checked)} className="accent-lime-300" />Allow trading while the underlying is closed</label>
            <label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={paused} onChange={(event) => setPaused(event.target.checked)} className="accent-lime-300" />Issuer or market pause reported</label>
          </div>
          <div aria-live="polite" className={`mt-7 rounded-2xl border p-5 ${decision ? actionStyles[decision.action] : "border-rose-400/40 bg-rose-400/10 text-rose-200"}`}>
            <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.2em]">Decision</p><p className="text-2xl font-bold">{decision?.action ?? "INVALID"}</p></div>
            <p className="mt-3 text-sm font-semibold">{decision?.reason.replaceAll("_", " ") ?? "Invalid sample input"}</p>
            <p className="mt-1 text-sm opacity-80">{decision ? explanations[decision.reason] : "Enter a valid nonnegative amount and price impact."}</p>
          </div>
          <p className="mt-4 text-xs leading-5 text-white/35">Sample limits: $10 regular, $3 outside regular hours, $20 daily, 50 bps impact. A “TRADE” result means policy eligible to sign; no trade is placed.</p>
        </section>
      </div>

      <footer className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:justify-between"><p>Bellproof · Tokenized Stocks Products &amp; Agents</p><p>Spot only · BSC chain 56 · No transaction sent from this page</p></footer>
    </main>
  );
}
