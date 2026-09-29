import { createHmac } from "node:crypto";

type ParamValue = string | number | undefined | null;

export function buildRequestPath(
  endpoint: `/api/v1/${string}`,
  params: Record<string, ParamValue> = {},
): string {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return `/build${endpoint}${query ? `?${query}` : ""}`;
}

export function signRequest(
  secret: string,
  timestamp: string,
  method: "GET" | "POST",
  requestPath: string,
  body = "",
): string {
  return createHmac("sha256", secret)
    .update(timestamp + method + requestPath + body, "utf8")
    .digest("base64");
}
