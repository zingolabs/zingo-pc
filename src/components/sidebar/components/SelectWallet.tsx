import React, { useContext } from "react";
import cstyles from "../../common/Common.module.css";
import { WalletType } from "../../appstate/types/WalletType";
import { ContextApp } from "../../../context/ContextAppState";

type SelectWalletProps = {
  currentWalletId: number | null;
  wallets: WalletType[];
  setWallets: (c: number | null, w: WalletType[]) => void;
};

const chains = {
  "main": "Mainnet",
  "test": "Testnet",
  "regtest": "Regtest",
};

const SelectWallet = ({ currentWalletId, wallets, setWallets }: SelectWalletProps) => {
  const context = useContext(ContextApp);
  const { serverChainName } = context;
  
  console.log('SIDEBAR ---->', currentWalletId, wallets);
  return (
    <>
      {currentWalletId !== null && (
        <div style={{ justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
          <select
            disabled={wallets.filter((w: WalletType) => w.chain_name === serverChainName).length === 1}
            className={cstyles.inputbox}
            style={{ marginLeft: 7 }}
            value={currentWalletId}
            onChange={(e) => {
              const id: number = Number(e.target.value);
              setWallets(id, wallets);
            }}>
            {wallets.filter((w: WalletType) => w.chain_name === serverChainName).map((w: WalletType) => (
              <option key={w.id} value={w.id}>
                {w.alias + (w.fileName ? (' - ' + w.fileName) : '') + ' - ' + chains[w.chain_name]}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
};

export default SelectWallet;