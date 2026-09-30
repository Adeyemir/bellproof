"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  demoPolicy,
  evaluateDecision,
  type DecisionAction,
  type DecisionReason,
  type MarketSession,
} from "@/lib/session-policy";
import { proposeRebalance } from "@/lib/agent/proposal";
import type { RebalanceProposal } from "@/lib/agent/proposal";
import { assertConnectedWallet, connectBscWallet, readTokenBalances, sendWalletTransaction, waitForReceipt, type WalletReceipt } from "@/lib/wallet-client";
import { evmAddressPattern } from "@/lib/binance/quote-data";

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
  targetAddress: string;
  platformId: string;
  session: MarketSession | "unknown";
  receivedAtMs: number;
  estimatedTtlMs: number;
  routes: Array<{
    quoteId: string;
    vendorName: string;
    executionMode: "RFQ" | "SWAP";
    outputAmount: string;
    outputDecimals: number;
    outputSymbol: string;
    tradeFeeUsd: string | null;
    priceImpactBps: number | null;
  }>;
}

interface PreflightTransaction {
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

interface PreflightResponse {
  decision: { action: "TRADE" | "WAIT" | "BLOCK"; reason: string };
  signingEnabled: boolean;
  approvalAllowed: boolean;
  market: { session: MarketSession | "unknown"; restrictionReason: string | null; observedAtMs: number; nextOpenTimeMs?: number | null };
  quote?: {
    quoteId: string;
    vendorName: string;
    executionMode: "SWAP";
    receivedAtMs: number;
    estimatedExpiryMs: number;
    amountIn: string;
    quotedAmountOut: string;
    minReceiveAmount: string;
    outputSymbol: string;
    outputDecimals: number;
    priceImpactBps: number | null;
    slippagePercent: string;
  };
  execution?: {
    router: string;
    spender: string;
    approval: PreflightTransaction;
    swap: PreflightTransaction;
    nonceSource: string;
  };
  simulations?: {
    approval: { status: string; failReason: string | null; allowanceChanges: unknown[] };
    swap: { status: string; failReason: string | null; balanceChanges: unknown[] };
  };
  wallet?: { usdtBalance: string; usdtAllowance: string; bnbBalance: string; gasPrice: string; observedAtMs: number };
  basket?: { stockValueCents: number; stableValueCents: number; proposal: RebalanceProposal };
  simulationNote?: string;
}

interface EvidenceRecord {
  id: string;
  createdAtMs: number;
  status: "DECIDED" | "APPROVAL_SUBMITTED" | "APPROVED" | "APPROVAL_REVERTED" | "SUBMITTED" | "SETTLED" | "SETTLEMENT_UNVERIFIED" | "REVERTED";
  preflight: PreflightResponse;
  approvalHash?: string;
  swapHash?: string;
  receipt?: WalletReceipt;
  before?: { usdt: string; stock: string; observedAtMs: number };
  after?: { usdt: string; stock: string; observedAtMs: number };
}

const evidenceStorageKey = "bellproof:evidence:v1";

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
  WRONG_CHAIN: "Only BSC mainnet is in scope.",
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

function PreflightPanel({ result, canSign, busy, nowMs, onApprove, onSwap }: {
  result: PreflightResponse;
  canSign: boolean;
  busy: boolean;
  nowMs: number;
  onApprove: () => void;
  onSwap: () => void;
}) {
  const quoteExpired = !!result.quote && nowMs >= result.quote.estimatedExpiryMs;
  function downloadEvidence() {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bellproof-preflight-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="result-card preflight-card">
      <div className="result-top"><strong>Execution preflight</strong><span>FRESH BSC CHECKS</span></div>
      <div className={`preflight-decision ${result.decision.action === "TRADE" ? "is-trade" : result.decision.action === "BLOCK" ? "is-block" : "is-wait"}`}>
        <strong>{result.decision.action}</strong>
        <span>{result.decision.reason.replaceAll("_", " ")}</span>
      </div>
      <p className="result-meta">Session {result.market.session} · restriction {result.market.restrictionReason ?? "none"} · observed {formatTime(result.market.observedAtMs)}</p>
      {result.quote && <div className="preflight-facts">
        <div><span>ROUTE</span><strong>{result.quote.vendorName} / {result.quote.executionMode}</strong></div>
        <div><span>INPUT</span><strong>{formatTokenAmount(result.quote.amountIn, 18)} USDT</strong></div>
        <div><span>QUOTED OUTPUT</span><strong>{formatTokenAmount(result.quote.quotedAmountOut, result.quote.outputDecimals)} {result.quote.outputSymbol}</strong></div>
        <div><span>MINIMUM OUTPUT</span><strong>{formatTokenAmount(result.quote.minReceiveAmount, result.quote.outputDecimals)} {result.quote.outputSymbol}</strong></div>
        <div><span>SLIPPAGE LIMIT</span><strong>{result.quote.slippagePercent}%</strong></div>
        <div><span>ESTIMATED EXPIRY</span><strong>{formatTime(result.quote.estimatedExpiryMs)}</strong></div>
      </div>}
      {result.simulations && <div className="preflight-facts preflight-simulations">
        <div><span>APPROVAL SIMULATION</span><strong className={result.simulations.approval.status === "SUCCESS" ? "sim-success" : "sim-failed"}>{result.simulations.approval.status}</strong><small>{result.simulations.approval.failReason}</small></div>
        <div><span>SWAP SIMULATION</span><strong className={result.simulations.swap.status === "SUCCESS" ? "sim-success" : "sim-failed"}>{result.simulations.swap.status}</strong><small>{result.simulations.swap.failReason}</small></div>
      </div>}
      {result.wallet && <div className="preflight-facts">
        <div><span>WALLET USDT</span><strong>{formatTokenAmount(result.wallet.usdtBalance, 18)} USDT</strong></div>
        <div><span>USDT ALLOWANCE</span><strong>{formatTokenAmount(result.wallet.usdtAllowance, 18)} USDT</strong></div>
        <div><span>GAS BALANCE</span><strong>{formatTokenAmount(result.wallet.bnbBalance, 18)} BNB</strong></div>
        <div><span>WALLET OBSERVED</span><strong>{formatTime(result.wallet.observedAtMs)}</strong></div>
      </div>}
      {result.basket && <p className="result-meta">Basket: {result.basket.proposal.side} ${String((result.basket.proposal.proposedTradeCents / 100).toFixed(2))} proposed · current {(result.basket.proposal.currentStockWeightBps / 100).toFixed(2)}% · target {(result.basket.proposal.targetStockWeightBps / 100).toFixed(2)}%.</p>}
      {result.execution && <>
        <p className="result-meta">Router and approval spender: <code>{result.execution.router}</code>. Approval spender checked against Binance&apos;s exact calldata.</p>
        <details className="preflight-detail"><summary>Approval payload · gas and nonce pending</summary><pre><code>{JSON.stringify(result.execution.approval, null, 2)}</code></pre></details>
        <details className="preflight-detail"><summary>Unsigned swap payload</summary><pre><code>{JSON.stringify(result.execution.swap, null, 2)}</code></pre></details>
        <p className="result-meta">BSC mainnet route verified; nonce: {result.execution.swap.nonce ?? "not supplied by Binance"}. Quote ID: <code>{result.quote?.quoteId}</code></p>
      </>}
      {result.simulationNote && <p className="candidate-warning">{result.simulationNote}</p>}
      {quoteExpired && <p className="candidate-warning">This preflight quote has aged out. Run a fresh check before signing.</p>}
      <div className="preflight-actions">
        {result.approvalAllowed && <button type="button" disabled={!canSign || busy} onClick={onApprove} className="button button-gold">Approve exact USDT amount</button>}
        {result.signingEnabled && <button type="button" disabled={!canSign || busy || !result.quote || quoteExpired} onClick={onSwap} className="button button-dark">Review and sign swap</button>}
        <button type="button" onClick={downloadEvidence} className="button button-quiet">Download evidence JSON</button>
        <span>{canSign ? "A fresh preflight runs again before each wallet prompt." : "Connect the matching BSC wallet to enable signing."}</span>
      </div>
    </div>
  );
}

export function BellproofDashboard() {
  const [ticker, setTicker] = useState("NVDA");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [marketErrorCode, setMarketErrorCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<"live" | "lab">("live");
  const [activeAsset, setActiveAsset] = useState<MarketCandidate | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("10");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [preflightResult, setPreflightResult] = useState<PreflightResponse | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [executionBusy, setExecutionBusy] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<string | null>(null);
  const [viewNowMs, setViewNowMs] = useState(0);
  const [approvalHash, setApprovalHash] = useState<string | null>(null);
  const [evidenceHistory, setEvidenceHistory] = useState<EvidenceRecord[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(localStorage.getItem(evidenceStorageKey) || "[]");
      return Array.isArray(stored) ? stored.slice(0, 10) : [];
    } catch { return []; }
  });
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

