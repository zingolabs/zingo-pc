import React, { ReactNode } from "react";
import { UNKNOWN_MIXNET_VIEW } from "../rpc/components/mixnetPresenter";
import {
  AddressBookEntryClass,
  AppState,
  InfoClass,
  SendPageStateClass,
  TotalBalanceClass,
  ValueTransferClass,
  ServerClass,
  FetchErrorTypeClass,
  UnifiedAddressClass,
  TransparentAddressClass,
  SyncStatusType,
  WalletType,
  ConfirmModalClass,
  ErrorModalClass,
  BlockExplorerEnum,
} from "../components/appstate";

export const defaultAppState: AppState = {
  totalBalance: new TotalBalanceClass(),
  addressesUnified: [] as UnifiedAddressClass[],
  addressesTransparent: [] as TransparentAddressClass[],
  addressBook: [] as AddressBookEntryClass[],
  valueTransfers: [] as ValueTransferClass[],
  messages: [] as ValueTransferClass[],
  errorModal: new ErrorModalClass(),
  confirmModal: new ConfirmModalClass(),
  sendPageState: new SendPageStateClass(),
  info: new InfoClass(),
  syncingStatus: {} as SyncStatusType,
  verificationProgress: null,
  readOnly: false,
  serverUris: [] as ServerClass[],
  fetchError: {} as FetchErrorTypeClass,
  currentWallet: null,
  currentWalletOpenError: "",
  wallets: [] as WalletType[],
  birthday: 0,
  orchardPool: true,
  saplingPool: true,
  transparentPool: true,
  addLabelState: new AddressBookEntryClass("", ""),
  openErrorModal: () => {},
  closeErrorModal: () => {},
  openConfirmModal: () => {},
  closeConfirmModal: () => {},
  setSendTo: () => {},
  calculateShieldFee: async () => 0,
  handleShieldButton: () => {},
  setAddLabel: () => {},
  zecPrice: 0,
  mixnetView: UNKNOWN_MIXNET_VIEW,
  blockExplorerMainnetTransaction: BlockExplorerEnum.Zcashexplorer,
  blockExplorerTestnetTransaction: BlockExplorerEnum.Zcashexplorer,
  blockExplorerMainnetAddress: BlockExplorerEnum.Zcashexplorer,
  blockExplorerTestnetAddress: BlockExplorerEnum.Zcashexplorer,
  blockExplorerMainnetTransactionCustom: "",
  blockExplorerTestnetTransactionCustom: "",
  blockExplorerMainnetAddressCustom: "",
  blockExplorerTestnetAddressCustom: "",
  setBlockExplorer: () => {},
};

export const ContextApp = React.createContext(defaultAppState);

type ContextProviderProps = {
  children: ReactNode;
  value: AppState;
};

export const ContextAppProvider = ({ children, value }: ContextProviderProps) => {
  return <ContextApp.Provider value={value}>{children}</ContextApp.Provider>;
};
