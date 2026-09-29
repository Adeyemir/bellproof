# Binance Agentic Wallet feasibility gate

**Status, 29 September 2026:** documentation reviewed; `baw` is not installed or paired in this environment. No Agentic Wallet quote or order has been observed. This gate runs alongside the owner-signed RFQ path and cannot weaken Bellproof's policy.

## What must be true to ship the adapter

1. The account owner has a Binance account and an MPC Wallet in the Binance App, then pairs Agentic Wallet through the official sign-in flow. Configure a BSC token allowlist, daily limit, and confirmation rules in the App. Record the settings and any friction firsthand in `DX_LOG.md`.
2. Resolve one supported bStocks or Ondo contract on BSC using RWA Data and check its issuer and market state. A ticker string is never substituted for a verified contract address.
3. Obtain a `baw market-order quote` for that contract on chain `56`, for the proposed direction and amount. Compare source token, destination token, quantity, expected output, slippage, and age with Bellproof's limits. Confirm the route is actually a tokenized-stock route.
4. Run the same deterministic policy that gates owner-signed RFQ execution. Record policy version and `TRADE`/`WAIT`/`BLOCK` reason before the CLI can receive an execution command. Recheck the market state and limits immediately before execution.
5. Complete the official security pre-check for a new target token. Observe whether the App asks for confirmation. The agent has no way to override App rules or Bellproof's verifier.
6. For a tiny approved BSC spot order, treat the returned `orderId` as **submitted**. Poll `baw market-order list --orderId ... --json` until `FINISHED` or `FAILED`. Record the transaction hash and post-trade balances before marking a trade settled.
7. Test one `WAIT` or `BLOCK` case where Bellproof never calls `market-order swap`. Test a failed or pending order without claiming success.

## Official command surface to validate

```bash
npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet
baw market-order quote --fromTokenQty <amount> --fromToken <source-contract> --toToken <destination-contract> --binanceChainId 56 --json
baw market-order list --orderId <submitted-order-id> --json
```

The account owner must complete sign-in and App rules. The example above intentionally omits `market-order swap`: live execution is a separate step after quote, Bellproof policy approval, security review, and a tiny funded-wallet check. Confirm CLI output shape and deployment/runtime compatibility before writing the adapter. Do not assume the Agentic Wallet CLI route and Binance Web3 RFQ EIP-712 route have identical signing or simulation semantics.

## Evidence to capture

| Question | Required observation |
| --- | --- |
| Can this stock token be quoted? | Contract, chain, side, amount, timestamp, expected output, quote latency, error if any. |
| Are wallet limits enforceable? | App rule settings and one observed allowed or rejected action. |
| Does execution complete? | Submitted order ID, terminal status, tx hash, balance delta, and elapsed time. |
| Does Bellproof retain authority? | A reproducible `WAIT`/`BLOCK` with no swap call, plus policy version in the decision record. |
| Can judges reproduce it? | Pairing/setup steps and a safe demo wallet path; never publish credentials or private wallet data. |

Source: [Binance install guide](https://developers.binance.com/en/docs/products/agentic-wallet/quickstart/install-agentic-wallet), [tokenized-securities use case](https://developers.binance.com/en/docs/products/agentic-wallet/use-cases/trading/stock-trading), [market-order CLI reference](https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/references/market-order.md).
