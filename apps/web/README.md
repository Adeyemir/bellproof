# Bellproof web prototype

The app implements a signed Binance Web3 API client, BSC bStocks/Ondo ticker and session lookup, a wallet-specific route preview, a wallet-balance rebalance proposal, and a deterministic policy lab. Live RWA discovery and `SWAP` quotes were verified on 30 September 2026. See the [repository README](../../README.md) for the product plan and setup.

## Local commands

```bash
npm install
cp .env.example .env.local
# Fill BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY in .env.local
npm run dev
```

The API credentials are read only by server code. With no credentials, the lookup and quote endpoints return `503 CREDENTIALS_MISSING`; the policy lab still works with labelled sample inputs.

```bash
npm test
npm run lint
npm run build
```

Portfolio proposals and route previews do not sign, submit, or broadcast an order. A proposal is not a `TRADE` decision until a fresh quote and the policy gates pass. The observed equity routes use `SWAP`, so the next execution slice must validate and simulate the unsigned swap and any approval. An `RFQ` route, if observed later, needs typed-order validation and status tracking instead.

If the UI cannot reach Binance, run `npm run smoke:binance` from a Terminal with normal internet access. It makes one signed NVDA search and prints status, latency, and public token metadata without printing credentials.
