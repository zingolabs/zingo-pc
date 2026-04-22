import React, { useContext } from "react";
import cstyles from "../../common/Common.module.css";
import { ContextApp } from "../../../context/ContextAppState";
import { ServerChainNameEnum, WalletType } from "../../appstate";
import { ipcRenderer } from "../../../electronBridge";

type SelectWalletProps = {
  navigateToLoadingScreenChangingWallet: () => void;
};

const SelectWallet = ({ navigateToLoadingScreenChangingWallet }: SelectWalletProps) => {
  const context = useContext(ContextApp);
  const { currentWallet, wallets, openErrorModal } = context;

  const walletsSorted = wallets.sort((a, b) => {
    const chainCmp = a.chain_name.localeCompare(b.chain_name);
    return chainCmp !== 0 ? chainCmp : a.id - b.id;
  });

  return (
    <>
      {currentWallet !== null && (
        <div style={{ justifyContent: "center", alignItems: "center", marginBottom: 20 }}>
          <select
            className={cstyles.inputbox}
            style={{ marginLeft: 7 }}
            value={currentWallet.id}
            onChange={async (e) => {
              openErrorModal("Change Wallet", "Opening the new active Wallet selected");
              const id: number = Number(e.target.value);
              await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
              navigateToLoadingScreenChangingWallet();
            }}
          >
            {walletsSorted.filter((w: WalletType) => w.chain_name === ServerChainNameEnum.mainChainName).length > 0 && (
              <optgroup label="MAINNET">
                {walletsSorted
                  .filter((w: WalletType) => w.chain_name === ServerChainNameEnum.mainChainName)
                  .map((w: WalletType) => (
                    <option key={w.id} value={w.id}>
                      {w.alias + " - [" + w.creationType + "]" + (w.id === currentWallet.id ? " \u2714" : "")}
                    </option>
                  ))}
              </optgroup>
            )}
            {walletsSorted.filter((w: WalletType) => w.chain_name === ServerChainNameEnum.testChainName).length > 0 && (
              <optgroup label="TESTNET">
                {walletsSorted
                  .filter((w: WalletType) => w.chain_name === ServerChainNameEnum.testChainName)
                  .map((w: WalletType) => (
                    <option key={w.id} value={w.id}>
                      {w.alias + " - [" + w.creationType + "]" + (w.id === currentWallet.id ? " \u2714" : "")}
                    </option>
                  ))}
              </optgroup>
            )}
            {walletsSorted.filter((w: WalletType) => w.chain_name === ServerChainNameEnum.regtestChainName).length >
              0 && (
              <optgroup label="REGTEST">
                {walletsSorted
                  .filter((w: WalletType) => w.chain_name === ServerChainNameEnum.regtestChainName)
                  .map((w: WalletType) => (
                    <option key={w.id} value={w.id}>
                      {w.alias + " - [" + w.creationType + "]" + (w.id === currentWallet.id ? " \u2714" : "")}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </div>
      )}
    </>
  );
};

export default SelectWallet;
