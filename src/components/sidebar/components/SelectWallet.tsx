import React, { useContext } from "react";
import cstyles from "../../common/Common.module.css";
import { WalletType } from "../../appstate/types/WalletType";
import { ContextApp } from "../../../context/ContextAppState";
const { ipcRenderer } = window.require("electron");

type SelectWalletProps = {
  navigateToLoadingScreenChangingWallet: () => void;
};

const chains = {
  "main": "Mainnet",
  "test": "Testnet",
  "regtest": "Regtest",
  "": "",
};

const SelectWallet = ({ navigateToLoadingScreenChangingWallet }: SelectWalletProps) => {
  const context = useContext(ContextApp);
  const { currentWallet, wallets } = context;

  const walletsSorted = wallets.sort((a, b) => {
    const chainCmp = a.chain_name.localeCompare(b.chain_name);
    return chainCmp !== 0 ? chainCmp : a.id - b.id;
  });
  
  return (
    <>
      {currentWallet !== null && (
        <div style={{ justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
          <select
            className={cstyles.inputbox}
            style={{ marginLeft: 7 }}
            value={currentWallet.id}
            onChange={async (e) => {
              const id: number = Number(e.target.value);
              await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
              navigateToLoadingScreenChangingWallet();
            }}>
            {walletsSorted.map((w: WalletType) => (
              <option key={w.id} value={w.id}>
                {w.alias + ' - ' + chains[w.chain_name || ''] + ' [' + w.creationType + ']'}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
};

export default SelectWallet;