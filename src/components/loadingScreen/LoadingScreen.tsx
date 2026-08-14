import React, { Component } from "react";
import { useLocation } from "react-router-dom";
import { native, ipcRenderer, isSandboxed } from "../../electronBridge";
import {
  CreationTypeEnum,
  InfoClass,
  PerformanceLevelEnum,
  ServerClass,
  ServerSelectionEnum,
  ServerChainNameEnum,
  WalletType,
} from "../appstate";
import RPC from "../../rpc/rpc";
import cstyles from "../common/Common.module.css";
import styles from "./LoadingScreen.module.css";
import { ContextApp } from "../../context/ContextAppState";
import serverUrisList from "../../utils/serverUrisList";
import fetchServerList from "../../utils/fetchServerList";
import selectFastestServer, { RACE_CANDIDATES } from "../../utils/selectFastestServer";
import Utils from "../../utils/utils";
import { Logo } from "../logo";
import DetailLine from "../detailLine/DetailLine";

// The server we ship for a chain, or "" for a chain we publish none for.
const defaultServerForChain = (chain: ServerChainNameEnum): string =>
  serverUrisList().find((s: ServerClass) => s.chain_name === chain && !s.obsolete && s.default)?.uri ?? "";

class LoadingScreenState {
  loadingDone: boolean;

  currentWallet: WalletType | null;

  walletExists: boolean;

  constructor() {
    this.loadingDone = false;
    this.currentWallet = null;
    this.walletExists = false;
  }
}

type LoadingScreenProps = {
  location: { state: unknown };
  runRPCConfigure: () => void;
  setInfo: (info: InfoClass) => void;
  setReadOnly: (readOnly: boolean) => void;
  navigateToDashboard: () => void;
  setBirthday: (b: number) => void;
  setPools: (o: boolean, s: boolean, t: boolean) => void;
  setWallets: (ws: WalletType[]) => void;
  setCurrentWallet: (w: WalletType | null) => void;
  setCurrentWalletOpenError: (e: string) => void;
  setFetchError: (command: string, error: string) => void;
};

class LoadingScreen extends Component<LoadingScreenProps, LoadingScreenState> {
  static contextType = ContextApp;
  private navigationTimer: ReturnType<typeof setTimeout> | undefined;

  // One `auto` pick per chain per launch. loadCurrentWallet runs the settings
  // check twice — once against settings.json, once against the wallet record —
  // and racing the same servers again would double the launch latency for a
  // result we already have.
  private autoPicked: Map<ServerChainNameEnum, string> = new Map();

  constructor(props: LoadingScreenProps) {
    super(props);
    this.state = new LoadingScreenState();
  }

  componentDidMount = async () => {
    const { openErrorModal, closeErrorModal } = this.context as React.ContextType<typeof ContextApp>;

    try {
      await native.set_crypto_default_provider_to_ring();
    } catch (error) {
      console.error(`Critical Error crypto provider default ${error}`);
    }

    // A throw in here used to end the launch silently: the promise rejected,
    // componentDidMount stopped, and the app sat on this screen for good — no
    // message, and menu clicks doing nothing because the renderer never got as
    // far as registering their listeners. Whatever failed (the native module,
    // the wallet directory, settings) is worth showing: a wrong answer the user
    // can report beats a window that does nothing.
    try {
      await this.doFirstTimeSetup();
    } catch (error) {
      console.error(`Critical Error first time setup ${error}`);
      closeErrorModal();
      openErrorModal(
        "Zingo PC could not start",
        <div>
          <div>Something failed while preparing the wallet, and the app cannot continue.</div>
          <div className={cstyles.margintoplarge}>{String(error)}</div>
          <div className={cstyles.margintoplarge}>
            Please report this at github.com/zingolabs/zingo-pc/issues, including the message above.
          </div>
        </div>,
      );
      return;
    }

    // only if the active wallet exists
    if (this.state.walletExists) {
      // warning with the migration from Z1 to Z2
      const version = await RPC.getWalletVersion();
      if (version && version < 32) {
        closeErrorModal();
        openErrorModal(
          "Wallet migration",
          <div>
            <div>We are migrating your wallet to the new synchronization system.</div>
            <div>Your balance will change as the migration progresses. Don't worry, your funds are safe!</div>
          </div>,
        );
      } else {
        closeErrorModal();
      }
    } else {
      closeErrorModal();
    }
  };

