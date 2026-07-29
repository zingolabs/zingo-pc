import TotalBalanceClass from "./classes/TotalBalanceClass";
import ValueTransferClass from "./classes/ValueTransferClass";
import SendPageStateClass from "./classes/SendPageStateClass";
import ServerClass from "./classes/ServerClass";
import FetchErrorClass from "./classes/FetchErrorClass";
import ConfirmModalClass from "./classes/ConfirmModalClass";
import ErrorModalClass from "./classes/ErrorModalClass";
import AddressUnifiedClass from "./classes/UnifiedAddressClass";
import AddressTransparentClass from "./classes/TransparentAddressClass";
import AddressBookEntryClass from "./classes/AddressBookEntryClass";
import InfoClass from "./classes/InfoClass";
import { SyncStatusType } from "./types/SyncStatusType";
import { ZcashURITarget } from "../../utils/uris";
import { WalletType } from "./types/WalletType";
import { BlockExplorerEnum } from "./enums/BlockExplorerEnum";

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
  errorModal: ErrorModalClass;

  // Config modal data
  confirmModal: ConfirmModalClass;

  // if the wallet is from seed or from VK
  readOnly: boolean;

  // list of servers with the latency calculated at launch
  serverUris: ServerClass[];

  // general error of some fetching command
  fetchError: FetchErrorClass;

  // syncing general progress
  syncingStatus: SyncStatusType;
  verificationProgress: number | null;

  // current wallet
  currentWallet: WalletType | null;

  // current wallet Open Error
  currentWalletOpenError: string;

  // list of wallets
  wallets: WalletType[];

  birthday: number;

  // pools
  orchardPool: boolean;
  saplingPool: boolean;
  transparentPool: boolean;

  // The state of the Address Book Screen, as the user create a new label
  addLabelState: AddressBookEntryClass;

  // props to context
  openErrorModal: (t: string, b: string | JSX.Element) => void;
  closeErrorModal: () => void;
  openConfirmModal: (t: string, b: string | JSX.Element, a: () => void) => void;
  closeConfirmModal: () => void;
  setSendTo: (t: ZcashURITarget) => void;
  calculateShieldFee: () => Promise<number>;
  handleShieldButton: () => void;
  setAddLabel: (a: AddressBookEntryClass) => void;

  // Current USD price per ZEC. Nothing fetches it today: the clearnet
  // fetch is removed until the mixnet convergence lands a typed price
  // surface (ADR 0024 arc 6). Lives at the top level (not inside
  // InfoClass) because the periodic info-refresh rebuilds InfoClass and
  // would otherwise clobber the price between cycles. 0 means "no price
  // available right now" — all USD displays render `--` in that case.
  zecPrice: number;

  // block explorer selected. Type is the enum (not a literal) so a custom
  // value can be assigned and the type narrows cleanly.
  blockExplorerMainnetTransaction: BlockExplorerEnum;
  blockExplorerTestnetTransaction: BlockExplorerEnum;
  blockExplorerMainnetAddress: BlockExplorerEnum;
  blockExplorerTestnetAddress: BlockExplorerEnum;
  blockExplorerMainnetTransactionCustom: string;
  blockExplorerTestnetTransactionCustom: string;
  blockExplorerMainnetAddressCustom: string;
  blockExplorerTestnetAddressCustom: string;
  setBlockExplorer: (be: any) => void;

  constructor() {
    this.totalBalance = new TotalBalanceClass();
    this.addressesUnified = [] as AddressUnifiedClass[];
    this.addressesTransparent = [] as AddressTransparentClass[];
    this.addressBook = [] as AddressBookEntryClass[];
    this.valueTransfers = [] as ValueTransferClass[];
    this.messages = [] as ValueTransferClass[];
    this.errorModal = new ErrorModalClass();
    this.confirmModal = new ConfirmModalClass();
    this.sendPageState = new SendPageStateClass();
    this.info = new InfoClass();
    this.syncingStatus = {} as SyncStatusType;
    this.verificationProgress = null;
    this.readOnly = false;
    this.serverUris = [] as ServerClass[];
    this.fetchError = {} as FetchErrorClass;
    this.currentWallet = {} as WalletType;
    this.currentWalletOpenError = "";
    this.wallets = [] as WalletType[];
    this.birthday = 0;
    this.orchardPool = true;
    this.saplingPool = true;
    this.transparentPool = true;
    this.addLabelState = new AddressBookEntryClass("", "");
    this.openErrorModal = () => {};
    this.closeErrorModal = () => {};
    this.openConfirmModal = () => {};
    this.closeConfirmModal = () => {};
    this.setSendTo = () => {};
    this.calculateShieldFee = async () => 0;
    this.handleShieldButton = () => {};
    this.setAddLabel = () => {};
    this.zecPrice = 0;
    this.blockExplorerMainnetTransaction = BlockExplorerEnum.Zcashexplorer;
    this.blockExplorerTestnetTransaction = BlockExplorerEnum.Zcashexplorer;
    this.blockExplorerMainnetAddress = BlockExplorerEnum.Zcashexplorer;
    this.blockExplorerTestnetAddress = BlockExplorerEnum.Zcashexplorer;
    this.blockExplorerMainnetTransactionCustom = "";
    this.blockExplorerTestnetTransactionCustom = "";
    this.blockExplorerMainnetAddressCustom = "";
    this.blockExplorerTestnetAddressCustom = "";
    this.setBlockExplorer = () => {};
  }
}
