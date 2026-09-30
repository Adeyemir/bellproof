import type { UnsignedEvmTransaction } from "./binance/swap-preflight";
import { bscUsdtAddress, evmAddressPattern } from "./binance/quote-data";

interface InjectedProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: "accountsChanged" | "chainChanged" | "disconnect", listener: () => void): void;
  removeListener?(event: "accountsChanged" | "chainChanged" | "disconnect", listener: () => void): void;
}

function provider(): InjectedProvider {
  const injected = (window as Window & { ethereum?: InjectedProvider }).ethereum;
  if (!injected) throw new Error("Install or open an EVM wallet to sign on BSC.");
  return injected;
}

export function watchWalletChanges(onChange: () => void): () => void {
  const injected = (window as Window & { ethereum?: InjectedProvider }).ethereum;
  if (!injected?.on) return () => {};
  injected.on("accountsChanged", onChange);
  injected.on("chainChanged", onChange);
  injected.on("disconnect", onChange);
  return () => {
    injected.removeListener?.("accountsChanged", onChange);
    injected.removeListener?.("chainChanged", onChange);
    injected.removeListener?.("disconnect", onChange);
  };
}

function stringResult(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Wallet returned an invalid ${label}.`);
  return value;
}

function decimalHex(value: string): string {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error("Invalid transaction quantity.");
  return `0x${BigInt(value).toString(16)}`;
}

export async function connectBscWallet(): Promise<string> {
  const accounts = await provider().request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || !evmAddressPattern.test(accounts[0])) throw new Error("Wallet returned no EVM address.");
  const chainId = stringResult(await provider().request({ method: "eth_chainId" }), "chain ID");
  if (BigInt(chainId) !== 56n) {
    try {
      await provider().request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== 4902) throw error;
      await provider().request({ method: "wallet_addEthereumChain", params: [{
        chainId: "0x38",
        chainName: "BNB Smart Chain",
        nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
        rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
        blockExplorerUrls: ["https://bscscan.com"],
      }] });
    }
  }
  await assertConnectedWallet(accounts[0]);
  return accounts[0];
}

export async function assertConnectedWallet(expectedAddress: string): Promise<void> {
  const [accounts, chainId] = await Promise.all([
    provider().request({ method: "eth_accounts" }),
    provider().request({ method: "eth_chainId" }),
  ]);
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || accounts[0].toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error("Connected wallet changed. Connect it again before signing.");
  }
  if (typeof chainId !== "string" || BigInt(chainId) !== 56n) throw new Error("Switch the wallet to BSC mainnet before signing.");
}

export async function sendWalletTransaction(tx: UnsignedEvmTransaction): Promise<string> {
  await assertConnectedWallet(tx.from);
  if (tx.chainId !== "56" || !evmAddressPattern.test(tx.to) || !/^0x[0-9a-fA-F]+$/.test(tx.data)) {
    throw new Error("Unsigned transaction failed the wallet boundary check.");
  }
  const request: Record<string, string> = {
    from: tx.from,
    to: tx.to,
    data: tx.data,
    value: decimalHex(tx.value),
  };
  if (tx.gas !== null) request.gas = decimalHex(tx.gas);
  if (tx.gasPrice !== null) request.gasPrice = decimalHex(tx.gasPrice);
  if (tx.nonce !== null) request.nonce = decimalHex(tx.nonce);
  return stringResult(await provider().request({ method: "eth_sendTransaction", params: [request] }), "transaction hash");
}

export interface WalletReceipt {
  transactionHash: string;
  blockNumber: string;
  status: string;
  gasUsed: string;
}

export async function waitForReceipt(hash: string): Promise<WalletReceipt> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Wallet returned an invalid transaction hash.");
  for (let attempt = 0; attempt < 45; attempt++) {
    const receipt = await provider().request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (receipt && typeof receipt === "object") {
      const row = receipt as Record<string, unknown>;
      const status = stringResult(row.status, "receipt status");
      const result = {
        transactionHash: stringResult(row.transactionHash, "receipt hash"),
        blockNumber: stringResult(row.blockNumber, "block number"),
        status,
        gasUsed: stringResult(row.gasUsed, "gas used"),
      };
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Transaction is still pending. Check the hash on BscScan: ${hash}`);
}

function balanceCall(address: string): string {
  if (!evmAddressPattern.test(address)) throw new Error("Invalid wallet address.");
  return `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

export async function readTokenBalances(walletAddress: string, stockAddress: string) {
  const data = balanceCall(walletAddress);
  const [usdt, stock] = await Promise.all([
    provider().request({ method: "eth_call", params: [{ to: bscUsdtAddress, data }, "latest"] }),
    provider().request({ method: "eth_call", params: [{ to: stockAddress, data }, "latest"] }),
  ]);
  return {
    usdt: BigInt(stringResult(usdt, "USDT balance")).toString(),
    stock: BigInt(stringResult(stock, "stock balance")).toString(),
    observedAtMs: Date.now(),
  };
}
