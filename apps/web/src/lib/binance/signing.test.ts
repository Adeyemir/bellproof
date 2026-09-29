import { describe, expect, it } from "vitest";
import { buildRequestPath, signRequest } from "./signing";

describe("Binance Web3 request signing", () => {
  it("includes the required build prefix and uses wire-safe query encoding", () => {
    expect(
      buildRequestPath("/api/v1/dex/market/rwa/search", { keyword: "NVIDIA Corp" }),
    ).toBe("/build/api/v1/dex/market/rwa/search?keyword=NVIDIA%20Corp");
  });

  it("signs the exact path, timestamp, method, and body", () => {
    const signature = signRequest(
      "test-secret",
      "2026-09-29T16:00:00.000Z",
      "GET",
      "/build/api/v1/dex/market/rwa/search?keyword=NVDA",
    );
    expect(signature).toBe("N1IHdO8VDuocQXm+QtVnsF/Lyco/ZPC9gnafGZSQDNY=");
  });
});
