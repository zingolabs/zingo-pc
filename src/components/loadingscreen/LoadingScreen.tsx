import React, { Component } from "react";
import { Redirect, RouteComponentProps, withRouter } from "react-router";
import TextareaAutosize from "react-textarea-autosize";
import request from "request";
import progress from "progress-stream";
import native from "../../native.node";
import routes from "../../constants/routes.json";
import { RPCConfig, Info } from "../appstate";
import RPC from "../../rpc/rpc";
import cstyles from "../common/Common.module.css";
import styles from "./LoadingScreen.module.css";
import Logo from "../../assets/img/logobig.png";
import Utils from "../../utils/utils";
import { ContextApp } from "../../context/ContextAppState";

const { ipcRenderer } = window.require("electron");
const fs = window.require("fs");

class LoadingScreenState {
  currentStatus: string | JSX.Element;

  currentStatusIsError: boolean;

  loadingDone: boolean;

  rpcConfig: RPCConfig | null;

  url: string;

  walletScreen: number; 
  // 0 -> no wallet, load existing wallet 
  // 1 -> show options
  // 2 -> create new 
  // 3 -> restore existing

  newWalletError: null | string; // Any errors when creating/restoring wallet

  seed: string; // The new seed phrase for a newly created wallet or the seed phrase to restore from

  birthday: number; // Wallet birthday if we're restoring

  getinfoRetryCount: number;

  nextSaveBatch: number;

  constructor() {
    this.currentStatus = "Loading...";
    this.currentStatusIsError = false;
    this.loadingDone = false;
    this.rpcConfig = null;
    this.url = "";
    this.getinfoRetryCount = 0;
    this.walletScreen = 0;
    this.newWalletError = null;
    this.seed = "";
    this.birthday = 0;
    this.nextSaveBatch = -1;
  }
}

type LoadingScreenProps = {
  setRPCConfig: (rpcConfig: RPCConfig) => void;
  setRescanning: (rescan: boolean, prevSyncId: number) => void;
  setInfo: (info: Info) => void;
  openServerSelectModal: () => void;
};

class LoadingScreen extends Component<LoadingScreenProps & RouteComponentProps, LoadingScreenState> {
  static contextType = ContextApp;
  constructor(props: LoadingScreenProps & RouteComponentProps) {
    super(props);

    const state = new LoadingScreenState();
    this.state = state;
  }

  componentDidMount() {
    const { rescanning, prevSyncId } = this.context;

    if (rescanning) {
      this.runSyncStatusPoller(prevSyncId);
    } else {
      (async () => {
        // Do it in a timeout, so the window has a chance to load.
        setTimeout(() => this.doFirstTimeSetup(), 100);
      })();
    }
  }

  download = (url: string, dest: string, name: string, cb: (msg: string) => void) => {
    const file = fs.createWriteStream(dest);
    const sendReq = request.get(url);

    // verify response code
    sendReq.on("response", (response) => {
      if (response.statusCode !== 200) {
        return cb(`Response status was ${response.statusCode}`);
      }

      const len = response.headers["content-length"] || "";
      const totalSize = (parseInt(len, 10) / 1024 / 1024).toFixed(0);

      const str = progress({ time: 1000 }, (pgrs) => {
        this.setState({
          currentStatus: `Downloading ${name}... (${(pgrs.transferred / 1024 / 1024).toFixed(0)} MB / ${totalSize} MB)`,
        });
      });

      sendReq.pipe(str).pipe(file);
    });

    // close() is async, call cb after close completes
    file.on("finish", () => file.close());

    // check for request errors
    sendReq.on("error", (err) => {
      fs.unlink(dest, () => {
        cb(err.message);
      });
    });

    file.on("error", (err: any) => {
      // Handle errors
      fs.unlink(dest, () => {
        cb(err.message);
      }); // Delete the file async. (But we don't check the result) 
    });
  };

  loadServerURI = async () => {
    // Try to read the default server
    const settings = await ipcRenderer.invoke("loadSettings");
    let server = settings?.serveruri || Utils.ZCASH_COMMUNITY;

    const newstate = new LoadingScreenState();
    Object.assign(newstate, this.state);

    newstate.url = server;
    this.setState(newstate);
  };

