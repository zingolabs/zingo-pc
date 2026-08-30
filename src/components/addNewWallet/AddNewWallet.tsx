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
import fetchServerList from "../../utils/fetchServerList";
import selectFastestServer, { RACE_CANDIDATES } from "../../utils/selectFastestServer";
import Utils from "../../utils/utils";
import { native, ipcRenderer } from "../../electronBridge";
import { useLocation } from "react-router-dom";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import RPC from "../../rpc/rpc";
import { useSwapService } from "../../context/ContextSwapService";
import { SwapStore, readCurrentWalletFingerprint } from "../../swap";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type AddNewWalletProps = {
  closeModal: () => void;
  setWallets: (ws: WalletType[]) => void;
  setCurrentWallet: (w: WalletType | null) => void;
  navigateToLoadingScreenChangingWallet: () => void;
  doSaveWallet: () => void;
  clearTimers: () => Promise<void>;
};

const AddNewWallet: React.FC<AddNewWalletProps> = ({
  closeModal,
  setWallets,
  setCurrentWallet,
  navigateToLoadingScreenChangingWallet,
  doSaveWallet,
  clearTimers,
}) => {
  const location = useLocation();
  let mode: "addnew" | "settings" | "delete" = "addnew";
  if (location.state) {
    const locationState = location.state as {
      mode: "addnew" | "settings" | "delete";
    };
    mode = locationState.mode;
  }
  const context = useContext(ContextApp);
  const { openErrorModal, closeErrorModal, openConfirmModal, currentWallet, wallets, currentWalletOpenError } = context;
  const swapService = useSwapService();

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
  // The radio is disabled while this is true. Picking a server means racing a
  // few of them over the network, and letting Create fire in the meantime
  // would build the wallet against whichever URI happened to be in the field.
  const [autoResolving, setAutoResolving] = useState<boolean>(false);
  const [customServer, setCustomServer] = useState<string>("");
  const [listServer, setListServer] = useState<string>("");

  const [servers, setServers] = useState<ServerClass[]>(serverUrisList().filter((s: ServerClass) => !s.obsolete));
  const [serverExpanded, setServerExpanded] = useState<boolean>(false);

  const isSubmittingRef = useRef(false);

  // Both public chains, once, when the modal opens — the picker offers either
  // one and refetching on every chain switch would buy nothing. A chain whose
  // request comes back empty keeps its static entries, so a silent registry
  // degrades to the list we shipped rather than to an empty picker.
  useEffect(() => {
    let dropped = false;
    const staticFor = (chain: ServerChainNameEnum) =>
      serverUrisList().filter((s: ServerClass) => !s.obsolete && s.chain_name === chain);
    (async () => {
      const [mainLive, testLive] = await Promise.all([
        fetchServerList(ServerChainNameEnum.mainChainName),
        fetchServerList(ServerChainNameEnum.testChainName),
      ]);
      if (dropped) {
        return;
      }
      setServers([
        ...(mainLive.length > 0 ? mainLive : staticFor(ServerChainNameEnum.mainChainName)),
        ...(testLive.length > 0 ? testLive : staticFor(ServerChainNameEnum.testChainName)),
      ]);
    })();
    return () => {
      dropped = true;
    };
  }, []);

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

  // Which server "Automatic" means for a chain, right now.
  //
  // Creation cannot defer this the way a launch can: `init_new` connects to
  // `selectedServer` to build the wallet, so by then it has to be a real
  // server for the chain being created — and the app's saved URI belongs to
  // whatever chain it was last on, which is the whole hazard when the new
  // wallet is the first on a different one.
  //
  // Same order LoadingScreen uses, and the same two helpers: the live registry
  // for that chain, raced for speed because the registry ranks by uptime and a
  // reliable server answering in ten seconds is not the one to build on; then
  // the static list for that chain; and it gives up rather than guessing, so a
  // caller can say so instead of dialling another chain's server.
  const resolveAutoServer = useCallback(async (chain: ServerChainNameEnum): Promise<string> => {
    const live: ServerClass[] = await fetchServerList(chain);
    const candidates: ServerClass[] =
      live.length > 0
        ? live.slice(0, RACE_CANDIDATES)
        : serverUrisList().filter((sv: ServerClass) => sv.chain_name === chain && !sv.obsolete);
    if (candidates.length === 0) return "";
    const quickest: ServerClass | null = await selectFastestServer(candidates);
    return quickest ? quickest.uri : candidates[0].uri;
  }, []);

  // Choosing Automatic, and re-choosing it when the chain changes underneath.
  //
  // In settings the wallet already has a server for its chain and the chain
  // cannot change, so the existing one stands until the next launch re-picks.
  // Creating is the case that has to resolve now.
  const chooseAutomaticFor = useCallback(
    async (chain: ServerChainNameEnum) => {
      setSelectedSelection(ServerSelectionEnum.auto);
      if (mode !== "addnew") {
        setSelectedServer(autoServer);
        return;
      }
      setAutoResolving(true);
      try {
        const uri = await resolveAutoServer(chain);
        if (uri) {
          setAutoServer(uri);
          setSelectedServer(uri);
        } else {
          // Nothing answered for this chain. Said plainly, and the selection
          // dropped — leaving it on Automatic with another chain's server is
          // what creation would then dial.
          setSelectedServer("");
          setSelectedSelection("");
          openErrorModal(
            "Automatic server",
            `No server could be reached for ${chain}. Choose one from the list, or enter a custom one.`,
          );
        }
      } finally {
        setAutoResolving(false);
      }
    },
    [mode, autoServer, resolveAutoServer, openErrorModal],
  );

  const chooseAutomatic = useCallback(() => {
    if (mode !== "addnew") {
      void chooseAutomaticFor(ServerChainNameEnum.mainChainName);
      return;
    }
    if (!selectedChain) return;
    void chooseAutomaticFor(selectedChain);
  }, [mode, selectedChain, chooseAutomaticFor]);

  const initialServerValue = useCallback(
    (server: string, _chain_name: ServerChainNameEnum | "", selection: ServerSelectionEnum | "") => {
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
      if (mode !== "addnew" && !!currentWallet) {
        // settings / delete: pre-fill with current wallet's data
        setAlias(currentWallet.alias);
        setPerformanceLevel(currentWallet.performanceLevel);
        setFile(currentWallet.fileName);
      } else if (mode === "addnew") {
        // addnew: this component instance may be reused after the user was on
        // settings or delete (same route, only location.state changes). Reset
        // the wallet-specific fields so values from the previous mode don't bleed in.
        setAlias("");
        setPerformanceLevel(PerformanceLevelEnum.High);
        setFile("");
        setNewWalletType("new");
        setSeedPhrase("");
        setBirthday("");
        setUfvk("");
      }
    })();
  }, [
    initialServerValue,
    currentWallet?.chain_name,
    currentWallet?.selection,
    currentWallet?.uri,
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

      // A failed init rejects (typed error on the throw channel); the catch
      // below restores the previous wallet. Success is always a JSON payload.
      const resultJSON = JSON.parse(result);
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
    } catch (error) {
      console.error(`Critical Error create new wallet ${error}`);
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
      // A failed init rejects (typed error on the throw channel); the catch
      // below restores the previous wallet. Success is always a JSON payload.
      const resultJSON = JSON.parse(result);
      const seed_phrase: string = resultJSON.seed_phrase;

      await createNextWallet(id, wallet_name, alias ? alias : `${seed_phrase.split(" ")[0]}...`);

      await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: selectedServer });
      await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: selectedChain });
      await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selectedSelection });
      await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
      // save the wallet
      setSeedPhrase("");
      doSaveWallet();
      await delay(1000);
      navigateToLoadingScreenChangingWallet();
    } catch (error) {
      console.error(`Critical Error restore from seed ${error}`);
      openErrorModal("Restoring wallet from seed", `${error}`);
      // restore the previous wallet
      loadCurrentWallet();
    }
  };

  const doRestoreUfvkWallet = async () => {
    try {
      // Trim user-pasted whitespace before parsing.
      const ufvkInput = ufvk.trim();

      // Validate the UFVK cryptographically via Rust (`parse_ufvk`). The native
      // function decodes the key with `Ufvk::decode` and returns either an
      // "Error:" string (e.g. empty input) or a JSON object with:
      //   { status, chain_name, address_kind, pools_available }
      // This replaces the previous prefix-only validation, which accepted
      // malformed keys with the right prefix and only caught them later inside
      // init_from_ufvk with a generic error.
      const parseResult: string = await native.parse_ufvk(ufvkInput);
      if (!parseResult) {
        openErrorModal("Parsing UFVK", parseResult || "Could not parse the Unified Full Viewing Key.");
        return;
      }
      let parsed: { status?: string; chain_name?: string };
      try {
        parsed = JSON.parse(parseResult);
      } catch {
        openErrorModal("Parsing UFVK", "The Unified Full Viewing Key could not be parsed.");
        return;
      }
      if (parsed.status !== "success") {
        openErrorModal("Parsing UFVK", "This is not a valid Unified Full Viewing Key.");
        return;
      }
      const effectiveChain = selectedChain ? selectedChain : ServerChainNameEnum.mainChainName;
      if (parsed.chain_name !== effectiveChain) {
        const friendly = (c: string | undefined) =>
          c === "main" ? "mainnet" : c === "test" ? "testnet" : c === "regtest" ? "regtest" : c;
        openErrorModal(
          "Parsing UFVK",
          `This Unified Full Viewing Key is for ${friendly(parsed.chain_name)}, ` +
            `but the selected network is ${friendly(effectiveChain)}. ` +
            `Switch the network to ${friendly(parsed.chain_name)} and try again.`,
        );
        return;
      }

      const { next: id, nextWalletName: wallet_name } = await nextWalletName();
      const result: string = await native.init_from_ufvk(
        ufvkInput,
        Number(birthday),
        selectedServer,
        effectiveChain,
        performanceLevel,
        3,
        wallet_name,
      );
      // A failed init rejects (typed error on the throw channel); the catch
      // below restores the previous wallet. Success is always a JSON payload.
      const resultJSON = JSON.parse(result);
      const resultUfvk: string = resultJSON.ufvk;

      createNextWallet(id, wallet_name, alias ? alias : `${resultUfvk.substring(0, 10)}...`);

      await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: selectedServer });
      await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: selectedChain });
      await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selectedSelection });
      await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
      // save the wallet
      setUfvk("");
      doSaveWallet();
      await delay(1000);
      navigateToLoadingScreenChangingWallet();
    } catch (error) {
      console.error(`Critical Error restore from ufvk ${error}`);
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
      // A failed init rejects (typed error on the throw channel); the catch
      // below restores the previous wallet. Success is always a JSON payload.
      const resultJSON = JSON.parse(result);
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
    } catch (error) {
      console.error(`Critical Error restore from file ${error}`);
      openErrorModal("Restoring wallet from file", `${error}`);
      // restore the previous wallet
      loadCurrentWallet();
    }
  };

  const loadCurrentWallet = async () => {
    if (currentWallet) {
      try {
        // A failed init rejects (typed error on the throw channel).
        await native.init_from_b64(
          currentWallet.uri,
          currentWallet.chain_name,
          currentWallet.performanceLevel,
          3,
          currentWallet.fileName,
        );
      } catch (error) {
        openErrorModal("Loading current wallet", `${error}`);
      }
    }
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
        const serverFaster = await selectFastestServer([
          {
            uri: selectedServer,
            chain_name: selectedChain,
            latency: null,
            default: false,
            obsolete: false,
          } as ServerClass,
        ]);
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

  /**
   * Deleting the wallet is the one flow that destroys its swap records, so it
   * is the one flow that has to ask first.
   *
   * The question is whether any swap still has a deposit the provider can see
   * and has not settled. Outbound, deleting loses the tracking record while
   * the swap completes on-chain regardless. Inbound is worse: the payout is
   * addressed to an ephemeral address of this wallet, so a user without their
   * seed written down loses the incoming funds outright. Neither is something
   * to discover afterwards.
   *
   * The service is null off mainnet and before it finishes building. That is
   * "no opinion", not "nothing in flight" — but the same conditions mean no
   * swap could have been started in this session either, so proceeding
   * straight to the delete is honest rather than a silent green light.
   */
  const doDelete = async () => {
    if (!currentWallet) return;
    let inflight = false;
    if (swapService) {
      try {
        inflight = await swapService.hasInflightDeposits();
      } catch (error) {
        console.error(`Delete Wallet: could not check for in-flight swaps ${error}`);
      }
    }
    if (inflight) {
      openConfirmModal(
        "Delete Wallet",
        "A swap belonging to this wallet is still in flight: its deposit has been paid and the provider has not " +
          "settled it yet. Deleting now removes the record that tracks it, and if the swap pays out to this wallet " +
          "you will need its seed phrase to reach those funds. Delete anyway?",
        () => {
          performDelete();
        },
      );
      return;
    }
    await performDelete();
  };

  const performDelete = async () => {
    if (!!currentWallet) {
      openErrorModal("Delete Wallet", "Stopping all the activity with the wallet in order to delete it completely.");
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
              console.error(`Stopping sync Error ${error}`);
            }
          }
          // Before `deinitialize`, which is what takes the UFVK — and with it
          // the only way to name this wallet's swap bucket — out of reach.
          // Skipped rather than guessed when the fingerprint comes back empty:
          // a wrong key would wipe a different wallet's records.
          const fingerprint = await readCurrentWalletFingerprint();
          if (fingerprint) {
            await SwapStore.clearForWallet(fingerprint);
          } else {
            console.log("Delete Wallet: no fingerprint, leaving the swap bucket alone");
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
        console.error(`Critical Error delete wallet ${error}`);
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
    if (!selectedServer || !selectedSelection) {
      openErrorModal("Create Wallet", "Please select a server before creating a wallet.");
      isSubmittingRef.current = false;
      return;
    }

    if (mode === "addnew") {
      // check the fields — surface WHY nothing happened instead of returning
      // silently (users saw the Create button do nothing with no message).
      if (newWalletType === "seed" && (!seedPhrase || !birthday)) {
        openErrorModal(
          "Create Wallet",
          !seedPhrase
            ? "Please enter your seed phrase."
            : `Please enter the wallet birthday (if you don't know it, ${activationHeight[selectedChain]} is safe).`,
        );
        isSubmittingRef.current = false;
        return;
      }
      if (newWalletType === "ufvk" && (!ufvk || !birthday)) {
        openErrorModal(
          "Create Wallet",
          !ufvk
            ? "Please enter your unified full viewing key (UFVK)."
            : `Please enter the wallet birthday (if you don't know it, ${activationHeight[selectedChain]} is safe).`,
        );
        isSubmittingRef.current = false;
        return;
      }
      if (newWalletType === "file" && !file) {
        openErrorModal("Create Wallet", "Please select a wallet file to restore.");
        isSubmittingRef.current = false;
        return;
      }
      // check the birthday
      if (
        (newWalletType === "seed" || newWalletType === "ufvk") &&
        Number(birthday) < activationHeight[selectedChain]
      ) {
        openErrorModal(
          "Create Wallet",
          `The wallet birthday must be at least ${activationHeight[selectedChain]} (the network activation height).`,
        );
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
      // The "stopping all activity" notice moved into `performDelete`, which
      // is the moment it becomes true. Announcing it here would put it on
      // screen in front of the in-flight-swap confirmation — both are
      // react-modal over the same overlay, and this one mounts last.
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

  return (
    <ScrollPaneTop offsetHeight={20}>
      <div className={`${cstyles.xlarge} ${cstyles.screentitle} ${cstyles.center}`}>
        {mode === "addnew" ? "Add a New Wallet" : mode === "settings" ? "Wallet Settings" : "Delete Wallet"}
      </div>

      <div className={styles.addnewwalletcontainer}>
        <div className={`${cstyles.well} ${cstyles.verticalflex}`}>
          <div
            className={cstyles.horizontalflex}
            style={{ margin: "5px 10px", alignItems: "center", flexWrap: "nowrap" }}
          >
            <div className={cstyles.sublight}>Wallet Alias/Description</div>
            <div className={cstyles.fieldrow} style={{ width: "60%", marginLeft: "20px" }}>
              <input
                aria-label="Wallet alias"
                disabled={mode === "delete"}
                placeholder="Ex: My Zcash Wallet"
                type="text"
                className={cstyles.fieldinput}
                value={alias}
                onChange={(e) => updateAlias(e)}
              />
            </div>
            <div className={cstyles.horizontalflex} style={{ marginLeft: 10, alignItems: "center", flex: 1 }}>
              <div className={cstyles.sublight}>Network</div>
              <select
                aria-label="Network"
                disabled={mode !== "addnew"}
                className={cstyles.fieldselect}
                style={{
                  marginLeft: "20px",
                  color: selectedChain === "" ? "var(--color-zingo)" : undefined,
                }}
                value={selectedChain}
                onChange={(e) => {
                  setServerExpanded(true);
                  const chain = e.target.value as ServerChainNameEnum | "";
                  setSelectedChain(chain);
                  // Automatic is a choice about how to pick, not about which
                  // server, so it survives the chain change and re-picks for
                  // the new one. Everything below decides a specific server,
                  // and those are the ones a new chain invalidates.
                  if (selectedSelection === ServerSelectionEnum.auto) {
                    if (chain) void chooseAutomaticFor(chain);
                    return;
                  }
                  if (servers.filter((s) => s.chain_name === e.target.value).length === 0) {
                    setSelectedSelection(ServerSelectionEnum.custom);
                    setSelectedServer(customServer);
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
                <option value="main">{Utils.chainDisplayName(ServerChainNameEnum.mainChainName)}</option>
                <option value="test">{Utils.chainDisplayName(ServerChainNameEnum.testChainName)}</option>
                <option value="regtest">{Utils.chainDisplayName(ServerChainNameEnum.regtestChainName)}</option>
              </select>
            </div>
          </div>

          {mode === "addnew" && (
            <div
              className={cstyles.horizontalflex}
              style={{ margin: "5px 10px", alignItems: "center", flexWrap: "nowrap" }}
            >
              <div className={cstyles.sublight}>Type of Wallet creation</div>
              <select
                aria-label="Type of wallet creation"
                className={cstyles.fieldselect}
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
            <div style={{ margin: "5px 10px" }}>
              <div className={cstyles.sublight}>Please enter your seed phrase</div>
              <div className={cstyles.fieldrowmulti}>
                <TextareaAutosize
                  aria-label="Seed phrase"
                  placeholder="Enter your 24 recovery words"
                  className={cstyles.fieldtextarea}
                  value={seedPhrase}
                  onChange={(e) => updateSeedPhrase(e)}
                />
              </div>
              <div className={`${cstyles.sublight} ${cstyles.margintoplarge}`}>
                {`Wallet Birthday. If you don’t know this, it is OK to enter ‘${activationHeight[selectedChain]}’`}
              </div>
              <div className={cstyles.fieldrow}>
                <input
                  aria-label="Wallet birthday"
                  placeholder={`>= ${activationHeight[selectedChain]}`}
                  type="number"
                  className={cstyles.fieldinput}
                  value={birthday}
                  onChange={(e) => updateBirthday(e)}
                />
              </div>
            </div>
          )}

          {newWalletType === "ufvk" && mode === "addnew" && (
            <div style={{ margin: "5px 10px" }}>
              <div className={cstyles.sublight}>Please enter your Unified Full Viewing Key</div>
              <div className={cstyles.fieldrowmulti}>
                <TextareaAutosize
                  aria-label="Unified Full Viewing Key"
                  placeholder="Ex: uview..."
                  className={cstyles.fieldtextarea}
                  value={ufvk}
                  onChange={(e) => updateUfvk(e)}
                />
              </div>
              <div className={`${cstyles.sublight} ${cstyles.margintoplarge}`}>
                {`Wallet Birthday. If you don’t know this, it is OK to enter ‘${activationHeight[selectedChain]}’`}
              </div>
              <div className={cstyles.fieldrow}>
                <input
                  aria-label="Wallet birthday"
                  placeholder={`>= ${activationHeight[selectedChain]}`}
                  type="number"
                  className={cstyles.fieldinput}
                  value={birthday}
                  onChange={(e) => updateBirthday(e)}
                />
              </div>
            </div>
          )}

          {newWalletType === "file" && mode === "addnew" && (
            <div style={{ margin: "5px 10px" }}>
              <div className={cstyles.sublight}>Please enter your Wallet File Name stored in the Zcash folder</div>
              <div className={cstyles.fieldrow} style={{ width: "90%", marginLeft: "20px" }}>
                <input
                  aria-label="Wallet file name"
                  placeholder="Ex: zingo-wallet-renamed....dat"
                  type="text"
                  className={cstyles.fieldinput}
                  value={file}
                  onChange={(e) => updateFile(e)}
                />
              </div>
            </div>
          )}

          {mode !== "addnew" && (
            <div
              className={cstyles.horizontalflex}
              style={{ margin: "5px 10px", alignItems: "center", flexWrap: "nowrap" }}
            >
              <div className={cstyles.sublight}>File Name</div>
              <div className={cstyles.fieldrow} style={{ width: "85%", marginLeft: "20px" }}>
                <input
                  aria-label="File name"
                  disabled={true}
                  type="text"
                  className={cstyles.fieldinput}
                  value={
                    currentWallet && currentWallet.creationType === CreationTypeEnum.Main ? "zingo-wallet.dat" : file
                  }
                />
              </div>
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
                  backgroundColor: "var(--color-background)",
                }}
              />

              <div style={{ margin: "5px 10px" }}>
                {!serverExpanded ? (
                  <div className={cstyles.horizontalflex}>
                    <div
                      className={cstyles.sublight}
                      style={{ marginRight: "25px", cursor: "pointer" }}
                      onClick={() => setServerExpanded(!serverExpanded)}
                    >
                      Selected Server
                    </div>
                    <div
                      style={{ marginRight: 25, cursor: "pointer", opacity: 0.5 }}
                      onClick={() => setServerExpanded(!serverExpanded)}
                    >
                      <FontAwesomeIcon icon={faChevronDown} />
                    </div>
                    <div style={{ cursor: "pointer" }} onClick={() => setServerExpanded(!serverExpanded)}>
                      {selectedServer}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={cstyles.horizontalflex}>
                      <div
                        className={cstyles.sublight}
                        style={{ marginRight: "25px", cursor: "pointer" }}
                        onClick={() => setServerExpanded(!serverExpanded)}
                      >
                        Selected Server
                      </div>
                      <div
                        style={{ marginRight: 25, cursor: "pointer", opacity: 0.5 }}
                        onClick={() => setServerExpanded(!serverExpanded)}
                      >
                        <FontAwesomeIcon icon={faChevronUp} />
                      </div>
                    </div>
                    <div className={cstyles.horizontalflex} style={{ margin: "5px 10px", alignItems: "center" }}>
                      <input
                        checked={selectedSelection === ServerSelectionEnum.auto}
                        style={{ accentColor: "var(--color-primary)" }}
                        type="radio"
                        name="selection"
                        aria-label="Automatic"
                        value={ServerSelectionEnum.auto}
                        disabled={autoResolving}
                        onClick={() => chooseAutomatic()}
                        onChange={() => chooseAutomatic()}
                      />
                      Automatic
                      {autoResolving && <span className={cstyles.sublight}>&nbsp; finding a server…</span>}
                    </div>
                    {servers.filter((s) => s.chain_name === selectedChain).length > 0 && (
                      <div className={cstyles.horizontalflex} style={{ margin: "5px 10px", alignItems: "center" }}>
                        <input
                          checked={selectedSelection === ServerSelectionEnum.list}
                          style={{ accentColor: "var(--color-primary)" }}
                          type="radio"
                          name="selection"
                          aria-label="From the list"
                          value={ServerSelectionEnum.list}
                          onClick={() => {
                            setSelectedSelection(ServerSelectionEnum.list);
                            const ls: string = servers.filter((s) => s.chain_name === selectedChain)[0].uri;
                            setListServer(ls);
                            setSelectedServer(ls);
                          }}
                          onChange={() => {
                            setSelectedSelection(ServerSelectionEnum.list);
                            const ls: string = servers.filter((s) => s.chain_name === selectedChain)[0].uri;
                            setListServer(ls);
                            setSelectedServer(ls);
                          }}
                        />
                        List
                        <select
                          aria-label="Server list"
                          disabled={selectedSelection !== "list"}
                          className={cstyles.fieldselect}
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
                                  Utils.chainDisplayName(s.chain_name) +
                                  (s.latency ? " _ " + s.latency + " ms." : "")}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                    <div style={{ margin: "5px 10px" }}>
                      <input
                        checked={selectedSelection === "custom"}
                        style={{ accentColor: "var(--color-primary)" }}
                        type="radio"
                        name="selection"
                        aria-label="Custom"
                        value={"custom"}
                        onClick={() => {
                          setSelectedSelection(ServerSelectionEnum.custom);
                          setSelectedServer(customServer);
                        }}
                        onChange={() => {
                          setSelectedSelection(ServerSelectionEnum.custom);
                          setSelectedServer(customServer);
                        }}
                      />
                      Custom
                      <div className={`${cstyles.well} ${cstyles.horizontalflex}`}>
                        <div style={{ width: "75%", padding: 0, margin: 0, flexWrap: "nowrap" }}>
                          <div className={cstyles.fieldrow} style={{ width: "100%" }}>
                            <input
                              aria-label="Custom server URI"
                              placeholder="https://------.---:---"
                              disabled={selectedSelection !== "custom"}
                              type="text"
                              className={cstyles.fieldinput}
                              value={customServer}
                              onChange={(e) => {
                                setCustomServer(e.target.value);
                                setSelectedServer(e.target.value);
                              }}
                            />
                          </div>
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
              backgroundColor: "var(--color-background)",
            }}
          />

          <div
            className={cstyles.horizontalflex}
            style={{ margin: "5px 10px", alignItems: "center", flexWrap: "nowrap" }}
          >
            <div className={cstyles.sublight}>Sync Performance Level</div>
            <select
              aria-label="Sync performance level"
              disabled={mode === "delete"}
              className={cstyles.fieldselect}
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

        <div style={{ marginBottom: "10px" }} className={cstyles.buttoncontainer}>
          <button type="button" className={cstyles.primarybutton} onClick={() => closeModal()}>
            Cancel
          </button>
          <button type="button" className={cstyles.primarybutton} onClick={async () => await submitAction()}>
            {mode === "addnew"
              ? newWalletType === "new"
                ? "Create Wallet"
                : "Restore Wallet"
              : mode === "settings"
                ? "Save Wallet Settings"
                : "Delete Wallet"}
          </button>
        </div>
      </div>
    </ScrollPaneTop>
  );
};

export default AddNewWallet;
