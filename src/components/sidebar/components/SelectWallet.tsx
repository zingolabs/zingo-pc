import React from "react";
import cstyles from "../../common/Common.module.css";
import { WalletType } from "../../appstate/types/WalletType";

type SelectWalletProps = {
  currentWalletId: number | null;
  wallets: WalletType[];
  setWallets: (c: number, w: WalletType[]) => void;
};

const chains = {
  "main": "Mainnet",
  "test": "Testnet",
  "regtest": "Regtest",
};

const SelectWallet = ({ currentWalletId, wallets, setWallets }: SelectWalletProps) => {
  return (
    <>
      {currentWalletId !== null && (
        <div style={{ justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
          <select
            disabled={wallets.length === 1}
            className={cstyles.inputbox}
            style={{ marginLeft: 7 }}
            value={currentWalletId}
            onChange={(e) => {
              const id: number = Number(e.target.value);
              setWallets(id, wallets);
            }}>
            {wallets.map((w: WalletType) => (
              <option key={w.id} value={w.id}>
                {w.alias + (w.fileName ? (' - ' + w.fileName) : '') + ' - ' + chains[w.serverchain_name]}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
};

export default SelectWallet;