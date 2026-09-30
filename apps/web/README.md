# Bellproof web prototype

The app implements a signed Binance Web3 API client, BSC bStocks/Ondo discovery, wallet basket proposals, exact approval and swap preflight, a regular-session buy policy, an injected-wallet signing path, and a browser evidence journal. Live RWA discovery, `SWAP` quotes, unsigned builds, Transaction API simulation, and BSC wallet reads were verified on 30 September 2026. A funded mainnet signature and settlement remain unverified. See the [repository README](../../README.md) for the product plan and setup.

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

Portfolio proposals, route previews, and preflight simulations are read-only. An injected EVM wallet can be connected for an explicit approval and swap signature when a fresh live policy result allows it. Bellproof reads BSC USDT, BNB, and allowance from RPC, checks the wallet basket proposal and quote, and simulates both transactions. A successful approval simulation does not grant allowance to the separate swap simulation, so an actual approval must confirm before a fresh swap preflight can return `TRADE`. The signing code is not yet verified with a funded wallet. A submitted swap becomes `SETTLED` only after a successful receipt and verified balance delta; recent records are stored in that browser's local storage. An `RFQ` route, if observed later, needs separate typed-order validation and status tracking.

If the UI cannot reach Binance, run `npm run smoke:binance` from a Terminal with normal internet access. It makes one signed NVDA search and prints status, latency, and public token metadata without printing credentials.
