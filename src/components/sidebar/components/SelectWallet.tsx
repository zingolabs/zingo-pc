import React, { useContext } from "react";
import cstyles from "../../common/Common.module.css";
import { WalletType } from "../../appstate/types/WalletType";
import { ContextApp } from "../../../context/ContextAppState";
const { ipcRenderer } = window.require("electron");

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
  const { serverChainName, openErrorModal } = context;
  
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
            onChange={async (e) => {
              const id: number = Number(e.target.value);
              await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
              setWallets(id, wallets);

              setTimeout(() => {
                openErrorModal("Restart Zingo PC", "Zingo PC is going to restart in 5 seconds to connect to the new server/wallet"); 
              }, 10);
              setTimeout(() => {
                ipcRenderer.send("apprestart");    
              }, 5000);
            }}>
            {wallets.filter((w: WalletType) => w.chain_name === serverChainName).map((w: WalletType) => (
              <option key={w.id} value={w.id}>
                {w.alias + ' - ' + chains[w.chain_name] + ' [' + w.creationType + ']'}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
};

export default SelectWallet;