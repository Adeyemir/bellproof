import { createHmac } from "node:crypto";
import { performance } from "node:perf_hooks";

const key = process.env.BINANCE_WEB3_API_KEY;
const secret = process.env.BINANCE_WEB3_SECRET_KEY;
if (!key || !secret) {
  process.stderr.write("Set BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY in .env.local.\n");
  process.exit(1);
}

const path = "/build/api/v1/dex/market/rwa/search?keyword=NVDA";
const timestamp = new Date().toISOString();
const signature = createHmac("sha256", secret)
  .update(timestamp + "GET" + path, "utf8")
  .digest("base64");
const startedAt = performance.now();

try {
  const response = await fetch(`https://web3.binance.com${path}`, {
    headers: {
      "X-OC-APIKEY": key,
      "X-OC-TIMESTAMP": timestamp,
      "X-OC-SIGN": signature,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const raw = await response.text();
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    process.stdout.write(`HTTP ${response.status}; ${elapsedMs} ms; response was not JSON.\n`);
    process.exit(1);
  }
  const safeMessage = String(result.msg ?? "").replaceAll(key, "[redacted]").replaceAll(secret, "[redacted]");
  process.stdout.write(`HTTP ${response.status}; Binance code ${result.code ?? "unknown"}; ${elapsedMs} ms\n`);
  process.stdout.write(`Message: ${safeMessage.slice(0, 240)}\n`);
  if (!response.ok || result.code !== 0 || result.success === false) process.exit(1);

  const matches = Array.isArray(result.data) ? result.data : [];
  for (const match of matches.filter((item) => item.ticker === "NVDA")) {
    process.stdout.write(`${match.ticker}: ${match.companyName ?? ""}\n`);
    for (const asset of Array.isArray(match.assets) ? match.assets : []) {
      if (asset.binanceChainId === "56") {
        process.stdout.write(`  ${asset.platformId} ${asset.tokenSymbol} BSC ${asset.tokenContractAddress}\n`);
      }
    }
  }
} catch (error) {
  const elapsedMs = Math.round(performance.now() - startedAt);
  const cause = error instanceof Error ? error.cause : null;
  const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "NETWORK_ERROR";
  process.stderr.write(`No Binance HTTP response after ${elapsedMs} ms; transport code ${code}.\n`);
  process.exit(1);
}
