# Bellproof

**A policy-controlled execution agent for tokenized stocks on BNB Smart Chain.**

Bellproof keeps a user-defined stock-token basket within policy. It proposes a rebalance from wallet holdings, checks whether a buy can execute, and records why it traded, waited, or blocked. The owner-signed buy path is implemented but has not yet completed a funded mainnet trade.

> Working name and prototype, 30 September 2026. Signed RWA discovery, live BSC stock quotes, unsigned swap construction, and Transaction API simulation have been verified. The connected-wallet signing path compiles and has mocked boundary tests; a real wallet signature and mainnet trade remain open. The name is not a claim of domain or trademark availability.

## Why build this

Tokenized stocks can be traded on-chain while the underlying equity market is closed. A routine rebalance can then meet a thin route, a paused asset, or a quote that expires before execution. The useful agent is one that knows the session, checks the actual route, and declines bad execution within a user-defined policy.

Bellproof's proposed edge is **a narrow rebalance job with a hard execution policy and an inspectable decision record**. Market session is one input to that policy.

## Hackathon fit

- **Track:** Tokenized Stocks Products & Agents.
- **Chain:** BSC mainnet, chain ID `56`; spot only.
- **Core assets:** bStocks or Ondo tokenized stocks. Compare both only when the same underlying ticker is actually available and executable on BSC.
- **Required stack:** Binance Web3 API. The current server paths use RWA Data, Wallet, Trading, and Transaction APIs. Binance Agentic Wallet is a candidate bounded execution adapter, not yet integrated.
- **Deliverables:** working app, public repository, deployed link or judge-ready instructions, and a firsthand Developer Experience Report. A video of at most four minutes is strongly recommended.
- **Deadline:** 11 October 2026, 12:00 UTC (13:00 Lagos).

Source: [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks).

## The first judge-ready flow

1. The job is “keep this basket within my policy.” The current live buy path takes a stock target and a $10 per-trade ceiling, with a fixed 3% drift trigger, regular-session-only rule, 0.5% slippage, and 50 bps impact ceiling. The policy lab shows additional sample rules; those are not all live controls yet.
2. The agent observes BSC wallet balances and the actual bStocks/Ondo token, then proposes `BUY`, `SELL`, or `HOLD` from allocation drift. It cannot grant itself execution permission.
3. Bellproof checks the underlying session and issuer restriction, fetches a fresh buy quote, reads actual BSC balances and allowance, and applies deterministic limits. The outcome is `TRADE`, `WAIT`, or `BLOCK` with a reason code.
4. The observed NVDAon and NVDAB routes are `SWAP`: Bellproof validates sender, target, tokens, amount, spender, and slippage in Binance's unsigned build, then simulates the exact approval and swap. When approval is needed, it signs that transaction first and re-quotes and re-simulates after confirmation. It asks the wallet to sign the swap only after a fresh `TRADE` result.
5. The app checks the BSC receipt and USDT/stock-token balance delta before marking a trade `SETTLED`. Recent decision records persist in the current browser. There is no server database or autonomous execution yet.

See [PRD](docs/PRD.md), [architecture](docs/ARCHITECTURE.md), [competition plan](docs/WIN_PLAN.md), [implementation backlog](docs/BUILD_BACKLOG.md), [Agentic Wallet feasibility gate](docs/AGENTIC_WALLET_GATE.md), and the [firsthand developer log template](docs/DX_LOG.md).

The [read-only live API evidence](evidence/2026-09-30-read-only.json) contains the observed Ondo `WAIT` and bStocks `BLOCK` cases. It is explicitly not a settled-trade record.

## Scope boundaries

- A closed underlying market is a **risk state**, not proof that the on-chain token cannot trade. Bellproof checks token restrictions and a live quote separately.
- Binance's documented `referencePrice` is derived from the on-chain token price. It is **not** an independent traditional-market quote. Bellproof will not claim a stock-versus-token premium from that field.
- No profit promise, price prediction, leverage, perpetuals, or autonomous mainnet spending before an execution method with enforceable user limits is verified.
- The proposal and policy engines are deterministic and auditable. A language model may explain a completed decision later; it cannot override risk checks or authorize a trade.

Sources: [RWA Data API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data), [Trading API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api), [Transaction API](https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api).

## Run the prototype

Live demo: [Bellproof on Vercel](https://bellproof-jokanola-ridwan-adeyemis-projects.vercel.app/). The production API runs in Vercel's Singapore region; live NVDA discovery returned both Ondo and bStocks candidates on 30 September 2026.

```bash
cd apps/web
npm install
cp .env.example .env.local
# Add your Binance Web3 API key and secret to .env.local
# If your network DNS incorrectly returns NXDOMAIN for web3.binance.com,
# add BINANCE_WEB3_DNS_SERVER=1.1.1.1 to .env.local for local development.
npm run dev
```

Open `http://localhost:3000`. Ticker lookup, wallet-balance proposal, route preview, and preflight call Binance from the server. To inspect without spending, enter any BSC address and run preflight. To try the owner-signed path, connect an injected EVM wallet on BSC mainnet with USDT and BNB, select a supported stock and target weight, request a route, then run preflight. Approval and swap each require an explicit wallet prompt. Only sign if you recognize the exact spender, amount, and transaction. The policy lab uses labelled sample inputs. Run `npm run probe:binance-route` for read-only live discovery, session, quote, and unsigned-build checks; set `BINANCE_PROBE_DNS_SERVER=1.1.1.1` for that command if the local resolver is broken. Run `npm test`, `npm run lint`, and `npm run build` from `apps/web` to verify the code.

## Current status

The dashboard, signed API client, RWA discovery, wallet-balance proposal, quote preview, exact swap preflight, connected-wallet boundary, browser evidence journal, and public deployment are implemented. On 30 September, the app returned live NVDAon and NVDAB `SWAP` quotes and built unsigned transactions. The Transaction API returned approval simulation `SUCCESS` and swap simulation `FAILED` for an unfunded diagnostic wallet. The live policy read 0 USDT, 0 allowance, and 0 BNB from BSC RPC and kept signing disabled. The owner-signed approval/swap and settlement-verification code has not been exercised with a funded wallet; no live `TRADE` or `SETTLED` record exists. The current local network resolver still returns `NXDOMAIN` for Binance; the opt-in development DNS setting works locally. Agentic Wallet, server-side decision persistence, a scheduler, sell/RFQ execution, and a live mainnet trade remain open. No API keys or wallet secrets belong in this repository.
