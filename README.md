# Bellproof

**A session-aware execution agent for tokenized stocks on BNB Smart Chain.**

Bellproof keeps a user-defined stock-token basket on plan. Before any rebalance, it checks the underlying market session, issuer and asset restrictions, executable BSC quotes, user limits, and route-specific preflight. It records a clear reason when it trades **and** when it waits.

> Working name and prototype, 29 September 2026. The live RFQ path still needs API credentials and a user-signed mainnet proof. The name is not a claim of domain or trademark availability.

## Why build this

Tokenized stocks can be traded on-chain while the underlying equity market is closed. A routine rebalance can then meet a thin route, a paused asset, or a quote that expires before execution. The useful agent is one that knows the session, checks the actual route, and declines bad execution within a user-defined policy.

Bellproof's proposed edge is **session-aware execution with an inspectable decision record**, rather than a claim to predict stock prices or manufacture arbitrage.

## Hackathon fit

- **Track:** Tokenized Stocks Products & Agents.
- **Chain:** BSC mainnet, chain ID `56`; spot only.
- **Core assets:** bStocks or Ondo tokenized stocks. Compare both only when the same underlying ticker is actually available and executable on BSC.
- **Required stack:** Binance Web3 API. The first integration uses RWA Data, Trading, and Transaction APIs.
- **Deliverables:** working app, public repository, deployed link or judge-ready instructions, and a firsthand Developer Experience Report. A video of at most four minutes is strongly recommended.
- **Deadline:** 11 October 2026, 12:00 UTC (13:00 Lagos).

Source: [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks).

## The first judge-ready flow

1. A user chooses a small basket and sets limits, including whether any trades are allowed outside regular market hours.
2. Bellproof discovers the actual BSC token contract and reads the underlying market session and restriction reason.
3. It requests a fresh swap quote for a small rebalance. Where two issuers are available, it compares effective exposure using each token's `tokenToShareRatio` and the executable quote.
4. The policy returns `TRADE`, `WAIT`, or `BLOCK`, with reason codes. A halt or corporate-action pause blocks execution.
5. For a tokenized-equity RFQ, Bellproof builds the vendor-specific approval if needed, simulates that on-chain transaction, checks the EIP-712 order contents, and asks the user to sign. The order is then submitted and its settled status checked. Autonomous execution via Binance Agentic Wallet is a later, separately gated integration.
6. The decision page shows inputs, rejected alternatives, preflight result, and the order/transaction evidence if a trade completes.

See [PRD](docs/PRD.md), [architecture](docs/ARCHITECTURE.md), [competition plan](docs/WIN_PLAN.md), [implementation backlog](docs/BUILD_BACKLOG.md), and the [firsthand developer log template](docs/DX_LOG.md).

## Scope boundaries

- A closed underlying market is a **risk state**, not proof that the on-chain token cannot trade. Bellproof checks token restrictions and a live quote separately.
- Binance's documented `referencePrice` is derived from the on-chain token price. It is **not** an independent traditional-market quote. Bellproof will not claim a stock-versus-token premium from that field.
- No profit promise, price prediction, leverage, perpetuals, or autonomous mainnet spending before an execution method with enforceable user limits is verified.
- The initial rules engine is deterministic and auditable. A language model may explain a completed decision later; it cannot override risk checks or authorize a trade.

Sources: [RWA Data API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data), [Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api), [Transaction API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api).

## Run the prototype

```bash
cd apps/web
npm install
cp .env.example .env.local
# Add your Binance Web3 API key and secret to .env.local
npm run dev
```

Open `http://localhost:3000`. Ticker lookup and RFQ preview call the Binance Web3 API from the server. The policy lab uses labelled sample inputs and sends no transaction. Run `npm test`, `npm run lint`, and `npm run build` from `apps/web` to verify the code.

## Current status

The dashboard, signed API client, BSC RWA discovery with issuer profile and attestation links, RFQ quote preview, and deterministic session policy are implemented. Credentials are configured in an ignored local env file, but a live API response has **not** yet been observed: this development environment could not resolve `web3.binance.com` on the first attempt. There is no wallet signing or live trade yet. No API keys or wallet secrets belong in this repository.
