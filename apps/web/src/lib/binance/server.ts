import "server-only";

import { randomUUID } from "node:crypto";
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

type ParamValue = string | number | undefined | null;

interface ApiEnvelope<T> {
  code: number;
  msg: string;
  data: T;
  success?: boolean;
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

  const response = await fetch(baseUrl + requestPath, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-OC-APIKEY": apiKey,
      "X-OC-TIMESTAMP": timestamp,
      "X-OC-SIGN": signature,
      "X-OC-NONCE": randomUUID(),
    },
    body: method === "POST" ? body : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

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
