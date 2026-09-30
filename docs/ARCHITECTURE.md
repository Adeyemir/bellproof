# Bellproof architecture

**Status:** implementation plan, updated 30 September 2026. The dashboard, signed client, market and issuer-profile lookup, wallet-balance proposal, route preview, and pure policy engine exist. Live Binance calls returned BSC NVDAon and NVDAB `SWAP` quotes and unsigned swap calldata. Transaction simulation, persistence, and execution remain planned. The development network's default DNS still fails; an opt-in resolver setting enabled the verified calls.

## Design rule

Give the agent one job: **keep this basket within my policy**. Its proposal can come from observed drift; only the deterministic policy can mark it eligible for execution. Any autonomous executor must also enforce the user's limits outside the language model.

```mermaid
flowchart LR
  UI[Web app: policy, session board, decision record] --> API[Server API]
  API --> DB[(Decisions and policies)]
  API --> RWA[Binance RWA Data API]
  API --> WALLET[Binance Wallet API]
  API --> QUOTE[Binance Trading API]
  API --> TX[Binance Transaction API]
  WORKER[Scheduled agent run] --> API
  WALLET --> PROPOSAL[Rebalance proposal]
  RWA --> PROPOSAL
  PROPOSAL --> POLICY[Deterministic policy engine]
  QUOTE --> POLICY
  POLICY --> EXEC[Execution adapter]
  EXEC --> USER[User wallet signature: P0]
  EXEC --> BAW[Binance Agentic Wallet: gated adapter]
  USER --> BSC[BSC mainnet]
  BAW --> BSC
  BSC --> API
```

## Proposed stack

- **App:** Next.js and TypeScript for the public dashboard, authenticated policy editor, and server API.
- **Wallet:** a standard BSC wallet connector for P0 owner-signed transactions. Keep wallet code behind an adapter to allow Agentic Wallet later.
- **State:** a small relational database for policies, decision snapshots, and receipt references. Never store wallet private keys.
- **Scheduler:** one persistent job process or managed cron trigger that invokes the same decision service used by the UI. The job must be idempotent by policy, asset, and observation window.
- **Data:** Binance Web3 RWA, Trading, Transaction, and Wallet APIs. A server-only client signs each request with the exact `/build` path and raw query/body bytes used on the wire.

No infrastructure provider or AI model is committed at the planning stage. A language model is optional for readable summaries after the policy outcome is fixed.

## Decision pipeline

```text
observe wallet and target weights
  -> resolve the BSC token and issuer
  -> read market status and restriction reason
  -> propose BUY, SELL, or HOLD from allocation drift
  -> request a fresh quote for the proposed side and size
  -> apply the deterministic policy to status, quote, limits, and preflight
  -> WAIT or BLOCK with evidence, or prepare route-specific execution
  -> for SWAP: validate unsigned swap calldata; simulate swap and exact approval if needed
  -> for RFQ, only if observed: validate typed order and simulate approval if needed
  -> recheck quote age, status, and remaining caps
  -> request user signature or bounded Agentic Wallet execution when verified
  -> submit the route-specific order and verify final status, receipt, and balances
  -> append immutable decision/result record
```

The order matters. A quote is not an authorization. Simulation is not settlement. Every state change is saved with timestamps so the judge can see where a decision stopped.

