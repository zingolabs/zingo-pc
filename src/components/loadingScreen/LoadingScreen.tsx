import React, { Component } from "react";
import { RouteComponentProps, withRouter } from "react-router";
import { native, ipcRenderer } from "../../electronBridge";
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
import { Logo } from "../logo";
import DetailLine from "../detailLine/DetailLine";

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
  runRPCConfigure: () => void;
  setInfo: (info: InfoClass) => void;
  setReadOnly: (readOnly: boolean) => void;
  setServerUris: (serverUris: ServerClass[]) => void;
  navigateToDashboard: () => void;
  setRecoveryInfo: (s: string, u: string, b: number) => void;
  setPools: (o: boolean, s: boolean, t: boolean) => void;
  setWallets: (ws: WalletType[]) => void;
  setCurrentWallet: (w: WalletType | null) => void;
  setCurrentWalletOpenError: (e: string) => void;
  setFetchError: (command: string, error: string) => void;
  setBlockExplorer: (be: any) => void;
};

const chains = {
  main: "Mainnet",
  test: "Testnet",
  regtest: "Regtest",
  "": "",
};

class LoadingScreen extends Component<LoadingScreenProps & RouteComponentProps, LoadingScreenState> {
  static contextType = ContextApp;

  constructor(props: LoadingScreenProps & RouteComponentProps) {
    super(props);

    let serverUris: ServerClass[] = [];
    if (props.location.state) {
      const locationState = props.location.state as {
        serverUris: ServerClass[];
      };
      serverUris = locationState.serverUris;
    }
    this.state = new LoadingScreenState();
    this.props.setServerUris(serverUris);
  }

