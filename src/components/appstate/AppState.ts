import { ErrorModalData } from "../errormodal";
import TotalBalance from "./components/TotalBalance";
import AddressBalance from "./components/AddressBalance";
import AddressBookEntry from "./components/AddressbookEntry";
import Transaction from "./components/Transaction";
import SendPageState from "./components/SendPageState";
import ReceivePageState from "./components/ReceivePageState";
import RPCConfig from "./components/RPCConfig";
import Info from "./components/Info";
import ServerSelectState from "./components/ServerSelectState";
import PasswordState from "./components/PasswordState";
import WalletSettings from "./components/WalletSettings";
import AddressDetail from "./components/AddressDetail";

export default class AppState {
  // The total confirmed and unconfirmed balance in this wallet
  totalBalance: TotalBalance;

  // The list of all t and z addresses that have a current balance. That is, the list of
  // addresses that have a (confirmed or unconfirmed) UTXO or note pending.
  addressesWithBalance: AddressBalance[];

  // A map type that contains address -> privatekey/viewkey mapping, for display on the receive page
  // This mapping is ephemeral, and will disappear when the user navigates away.
  addressPrivateKeys: Map<string, string>;

  addressViewKeys: Map<string, string>;

  // List of all addresses in the wallet, including change addresses and addresses
  // that don't have any balance or are unused
  addresses: AddressDetail[];

  // List of Address / Label pairs
  addressBook: AddressBookEntry[];

  // List of all T and Z transactions
  transactions: Transaction[];

  // The state of the send page, as the user constructs a transaction
  sendPageState: SendPageState;

  // Any state for the receive page
  receivePageState: ReceivePageState;

  // The Current configuration of the RPC params
  rpcConfig: RPCConfig;

  // getinfo and getblockchaininfo result
  info: Info;

  verificationProgress: number;

  walletSettings: WalletSettings;

  // Error modal data
  errorModalData: ErrorModalData;

  // Server selection
  serverSelectState: ServerSelectState;

  // Is the app rescanning?
  rescanning: boolean;

  // Last sync ID
  prevSyncId: number;

  // Callbacks for the password dialog box
  passwordState: PasswordState;

  constructor() {
    this.totalBalance = new TotalBalance();
    this.addressesWithBalance = [] as AddressBalance[];
    this.addressPrivateKeys = new Map();
    this.addressViewKeys = new Map();
    this.addresses = [] as AddressDetail[];
    this.addressBook = [] as AddressBookEntry[];
    this.transactions = [] as Transaction[];
    this.errorModalData = new ErrorModalData();
    this.serverSelectState = new ServerSelectState();
    this.sendPageState = new SendPageState();
    this.receivePageState = new ReceivePageState();
    this.rpcConfig = new RPCConfig();
    this.info = new Info();
    this.verificationProgress = 100;
    this.rescanning = false;
    this.prevSyncId = -1;
    this.passwordState = new PasswordState();
    this.walletSettings = new WalletSettings();
  }
}
