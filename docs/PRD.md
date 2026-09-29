# Product requirements: Bellproof

**Version:** 0.1 planning draft, 29 September 2026

**Product:** session-aware execution agent for BSC tokenized stocks

**Submission target:** BNB Hack: Tokenized Stocks Edition, 11 October 2026

## Product thesis

People can buy stock tokens on-chain at times when the underlying market is closed, but a scheduled rebalance does not tell them whether the token is halted, the route is thin, or the quoted outcome violates their limits. Bellproof turns a basket instruction into a traceable decision: trade at a bounded cost, wait for a better session or route, or block an unsafe action.

**One-line promise:** “Your stock-token agent knows when to trade and when to wait.”

## Target user and job

The initial user is a BSC wallet holder who wants a small, rules-based allocation to one or two tokenized stocks. They want the agent to watch continuously and act only within limits they understand. They should be able to tell, in under 30 seconds, what Bellproof decided, why, and what happened on-chain.

This is an execution and monitoring tool, not a source of investment recommendations or a price-prediction product.

## Success criteria for the hackathon

1. A judge can open a deployed app without credentials and inspect a real, timestamped decision from BSC market data.
2. A connected wallet can set a basket and limits, receive a real BSC RFQ quote, review route-specific preflight, and complete one small spot trade on mainnet.
3. The app can demonstrate `TRADE`, `WAIT`, and `BLOCK` outcomes with distinct, reproducible reason codes. Historical or fixture examples are clearly labelled; the live path never substitutes fixtures for current data.
4. Every completed trade has a BscScan link, receipt verification, and the corresponding pre-trade decision record.
5. The project includes a firsthand Developer Experience Report with measured API onboarding, failures, latency, and tokenized-stock observations.

## P0 requirements: must work before adding extras

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| P0-1 | Discover bStocks or Ondo assets on BSC by ticker and verify chain ID `56` and contract address. | Live API response with at least one supported token. |
| P0-2 | Classify `premarket`, `regular`, `postmarket`, `overnight`, `closed`, and `pause` using Binance RWA `statusInfo`; show `nextOpenTime` and reason. | UI shows source timestamp and correct state from live data. |
| P0-3 | Distinguish ordinary market closure from asset/market pause or corporate action. | `ASSET_PAUSED`, `MARKET_PAUSED`, maintenance, and unsupported states always block execution. |
| P0-4 | Obtain a fresh executable quote and report output amount, route, price impact if supplied, estimated fee, quote age, and expiry. | Quote refreshes before transaction build; expired quote never executes. |
| P0-5 | Apply user-set caps: allowlist, max per trade, max daily spend, slippage, quote impact, cooldown, and outside-hours opt-in. | Policy returns stable reason codes; at least one blocked case shown. |
| P0-6 | Build and simulate any required approval transaction; verify the RFQ typed order against the quote and policy before signing. | Approval simulation and RFQ order checks appear beside the proposed action. |
| P0-7 | User signs the approval if needed and the RFQ EIP-712 order; verify order status and settled balances. | Small BSC mainnet order with transaction/explorer evidence when settled. |
| P0-8 | Record every decision, including no-trade decisions, with input timestamps, source, policy version, alternatives, and result. | Public read-only decision page works for judges. |

## P1 requirements: add only after the P0 live path works

| ID | Requirement | Go/no-go condition |
| --- | --- | --- |
| P1-1 | Compare bStocks and Ondo representations of one underlying ticker by **executable cost per approximate share exposure**, incorporating `tokenToShareRatio`, quote output, fees, issuer disclosures, and user preference. Show each token's issuer and available attestation links; do not present the tokens as legally interchangeable. | Both issuer tokens and routes exist on BSC for the selected ticker. |
| P1-2 | Rebalance a two-asset basket when allocation drift exceeds a chosen threshold. | Token balance and quote data are reliable for both assets. |
| P1-3 | Add Binance Agentic Wallet as an execution adapter and show its enforced daily/token limits. | Wallet setup and programmatic workflow succeed with the team's own account; no bypass of app-side confirmation rules. |
| P1-4 | Send a concise alert or approval request when a decision changes. | Core decision record and execution path are stable. |

## P2 ideas: omit unless all P0/P1 evidence is complete

BNB Agent Studio hosting/identity, Telegram, natural-language strategy editing, paid data feeds, baskets of more than two stocks, and independent traditional-market pricing. No feature enters the demo solely because it adds a sponsor logo.

## Session policy, version 1

The agent observes all day. It decides whether execution is allowed from **both** the underlying session and the token's actual trading route.

| State | Default action | Conditions to trade |
| --- | --- | --- |
| `regular` | Consider a drift-triggered rebalance. | Fresh quote, user caps, route-specific preflight success. |
| `premarket`, `postmarket`, `overnight` | Wait by default. | Explicit outside-hours opt-in, smaller cap, tighter slippage and impact limits, fresh quote, route-specific preflight success. |
| `closed` from weekend/holiday | Monitor, log, and queue. | Explicit weekend opt-in and the same stricter checks; otherwise wait until `nextOpenTime`. |
| `pause`, `ASSET_PAUSED`, `MARKET_PAUSED`, maintenance, unsupported | Block. | Never execute until a later fresh status is clear. |

Proposed demo defaults, **not universal safe values**: $10 maximum regular-session trade, $3 outside-hours trade, 0.5% maximum slippage, 0.5% maximum quote impact, and one-hour cooldown. Validate these against actual BSC routes; if they make every trade impossible, show that honestly and adjust only with visible user consent.

## Decision output contract

Each run returns one of `TRADE`, `WAIT`, `BLOCK` plus reason codes such as `DRIFT_BELOW_THRESHOLD`, `CLOSED_HOURS_OPT_OUT`, `ASSET_RESTRICTED`, `NO_ROUTE`, `QUOTE_EXPIRED`, `SLIPPAGE_CAP`, `DAILY_CAP`, `PREFLIGHT_FAILED`, or `READY_TO_SIGN`. The app shows the data and thresholds behind each code. A language model can rephrase the explanation but cannot change the action.

## User journey

1. **Explore:** view the live session board and public sample decisions without connecting a wallet.
2. **Set policy:** connect wallet, pick one or two stocks, target weights, and bounded trading preferences.
3. **Watch:** see current session, next open, basket drift, quote state, and agent status.
4. **Review:** inspect the proposed action, rejected alternatives, limits, approval simulation if required, RFQ typed order, and issuer details.
5. **Act:** sign or decline the initial approval and RFQ order. Later, an optional Agentic Wallet mode may allow bounded execution.
6. **Audit:** inspect the decision and transaction receipt together.

## Non-goals and constraints

- BSC mainnet and spot only; at least one of bStocks or Ondo is central.
- The Binance Web3 API key and signing secret remain server-side. The browser never receives them.
- `referencePrice` in the Binance RWA docs is derived from on-chain token price and cannot serve as an independent exchange-price benchmark.
- We do not score success by PnL. The hackathon explicitly judges agent quality rather than realized returns.
- Token availability, live route quality, and Agentic Wallet usability are empirical gates, not assumptions.
- This PRD is not the required firsthand Developer Experience Report.

## Sources

- [Hackathon rules, judging weights, and deliverables](https://www.bnbchain.org/en/hackathons/tokenized-stocks)
- [Binance RWA Data API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data)
- [Binance Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api)
- [Binance Transaction API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api)
- [Binance Agentic Wallet overview](https://developers.binance.com/en/docs/products/agentic-wallet/welcome)