  componentDidMount = async () => {
    const { openErrorModal, closeErrorModal } = this.context as React.ContextType<typeof ContextApp>;

    try {
      native.set_crypto_default_provider_to_ring();
      //console.log('crypto provider result', r);
    } catch (error) {
      console.log(`Critical Error crypto provider default ${error}`);
    }

    await this.doFirstTimeSetup();

    // only if the active wallet exists
    if (this.state.walletExists) {
      // warning with the migration from Z1 to Z2
      const version = await RPC.getWalletVersion();
      //console.log('WALLET VERSION -------------->', version);
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
    if (!serveruri && !serverchain_name && !serverselection) {
      // no settings stored, asumming `list` and the first server by default.
      const d = serverUrisList().filter((s: ServerClass) => !s.obsolete && s.default);
      uri = d[0].uri;
      chain_name = d[0].chain_name;
      selection = ServerSelectionEnum.list;
      return { uri, chain_name, selection };
    } else {
      if (!serveruri) {
        // no settings for server stored, asumming `list` and the first server by default.
        const d = serverUrisList().filter((s: ServerClass) => !s.obsolete && s.default);
        uri = d[0].uri;
        chain_name = d[0].chain_name;
        selection = ServerSelectionEnum.list;
        return { uri, chain_name, selection };
      } else {
        // the server is in settings, asking for the other fields.
        const serverInList = serverUrisList().filter((s: ServerClass) => s.uri === serveruri);
        uri = serveruri;
        if (!serverchain_name) {
          if (serverInList && serverInList.length === 1) {
            // if the server is in the list, then selection is `list`
            if (serverInList[0].obsolete) {
              // if obsolete then select the first one on list
              const d = serverUrisList().filter((s: ServerClass) => !s.obsolete && s.default);
              uri = d[0].uri;
              chain_name = d[0].chain_name;
              selection = ServerSelectionEnum.list;
              return { uri, chain_name, selection };
            } else {
              chain_name = serverInList[0].chain_name;
              selection = ServerSelectionEnum.list;
              return { uri, chain_name, selection };
            }
          } else {
            // asuming mainnet
            chain_name = ServerChainNameEnum.mainChainName;
            selection = ServerSelectionEnum.custom;
            return { uri, chain_name, selection };
          }
        } else {
          // the server & chain are in settings, asking for selection
          chain_name = serverchain_name;
          if (!serverselection) {
            if (serverInList && serverInList.length === 1) {
              // if the server is in the list, then selection is `list`
              if (serverInList[0].obsolete) {
                // if obsolete then select the first one on list for the chain
                let d = serverUrisList().filter(
                  (s: ServerClass) => s.chain_name === chain_name && !s.obsolete && s.default,
                );
                if (!d || d.length === 0) {
                  d = serverUrisList().filter((s: ServerClass) => !s.obsolete && s.default);
                }
                uri = d[0].uri;
                chain_name = d[0].chain_name;
                selection = ServerSelectionEnum.list;
                return { uri, chain_name, selection };
              } else {
                chain_name = serverInList[0].chain_name;
                selection = ServerSelectionEnum.list;
                return { uri, chain_name, selection };
              }
            } else {
              selection = ServerSelectionEnum.custom;
              return { uri, chain_name, selection };
            }
          } else {
            selection = serverselection;
          }
        }
      }
    }

    // if the server selected is now obsolete, change it for the first one
    const serverInList: ServerClass[] = serverUrisList().filter((s: ServerClass) => s.uri === uri);
    if (serverInList && serverInList.length === 1 && serverInList[0].obsolete) {
      // select the first one for the chain selected by default
      let d = serverUrisList().filter((s: ServerClass) => s.chain_name === chain_name && !s.obsolete && s.default);
      if (!d || d.length === 0) {
        // reset server
        uri = "";
        selection = ServerSelectionEnum.custom;
      } else {
        uri = d[0].uri;
        selection = ServerSelectionEnum.list;
      }
      console.log("server obsolete =>", uri, chain_name);
      return { uri, chain_name, selection };
    }

    // if empty is the first time and if auto => App needs to check the servers.
    if (selection === ServerSelectionEnum.auto) {
      // we need to filter by Network/Chain
      const servers: ServerClass[] = serverUrisList().filter(
        (s: ServerClass) => s.chain_name === chain_name && !s.obsolete,
      );
      const serverFaster = await this.selectingServer(servers);
      if (serverFaster) {
        uri = serverFaster.uri;
        selection = ServerSelectionEnum.list;
      } else if (!!servers && servers.length > 0) {
        // none of the servers are working properly.
        uri = servers[0].uri;
        selection = ServerSelectionEnum.list;
      } else {
        // no appropiate server to choose.
        let d = serverUrisList().filter((s: ServerClass) => s.chain_name === chain_name && !s.obsolete && s.default);
        if (!d || d.length === 0) {
          // reset server
          uri = "";
          selection = ServerSelectionEnum.custom;
        } else {
          uri = d[0].uri;
          selection = ServerSelectionEnum.list;
        }
      }
    }
    // server settings checked
    return { uri, chain_name, selection };
  };

  loadCurrentWallet = async () => {
    // try to read wallets
    let wallets: WalletType[] = await ipcRenderer.invoke("wallets:all");
    console.log("&&&&&&&&&&&&&&&&& WALLETS", wallets);
    // Try to read the default server
    const settings = await ipcRenderer.invoke("loadSettings");
    console.log("&&&&&&&&&&&&&&&&& SETTINGS", settings);
    let currentWalletId: number | null = null;
    let currentWallet: WalletType | null = null;
    let { uri, chain_name, selection } = await this.checkCurrentSettings(
      settings && settings.serveruri ? settings.serveruri : "",
      settings && settings.serverchain_name ? settings.serverchain_name : "",
      settings && settings.serverselection ? settings.serverselection : "",
    );
    console.log("&&&&&&&&&&&&&&&&& CHECKED SETTINGS", uri, chain_name, selection);

    // block explorer configuration
    if (settings && settings.hasOwnProperty("blockexplorer")) {
      this.props.setBlockExplorer(settings.blockexplorer);
    }

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
      const mainnetWalletExistsResult: boolean = native.wallet_exists(
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
      const testnetWalletExistsResult: boolean = native.wallet_exists(
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
      const regnetWalletExistsResult: boolean = native.wallet_exists(
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
      console.log("wwwwwwwwwwwwwwwwwwwallet BEFORE", currentWalletId, currentWallet);
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
        console.log("wwwwwwwwwwwwwwwwwwwallet STORE", currentWalletId, currentWallet);
        await ipcRenderer.invoke("wallets:update", currentWallet);
        this.setState({
          currentWallet: currentWallet,
        });
      }
      // re-fetching wallets again...
      wallets = await ipcRenderer.invoke("wallets:all");
      // not exists default mainnet wallet
      // trying to recover it
      const mainnetWalletExistsResult: boolean = native.wallet_exists(
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
      const testnetWalletExistsResult: boolean = native.wallet_exists(
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
      const regnetWalletExistsResult: boolean = native.wallet_exists(
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

    console.log("&&&&&&&&-----------", currentWalletId, uri, chain_name, selection, currentWallet, wallets);

    return {
      currentWallet,
      wallets,
    };
  };

  doFirstTimeSetup = async () => {
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
      const walletExistsResult: boolean = native.wallet_exists(
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
        const result: string = native.init_from_b64(
          currentWallet.uri,
          currentWallet.chain_name,
          currentWallet.performanceLevel,
          3,
          currentWallet.fileName,
        );
        //const result: string = 'Error: ay, ay, ay';
        //console.log(`Initialization: ${result}`);
        if (!result || result.toLowerCase().startsWith("error")) {
          console.log(`Initialization Error: ${result}`);
          this.props.setCurrentWalletOpenError(`${result}`);
          this.setState({
            loadingDone: true,
          });
          return;
        }

        const resultJSON = await JSON.parse(result);

        // seed phrase or ufvk
        const walletKindStr: string = await native.wallet_kind();
        const walletKindJSON = JSON.parse(walletKindStr);

        if (walletKindJSON.kind === "Loaded from unified full viewing key" || walletKindJSON.kind === "No keys found") {
          // ufvk
          this.props.setRecoveryInfo("", resultJSON.ufvk, resultJSON.birthday);
          this.props.setPools(walletKindJSON.orchard, walletKindJSON.sapling, walletKindJSON.transparent);
          this.props.setReadOnly(true);
        } else {
          // seed phrase
          this.props.setRecoveryInfo(resultJSON.seed_phrase, "", resultJSON.birthday);
          this.props.setPools(walletKindJSON.orchard, walletKindJSON.sapling, walletKindJSON.transparent);
          this.props.setReadOnly(false);
        }

        this.getInfo();
      }
    } catch (error) {
      console.log("Error initializing", error);
      this.props.setCurrentWalletOpenError(`${error}`);
      this.setState({
        loadingDone: true,
      });
    }
  };

  calculateLatency = async (server: ServerClass, _index: number) => {
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

  selectingServer = async (serverUris: ServerClass[]): Promise<ServerClass | null> => {
    const servers: ServerClass[] = serverUris;

    // 15 seconds max.
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15 * 1000));

    const validServersPromises = servers.map(
      (server: ServerClass) =>
        new Promise<ServerClass>(async (resolve) => {
          const latency = await this.calculateLatency(server, servers.indexOf(server));
          if (latency !== null) {
            resolve({ ...server, latency });
          }
        }),
    );

    const fastestServer = await Promise.race([...validServersPromises, timeoutPromise]);

    return fastestServer;
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
      console.log("Error initializing", error);
      this.props.setFetchError("info", `${error}`);
    }
  };

  render() {
    const { loadingDone, currentWallet } = this.state;

    if (loadingDone) {
      setTimeout(() => this.props.navigateToDashboard(), 10);
    }

    return (
      <div className={[cstyles.verticalflex, cstyles.center, styles.loadingcontainer].join(" ")}>
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
                <DetailLine label="Network" value={chains[currentWallet.chain_name]} />
                <DetailLine label="Server" value={currentWallet.uri} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}

// @ts-ignore
export default withRouter(LoadingScreen);
