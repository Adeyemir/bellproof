import { createHmac, randomBytes } from "node:crypto";
import { Resolver } from "node:dns";
import https from "node:https";
import { performance } from "node:perf_hooks";

const key = process.env.BINANCE_WEB3_API_KEY;
const secret = process.env.BINANCE_WEB3_SECRET_KEY;
if (!key || !secret) {
  process.stderr.write("Set Binance Web3 credentials in .env.local.\n");
  process.exit(1);
}

const dnsServer = process.env.BINANCE_PROBE_DNS_SERVER;
const resolver = dnsServer ? new Resolver() : null;
if (resolver) resolver.setServers([dnsServer]);

function lookup(hostname, options, callback) {
  resolver.resolve4(hostname, (error, addresses) => {
    if (error) return callback(error);
    if (addresses.length === 0) return callback(new Error("DNS returned no IPv4 addresses"));
    const address = addresses[0];
    return options.all
      ? callback(null, [{ address, family: 4 }])
      : callback(null, address, 4);
  });
}

function signedGet(endpoint, params) {
  const query = new URLSearchParams(params).toString();
  const path = `/build${endpoint}${query ? `?${query}` : ""}`;
  const timestamp = new Date().toISOString();
  const signature = createHmac("sha256", secret)
    .update(timestamp + "GET" + path, "utf8")
    .digest("base64");
  const started = performance.now();

  return new Promise((resolve, reject) => {
    const request = https.request(`https://web3.binance.com${path}`, {
      method: "GET",
      ...(resolver ? { lookup } : {}),
      headers: {
        "X-OC-APIKEY": key,
        "X-OC-TIMESTAMP": timestamp,
        "X-OC-SIGN": signature,
      },
      timeout: 12_000,
    }, (response) => {
      let raw = "";
      response.on("data", (chunk) => {
        raw += chunk;
        if (raw.length > 1_000_000) request.destroy(new Error("Response too large"));
      });
      response.on("end", () => {
        const elapsedMs = Math.round(performance.now() - started);
        let envelope;
        try {
          envelope = JSON.parse(raw);
        } catch {
          return reject(new Error(`HTTP ${response.statusCode}; non-JSON response; ${elapsedMs} ms`));
        }
        const safeMessage = String(envelope.msg ?? "")
          .replaceAll(key, "[redacted]")
          .replaceAll(secret, "[redacted]")
          .slice(0, 160);
        process.stdout.write(`${endpoint}: HTTP ${response.statusCode}; code ${envelope.code ?? "unknown"}; ${elapsedMs} ms\n`);
        if (response.statusCode !== 200 || envelope.code !== 0 || envelope.success === false) {
          return reject(new Error(`Binance response: ${safeMessage || "unknown"}`));
        }
        return resolve(envelope.data);
      });
    });
    request.on("timeout", () => request.destroy(new Error("Request timed out")));
    request.on("error", (error) => reject(new Error(`Transport: ${error.code ?? error.message}`)));
    request.end();
  });
}

try {
  const ticker = "NVDA";
  const matches = await signedGet("/api/v1/dex/market/rwa/search", { keyword: ticker });
  if (!Array.isArray(matches)) throw new Error("Unexpected RWA search data");
  const candidates = matches
    .filter((entry) => entry.ticker === ticker)
    .flatMap((entry) => Array.isArray(entry.assets) ? entry.assets : [])
    .filter((asset) =>
      asset.binanceChainId === "56" &&
      ["bstock", "ondo"].includes(asset.platformId) &&
      /^0x[a-fA-F0-9]{40}$/.test(asset.tokenContractAddress),
    );
  process.stdout.write(`BSC ${ticker} candidates: ${candidates.length}\n`);

  // A fresh, unfunded address makes the RFQ receiver explicit for a read-only quote.
  // This probe creates no private key and cannot sign or submit an order.
  const probeAddress = `0x${randomBytes(20).toString("hex")}`;
  let anyRoute = false;
  for (const asset of candidates.slice(0, 4)) {
    process.stdout.write(`${asset.platformId} ${asset.tokenSymbol} ${asset.tokenContractAddress}\n`);
    try {
      const market = await signedGet("/api/v1/dex/market/rwa/underlying-market", {
        binanceChainId: "56",
        tokenContractAddress: asset.tokenContractAddress,
      });
      const status = market?.statusInfo ?? {};
      process.stdout.write(`  session ${status.marketStatus ?? "unknown"}; open ${status.openState ?? "unknown"}; reason ${status.reasonCode ?? "none"}\n`);
    } catch (error) {
      process.stderr.write(`  market status failed: ${error.message}\n`);
    }
    for (const dollars of [5, 10]) {
      try {
        const amount = (BigInt(dollars) * 10n ** 18n).toString();
        const routes = await signedGet("/api/v1/dex/aggregator/quote", {
          binanceChainId: "56",
          amount,
          fromTokenAddress: "0x55d398326f99059fF775485246999027B3197955",
          toTokenAddress: asset.tokenContractAddress,
          userWalletAddress: probeAddress,
        });
        if (!Array.isArray(routes)) throw new Error("Unexpected quote data");
        process.stdout.write(`  $${dollars} quote routes: ${routes.length}\n`);
        for (const route of routes) {
          process.stdout.write(`  ${route.vendorName ?? "unknown"} ${route.executionMode ?? "unknown"}; output ${route.toTokenAmount ?? "unknown"}; impact ${route.priceImpactPercent ?? "unknown"}; fee USD ${route.tradeFee ?? "unknown"}\n`);
        }
        if (routes.length > 0) {
          anyRoute = true;
          const route = routes[0];
          try {
            const swap = await signedGet("/api/v1/dex/aggregator/swap", {
              binanceChainId: "56",
              amount,
              fromTokenAddress: "0x55d398326f99059fF775485246999027B3197955",
              toTokenAddress: asset.tokenContractAddress,
              userWalletAddress: probeAddress,
              quoteId: route.quoteId,
              slippagePercent: "0.5",
              approveTransaction: "true",
              approveAmount: amount,
            });
            const tx = swap?.tx;
            process.stdout.write(`  unsigned build: ${swap?.executionMode ?? "unknown"}; sender matches ${tx?.from?.toLowerCase() === probeAddress.toLowerCase()}; target ${tx?.to ?? "none"}; calldata chars ${tx?.data?.length ?? 0}; min receive ${tx?.minReceiveAmount ?? "none"}\n`);
          } catch (error) {
            process.stderr.write(`  unsigned build failed: ${error.message}\n`);
          }
          break;
        }
      } catch (error) {
        process.stderr.write(`  $${dollars} quote failed: ${error.message}\n`);
      }
    }
  }
  if (!anyRoute) process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
