import React, { Component } from "react";
import { RouteComponentProps, withRouter } from "react-router";
import TextareaAutosize from "react-textarea-autosize";
import progress from "progress-stream";
import axios from "axios";
import native from "../../native.node";
import { CreationTypeEnum, InfoClass, PerformanceLevelEnum, ServerClass, ServerSelectionEnum } from "../appstate";
import RPC from "../../rpc/rpc";
import cstyles from "../common/Common.module.css";
import styles from "./LoadingScreen.module.css";
import { ContextApp } from "../../context/ContextAppState";
import serverUrisList from "../../utils/serverUrisList";
import { Logo } from "../logo";
import { ServerChainNameEnum } from "../appstate/enums/ServerChainNameEnum";
import { WalletType } from "../appstate/types/WalletType";
import Utils from "../../utils/utils";

const { ipcRenderer } = window.require("electron");
const fs = window.require("fs");

class LoadingScreenState {
  currentStatus: string | JSX.Element;

  currentStatusIsError: boolean;

  loadingDone: boolean;

  currentWallet: WalletType | null;

  wallets: WalletType[];

  walletScreen: number; 
  // 0 -> no wallet, load existing wallet 
  // 1 -> show options
  // 2 -> create new 
  // 3 -> restore existing seed phrase
  // 4 -> restore existing ufvk
  // 5 -> restore existing dat wallet file

  newWalletError: null | string; // Any errors when creating/restoring wallet

  seed_phrase: string; // The new seed phrase for a newly created wallet or the seed phrase to restore from

  ufvk: string; // The UFVK to restore from

  fileWallet: string; // The Wallet File Name to load from

  birthday: number; // Wallet birthday if we're restoring

  changeAnotherWalletMenu: boolean;

  serverUris: ServerClass[];

  buttonsDisable: boolean;

  walletExists: boolean;

  constructor(currentStatus: string | JSX.Element, 
              currentStatusIsError: boolean, 
              changeAnotherWalletMenu: boolean, 
              serverUris: ServerClass[],
              walletScreen: number,
            ) {
    this.currentStatus = currentStatus;
    this.currentStatusIsError = currentStatusIsError;
    this.loadingDone = false;
    this.currentWallet = null;
    this.wallets = [];
    this.walletScreen = walletScreen;
    this.newWalletError = null;
    this.seed_phrase = "";
    this.ufvk = "";
    this.fileWallet = "";
    this.birthday = 0;
    this.changeAnotherWalletMenu = changeAnotherWalletMenu;
    this.serverUris = serverUris;
    this.buttonsDisable = false;
    this.walletExists = false;
  }
}

type LoadingScreenProps = {
  runRPCConfigure: () => void;
  setInfo: (info: InfoClass) => void;
  openServerSelectModal: () => void;
  setReadOnly: (readOnly: boolean) => void;
  setServerUris: (serverUris: ServerClass[]) => void;
  navigateToDashboard: () => void;
  setRecoveryInfo: (s: string, u: string, b: number) => void;
  setPools: (o: boolean, s: boolean, t: boolean) => void;
  setWallets: (w: WalletType | null,  ws: WalletType[]) => void;
  clearTimers: () => Promise<void>;
};

const chains = {
    "main": "Mainnet",
    "test": "Testnet",
    "regtest": "Regtest",
    "": ""
  }; 

class LoadingScreen extends Component<LoadingScreenProps & RouteComponentProps, LoadingScreenState> {
  static contextType = ContextApp;

  constructor(props: LoadingScreenProps & RouteComponentProps) {
    super(props);

    let currentStatusIsError: boolean = false,
        currentStatus: string | JSX.Element = (
          <span>
            Checking servers to connect...
            <br />
            This process can take several seconds/minutes depends of the Server's status.
          </span>
        ),
        changeAnotherWalletMenu: boolean = false,
        serverUris: ServerClass[] = [],
        walletScreen: number = 0;
    if (props.location.state) {
      const locationState = props.location.state as { 
        currentStatusIsError: boolean, 
        currentStatus: string,
        changeAnotherWalletMenu: boolean,
        serverUris: ServerClass[],
        walletScreen: number,
      };
      currentStatus = locationState.currentStatus;
      currentStatusIsError = locationState.currentStatusIsError;
      changeAnotherWalletMenu = locationState.changeAnotherWalletMenu;
      walletScreen = locationState.walletScreen;
      serverUris = locationState.serverUris;
    }
    const state = new LoadingScreenState(
      currentStatus, 
      currentStatusIsError, 
      changeAnotherWalletMenu, 
      serverUris, 
      walletScreen
    ); 
    this.state = state;
    this.props.setServerUris(serverUris);
  }

