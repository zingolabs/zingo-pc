import { ErrorModalData } from "../errormodal";
import TotalBalance from "./classes/TotalBalanceClass";
import ValueTransfer from "./classes/ValueTransferClass";
import SendPageState from "./classes/SendPageStateClass";
import ServerSelectState from "./classes/ServerSelectStateClass";
import Server from "./classes/ServerClass";
import FetchErrorType from "./classes/FetchErrorClass";

import AddressUnifiedClass from "./classes/UnifiedAddressClass";
import AddressTransparentClass from "./classes/TransparentAddressClass";
import AddressBookEntryClass from "./classes/AddressBookEntryClass";
import InfoClass from "./classes/InfoClass";


export default class AppState {
  // The total confirmed and unconfirmed balance in this wallet
  totalBalance: TotalBalance;

  // List of all addresses in the wallet
  addressesUnified: AddressUnifiedClass[];
  addressesTransparent: AddressTransparentClass[];

  // List of Address / Label pairs
  addressBook: AddressBookEntryClass[];

  // List of all T and Z ValueTransfer
  valueTransfers: ValueTransfer[];

  // List of all T and Z ValueTransfer for messages
  messages: ValueTransfer[];

  // The state of the send page, as the user constructs a transaction
  sendPageState: SendPageState;

  // getinfo result
  info: InfoClass;

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
  verificationProgress: number | null;

  constructor() {
    this.totalBalance = new TotalBalance();
    this.addressesUnified = [] as AddressUnifiedClass[];
    this.addressesTransparent = [] as AddressTransparentClass[];
    this.addressBook = [] as AddressBookEntryClass[];
    this.valueTransfers = [] as ValueTransfer[];
    this.messages = [] as ValueTransfer[];
    this.errorModalData = new ErrorModalData();
    this.serverSelectState = new ServerSelectState();
    this.sendPageState = new SendPageState();
    this.info = new InfoClass();
    this.verificationProgress = null;
    this.readOnly = false;
    this.serverUris = [] as Server[];
    this.fetchError = {} as FetchErrorType;
  }
}