  useEffect(() => {
    const timer = window.setInterval(() => setViewNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  function saveEvidence(record: EvidenceRecord) {
    setEvidenceHistory((current) => {
      const updated = [record, ...current.filter((item) => item.id !== record.id)].slice(0, 10);
      try { localStorage.setItem(evidenceStorageKey, JSON.stringify(updated)); } catch { /* Keep the current session usable. */ }
      return updated;
    });
  }

  async function connectWallet() {
    setWalletError(null);
    try {
      const address = await connectBscWallet();
      setConnectedWallet(address);
      setWalletAddress(address);
      setQuote(null);
      setPreflightResult(null);
      setApprovalHash(null);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

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
    setActiveAsset(null);
    setMarketError(null);
    setMarketErrorCode(null);
    setQuote(null);
    setQuoteError(null);
    setPreflightResult(null);
    setPreflightError(null);
    setApprovalHash(null);
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

  function selectAsset(candidate: MarketCandidate) {
    if (activeAsset?.tokenContractAddress.toLowerCase() !== candidate.tokenContractAddress.toLowerCase()) {
      setQuote(null);
      setQuoteError(null);
      setPreflightResult(null);
      setPreflightError(null);
      setPortfolio(null);
      setPortfolioError(null);
      setApprovalHash(null);
      setExecutionStatus(null);
    }
    setActiveAsset(candidate);
    document.getElementById("trade-setup")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function fetchQuote(candidate: MarketCandidate) {
    setQuoteLoading(true);
    setQuote(null);
    setQuoteError(null);
    setPreflightResult(null);
    setPreflightError(null);
    setApprovalHash(null);
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

  async function requestFreshPreflight(): Promise<PreflightResponse> {
    if (!quote) throw new Error("Get a stock route first.");
    const response = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: quote.ticker,
          targetAddress: quote.targetAddress,
          walletAddress: walletAddress.trim(),
          amountCents: Math.round(Number(quoteAmount) * 100),
          targetStockWeightBps: Math.round(Number(liveTargetWeight) * 100),
        }),
      });
    const body: PreflightResponse | { error: string } = await response.json();
    if (!response.ok) throw new Error("error" in body ? body.error : "Preflight failed.");
    setPreflightResult(body as PreflightResponse);
    return body as PreflightResponse;
  }

  async function runPreflight() {
    setPreflightLoading(true);
    setPreflightResult(null);
    setPreflightError(null);
    try {
      const fresh = await requestFreshPreflight();
      saveEvidence({ id: crypto.randomUUID(), createdAtMs: Date.now(), status: "DECIDED", preflight: fresh });
      document.getElementById("live-decision")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setPreflightError(error instanceof Error ? error.message : "The preflight service could not be reached.");
    } finally {
      setPreflightLoading(false);
    }
  }

  async function approveExactAmount() {
    if (!connectedWallet || !quote) return;
    setExecutionBusy(true);
    setExecutionStatus("Refreshing approval checks…");
    setPreflightError(null);
    try {
      await assertConnectedWallet(connectedWallet);
      const fresh = await requestFreshPreflight();
      if (!fresh.approvalAllowed || !fresh.execution || fresh.execution.approval.from.toLowerCase() !== connectedWallet.toLowerCase()) {
        throw new Error(`Approval is unavailable: ${fresh.decision.reason.replaceAll("_", " ")}.`);
      }
      setExecutionStatus("Confirm the exact USDT approval in your wallet…");
      const hash = await sendWalletTransaction(fresh.execution.approval);
      const recordId = crypto.randomUUID();
      saveEvidence({ id: recordId, createdAtMs: Date.now(), status: "APPROVAL_SUBMITTED", preflight: fresh, approvalHash: hash });
      setExecutionStatus(`Approval submitted: ${hash}. Waiting for confirmation…`);
      const receipt = await waitForReceipt(hash);
      const approved = BigInt(receipt.status) === 1n;
      saveEvidence({ id: recordId, createdAtMs: Date.now(), status: approved ? "APPROVED" : "APPROVAL_REVERTED", preflight: fresh, approvalHash: hash, receipt });
      if (!approved) throw new Error(`Approval reverted on BSC: ${hash}`);
      setApprovalHash(hash);
      setExecutionStatus("Approval confirmed. Refreshing the quote, allowance, and swap simulation…");
      await requestFreshPreflight();
      document.getElementById("live-decision")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setExecutionStatus(error instanceof Error ? error.message : "Approval failed.");
    } finally {
      setExecutionBusy(false);
    }
  }

  async function executeSwap() {
    if (!connectedWallet || !quote) return;
    setExecutionBusy(true);
    setExecutionStatus("Reading balances and refreshing the exact swap…");
    setPreflightError(null);
    let record: EvidenceRecord | null = null;
    try {
      await assertConnectedWallet(connectedWallet);
      const before = await readTokenBalances(connectedWallet, quote.targetAddress);
      const fresh = await requestFreshPreflight();
      if (!fresh.signingEnabled || fresh.decision.action !== "TRADE" || !fresh.execution || !fresh.quote ||
          fresh.execution.swap.from.toLowerCase() !== connectedWallet.toLowerCase() ||
          fresh.quote.estimatedExpiryMs - Date.now() < 5_000) {
        throw new Error(`Swap is unavailable: ${fresh.decision.reason.replaceAll("_", " ")}. Refresh and try again.`);
      }
      record = { id: crypto.randomUUID(), createdAtMs: Date.now(), status: "DECIDED", preflight: fresh, before, ...(approvalHash ? { approvalHash } : {}) };
      saveEvidence(record);
      setExecutionStatus("Review the fresh swap in your wallet and confirm it…");
      const hash = await sendWalletTransaction(fresh.execution.swap);
      record = { ...record, status: "SUBMITTED", swapHash: hash };
      saveEvidence(record);
      setExecutionStatus(`Swap submitted: ${hash}. Waiting for BSC confirmation…`);
      const receipt = await waitForReceipt(hash);
      if (BigInt(receipt.status) !== 1n) {
        record = { ...record, status: "REVERTED", receipt };
        saveEvidence(record);
        throw new Error(`Swap reverted on BSC: ${hash}`);
      }
      let after: EvidenceRecord["after"];
      try { after = await readTokenBalances(connectedWallet, quote.targetAddress); } catch { /* Receipt is still recorded. */ }
      const verified = !!after && BigInt(after.usdt) < BigInt(before.usdt) && BigInt(after.stock) > BigInt(before.stock);
      record = { ...record, status: verified ? "SETTLED" : "SETTLEMENT_UNVERIFIED", receipt, ...(after ? { after } : {}) };
      saveEvidence(record);
      setExecutionStatus(verified ? `Settled on BSC: ${hash}. USDT fell and stock-token balance rose.` : `Receipt confirmed: ${hash}. Balance delta could not be verified.`);
      await requestFreshPreflight();
    } catch (error) {
      setExecutionStatus(error instanceof Error ? error.message : "Swap failed.");
    } finally {
      setExecutionBusy(false);
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
          <a href="#workspace" onClick={() => setWorkspaceView("live")}>Live workspace</a>
          <a href="#workspace" onClick={() => setWorkspaceView("lab")}>Policy simulator</a>
        </nav>
        <span className="network-pill"><span className="network-dot" />BSC MAINNET</span>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span /> PROPOSE / VERIFY / EXECUTE / RECORD</p>
          <h1 id="hero-title">Keep your stock basket <em>within policy.</em></h1>
          <p className="hero-description">Bellproof proposes a rebalance from portfolio drift, then verifies whether it can execute. It checks the market session, asset restrictions, route quality, and user limits before any trade.</p>
          <div className="hero-actions">
            <a className="button button-dark" href="#workspace" onClick={() => setWorkspaceView("live")}>Open live workspace <span aria-hidden="true">↗</span></a>
            <a className="text-link" href="#workspace" onClick={() => setWorkspaceView("lab")}>Try the policy simulator <span aria-hidden="true">↗</span></a>
          </div>
          <p className="hero-footnote">SPOT ONLY <span>/</span> BSC CHAIN <span>/</span> WALLET SIGNATURE REQUIRED</p>
        </div>
      </section>

      <div id="workspace" className="workspace-heading">
        <div><span className="section-kicker">THE WORKSPACE</span><h2>{workspaceView === "live" ? "From asset to decision." : "Test the policy."}</h2></div>
        <p>{workspaceView === "live" ? "Live BSC data, wallet checks, and one clear result." : "Sample scenarios. No wallet or transaction required."}</p>
      </div>

      <div className="workspace-switch" aria-label="Workspace view">
        <button type="button" className={workspaceView === "live" ? "is-active" : ""} aria-pressed={workspaceView === "live"} onClick={() => setWorkspaceView("live")}>Live execution</button>
        <button type="button" className={workspaceView === "lab" ? "is-active" : ""} aria-pressed={workspaceView === "lab"} onClick={() => setWorkspaceView("lab")}>Policy simulator <span>Sample inputs</span></button>
      </div>

      <div className="workspace-grid">
        {workspaceView === "live" && <section id="market" className="workspace-panel market-panel" aria-labelledby="market-heading">
          <div className="live-columns">
          <div className="discovery-column">
          <div className="panel-header">
            <div><span className="panel-index">01 / CHOOSE AN ASSET</span><h3 id="market-heading">Find your stock token</h3><p>Check the issuer and market state before requesting a route.</p></div>
            <span className="panel-tag">BINANCE RWA</span>
          </div>
          <form onSubmit={lookUpMarket} className="ticker-form">
            <label htmlFor="ticker">STOCK TICKER</label>
            <div className="ticker-row">
              <input id="ticker" value={ticker} onChange={(event) => { setTicker(event.target.value.toUpperCase()); setActiveAsset(null); setMarket(null); setQuote(null); setPreflightResult(null); setPortfolio(null); }} maxLength={10} placeholder="e.g. NVDA" autoComplete="off" className="text-input ticker-input" />
              <button disabled={loading} type="submit" className="button button-gold">{loading ? "Checking…" : "Check ticker"} <span aria-hidden="true">↗</span></button>
            </div>
          </form>
          <div aria-live="polite" className="market-results">
            {marketError && <div className="message message-error">{marketError}{marketErrorCode === "CREDENTIALS_MISSING" && <p>For local setup, add your Binance Web3 credentials to apps/web/.env.local.</p>}</div>}
            {market && market.candidates.length === 0 && <div className="empty-state"><span>○</span><strong>No supported token found</strong><p>No bStocks or Ondo contract for {ticker.toUpperCase()} was returned on BSC. Try another ticker.</p></div>}
            {market && market.candidates.length > 0 && <div className="candidate-list">
              {market.candidates.map((candidate) => (
                <article key={candidate.platformId + ":" + candidate.tokenContractAddress} className={`candidate-card ${activeAsset?.tokenContractAddress.toLowerCase() === candidate.tokenContractAddress.toLowerCase() ? "is-selected" : ""}`}>
                  <div className="candidate-top"><div><span className="issuer-label">{candidate.platformId.toUpperCase()}</span><h4>{candidate.companyName || candidate.ticker}<small> / {candidate.tokenSymbol}</small></h4></div><span className="session-pill">{candidate.session}</span></div>
                  <p className="candidate-status">Restriction: {candidate.restrictionReason ?? "None reported"} · Underlying {candidate.openState ? "open" : "closed"}</p>
                  <p className="contract-line"><span>BSC CONTRACT</span><code>{candidate.tokenContractAddress}</code></p>
                  {candidate.restrictionMessage && <p className="candidate-warning">{candidate.restrictionMessage}</p>}
                  {candidate.profileUnavailable && <p className="candidate-warning">Issuer profile could not be fetched.</p>}
                  <div className="candidate-actions"><button type="button" onClick={() => selectAsset(candidate)} aria-pressed={activeAsset?.tokenContractAddress.toLowerCase() === candidate.tokenContractAddress.toLowerCase()} className="button button-outline">{activeAsset?.tokenContractAddress.toLowerCase() === candidate.tokenContractAddress.toLowerCase() ? "Selected asset" : "Continue with this asset"}</button></div>
                  <details className="asset-details"><summary>Market and issuer details</summary>
                    <div className="candidate-facts">
                      <div><span>NEXT OPEN</span><strong>{formatTime(candidate.nextOpenTimeMs)}</strong></div>
                      <div><span>TOKEN / SHARE</span><strong>{candidate.tokenToShareRatio ?? "Unavailable"}</strong></div>
                    </div>
                    {candidate.attestations.length > 0 && <div className="attestations">{candidate.attestations.map((link) => <a key={link.label} href={link.url} target="_blank" rel="noreferrer">{link.label.replaceAll(/([A-Z])/g, " $1").trim()} ↗</a>)}</div>}
                  </details>
                </article>
              ))}
              <p className="source-note">Observed {formatTime(market.observedAtMs)}. A fresh quote and route checks are required before execution.</p>
            </div>}
            {!market && !marketError && !loading && <div className="empty-state"><span>↗</span><strong>Start with a ticker</strong><p>Search an equity symbol to see its BSC token, issuer, and market session.</p></div>}
          </div>

          </div>
          <div id="trade-setup" className="wallet-tools">
            <div className="panel-header"><div><span className="panel-index">02 / VERIFY THE ROUTE</span><h3>Check before you sign</h3><p>Select an asset, connect a wallet, then ask Bellproof for a live decision.</p></div></div>
            <div id="live-decision" className={`live-decision ${preflightResult ? `is-${preflightResult.decision.action.toLowerCase()}` : "is-pending"}`} aria-live="polite">
              <span>03 / CURRENT DECISION</span>
              <strong>{preflightResult?.decision.action ?? "NOT CHECKED"}</strong>
              <p>{preflightResult ? preflightResult.decision.reason.replaceAll("_", " ") : "Choose a token and build a fresh route to see what Bellproof allows."}</p>
            </div>
            <div className="active-asset">
              {activeAsset ? <><span>SELECTED TOKEN</span><strong>{activeAsset.tokenSymbol}</strong><small>{activeAsset.platformId.toUpperCase()} · {activeAsset.session} at lookup · {activeAsset.tokenContractAddress.slice(0, 8)}…{activeAsset.tokenContractAddress.slice(-6)}</small></> : <><span>SELECTED TOKEN</span><strong>None yet</strong><small>Choose a stock token from the left.</small></>}
            </div>
            <p className="subsection-description">Connect your wallet for signing, or enter any BSC address for read-only inspection. Bellproof checks the live basket, route, allowance, gas, and simulations before offering a wallet action.</p>
            <div className="wallet-connection"><button type="button" className="button button-dark" onClick={connectWallet}>{connectedWallet ? "Reconnect BSC wallet" : "Connect BSC wallet"}</button>{connectedWallet && <span>Connected: <code>{connectedWallet}</code></span>}</div>
            {walletError && <p className="message message-error">{walletError}</p>}
            <div className="field-grid wallet-fields">
              <label className="field"><span>WALLET ADDRESS</span><input value={walletAddress} onChange={(event) => { setWalletAddress(event.target.value); setQuote(null); setPreflightResult(null); setApprovalHash(null); if (event.target.value.toLowerCase() !== connectedWallet?.toLowerCase()) setConnectedWallet(null); }} placeholder="0x…" autoComplete="off" className="text-input mono-input" /></label>
              <label className="field"><span>USDT QUOTE SIZE</span><input type="number" min="0.01" max="10" step="0.01" value={quoteAmount} onChange={(event) => { setQuoteAmount(event.target.value); setQuote(null); setPreflightResult(null); setApprovalHash(null); }} className="text-input" /></label>
              <label className="field"><span>STOCK TARGET %</span><input type="number" min="0" max="100" step="0.01" value={liveTargetWeight} onChange={(event) => { setLiveTargetWeight(event.target.value); setPreflightResult(null); setPortfolio(null); }} className="text-input" /></label>
            </div>
            <div className="execution-actions">
              <button type="button" disabled={!activeAsset || !evmAddressPattern.test(walletAddress.trim()) || quoteLoading} onClick={() => activeAsset && fetchQuote(activeAsset)} className="button button-gold">{quoteLoading ? "Requesting…" : "Get live routes"}</button>
              <button type="button" disabled={!activeAsset || !evmAddressPattern.test(walletAddress.trim()) || portfolioLoading} onClick={() => activeAsset && fetchPortfolio(activeAsset)} className="button button-quiet">{portfolioLoading ? "Reading…" : "Propose from basket"}</button>
            </div>
            <div aria-live="polite" className="tool-results">
              {quoteError && <p className="message message-error">{quoteError}</p>}
              {quote && <div className="result-card"><div className="result-top"><strong>Live routes / {quote.tokenSymbol}</strong><span>{quote.routes.length} ROUTE(S)</span></div><p className="result-meta">{quote.platformId} · {quote.session} · received {formatTime(quote.receivedAtMs)} · estimated 30-second lifetime</p>{quote.session === "unknown" && <p className="candidate-warning">Binance did not identify this market session. This quote is for inspection; policy blocks execution until the session is verified.</p>}{quote.routes.length === 0 && <p className="candidate-warning">No valid route returned for this amount and wallet.</p>}{quote.routes.map((route) => <div key={route.quoteId} className="route-row"><strong>{route.vendorName} · {route.executionMode} / ≈ {formatTokenAmount(route.outputAmount, route.outputDecimals)} {route.outputSymbol}</strong><p>Impact: {route.priceImpactBps === null ? "Unavailable" : route.priceImpactBps.toFixed(2) + " bps"} · Fee: {route.tradeFeeUsd === null ? "Unavailable" : "$" + route.tradeFeeUsd}</p><code>Quote ID: {route.quoteId}</code></div>)}</div>}
              {quote?.routes.some((route) => route.executionMode === "SWAP") && <button type="button" disabled={preflightLoading} onClick={runPreflight} className="button button-outline">{preflightLoading ? "Simulating…" : "Build and simulate fresh route"}</button>}
              {preflightError && <p className="message message-error">{preflightError}</p>}
              {preflightResult && <PreflightPanel result={preflightResult} canSign={!!connectedWallet && connectedWallet.toLowerCase() === walletAddress.trim().toLowerCase()} busy={executionBusy} nowMs={viewNowMs} onApprove={approveExactAmount} onSwap={executeSwap} />}
              {executionStatus && <p className="message execution-message" aria-live="polite">{executionStatus} {evidenceHistory.length > 0 && <a href="#evidence">View evidence ↓</a>}</p>}
              {portfolioError && <p className="message message-error">{portfolioError}</p>}
              {portfolio && <div className="result-card"><div className="result-top"><strong>Basket proposal / {portfolio.tokenSymbol}</strong><span>LIVE WALLET READ</span></div><p className="result-meta">Stock {"$"}{(portfolio.stockValueCents / 100).toFixed(2)} · USDT {"$"}{(portfolio.stableValueCents / 100).toFixed(2)} · target {(portfolio.proposal.targetStockWeightBps / 100).toFixed(2)}%</p><p className="result-emphasis">{portfolio.proposal.side === "HOLD" ? "HOLD" : portfolio.proposal.side + " ≈ $" + (portfolio.proposal.proposedTradeCents / 100).toFixed(2)} <span>/ {portfolio.proposal.reason.replaceAll("_", " ")}</span></p><p className="result-meta">Valued with {portfolio.valuationSource} at {formatTime(portfolio.observedAtMs)}. A fresh route and policy review are still required.</p></div>}
            </div>
          </div>
          </div>
          {evidenceHistory.length > 0 && <div id="evidence" className="evidence-journal"><div className="subsection-header"><div><span className="section-kicker">RECORD</span><h4>Decision evidence</h4></div><span className="read-only-pill">THIS BROWSER</span></div><p className="subsection-description">Recent records stay in this browser. Open or download a record to inspect its preflight, transaction hash, receipt, and balance delta.</p>{evidenceHistory.map((record) => <details key={record.id} className="preflight-detail"><summary>{record.status} · {record.preflight.decision.action} · {formatTime(record.createdAtMs)} {record.swapHash ? `· ${record.swapHash.slice(0, 10)}…` : ""}</summary>{record.swapHash && <p className="result-meta"><a href={`https://bscscan.com/tx/${record.swapHash}`} target="_blank" rel="noreferrer">View BSC transaction ↗</a></p>}<pre><code>{JSON.stringify(record, null, 2)}</code></pre></details>)}</div>}
        </section>}

        {workspaceView === "lab" && <section id="policy" className="workspace-panel policy-panel" aria-labelledby="policy-heading">
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
          <p className="policy-footnote">Sample limits: 3% drift, $10 regular, $3 outside regular hours, $20 daily, 50 bps impact. This policy lab uses sample inputs; live execution uses a fresh basket and connected wallet.</p>
        </section>}
      </div>

      <footer className="site-footer"><div><span className="footer-icon" aria-hidden="true" /><strong>Bellproof</strong><span> / Tokenized Stocks Products &amp; Agents</span></div><p>Policy first. Proof follows.</p></footer>
    </main>
  );
}
