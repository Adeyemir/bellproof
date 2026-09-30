import { describe, expect, it } from "vitest";
import { bscUsdtAddress, type StockQuote } from "./quote-data";
import { expectedApprovalCalldata, validateSwapBuild, type RawSwapBuild } from "./swap-preflight";

const wallet = "0x32a0b6d4dbe7b88c209b4bd3c8137043cf26a5b9";
const stock = "0xa9ee28c80f960b889dfbd1902055218cba016f75";
const router = "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5";
const quote: StockQuote = {
  quoteId: "fresh-quote",
  vendorName: "LiquidMesh",
  executionMode: "SWAP",
  inputAmount: "10000000000000000000",
  outputAmount: "43652486668116141",
  outputDecimals: 18,
  outputSymbol: "NVDAon",
  tradeFeeUsd: "0.02",
  priceImpactBps: 0.01,
  approveTarget: router,
};
const approvalData = expectedApprovalCalldata(router, quote.inputAmount);
const build: RawSwapBuild = {
  executionMode: "SWAP",
  routerResult: {
    binanceChainId: "56",
    vendorName: "LiquidMesh",
    fromTokenAmount: quote.inputAmount,
    toTokenAmount: quote.outputAmount,
    fromToken: { tokenContractAddress: bscUsdtAddress },
    toToken: { tokenContractAddress: stock },
  },
  tx: {
    from: wallet,
    to: router,
    data: "0x1234abcd",
    value: "0",
    gas: "450000",
    gasPrice: "100000000",
    minReceiveAmount: "43434224234775560",
    slippagePercent: "0.5",
    signatureData: [JSON.stringify({ approveContract: router, approveTxCalldata: approvalData })],
  },
};

describe("exact stock swap preflight", () => {
  it("preserves the transaction and approval bytes after matching the selected quote", () => {
    const result = validateSwapBuild(build, quote, wallet, stock, "0.5");
    expect(result.swap).toMatchObject({ chainId: "56", from: wallet, to: router, data: "0x1234abcd", nonce: null });
    expect(result.approval).toMatchObject({ to: bscUsdtAddress, data: approvalData });
    expect(result.minReceiveAmount).toBe("43434224234775560");
  });

  it("blocks a changed receiver, approval amount, or output token", () => {
    expect(() => validateSwapBuild({ ...build, tx: { ...build.tx, from: stock } }, quote, wallet, stock, "0.5"))
      .toThrow("does not match");
    expect(() => validateSwapBuild({
      ...build,
      tx: { ...build.tx, signatureData: [JSON.stringify({ approveContract: router, approveTxCalldata: expectedApprovalCalldata(router, "1") })] },
    }, quote, wallet, stock, "0.5")).toThrow("Approval spender or amount");
    expect(() => validateSwapBuild({
      ...build,
      routerResult: { ...build.routerResult, toToken: { tokenContractAddress: wallet } },
    }, quote, wallet, stock, "0.5")).toThrow("does not match");
  });

  it("rejects a transaction whose minimum output permits more than the quoted slippage", () => {
    expect(() => validateSwapBuild({
      ...build,
      tx: { ...build.tx, minReceiveAmount: "43434224234775559" },
    }, quote, wallet, stock, "0.5")).toThrow("allowed slippage");
  });
});
