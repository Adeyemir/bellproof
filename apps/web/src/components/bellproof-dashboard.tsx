"use client";

import { useState, type FormEvent } from "react";
import {
  demoPolicy,
  evaluateDecision,
  type DecisionAction,
  type DecisionReason,
  type MarketSession,
} from "@/lib/session-policy";
import { proposeRebalance } from "@/lib/agent/proposal";
import type { RebalanceProposal } from "@/lib/agent/proposal";

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
  tokenToShareRatio: string | null;
  attestations: Array<{ label: string; url: string }>;
  profileUnavailable: boolean;
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

interface PortfolioResponse {
  ticker: string;
  tokenSymbol: string;
  observedAtMs: number;
  valuationSource: string;
  stockValueCents: number;
  stableValueCents: number;
  proposal: RebalanceProposal;
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
  QUOTE_QUALITY_UNKNOWN: "The route did not report enough price-impact data to meet this policy.",
  TRADE_CAP: "The proposed trade exceeds the session's per-trade limit.",
  DAILY_CAP: "The trade would exceed the daily spending limit.",
  SLIPPAGE_CAP: "Requested slippage exceeds the user's limit.",
  PRICE_IMPACT_CAP: "The route's price impact exceeds the user's limit.",
  PREFLIGHT_REQUIRED: "The route-specific checks must pass before signing.",
  PREFLIGHT_FAILED: "A route-specific preflight check failed.",
  READY_TO_SIGN: "All checked policy gates passed. A wallet signature is still required.",
};

