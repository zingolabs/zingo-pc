import React, { ReactNode } from 'react';
import { 
  AddressBookEntryClass, 
  AppState, 
  InfoClass, 
  SendPageStateClass, 
  ServerSelectStateClass, 
  TotalBalanceClass, 
  ValueTransferClass, 
  ServerClass, 
  FetchErrorTypeClass, 
  UnifiedAddressClass, 
  TransparentAddressClass, 
  SyncStatusType,
} from "../components/appstate";
import { ErrorModalData } from '../components/errormodal';

export const defaultAppState: AppState = {
  totalBalance: new TotalBalanceClass(),
  addressesUnified: [] as UnifiedAddressClass[],
  addressesTransparent: [] as TransparentAddressClass[],
  addressBook: [] as AddressBookEntryClass[],
  valueTransfers: [] as ValueTransferClass[],
  messages: [] as ValueTransferClass[],
  errorModalData: new ErrorModalData(),
  serverSelectState: new ServerSelectStateClass(),
  sendPageState: new SendPageStateClass(),
  info: new InfoClass(),
  syncingStatus: {} as SyncStatusType,
  verificationProgress: null,
  readOnly: false,
  serverUris: [] as ServerClass[],
  fetchError: {} as FetchErrorTypeClass,
  serverUri: "",
  serverChainName: "",
  serverSelection: "",
  seed_phrase: "",
  ufvk: "",
  birthday: 0,
  orchardPool: true,
  saplingPool: true,
  transparentPool: true,
  addLabelState: new AddressBookEntryClass('', '')
};

export const ContextApp = React.createContext(defaultAppState);

type ContextProviderProps = {
  children: ReactNode;
  value: AppState;
};

export const ContextAppProvider = ({ children, value }: ContextProviderProps) => {
  return <ContextApp.Provider value={value}>{children}</ContextApp.Provider>;
};