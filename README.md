# Bellproof

**A session-aware execution agent for tokenized stocks on BNB Smart Chain.**

Bellproof keeps a user-defined stock-token basket on plan. Before any rebalance, it checks the underlying market session, issuer and asset restrictions, executable BSC quotes, user limits, and transaction simulation. It records a clear reason when it trades **and** when it waits.

> Working name and planning repository, 29 September 2026. No trading app or live strategy is implemented yet. The name is not a claim of domain or trademark availability.

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
5. Bellproof builds and simulates the transaction, then asks the user to sign the initial mainnet trade. Autonomous execution via Binance Agentic Wallet is a later, separately gated integration.
6. The decision page shows inputs, rejected alternatives, simulation result, and the transaction hash if a trade completes.

See [PRD](docs/PRD.md), [architecture](docs/ARCHITECTURE.md), [competition plan](docs/WIN_PLAN.md), [implementation backlog](docs/BUILD_BACKLOG.md), and the [firsthand developer log template](docs/DX_LOG.md).

## Scope boundaries

- A closed underlying market is a **risk state**, not proof that the on-chain token cannot trade. Bellproof checks token restrictions and a live quote separately.
- Binance's documented `referencePrice` is derived from the on-chain token price. It is **not** an independent traditional-market quote. Bellproof will not claim a stock-versus-token premium from that field.
- No profit promise, price prediction, leverage, perpetuals, or autonomous mainnet spending before an execution method with enforceable user limits is verified.
- The initial rules engine is deterministic and auditable. A language model may explain a completed decision later; it cannot override risk checks or authorize a trade.

Sources: [RWA Data API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data), [Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api), [Transaction API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api).

## Current status

Planning complete. The next gate is a signed Binance Web3 API call and a real BSC quote for a supported stock token. No API keys or wallet secrets belong in this repository.
