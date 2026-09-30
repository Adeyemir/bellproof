import "server-only";

import { randomUUID } from "node:crypto";
import { Resolver } from "node:dns";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { buildRequestPath, signRequest } from "./signing";

const baseUrl = "https://web3.binance.com";

export class BinanceWeb3Error extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
  ) {
    super(message);
    this.name = "BinanceWeb3Error";
  }
}

export class BinanceCredentialsMissingError extends Error {
  constructor() {
    super("Binance Web3 API credentials are not configured");
    this.name = "BinanceCredentialsMissingError";
  }
}

export class BinanceTransportError extends Error {
  constructor(
    message: string,
    readonly code: "UPSTREAM_DNS_ERROR" | "UPSTREAM_TIMEOUT" | "UPSTREAM_NETWORK_ERROR",
  ) {
    super(message);
    this.name = "BinanceTransportError";
  }
}

type ParamValue = string | number | undefined | null;

interface ApiEnvelope<T> {
  code: number;
  msg: string;
  data: T;
  success?: boolean;
}

async function fetchBinance(
  url: string,
  method: "GET" | "POST",
  headers: Record<string, string>,
  body: string | undefined,
): Promise<Response> {
  const dnsServer = process.env.BINANCE_WEB3_DNS_SERVER;
  if (!dnsServer) {
    return fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  }
  if (!isIP(dnsServer)) throw new Error("Invalid BINANCE_WEB3_DNS_SERVER address");

  // Opt-in development fallback for networks whose resolver returns NXDOMAIN.
  // HTTPS still connects to the documented hostname and validates its certificate.
  const resolver = new Resolver();
  resolver.setServers([dnsServer]);
  const lookup: LookupFunction = (hostname, options, callback) => {
    resolver.resolve4(hostname, (error, addresses) => {
      if (error) return callback(error, "", 4);
      if (addresses.length === 0) return callback(new Error("DNS returned no IPv4 addresses"), "", 4);
      return options.all
        ? callback(null, [{ address: addresses[0], family: 4 }])
        : callback(null, addresses[0], 4);
    });
  };

  return new Promise<Response>((resolve, reject) => {
    const request = https.request(url, {
      method,
      headers,
      lookup,
      signal: AbortSignal.timeout(10_000),
    }, (upstream) => {
      const chunks: Buffer[] = [];
      let size = 0;
      upstream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 1_000_000) {
          request.destroy(new Error("Binance response exceeded size limit"));
          return;
        }
        chunks.push(chunk);
      });
      upstream.on("end", () => {
        resolve(new Response(Buffer.concat(chunks), {
          status: upstream.statusCode ?? 502,
          headers: { "Content-Type": upstream.headers["content-type"] ?? "application/json" },
        }));
      });
      upstream.on("error", reject);
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function request<T>(
  method: "GET" | "POST",
  endpoint: `/api/v1/${string}`,
  params: Record<string, ParamValue> = {},
  payload?: unknown,
): Promise<T> {
  const apiKey = process.env.BINANCE_WEB3_API_KEY;
  const secret = process.env.BINANCE_WEB3_SECRET_KEY;
  if (!apiKey || !secret) throw new BinanceCredentialsMissingError();

  const requestPath = buildRequestPath(endpoint, params);
  const timestamp = new Date().toISOString();
  const body = method === "POST" ? JSON.stringify(payload ?? {}) : "";
  const signature = signRequest(secret, timestamp, method, requestPath, body);

  let response: Response;
  try {
    response = await fetchBinance(baseUrl + requestPath, method, {
        "Content-Type": "application/json",
        "X-OC-APIKEY": apiKey,
        "X-OC-TIMESTAMP": timestamp,
        "X-OC-SIGN": signature,
        "X-OC-NONCE": randomUUID(),
    }, method === "POST" ? body : undefined);
  } catch (error) {
    const cause = error instanceof Error ? error.cause : null;
    const networkCode = cause && typeof cause === "object" && "code" in cause
      ? String(cause.code)
      : null;
    if (networkCode === "ENOTFOUND" || networkCode === "EAI_AGAIN") {
      throw new BinanceTransportError(
        "The server could not resolve web3.binance.com.",
        "UPSTREAM_DNS_ERROR",
      );
    }
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new BinanceTransportError(
        "The Binance Web3 API request timed out.",
        "UPSTREAM_TIMEOUT",
      );
    }
    throw new BinanceTransportError(
      "The server could not reach the Binance Web3 API.",
      "UPSTREAM_NETWORK_ERROR",
    );
  }

  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new BinanceWeb3Error("Invalid JSON response from Binance Web3 API", response.status, null);
  }

  if (!response.ok || envelope.code !== 0 || envelope.success === false) {
    throw new BinanceWeb3Error(
      envelope.msg || "Binance Web3 API request failed",
      response.status,
      Number.isFinite(envelope.code) ? envelope.code : null,
    );
  }
  return envelope.data;
}

export function getBinance<T>(
  endpoint: `/api/v1/${string}`,
  params: Record<string, ParamValue> = {},
): Promise<T> {
  return request<T>("GET", endpoint, params);
}

export function postBinance<T>(
  endpoint: `/api/v1/${string}`,
  payload: unknown,
): Promise<T> {
  return request<T>("POST", endpoint, {}, payload);
}