The Agentic Wallet path is a separate adapter: use its BSC quote, swap, and order-status flow only after checking the same policy and its Binance App security rules. Its returned `orderId` means submission, not completion; poll until a final state and record the actual transaction hash and balances. This path must not be presented as the same RFQ EIP-712 flow until a live stock route proves it. [Agentic Wallet stock-trading guide](https://developers.binance.com/en/docs/products/agentic-wallet/use-cases/trading/stock-trading), [market-order reference](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/market-order.md).

## External API mapping

| Product need | Binance endpoint family | Notes |
| --- | --- | --- |
| Find same-ticker assets and issuer | RWA search, token list, underlying profile | Filter chain `56`; retain contract, issuer, decimals, `tokenToShareRatio`, and attestation links when present. |
| Observe basket allocation | Wallet token balances by address | Request the chosen BSC stock contract and BSC USDT; value with returned `tokenPrice`; fail closed on a missing price for held tokens or a risk flag. A valuation is not an executable quote. |
| Session and restriction state | RWA underlying market / token list `statusInfo` | Use API status and `nextOpenTime`, not a hand-coded US clock; closures, holidays, and corporate actions differ. |
| Executable cost | Trading aggregated quote | A quote ID lasts about 30 seconds; compare output after share-ratio normalization and known fees. Present issuer rights and protections separately; equal share exposure does not imply legally equivalent tokens. No route means no trade. |
| Route construction | Trading swap endpoint | The observed equity routes return `executionMode=SWAP`, a transaction target, and calldata. Re-quote before construction; verify chain, sender, token pair, amount, target, minimum received, and slippage. If a future route returns `RFQ`, verify `rfq.typedDataToSign` instead. |
| Transaction preflight | Trading approval endpoint and Transaction simulation | Enforce exact approval amount and the route's spender, then simulate approval if needed. Simulate the unsigned `SWAP` transaction from the intended wallet. An `RFQ` typed order is not itself an on-chain transaction to simulate. |
| Settlement | Transaction broadcast/status or wallet-submitted transaction receipt; RFQ submit/status only for an RFQ route | Sign only after policy and preflight pass. Verify the actual receipt and token balance before recording settlement. |
| Portfolio and post-trade state | Wallet balances / transaction status | Verify mined receipt and updated token balance before marking a trade complete. |

References: [RWA](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data), [Trading](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api), [Transaction](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api), [Wallet](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/wallet-api).

## Security and execution boundaries

1. **Credentials:** Binance API key and secret stay on the server. Sign `timestamp + METHOD + /build/path?query + rawBody` using HMAC-SHA256, Base64 encoded. Never expose credentials in browser bundles, logs, or public decision records. [Binance authentication](https://web3.binance.com/en/dev-docs/authentication).
2. **No private-key custody in P0:** the user signs exact approval and `SWAP` transactions in their wallet, or an EIP-712 order if a future route is `RFQ`. The server prepares and checks but cannot sign for the user.
3. **Allowlist and limits:** chain `56`, recognized token addresses, approved router/spender, exact or bounded ERC-20 approval, trade size, daily budget, slippage, quote impact, and cooldown are checked before and immediately before signing.
4. **Fail closed:** unknown status, stale RWA data, stale quote, no route, failed approval simulation, unexpected approval target, or disagreement between the displayed quote and typed order causes `BLOCK` or `WAIT`.
5. **No AI authority:** a model may explain a decision from structured facts. It cannot choose an unapproved token, edit a cap, sign, or call execution directly.
6. **Autonomous P1:** only add Binance Agentic Wallet after verifying the team's account setup, token scope, daily limits, and approval flow. Its security rules are configured in the Binance App, according to [its documentation](https://developers.binance.com/en/docs/products/agentic-wallet/quickstart/install-agentic-wallet).

## Data records

`Policy`: wallet address, chain, target weights, token/issuer allowlist, regular and outside-hours limits, cooldown, enabled sessions, version, updated time.

`Observation`: observed time, source response time, ticker, contract, issuer, session, `openState`, reason code, next open, wallet balance, target drift, quote ID/time, route, output amount, price impact/fee fields if supplied.

`Decision`: policy version, observation references, action, ordered reason codes, selected and rejected alternatives, expected exposure, preflight status, signer mode, immutable content hash, created time.

`Execution`: decision ID, route mode, approval transaction if any, swap transaction hash or RFQ order ID and status, actual balance delta, verified time, failure reason.

Public views redact wallet-sensitive details where appropriate but retain enough data and source links to reproduce the decision. A database decision hash is an audit aid; it is **not** an on-chain proof unless explicitly anchored in a transaction.

## Failure and replay tests

- Session moves from `regular` to `closed` between observation and signing: refresh state and wait.
- Asset moves to `ASSET_PAUSED`: block even if an older quote exists.
- Quote expires or route disappears: re-quote; never reuse an expired ID.
- Approval spender or amount differs from what the UI displayed: block.
- Approval or swap simulation succeeds but the live transaction reverts, or an RFQ order fails after signing: record a failed execution, not a successful trade.
- Scheduler retries the same window: idempotency key prevents duplicate orders.
- Two issuer tokens represent different share ratios: normalize before comparison; never compare raw token counts.
- API 401/429/5xx, timestamp drift, or missing fields: log a concise reason and wait without spending.

## Open decisions to resolve with live evidence

1. Which issuer and session give a stable route for the first funded mainnet trade? Both NVDAon and NVDAB returned small live `SWAP` quotes and unsigned calldata on 30 September, but no funded transaction has been attempted.
2. Can the same-ticker issuer comparison survive live size, slippage, and status checks? NVDAon and NVDAB both quoted; bStocks reported an undocumented `unknown` session and remains policy-blocked until clarified.
3. Does Agentic Wallet expose a practical automation path for our app by the P1 gate? If not, retain user-signed execution and skip the special-prize claim.
4. Which deployment host can run the scheduler and server-side Binance signing reliably through judging?
