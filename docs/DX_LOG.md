# Firsthand developer experience log

The hackathon requires a specific, honest Developer Experience Report and says generic AI-generated reports will not be accepted. **A builder must fill this log from real work.** Do not submit this blank template as the report.

## Session record

| UTC time | Who tested | Endpoint or page | Goal | Result | Duration/latency | Exact error or behavior | Evidence link or redacted response | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |

## Observed development-environment incident

On 29 September 2026 at about 17:39 UTC, the Codex managed shell called the local `GET /api/market?ticker=NVDA` endpoint with credentials configured in an ignored local env file. The endpoint returned HTTP 502 with `UPSTREAM_DNS_ERROR`: the server could not resolve `web3.binance.com`. A separate header-only `curl` to the Binance host exited with code 6, “Could not resolve host.” No request reached Binance, so this is **not** evidence of an authentication, documentation, or Binance API failure. The first successful signed call, upstream latency, and live token response remain unmeasured. Retest from a network that resolves the host and record the actual result here.

A second attempt with `npm run smoke:binance` in the elevated shell at about 17:47 UTC failed with `ENOTFOUND` after 42 ms and no Binance HTTP response. System DNS returned an address for `github.com` but no address for `web3.binance.com` or `www.binance.com`. The published authentication and RWA docs list `https://web3.binance.com/build` as the API base URL; no alternative host was used.

## First-call onboarding

- Time opened documentation (UTC):
- Time received API credentials (UTC):
- Time of first signed successful API response (UTC):
- Pages used, in order:
- Where signing or setup failed, with exact request path and error code:
- What would have made the first successful call faster:

## Tokenized-stock field observations

Record the actual ticker, issuer, chain, session, quote time, requested size, RFQ vendor, expected output, approval simulation if any, order status, and settled output for every sampled trade or failed quote. Compare regular, extended, and closed sessions only when you have observed each. Describe the `referencePrice` field accurately: the published API docs define it as derived from on-chain token price, not an independent stock-exchange quote.

## AI wallet and agent stack observations

- Agentic Wallet or Wallet Skills attempted? Exact version and command:
- Which security rules were set in the Binance App?
- Did the wallet require confirmation? For which action?
- What failed, worked, or needs an API/documentation change?

## Report drafting rule

Write the final report from dated entries above. Quote exact error codes and endpoint paths, distinguish observed facts from suggestions, and retain redacted evidence. Never invent latency, liquidity, successful trades, or platform comparisons.

Source: [hackathon Developer Experience Report requirements](https://www.bnbchain.org/en/hackathons/tokenized-stocks).