  doFirstTimeSetup = async () => {
    await this.loadServerURI();

    // Try to load the light client
    const { url } = this.state;

    console.log(`Url: -${url}-`);

    // First, set up the exit handler
    this.setupExitHandler();

    try {
      // Test to see if the wallet exists
      if (!native.zingolib_wallet_exists(url)) {
        // Show the wallet creation screen
        this.setState({ walletScreen: 1 });
      } else {
        const result: string = native.zingolib_initialize_existing(url);
        console.log(`Initialization: ${result}`);
        if (result !== "OK") {
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

        this.getInfo();
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

  async getInfo() {
    // Try getting the info.
    try {
      // Do a sync at start
      this.setState({ currentStatus: "Setting things up..." });

      // Grab the previous sync ID.
      const syncStatus: string = await RPC.doSyncStatus();
      const prevSyncId: number = JSON.parse(syncStatus).sync_id;

      // This will do the sync in another thread, so we have to check for sync status
      RPC.doSync();

      this.runSyncStatusPoller(prevSyncId);
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

  runSyncStatusPoller = async (prevSyncId: number) => {
    const me = this;

    const { setRPCConfig, setInfo, setRescanning } = this.props;
    const { url } = this.state;

    const info: Info = await RPC.getInfoObject();

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

    // And after a while, check the sync status.
    const poller = setInterval(async () => {
      const syncstatus: string = await RPC.doSyncStatus();

      if (syncstatus.toLowerCase().startsWith("error")) {
        // Something went wrong
        this.setState({
          currentStatus: syncstatus,
          currentStatusIsError: true,
        });

        // And cancel the updater
        clearInterval(poller);
      } else {
        const ss = JSON.parse(syncstatus);
        console.log(ss);
        //console.log(`Prev SyncID: ${prevSyncId}`);

        if (ss.sync_id > prevSyncId && !ss.in_progress) {
          // First, save the wallet so we don't lose the just-synced data
          if (!ss.last_error) {
            RPC.doSave();
          }

          // Set the info object, so the sidebar will show
          //console.log("Object info\n");
          //console.log(info);
          setInfo(info);

          setRescanning(false, prevSyncId);

          // Configure the RPC, which will setup the refresh
          const rpcConfig = new RPCConfig();
          rpcConfig.url = url;
          setRPCConfig(rpcConfig);

          // And cancel the updater
          clearInterval(poller);

          // This will cause a redirect to the dashboard screen
          me.setState({ loadingDone: true });
        } else {
          // Still syncing, grab the status and update the status
          let progress_blocks = (ss.synced_blocks + ss.trial_decryptions_blocks + ss.witnesses_updated) / 3;

          let progress = progress_blocks;
          if (ss.total_blocks) {
            progress = (progress_blocks * 100) / ss.total_blocks;
          }

          // every 2 batches I need to save the progress of the wallet
          if (ss.batch_num >= this.state.nextSaveBatch) {
            RPC.doSave();
            me.setState({ nextSaveBatch: ss.batch_num + 5});
          }

          let base = 0;
          if (ss.batch_total) {
            base = (ss.batch_num * 100) / ss.batch_total;
            progress = base + progress / ss.batch_total;
          }

          if (!isNaN(progress_blocks)) {
            let batch_progress = (progress_blocks * 100) / ss.total_blocks;
            if (isNaN(batch_progress)) {
              batch_progress = 0;
            }
            const currentStatus = (
              <div>
                Syncing batch {ss.batch_num} of {ss.batch_total}
                <br />
                <br />
                Batch Progress: {batch_progress.toFixed(2)}%. Total progress: {progress.toFixed(2)}%.
                <br />
                <br />
                <br />
                Please wait... 
                <br />
                This could take several minutes or hours
              </div>
            );
            me.setState({ currentStatus });
          }
        }
      }
    }, 2 * 1000);
  };

  createNewWallet = () => {
    const { url } = this.state;
    const result: string = native.zingolib_initialize_new(url);

    if (result.toLowerCase().startsWith("error")) {
      console.log(result);
      this.setState({ walletScreen: 2, newWalletError: result });
    } else {
      const r = JSON.parse(result);
      this.setState({ walletScreen: 2, seed: r.seed });
    }
  };

  startNewWallet = () => {
    // Start using the new wallet
    this.setState({ walletScreen: 0 });
    this.getInfo();
  };

  restoreExistingWallet = () => {
    this.setState({ walletScreen: 3 });
  };

  updateSeed = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    this.setState({ seed: e.target.value });
  };

  updateBirthday = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ birthday: isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value) }); 
  };

  restoreWalletBack = () => {
    // Reset the seed and birthday and try again
    this.setState({
      seed: "",
      birthday: 0,
      newWalletError: null,
      walletScreen: 3,
    });
  };

  doRestoreWallet = () => {
    const { seed, birthday, url } = this.state;
    console.log(`Restoring ${seed} with ${birthday}`);

    const allowOverwrite: boolean = true;

    const result: string = native.zingolib_initialize_new_from_phrase(url, seed, birthday, allowOverwrite);
    if (result.toLowerCase().startsWith("error")) {
      this.setState({ newWalletError: result });
    } else {
      this.setState({ walletScreen: 0 });
      this.getInfo();
    }
  };

  render() {
    const { loadingDone, currentStatus, currentStatusIsError, walletScreen, newWalletError, seed, birthday } =
      this.state;

    const { openServerSelectModal } = this.props;

    // If still loading, show the status
    if (!loadingDone) {
      return (
        <div className={[cstyles.verticalflex, cstyles.center, styles.loadingcontainer].join(" ")}>
          {walletScreen === 0 && (
            <div>
              <div style={{ marginTop: "100px", marginBottom: "20px" }}>
                <div style={{ color: "#888888", fontWeight: "bold", marginBottom: 10 }}>Zingo PC v1.0.0</div>
                <img src={Logo} width="200px;" alt="Logo" />
              </div>
              <div>{currentStatus}</div>
              {currentStatusIsError && (
                <div className={cstyles.buttoncontainer}>
                  <button type="button" className={cstyles.primarybutton} onClick={openServerSelectModal}>
                    Switch to Another Server
                  </button>
                  <button
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={() => {
                      this.setState({
                        currentStatus: "",
                        currentStatusIsError: false,
                        walletScreen: 0,
                        newWalletError: null,
                      });
                      this.createNewWallet();
                    }}
                  >
                    Create New Wallet
                  </button>
                  <button
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={() => {
                      this.setState({
                        currentStatus: "", 
                        currentStatusIsError: false,
                        newWalletError: null
                      });
                      this.doFirstTimeSetup();
                    }}
                  >
                    Open Current Wallet
                  </button>
                  <button
                    type="button"
                    className={cstyles.primarybutton}
                    onClick={() => {
                      this.setState({
                        currentStatus: "",
                        currentStatusIsError: false,
                        newWalletError: null
                      });
                      this.restoreExistingWallet();
                    }}
                  >
                    Restore Wallet from Seed
                  </button>
                </div>
              )}
            </div>
          )}

          {walletScreen === 1 && (
            <div>
              <div style={{ marginTop: "20px", marginBottom: "20px" }}>
                <div style={{ color: "#888888", fontWeight: "bold", marginBottom: 10 }}>Zingo PC v1.0.0</div>
                <img src={Logo} width="200px;" alt="Logo" />
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
                      type="button"
                      className={cstyles.primarybutton}
                      onClick={() => {
                        this.setState({
                          currentStatus: "",
                          currentStatusIsError: false,
                          walletScreen: 0,
                          newWalletError: null,
                        });
                        this.createNewWallet(); 
                      }}
                    >
                      Create New Wallet
                    </button>
                    <button type="button" className={cstyles.primarybutton} onClick={openServerSelectModal}>
                      Switch to Another Server
                    </button>
                  </div>
                </div>
                <div className={[cstyles.verticalflex, cstyles.margintoplarge].join(" ")}>
                  <div className={[cstyles.large, cstyles.highlight].join(" ")}>Restore Wallet From Seed</div>
                  <div className={cstyles.padtopsmall}>
                    If you already have a seed phrase, you can restore it to this wallet. This will rescan the
                    blockchain for all transactions from the seed phrase.
                  </div>
                  <div className={cstyles.margintoplarge}>
                    <button
                      type="button"
                      className={cstyles.primarybutton}
                      onClick={() => {
                        this.setState({
                          currentStatus: "",
                          currentStatusIsError: false,
                          newWalletError: null
                        });
                        this.restoreExistingWallet();
                      }}
                    >
                      Restore Wallet from Seed
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {walletScreen === 2 && (
            <div>
              <div style={{ marginTop: "20px", marginBottom: "20px" }}>
                <div style={{ color: "#888888", fontWeight: "bold", marginBottom: 10 }}>Zingo PC v1.0.0</div>
                <img src={Logo} width="200px;" alt="Logo" />
              </div>
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
                        <button type="button" className={cstyles.primarybutton} onClick={() => {
                          this.setState({ walletScreen: 0 });
                          this.doFirstTimeSetup();
                        }}>
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
                      <div className={cstyles.padtopsmall}>{seed}</div>
                      <hr style={{ width: "100%" }} />
                      <div className={cstyles.margintoplarge}>
                        <button type="button" className={cstyles.primarybutton} onClick={this.startNewWallet}>
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
              <div style={{ marginTop: "20px", marginBottom: "20px" }}>
                <div style={{ color: "#888888", fontWeight: "bold", marginBottom: 10 }}>Zingo PC v1.0.0</div>
                <img src={Logo} width="200px;" alt="Logo" />
              </div>
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
                        <button type="button" className={cstyles.primarybutton} onClick={this.restoreWalletBack}>
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
                        value={seed}
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
                        <button type="button" className={cstyles.primarybutton} onClick={() => this.doRestoreWallet()}>
                          Restore Wallet
                        </button>
                        <button type="button" className={cstyles.primarybutton} onClick={() => {
                          this.setState({ walletScreen: 0 });
                          this.doFirstTimeSetup();
                        }}>
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

    return <Redirect to={routes.DASHBOARD} />;
  }
}

// @ts-ignore
export default withRouter(LoadingScreen);
