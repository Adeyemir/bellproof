# Competition plan and delivery gates

**Working score:** **8/10 for the concept**, conditional on real API and BSC execution evidence. This is a subjective assessment of fit, not a probability of winning. A polished mockup with no live trade would fall below 5/10. A traceable live flow, original session policy, and exceptional firsthand DX report could plausibly reach 9/10; judges decide the actual score.

## Why this has a chance

The hackathon scores technical implementation **30%**, creativity **25%**, Developer Experience Report **25%**, and product/UX **20%**. It explicitly mentions baskets and rebalancers, so those alone are ordinary. Bellproof's competitive claim is the combination of **session-aware risk policy**, **issuer/route-aware execution when data permits**, **route-specific preflight**, and **auditable no-trade decisions**. [Official judging criteria](https://www.bnbchain.org/en/hackathons/tokenized-stocks).

| Feature | Strategic value /10 | Priority | Proof required |
| --- | ---: | --- | --- |
| Session-aware `TRADE` / `WAIT` / `BLOCK` engine | 9 | P0 | Live status from RWA API; reproducible closure and halt cases. |
| Quote and RFQ preflight guard | 9 | P0 | Real quote, verified EIP-712 order, approval simulation if needed, one small settled trade. |
| Decision journal including rejected alternatives | 9 | P0 | Public decision page ties inputs to policy version, action, and receipt. |
| Two-issuer effective-exposure comparison | 8 | P1 | Same ticker on both issuers, usable live routes, ratio-adjusted calculation. |
| Binance Agentic Wallet execution | 7 | P1 | Working account and rule-constrained transaction; otherwise omit. |
| BNB Agent Studio / b402 monetization | 4 | P2 | Only if the core is finished and a genuine user need is proven. |
| Independent stock-versus-token premium signal | 3 now | P2 | Requires a separate trustworthy market data source; Binance `referencePrice` is derived from on-chain price. |

These are prioritization scores based on the published criteria and implementation risk, not measured outcomes.

## Twelve-day sequence

| Date (UTC) | Deliverable | Gate to continue |
| --- | --- | --- |
| 29–30 Sep | Register, request Binance Web3 credentials, save exact onboarding observations, call RWA search/status and Trading quote for one BSC stock token. | Real signed response and executable route. |
| 1–3 Oct | Build token catalog, session classifier, policy evaluator, quote comparison, and decision journal. | Three honest decision examples: trade-ready, wait, block. |
| 4–6 Oct | Wallet connect, RFQ order construction, approval simulation, mainnet trade, order/receipt verification. | One small successful spot trade and one intentionally blocked trade. |
| 7–8 Oct | Add second issuer only if live paired routes exist; evaluate Agentic Wallet path. | P1 feature must improve the demo without destabilizing P0. |
| 9 Oct | UI polish, deployment, failure handling, firsthand DX report from logs. | Judge can reproduce without handholding. |
| 10 Oct | Record video under four minutes, publish submission repository, verify deployed link and all source links. | Full rehearsal on a clean browser and wallet. |
| 11 Oct before 12:00 | Submit. | Allow buffer; do not rely on a last-minute transaction. |

## Hard go/no-go rules

1. **No usable BSC stock route by 30 Sep:** ask organizers for supported token/route guidance; build a read-only session and quote monitor while investigating. Do not pretend a fixture is live.
2. **No two issuer routes by 3 Oct:** keep one issuer central. The session and execution quality story remains strong.
3. **No working Agentic Wallet integration by 8 Oct:** stop that branch. Ship reliable user-signed execution and make no special-prize claim.
4. **No independent traditional-market price feed:** remove all premium/arbitrage language. Document the Binance `referencePrice` limitation as a concrete DX finding.
5. **Any live quote exceeds user limits:** show the wait decision. Do not loosen limits merely to produce a demo trade.

## Four-minute demo outline

1. **0:00–0:25 — Problem:** show the closed underlying session beside an active on-chain market. State why a naive scheduled rebalance can be costly.
2. **0:25–1:05 — Policy:** set a basket and clear per-trade, session, and slippage limits.
3. **1:05–1:50 — Live observation:** show current status, token contract/issuer, quote, and a `WAIT` or `BLOCK` reason. Label any historical case.
4. **1:50–2:55 — Execution:** show a fresh RFQ quote, route-specific preflight, wallet signature, order status, BSC settlement hash, and verified balance change.
5. **2:55–3:35 — Audit:** open the decision record and its rejected alternatives; show that the trade and no-trade decisions are inspectable.
6. **3:35–4:00 — DX finding:** present one real API pitfall, its exact endpoint, and a proposed documentation fix.

## DX report plan

The organizer says perfunctory or AI-generated DX reports are not accepted. The team must write its own observations from actual calls and trades. Capture first-call time, endpoints, request/response timestamps, error codes, quote latency/expiry, failed routes, status behavior, RFQ/approval pitfalls, slippage, and the `referencePrice` ambiguity as observed. The [DX log template](DX_LOG.md) is a recording tool, not a report or substitute for firsthand findings.

## Evidence package for judges

- Deployed read-only dashboard and working wallet flow.
- Public repository with setup instructions and source links.
- One small settled BSC mainnet RFQ order and one blocked decision with reason codes.
- Reproducible status/quote/transaction response samples with secrets removed.
- Video under four minutes.
- Human-authored DX report based on the team's own dated log.

Source: [official hackathon page](https://www.bnbchain.org/en/hackathons/tokenized-stocks).
