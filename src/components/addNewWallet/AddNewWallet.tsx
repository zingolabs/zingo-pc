import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import cstyles from "../common/Common.module.css";
import styles from "./AddNewWallet.module.css";
import { ContextApp } from "../../context/ContextAppState";
import {
  CreationTypeEnum,
  PerformanceLevelEnum,
  ServerClass,
  ServerSelectionEnum,
  WalletType,
  ServerChainNameEnum,
} from "../appstate";
import serverUrisList from "../../utils/serverUrisList";
import Utils from "../../utils/utils";
import { native, ipcRenderer } from "../../electronBridge";
import { RouteComponentProps } from "react-router";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import RPC from "../../rpc/rpc";

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
  let mode: "addnew" | "settings" | "delete" = "addnew";
  if (location.state) {
    const locationState = location.state as {
      mode: "addnew" | "settings" | "delete";
    };
    mode = locationState.mode;
  }
  const context = useContext(ContextApp);
  const { serverUris, openErrorModal, closeErrorModal, currentWallet, wallets, currentWalletOpenError } = context;

  const [newWalletType, setNewWalletType] = useState<"new" | "seed" | "ufvk" | "file">("new");
  const [seedPhrase, setSeedPhrase] = useState<string>("");
  const [birthday, setBirthday] = useState<string>("");
  const [ufvk, setUfvk] = useState<string>("");
  const [file, setFile] = useState<string>("");

  const [alias, setAlias] = useState<string>("");
  const [performanceLevel, setPerformanceLevel] = useState<PerformanceLevelEnum>(PerformanceLevelEnum.High);

  const [selectedServer, setSelectedServer] = useState<string>("");
  const [selectedChain, setSelectedChain] = useState<ServerChainNameEnum | "">("");
  const [selectedSelection, setSelectedSelection] = useState<ServerSelectionEnum | "">("");

  const [autoServer, setAutoServer] = useState<string>("");
  const [customServer, setCustomServer] = useState<string>("");
  const [listServer, setListServer] = useState<string>("");

  //const [customChain, setCustomChain] = useState<ServerChainNameEnum | ''>("");
  //const [autoChain, setAutoChain] = useState<ServerChainNameEnum | ''>("");

  const [servers, setServers] = useState<ServerClass[]>(
    serverUris.length > 0 ? serverUris : serverUrisList().filter((s: ServerClass) => s.obsolete === false),
  );
  const [serverExpanded, setServerExpanded] = useState<boolean>(false);

  const isSubmittingRef = useRef(false);

  const chains = {
    main: "Mainnet",
    test: "Testnet",
    regtest: "Regtest",
    "": "",
  };

  const news = {
    new: "Create a New Wallet",
    seed: "Restore Wallet from Seed Phrase",
    ufvk: "Restore Wallet from Unified Full Viewing Key",
    file: "Restore Wallet from an existent DAT file",
  };

  const activationHeight = {
    main: 419200,
    test: 280000,
    regtest: 1,
    "": 1,
  };

  const initialServerValue = useCallback(
    (server: string, chain_name: ServerChainNameEnum | "", selection: ServerSelectionEnum | "") => {
      if (selection === ServerSelectionEnum.custom) {
        setCustomServer(server);

        setListServer("");

        setAutoServer(server);
      } else if (selection === ServerSelectionEnum.auto) {
        setAutoServer(server);

        setListServer("");

        setCustomServer("");
      } else {
        // list
        setListServer(server);

        setCustomServer("");

        setAutoServer(server);
      }
    },
    [],
  );

  useEffect(() => {}, [currentWallet, initialServerValue, mode]);

  useEffect(() => {
    (async () => {
      // Try to read the default server
      const settings = await ipcRenderer.invoke("loadSettings");
      const currServer: string = currentWallet ? currentWallet.uri : settings.serveruri;
      const currChain: ServerChainNameEnum = currentWallet ? currentWallet.chain_name : settings.serverchain_name;
      const currSelection: ServerSelectionEnum = currentWallet ? currentWallet.selection : settings.serverselection;
      const safeChain = currChain || "";
      const safeServer = currServer || "";
      const safeSelection = currSelection || "";
      initialServerValue(safeServer, safeChain, safeSelection as ServerSelectionEnum | "");
      setSelectedServer(safeServer);
      setSelectedChain(safeChain);
      setSelectedSelection(safeSelection as ServerSelectionEnum | "");
      setServers(servers);
      if (mode !== "addnew" && !!currentWallet) {
        setAlias(currentWallet.alias);
        setPerformanceLevel(currentWallet.performanceLevel);
        setFile(currentWallet.fileName);
      }
    })();
  }, [
    initialServerValue,
    currentWallet?.chain_name,
    currentWallet?.selection,
    currentWallet?.uri,
    serverUris,
    currentWallet,
    servers,
    mode,
  ]);

  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const nextWalletName = async () => {
    let maxId = !!wallets && wallets.length > 0 ? Math.max(...wallets.map((w) => w.id)) : 3;
    if (maxId < 3) {
      maxId = 3;
    }
    let next = maxId + 1;
    // we need to check if this file already exists
    let nextWalletName = `zingo-wallet-${next}.dat`;

    while (true) {
      console.log(next, nextWalletName);
      const walletExistsResult: boolean = await native.wallet_exists(
        selectedServer,
        selectedChain ? selectedChain : ServerChainNameEnum.mainChainName,
        performanceLevel,
        3,
        nextWalletName,
      );
      console.log(walletExistsResult);
      if (walletExistsResult) {
        next = next + 1;
        nextWalletName = `zingo-wallet-${next}.dat`;
        console.log("NEXT", next, nextWalletName);
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
      creationType:
        newWalletType === "ufvk"
          ? CreationTypeEnum.Ufvk
          : newWalletType === "file"
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
      const { next: id, nextWalletName: wallet_name } = await nextWalletName();
      const result: string = await native.init_new(
        selectedServer,
        selectedChain ? selectedChain : ServerChainNameEnum.mainChainName,
        performanceLevel,
        3,
        wallet_name,
      );

      if (!result || result.toLowerCase().startsWith("error")) {
        openErrorModal("Creating New wallet", result);
        // restore the previous wallet
        loadCurrentWallet();
      } else {
        const resultJSON = await JSON.parse(result);
        const seed_phrase: string = resultJSON.seed_phrase;

        await createNextWallet(id, wallet_name, alias ? alias : `${seed_phrase.split(" ")[0]}...`);

        await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: selectedServer });
        await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: selectedChain });
        await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selectedSelection });
        await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
        // save the wallet
        doSaveWallet();
        await delay(1000);
        navigateToLoadingScreenChangingWallet();
      }
    } catch (error) {
      console.log(`Critical Error create new wallet ${error}`);
      openErrorModal("Creating New wallet", `${error}`);
      // restore the previous wallet
      loadCurrentWallet();
    }
  };

  const doRestoreSeedWallet = async () => {
    try {
      const { next: id, nextWalletName: wallet_name } = await nextWalletName();
      const result: string = await native.init_from_seed(
        seedPhrase,
        Number(birthday),
        selectedServer,
        selectedChain ? selectedChain : ServerChainNameEnum.mainChainName,
        performanceLevel,
        3,
        wallet_name,
      );
      if (!result || result.toLowerCase().startsWith("error")) {
        openErrorModal("Restoring wallet from seed", result);
        // restore the previous wallet
        loadCurrentWallet();
      } else {
        const resultJSON = await JSON.parse(result);
        const seed_phrase: string = resultJSON.seed_phrase;

        await createNextWallet(id, wallet_name, alias ? alias : `${seed_phrase.split(" ")[0]}...`);

        await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: selectedServer });
        await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: selectedChain });
        await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selectedSelection });
        await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
        // save the wallet
        doSaveWallet();
        await delay(1000);
        navigateToLoadingScreenChangingWallet();
      }
    } catch (error) {
      console.log(`Critical Error restore from seed ${error}`);
      openErrorModal("Restoring wallet from seed", `${error}`);
      // restore the previous wallet
      loadCurrentWallet();
    }
  };

  const doRestoreUfvkWallet = async () => {
    try {
      if (!ufvk.startsWith("uview")) {
        // the ufvk is not correct
        openErrorModal("Parsing UFVK", "The prefix of the Unified Full Viewing Key is not valid");
        return;
      }
      if (
        selectedChain === ServerChainNameEnum.mainChainName &&
        (ufvk.startsWith("uviewtest") || ufvk.startsWith("uviewregtest"))
      ) {
        // the ufvk is not correct
        openErrorModal("Parsing UFVK", "The prefix of the Unified Full Viewing Key is not valid");
        return;
      }
      if (selectedChain === ServerChainNameEnum.testChainName && !ufvk.startsWith("uviewtest")) {
        // the ufvk is not correct
        openErrorModal("Parsing UFVK", "The prefix of the Unified Full Viewing Key is not valid");
        return;
      }
      if (selectedChain === ServerChainNameEnum.regtestChainName && !ufvk.startsWith("uviewregtest")) {
        // the ufvk is not correct
        openErrorModal("Parsing UFVK", "The prefix of the Unified Full Viewing Key is not valid");
        return;
      }
      const { next: id, nextWalletName: wallet_name } = await nextWalletName();
      const result: string = await native.init_from_ufvk(
        ufvk,
        Number(birthday),
        selectedServer,
        selectedChain ? selectedChain : ServerChainNameEnum.mainChainName,
        performanceLevel,
        3,
        wallet_name,
      );
      if (!result || result.toLowerCase().startsWith("error")) {
        openErrorModal("Restoring wallet from ufvk", result);
        // restore the previous wallet
        loadCurrentWallet();
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
        await delay(1000);
        navigateToLoadingScreenChangingWallet();
      }
    } catch (error) {
      console.log(`Critical Error restore from ufvk ${error}`);
      openErrorModal("Restoring wallet from ufvk", `${error}`);
      // restore the previous wallet
      loadCurrentWallet();
    }
  };

  const doRestoreFileWallet = async () => {
    try {
      // only needs the id, it have the wallet_name already
      const { next: id } = await nextWalletName();
      const wallet_name: string = file;
      const result: string = await native.init_from_b64(
        selectedServer,
        selectedChain ? selectedChain : ServerChainNameEnum.mainChainName,
        performanceLevel,
        3,
        wallet_name,
      );
      console.log(`Initialization: ${result}`);
      if (!result || result.toLowerCase().startsWith("error")) {
        openErrorModal("Restoring wallet from file", result);
        // restore the previous wallet
        loadCurrentWallet();
      } else {
        const resultJSON = await JSON.parse(result);
        const birthday: number = resultJSON.birthday;

        if (birthday < activationHeight[selectedChain]) {
          openErrorModal(
            "Restoring wallet from file",
            `The birthday found ${birthday} is invalid. The sync process is not going to work.`,
          );
        }

        await createNextWallet(id, wallet_name, alias ? alias : wallet_name);

        await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: selectedServer });
        await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: selectedChain });
        await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selectedSelection });
        await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
        // save the wallet
        doSaveWallet();
        await delay(1000);
        navigateToLoadingScreenChangingWallet();
      }
    } catch (error) {
      console.log(`Critical Error restore from file ${error}`);
      openErrorModal("Restoring wallet from file", `${error}`);
      // restore the previous wallet
      loadCurrentWallet();
    }
  };

  const loadCurrentWallet = async () => {
    if (currentWallet) {
      const result: string = await native.init_from_b64(
        currentWallet.uri,
        currentWallet.chain_name,
        currentWallet.performanceLevel,
        3,
        currentWallet.fileName,
      );
      if (!result || result.toLowerCase().startsWith("error")) {
        openErrorModal("Loading current wallet", result);
      }
    }
  };

  const calculateLatency = async (server: ServerClass, _index: number) => {
    const start: number = Date.now();
    let latency = null;

    try {
      const resp: string = await native.get_latest_block_server(server.uri);

      const end: number = Date.now();
      if (resp && !resp.toLowerCase().startsWith("error")) {
        latency = end - start;
      }

      console.log("Checking SERVER", server, latency);
    } catch (error) {
      console.log(`Critical Error calculate server latency ${error}`);
    }

    return latency;
  };

  const checkingServer = async (server: ServerClass): Promise<ServerClass | null> => {
    // 15 seconds max.
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15 * 1000));

    const validServersPromises = [server].map(
      (server: ServerClass) =>
        new Promise<ServerClass>(async (resolve) => {
          const latency = await calculateLatency(server, servers.indexOf(server));
          if (latency !== null) {
            resolve({ ...server, latency });
          }
        }),
    );

    const fastestServer = await Promise.race([...validServersPromises, timeoutPromise]);

    return fastestServer;
  };

  const doSave = async () => {
    if (!!currentWallet) {
      if (selectedChain !== currentWallet.chain_name) {
        openErrorModal("Save Wallet Settings", "Change the server Chain/Network is not allowed");
        return;
      }
      // verify the server right here
      if (selectedServer !== currentWallet.uri) {
        openErrorModal(
          "Save Wallet Settings",
          "CHecking the new selected server, this process can take a while, 15 seconds maximum.",
        );
        const serverFaster = await checkingServer({
          uri: selectedServer,
          region: "",
          chain_name: selectedChain,
          latency: null,
          default: false,
          obsolete: false,
        } as ServerClass);
        if (!serverFaster) {
          openErrorModal("Save Wallet Settings", "This server is not working properly, choose another one.");
          return;
        }
      }
      const currentWalletSave: WalletType = {
        id: currentWallet.id,
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
      const needStart: boolean =
        selectedServer !== currentWallet.uri ||
        performanceLevel !== currentWallet.performanceLevel ||
        selectedSelection === ServerSelectionEnum.auto;
      setCurrentWallet(currentWalletSave);
      if (needStart) {
        openErrorModal(
          "Save Wallet Settings",
          selectedServer !== currentWallet.uri || selectedSelection === ServerSelectionEnum.auto
            ? "Opening the active Wallet with the New Server."
            : "Opening the active Wallet with the New Performance Level",
        );
        await delay(1000);
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
        const walletExistsResult: boolean = await native.wallet_exists(
          currentWallet.uri,
          currentWallet.chain_name,
          currentWallet.performanceLevel,
          3,
          currentWallet.fileName,
        );
        console.log(walletExistsResult);
        if (walletExistsResult) {
          // interrupt syncing, just in case.
          // only if the App is going to delete the DAT file.
          if (!currentWalletOpenError && currentWallet.creationType !== CreationTypeEnum.File) {
            // doesn't matter if stop sync fails, let's delete it.
            try {
              const resultInterrupt: string = await native.stop_sync();
              console.log("Stopping sync ...", resultInterrupt);
            } catch (error) {
              console.log(`Stopping sync Error ${error}`);
            }
          }
          await RPC.deinitialize();

          // remove the actual wallet
          await ipcRenderer.invoke("wallets:remove", currentWallet.id);
          await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: null });

          // re-fetching wallets
          const newWallets: WalletType[] = await ipcRenderer.invoke("wallets:all");
          setWallets(newWallets);

          // if the wallet was created by a file, don't delete the file.
          if (currentWallet.creationType !== CreationTypeEnum.File) {
            const resultDelete: string = await native.delete_wallet(
              currentWallet.uri,
              currentWallet.chain_name,
              currentWallet.performanceLevel,
              3,
              currentWallet.fileName ? currentWallet.fileName : "zingo-wallet.dat",
            );
            console.log("deleting ...", resultDelete);
          }
          setCurrentWallet(null);
          await delay(1000);
          if (!!newWallets && newWallets.length > 0) {
            navigateToLoadingScreenChangingWallet();
          } else {
            closeModal();
            closeErrorModal();
          }
        }
      } catch (error) {
        console.log(`Critical Error delete wallet ${error}`);
        openErrorModal("Error Delete Wallet", `${error}`);
        return;
      }
    }
  };

  const submitAction = async () => {
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;

    if (!selectedChain) {
      openErrorModal("Create Wallet", "Please select a Network before creating a wallet.");
      isSubmittingRef.current = false;
      return;
    }
    if (selectedSelection !== ServerSelectionEnum.auto && (!selectedServer || !selectedSelection)) {
      openErrorModal("Create Wallet", "Please select a server before creating a wallet.");
      isSubmittingRef.current = false;
      return;
    }

    if (mode === "addnew") {
      // check the fields
      if (newWalletType === "seed" && (!seedPhrase || !birthday)) {
        isSubmittingRef.current = false;
        return;
      }
      if (newWalletType === "ufvk" && (!ufvk || !birthday)) {
        isSubmittingRef.current = false;
        return;
      }
      if (newWalletType === "file" && !file) {
        isSubmittingRef.current = false;
        return;
      }
      // check the birthday
      if (
        (newWalletType === "seed" || newWalletType === "ufvk") &&
        Number(birthday) < activationHeight[selectedChain]
      ) {
        isSubmittingRef.current = false;
        return;
      }

      // run the option
      if (newWalletType === "new") {
        openErrorModal("Add New Wallet", "Creating a brand new wallet.");
        await doCreateNewWallet();
      }
      if (newWalletType === "seed") {
        openErrorModal("Restore Wallet", "Restoring an existing wallet from the seed phrase.");
        await doRestoreSeedWallet();
      }
      if (newWalletType === "ufvk") {
        openErrorModal("Restore Wallet", "Restoring an existing wallet from the Unified Full Viewing Key.");
        await doRestoreUfvkWallet();
      }
      if (newWalletType === "file") {
        openErrorModal("Restore Wallet", "Restoring an existing wallet from the DAT file stored.");
        await doRestoreFileWallet();
      }
    }

    if (mode === "settings") {
      await doSave();
    }
    if (mode === "delete") {
      openErrorModal("Delete Wallet", "Stopping all the activity with the wallet in order to delete it completely.");
      await doDelete();
    }

    isSubmittingRef.current = false;
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
    setBirthday(isNaN(parseInt(e.target.value)) ? "" : e.target.value);
  };

  const updateAlias = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAlias(e.target.value);
  };

  //console.log('render modal server', servers, selectedServer, selectedChain, selectedSelection);

  return (
    <ScrollPaneTop offsetHeight={20}>
      <div className={[cstyles.xlarge, cstyles.margintopsmall, cstyles.center].join(" ")}>
        {mode === "addnew" ? "Add a New Wallet" : mode === "settings" ? "Wallet Settings" : "Delete Wallet"}
      </div>

      <div className={styles.addnewwalletcontainer}>
        <div className={[cstyles.well, cstyles.verticalflex].join(" ")}>
          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: "center", flexWrap: "nowrap" }}>
            <div className={cstyles.sublight}>Wallet Alias/Description</div>
            <input
              disabled={mode === "delete"}
              placeholder="Ex: My Zcash Wallet"
              type="text"
              className={cstyles.inputbox}
              style={{ width: "60%", marginLeft: "20px" }}
              value={alias}
              onChange={(e) => updateAlias(e)}
            />
            <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: "center" }}>
              Network
              <select
                disabled={mode !== "addnew"}
                className={cstyles.inputbox}
                style={{
                  marginLeft: "20px",
                  color: selectedChain === "" ? Utils.getCssVariable("--color-zingo") : undefined,
                }}
                value={selectedChain}
                onChange={(e) => {
                  setServerExpanded(true);
                  setSelectedChain(e.target.value as ServerChainNameEnum | "");
                  if (servers.filter((s) => s.chain_name === e.target.value).length === 0) {
                    setSelectedSelection(ServerSelectionEnum.custom);
                    setSelectedServer(customServer);
                    //setListServer('');
                  } else {
                    if (!customServer && selectedSelection === ServerSelectionEnum.custom) {
                      setSelectedSelection(ServerSelectionEnum.list);
                      const ls: string = servers.filter((s) => s.chain_name === e.target.value)[0].uri;
                      setListServer(ls);
                      setSelectedServer(ls);
                    } else {
                      const ls: string = servers.filter((s) => s.chain_name === e.target.value)[0].uri;
                      setListServer(ls);
                      if (selectedSelection === ServerSelectionEnum.list || selectedSelection === "") {
                        setSelectedSelection(ServerSelectionEnum.list);
                        setSelectedServer(ls);
                      }
                    }
                  }
                }}
              >
                <option value="" disabled hidden>
                  Select...
                </option>
                <option value="main">{chains["main"]}</option>
                <option value="test">{chains["test"]}</option>
                <option value="regtest">{chains["regtest"]}</option>
              </select>
            </div>
          </div>

          {mode === "addnew" && (
            <div
              className={cstyles.horizontalflex}
              style={{ margin: "10px", alignItems: "center", flexWrap: "nowrap" }}
            >
              <div className={cstyles.sublight}>Type of Wallet creation</div>
              <select
                className={cstyles.inputbox}
                style={{ width: "80%", marginLeft: "20px" }}
                value={newWalletType}
                onChange={(e) => {
                  setNewWalletType(e.target.value as "new" | "seed" | "ufvk" | "file");
                }}
              >
                <option value="" disabled hidden>
                  Select...
                </option>
                <option value="new">{news["new"]}</option>
                <option value="seed">{news["seed"]}</option>
                <option value="ufvk">{news["ufvk"]}</option>
                <option value="file">{news["file"]}</option>
              </select>
            </div>
          )}

          {newWalletType === "seed" && mode === "addnew" && (
            <div style={{ margin: "10px" }}>
              <div className={[cstyles.sublight].join(" ")}>Please enter your seed phrase</div>
              <TextareaAutosize
                placeholder="Enter your 24 recovery words"
                className={cstyles.inputbox}
                value={seedPhrase}
                onChange={(e) => updateSeedPhrase(e)}
              />
              <div className={[cstyles.sublight].join(" ")}>
                {`Wallet Birthday. If you don&rsquo;t know this, it is OK to enter &lsquo;${activationHeight[selectedChain]}&rsquo;`}
              </div>
              <input
                placeholder={`>= ${activationHeight[selectedChain]}`}
                type="number"
                className={cstyles.inputbox}
                value={birthday}
                onChange={(e) => updateBirthday(e)}
              />
            </div>
          )}

          {newWalletType === "ufvk" && mode === "addnew" && (
            <div style={{ margin: "10px" }}>
              <div className={[cstyles.sublight].join(" ")}>Please enter your Unified Full Viewing Key</div>
              <TextareaAutosize
                placeholder="Ex: uview..."
                className={cstyles.inputbox}
                value={ufvk}
                onChange={(e) => updateUfvk(e)}
              />
              <div className={[cstyles.sublight].join(" ")}>
                {`Wallet Birthday. If you don&rsquo;t know this, it is OK to enter &lsquo;${activationHeight[selectedChain]}&rsquo;`}
              </div>
              <input
                placeholder={`>= ${activationHeight[selectedChain]}`}
                type="number"
                className={cstyles.inputbox}
                value={birthday}
                onChange={(e) => updateBirthday(e)}
              />
            </div>
          )}

          {newWalletType === "file" && mode === "addnew" && (
            <div style={{ margin: "10px" }}>
              <div className={[cstyles.sublight].join(" ")}>
                Please enter your Wallet File Name stored in the Zcash folder
              </div>
              <input
                placeholder="Ex: zingo-wallet-renamed....dat"
                type="text"
                className={cstyles.inputbox}
                style={{ width: "90%", marginLeft: "20px" }}
                value={file}
                onChange={(e) => updateFile(e)}
              />
            </div>
          )}

          {mode !== "addnew" && (
            <div
              className={[cstyles.horizontalflex].join(" ")}
              style={{ margin: "10px", alignItems: "center", flexWrap: "nowrap" }}
            >
              <div className={[cstyles.sublight].join(" ")}>File Name</div>
              <input
                disabled={true}
                type="text"
                className={cstyles.inputbox}
                style={{ width: "85%", marginLeft: "20px" }}
                value={
                  currentWallet && currentWallet.creationType === CreationTypeEnum.Main ? "zingo-wallet.dat" : file
                }
              />
            </div>
          )}

          {mode !== "delete" && selectedChain !== "" && (
            <>
              <div
                style={{
                  width: "120%",
                  height: "20px",
                  marginTop: 10,
                  marginBottom: 10,
                  marginLeft: "-20px",
                  backgroundColor: Utils.getCssVariable("--color-background"),
                }}
              />

              <div style={{ margin: "10px" }}>
                {!serverExpanded ? (
                  <div className={cstyles.horizontalflex}>
                    <div
                      className={[cstyles.sublight].join(" ")}
                      style={{ marginRight: "25px", cursor: "pointer" }}
                      onClick={() => setServerExpanded(!serverExpanded)}
                    >
                      Selected Server
                    </div>
                    <div
                      style={{ marginRight: 25, cursor: "pointer", opacity: 0.5 }}
                      onClick={() => setServerExpanded(!serverExpanded)}
                    >
                      <i className={["fas", "fa-chevron-down", "fa-1x"].join(" ")} />
                    </div>
                    <div style={{ cursor: "pointer" }} onClick={() => setServerExpanded(!serverExpanded)}>
                      {selectedServer}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={cstyles.horizontalflex}>
                      <div
                        className={[cstyles.sublight].join(" ")}
                        style={{ marginRight: "25px", cursor: "pointer" }}
                        onClick={() => setServerExpanded(!serverExpanded)}
                      >
                        Selected Server
                      </div>
                      <div
                        style={{ marginRight: 25, cursor: "pointer", opacity: 0.5 }}
                        onClick={() => setServerExpanded(!serverExpanded)}
                      >
                        <i className={["fas", "fa-chevron-up", "fa-1x"].join(" ")} />
                      </div>
                    </div>
                    {mode === "settings" && (
                      <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: "center" }}>
                        <input
                          checked={selectedSelection === ServerSelectionEnum.auto}
                          style={{ accentColor: Utils.getCssVariable("--color-primary") }}
                          type="radio"
                          name="selection"
                          value={ServerSelectionEnum.auto}
                          onClick={(e) => {
                            setSelectedSelection(ServerSelectionEnum.auto);
                            setSelectedServer(autoServer);
                          }}
                          onChange={(e) => {
                            setSelectedSelection(ServerSelectionEnum.auto);
                            setSelectedServer(autoServer);
                          }}
                        />
                        Automatic
                      </div>
                    )}
                    {servers.filter((s) => s.chain_name === selectedChain).length > 0 && (
                      <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: "center" }}>
                        <input
                          checked={selectedSelection === ServerSelectionEnum.list}
                          style={{ accentColor: Utils.getCssVariable("--color-primary") }}
                          type="radio"
                          name="selection"
                          value={ServerSelectionEnum.list}
                          onClick={(e) => {
                            setSelectedSelection(ServerSelectionEnum.list);
                            const ls: string = servers.filter((s) => s.chain_name === selectedChain)[0].uri;
                            setListServer(ls);
                            setSelectedServer(ls);
                          }}
                          onChange={(e) => {
                            setSelectedSelection(ServerSelectionEnum.list);
                            const ls: string = servers.filter((s) => s.chain_name === selectedChain)[0].uri;
                            setListServer(ls);
                            setSelectedServer(ls);
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
                          }}
                        >
                          <option key="" value="" disabled hidden></option>
                          {servers
                            .filter((s) => s.chain_name === selectedChain)
                            .map((s: ServerClass) => (
                              <option key={s.uri} value={s.uri}>
                                {s.uri +
                                  " - " +
                                  chains[s.chain_name] +
                                  " - " +
                                  s.region +
                                  (s.latency ? " _ " + s.latency + " ms." : "")}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    <div style={{ margin: "10px" }}>
                      <input
                        checked={selectedSelection === "custom"}
                        style={{ accentColor: Utils.getCssVariable("--color-primary") }}
                        type="radio"
                        name="selection"
                        value={"custom"}
                        onClick={(e) => {
                          setSelectedSelection(ServerSelectionEnum.custom);
                          setSelectedServer(customServer);
                        }}
                        onChange={(e) => {
                          setSelectedSelection(ServerSelectionEnum.custom);
                          setSelectedServer(customServer);
                        }}
                      />
                      Custom
                      <div className={[cstyles.well, cstyles.horizontalflex].join(" ")}>
                        <div style={{ width: "75%", padding: 0, margin: 0, flexWrap: "nowrap" }}>
                          URI
                          <input
                            placeholder="https://------.---:---"
                            disabled={selectedSelection !== "custom"}
                            type="text"
                            className={cstyles.inputbox}
                            style={{ marginLeft: "20px", width: "80%" }}
                            value={customServer}
                            onChange={(e) => {
                              setCustomServer(e.target.value);
                              setSelectedServer(e.target.value);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          <div
            style={{
              width: "120%",
              height: "20px",
              marginTop: 10,
              marginBottom: 10,
              marginLeft: "-20px",
              backgroundColor: Utils.getCssVariable("--color-background"),
            }}
          />

          <div className={cstyles.horizontalflex} style={{ margin: "10px", alignItems: "center", flexWrap: "nowrap" }}>
            <div className={[cstyles.sublight].join(" ")}>Sync Performance Level</div>
            <select
              disabled={mode === "delete"}
              className={cstyles.inputbox}
              style={{ width: "80%", marginLeft: "20px" }}
              value={performanceLevel}
              onChange={(e) => {
                setPerformanceLevel(e.target.value as PerformanceLevelEnum);
              }}
            >
              <option value="" disabled hidden>
                Select...
              </option>
              <option value={PerformanceLevelEnum.Low}>{PerformanceLevelEnum.Low}</option>
              <option value={PerformanceLevelEnum.Medium}>{PerformanceLevelEnum.Medium}</option>
              <option value={PerformanceLevelEnum.High}>{PerformanceLevelEnum.High}</option>
              <option value={PerformanceLevelEnum.Maximum}>{PerformanceLevelEnum.Maximum}</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: "20px" }} className={cstyles.buttoncontainer}>
          <button type="button" className={cstyles.primarybutton} onClick={async () => await submitAction()}>
            {mode === "addnew"
              ? newWalletType === "new"
                ? "Create Wallet"
                : "Restore Wallet"
              : mode === "settings"
                ? "Save Wallet Settings"
                : "Delete Wallet"}
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={() => closeModal()}>
            Close
          </button>
        </div>
      </div>
    </ScrollPaneTop>
  );
};

export default AddNewWallet;
