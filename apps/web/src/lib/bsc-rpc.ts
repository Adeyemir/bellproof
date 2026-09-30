import { bscUsdtAddress, evmAddressPattern } from "./binance/quote-data";

const rpcUrl = process.env.BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org";
const quantityPattern = /^0x[0-9a-fA-F]+$/;

async function rpc(method: string, params: unknown[]): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`BSC RPC returned HTTP ${response.status}`);
  const body: { result?: unknown; error?: { message?: string } } = await response.json();
  if (body.error) throw new Error(`BSC RPC ${method}: ${body.error.message || "request failed"}`);
  if (typeof body.result !== "string" || !quantityPattern.test(body.result)) {
    throw new Error(`BSC RPC returned an invalid ${method} result`);
  }
  return body.result;
}

function encodedAddress(address: string): string {
  if (!evmAddressPattern.test(address)) throw new Error("Invalid BSC address");
  return address.slice(2).toLowerCase().padStart(64, "0");
}

export interface BscWalletState {
  chainId: "56";
  usdtBalance: string;
  usdtAllowance: string;
  bnbBalance: string;
  gasPrice: string;
  observedAtMs: number;
}

export async function readBscWalletState(walletAddress: string, spender: string): Promise<BscWalletState> {
  const wallet = encodedAddress(walletAddress);
  const allowanceData = `0xdd62ed3e${wallet}${encodedAddress(spender)}`;
  const [chainId, usdtBalance, usdtAllowance, bnbBalance, gasPrice] = await Promise.all([
    rpc("eth_chainId", []),
    rpc("eth_call", [{ to: bscUsdtAddress, data: `0x70a08231${wallet}` }, "latest"]),
    rpc("eth_call", [{ to: bscUsdtAddress, data: allowanceData }, "latest"]),
    rpc("eth_getBalance", [walletAddress, "latest"]),
    rpc("eth_gasPrice", []),
  ]);
  if (BigInt(chainId) !== 56n) throw new Error("BSC RPC returned the wrong chain");
  return {
    chainId: "56",
    usdtBalance: BigInt(usdtBalance).toString(),
    usdtAllowance: BigInt(usdtAllowance).toString(),
    bnbBalance: BigInt(bnbBalance).toString(),
    gasPrice: BigInt(gasPrice).toString(),
    observedAtMs: Date.now(),
  };
}
