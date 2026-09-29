# Bellproof web prototype

The app implements a signed Binance Web3 API client, live BSC bStocks/Ondo ticker and session lookup, a wallet-specific RFQ preview, and a deterministic session-policy lab. See the [repository README](../../README.md) for the product plan and setup.

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

RFQ previews do not sign, submit, or broadcast an order. The transaction API can simulate an on-chain approval transaction when the execution flow is added; the RFQ order itself needs typed-order validation and status tracking.