  checkCurrentSettings = async (
    serveruri: string,
    serverchain_name: ServerChainNameEnum,
    serverselection: ServerSelectionEnum,
  ) => {
    let uri: string = "",
      chain_name: ServerChainNameEnum = ServerChainNameEnum.mainChainName,
      selection: ServerSelectionEnum = ServerSelectionEnum.list;
    if (!serveruri) {
      // Nothing usable stored, so there is no choice to respect: land on `auto`
      // and let the block below pick. Keep whatever chain the settings do name
      // — losing it would boot a testnet user onto mainnet.
      const d = serverUrisList().filter((s: ServerClass) => !s.obsolete && s.default);
      chain_name = serverchain_name ? serverchain_name : d[0].chain_name;
      const forChain: ServerClass[] = d.filter((s: ServerClass) => s.chain_name === chain_name);
      uri = forChain.length > 0 ? forChain[0].uri : "";
      selection = ServerSelectionEnum.auto;
    } else {
      // the server is in settings, asking for the other fields.
      const serverInList: ServerClass[] = serverUrisList().filter((s: ServerClass) => s.uri === serveruri);
      const listed: boolean = serverInList.length === 1;
      uri = serveruri;
      if (!serverchain_name) {
        chain_name = listed ? serverInList[0].chain_name : ServerChainNameEnum.mainChainName;
      } else {
        chain_name = serverchain_name;
      }
      if (serverchain_name && serverselection) {
        selection = serverselection;
      } else {
        // No stored mode: a server we publish reads as a `list` pick, anything
        // else as one the user typed.
        selection = listed ? ServerSelectionEnum.list : ServerSelectionEnum.custom;
      }
    }

    // A stored server that has since been marked obsolete is an anomaly, and
    // anomalies land on `auto`: it re-picks below, and keeps re-picking on
    // every later launch, where `list` or `custom` would strand the user on a
    // dead URI. `auto` itself never picks an obsolete server, so it skips this.
    const obsoleteNow: ServerClass[] = serverUrisList().filter((s: ServerClass) => s.uri === uri && s.obsolete);
    if (selection !== ServerSelectionEnum.auto && obsoleteNow.length === 1) {
      console.log("server obsolete =>", uri, chain_name);
      selection = ServerSelectionEnum.auto;
    }

    // One registry read for the rest of the check. `custom` is left out: a
    // server the user typed is not meant to be in the registry, so asking about
    // it would only be a request nobody reads. An unreachable registry gives an
    // empty list and every branch below falls back to the static one.
    const live: ServerClass[] =
      selection === ServerSelectionEnum.auto || selection === ServerSelectionEnum.list
        ? await fetchServerList(chain_name)
        : [];

    // A `list` server that has dropped off the registry is the live equivalent
    // of the obsolete flag above, and lands the same way: on `auto`.
    if (selection === ServerSelectionEnum.list && live.length > 0 && !live.some((s: ServerClass) => s.uri === uri)) {
      console.log("server unlisted =>", uri, chain_name);
      selection = ServerSelectionEnum.auto;
    }

    // `auto` is a standing choice, not a one-shot action: it re-picks the best
    // server on every launch and stays `auto`. Writing `list` back here pinned
    // the wallet to whichever server won the first boot, and showed the user a
    // mode they never chose. Only `uri` moves.
    if (selection === ServerSelectionEnum.auto) {
      // Servers the user has rotated away from this session. Rotating reopens
      // the wallet, which lands right back here, and without this the pick would
      // undo the rotation by taking the registry's head again — the very server
      // just rejected. Dropped if it would leave nothing: a rejected server
      // still beats no server.
      const { avoidedServers } = this.context as React.ContextType<typeof ContextApp>;
      const keep = (list: ServerClass[]) => {
        const kept = list.filter((s: ServerClass) => !avoidedServers.includes(s.uri));
        return kept.length > 0 ? kept : list;
      };

      const alreadyPicked: string | undefined = this.autoPicked.get(chain_name);
      if (alreadyPicked) {
        uri = alreadyPicked;
      } else if (live.length > 0) {
        // Race the registry's best few rather than trusting its order. It ranks
        // by 30-day uptime, which is not speed: a reliable server answering in
        // ten seconds sits at the top of that list and made the wallet crawl.
        const candidates: ServerClass[] = keep(live).slice(0, RACE_CANDIDATES);
        const quickest: ServerClass | null = await selectFastestServer(candidates);
        uri = quickest ? quickest.uri : candidates[0].uri;
        this.autoPicked.set(chain_name, uri);
      } else {
        // No registry: race the static list for this chain, and if not one of
        // them answers, fall back to the server we ship for that chain. Keep
        // the URI we came in with when the chain has neither (regtest), rather
        // than blanking a working localhost node.
        const servers: ServerClass[] = keep(
          serverUrisList().filter((s: ServerClass) => s.chain_name === chain_name && !s.obsolete),
        );
        const fastest: ServerClass | null = await selectFastestServer(servers);
        uri = fastest ? fastest.uri : defaultServerForChain(chain_name) || uri;
        if (uri) {
          this.autoPicked.set(chain_name, uri);
        }
      }
    }
    // server settings checked
    return { uri, chain_name, selection };
  };

