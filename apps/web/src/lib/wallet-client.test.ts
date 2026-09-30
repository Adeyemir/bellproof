import { afterEach, describe, expect, it, vi } from "vitest";
import { connectBscWallet, sendWalletTransaction, watchWalletChanges } from "./wallet-client";
import type { UnsignedEvmTransaction } from "./binance/swap-preflight";

const wallet = "0x32a0b6d4dbe7b88c209b4bd3c8137043cf26a5b9";
const router = "0xB44446b0c8E56988c34f7Ff73Ae904982b5FdDA5";
const tx: UnsignedEvmTransaction = {
  chainId: "56", from: wallet, to: router, data: "0x1234", value: "0",
  gas: "350000", gasPrice: "50000000", maxPriorityFeePerGas: null, nonce: null,
};

afterEach(() => vi.unstubAllGlobals());

describe("injected BSC signing boundary", () => {
  it("submits only the validated address on chain 56 with exact transaction fields", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") return [wallet];
      if (method === "eth_chainId") return "0x38";
      if (method === "eth_sendTransaction") return `0x${"a".repeat(64)}`;
      throw new Error(`Unexpected method: ${method}`);
    });
    vi.stubGlobal("window", { ethereum: { request } });
    await sendWalletTransaction(tx);
    expect(request).toHaveBeenCalledWith({ method: "eth_sendTransaction", params: [{
      from: wallet, to: router, data: "0x1234", value: "0x0", gas: "0x55730", gasPrice: "0x2faf080",
    }] });
  });

  it("refuses a changed connected account before asking for a signature", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => method === "eth_accounts" ? [router] : "0x38");
    vi.stubGlobal("window", { ethereum: { request } });
    await expect(sendWalletTransaction(tx)).rejects.toThrow("Connected wallet changed");
    expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: "eth_sendTransaction" }));
  });

  it("requests a switch to BSC when the injected wallet is on another chain", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [wallet];
      if (method === "eth_chainId") return request.mock.calls.some(([call]) => call.method === "wallet_switchEthereumChain") ? "0x38" : "0x1";
      if (method === "wallet_switchEthereumChain") return null;
      throw new Error(`Unexpected method: ${method}`);
    });
    vi.stubGlobal("window", { ethereum: { request } });
    await expect(connectBscWallet()).resolves.toBe(wallet);
    expect(request).toHaveBeenCalledWith({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
  });

  it("detects account and chain changes and removes both listeners", () => {
    const listeners = new Map<string, () => void>();
    const on = vi.fn((event: string, listener: () => void) => listeners.set(event, listener));
    const removeListener = vi.fn((event: string) => listeners.delete(event));
    vi.stubGlobal("window", { ethereum: { request: vi.fn(), on, removeListener } });
    const changed = vi.fn();
    const stop = watchWalletChanges(changed);
    listeners.get("accountsChanged")?.();
    listeners.get("chainChanged")?.();
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
    expect(listeners.size).toBe(0);
  });
});
