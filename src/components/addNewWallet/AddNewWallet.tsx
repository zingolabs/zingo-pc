import React, { useCallback, useContext, useEffect, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import cstyles from "../common/Common.module.css";
import styles from "./AddNewWallet.module.css";
import { ContextApp } from "../../context/ContextAppState";
import { CreationTypeEnum, PerformanceLevelEnum, ServerClass, ServerSelectionEnum, WalletType } from "../appstate";
import serverUrisList from "../../utils/serverUrisList";
import { ServerChainNameEnum } from "../appstate/enums/ServerChainNameEnum";
import Utils from "../../utils/utils";
import native from "../../native.node";
import { RouteComponentProps } from "react-router";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import RPC from "../../rpc/rpc";
const { ipcRenderer } = window.require("electron");

type AddNewWalletProps = {
  closeModal: () => void;
  setWallets: (ws: WalletType[]) => void;
  setCurrentWallet: (w: WalletType | null) => void;
  navigateToLoadingScreenChangingWallet: () => void;
  doSaveWallet: () => void;
  clearTimers: () => Promise<void>;
};

const AddNewWallet: React.FC<AddNewWalletProps & RouteComponentProps> = ({ 
  closeModal, 
  setWallets, 
  setCurrentWallet, 
  navigateToLoadingScreenChangingWallet,
  doSaveWallet,
  clearTimers,
  location,
}) => {
  let mode: 'addnew' | 'settings' | 'delete' = 'addnew';
  if (location.state) {
    const locationState = location.state as { 
      mode: 'addnew' | 'settings' | 'delete',
    };
    mode = locationState.mode;
  }
  const context = useContext(ContextApp);
  const { serverUris, openErrorModal, currentWallet, wallets, currentWalletOpenError } = context;

  const [newWalletType, setNewWalletType] = useState<'new' | 'seed' | 'ufvk' | 'file'>('new');
  const [seedPhrase, setSeedPhrase] = useState<string>('');
  const [birthday, setBirthday] = useState<number>(0);
  const [ufvk, setUfvk] = useState<string>('');
  const [file, setFile] = useState<string>('');
  
  const [alias, setAlias] = useState<string>('');
  const [performanceLevel, setPerformanceLevel] = useState<PerformanceLevelEnum>(PerformanceLevelEnum.High);

  const [selectedServer, setSelectedServer] = useState<string>("");
  const [selectedChain, setSelectedChain] = useState<ServerChainNameEnum | ''>("");
  const [selectedSelection, setSelectedSelection] = useState<ServerSelectionEnum | ''>("");

  const [autoServer, setAutoServer] = useState<string>("");
  const [customServer, setCustomServer] = useState<string>("");
  const [listServer, setListServer] = useState<string>("");
  
  const [customChain, setCustomChain] = useState<ServerChainNameEnum | ''>("");
  const [autoChain, setAutoChain] = useState<ServerChainNameEnum | ''>("");

  const [servers, setServers] = useState<ServerClass[]>(serverUris.length > 0 ? serverUris : serverUrisList().filter((s: ServerClass) => s.obsolete === false));

  const chains = {
    "main": "Mainnet",
    "test": "Testnet",
    "regtest": "Regtest",
    "": ""
  };

  const news = {
    "new":  "Create a New Wallet",
    "seed": "Restore Wallet from Seed Phrase",
    "ufvk": "Restore Wallet from Unified Full Viewing Key",
    "file": "Restore Wallet from an existent DAT file",
  }

  const initialServerValue = useCallback((server: string, chain_name: ServerChainNameEnum | '', selection: ServerSelectionEnum | '') => {
    if (selection === ServerSelectionEnum.custom) {
      setCustomServer(server);
      setCustomChain(chain_name);

      setListServer("");

      setAutoServer(server);
      // if the user have a custom server
      // pre-fill with the server's chain only for:
      // - MainNet
      // - TestNet
      // make no sense to select automatically for RegTest (no list)
      if (chain_name === ServerChainNameEnum.mainChainName || chain_name === ServerChainNameEnum.testChainName) {
        setAutoChain(chain_name);
      } else {
        // for RegTest -> TestNet.
        setAutoChain(ServerChainNameEnum.testChainName);
      }
    } else if (selection === ServerSelectionEnum.auto) {
      setAutoServer(server);
      setAutoChain(chain_name);

      setListServer("");

      setCustomServer("");
      setCustomChain("");
    } else { // list
      setListServer(server);

      setCustomServer("");
      setCustomChain("");

      setAutoServer(server);
      setAutoChain(chain_name);
    }
  }, []);

  useEffect(() => {
  }, [currentWallet, initialServerValue, mode]);

  useEffect(() => {
    (async () => {
      // Try to read the default server
      const settings = await ipcRenderer.invoke("loadSettings");
      const currServer: string = currentWallet ? currentWallet.uri : settings.serveruri; 
      const currChain: ServerChainNameEnum = currentWallet ? currentWallet.chain_name : settings.serverchain_name;
      const currSelection: ServerSelectionEnum = currentWallet ? currentWallet.selection : settings.serverselection;
      initialServerValue(currServer, currChain, currSelection);
      setSelectedServer(currServer);
      setSelectedChain(currChain);
      setSelectedSelection(currSelection);
      setServers(servers);
      if (mode !== 'addnew' && !!currentWallet) {
        setAlias(currentWallet.alias);
        setPerformanceLevel(currentWallet.performanceLevel);
        setFile(currentWallet.fileName);
      }
    })();
  }, [initialServerValue, currentWallet?.chain_name, currentWallet?.selection, currentWallet?.uri, serverUris, currentWallet, servers, mode]);

  const nextWalletName = () => {
    let maxId = !!wallets && wallets.length > 0 ? Math.max(...wallets.map(w => w.id)) : 3;
    if (maxId < 3) {
      maxId = 3;
    }
    let next =  maxId + 1;
    // we need to check if this file already exists 
    let nextWalletName = `zingo-wallet-${next}.dat`;

    while (true) {
      console.log(next, nextWalletName);
      const walletExistsResult: boolean = native.wallet_exists(selectedServer, selectedChain ? selectedChain : ServerChainNameEnum.mainChainName, performanceLevel, 3, nextWalletName);
      console.log(walletExistsResult);
      if (walletExistsResult) {
        next = next + 1;
        nextWalletName = `zingo-wallet-${next}.dat`;
        console.log('NEXT', next, nextWalletName);
      } else {
        break;
      }
    }

    return { next, nextWalletName };
  };


  const createNextWallet = async (id: number, wallet_name: string, alias: string) => {
    const currentWallet: WalletType = {
      id,
      fileName: wallet_name, // by default: zingo-wallet.dat
      alias, // by default: the first word of the seed phrase
      chain_name: selectedChain ? selectedChain : ServerChainNameEnum.mainChainName,
      creationType: newWalletType === 'ufvk' 
        ? CreationTypeEnum.Ufvk 
        : newWalletType === 'file' 
          ? CreationTypeEnum.File 
          : CreationTypeEnum.Seed,
      uri: selectedServer,
      selection: selectedSelection ? selectedSelection : ServerSelectionEnum.auto,
      performanceLevel: performanceLevel,
    };
    await ipcRenderer.invoke("wallets:add", currentWallet);
    // re-fetching wallets 
    const newWallets = await ipcRenderer.invoke("wallets:all");
    setWallets(newWallets);
    setCurrentWallet(currentWallet);
  };

  const doCreateNewWallet = async () => {
    try {
      const { next: id, nextWalletName: wallet_name } = nextWalletName();
      const result: string = native.init_new(selectedServer, selectedChain ? selectedChain : ServerChainNameEnum.mainChainName, performanceLevel, 3, wallet_name);

      if (!result || result.toLowerCase().startsWith("error")) {
        openErrorModal("Creating New wallet", result);
      } else {
        const resultJSON = await JSON.parse(result);
        const seed_phrase: string = resultJSON.seed_phrase;

        createNextWallet(id, wallet_name, alias ? alias : `${seed_phrase.split(' ')[0]}...`);

        await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: selectedServer });
        await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: selectedChain });
        await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selectedSelection });
        await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
        // save the wallet
        doSaveWallet();
        navigateToLoadingScreenChangingWallet();
      }
    } catch (error) {
      console.log(`Critical Error create new wallet ${error}`);
      openErrorModal('Creating New wallet', `${error}`);
    }
  };

  const doRestoreSeedWallet = async () => {
    try {
      const { next: id, nextWalletName: wallet_name } = nextWalletName();
      const result: string = native.init_from_seed(seedPhrase, birthday, selectedServer, selectedChain ? selectedChain : ServerChainNameEnum.mainChainName, performanceLevel, 3, wallet_name);
      if (!result || result.toLowerCase().startsWith("error")) {
        openErrorModal("Restoring wallet from seed", result);
      } else {
        const resultJSON = await JSON.parse(result);
        const seed_phrase: string = resultJSON.seed_phrase;

        createNextWallet(id, wallet_name, alias ? alias : `${seed_phrase.split(' ')[0]}...`);

        await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: selectedServer });
        await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: selectedChain });
        await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selectedSelection });
        await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
        // save the wallet
        doSaveWallet();
        navigateToLoadingScreenChangingWallet();
      }
    } catch (error) {
      console.log(`Critical Error restore from seed ${error}`);
      openErrorModal("Restoring wallet from seed", `${error}`);
    }
  };

  const doRestoreUfvkWallet = async () => {
    try {
      if (!ufvk.startsWith('uview')) {
        // the ufvk is not correct 
        openErrorModal("Parsing UFVK", "The prefix of the Unified Full Viewing Key is not valid");
        return;
      }
      if (selectedChain === ServerChainNameEnum.mainChainName && 
          (ufvk.startsWith('uviewtest') ||
           ufvk.startsWith('uviewregtest'))
      ) {
        // the ufvk is not correct
        openErrorModal("Parsing UFVK", "The prefix of the Unified Full Viewing Key is not valid");
        return;
      }
      if (selectedChain === ServerChainNameEnum.testChainName && 
          !ufvk.startsWith('uviewtest')
      ) {
        // the ufvk is not correct
        openErrorModal("Parsing UFVK", "The prefix of the Unified Full Viewing Key is not valid");
        return;
      }
      if (selectedChain === ServerChainNameEnum.regtestChainName && 
          !ufvk.startsWith('uviewregtest')
      ) {
        // the ufvk is not correct
        openErrorModal("Parsing UFVK", "The prefix of the Unified Full Viewing Key is not valid");
        return;
      }
      const { next: id, nextWalletName: wallet_name } = nextWalletName();
      const result: string = native.init_from_ufvk(ufvk, birthday, selectedServer, selectedChain ? selectedChain : ServerChainNameEnum.mainChainName, performanceLevel, 3, wallet_name);
      if (!result || result.toLowerCase().startsWith("error")) {
        openErrorModal("Restoring wallet from ufvk", result);
      } else {
        const resultJSON = await JSON.parse(result);
        const ufvk: string = resultJSON.ufvk;

        createNextWallet(id, wallet_name, alias ? alias : `${ufvk.substring(0, 10)}...`);

        await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: selectedServer });
        await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: selectedChain });
        await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selectedSelection });
        await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
        // save the wallet
        doSaveWallet();
        navigateToLoadingScreenChangingWallet();
      }
    } catch (error) {
      console.log(`Critical Error restore from ufvk ${error}`);
      openErrorModal("Restoring wallet from ufvk", `${error}`);
    }
  };

  const doRestoreFileWallet = async () => {
    try {
      // only needs the id, it have the wallet_name already
      const { next: id } = nextWalletName();
      const wallet_name: string = file;
      const result: string = native.init_from_b64(selectedServer, selectedChain ? selectedChain : ServerChainNameEnum.mainChainName, performanceLevel, 3, wallet_name);
      console.log(`Initialization: ${result}`);
      if (!result || result.toLowerCase().startsWith("error")) {
        openErrorModal("Restoring wallet from file", result);
      } else {
        createNextWallet(id, wallet_name, wallet_name);

        await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: selectedServer });
        await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: selectedChain });
        await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selectedSelection });
        await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
        // save the wallet
        doSaveWallet();
        navigateToLoadingScreenChangingWallet();
      }
    } catch (error) {
      console.log(`Critical Error restore from file ${error}`);
      openErrorModal("Restoring wallet from file", `${error}`);
    }
  };

  const doSave = async () => {
    if (!!currentWallet) {
      if (selectedChain !== currentWallet.chain_name) {
        openErrorModal(
          "Save Wallet Settings",
          "Change the server Chain/Network is not allowed",
        );
        return;
      }
      const currentWalletSave: WalletType = {
        id : currentWallet.id,
        fileName: currentWallet.fileName, // by default: zingo-wallet.dat 
        alias, // by default: the first word of the seed phrase
        chain_name: selectedChain ? selectedChain : ServerChainNameEnum.mainChainName,
        creationType: currentWallet.creationType,
        uri: selectedServer,
        selection: selectedSelection ? selectedSelection : ServerSelectionEnum.auto,
        performanceLevel: performanceLevel,
      };
      await ipcRenderer.invoke("wallets:update", currentWalletSave);
      // re-fetching wallets 
      const newWallets = await ipcRenderer.invoke("wallets:all");
      setWallets(newWallets);
      const needStart: boolean = selectedServer !== currentWallet.uri || performanceLevel !== currentWallet.performanceLevel;
      setCurrentWallet(currentWalletSave);
      if (needStart) {
        navigateToLoadingScreenChangingWallet();
      } else {
        closeModal();
      }
    }
  };

  const doDelete = async () => {
    if (!!currentWallet) {
      try {
        await clearTimers();
        const walletExistsResult: boolean = native.wallet_exists(
          currentWallet.uri, 
          currentWallet.chain_name, 
          currentWallet.performanceLevel, 
          3, 
          currentWallet.fileName,
        );
        console.log(walletExistsResult);
        if (walletExistsResult) {
          // interrupt syncing, just in case.
          if (!currentWalletOpenError) {
            const resultInterrupt: string = await native.stop_sync();
            console.log('~~~~~~~~~~~~~~ wallet', currentWallet);
            console.log("Stopping sync ...", resultInterrupt);
          }

          // remove the actual wallet
          await ipcRenderer.invoke("wallets:remove", currentWallet.id);
          await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: null });

          // re-fetching wallets 
          const newWallets = await ipcRenderer.invoke("wallets:all");
          setWallets(newWallets);

          setTimeout(async () => {
            navigateToLoadingScreenChangingWallet();
            // if the wallet was created by a file, don't delete the file.
            if (currentWallet.creationType !== CreationTypeEnum.File) {
              const resultDelete: string = await native.delete_wallet(
                currentWallet.uri, 
                currentWallet.chain_name, 
                currentWallet.performanceLevel, 
                3, 
                currentWallet.fileName 
                  ? currentWallet.fileName 
                  : 'zingo-wallet.dat',
              );
              console.log("deleting ...", resultDelete);
            }
            RPC.deinitialize();
            setCurrentWallet(null);
          }, 2000);
        }
      } catch (error) {
        console.log(`Critical Error delete wallet ${error}`);
        openErrorModal("Error Delete Wallet", `${error}`);
        return;
      }
    }
  };


  const submitAction = async () => {
    if (mode === 'addnew') {
      // check the fields 
      if (selectedSelection !== ServerSelectionEnum.auto && (!selectedServer || !selectedChain || !selectedSelection)) {
        return;
      }
      if (newWalletType === 'seed' && !seedPhrase) {
        return;
      }
      if (newWalletType === 'ufvk' && !ufvk) {
        return;
      }
      if (newWalletType === 'file' && !file) {
        return;
      }

      // run the option
      if (newWalletType === 'new') {
        doCreateNewWallet();
      }
      if (newWalletType === 'seed') {
        doRestoreSeedWallet();
      }
      if (newWalletType === 'ufvk') {
        doRestoreUfvkWallet();
      }
      if (newWalletType === 'file') {
        doRestoreFileWallet();
      }
    }
    if (mode === 'settings') {
      doSave();
    }
    if (mode === 'delete') {
      doDelete();
    }
  };

  const updateSeedPhrase = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSeedPhrase(e.target.value);
  };

  const updateUfvk = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUfvk(e.target.value);
  };

  const updateFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.value);
  };

  const updateBirthday = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBirthday(isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value));
  };

  const updateAlias = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAlias(e.target.value);
  };

  //console.log('render modal server', servers, selectedServer, selectedChain, selectedSelection);

  return (
    <ScrollPaneTop offsetHeight={20}>
      <div className={[cstyles.xlarge, cstyles.margintopsmall, cstyles.center].join(" ")}>
        {mode === 'addnew' 
          ? 'Add a New Wallet' 
          : mode === 'settings' 
            ? 'Wallet Settings'
            : 'Delete Wallet'}
      </div>

      <div className={styles.addnewwalletcontainer}>
        <div className={[cstyles.well, cstyles.verticalflex].join(" ")}>

          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center', flexWrap: 'nowrap' }}>
            <div className={cstyles.sublight}>Alias/Description Wallet</div>
            <input
              disabled={mode === 'delete'}
              type="text"
              className={cstyles.inputbox}
              style={{ width: '70%', marginLeft: "20px" }}
              value={alias}
              onChange={(e) => updateAlias(e)}
            />
          </div>

          {mode === 'addnew' && (
            <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center', flexWrap: 'nowrap' }}>
              <div className={cstyles.sublight}>Type of Wallet creation</div>
              <select
                className={cstyles.inputbox}
                style={{width: '80%', marginLeft: "20px" }}
                value={newWalletType}
                onChange={(e) => {
                  setNewWalletType(e.target.value as 'new' | 'seed' | 'ufvk' | 'file');
                }}
              >
                <option value="" disabled hidden>Select...</option> 
                <option value="new">{news["new"]}</option>
                <option value="seed">{news["seed"]}</option>
                <option value="ufvk">{news["ufvk"]}</option> 
                <option value="file">{news["file"]}</option> 
              </select>
            </div>
          )}

          {newWalletType === 'seed' && mode === 'addnew' && (
            <div style={{ margin: "10px" }}>
              <div className={[cstyles.sublight].join(" ")}>Please enter your seed phrase</div>
              <TextareaAutosize
                className={cstyles.inputbox}
                value={seedPhrase}
                onChange={(e) => updateSeedPhrase(e)}
              />
              <div className={[cstyles.sublight].join(" ")}>
                Wallet Birthday. If you don&rsquo;t know this, it is OK to enter &lsquo;0&rsquo;
              </div>
              <input
                type="number"
                className={cstyles.inputbox}
                value={birthday}
                onChange={(e) => updateBirthday(e)}
              />
            </div>
          )}

          {newWalletType === 'ufvk' && mode === 'addnew' && (
            <div style={{ margin: "10px" }}>
              <div className={[cstyles.sublight].join(" ")}>Please enter your Unified Full Viewing Key</div>
              <TextareaAutosize
                className={cstyles.inputbox}
                value={ufvk}
                onChange={(e) => updateUfvk(e)}
              />
              <div className={[cstyles.sublight].join(" ")}>
                Wallet Birthday. If you don&rsquo;t know this, it is OK to enter &lsquo;0&rsquo;
              </div>
              <input
                type="number"
                className={cstyles.inputbox}
                value={birthday}
                onChange={(e) => updateBirthday(e)}
              />
            </div>
          )}

          {newWalletType === 'file' && mode === 'addnew' && (
            <div style={{ margin: "10px" }}>
              <div className={[cstyles.sublight].join(" ")}>Please enter your Wallet File Name stored in the Zcash folder</div>
              <input
                type="text"
                className={cstyles.inputbox}
                style={{ width: '90%', marginLeft: "20px" }}
                value={file}
                onChange={(e) => updateFile(e)}
              />
            </div>
          )}

          {mode !== 'addnew' && (
            <div style={{ margin: "10px" }}>
              <div className={[cstyles.sublight].join(" ")}>File Name</div>
              <input
                disabled={true}
                type="text"
                className={cstyles.inputbox}
                style={{ width: '90%', marginLeft: "20px" }}
                value={file}
              />
            </div>
          )}

          {mode !== 'delete' && (
            <>
              <hr style={{ width: '100%', borderColor: Utils.getCssVariable('--color-primary') }} />

              <div style={{ margin: "10px" }}>
                <div className={[cstyles.sublight].join(" ")}>Server</div>
                <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems:'center' }}>
                  <input
                    checked={selectedSelection === ServerSelectionEnum.auto}
                    style={{ accentColor: Utils.getCssVariable('--color-primary') }}
                    type="radio" 
                    name="selection" 
                    value={ServerSelectionEnum.auto}
                    onClick={(e) => {
                      setSelectedSelection(ServerSelectionEnum.auto);
                      setSelectedServer(autoServer);
                      setSelectedChain(autoChain);
                    }} 
                    onChange={(e) => {
                      setSelectedSelection(ServerSelectionEnum.auto);
                      setSelectedServer(autoServer);
                      setSelectedChain(autoChain);
                    }}
                  />
                  Automatic
                  <select
                    disabled={selectedSelection !== "auto"}
                    className={cstyles.inputbox}
                    style={{ marginLeft: "20px", color: customChain === '' ? Utils.getCssVariable('--color-zingo') : undefined }}
                    value={autoChain}
                    onChange={(e) => {
                      const value = e.target.value as ServerChainNameEnum | ''; 
                      setAutoChain(value);
                      setSelectedChain(value);
                      setSelectedServer(servers.filter((s: ServerClass) => s.default && s.chain_name === value)[0].uri);
                    }}
                  > 
                    <option value="" disabled hidden>Select...</option> 
                    <option value="main">{chains["main"]}</option>
                    <option value="test">{chains["test"]}</option>
                  </select>
                </div>

                <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center' }}>
                  <input
                    checked={selectedSelection === ServerSelectionEnum.list}
                    style={{ accentColor: Utils.getCssVariable('--color-primary') }}
                    type="radio" 
                    name="selection" 
                    value={ServerSelectionEnum.list} 
                    onClick={(e) => {
                      setSelectedSelection(ServerSelectionEnum.list);
                      setSelectedServer(listServer);
                      if (!!listServer) {
                        setSelectedChain(servers.filter((s: ServerClass) => s.uri === listServer)[0].chain_name);
                      }
                    }} 
                    onChange={(e) => {
                      setSelectedSelection(ServerSelectionEnum.list);
                      setSelectedServer(listServer);
                      if (!!listServer) {
                        setSelectedChain(servers.filter((s: ServerClass) => s.uri === listServer)[0].chain_name);
                      }
                    }}
                  />
                  List
                  <select
                    disabled={selectedSelection !== "list"}
                    className={cstyles.inputbox}
                    style={{ marginLeft: "20px" }}
                    value={listServer}
                    onChange={(e) => {
                      setListServer(e.target.value);
                      setSelectedServer(e.target.value);
                      setSelectedChain(servers.filter((s: ServerClass) => s.uri === e.target.value)[0].chain_name);
                    }}>
                      <option key="" value="" disabled hidden></option>
                      {servers.map((s: ServerClass) => (
                        <option key={s.uri} value={s.uri}>{s.uri + ' - ' + chains[s.chain_name] + ' - ' + s.region + (s.latency ? (' _ ' + s.latency + ' ms.') : '')}</option>
                      ))}
                  </select>
                </div>

                <div style={{ margin: "10px" }}>
                  <input 
                    checked={selectedSelection === "custom"}
                    style={{ accentColor: Utils.getCssVariable('--color-primary') }}
                    type="radio" 
                    name="selection" 
                    value={"custom"} 
                    onClick={(e) => {
                      setSelectedSelection(ServerSelectionEnum.custom);
                      setSelectedServer(customServer);
                      setSelectedChain(customChain);
                    }} 
                    onChange={(e) => {
                      setSelectedSelection(ServerSelectionEnum.custom);
                      setSelectedServer(customServer);
                      setSelectedChain(customChain);
                    }} 
                  />
                  Custom
                  <div className={[cstyles.well, cstyles.horizontalflex].join(" ")}>
                    <div style={{ width: '75%', padding: 0, margin: 0, flexWrap: 'nowrap' }}>
                      URI 
                      <input
                        placeholder="https://------.---:---"
                        disabled={selectedSelection !== "custom"}
                        type="text"
                        className={cstyles.inputbox} 
                        style={{ marginLeft: "20px", width: '80%' }}
                        value={customServer}
                        onChange={(e) => {
                          setCustomServer(e.target.value);
                          setSelectedServer(e.target.value);
                        }}
                      />
                    </div>
                    <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center' }}>
                      Network 
                      <select
                        disabled={selectedSelection !== "custom"}
                        className={cstyles.inputbox}
                        style={{ marginLeft: "20px", color: customChain === '' ? Utils.getCssVariable('--color-zingo') : undefined }}
                        value={customChain}
                        onChange={(e) => {
                          setCustomChain(e.target.value as ServerChainNameEnum | '');
                          setSelectedChain(e.target.value as ServerChainNameEnum | '');
                        }}
                      >
                        <option value="" disabled hidden>Select...</option> 
                        <option value="main">{chains["main"]}</option>
                        <option value="test">{chains["test"]}</option>
                        <option value="regtest">{chains["regtest"]}</option> 
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          <hr style={{ width: '100%', borderColor: Utils.getCssVariable('--color-primary') }} />

          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: 'center', flexWrap: 'nowrap' }}>
            <div className={[cstyles.sublight].join(" ")}>Sync Performance Level</div>
            <select
              disabled={mode === 'delete'}
              className={cstyles.inputbox}
              style={{width: '80%', marginLeft: "20px" }}
              value={performanceLevel}
              onChange={(e) => {
                setPerformanceLevel(e.target.value as PerformanceLevelEnum);
              }}
            >
              <option value="" disabled hidden>Select...</option> 
              <option value={PerformanceLevelEnum.Low}>{PerformanceLevelEnum.Low}</option>
              <option value={PerformanceLevelEnum.Medium}>{PerformanceLevelEnum.Medium}</option>
              <option value={PerformanceLevelEnum.High}>{PerformanceLevelEnum.High}</option>
              <option value={PerformanceLevelEnum.Maximum}>{PerformanceLevelEnum.Maximum}</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: "20px" }} className={cstyles.buttoncontainer}>
          <button 
            type="button" 
            className={cstyles.primarybutton} 
            onClick={submitAction} 
          >
            {mode === 'addnew' 
              ? (newWalletType === 'new' ? 'Create Wallet' : 'Restore Wallet')
              : mode === 'settings'
                ? 'Save Wallet Settings'
                : 'Delete Wallet'}
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={() => closeModal()}>
            Close
          </button>
        </div>
      </div>
    </ScrollPaneTop>
  );
}

export default AddNewWallet;