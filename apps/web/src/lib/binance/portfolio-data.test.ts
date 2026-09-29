import { describe, expect, it } from "vitest";
import { basketValuesFromWallet } from "./portfolio-data";
import { bscUsdtAddress } from "./quote-data";

const stockAddress = "0x1111111111111111111111111111111111111111";

describe("BSC wallet basket valuation", () => {
  it("values the requested stock and USDT with decimal precision", () => {
    expect(basketValuesFromWallet([{ tokenAssets: [
      { binanceChainId: "56", tokenContractAddress: stockAddress, balance: "0.187", tokenPrice: "100", isRiskToken: false },
      { binanceChainId: "56", tokenContractAddress: bscUsdtAddress, balance: "81.3", tokenPrice: "1", isRiskToken: false },
    ] }], stockAddress)).toEqual({ stockValueCents: 1870, stableValueCents: 8130 });
  });

  it("fails closed on a held token with no price or a risk flag", () => {
    expect(() => basketValuesFromWallet([{ tokenAssets: [
      { binanceChainId: "56", tokenContractAddress: stockAddress, balance: "1", isRiskToken: false },
    ] }], stockAddress)).toThrow(/price/i);
    expect(() => basketValuesFromWallet([{ tokenAssets: [
      { binanceChainId: "56", tokenContractAddress: stockAddress, balance: "1", tokenPrice: "100", isRiskToken: true },
    ] }], stockAddress)).toThrow(/risky/i);
  });
});
