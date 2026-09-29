import "server-only";

import { getBinance } from "./server";
import type { MarketSession } from "../session-policy";

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const sessions = new Set<MarketSession>([
  "premarket",
  "regular",
  "postmarket",
  "overnight",
  "closed",
  "pause",
]);

interface SearchResult {
  ticker: string;
  companyName: string;
  assets: Array<{
    platformId: string;
    binanceChainId: string;
    tokenContractAddress: string;
    tokenSymbol: string;
  }>;
}

interface UnderlyingMarketResponse {
  statusInfo?: {
    openState?: boolean;
    marketStatus?: string;
    reasonCode?: string | null;
    reasonMsg?: string | null;
    nextOpenTime?: number | null;
  };
}

interface UnderlyingProfileResponse {
  tokenToShareRatio?: string | null;
  protections?: Record<string, { supported?: boolean; url?: string | null }>;
}

export interface AttestationLink {
  label: string;
  url: string;
}

export interface RwaMarketCandidate {
  ticker: string;
  companyName: string;
  platformId: "bstock" | "ondo";
  tokenSymbol: string;
  tokenContractAddress: string;
  session: MarketSession | "unknown";
  openState: boolean;
  restrictionReason: string | null;
  restrictionMessage: string | null;
  nextOpenTimeMs: number | null;
  tokenToShareRatio: string | null;
  attestations: AttestationLink[];
  profileUnavailable: boolean;
}

function attestationLinks(profile: UnderlyingProfileResponse | null): AttestationLink[] {
  return Object.entries(profile?.protections ?? {})
    .filter(([, entry]) => entry?.supported === true && typeof entry.url === "string")
    .flatMap(([label, entry]) => {
      try {
        const url = new URL(entry.url!);
        return url.protocol === "https:" ? [{ label, url: url.toString() }] : [];
      } catch {
        return [];
      }
    });
}

export async function findBscStockMarkets(ticker: string): Promise<{
  observedAtMs: number;
  candidates: RwaMarketCandidate[];
}> {
  const matches = await getBinance<SearchResult[]>("/api/v1/dex/market/rwa/search", {
    keyword: ticker,
  });
  if (!Array.isArray(matches)) throw new Error("Unexpected RWA search response");

  const candidates = matches
    .filter((entry) => entry.ticker?.toUpperCase() === ticker.toUpperCase())
    .flatMap((entry) =>
      (Array.isArray(entry.assets) ? entry.assets : [])
        .filter(
          (asset) =>
            asset.binanceChainId === "56" &&
            (asset.platformId === "bstock" || asset.platformId === "ondo") &&
            addressPattern.test(asset.tokenContractAddress),
        )
        .map((asset) => ({
          ticker: entry.ticker,
          companyName: entry.companyName,
          platformId: asset.platformId as "bstock" | "ondo",
          tokenSymbol: asset.tokenSymbol,
          tokenContractAddress: asset.tokenContractAddress,
        })),
    )
    .slice(0, 4);

  const withStatus: RwaMarketCandidate[] = [];
  for (const asset of candidates) {
    // Sequential calls stay below the documented default 5 RPS per endpoint.
    const market = await getBinance<UnderlyingMarketResponse>(
      "/api/v1/dex/market/rwa/underlying-market",
      { binanceChainId: "56", tokenContractAddress: asset.tokenContractAddress },
    );
    let profile: UnderlyingProfileResponse | null = null;
    let profileUnavailable = false;
    try {
      profile = await getBinance<UnderlyingProfileResponse>(
        "/api/v1/dex/market/rwa/underlying-profile",
        { binanceChainId: "56", tokenContractAddress: asset.tokenContractAddress },
      );
    } catch {
      profileUnavailable = true;
    }
    const status = market?.statusInfo;
    const session = status?.marketStatus;
    withStatus.push({
      ...asset,
      session: session && sessions.has(session as MarketSession)
        ? (session as MarketSession)
        : "unknown",
      openState: status?.openState === true,
      restrictionReason: status?.reasonCode ?? null,
      restrictionMessage: status?.reasonMsg ?? null,
      nextOpenTimeMs:
        typeof status?.nextOpenTime === "number" ? status.nextOpenTime : null,
      tokenToShareRatio:
        typeof profile?.tokenToShareRatio === "string" ? profile.tokenToShareRatio : null,
      attestations: attestationLinks(profile),
      profileUnavailable,
    });
  }

  return { observedAtMs: Date.now(), candidates: withStatus };
}
