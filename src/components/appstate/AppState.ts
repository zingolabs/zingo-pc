import { ErrorModalData } from "../errormodal";
import TotalBalanceClass from "./classes/TotalBalanceClass";
import ValueTransferClass from "./classes/ValueTransferClass";
import SendPageStateClass from "./classes/SendPageStateClass";
import ServerSelectStateClass from "./classes/ServerSelectStateClass";
import ServerClass from "./classes/ServerClass";
import FetchErrorClass from "./classes/FetchErrorClass";

import AddressUnifiedClass from "./classes/UnifiedAddressClass";
import AddressTransparentClass from "./classes/TransparentAddressClass";
import AddressBookEntryClass from "./classes/AddressBookEntryClass";
import InfoClass from "./classes/InfoClass";
import { SyncStatusType } from "./types/SyncStatusType";
import { ServerChainNameEnum } from "./enums/ServerChainNameEnum";


export default class AppState {
  // The total confirmed and unconfirmed balance in this wallet
  totalBalance: TotalBalanceClass;

  // List of all addresses in the wallet
  addressesUnified: AddressUnifiedClass[];
  addressesTransparent: AddressTransparentClass[];

  // List of Address / Label pairs
  addressBook: AddressBookEntryClass[];

  // List of all T and Z ValueTransfer
  valueTransfers: ValueTransferClass[];

  // List of all T and Z ValueTransfer for messages
  messages: ValueTransferClass[];

  // The state of the send page, as the user constructs a transaction
  sendPageState: SendPageStateClass;

  // getinfo result
  info: InfoClass;

  // Error modal data
  errorModalData: ErrorModalData;

  // Server selection
  serverSelectState: ServerSelectStateClass;

  // if the wallet is from seed or from VK
  readOnly: boolean;

  // list of servers with the latency calculated at launch
  serverUris: ServerClass[];

  // general error of some fetching command
  fetchError: FetchErrorClass;

  // syncing general progress
  syncingStatus: SyncStatusType;
  verificationProgress: number | null;

  // local data for performance
  serverUri: string;
  serverChainName: "" | ServerChainNameEnum;
  serverSelection: '' | 'auto' | 'list' | 'custom';
  seed_phrase: string;
  ufvk: string;
  birthday: number;

  // pools
  orchardPool: boolean;
  saplingPool: boolean;
  transparentPool: boolean;

  // The state of the Address Book Screen, as thhe user create a new label
  addLabelState: AddressBookEntryClass;

  constructor() {
    this.totalBalance = new TotalBalanceClass();
    this.addressesUnified = [] as AddressUnifiedClass[];
    this.addressesTransparent = [] as AddressTransparentClass[];
    this.addressBook = [] as AddressBookEntryClass[];
    this.valueTransfers = [] as ValueTransferClass[];
    this.messages = [] as ValueTransferClass[];
    this.errorModalData = new ErrorModalData();
    this.serverSelectState = new ServerSelectStateClass();
    this.sendPageState = new SendPageStateClass();
    this.info = new InfoClass();
    this.syncingStatus = {} as SyncStatusType;
    this.verificationProgress = null;
    this.readOnly = false;
    this.serverUris = [] as ServerClass[];
    this.fetchError = {} as FetchErrorClass;
    this.serverUri = "";
    this.serverChainName = "";
    this.serverSelection = "";
    this.seed_phrase = "";
    this.ufvk = "";
    this.birthday = 0;
    this.orchardPool = true;
    this.saplingPool = true;
    this.transparentPool = true;
    this.addLabelState = new AddressBookEntryClass('', '');
  }
}
