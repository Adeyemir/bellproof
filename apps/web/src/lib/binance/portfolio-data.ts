import { bscUsdtAddress, evmAddressPattern } from "./quote-data";

interface WalletAsset {
  binanceChainId?: string;
  tokenContractAddress?: string;
  balance?: string;
  tokenPrice?: string;
  isRiskToken?: boolean;
}

export interface WalletBalanceGroup {
  tokenAssets?: WalletAsset[];
}

const scale = BigInt("1000000000000000000");

function fixed18(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)) {
    throw new Error("Wallet balance or price is missing or malformed.");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * scale + BigInt(fraction.padEnd(18, "0") || "0");
}

function valueCents(asset: WalletAsset | undefined): number {
  if (!asset) return 0;
  if (asset.isRiskToken) throw new Error("A basket token is flagged as risky.");
  const balance = fixed18(asset.balance ?? "");
  if (balance === BigInt(0)) return 0;
  const price = fixed18(asset.tokenPrice ?? "");
  if (price === BigInt(0)) throw new Error("A held basket token has no USD price.");
  const cents = (balance * price * BigInt(100) + scale * scale / BigInt(2)) / (scale * scale);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Basket value is too large.");
  return Number(cents);
}

export function basketValuesFromWallet(
  groups: WalletBalanceGroup[],
  stockAddress: string,
): { stockValueCents: number; stableValueCents: number } {
  if (!evmAddressPattern.test(stockAddress) || !Array.isArray(groups)) {
    throw new Error("Invalid BSC basket response.");
  }
  const assets = groups.flatMap((group) => {
    if (!Array.isArray(group.tokenAssets)) throw new Error("Invalid wallet token list.");
    return group.tokenAssets;
  });
  const find = (address: string) => {
    const matched = assets.filter(
      (asset) => asset.binanceChainId === "56" &&
        asset.tokenContractAddress?.toLowerCase() === address.toLowerCase(),
    );
    if (matched.length > 1) throw new Error("Duplicate wallet token balance.");
    return matched[0];
  };
  return {
    stockValueCents: valueCents(find(stockAddress)),
    stableValueCents: valueCents(find(bscUsdtAddress)),
  };
}