  componentDidMount = async () => {
    this.setState({
      buttonsDisable: true,
    })
    const { openErrorModal } = this.context as React.ContextType<typeof ContextApp>;

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
        openErrorModal(
          "Wallet migration",
          <div>
            <div>
              We are migrating your wallet to the new synchronization system.
            </div>
            <div>
              Your balance will change as the migration progresses. Don't worry, your funds are safe!
            </div>
          </div>
        );
      }
    }

    this.setState({
      buttonsDisable: false,
    })
  }

  download = async (url: string, dest: string, name: string, cb: (msg: string) => void) => {
    const file = fs.createWriteStream(dest);

    try {
      const response = await axios.get(url, {
        responseType: "stream",
        // headers: { ... }
        // timeout: 60_000,
        // maxRedirects: 5,
        validateStatus: (s) => s >= 200 && s < 400,
      });

      if (response.status !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return cb(`Response status was ${response.status}`);
      }

      const len = response.headers["content-length"] ?? "";
      const totalSize = len ? (parseInt(len, 10) / 1024 / 1024).toFixed(0) : "??";

      const str = progress({ time: 1000 }, (pgrs) => {
        this.setState({
          currentStatus: `Downloading ${name}... (${(pgrs.transferred / 1024 / 1024).toFixed(0)} MB / ${totalSize} MB)`,
          currentStatusIsError: false,
        });
      });

      if (len) str.setLength(parseInt(len, 10));

      response.data.pipe(str).pipe(file);

      file.on("finish", () => file.close());

      response.data.on("error", (err: any) => {
        try { file.destroy(); } catch {}
        fs.unlink(dest, () => cb(err.message));
      });

      file.on("error", (err: any) => {
        try { file.destroy(); } catch {}
        fs.unlink(dest, () => cb(err.message));
      });
    } catch (err: any) {
      try { file.destroy(); } catch {}
      fs.unlink(dest, () => {});
      const msg =
        err?.response?.status
          ? `Response status was ${err.response.status}`
          : (err?.message || "Unknown axios error");
      cb(msg);
    }
  };

  checkCurrentSettings = async (serveruri: string, serverchain_name: ServerChainNameEnum, serverselection: ServerSelectionEnum) => {
    let uri: string = '', 
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
        const serverInList = serverUrisList().filter((s: ServerClass) => s.uri === serveruri)
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
                let d = serverUrisList().filter((s: ServerClass) => s.chain_name === chain_name && !s.obsolete && s.default);
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
    const serverInList: ServerClass[] = serverUrisList().filter((s: ServerClass) => s.uri === uri)
    if (serverInList && serverInList.length === 1 && serverInList[0].obsolete) {
      // select the first one for the chain selected by default
      let d = serverUrisList().filter((s: ServerClass) => s.chain_name === chain_name && !s.obsolete && s.default);
      if (!d || d.length === 0) {
        // reset server
        uri = '';
        selection = ServerSelectionEnum.custom;
      } else {
        uri = d[0].uri;
        selection = ServerSelectionEnum.list;
      }
      console.log('server obsolete =>', uri, chain_name);
      return { uri, chain_name, selection };
    }

    // if empty is the first time and if auto => App needs to check the servers.
    if (selection === ServerSelectionEnum.auto) {
      // we need to filter by Network/Chain
      const servers: ServerClass[] = serverUrisList().filter((s: ServerClass) => s.chain_name === chain_name && !s.obsolete);
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
          uri = '';
          selection = ServerSelectionEnum.custom;
        } else {
          uri = d[0].uri;
          selection = ServerSelectionEnum.list;
        }
      }
    }
    // server settings checked
    return {uri, chain_name, selection};
  };

  loadCurrentWallet = async () => {
    // try to read wallets 
    let wallets: WalletType[] = await ipcRenderer.invoke("wallets:all");
    console.log('&&&&&&&&&&&&&&&&& WALLETS', wallets);
    // Try to read the default server
    const settings = await ipcRenderer.invoke("loadSettings");
    console.log('&&&&&&&&&&&&&&&&& SETTINGS', settings);
    let currentWalletId: number | null = null;
    let currentWallet: WalletType | null = null;
    let { uri, chain_name, selection } = await this.checkCurrentSettings(
      settings && settings.serveruri ? settings.serveruri : '', 
      settings && settings.serverchain_name ? settings.serverchain_name : '', 
      settings && settings.serverselection ? settings.serverselection : ''
    );
    console.log('&&&&&&&&&&&&&&&&& CHECKED SETTINGS', uri, chain_name, selection);

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
      const mainnetWalletExistsResult: boolean | string = native.wallet_exists('', ServerChainNameEnum.mainChainName, PerformanceLevelEnum.High, 3, '');
      console.log(mainnetWalletExistsResult);
      if (!mainnetWalletExistsResult) {
        console.log('MIGRATION. Mainnet wallet not found.');
      } else {
        if (chain_name === ServerChainNameEnum.mainChainName) {
          currentWalletId = 1;
          mainnetWallet_1 = {
            id: 1, // by default: 1 (mainnet)
            fileName: '', // by default: zingo-wallet.dat
            alias: 'Main Wallet',
            creationType: CreationTypeEnum.Main,
            uri: uri,
            chain_name: chain_name,
            selection: selection,
            PerformanceLevel: PerformanceLevelEnum.High,
          };
          currentWallet = mainnetWallet_1;
        } else {
          let d = serverUrisList().filter((s: ServerClass) => s.chain_name === ServerChainNameEnum.mainChainName && !s.obsolete && s.default);
          mainnetWallet_1 = {
            id: 1, // by default: 1 (mainnet)
            fileName: '', // by default: zingo-wallet.dat
            alias: 'Main Wallet',
            creationType: CreationTypeEnum.Main,
            uri: !d || d.length === 0 ? '' : d[0].uri,
            chain_name: ServerChainNameEnum.mainChainName,
            selection: !d || d.length === 0 ? ServerSelectionEnum.custom : ServerSelectionEnum.list,
            PerformanceLevel: PerformanceLevelEnum.High,
          };
        }
      }
      // TESTNET
      const testnetWalletExistsResult: boolean | string = native.wallet_exists('', ServerChainNameEnum.testChainName, PerformanceLevelEnum.High, 3, '');
      console.log(testnetWalletExistsResult);
      if (!testnetWalletExistsResult) {
        console.log('MIGRATION. Testnet wallet not found.');
      } else {
        if (chain_name === ServerChainNameEnum.testChainName) {
          currentWalletId = 2;
          testnetWallet_2 = {
            id: 2, // by default: 1 (testnet)
            fileName: '', // by default: zingo-wallet.dat
            alias: 'Main Wallet',
            creationType: CreationTypeEnum.Main,
            uri: uri,
            chain_name: chain_name,
            selection: selection,
            PerformanceLevel: PerformanceLevelEnum.High,
          };
          currentWallet = testnetWallet_2;
        } else {
          let d = serverUrisList().filter((s: ServerClass) => s.chain_name === ServerChainNameEnum.testChainName && !s.obsolete && s.default);
          testnetWallet_2 = {
            id: 2, // by default: 1 (testnet)
            fileName: '', // by default: zingo-wallet.dat
            alias: 'Main Wallet',
            creationType: CreationTypeEnum.Main,
            uri: !d || d.length === 0 ? '' : d[0].uri,
            chain_name: ServerChainNameEnum.testChainName,
            selection: !d || d.length === 0 ? ServerSelectionEnum.custom : ServerSelectionEnum.list,
            PerformanceLevel: PerformanceLevelEnum.High,
          };
        }
      }
      // REGTEST
      const regnetWalletExistsResult: boolean | string = native.wallet_exists('', ServerChainNameEnum.regtestChainName, PerformanceLevelEnum.High, 3, '');
      console.log(regnetWalletExistsResult);
      if (!regnetWalletExistsResult) {
        console.log('MIGRATION. Regtest wallet not found.');
      } else {
        if (chain_name === ServerChainNameEnum.regtestChainName) {
          currentWalletId = 3;
          regtestWallet_3 = {
            id: 3, // by default: 1 (testnet)
            fileName: '', // by default: zingo-wallet.dat
            alias: 'Main Wallet',
            creationType: CreationTypeEnum.Main,
            uri: uri,
            chain_name: chain_name,
            selection: selection,
            PerformanceLevel: PerformanceLevelEnum.High,
          };
          currentWallet = regtestWallet_3;
        } else {
          let d = serverUrisList().filter((s: ServerClass) => s.chain_name === ServerChainNameEnum.regtestChainName && !s.obsolete && s.default);
          regtestWallet_3 = {
            id: 3, // by default: 1 (testnet)
            fileName: '', // by default: zingo-wallet.dat
            alias: 'Main Wallet',
            creationType: CreationTypeEnum.Main,
            uri: !d || d.length === 0 ? '' : d[0].uri,
            chain_name: ServerChainNameEnum.regtestChainName,
            selection: !d || d.length === 0 ? ServerSelectionEnum.custom : ServerSelectionEnum.list,
            PerformanceLevel: PerformanceLevelEnum.High,
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
        let firstWallet: WalletType = !!wallets && wallets[0];
        if (firstWallet) {
          currentWalletId = firstWallet.id;
          currentWallet = firstWallet;
        } else {
          // no wallets remaining...
          currentWalletId = null;
          currentWallet = null;
        }
      } else {
        currentWallet = cw[0];
      }
      // check if have the new fields: selection / uri
      console.log('wwwwwwwwwwwwwwwwwwwallet BEFORE', currentWalletId, currentWallet);
      const { uri: currentWalleUri, chain_name: currentWalletChain_name, selection: currentWalletSelection } = await this.checkCurrentSettings(
        currentWallet && currentWallet.uri 
          ? currentWallet.uri 
          : (currentWallet && currentWallet.chain_name === chain_name ? uri : ''), 
        currentWallet && currentWallet.chain_name 
          ? currentWallet.chain_name 
          : chain_name, 
        currentWallet && currentWallet.selection 
          ? currentWallet.selection 
          : (currentWallet && currentWallet.chain_name === chain_name ? selection : ServerSelectionEnum.custom), 
      );
      console.log('&&&&&&&&&&&&&&&&& CHECKED wallet settings', currentWalleUri, currentWalletChain_name, currentWalletSelection);
      uri = currentWalleUri;
      chain_name = currentWalletChain_name;
      selection = currentWalletSelection;
      // if currentwallet then store it.
      if (currentWallet !== null) {
        currentWallet.uri = currentWalleUri;
        currentWallet.chain_name = currentWalletChain_name;
        currentWallet.selection = currentWalletSelection;
        console.log('wwwwwwwwwwwwwwwwwwwallet STORE', currentWalletId, currentWallet)
        await ipcRenderer.invoke("wallets:update", currentWallet);
      }
      // re-fetching wallets
      wallets = await ipcRenderer.invoke("wallets:all");
      // trying to recover the main wallets, just in case.
      //if (wallets.filter(w => w.id === 1).length === 0) {
        // not exists default mainnet wallet
        // trying to recover it
        const mainnetWalletExistsResult: boolean | string = native.wallet_exists('', ServerChainNameEnum.mainChainName, PerformanceLevelEnum.High, 3, '');
        console.log(mainnetWalletExistsResult);
        if (!mainnetWalletExistsResult) {
          console.log('RECOVERY. Mainnet wallet not found.');
          await ipcRenderer.invoke("wallets:remove", 1);
        } else {
          let mainnetWallet_1: WalletType | null = null;
          if (chain_name === ServerChainNameEnum.mainChainName) {
            mainnetWallet_1 = {
              id: 1, // by default: 1 (mainnet)
              fileName: '', // by default: zingo-wallet.dat
              alias: 'Main Wallet',
              creationType: CreationTypeEnum.Main,
              uri: uri,
              chain_name: chain_name,
              selection: selection,
              PerformanceLevel: PerformanceLevelEnum.High,
            };
          } else {
            let d = serverUrisList().filter((s: ServerClass) => s.chain_name === ServerChainNameEnum.mainChainName && !s.obsolete && s.default);
            mainnetWallet_1 = {
              id: 1, // by default: 1 (mainnet)
              fileName: '', // by default: zingo-wallet.dat
              alias: 'Main Wallet',
              creationType: CreationTypeEnum.Main,
              uri: !d || d.length === 0 ? '' : d[0].uri,
              chain_name: ServerChainNameEnum.mainChainName,
              selection: !d || d.length === 0 ? ServerSelectionEnum.custom : ServerSelectionEnum.list,
              PerformanceLevel: PerformanceLevelEnum.High,
            };
          }
          if (mainnetWallet_1 !== null) {
            await ipcRenderer.invoke("wallets:add", mainnetWallet_1);
          }
        }
      //}
      //if (wallets.filter(w => w.id === 2).length === 0) {
        // not exists default testnet wallet
        // trying to recover it
        const testnetWalletExistsResult: boolean | string = native.wallet_exists('', ServerChainNameEnum.testChainName, PerformanceLevelEnum.High, 3, '');
        console.log(testnetWalletExistsResult);
        if (!testnetWalletExistsResult) {
          console.log('RECOVERY. Testnet wallet not found.');
          await ipcRenderer.invoke("wallets:remove", 2);
        } else {
          let testnetWallet_2: WalletType | null = null;
          if (chain_name === ServerChainNameEnum.testChainName) {
            testnetWallet_2 = {
              id: 2, // by default: 1 (testnet)
              fileName: '', // by default: zingo-wallet.dat
              alias: 'Main Wallet',
              creationType: CreationTypeEnum.Main,
              uri: uri,
              chain_name: chain_name,
              selection: selection,
              PerformanceLevel: PerformanceLevelEnum.High,
            };
          } else {
            let d = serverUrisList().filter((s: ServerClass) => s.chain_name === ServerChainNameEnum.testChainName && !s.obsolete && s.default);
            testnetWallet_2 = {
              id: 2, // by default: 1 (testnet)
              fileName: '', // by default: zingo-wallet.dat
              alias: 'Main Wallet',
              creationType: CreationTypeEnum.Main,
              uri: !d || d.length === 0 ? '' : d[0].uri,
              chain_name: ServerChainNameEnum.testChainName,
              selection: !d || d.length === 0 ? ServerSelectionEnum.custom : ServerSelectionEnum.list,
              PerformanceLevel: PerformanceLevelEnum.High,
            };
          }
          if (testnetWallet_2 !== null) {
            await ipcRenderer.invoke("wallets:add", testnetWallet_2);
          }
        }
      //}
      //if (wallets.filter(w => w.id === 3).length === 0) {
        // not exists default regnet wallet
        // trying to recover it
        const regnetWalletExistsResult: boolean | string = native.wallet_exists('', ServerChainNameEnum.regtestChainName, PerformanceLevelEnum.High, 3, '');
        console.log(regnetWalletExistsResult);
        if (!regnetWalletExistsResult) {
          console.log('RECOVERY. Regtest wallet not found.');
          await ipcRenderer.invoke("wallets:remove", 3);
        } else {
          let regtestWallet_3: WalletType | null = null;
          if (chain_name === ServerChainNameEnum.regtestChainName) {
            regtestWallet_3 = {
              id: 3, // by default: 1 (testnet)
              fileName: '', // by default: zingo-wallet.dat
              alias: 'Main Wallet',
              creationType: CreationTypeEnum.Main,
              uri: uri,
              chain_name: chain_name,
              selection: selection,
              PerformanceLevel: PerformanceLevelEnum.High,
            };
          } else {
            let d = serverUrisList().filter((s: ServerClass) => s.chain_name === ServerChainNameEnum.regtestChainName && !s.obsolete && s.default);
            regtestWallet_3 = {
              id: 3, // by default: 1 (testnet)
              fileName: '', // by default: zingo-wallet.dat
              alias: 'Main Wallet',
              creationType: CreationTypeEnum.Main,
              uri: !d || d.length === 0 ? '' : d[0].uri,
              chain_name: ServerChainNameEnum.regtestChainName,
              selection: !d || d.length === 0 ? ServerSelectionEnum.custom : ServerSelectionEnum.list,
              PerformanceLevel: PerformanceLevelEnum.High,
            };
          }
          if (regtestWallet_3 !== null) {
            await ipcRenderer.invoke("wallets:add", regtestWallet_3);
          }
        }
      //}
      // re-fetching wallets again...
      wallets = await ipcRenderer.invoke("wallets:all");
    }

    await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: uri });
    await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: chain_name });
    await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selection });
    await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: currentWalletId });

    console.log('&&&&&&&&-----------', currentWalletId, uri, chain_name, selection, currentWallet); 

    return {
      currentWallet,
      wallets,
    };
  };

  doFirstTimeSetup = async () => {
    const { currentWallet, wallets } = await this.loadCurrentWallet();
    console.log(`Url: -${currentWallet && currentWallet.id}-${currentWallet && currentWallet.uri}-${currentWallet && currentWallet.chain_name}-${currentWallet && currentWallet.selection}`);

    this.setState({
      currentWallet,
      wallets,
    });
    this.props.setWallets(currentWallet, wallets);

    // First, set up the exit handler
    this.setupExitHandler();

    // if no current wallet exit now.
    if (currentWallet === null) {
      return;
    }
    
    try {
      const walletExistsResult: boolean | string = native.wallet_exists(currentWallet.uri, currentWallet.chain_name, PerformanceLevelEnum.High, 3, currentWallet.fileName);
      console.log(walletExistsResult);
      if (!walletExistsResult) {
        // the wallet file DOES NOT exists
        // if currentWalletId have a value -> remove the wallet local data for this id.
        await ipcRenderer.invoke("wallets:remove", currentWallet.id);
        await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: null });
        // re-fetching wallets
        const walletsNew = await ipcRenderer.invoke("wallets:all");
        this.setState({ 
          wallets: walletsNew, 
          currentWallet: null,
        });
        this.props.setWallets(null, walletsNew);
        
        // if exists others wallet for the same chain, pick the first one...
        const w = wallets.filter((item: WalletType) => item.chain_name === currentWallet.chain_name);
        if (!!w && w.length > 0) {
          // the first one...
          await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: w[0].id });
          this.setState({ 
            wallets: walletsNew, 
            currentWallet: w[0],
          });
          this.props.setWallets(w[0], walletsNew);
          this.componentDidMount();
        }

        // Show the wallet creation screen if no wallet file.
        // No matter what if the wallet is not there
        // disable open & delete buttons.
        this.setState({ walletScreen: 1, walletExists: false, currentStatus: '', currentStatusIsError: false });
      } else {
        this.setState({ walletExists: true });
        // the wallet file YES exists
        const result: string = native.init_from_b64(currentWallet.uri, currentWallet.chain_name, PerformanceLevelEnum.High, 3, currentWallet.fileName);
        //console.log(`Initialization: ${result}`);
        if (!result || result.toLowerCase().startsWith('error')) {
          this.setState({
            currentStatus: (
              <span>
                Error Initializing Lightclient
                <br />
                {`${result}`}
              </span>
            ),
            currentStatusIsError: true,
          });

          return;
        }

        const resultJSON = await JSON.parse(result);

        this.getInfo();

        // seed phrase or ufvk
        const walletKindStr: string = await native.wallet_kind();
        const walletKindJSON = JSON.parse(walletKindStr);

        if (
          walletKindJSON.kind === "Loaded from unified full viewing key" ||
          walletKindJSON.kind === "No keys found"
        ) {
          // ufvk
          this.props.setRecoveryInfo("", resultJSON.ufvk, resultJSON.birthday)
          this.props.setPools(walletKindJSON.orchard, walletKindJSON.sapling, walletKindJSON.transparent)
          this.props.setReadOnly(true);
        } else {
          // seed phrase
          this.props.setRecoveryInfo(resultJSON.seed_phrase, "", resultJSON.birthday)
          this.props.setPools(walletKindJSON.orchard, walletKindJSON.sapling, walletKindJSON.transparent)
          this.props.setReadOnly(false);
        }
        this.setState({ walletScreen: 0 });
      }
    } catch (err) {
      console.log("Error initializing", err);
      this.setState({
        currentStatus: (
          <span>
            Error Initializing Lightclient
            <br />
            {`${err}`}
          </span>
        ),
        currentStatusIsError: true,
      });
    }
  };

  setupExitHandler = () => {
    // App is quitting, make sure to save the wallet properly.
    ipcRenderer.on("appquitting", () => {
      RPC.deinitialize();

      // And reply that we're all done after 100ms, to allow cleanup of the rust stuff.
      setTimeout(() => {
        ipcRenderer.send("appquitdone");
      }, 100);
    });
  };

  calculateLatency = async (server: ServerClass, _index: number) => {
    const start: number = Date.now();
    let latency = null;

    try {
      const resp: string = await native.get_latest_block_server(server.uri);
    
      const end: number = Date.now();
      if (resp && !resp.toLowerCase().startsWith('error')) {
        latency = end - start;
      }
    
      console.log('Checking SERVER', server, latency);
    } catch (error) {
      console.log(`Critical Error calculate server latency ${error}`);
    }
    
    return latency;
  };
  
  selectingServer = async (serverUris: ServerClass[]): Promise<ServerClass | null> => {
    const servers: ServerClass[] = serverUris;
  
    // 30 seconds max.
    const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 30 * 1000));
  
    const validServersPromises = servers.map(
      (server: ServerClass) =>
        new Promise<ServerClass>(async resolve => {
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
      // Do a sync at start
      this.setState({ 
        currentStatus: "Setting things up...", 
        currentStatusIsError: false 
      });
      await this.runSyncStatusPoller();
    } catch (err) {
      console.log("Error initializing", err);
      this.setState({
        currentStatus: (
          <span>
            Error Initializing Lightclient 
            <br />
            {`${err}`}
          </span>
        ),
        currentStatusIsError: true,
      });
    }
  }

  runSyncStatusPoller = async () => {
    //console.log('start runSyncStatusPoller');

    const { runRPCConfigure, setInfo } = this.props;

    const info: InfoClass = await RPC.getInfoObject();
    //console.log(info);

    if (info.error) {
      this.setState({
        currentStatus: (
          <span>
            Error Initializing Lightclient
            <br />
            {`${info.error}`}
          </span>
        ),
        currentStatusIsError: true,
      });
      return;
    }

    setInfo(info);

    runRPCConfigure();

    // This will cause a redirect to the dashboard screen
    this.setState({ loadingDone: true });
  };

  startNewWallet = () => {
    // Start using the new wallet
    this.setState({ walletScreen: 0 });
    this.getInfo();
  };

  restoreExistingSeedWallet = () => {
    this.setState({ walletScreen: 3 });
  };

  restoreExistingUfvkWallet = () => {
    this.setState({ walletScreen: 4 });
  };

  restoreExistingFileWallet = () => {
    this.setState({ walletScreen: 5 });
  };

  updateSeed = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    this.setState({ seed_phrase: e.target.value, ufvk: "" });
    this.props.setRecoveryInfo(e.target.value, "", this.state.birthday);
  };

  updateUfvk = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    this.setState({ ufvk: e.target.value, seed_phrase: "" });
    this.props.setRecoveryInfo("", e.target.value, this.state.birthday);
  };

  updateFileWallet = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    this.setState({ fileWallet: e.target.value, seed_phrase: "", ufvk: "" });
    this.props.setRecoveryInfo("", "", 0);
  };

  updateBirthday = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ birthday: isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value) });
    this.props.setRecoveryInfo(this.state.seed_phrase, this.state.ufvk, isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value));
  };

  restoreSeedWalletBack = () => {
    // Reset the seed and birthday and try again 
    this.setState({
      seed_phrase: "",
      ufvk: "",
      birthday: 0,
      newWalletError: null,
      walletScreen: 3,
    });
    this.props.setRecoveryInfo("", "", 0);
    this.props.setPools(true, true, true);
    this.props.setReadOnly(false);
  };

  restoreUfvkWalletBack = () => {
    // Reset the ufvk and birthday and try again 
    this.setState({
      ufvk: "",
      seed_phrase: "",
      birthday: 0,
      newWalletError: null,
      walletScreen: 4,
    });
    this.props.setRecoveryInfo("", "", 0);
    this.props.setPools(true, true, true);
    this.props.setReadOnly(false);
  };

  restoreFileWalletBack = () => {
    // Reset the file wallet name and try again 
    this.setState({
      ufvk: "",
      fileWallet: "",
      seed_phrase: "",
      birthday: 0,
      newWalletError: null,
      walletScreen: 5,
    });
    this.props.setRecoveryInfo("", "", 0);
    this.props.setPools(true, true, true);
    this.props.setReadOnly(false);
  };

  render() {
    const { buttonsDisable, loadingDone, currentStatus, currentStatusIsError, walletScreen, newWalletError, seed_phrase, ufvk, fileWallet, birthday, wallets, currentWallet } =
      this.state;

    const { openServerSelectModal } = this.props;

    //console.log('loading screen render', buttonsDisable);

    if (loadingDone) {
        setTimeout(() => this.props.navigateToDashboard(), 500);
    }

    // If still loading, show the status
    return (
      <div className={[cstyles.verticalflex, cstyles.center, styles.loadingcontainer].join(" ")}>
        <div style={{ marginTop: "0px", marginBottom: "0px" }}>
          <Logo readOnly={false} onlyVersion={currentStatusIsError} />
        </div>
        {!!currentWallet && currentWallet.id ? (
          <div style={{ color: Utils.getCssVariable('--color-primary'), marginBottom: 0 }}>
            Active Wallet:
            {' '}
            {wallets.filter((w: WalletType) => w.id === currentWallet.id)[0].alias}
            {' - '}
            {chains[wallets.filter((w: WalletType) => w.id === currentWallet.id)[0].chain_name || '']}
            {' - ['}
            {wallets.filter((w: WalletType) => w.id === currentWallet.id)[0].creationType}
            {'] - '}
            {currentWallet.uri}
          </div>
        ) : (
          <div style={{ color: Utils.getCssVariable('--color-primary'), marginBottom: 0 }}>
            Active Server:
            {' '}
            {' -- '}
          </div>
        )}

        {!!currentStatus && (walletScreen === 0 || walletScreen === 1) && (
          <div style={{ marginTop: 10 }}>
            <div>{currentStatus}</div>
          </div>
        )}

        {(walletScreen === 1 || (walletScreen === 0 && currentStatusIsError)) && (
          <div style={{ marginTop: -10 }}>
            <div className={cstyles.buttoncontainer} style={{ marginBottom: 10 }}>
              <button disabled={buttonsDisable} type="button" className={cstyles.primarybutton} onClick={openServerSelectModal}>
                Switch to Another Server
              </button>
              {this.state.walletExists && (
                <>
                  <button
                    disabled={buttonsDisable}
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={async () => {
                      this.setState({
                        currentStatus: "", 
                        currentStatusIsError: false,
                        newWalletError: null,
                        changeAnotherWalletMenu: false,
                        buttonsDisable: true,
                      });
                      await this.doFirstTimeSetup();
                      this.setState({ buttonsDisable: false })
                    }}
                  >
                    Open Current Wallet
                  </button>
                  <button
                    disabled={buttonsDisable}
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={async () => {
                      this.setState({
                        currentStatus: "",
                        currentStatusIsError: false,
                        walletScreen: 0,
                        newWalletError: null,
                        changeAnotherWalletMenu: false,
                        buttonsDisable: true,
                      });
                      //await this.deleteWallet();
                      this.setState({ buttonsDisable: false })
                    }}
                  >
                    Delete Current Wallet
                  </button>
                </>
              )}
            </div>

            <div className={[cstyles.well, styles.newwalletcontainer].join(" ")}>
              <div className={cstyles.verticalflex}>
                <div className={[cstyles.large, cstyles.highlight].join(" ")}>Create A New Wallet</div>
                <div className={cstyles.padtopsmall}>
                  Creates a new wallet with a new randomly generated seed phrase. Please save the seed phrase
                  carefully, it&rsquo;s the only way to restore your wallet.
                </div>
                <div className={cstyles.margintoplarge}>
                  <button
                    disabled={buttonsDisable}
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={async () => {
                      this.setState({
                        currentStatus: "",
                        currentStatusIsError: false,
                        walletScreen: 0,
                        newWalletError: null,
                        buttonsDisable: true,
                      });
                      //await this.createNewWallet();
                      this.setState({ buttonsDisable: false })
                    }}
                  >
                    Create New Wallet
                  </button>
                </div>
              </div>
              <div className={[cstyles.verticalflex, cstyles.margintoplarge].join(" ")}>
                <div className={[cstyles.large, cstyles.highlight].join(" ")}>Restore Wallet From Seed / Viewing Key</div>
                <div className={cstyles.padtopsmall}>
                  If you already have a seed phrase / Unified Full Viewing Key, you can restore it to this wallet. This will rescan the
                  blockchain for all transactions from the seed phrase / Unified Full Viewing Key.
                </div>
                <div className={cstyles.margintoplarge}>
                  <button
                    disabled={buttonsDisable}
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={() => {
                      this.setState({
                        currentStatus: "",
                        currentStatusIsError: false,
                        newWalletError: null,
                        buttonsDisable: true,
                      });
                      this.restoreExistingSeedWallet();
                      this.setState({ buttonsDisable: false })
                    }}
                  >
                    Restore Wallet from Seed
                  </button>
                  <button
                    disabled={buttonsDisable}
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={() => {
                      this.setState({
                        currentStatus: "",
                        currentStatusIsError: false,
                        newWalletError: null,
                        buttonsDisable: true,
                      });
                      this.restoreExistingUfvkWallet();
                      this.setState({ buttonsDisable: false })
                    }}
                  >
                    Restore Wallet from Viewing Key
                  </button>
                </div>
              </div>
              <div className={[cstyles.verticalflex, cstyles.margintoplarge].join(" ")}>
                <div className={[cstyles.large, cstyles.highlight].join(" ")}>Restore Wallet From a Wallet File</div>
                <div className={cstyles.padtopsmall}>
                  If you already have a wallet file stored, you can restore it to this wallet. This will rescan the
                  blockchain for all transactions from the last situation of your wallet file.
                </div>
                <div className={cstyles.margintoplarge}>
                  <button
                    disabled={buttonsDisable}
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={() => {
                      this.setState({
                        currentStatus: "",
                        currentStatusIsError: false,
                        newWalletError: null,
                        buttonsDisable: true,
                      });
                      this.restoreExistingFileWallet();
                      this.setState({ buttonsDisable: false })
                    }}
                  >
                    Restore Wallet from a File
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {walletScreen === 2 && (
          <div>
            <div className={[cstyles.well, styles.newwalletcontainer].join(" ")}>
              <div className={cstyles.verticalflex}>
                {newWalletError && (
                  <div>
                    <div className={[cstyles.large, cstyles.highlight].join(" ")}>Error Creating New Wallet</div>
                    <div className={cstyles.padtopsmall}>There was an error creating a new wallet</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.padtopsmall}>{newWalletError}</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={() => {
                          this.setState({ walletScreen: 1 });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!newWalletError && (
                  <div>
                    <div className={[cstyles.large, cstyles.highlight].join(" ")}>Your New Wallet</div>
                    <div className={cstyles.padtopsmall}>
                      This is your new wallet. Below is your seed phrase. PLEASE STORE IT CAREFULLY! The seed phrase
                      is the only way to recover your funds and transactions.
                    </div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.padtopsmall}>{seed_phrase}</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.padtopsmall}>{'Birthday: ' + birthday}</div> 
                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={this.startNewWallet}
                      >
                        Start Wallet
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {walletScreen === 3 && (
          <div>
            <div className={[cstyles.well, styles.newwalletcontainer].join(" ")}>
              <div className={cstyles.verticalflex}>
                {newWalletError && (
                  <div>
                    <div className={[cstyles.large, cstyles.highlight].join(" ")}>Error Restoring Wallet</div>
                    <div className={cstyles.padtopsmall}>There was an error restoring your seed phrase</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.padtopsmall}>{newWalletError}</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={this.restoreSeedWalletBack}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}

                {!newWalletError && (
                  <div>
                    <div className={[cstyles.large].join(" ")}>Please enter your seed phrase</div>
                    <TextareaAutosize
                      className={cstyles.inputbox}
                      value={seed_phrase}
                      onChange={(e) => this.updateSeed(e)}
                    />

                    <div className={[cstyles.large, cstyles.margintoplarge].join(" ")}>
                      Wallet Birthday. If you don&rsquo;t know this, it is OK to enter &lsquo;0&rsquo;
                    </div>
                    <input
                      type="number"
                      className={cstyles.inputbox}
                      value={birthday}
                      onChange={(e) => this.updateBirthday(e)}
                    />

                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={async () => {
                          this.setState({ buttonsDisable: true });
                          //await this.doRestoreSeedWallet();
                          this.setState({ buttonsDisable: false });
                        }}
                      >
                        Restore Wallet
                      </button>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={() => {
                          this.setState({ walletScreen: 1 });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {walletScreen === 4 && (
          <div>
            <div className={[cstyles.well, styles.newwalletcontainer].join(" ")}>
              <div className={cstyles.verticalflex}>
                {newWalletError && (
                  <div>
                    <div className={[cstyles.large, cstyles.highlight].join(" ")}>Error Restoring Wallet</div>
                    <div className={cstyles.padtopsmall}>There was an error restoring your Viewing Key</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.padtopsmall}>{newWalletError}</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={this.restoreUfvkWalletBack}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}

                {!newWalletError && (
                  <div>
                    <div className={[cstyles.large].join(" ")}>Please enter your Unified Full Viewing Key</div>
                    <TextareaAutosize
                      className={cstyles.inputbox}
                      value={ufvk}
                      onChange={(e) => this.updateUfvk(e)}
                    />

                    <div className={[cstyles.large, cstyles.margintoplarge].join(" ")}>
                      Wallet Birthday. If you don&rsquo;t know this, it is OK to enter &lsquo;0&rsquo;
                    </div>
                    <input
                      type="number"
                      className={cstyles.inputbox}
                      value={birthday}
                      onChange={(e) => this.updateBirthday(e)}
                    />

                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={async () => {
                          this.setState({ buttonsDisable: true });
                          //await this.doRestoreUfvkWallet();
                          this.setState({ buttonsDisable: false });
                        }}
                      >
                        Restore Wallet
                      </button>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={() => {
                          this.setState({ walletScreen: 1 });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {walletScreen === 5 && (
          <div>
            <div className={[cstyles.well, styles.newwalletcontainer].join(" ")}>
              <div className={cstyles.verticalflex}>
                {newWalletError && (
                  <div>
                    <div className={[cstyles.large, cstyles.highlight].join(" ")}>Error Loading Wallet File</div>
                    <div className={cstyles.padtopsmall}>There was an error loading your Wallet File</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.padtopsmall}>{newWalletError}</div>
                    <hr style={{ width: "100%" }} />
                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={this.restoreFileWalletBack}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}

                {!newWalletError && (
                  <div>
                    <div className={[cstyles.large].join(" ")}>Please enter your Wallet File Name stored in the Zcash folder</div>
                    <TextareaAutosize
                      className={cstyles.inputbox}
                      value={fileWallet}
                      onChange={(e) => this.updateFileWallet(e)}
                    />

                    <div className={cstyles.margintoplarge}>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={async () => {
                          this.setState({ buttonsDisable: true });
                          //await this.doRestoreFileWallet();
                          this.setState({ buttonsDisable: false });
                        }}
                      >
                        Restore Wallet
                      </button>
                      <button 
                        disabled={this.state.buttonsDisable} 
                        type="button" 
                        className={cstyles.primarybutton} 
                        onClick={() => {
                          this.setState({ walletScreen: 1 });
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
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