const actionStyles: Record<DecisionAction, string> = {
  TRADE: "is-trade",
  WAIT: "is-wait",
  BLOCK: "is-block",
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
  const [liveTargetWeight, setLiveTargetWeight] = useState("15");
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [session, setSession] = useState<MarketSession>("regular");
  const [basketValue, setBasketValue] = useState("100");
  const [currentWeight, setCurrentWeight] = useState("18.7");
  const [targetWeight, setTargetWeight] = useState("15");
  const [impact, setImpact] = useState("20");
  const [allowExtended, setAllowExtended] = useState(false);
  const [allowClosed, setAllowClosed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [preflight, setPreflight] = useState<"NOT_RUN" | "SUCCESS" | "FAILED">("NOT_RUN");

  const nowMs = Date.parse("2026-09-29T14:30:00Z");
  const basketValueCents = Math.round(Number(basketValue) * 100);
  const currentWeightBps = Math.round(Number(currentWeight) * 100);
  const targetWeightBps = Math.round(Number(targetWeight) * 100);
  const priceImpactBps = Number(impact);
  const inputIsValid =
    Number.isSafeInteger(basketValueCents) &&
    basketValueCents >= 0 && basketValueCents <= 10_000_000 &&
    Number.isSafeInteger(currentWeightBps) &&
    currentWeightBps >= 0 && currentWeightBps <= 10_000 &&
    Number.isSafeInteger(targetWeightBps) &&
    targetWeightBps >= 0 && targetWeightBps <= 10_000 &&
    Number.isFinite(priceImpactBps) &&
    priceImpactBps >= 0;
  const proposal = inputIsValid
    ? proposeRebalance({
        stockValueCents: Math.round((basketValueCents * currentWeightBps) / 10_000),
        stableValueCents: basketValueCents - Math.round((basketValueCents * currentWeightBps) / 10_000),
        targetStockWeightBps: targetWeightBps,
        driftThresholdBps: demoPolicy.driftThresholdBps,
      })
    : null;
  const decision = proposal
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
        driftBps: proposal.driftBps,
        proposedTradeCents: proposal.proposedTradeCents,
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
    setPortfolio(null);
    setPortfolioError(null);
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

  async function fetchPortfolio(candidate: MarketCandidate) {
    setPortfolioLoading(true);
    setPortfolio(null);
    setPortfolioError(null);
    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: candidate.ticker,
          targetAddress: candidate.tokenContractAddress,
          walletAddress: walletAddress.trim(),
          targetStockWeightBps: Math.round(Number(liveTargetWeight) * 100),
        }),
      });
      const body: PortfolioResponse | { error: string } = await response.json();
      if (!response.ok) {
        setPortfolioError("error" in body ? body.error : "Portfolio lookup failed.");
      } else {
        setPortfolio(body as PortfolioResponse);
      }
    } catch {
      setPortfolioError("The portfolio service could not be reached.");
    } finally {
      setPortfolioLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#" aria-label="Bellproof home">
          <span className="brand-icon" aria-hidden="true" />
          <span className="brand-name">Bellproof<span>.</span></span>
        </a>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#market">Market desk</a>
          <a href="#policy">Policy lab</a>
        </nav>
        <span className="network-pill"><span className="network-dot" />BSC MAINNET <span>/ 56</span></span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span /> TOKENIZED STOCKS / EXECUTION POLICY</p>
          <h1 id="hero-title">Keep your stock basket <em>within policy.</em></h1>
          <p className="hero-description">Bellproof proposes a rebalance, checks real market conditions, and explains whether to trade, wait, or block. Every decision has a reason.</p>
          <div className="hero-actions">
            <a className="button button-dark" href="#market">Explore market data <span aria-hidden="true">↗</span></a>
            <a className="text-link" href="#policy">Try the policy lab <span aria-hidden="true">↗</span></a>
          </div>
          <p className="hero-footnote">SPOT ONLY <span>/</span> BSC CHAIN 56 <span>/</span> NO TRANSACTION FROM THIS PAGE</p>
        </div>
        <aside className="hero-preview" aria-label="Sample policy decision">
          <div className="preview-top"><span>DECISION PREVIEW</span><span className="preview-sample">SAMPLE INPUTS</span></div>
          <div className="preview-content">
            <p>BELLPROOF POLICY / CURRENT RESULT</p>
            <strong className={"preview-action " + (decision ? actionStyles[decision.action] : "is-block")}>{decision?.action ?? "INVALID"}<span>.</span></strong>
            <h2>{decision?.reason.replaceAll("_", " ") ?? "INVALID SAMPLE INPUT"}</h2>
            <p>{decision ? explanations[decision.reason] : "Enter valid sample inputs in the policy lab."}</p>
          </div>
          <div className="preview-metrics">
            <div><span>PROPOSAL</span><strong>{proposal?.side ?? "—"}</strong></div>
            <div><span>DRIFT</span><strong>{proposal ? (proposal.driftBps / 100).toFixed(2) + "%" : "—"}</strong></div>
            <div><span>TRIGGER</span><strong>3.00%</strong></div>
          </div>
        </aside>
      </section>

      <div className="process-strip" aria-label="How Bellproof works">
        <div><span>01</span><strong>Observe</strong><p>Wallet, issuer, session</p></div>
        <div><span>02</span><strong>Propose</strong><p>Target versus actual weight</p></div>
        <div><span>03</span><strong>Verify</strong><p>Route and policy gates</p></div>
      </div>

      <div className="workspace-heading">
        <div><span className="section-kicker">THE WORKSPACE</span><h2>From token to decision.</h2></div>
        <p>Inspect the market, then test how Bellproof responds.</p>
      </div>

      <div className="workspace-grid">
        <section id="market" className="workspace-panel market-panel" aria-labelledby="market-heading">
          <div className="panel-header">
            <div><span className="panel-index">01 / LIVE DATA</span><h3 id="market-heading">Market desk</h3><p>Find a tokenized stock on BSC and inspect its current trading state.</p></div>
            <span className="panel-tag">BINANCE RWA</span>
          </div>
          <form onSubmit={lookUpMarket} className="ticker-form">
            <label htmlFor="ticker">STOCK TICKER</label>
            <div className="ticker-row">
              <input id="ticker" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} maxLength={10} placeholder="e.g. NVDA" autoComplete="off" className="text-input ticker-input" />
              <button disabled={loading} type="submit" className="button button-gold">{loading ? "Checking…" : "Check ticker"} <span aria-hidden="true">↗</span></button>
            </div>
          </form>
          <div aria-live="polite" className="market-results">
            {marketError && <div className="message message-error">{marketError}{marketErrorCode === "CREDENTIALS_MISSING" && <p>For local setup, add your Binance Web3 credentials to apps/web/.env.local.</p>}</div>}
            {market && market.candidates.length === 0 && <div className="empty-state"><span>○</span><strong>No supported token found</strong><p>No bStocks or Ondo contract for {ticker.toUpperCase()} was returned on BSC. Try another ticker.</p></div>}
            {market && market.candidates.length > 0 && <div className="candidate-list">
              {market.candidates.map((candidate) => (
                <article key={candidate.platformId + ":" + candidate.tokenContractAddress} className="candidate-card">
                  <div className="candidate-top"><div><span className="issuer-label">{candidate.platformId.toUpperCase()}</span><h4>{candidate.companyName || candidate.ticker}<small> / {candidate.tokenSymbol}</small></h4></div><span className="session-pill">{candidate.session}</span></div>
                  <div className="candidate-facts">
                    <div><span>UNDERLYING OPEN</span><strong>{candidate.openState ? "Yes" : "No"}</strong></div>
                    <div><span>RESTRICTION</span><strong>{candidate.restrictionReason ?? "None reported"}</strong></div>
                    <div><span>NEXT OPEN</span><strong>{formatTime(candidate.nextOpenTimeMs)}</strong></div>
                    <div><span>TOKEN / SHARE</span><strong>{candidate.tokenToShareRatio ?? "Unavailable"}</strong></div>
                  </div>
                  <p className="contract-line"><span>CONTRACT</span><code>{candidate.tokenContractAddress}</code></p>
                  {candidate.restrictionMessage && <p className="candidate-warning">{candidate.restrictionMessage}</p>}
                  {candidate.profileUnavailable && <p className="candidate-warning">Issuer profile could not be fetched.</p>}
                  {candidate.attestations.length > 0 && <div className="attestations">{candidate.attestations.map((link) => <a key={link.label} href={link.url} target="_blank" rel="noreferrer">{link.label.replaceAll(/([A-Z])/g, " $1").trim()} ↗</a>)}</div>}
                  <div className="candidate-actions"><button type="button" disabled={quoteLoading} onClick={() => fetchQuote(candidate)} className="button button-outline">{quoteLoading ? "Requesting…" : "Get RFQ routes"}</button><button type="button" disabled={portfolioLoading} onClick={() => fetchPortfolio(candidate)} className="button button-quiet">{portfolioLoading ? "Reading…" : "Propose from basket"}</button></div>
                </article>
              ))}
              <p className="source-note">Observed {formatTime(market.observedAtMs)}. A fresh quote and route checks are required before execution.</p>
            </div>}
            {!market && !marketError && !loading && <div className="empty-state"><span>↗</span><strong>Start with a ticker</strong><p>Search an equity symbol to see its BSC token, issuer, and market session.</p></div>}
          </div>

          {market && market.candidates.length > 0 && <div className="wallet-tools">
            <div className="subsection-header"><div><span className="section-kicker">READ-ONLY TOOLS</span><h4>Quote and basket preview</h4></div><span className="read-only-pill">NO SIGNATURE</span></div>
            <p className="subsection-description">Enter a BSC wallet address to inspect a route or calculate allocation drift. Nothing is submitted.</p>
            <div className="field-grid wallet-fields">
              <label className="field"><span>WALLET ADDRESS</span><input value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)} placeholder="0x…" autoComplete="off" className="text-input mono-input" /></label>
              <label className="field"><span>USDT QUOTE SIZE</span><input type="number" min="0.01" max="10" step="0.01" value={quoteAmount} onChange={(event) => setQuoteAmount(event.target.value)} className="text-input" /></label>
              <label className="field"><span>STOCK TARGET %</span><input type="number" min="0" max="100" step="0.01" value={liveTargetWeight} onChange={(event) => setLiveTargetWeight(event.target.value)} className="text-input" /></label>
            </div>
            <div aria-live="polite" className="tool-results">
              {quoteError && <p className="message message-error">{quoteError}</p>}
              {quote && <div className="result-card"><div className="result-top"><strong>RFQ routes / {quote.tokenSymbol}</strong><span>{quote.routes.length} ROUTE(S)</span></div><p className="result-meta">{quote.platformId} · {quote.session} · received {formatTime(quote.receivedAtMs)} · estimated 30-second lifetime</p>{quote.routes.length === 0 && <p className="candidate-warning">No valid RFQ route returned for this amount and wallet.</p>}{quote.routes.map((route) => <div key={route.quoteId} className="route-row"><strong>{route.vendorName} / ≈ {formatTokenAmount(route.outputAmount, route.outputDecimals)} {route.outputSymbol}</strong><p>Impact: {route.priceImpactBps === null ? "Unavailable" : route.priceImpactBps.toFixed(2) + " bps"} · Fee: {route.tradeFeeUsd === null ? "Unavailable" : "$" + route.tradeFeeUsd}</p><code>Quote ID: {route.quoteId}</code></div>)}</div>}
              {portfolioError && <p className="message message-error">{portfolioError}</p>}
              {portfolio && <div className="result-card"><div className="result-top"><strong>Basket proposal / {portfolio.tokenSymbol}</strong><span>LIVE WALLET READ</span></div><p className="result-meta">Stock {"$"}{(portfolio.stockValueCents / 100).toFixed(2)} · USDT {"$"}{(portfolio.stableValueCents / 100).toFixed(2)} · target {(portfolio.proposal.targetStockWeightBps / 100).toFixed(2)}%</p><p className="result-emphasis">{portfolio.proposal.side === "HOLD" ? "HOLD" : portfolio.proposal.side + " ≈ $" + (portfolio.proposal.proposedTradeCents / 100).toFixed(2)} <span>/ {portfolio.proposal.reason.replaceAll("_", " ")}</span></p><p className="result-meta">Valued with {portfolio.valuationSource} at {formatTime(portfolio.observedAtMs)}. A fresh route and policy review are still required.</p></div>}
            </div>
          </div>}
        </section>

        <section id="policy" className="workspace-panel policy-panel" aria-labelledby="policy-heading">
          <div className="panel-header"><div><span className="panel-index">02 / SIMULATION</span><h3 id="policy-heading">Policy lab</h3><p>Change sample conditions to see when the same rule set waits or blocks.</p></div><span className="panel-tag panel-tag-sample">SAMPLE INPUTS</span></div>
          <div className="field-grid policy-fields">
            <label className="field"><span>MARKET SESSION</span><select value={session} onChange={(event) => setSession(event.target.value as MarketSession)} className="text-input">{sessions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="field"><span>BASKET VALUE / USD</span><input type="number" min="0" max="100000" step="0.01" value={basketValue} onChange={(event) => setBasketValue(event.target.value)} className="text-input" /></label>
            <label className="field"><span>CURRENT STOCK WEIGHT %</span><input type="number" min="0" max="100" step="0.01" value={currentWeight} onChange={(event) => setCurrentWeight(event.target.value)} className="text-input" /></label>
            <label className="field"><span>TARGET STOCK WEIGHT %</span><input type="number" min="0" max="100" step="0.01" value={targetWeight} onChange={(event) => setTargetWeight(event.target.value)} className="text-input" /></label>
            <label className="field"><span>PRICE IMPACT / BPS</span><input type="number" min="0" max="10000" step="1" value={impact} onChange={(event) => setImpact(event.target.value)} className="text-input" /></label>
            <label className="field"><span>ROUTE PREFLIGHT</span><select value={preflight} onChange={(event) => setPreflight(event.target.value as typeof preflight)} className="text-input"><option value="NOT_RUN">Not run</option><option value="SUCCESS">Passed (sample)</option><option value="FAILED">Failed (sample)</option></select></label>
          </div>
          <div className="toggle-group"><span className="group-label">SESSION PREFERENCES</span><label><input type="checkbox" checked={allowExtended} onChange={(event) => setAllowExtended(event.target.checked)} />Allow premarket, postmarket, and overnight</label><label><input type="checkbox" checked={allowClosed} onChange={(event) => setAllowClosed(event.target.checked)} />Allow trading while the underlying is closed</label><label><input type="checkbox" checked={paused} onChange={(event) => setPaused(event.target.checked)} />Issuer or market pause reported</label></div>
          <div className="proposal-card"><span className="output-label">01 / AGENT PROPOSAL</span><div className="proposal-title"><strong>{proposal?.side === "HOLD" ? "No rebalance proposed" : proposal ? proposal.side + " $" + (proposal.proposedTradeCents / 100).toFixed(2) + " of " + (ticker || "stock token") : "Invalid sample inputs"}</strong><span>{proposal?.side ?? "—"}</span></div><p>{proposal ? "Current " + (proposal.currentStockWeightBps / 100).toFixed(2) + "% · target " + (proposal.targetStockWeightBps / 100).toFixed(2) + "% · drift " + (proposal.driftBps / 100).toFixed(2) + " points" : "Enter a valid basket value and weights from 0% to 100%."}</p></div>
          <div aria-live="polite" className={"decision-output " + (decision ? actionStyles[decision.action] : "is-block")}><div className="decision-top"><span>02 / POLICY DECISION</span><strong>{decision?.action ?? "INVALID"}</strong></div><h4>{decision?.reason.replaceAll("_", " ") ?? "INVALID SAMPLE INPUT"}</h4><p>{decision ? explanations[decision.reason] : "Enter valid sample inputs."}</p></div>
          <p className="policy-footnote">Sample limits: 3% drift, $10 regular, $3 outside regular hours, $20 daily, 50 bps impact. “TRADE” means eligible to sign; this page never places an order.</p>
        </section>
      </div>

      <footer className="site-footer"><div><span className="footer-icon" aria-hidden="true" /><strong>Bellproof</strong><span> / Tokenized Stocks Products &amp; Agents</span></div><p>Policy first. Proof follows.</p></footer>
    </main>
  );
}
