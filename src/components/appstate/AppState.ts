import { ErrorModalData } from "../errormodal";
import TotalBalance from "./components/TotalBalance";
import AddressBookEntry from "./components/AddressbookEntry";
import ValueTransfer from "./components/ValueTransfer";
import SendPageState from "./components/SendPageState";
import Info from "./components/Info";
import ServerSelectState from "./components/ServerSelectState";
import WalletSettings from "./components/WalletSettings";
import Address from "./components/Address";
import Server from "./components/Server";
import FetchErrorType from "./components/FetchErrorType";

export default class AppState {
  // The total confirmed and unconfirmed balance in this wallet
  totalBalance: TotalBalance;

  // List of all addresses in the wallet, including change addresses and addresses
  // that don't have any balance or are unused
  addresses: Address[];

  // List of Address / Label pairs
  addressBook: AddressBookEntry[];

  // List of all T and Z ValueTransfer
  valueTransfers: ValueTransfer[];

  // List of all T and Z ValueTransfer for messages
  messages: ValueTransfer[];

  // The state of the send page, as the user constructs a transaction
  sendPageState: SendPageState;

  // getinfo result
  info: Info;

  // internal wallet settings in the blockchain
  walletSettings: WalletSettings;

  // Error modal data
  errorModalData: ErrorModalData;

  // Server selection
  serverSelectState: ServerSelectState;

  // if the wallet is from seed or from VK
  readOnly: boolean;

  // list of servers with the latency calculated at launch
  serverUris: Server[];

  // general error of some fetching command
  fetchError: FetchErrorType;

  // syncing general progress
  verificationProgress: number;

  constructor() {
    this.totalBalance = new TotalBalance();
    this.addresses = [] as Address[];
    this.addressBook = [] as AddressBookEntry[];
    this.valueTransfers = [] as ValueTransfer[];
    this.messages = [] as ValueTransfer[];
    this.errorModalData = new ErrorModalData();
    this.serverSelectState = new ServerSelectState();
    this.sendPageState = new SendPageState();
    this.info = new Info();
    this.verificationProgress = 100;
    this.walletSettings = new WalletSettings();
    this.readOnly = false;
    this.serverUris = [] as Server[];
    this.fetchError = {} as FetchErrorType;
  }
}
