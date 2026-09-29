# Bellproof

**A policy-controlled execution agent for tokenized stocks on BNB Smart Chain.**

Bellproof keeps a user-defined stock-token basket within policy. It proposes a rebalance from wallet holdings, checks whether the trade is actually executable, and records why it traded, waited, or blocked. The execution and decision-journal stages are still being built.

> Working name and prototype, 29 September 2026. API credentials are configured locally, but the current environment cannot resolve the Binance API host, so no signed upstream response or mainnet trade has been verified. The name is not a claim of domain or trademark availability.

## Why build this

Tokenized stocks can be traded on-chain while the underlying equity market is closed. A routine rebalance can then meet a thin route, a paused asset, or a quote that expires before execution. The useful agent is one that knows the session, checks the actual route, and declines bad execution within a user-defined policy.

Bellproof's proposed edge is **a narrow rebalance job with a hard execution policy and an inspectable decision record**. Market session is one input to that policy.

## Hackathon fit

- **Track:** Tokenized Stocks Products & Agents.
- **Chain:** BSC mainnet, chain ID `56`; spot only.
- **Core assets:** bStocks or Ondo tokenized stocks. Compare both only when the same underlying ticker is actually available and executable on BSC.
- **Required stack:** Binance Web3 API. The current server paths use RWA Data, Wallet, and Trading APIs; Transaction API belongs in the approval-simulation stage. Binance Agentic Wallet is the candidate bounded execution adapter.
- **Deliverables:** working app, public repository, deployed link or judge-ready instructions, and a firsthand Developer Experience Report. A video of at most four minutes is strongly recommended.
- **Deadline:** 11 October 2026, 12:00 UTC (13:00 Lagos).

Source: [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks).

## The first judge-ready flow

1. The job is “keep this basket within my policy.” A user sets a stock target, drift threshold, allowed sessions, and trade limits.
2. The agent observes BSC wallet balances and the actual bStocks/Ondo token, then proposes `BUY`, `SELL`, or `HOLD` from allocation drift. It cannot grant itself execution permission.
3. Bellproof checks the underlying session and issuer restriction, fetches a fresh executable quote for the proposed side and size, and applies deterministic limits. The outcome is `TRADE`, `WAIT`, or `BLOCK` with a reason code.
4. For an equity RFQ, the execution layer builds and simulates any approval transaction, validates the EIP-712 order, then asks for a user signature. A bounded Binance Agentic Wallet route is evaluated through the same policy gate, subject to its App-configured rules and confirmation flow.
5. Bellproof checks order status and settled balances before recording a completed trade. A submitted order is not recorded as a settled trade.

See [PRD](docs/PRD.md), [architecture](docs/ARCHITECTURE.md), [competition plan](docs/WIN_PLAN.md), [implementation backlog](docs/BUILD_BACKLOG.md), [Agentic Wallet feasibility gate](docs/AGENTIC_WALLET_GATE.md), and the [firsthand developer log template](docs/DX_LOG.md).

## Scope boundaries

- A closed underlying market is a **risk state**, not proof that the on-chain token cannot trade. Bellproof checks token restrictions and a live quote separately.
- Binance's documented `referencePrice` is derived from the on-chain token price. It is **not** an independent traditional-market quote. Bellproof will not claim a stock-versus-token premium from that field.
- No profit promise, price prediction, leverage, perpetuals, or autonomous mainnet spending before an execution method with enforceable user limits is verified.
- The proposal and policy engines are deterministic and auditable. A language model may explain a completed decision later; it cannot override risk checks or authorize a trade.

Sources: [RWA Data API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data), [Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api), [Transaction API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api).

## Run the prototype

```bash
cd apps/web
npm install
cp .env.example .env.local
# Add your Binance Web3 API key and secret to .env.local
npm run dev
```

Open `http://localhost:3000`. Ticker lookup, wallet-balance proposal, and RFQ preview call the Binance Web3 API from the server. The policy lab uses labelled sample inputs and sends no transaction. Run `npm test`, `npm run lint`, and `npm run build` from `apps/web` to verify the code.

## Current status

The dashboard, signed API client, BSC RWA discovery with issuer profile and attestation links, read-only wallet-balance proposal, RFQ quote preview, and deterministic session policy are implemented. Credentials are configured in an ignored local env file, but a live API response has **not** yet been observed: this development environment could not resolve `web3.binance.com` on repeated attempts. There is no wallet signing or live trade yet. No API keys or wallet secrets belong in this repository.
