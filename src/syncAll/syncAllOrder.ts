import { ServerChainNameEnum, WalletType } from "../components/appstate";

// Mainnet first: it is the one holding money, so it is the one worth having
// done if the run is cancelled part-way.
const CHAIN_ORDER: readonly ServerChainNameEnum[] = [
  ServerChainNameEnum.mainChainName,
  ServerChainNameEnum.testChainName,
  ServerChainNameEnum.regtestChainName,
];

/** The wallets in the order a run syncs them: by network, then by id. */
export function syncAllOrder(wallets: readonly WalletType[]): WalletType[] {
  const rank = (wallet: WalletType): number => {
    const index = CHAIN_ORDER.indexOf(wallet.chain_name);
    return index === -1 ? CHAIN_ORDER.length : index;
  };
  return [...wallets].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
}

export default syncAllOrder;
