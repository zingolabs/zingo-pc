/* eslint-disable max-classes-per-file */
import { ErrorModalData } from "../errormodal";
import TotalBalance from "./TotalBalance";
import AddressBalance from "./AddressBalance";
import AddressBookEntry from "./AddressbookEntry";
import Transaction from "./Transaction";
import SendPageState from "./SendPageState";
import ReceivePageState from "./ReceivePageState";
import RPCConfig from "./RPCConfig";
import Info from "./Info";
import ServerSelectState from "./ServerSelectState";
import PasswordState from "./PasswordState";
import WalletSettings from "./WalletSettings";
import AddressDetail from "./AddressDetail";

// eslint-disable-next-line max-classes-per-file
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
    this.rescanning = false;
    this.prevSyncId = -1;
    this.passwordState = new PasswordState();
    this.walletSettings = new WalletSettings();
  }
}
