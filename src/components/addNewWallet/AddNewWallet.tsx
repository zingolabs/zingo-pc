import React, { useContext } from "react";
import cstyles from "../common/Common.module.css";
import styles from "./AddNewWallet.module.css";
import ScrollPaneTop from "../scrollPane/ScrollPane";
import Heart from "../../assets/img/zcashdlogo.gif";
import DetailLine from "./components/DetailLine"; 
import { ContextApp } from "../../context/ContextAppState";
//import { CreationTypeEnum, PerformanceLevelEnum, ServerChainNameEnum, ServerSelectionEnum, WalletType } from "../appstate";
//import native from "../../native.node";
//import { ipcRenderer } from "electron";

type AddNewWalletProps = {
  refresh: () => void;
  openServerSelectModal: () => void;
};

const chains = {
  "main": "Mainnet",
  "test": "Testnet",
  "regtest": "Regtest",
  "": "" 
}; 

const AddNewWallet: React.FC<AddNewWalletProps> = ({ refresh, openServerSelectModal }) => {
  const context = useContext(ContextApp);
  const { 
    info, 
    //currentWallet, 
    //wallets 
  } = context;

/*
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
      const walletExistsResult: boolean | string = native.wallet_exists(
        currentWallet ? currentWallet.uri : '', 
        currentWallet ? currentWallet.chain_name : ServerChainNameEnum.mainChainName, 
        currentWallet ? currentWallet.PerformanceLevel : PerformanceLevelEnum.High, 
        3, 
        nextWalletName);
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

  const createNextWallet = async (id: number, wallet_name: string, alias: string, creationType: CreationTypeEnum) => {
    const addWallet: WalletType = {
      id,
      fileName: wallet_name, // by default: zingo-wallet.dat
      alias, // by default: the first word of the seed phrase 
      chain_name: currentWallet ? currentWallet.chain_name : ServerChainNameEnum.mainChainName,
      creationType,
      uri: currentWallet ? currentWallet.uri : '',
      selection: currentWallet ? currentWallet.selection : ServerSelectionEnum.list,
      PerformanceLevel: PerformanceLevelEnum.High,
    };
    await ipcRenderer.invoke("wallets:add", addWallet);
    await ipcRenderer.invoke("saveSettings", { key: "currentwalletid", value: id });
    // re-fetching wallets
    //const newWallets = await ipcRenderer.invoke("wallets:all");
    //this.setState({ wallets: newWallets, currentWalletId: id });
    //this.props.setWallets(id, newWallets);
  };

  const createNewWallet = async () => {
    try {
      const { next: id, nextWalletName: wallet_name } = nextWalletName();
      const result: string = native.init_new(
        currentWallet ? currentWallet.uri : '', 
        currentWallet ? currentWallet.chain_name : ServerChainNameEnum.mainChainName, 
        currentWallet ? currentWallet.PerformanceLevel : PerformanceLevelEnum.High, 
        3, 
        wallet_name
      );

      if (!result || result.toLowerCase().startsWith("error")) {
        //console.log('creating new wallet', result);
        //this.setState({ walletScreen: 2, newWalletError: result });
      } else {
        const resultJSON = await JSON.parse(result);
        const seed_phrase: string = resultJSON.seed_phrase;
        //const birthday: number = resultJSON.birthday;

        createNextWallet(id, wallet_name, `${seed_phrase.split(' ')[0]}...`, CreationTypeEnum.Seed);

        //this.setState({ walletScreen: 2, seed_phrase, birthday });
        //this.props.setRecoveryInfo(seed_phrase, "", birthday);
        //this.props.setPools(true, true, true);
        //this.props.setReadOnly(false);
      }
    } catch (error) {
      console.log(`Critical Error create new wallet ${error}`);
      //this.setState({
      //  currentStatus: (
      //    <span>
      //      Error Initializing Lightclient
      //      <br />
      //      {`${error}`}
      //    </span>
      //  ),
      //  currentStatusIsError: true,
      //});
    }
  };

  const doRestoreSeedWallet = async () => {
    const { seed_phrase, birthday, uri, chain_name } = this.state;
    //console.log(`Restoring ${seed_phrase} with ${birthday}`);
    try {
      const { next: id, nextWalletName: wallet_name } = this.nextWalletName();
      const result: string = native.init_from_seed(seed_phrase, birthday, uri, chain_name, PerformanceLevelEnum.High, 3, wallet_name);
      if (!result || result.toLowerCase().startsWith("error")) {
        this.setState({ newWalletError: result });
      } else {
        const resultJSON = await JSON.parse(result);
        const seed_phrase: string = resultJSON.seed_phrase;
        const birthday: number = resultJSON.birthday;

        this.createNextWallet(id, wallet_name, `${seed_phrase.split(' ')[0]}...`, CreationTypeEnum.Seed);

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
      this.setState({
        currentStatus: (
          <span>
            Error Initializing Lightclient
            <br />
            {`${error}`}
          </span>
        ),
        currentStatusIsError: true,
      });
    }
  };

  const doRestoreUfvkWallet = async () => {
    const { ufvk, birthday, uri, chain_name } = this.state;
    //console.log(`Restoring ${ufvk} with ${birthday}`);
    try {
      const { next: id, nextWalletName: wallet_name } = this.nextWalletName();
      const result: string = native.init_from_ufvk(ufvk, birthday, uri, chain_name, PerformanceLevelEnum.High, 3, wallet_name);
      if (!result || result.toLowerCase().startsWith("error")) {
        this.setState({ newWalletError: result });
      } else {
        const resultJSON = await JSON.parse(result);
        const ufvk: string = resultJSON.ufvk;
        const birthday: number = resultJSON.birthday;

        this.createNextWallet(id, wallet_name, `${ufvk.substring(0, 10)}...`, CreationTypeEnum.Ufvk);

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
      this.setState({
        currentStatus: (
          <span>
            Error Initializing Lightclient
            <br />
            {`${error}`}
          </span>
        ),
        currentStatusIsError: true,
      });
    }
  };

  const doRestoreFileWallet = async () => {
    const { fileWallet, uri, chain_name } = this.state;
    console.log(`Loading ${fileWallet}`);
    try {
      // only needs the id, it have the wallet_name already
      const { next: id } = this.nextWalletName();
      const wallet_name: string = this.state.fileWallet;
      const result: string = native.init_from_b64(uri, chain_name, PerformanceLevelEnum.High, 3, wallet_name);
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
          this.createNextWallet(id, wallet_name, wallet_name, CreationTypeEnum.File);

          this.props.setRecoveryInfo("", resultJSON.ufvk, resultJSON.birthday)
          this.props.setPools(walletKindJSON.orchard, walletKindJSON.sapling, walletKindJSON.transparent)
          this.props.setReadOnly(true);
        } else {
          // seed phrase
          this.createNextWallet(id, wallet_name, wallet_name, CreationTypeEnum.File);

          this.props.setRecoveryInfo(resultJSON.seed_phrase, "", resultJSON.birthday)
          this.props.setPools(walletKindJSON.orchard, walletKindJSON.sapling, walletKindJSON.transparent)
          this.props.setReadOnly(false);
        }
      }
    } catch (error) {
      console.log(`Critical Error restore from file ${error}`);
      this.setState({
        currentStatus: (
          <span>
            Error Initializing Lightclient
            <br />
            {`${error}`}
          </span>
        ),
        currentStatusIsError: true,
      });

    }
  };
*/
  return (
    <div>
      <div className={styles.container}>
        <ScrollPaneTop offsetHeight={0}>
          <div className={styles.imgcontainer}>
            <img src={Heart} alt="heart" />
          </div>

          <div className={styles.detailcontainer}>
            <div className={styles.detaillines}>
              <DetailLine label="Version" value={info.version} />
              <DetailLine label="Zingolib Version" value={info.zingolib} />
              <DetailLine label="Node" value={info.zcashdVersion} />
              <DetailLine label="Server URI" value={info.serverUri} />
              <DetailLine label="Server Network" value={chains[info.chainName]} />
              <DetailLine label="Block Height" value={`${info.latestBlock}`} />
              {info.currencyName === 'ZEC' && (
                <DetailLine label="ZEC Price" value={`USD ${info.zecPrice.toFixed(2)}`} />
              )}
            </div>
          </div>

          <div className={cstyles.buttoncontainer}>
            <button className={cstyles.primarybutton} type="button" onClick={openServerSelectModal}>
              Switch to Another Server
            </button>
            <button className={cstyles.primarybutton} type="button" onClick={refresh}>
              Refresh All Data
            </button>
          </div>

          <div className={cstyles.margintoplarge} />
        </ScrollPaneTop>
      </div>
    </div>
  );
};

export default AddNewWallet;
