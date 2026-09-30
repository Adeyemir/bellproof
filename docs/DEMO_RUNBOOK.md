# Bellproof live demo runbook

This is the next verification gate, not a record of a completed trade. The public app is [live on Vercel](https://bellproof-one.vercel.app/). A user-owned wallet must sign any approval or swap. Never put a recovery phrase, private key, or API secret in a screen recording or issue.

## Before the market opens

1. Use a browser with an injected EVM wallet. Select BSC mainnet, chain ID `56`.
2. In that wallet, hold BSC USDT at `0x55d398326f99059fF775485246999027B3197955` and enough BNB for approval and swap gas. The observed NVDAon route rejected $2 and $5 requests despite a `Minimum order amount is 5 USD` message; plan around a $10 USDT quote and verify the current route before any signature. A little more than $10 USDT leaves room for the basket proposal to cover a $10 buy.
3. Open Bellproof, connect the wallet, search `NVDA`, and select Ondo `NVDAon`. Confirm the contract shown by live discovery and the current session. Bellproof's live buy policy requires `regular`; a `premarket` result should be `WAIT`. The bStocks `unknown` session should be `BLOCK`.
4. Set **USDT quote size** to `10` and **stock target** to `100%` for this tiny first-basket test. The app caps the submitted amount at $10. The target makes a buy proposal possible for a wallet holding mostly USDT; it does not cause an automatic trade. Return to a realistic basket target after the verification run.

## When the live session is regular

1. Refresh ticker discovery and click **Get live routes** for NVDAon. Check the route mode and output.
2. Click **Build and simulate fresh route**. Inspect the decision, source and destination tokens, router, spender, exact input, minimum output, quote age, and simulation results. Stop if any field or result is unexpected.
3. If Bellproof says `WAIT / APPROVAL_REQUIRED`, click **Approve exact USDT amount** and confirm only the exact amount and spender shown in the app. Wait for the approval receipt. Bellproof will request a new quote and simulation against the mined allowance.
4. Continue only if a fresh preflight returns `TRADE / READY_TO_SIGN`. Click **Review and sign swap**, inspect the wallet prompt, and confirm. Each wallet prompt is preceded by a new preflight; an expired quote or failed simulation disables signing.
5. Wait for the BSC receipt and compare the USDT and NVDAon balances. The evidence journal should show `SETTLED` only after the receipt succeeds and both balance changes are observed. Download its JSON and retain the BscScan transaction link. If it shows `REVERTED`, `SETTLEMENT_UNVERIFIED`, or an error, keep that exact result in the DX log and debug before claiming a completed trade.

## Submission evidence

Use the [spoken demo script](DEMO_SCRIPT.md) for the final screen recording. Its settlement lines are conditional on a real confirmed trade.

- Capture one live `WAIT` and one `BLOCK`, with raw session/reason visible.
- Capture one `TRADE` only after all checks pass, then the signed transaction, receipt, balance delta, and downloaded evidence record.
- Record quote size, route vendor, session, latency, approval behavior, any error code, and transaction hash in the firsthand [DX log](DX_LOG.md).
- Record a demo of at most four minutes and check the public link, repo, and video from a clean browser before submission. The hackathon locks submissions on **11 October 2026 at 12:00 UTC**.

Source: [BNB Hack: Tokenized Stocks Edition](https://www.bnbchain.org/en/hackathons/tokenized-stocks).
