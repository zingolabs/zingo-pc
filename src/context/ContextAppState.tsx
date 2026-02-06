import React, { ReactNode } from 'react';
import { 
  AddressBookEntryClass, 
  AppState, 
  InfoClass, 
  SendPageStateClass, 
  ServerSelectModalClass, 
  TotalBalanceClass, 
  ValueTransferClass, 
  ServerClass, 
  FetchErrorTypeClass, 
  UnifiedAddressClass, 
  TransparentAddressClass, 
  SyncStatusType,
  WalletType,
  ConfirmModalClass,
  ErrorModalClass
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
  serverSelectModal: new ServerSelectModalClass(),
  sendPageState: new SendPageStateClass(),
  info: new InfoClass(),
  syncingStatus: {} as SyncStatusType,
  verificationProgress: null,
  readOnly: false,
  serverUris: [] as ServerClass[],
  fetchError: {} as FetchErrorTypeClass,
  currentWallet: null,
  wallets: [] as WalletType[],
  seed_phrase: "",
  ufvk: "",
  birthday: 0,
  orchardPool: true,
  saplingPool: true,
  transparentPool: true,
  addLabelState: new AddressBookEntryClass('', ''),
  openErrorModal: () => {},
  closeErrorModal: () => {},
  openConfirmModal: () => {},
  closeConfirmModal: () => {},
  setSendTo: () => {},
  calculateShieldFee: async () => 0,
  handleShieldButton: () => {},
  setAddLabel: () => {},
};

export const ContextApp = React.createContext(defaultAppState);

type ContextProviderProps = {
  children: ReactNode;
  value: AppState;
};

export const ContextAppProvider = ({ children, value }: ContextProviderProps) => {
  return <ContextApp.Provider value={value}>{children}</ContextApp.Provider>;
};