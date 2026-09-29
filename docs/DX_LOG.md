# Firsthand developer experience log

The hackathon requires a specific, honest Developer Experience Report and says generic AI-generated reports will not be accepted. **A builder must fill this log from real work.** Do not submit this blank template as the report.

## Session record

| UTC time | Who tested | Endpoint or page | Goal | Result | Duration/latency | Exact error or behavior | Evidence link or redacted response | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-29 ~19:27 | Codex managed shell | `GET /build/api/v1/dex/market/rwa/search?keyword=NVDA` | Retest after VPN disconnect | No HTTP response | 126 ms | `ENOTFOUND` from the normal signed smoke test | Terminal output; credentials redacted by the script | Check the network DNS response before changing API credentials. |
| 2026-09-29 ~19:28 | Codex managed shell | `web3.binance.com` DNS | Compare resolvers | Network resolver returned `NXDOMAIN`; public DNS returned addresses | Network resolver 5 ms; Cloudflare 352 ms; Google 138 ms | `172.20.10.1` returned an `NXDOMAIN` answer with an `mtnnigeria.net` SOA; `1.1.1.1` and `8.8.8.8` returned a CloudFront CNAME and A records | Redacted `dig` results in session transcript | Use a resolver or network that returns the published host; retest normal app requests. |
| 2026-09-29 ~19:31 | Codex managed shell | `GET /build/api/v1/dex/market/rwa/search?keyword=NVDA` | Make first signed RWA call with a per-request DNS override | HTTP 200, Binance code `0`, message `success`, one data row | 1200 ms | No API error; the request used an IP obtained from public DNS while retaining the `web3.binance.com` HTTPS host and signature path | Credential-safe terminal output in session transcript | Fix normal DNS so the app can make the same call without an override. |

## Observed development-environment incident

On 29 September 2026 at about 17:39 UTC, the Codex managed shell called the local `GET /api/market?ticker=NVDA` endpoint with credentials configured in an ignored local env file. The endpoint returned HTTP 502 with `UPSTREAM_DNS_ERROR`: the server could not resolve `web3.binance.com`. A separate header-only `curl` to the Binance host exited with code 6, “Could not resolve host.” No request reached Binance, so this is **not** evidence of an authentication, documentation, or Binance API failure. At that point, the first successful signed call, upstream latency, and live token response were unmeasured.

A second attempt with `npm run smoke:binance` in the elevated shell at about 17:47 UTC failed with `ENOTFOUND` after 42 ms and no Binance HTTP response. System DNS returned an address for `github.com` but no address for `web3.binance.com` or `www.binance.com`. The published authentication and RWA docs list `https://web3.binance.com/build` as the API base URL; no alternative host was used.

After the VPN was disconnected, the normal signed smoke test still failed with `ENOTFOUND`. The active network resolver answered `NXDOMAIN` for `web3.binance.com`, while two public resolvers returned addresses. An HTTPS request using one of those addresses and the original hostname reached Binance (HTTP 302 at `/build`). A signed RWA search using the same per-request DNS override returned HTTP 200 and Binance code `0`. This confirms that the configured API credentials and signing worked for that read-only request; ordinary app requests remain blocked by the network resolver until its answer changes.

## First-call onboarding

- Time opened documentation (UTC):
- Time received API credentials (UTC):
- Time of first signed successful API response (UTC): 2026-09-29 about 19:31 (RWA search with per-request DNS override)
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
