# Implementation backlog

This is the build order for the 11 October submission. Each ticket has a visible acceptance result. Estimates are planning ranges for one focused builder, not commitments; parallelize only when two people can work without blocking each other.

## Gate 0: prove the data and route

| Ticket | Implementation | Acceptance | Estimate |
| --- | --- | --- | ---: |
| B01 | Register for the event and create Binance Web3 API credentials. Start the firsthand DX log with timestamps. | Credentials are available to the server environment; no secret appears in source control or logs. | 1–3 h, subject to account access |
| B02 | Build a small server-only API client with the exact signed `/build` request path, raw query ordering, timestamp, and typed error handling. | Successful signed RWA platform and token search calls; 401 and 429 cases recorded without leaking secrets. | 3–5 h |
| B03 | Discover candidate BSC bStocks/Ondo tokens, query a real BSC wallet balance, and request small USDT-to-token routes. Measure quote latency, expiry, and output. | Live NVDAon and NVDAB `SWAP` quotes and unsigned builds were verified on 30 September. A funded wallet balance and real quote expiry measurement remain open. | 3–6 h |

**Gate result, 30 September:** both NVDAon and NVDAB produced live BSC routes. They are `SWAP` routes, despite the published Trading API description that equity routes always return `RFQ`. Build and test the observed mode first; keep execution disabled until simulation and wallet checks pass.

## Gate 1: make the agent's decision useful

| Ticket | Implementation | Acceptance | Estimate |
| --- | --- | --- | ---: |
| B04 | Implement typed market-session and restriction parser from RWA `statusInfo`. Include `nextOpenTime` and source freshness. | `regular`, extended, closed, pause, maintenance, and unknown data map to distinct policy states. | 4–6 h |
| B05 | Implement pure policy evaluator for target drift, enabled sessions, trade caps, daily budget, cooldown, slippage, quote impact, route availability, and stale data. | Same input always yields the same `TRADE`/`WAIT`/`BLOCK` action and ordered reason codes; no execution method is available inside the evaluator. | 6–10 h |
| B05a | Propose `BUY`, `SELL`, or `HOLD` from observed stock/USDT balances and a target weight. Keep this stage unable to submit orders. | Real-address holdings drive a proposal with explicit drift and size; malformed or risk-flagged balances fail closed. Pure proposal and valuation tests pass; live API response remains to be verified. | 3–5 h |
| B06 | Persist observations and decisions, including rejected alternatives and policy version. Build a read-only decision URL. | Judge can inspect one live decision and one clearly labelled historical/replay case without wallet access. | 6–10 h |
| B07 | Build a minimal dashboard: session state, next open, selected ticker/issuer, basket drift, limits, latest quote, and decision. | A new visitor understands why the agent acted or waited in under 30 seconds. | 8–12 h |

## Gate 2: prove execution on BSC

| Ticket | Implementation | Acceptance | Estimate |
| --- | --- | --- | ---: |
| B08 | Build a `SWAP` transaction from a fresh quote and an exact-amount approval if needed; verify chain, sender, token pair, recipient/router, spender, amount, minimum output, slippage, and expiry. The read-only Binance build call is verified; app validation remains. | Displayed transaction and approval fields match what the wallet signs. | 6–10 h |
| B09 | Simulate approval and swap transactions with the Binance Transaction API before signing. | Failed simulation or transaction-field mismatch blocks the action and appears in the decision record. | 4–6 h |
| B10 | Connect a BSC wallet for owner-signed P0 `SWAP` execution; verify receipt, settlement transaction, and balance change. Add an RFQ adapter only if a live route returns that mode. | One small spot mainnet trade links to its pre-trade decision and settlement evidence. | 8–12 h plus wallet funding |
| B11 | Add scheduler idempotency and a final status/quote/cap check before execution. | Retry cannot duplicate a trade; session change, expired quote, or pause blocks execution. | 5–8 h |

## Gate 3: differentiation and submission

| Ticket | Implementation | Acceptance | Estimate |
| --- | --- | --- | ---: |
| B12 | Compare two issuers only if both have same-ticker BSC tokens and live quotes; normalize approximate share exposure and show disclosures. | The chosen route, rejected route, ratio, fee, and issuer facts are visible; no legal equivalence claim. | 6–10 h, conditional |
| B13 | In parallel with the owner-signed RFQ path, install and sign in to Binance Agentic Wallet, verify BSC stock quote/swap support, App-configured token and daily limits, any confirmation step, and final order polling. Add it only as an adapter behind the same Bellproof policy gate. | One bounded order reaches a final verified status and is recorded; otherwise remove this branch by 8 October. The Binance account owner must complete App pairing and rules. | 4–12 h feasibility gate |
| B14 | Write the report from firsthand DX entries, record the demo, deploy, publish the allowed source, and rehearse the judge flow. | Public repo, live link, ≤4-minute video, report, and clean-browser run are complete by 10 October. | 10–16 h |

## Meaningful verification

- Unit checks for the pure policy evaluator: regular session, ordinary closure, explicit outside-hours opt-in, corporate-action pause, stale/expired quote, cap breach, and no route.
- Integration check of Binance signing using the actual raw URL and body. Record request IDs and redacted error responses.
- `SWAP` transaction check against a small live amount on BSC mainnet, followed by settlement receipt and balance verification.
- Replay a saved observation through the same decision engine and verify the action/reason codes match. Label replay data clearly.
- Manual clean-browser judge rehearsal: start at the public landing page, inspect a decision, connect wallet, quote, review approval and swap simulation, sign, inspect receipt and BscScan.

## Tasks that need human participation

- Binance event registration, API project creation, and any required account verification.
- Wallet funding and signing of the first small mainnet transaction.
- Firsthand DX observations and final report prose.
- Approval of the public submission repository contents and final submission.

Source references: [hackathon](https://www.bnbchain.org/en/hackathons/tokenized-stocks), [Binance authentication](https://web3.binance.com/en/dev-docs/authentication), [RWA Data](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data), [Trading](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api), [Transaction](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api).
