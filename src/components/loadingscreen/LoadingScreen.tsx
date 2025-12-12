import React, { Component } from "react";
import { RouteComponentProps, withRouter } from "react-router";
import TextareaAutosize from "react-textarea-autosize";
import progress from "progress-stream";
import axios from "axios";
import native from "../../native.node";
import { InfoClass, ServerClass } from "../appstate";
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

  url: string;

  chain_name: '' | ServerChainNameEnum;

  selection: '' | 'auto' | 'list' | 'custom';

  currentWalletId: number | null;

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

  changeAnotherWallet: boolean;

  serverUris: ServerClass[];

  buttonsDisable: boolean;

  walletExists: boolean;

  constructor(currentStatus: string | JSX.Element, 
              currentStatusIsError: boolean, 
              changeAnotherWallet: boolean, 
              serverUris: ServerClass[],
              walletScreen: number,
            ) {
    this.currentStatus = currentStatus;
    this.currentStatusIsError = currentStatusIsError;
    this.loadingDone = false;
    this.url = "";
    this.chain_name = "";
    this.selection = '';
    this.currentWalletId = null;
    this.wallets = [];
    this.walletScreen = walletScreen;
    this.newWalletError = null;
    this.seed_phrase = "";
    this.ufvk = "";
    this.fileWallet = "";
    this.birthday = 0;
    this.changeAnotherWallet = changeAnotherWallet;
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
  setServerInfo: (u: string, c: ServerChainNameEnum, s: 'auto' | 'list' | 'custom') => void;
  setPools: (o: boolean, s: boolean, t: boolean) => void;
  setWallets: (c: number | null, w: WalletType[]) => void;
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

    let currentStatus: string | JSX.Element = (
          <span>
            Checking servers to connect...
            <br />
            This process can take several seconds/minutes depends of the Server's status.
          </span>
        ),
        currentStatusIsError: boolean = false, 
        changeAnotherWallet: boolean = false,
        serverUris: ServerClass[] = [],
        walletScreen: number = 0;
    if (props.location.state) {
      const locationState = props.location.state as { 
        currentStatus: string, 
        currentStatusIsError: boolean, 
        serverUris: ServerClass[],
        walletScreen: number,
      };
      currentStatus = locationState.currentStatus;
      currentStatusIsError = locationState.currentStatusIsError;
      if (locationState.currentStatus) {
        changeAnotherWallet = true;
        walletScreen = 1;
      }
      serverUris = locationState.serverUris;
    }
    const state = new LoadingScreenState(currentStatus, currentStatusIsError, changeAnotherWallet, serverUris, walletScreen); 
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

  checkCurrentSettings = async (serveruri: string, serverchain_name: ServerChainNameEnum, serverselection: 'auto' | 'list' | 'custom') => {
    let server: string = '', 
      chain_name: ServerChainNameEnum = ServerChainNameEnum.mainChainName, 
      selection: 'auto' | 'list' | 'custom' = 'list';
    if (!serveruri && !serverchain_name && !serverselection) {
      // no settings stored, asumming `list` by default.
      server = serverUrisList()[0].uri;
      chain_name = serverUrisList()[0].chain_name;
      selection = 'list';
    } else {
      if (!serveruri) {
        // no server in settings, asuming `list` by default.
        server = serverUrisList()[0].uri;
        chain_name = serverUrisList()[0].chain_name;
        selection = 'list';
      } else {
        // the server is in settings, asking for the other fields.
        server = serveruri;
        const serverInList = serverUrisList().filter((s: ServerClass) => s.uri === server)
        if (!serverchain_name) {
          chain_name = ServerChainNameEnum.mainChainName;
          if (serverInList && serverInList.length === 1) {
            // if the server is in the list, then selection is `list`
            if (serverInList[0].obsolete) {
              // if obsolete then select the first one on list
              server = serverUrisList()[0].uri;
              chain_name = serverUrisList()[0].chain_name;
              selection = 'list';
            } else {
              selection = 'list';
            }
          } else {
            selection = 'custom';
          }
        } else {
          chain_name = serverchain_name;
          // the server & chain are in settings, asking for selection 
          if (!serverselection) {
            if (serverInList && serverInList.length === 1) {
              // if the server is in the list, then selection is `list`
              chain_name = ServerChainNameEnum.mainChainName;
              selection = 'list';
            } else {
              selection = 'custom';
            }
          } else {
            selection = serverselection;
          }
        }
      }
    }
    // if the server selected is now obsolete, change it for the first one
    const serverInList: ServerClass[] = serverUrisList().filter((s: ServerClass) => s.uri === server)
    if (serverInList && serverInList.length > 0 && serverInList[0].obsolete) {
      console.log('server obsolete', server, '=>', serverUrisList()[0].uri);
      server = serverUrisList()[0].uri;
      chain_name = serverUrisList()[0].chain_name;
      selection = 'list';
    }

    // if empty is the first time and if auto => App needs to check the servers.
    if (selection === 'auto') {
      // we need to filter by Network/Chain
      const servers: ServerClass[] = serverUrisList().filter((s: ServerClass) => !s.obsolete && s.chain_name === chain_name);
      const serverFaster = await this.selectingServer(servers);
      if (serverFaster) {
        server = serverFaster.uri;
        chain_name = serverFaster.chain_name;  
      } else if (!!servers && servers.length > 0) {
        // none of the servers are working properly.
        server = servers[0].uri;
        chain_name = servers[0].chain_name;
      } else {
        // no appropiate server to choose.
        server = serverUrisList()[0].uri;
        chain_name = serverUrisList()[0].chain_name;
      }
      selection = 'list';
    }
    // server settings checked
    console.log('&&&&&&&&&&&&&&&&& CHECKING SETTINGS', server, chain_name, selection);
    return {server, chain_name, selection};
  };

  loadServer = async () => {
    // try to read wallets
    let wallets: WalletType[] = await ipcRenderer.invoke("wallets:all");
    console.log('&&&&&&&&&&&&&&&&& WALLETS', wallets);
    // Try to read the default server
    const settings = await ipcRenderer.invoke("loadSettings");
    console.log('&&&&&&&&&&&&&&&&& SETTINGS', settings);
    let currentWalletId: number | null;
    const { server, chain_name, selection } = await this.checkCurrentSettings(
      settings && settings.serveruri ? settings.serveruri : '', 
      settings && settings.serverchain_name ? settings.serverchain_name : '', 
      settings && settings.serverselection ? settings.serverselection : ''
    );

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
      if (chain_name === ServerChainNameEnum.mainChainName) {
        currentWalletId = 1;
      } else if (chain_name === ServerChainNameEnum.testChainName) {
        currentWalletId = 2;
      } else {
        currentWalletId = 3;
      }
      const currentWallet_1: WalletType = {
        id: 1, // by default: 1 (mainnet)
        fileName: '', // by default: zingo-wallet.dat
        alias: 'Main Wallet',
        chain_name: ServerChainNameEnum.mainChainName,
        creationType: 'Main',
      };
      const currentWallet_2: WalletType = {
        id: 2, // by default: 2 (testnet)
        fileName: '', // by default: zingo-wallet.dat
        alias: 'Main Wallet',
        chain_name: ServerChainNameEnum.testChainName,
        creationType: 'Main',
      };
      const currentWallet_3: WalletType = {
        id: 3, // by default: 2 (testnet)
        fileName: '', // by default: zingo-wallet.dat
        alias: 'Main Wallet',
        chain_name: ServerChainNameEnum.regtestChainName,
        creationType: 'Main',
      };
      await ipcRenderer.invoke("wallets:add", currentWallet_1);
      await ipcRenderer.invoke("wallets:add", currentWallet_2);
      await ipcRenderer.invoke("wallets:add", currentWallet_3);
      // re-fetching wallets
      wallets = await ipcRenderer.invoke("wallets:all");
    } else {
      // the normal situation with multi-wallet. 
      currentWalletId = settings.currentwalletid;
      const currentWallet: WalletType[] = wallets.filter((w: WalletType) => w.id === currentWalletId && w.chain_name === chain_name);
      if (!currentWallet || currentWallet.length === 0) {
        // if the id is wrong, selecting the first wallet for the selected chain
        let firstWallet: WalletType[] = wallets.filter((w: WalletType) => w.chain_name === chain_name); 
        currentWalletId = !firstWallet || firstWallet.length === 0 ? null : firstWallet[0].id;
      }
    }

    await ipcRenderer.invoke("saveSettings", { key: "serveruri", value: server });
    await ipcRenderer.invoke("saveSettings", { key: "serverchain_name", value: chain_name });
    await ipcRenderer.invoke("saveSettings", { key: "serverselection", value: selection });
    await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: currentWalletId });

    console.log('&&&&&&&&-----------', currentWalletId, server, chain_name, selection); 

    return {
      url: server,
      chain_name,
      selection,
      currentWalletId,
      wallets,
    };
  };

  doFirstTimeSetup = async () => {
    const { url, chain_name, selection, currentWalletId, wallets } = await this.loadServer();
    console.log(`Url: -${currentWalletId}-${url}-${chain_name}-${selection}`);

    this.setState({
      url,
      chain_name,
      selection,
      currentWalletId,
      wallets,
    });
    this.props.setServerInfo(url, chain_name, selection);
    this.props.setWallets(currentWalletId, wallets);

    // First, set up the exit handler
    this.setupExitHandler();

    const { changeAnotherWallet } = this.state;
    // if is: `change to another wallet` exit here 
    if (changeAnotherWallet) {
      // this means there are a activa wallet
      this.setState({ walletExists: true });
      return;
    }
    
    try {
      let wallet_name: string = '';
      // when currentWalletId is null -> no wallets for this server in wallets.json
      // but the standard wallet file can be there...
      if (currentWalletId !== null) {
        // Test to see if the wallet exists
        wallet_name = wallets.filter((w: WalletType) => w.id === currentWalletId)[0].fileName;
      }

      const walletExistsResult: boolean | string = native.wallet_exists(url, chain_name, "High", 3, wallet_name);
      console.log(walletExistsResult);
      if (!walletExistsResult) {
        // the wallet file DOES NOT exists
        // if currentWalletId have a value -> remove the wallet local data for this id.
        if (currentWalletId !== null) {
          await ipcRenderer.invoke("wallets:remove", currentWalletId);
          await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: null });
          // re-fetching wallets
          const wallets = await ipcRenderer.invoke("wallets:all");
          this.setState({ wallets, currentWalletId: null });
          this.props.setWallets(null, wallets);
        }
        // Show the wallet creation screen if no wallet file.
        // No matter what if the wallet is not there
        // disable open & delete buttons.
        this.setState({ walletScreen: 1, walletExists: false });
      } else {
        // if currentWalletId is null -> add the wallet item id(1, 2, 3) 
        if (currentWalletId === null) {
          const id: number = chain_name === ServerChainNameEnum.mainChainName ? 1 : chain_name === ServerChainNameEnum.testChainName ? 2 : 3;
          const currentWallet: WalletType = {
            id,
            fileName: '', // by default: zingo-wallet.dat
            alias: 'Main Wallet',
            chain_name,
            creationType: 'Main',
          };
          await ipcRenderer.invoke("wallets:add", currentWallet);
          await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
          // re-fetching wallets
          const wallets = await ipcRenderer.invoke("wallets:all");
          this.setState({ wallets, currentWalletId: id });
          this.props.setWallets(id, wallets);
        }
        // the wallet file YES exists
        const result: string = native.init_from_b64(url, chain_name, "High", 3, wallet_name);
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
        this.setState({ walletScreen: 0, walletExists: true });
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
      this.setState({ currentStatus: "Setting things up..." });
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

  nextWalletId = (): number => {
    const { wallets } = this.state;
    let maxId = !!wallets && wallets.length > 0 ? Math.max(...wallets.map(w => w.id)) : 3;
    if (maxId < 3) {
      maxId = 3;
    }
    return maxId + 1;
  };

  nextWalletName = (id: number): string => {
    return `zingo-wallet-${id}.dat`
  };

  createNextWallet = async (id: number, wallet_name: string, alias: string, creationType: 'Seed' | 'Ufvk' | 'File' | 'Main') => {
    const { chain_name } = this.state;

    const currentWallet: WalletType = {
      id,
      fileName: wallet_name, // by default: zingo-wallet.dat
      alias, // by default: the first word of the seed phrase
      chain_name: chain_name ? chain_name : ServerChainNameEnum.mainChainName,
      creationType,
    };
    await ipcRenderer.invoke("wallets:add", currentWallet);
    await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
    // re-fetching wallets
    const newWallets = await ipcRenderer.invoke("wallets:all");
    this.setState({ wallets: newWallets, currentWalletId: id });
    this.props.setWallets(id, newWallets);
  };

  createNewWallet = async () => {
    const { url, chain_name } = this.state;
    
    const id: number = this.nextWalletId();
    const wallet_name: string = this.nextWalletName(id);
    try {
      const result: string = native.init_new(url, chain_name, "High", 3, wallet_name);

      if (!result || result.toLowerCase().startsWith("error")) {
        //console.log('creating new wallet', result);
        this.setState({ walletScreen: 2, newWalletError: result });
      } else {
        const resultJSON = await JSON.parse(result);
        const seed_phrase: string = resultJSON.seed_phrase;
        const birthday: number = resultJSON.birthday;

        this.createNextWallet(id, wallet_name, `${seed_phrase.split(' ')[0]}...`, 'Seed');

        this.setState({ walletScreen: 2, seed_phrase, birthday });
        this.props.setRecoveryInfo(seed_phrase, "", birthday);
        this.props.setPools(true, true, true);
        this.props.setReadOnly(false);
      }
    } catch (error) {
      console.log(`Critical Error create new wallet ${error}`);
    }
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

  doRestoreSeedWallet = async () => {
    const { seed_phrase, birthday, url, chain_name } = this.state;
    //console.log(`Restoring ${seed_phrase} with ${birthday}`);
    try {
      const id: number = this.nextWalletId();
      const wallet_name: string = this.nextWalletName(id);
      const result: string = native.init_from_seed(seed_phrase, birthday, url, chain_name, "High", 3, wallet_name);
      if (!result || result.toLowerCase().startsWith("error")) {
        this.setState({ newWalletError: result });
      } else {
        const resultJSON = await JSON.parse(result);
        const seed_phrase: string = resultJSON.seed_phrase;
        const birthday: number = resultJSON.birthday;

        this.createNextWallet(id, wallet_name, `${seed_phrase.split(' ')[0]}...`, 'Seed');

        this.setState({ walletScreen: 0 });
        this.getInfo();
        
        const walletKindStr: string = await native.wallet_kind();
        const walletKindJSON = JSON.parse(walletKindStr);

        this.props.setRecoveryInfo(seed_phrase, "", birthday)
        this.props.setPools(walletKindJSON.orchard, walletKindJSON.sapling, walletKindJSON.transparent)
        this.props.setReadOnly(false);
      }
    } catch (error) {
      console.log(`Critical Error restore from seed ${error}`);
    }
  };

  doRestoreUfvkWallet = async () => {
    const { ufvk, birthday, url, chain_name } = this.state;
    //console.log(`Restoring ${ufvk} with ${birthday}`);
    try {
      const id: number = this.nextWalletId();
      const wallet_name: string = this.nextWalletName(id);
      const result: string = native.init_from_ufvk(ufvk, birthday, url, chain_name, "High", 3, wallet_name);
      if (!result || result.toLowerCase().startsWith("error")) {
        this.setState({ newWalletError: result });
      } else {
        const resultJSON = await JSON.parse(result);
        const ufvk: string = resultJSON.ufvk;
        const birthday: number = resultJSON.birthday;

        this.createNextWallet(id, wallet_name, `${ufvk.substring(0, 10)}...`, 'Ufvk');

        this.setState({ walletScreen: 0 });
        this.getInfo();

        const walletKindStr: string = await native.wallet_kind();
        const walletKindJSON = JSON.parse(walletKindStr);

        this.props.setRecoveryInfo("", ufvk, birthday)
        this.props.setPools(walletKindJSON.orchard, walletKindJSON.sapling, walletKindJSON.transparent)
        this.props.setReadOnly(true);
      }
    } catch (error) {
      console.log(`Critical Error restore from ufvk ${error}`);
    }
  };

  doRestoreFileWallet = async () => {
    const { fileWallet, url, chain_name } = this.state;
    console.log(`Loading ${fileWallet}`);
    try {
      const id: number = this.nextWalletId();
      const wallet_name: string = this.state.fileWallet;
      const result: string = native.init_from_b64(url, chain_name, "High", 3, wallet_name);
      console.log(`Initialization: ${result}`);
      if (!result || result.toLowerCase().startsWith("error")) {
        this.setState({ newWalletError: result });
      } else {
        const resultJSON = await JSON.parse(result);
        this.setState({ walletScreen: 0 });
        this.getInfo();

        // seed phrase or ufvk
        const walletKindStr: string = await native.wallet_kind();
        const walletKindJSON = JSON.parse(walletKindStr);

        if (
          walletKindJSON.kind === "Loaded from unified full viewing key" ||
          walletKindJSON.kind === "No keys found"
        ) {
          // ufvk
          this.createNextWallet(id, wallet_name, wallet_name, 'File');

          this.props.setRecoveryInfo("", resultJSON.ufvk, resultJSON.birthday)
          this.props.setPools(walletKindJSON.orchard, walletKindJSON.sapling, walletKindJSON.transparent)
          this.props.setReadOnly(true);
        } else {
          // seed phrase
          this.createNextWallet(id, wallet_name, wallet_name, 'File');

          this.props.setRecoveryInfo(resultJSON.seed_phrase, "", resultJSON.birthday)
          this.props.setPools(walletKindJSON.orchard, walletKindJSON.sapling, walletKindJSON.transparent)
          this.props.setReadOnly(false);
        }
      }
    } catch (error) {
      console.log(`Critical Error restore from file ${error}`);
    }
  };

  deleteWallet = async () => {
    const { openErrorModal } = this.context as React.ContextType<typeof ContextApp>;
    const { url, chain_name, wallets, currentWalletId } = this.state;
    try {
      const wallet_name: string = wallets.filter((w: WalletType) => w.id === currentWalletId)[0].fileName;
      const walletExistsResult: boolean | string = native.wallet_exists(url, chain_name, "High", 3, wallet_name);
      console.log(walletExistsResult);
      if (walletExistsResult) {
        // interrupt syncing, just in case.
        const resultInterrupt: string = await native.stop_sync();
        console.log("Stopping sync ...", resultInterrupt);
        await this.props.clearTimers();

        // remove the actual wallet
        await ipcRenderer.invoke("wallets:remove", currentWalletId);
        await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: null });

        setTimeout(() => {
          openErrorModal("Restart Zingo PC", "Zingo PC is going to restart in 5 seconds to connect to the new server/wallet"); 
        }, 10);
        setTimeout(async () => {
          ipcRenderer.send("apprestart");
          const resultDelete: string = await native.delete_wallet(url, chain_name, "High", 3, wallet_name);
          console.log("deleting ...", resultDelete);
          native.deinitialize();
        }, 5000);
      }
    } catch (error) {
      console.log(`Critical Error delete wallet ${error}`);
    }
  };

  render() {
    const { buttonsDisable, loadingDone, currentStatus, walletScreen, newWalletError, seed_phrase, ufvk, fileWallet, birthday, currentWalletId, wallets, url } =
      this.state;

    const { openServerSelectModal } = this.props;

    //console.log('loading screen render', buttonsDisable);

    if (loadingDone) {
        setTimeout(() => this.props.navigateToDashboard(), 500);
    }

    // If still loading, show the status 
    return (
      <div className={[cstyles.verticalflex, cstyles.center, styles.loadingcontainer].join(" ")}>
        <div style={{ marginTop: walletScreen === 1 ? "0px" : "70px", marginBottom: "10px" }}>
          <Logo readOnly={false} />
        </div>
        {!!currentWalletId ? (
          <div style={{ color: Utils.getCssVariable('--color-primary'), marginBottom: 0 }}>
            Active Wallet:
            {' '}
            {wallets.filter((w: WalletType) => w.id === currentWalletId)[0].alias}
            {' - '}
            {chains[wallets.filter((w: WalletType) => w.id === currentWalletId)[0].chain_name]}
            {' - ['}
            {wallets.filter((w: WalletType) => w.id === currentWalletId)[0].creationType}
            {'] - '}
            {url}
          </div>
        ) : (
          <div style={{ color: Utils.getCssVariable('--color-primary'), marginBottom: 0 }}>
            Active Server:
            {' '}
            {url}
          </div>
        )}

        {walletScreen === 0 && (
          <div style={{ marginTop: 10 }}>
            <div>{currentStatus}</div>
          </div>
        )}

        {walletScreen === 1 && (
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
                        changeAnotherWallet: false,
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
                        changeAnotherWallet: false,
                        buttonsDisable: true,
                      });
                      await this.deleteWallet();
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
                      await this.createNewWallet();
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
                          await this.doRestoreSeedWallet();
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
                          await this.doRestoreUfvkWallet();
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
                          await this.doRestoreFileWallet();
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