  loadCurrentWallet = async () => {
    // try to read wallets
    let wallets: WalletType[] = await ipcRenderer.invoke("wallets:all");
    // Try to read the default server
    const settings = await ipcRenderer.invoke("loadSettings");
    let currentWalletId: number | null = null;
    let currentWallet: WalletType | null = null;
    let { uri, chain_name, selection } = await this.checkCurrentSettings(
      settings && settings.serveruri ? settings.serveruri : "",
      settings && settings.serverchain_name ? settings.serverchain_name : "",
      settings && settings.serverselection ? settings.serverselection : "",
    );

    // block explorer configuration is now loaded at app boot in Routes.tsx
    // (same useEffect that calls loadSettings for auth) and exposed via
    // context — no per-screen wiring needed here.

    // to know the App is magrating to multi-wallet the settings field
    // `currentwalletid` must have not exists.
    // if it is `null` means the user just did:
    // - or changed the server
    // - or deleted the actual wallet
    if (
      (!wallets || wallets.length === 0) &&
      (!settings || (!!settings && !settings.hasOwnProperty("currentwalletid")))
    ) {
      // The App have to migrate from settings.json to wallets.json
      // store the info about the current wallet in wallets.json
      let mainnetWallet_1: WalletType | null = null,
        testnetWallet_2: WalletType | null = null,
        regtestWallet_3: WalletType | null = null;
      // MAINNET
      const mainnetWalletExistsResult: boolean = await native.wallet_exists(
        "",
        ServerChainNameEnum.mainChainName,
        PerformanceLevelEnum.High,
        3,
        "",
      );
      console.log(mainnetWalletExistsResult);
      if (!mainnetWalletExistsResult) {
        console.log("MIGRATION. Mainnet wallet not found.");
      } else {
        if (chain_name === ServerChainNameEnum.mainChainName) {
          currentWalletId = 1;
          mainnetWallet_1 = {
            id: 1, // by default: 1 (mainnet)
            fileName: "", // by default: zingo-wallet.dat
            alias: "Main Wallet",
            creationType: CreationTypeEnum.Main,
            uri: uri,
            chain_name: chain_name,
            selection: selection,
            performanceLevel: PerformanceLevelEnum.High,
          };
          currentWallet = mainnetWallet_1;
          this.setState({
            currentWallet: mainnetWallet_1,
          });
        } else {
          let d = serverUrisList().filter(
            (s: ServerClass) => s.chain_name === ServerChainNameEnum.mainChainName && !s.obsolete && s.default,
          );
          mainnetWallet_1 = {
            id: 1, // by default: 1 (mainnet)
            fileName: "", // by default: zingo-wallet.dat
            alias: "Main Wallet",
            creationType: CreationTypeEnum.Main,
            uri: !d || d.length === 0 ? "" : d[0].uri,
            chain_name: ServerChainNameEnum.mainChainName,
            selection: !d || d.length === 0 ? ServerSelectionEnum.custom : ServerSelectionEnum.list,
            performanceLevel: PerformanceLevelEnum.High,
          };
        }
      }
      // TESTNET
      const testnetWalletExistsResult: boolean = await native.wallet_exists(
        "",
        ServerChainNameEnum.testChainName,
        PerformanceLevelEnum.High,
        3,
        "",
      );
      console.log(testnetWalletExistsResult);
      if (!testnetWalletExistsResult) {
        console.log("MIGRATION. Testnet wallet not found.");
      } else {
        if (chain_name === ServerChainNameEnum.testChainName) {
          currentWalletId = 2;
          testnetWallet_2 = {
            id: 2, // by default: 1 (testnet)
            fileName: "", // by default: zingo-wallet.dat
            alias: "Main Wallet",
            creationType: CreationTypeEnum.Main,
            uri: uri,
            chain_name: chain_name,
            selection: selection,
            performanceLevel: PerformanceLevelEnum.High,
          };
          currentWallet = testnetWallet_2;
          this.setState({
            currentWallet: testnetWallet_2,
          });
        } else {
          let d = serverUrisList().filter(
            (s: ServerClass) => s.chain_name === ServerChainNameEnum.testChainName && !s.obsolete && s.default,
          );
          testnetWallet_2 = {
            id: 2, // by default: 1 (testnet)
            fileName: "", // by default: zingo-wallet.dat
            alias: "Main Wallet",
            creationType: CreationTypeEnum.Main,
            uri: !d || d.length === 0 ? "" : d[0].uri,
            chain_name: ServerChainNameEnum.testChainName,
            selection: !d || d.length === 0 ? ServerSelectionEnum.custom : ServerSelectionEnum.list,
            performanceLevel: PerformanceLevelEnum.High,
          };
        }
      }
      // REGTEST
      const regnetWalletExistsResult: boolean = await native.wallet_exists(
        "",
        ServerChainNameEnum.regtestChainName,
        PerformanceLevelEnum.High,
        3,
        "",
      );
      console.log(regnetWalletExistsResult);
      if (!regnetWalletExistsResult) {
        console.log("MIGRATION. Regtest wallet not found.");
      } else {
        if (chain_name === ServerChainNameEnum.regtestChainName) {
          currentWalletId = 3;
          regtestWallet_3 = {
            id: 3, // by default: 1 (testnet)
            fileName: "", // by default: zingo-wallet.dat
            alias: "Main Wallet",
            creationType: CreationTypeEnum.Main,
            uri: uri,
            chain_name: chain_name,
            selection: selection,
            performanceLevel: PerformanceLevelEnum.High,
          };
          currentWallet = regtestWallet_3;
          this.setState({
            currentWallet: regtestWallet_3,
          });
        } else {
          let d = serverUrisList().filter(
            (s: ServerClass) => s.chain_name === ServerChainNameEnum.regtestChainName && !s.obsolete && s.default,
          );
          regtestWallet_3 = {
            id: 3, // by default: 1 (testnet)
            fileName: "", // by default: zingo-wallet.dat
            alias: "Main Wallet",
            creationType: CreationTypeEnum.Main,
            uri: !d || d.length === 0 ? "" : d[0].uri,
            chain_name: ServerChainNameEnum.regtestChainName,
            selection: !d || d.length === 0 ? ServerSelectionEnum.custom : ServerSelectionEnum.list,
            performanceLevel: PerformanceLevelEnum.High,
          };
        }
      }
      if (mainnetWallet_1 !== null) {
        await ipcRenderer.invoke("wallets:add", mainnetWallet_1);
      }
      if (testnetWallet_2 !== null) {
        await ipcRenderer.invoke("wallets:add", testnetWallet_2);
      }
      if (regtestWallet_3 !== null) {
        await ipcRenderer.invoke("wallets:add", regtestWallet_3);
      }
      // re-fetching wallets
      wallets = await ipcRenderer.invoke("wallets:all");
    } else {
      // the normal situation with multi-wallet.
      currentWalletId = settings.currentwalletid;
      const cw: WalletType[] = wallets.filter((w: WalletType) => w.id === currentWalletId);
      if (!cw || cw.length === 0) {
        // if the id is wrong, selecting the first wallet by default.
        const walletsSorted = wallets.sort((a, b) => {
          const chainCmp = a.chain_name.localeCompare(b.chain_name);
          return chainCmp !== 0 ? chainCmp : a.id - b.id;
        });
        let firstWallet: WalletType = !!walletsSorted && walletsSorted[0];
        if (firstWallet) {
          currentWalletId = firstWallet.id;
          currentWallet = firstWallet;
          this.setState({
            currentWallet: firstWallet,
          });
        } else {
          // no wallets remaining...
          currentWalletId = null;
          currentWallet = null;
        }
      } else {
        currentWallet = cw[0];
        this.setState({
          currentWallet: cw[0],
        });
      }
      // check if have the new fields: selection / uri
      const {
        uri: currentWalleUri,
        chain_name: currentWalletChain_name,
        selection: currentWalletSelection,
      } = await this.checkCurrentSettings(
        currentWallet && currentWallet.uri
          ? currentWallet.uri
          : currentWallet && currentWallet.chain_name === chain_name
            ? uri
            : "",
        currentWallet && currentWallet.chain_name ? currentWallet.chain_name : chain_name,
        currentWallet && currentWallet.selection
          ? currentWallet.selection
          : currentWallet && currentWallet.chain_name === chain_name
            ? selection
            : ServerSelectionEnum.custom,
      );
      console.log(
        "&&&&&&&&&&&&&&&&& CHECKED wallet settings",
        currentWalleUri,
        currentWalletChain_name,
        currentWalletSelection,
      );
      uri = currentWalleUri;
      chain_name = currentWalletChain_name;
      selection = currentWalletSelection;
      // if currentwallet then store it.
      if (currentWallet !== null) {
        currentWallet.uri = currentWalleUri;
        currentWallet.chain_name = currentWalletChain_name;
        currentWallet.selection = currentWalletSelection;
        if (!currentWallet.hasOwnProperty("performanceLevel")) {
          currentWallet.performanceLevel = PerformanceLevelEnum.High;
        }
        await ipcRenderer.invoke("wallets:update", currentWallet);
        this.setState({
          currentWallet: currentWallet,
        });
      }
      // re-fetching wallets again...
      wallets = await ipcRenderer.invoke("wallets:all");
      // not exists default mainnet wallet
      // trying to recover it
      const mainnetWalletExistsResult: boolean = await native.wallet_exists(
        "",
        ServerChainNameEnum.mainChainName,
        PerformanceLevelEnum.High,
        3,
        "",
      );
      console.log(mainnetWalletExistsResult);
      if (!mainnetWalletExistsResult) {
        if (wallets.filter((w) => w.id === 1).length === 1) {
          console.log("RECOVERY. Mainnet wallet not found, delete wallet.");
          await ipcRenderer.invoke("wallets:remove", 1);
        }
      } else {
        if (wallets.filter((w) => w.id === 1).length === 0) {
          let mainnetWallet_1: WalletType | null = null;
          if (chain_name === ServerChainNameEnum.mainChainName) {
            mainnetWallet_1 = {
              id: 1, // by default: 1 (mainnet)
              fileName: "", // by default: zingo-wallet.dat
              alias: "Main Wallet",
              creationType: CreationTypeEnum.Main,
              uri: uri,
              chain_name: chain_name,
              selection: selection,
              performanceLevel: PerformanceLevelEnum.High,
            };
          } else {
            let d = serverUrisList().filter(
              (s: ServerClass) => s.chain_name === ServerChainNameEnum.mainChainName && !s.obsolete && s.default,
            );
            mainnetWallet_1 = {
              id: 1, // by default: 1 (mainnet)
              fileName: "", // by default: zingo-wallet.dat
              alias: "Main Wallet",
              creationType: CreationTypeEnum.Main,
              uri: !d || d.length === 0 ? "" : d[0].uri,
              chain_name: ServerChainNameEnum.mainChainName,
              selection: !d || d.length === 0 ? ServerSelectionEnum.custom : ServerSelectionEnum.list,
              performanceLevel: PerformanceLevelEnum.High,
            };
          }
          if (mainnetWallet_1 !== null) {
            await ipcRenderer.invoke("wallets:add", mainnetWallet_1);
          }
        }
      }
      // not exists default testnet wallet
      // trying to recover it
      const testnetWalletExistsResult: boolean = await native.wallet_exists(
        "",
        ServerChainNameEnum.testChainName,
        PerformanceLevelEnum.High,
        3,
        "",
      );
      console.log(testnetWalletExistsResult);
      if (!testnetWalletExistsResult) {
        if (wallets.filter((w) => w.id === 2).length === 1) {
          console.log("RECOVERY. Testnet wallet not found, delete wallet.");
          await ipcRenderer.invoke("wallets:remove", 2);
        }
      } else {
        if (wallets.filter((w) => w.id === 2).length === 0) {
          let testnetWallet_2: WalletType | null = null;
          if (chain_name === ServerChainNameEnum.testChainName) {
            testnetWallet_2 = {
              id: 2, // by default: 1 (testnet)
              fileName: "", // by default: zingo-wallet.dat
              alias: "Main Wallet",
              creationType: CreationTypeEnum.Main,
              uri: uri,
              chain_name: chain_name,
              selection: selection,
              performanceLevel: PerformanceLevelEnum.High,
            };
          } else {
            let d = serverUrisList().filter(
              (s: ServerClass) => s.chain_name === ServerChainNameEnum.testChainName && !s.obsolete && s.default,
            );
            testnetWallet_2 = {
              id: 2, // by default: 1 (testnet)
              fileName: "", // by default: zingo-wallet.dat
              alias: "Main Wallet",
              creationType: CreationTypeEnum.Main,
              uri: !d || d.length === 0 ? "" : d[0].uri,
              chain_name: ServerChainNameEnum.testChainName,
              selection: !d || d.length === 0 ? ServerSelectionEnum.custom : ServerSelectionEnum.list,
              performanceLevel: PerformanceLevelEnum.High,
            };
          }
          if (testnetWallet_2 !== null) {
            await ipcRenderer.invoke("wallets:add", testnetWallet_2);
          }
        }
      }
      // not exists default regtest wallet
      // trying to recover it
      const regnetWalletExistsResult: boolean = await native.wallet_exists(
        "",
        ServerChainNameEnum.regtestChainName,
        PerformanceLevelEnum.High,
        3,
        "",
      );
      console.log(regnetWalletExistsResult);
      if (!regnetWalletExistsResult) {
        if (wallets.filter((w) => w.id === 3).length === 1) {
          console.log("RECOVERY. Regtest wallet not found, delete wallet");
          await ipcRenderer.invoke("wallets:remove", 3);
        }
      } else {
        if (wallets.filter((w) => w.id === 3).length === 0) {
          let regtestWallet_3: WalletType | null = null;
          if (chain_name === ServerChainNameEnum.regtestChainName) {
            regtestWallet_3 = {
              id: 3, // by default: 1 (testnet)
              fileName: "", // by default: zingo-wallet.dat
              alias: "Main Wallet",
              creationType: CreationTypeEnum.Main,
              uri: uri,
              chain_name: chain_name,
              selection: selection,
              performanceLevel: PerformanceLevelEnum.High,
            };
          } else {
            let d = serverUrisList().filter(
              (s: ServerClass) => s.chain_name === ServerChainNameEnum.regtestChainName && !s.obsolete && s.default,
            );
            regtestWallet_3 = {
              id: 3, // by default: 1 (testnet)
              fileName: "", // by default: zingo-wallet.dat
              alias: "Main Wallet",
              creationType: CreationTypeEnum.Main,
              uri: !d || d.length === 0 ? "" : d[0].uri,
              chain_name: ServerChainNameEnum.regtestChainName,
              selection: !d || d.length === 0 ? ServerSelectionEnum.custom : ServerSelectionEnum.list,
              performanceLevel: PerformanceLevelEnum.High,
            };
          }
          if (regtestWallet_3 !== null) {
            await ipcRenderer.invoke("wallets:add", regtestWallet_3);
          }
        }
      }
      // re-fetching wallets again...
      wallets = await ipcRenderer.invoke("wallets:all");
    }

    await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: uri });
    await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: chain_name });
    await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selection });
    await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: currentWalletId });

    return {
      currentWallet,
      wallets,
    };
  };

  doFirstTimeSetup = async () => {
    // On macOS MAS builds, request security-scoped access to the wallet directory
    // before any native wallet calls. On other platforms this returns null (no-op).
    try {
      // The handler activates the security-scoped bookmark and calls
      // set_wallet_base_dir on the Rust side directly. The renderer no longer
      // touches either — see electron.js wallet-dir:request.
      const walletDirResult: { path: string } | null = await ipcRenderer.invoke("wallet-dir:request");
      console.log(
        `[wallet-dir] result=${walletDirResult !== null ? "ok path=" + walletDirResult.path : "null"} isSandboxed=${isSandboxed}`,
      );
      if (walletDirResult === null && isSandboxed) {
        // On MAS sandbox the handler only returns null if the user quit the app via the
        // dialog, which calls app.quit() before reaching here. If we somehow land here
        // it means an unexpected failure — don't silently proceed with the empty container dir.
        this.props.setCurrentWalletOpenError("Could not access the wallet folder. Please restart the application.");
        this.setState({ loadingDone: true });
        return;
      }
    } catch (e) {
      console.error("wallet-dir:request failed:", e);
      if (isSandboxed) {
        this.props.setCurrentWalletOpenError(`Could not access the wallet folder: ${e}`);
        this.setState({ loadingDone: true });
        return;
      }
    }

    let { currentWallet, wallets } = await this.loadCurrentWallet();
    console.log(
      `Url: -${currentWallet && currentWallet.id}-${currentWallet && currentWallet.uri}-${currentWallet && currentWallet.chain_name}-${currentWallet && currentWallet.selection}`,
    );

    // if no current wallet but there are wallets,
    // select the first one.
    if (currentWallet === null && wallets.length > 0) {
      currentWallet = wallets[0];
      await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: currentWallet.uri });
      await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: currentWallet.chain_name });
      await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: currentWallet.selection });
      await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: currentWallet.id });
    }
    this.props.setCurrentWallet(currentWallet);
    this.props.setWallets(wallets);

    // if no current wallet here means no wallets at all,
    if (currentWallet === null) {
      this.setState({
        loadingDone: true,
      });
      return;
    }

    try {
      const walletExistsResult: boolean = await native.wallet_exists(
        currentWallet.uri,
        currentWallet.chain_name,
        currentWallet.performanceLevel,
        3,
        currentWallet.fileName,
      );
      console.log(walletExistsResult);
      if (!walletExistsResult) {
        // the wallet file DOES NOT exists
        // if currentWalletId have a value -> remove the wallet local data for this id.
        await ipcRenderer.invoke("wallets:remove", currentWallet.id);
        await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: null });
        // re-fetching wallets
        const walletsNew = await ipcRenderer.invoke("wallets:all");
        this.setState({
          currentWallet: null,
        });
        this.props.setCurrentWallet(null);
        this.props.setWallets(walletsNew);

        this.componentDidMount();
      } else {
        this.setState({ walletExists: true });
        // the wallet file YES exists
        // A failed init rejects (typed error on the throw channel); the catch
        // below surfaces it via setCurrentWalletOpenError. Success is JSON.
        const result: string = await native.init_from_b64(
          currentWallet.uri,
          currentWallet.chain_name,
          currentWallet.performanceLevel,
          3,
          currentWallet.fileName,
        );

        const resultJSON = JSON.parse(result);

        // seed phrase or ufvk
        const walletKindStr: string = await native.wallet_kind();
        const walletKindJSON = JSON.parse(walletKindStr);

        if (walletKindJSON.kind === "Loaded from unified full viewing key" || walletKindJSON.kind === "No keys found") {
          // ufvk
          this.props.setBirthday(resultJSON.birthday);
          this.props.setPools(walletKindJSON.orchard, walletKindJSON.sapling, walletKindJSON.transparent);
          this.props.setReadOnly(true);
        } else {
          // seed phrase
          this.props.setBirthday(resultJSON.birthday);
          this.props.setPools(walletKindJSON.orchard, walletKindJSON.sapling, walletKindJSON.transparent);
          this.props.setReadOnly(false);
        }

        this.getInfo();
      }
    } catch (error) {
      console.error("Error initializing", error);
      this.props.setCurrentWalletOpenError(`${error}`);
      this.setState({
        loadingDone: true,
      });
    }
  };

  getInfo = async () => {
    // Try getting the info.
    try {
      const { runRPCConfigure, setInfo } = this.props;

      const info: InfoClass = await RPC.getInfoObject();

      if (info.error) {
        this.props.setFetchError("info", `${info.error}`);
      }

      setInfo(info);

      runRPCConfigure();

      // This will cause a redirect to the dashboard screen
      this.setState({ loadingDone: true });
    } catch (error) {
      console.error("Error initializing", error);
      this.props.setFetchError("info", `${error}`);
    }
  };

  componentDidUpdate(_prevProps: LoadingScreenProps, prevState: LoadingScreenState) {
    if (!prevState.loadingDone && this.state.loadingDone) {
      this.navigationTimer = setTimeout(() => this.props.navigateToDashboard(), 10);
    }
  }

  componentWillUnmount() {
    clearTimeout(this.navigationTimer);
  }

  render() {
    const { currentWallet } = this.state;

    return (
      <div className={`${cstyles.verticalflex} ${cstyles.center} ${styles.loadingcontainer}`}>
        <div style={{ marginTop: "50px", marginBottom: "20px" }}>
          <Logo readOnly={false} onlyVersion={false} />
        </div>
        {!!currentWallet && (
          <div
            style={{
              width: "40%",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              alignSelf: "center",
            }}
          >
            ...Loading...
            <div className={styles.detailcontainer}>
              <div className={styles.detaillines}>
                <DetailLine label="Wallet" value={currentWallet.alias} />
                <DetailLine label="Wallet created by" value={currentWallet.creationType} />
                <DetailLine label="Network" value={Utils.chainDisplayName(currentWallet.chain_name)} />
                <DetailLine label="Server" value={currentWallet.uri} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}

type LoadingScreenPublicProps = Omit<LoadingScreenProps, "location">;

const LoadingScreenWithLocation: React.FC<LoadingScreenPublicProps> = (props) => {
  const location = useLocation();
  return <LoadingScreen {...props} location={location} />;
};

export { LoadingScreenWithLocation as LoadingScreen };
export default LoadingScreenWithLocation;
