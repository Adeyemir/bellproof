import { describe, expect, it } from "vitest";
import { bscUsdtAddress, normalizeStockQuote, usdtAmountFromCents } from "./quote-data";

const stockAddress = "0xa9ee28c80f960b889dfbd1902055218cba016f75";

describe("BSC stock quote handling", () => {
  it("converts dollar cents to BSC USDT base units exactly", () => {
    expect(usdtAmountFromCents(500)).toBe("5000000000000000000");
    expect(() => usdtAmountFromCents(1_001)).toThrow(RangeError);
  });

  it("accepts RFQ and observed SWAP routes only for the requested BSC stock and USDT", () => {
    const raw = {
      quoteId: "abc",
      vendorName: "PcsXRfq",
      binanceChainId: "56",
      fromTokenAmount: usdtAmountFromCents(500),
      toTokenAmount: "100000000000000000",
      priceImpactPercent: "-0.12",
      executionMode: "RFQ",
      fromToken: { tokenContractAddress: bscUsdtAddress, decimal: "18" },
      toToken: { tokenContractAddress: stockAddress, tokenSymbol: "NVDAon", decimal: "18" },
    };
    expect(normalizeStockQuote(raw, stockAddress)).toMatchObject({
      executionMode: "RFQ",
      priceImpactBps: -12,
    });
    expect(normalizeStockQuote({ ...raw, executionMode: "SWAP", vendorName: "LiquidMesh" }, stockAddress)).toMatchObject({
      executionMode: "SWAP",
      vendorName: "LiquidMesh",
    });
    expect(normalizeStockQuote({ ...raw, executionMode: "UNKNOWN" }, stockAddress)).toBeNull();
    expect(normalizeStockQuote({ ...raw, binanceChainId: "1" }, stockAddress)).toBeNull();
    expect(normalizeStockQuote(raw, "0x0000000000000000000000000000000000000001")).toBeNull();
  });
});
