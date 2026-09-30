import type { MarketSession } from "../session-policy";

const sessions = new Set<MarketSession>([
  "premarket",
  "regular",
  "postmarket",
  "overnight",
  "closed",
  "pause",
]);

export function normalizeMarketSession(value: unknown): MarketSession | "unknown" {
  if (value === "paused") return "pause";
  return typeof value === "string" && sessions.has(value as MarketSession)
    ? (value as MarketSession)
    : "unknown";
}
