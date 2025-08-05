import React, { ReactNode } from 'react';
import { Address, AddressBookEntry, AppState, Info, SendPageState, ServerSelectState, TotalBalance, ValueTransfer, WalletSettings, Server, FetchErrorType } from "../components/appstate";
import { ErrorModalData } from '../components/errormodal';

export const defaultAppState: AppState = {
  totalBalance: new TotalBalance(),
  addresses: [] as Address[],
  addressBook: [] as AddressBookEntry[],
  valueTransfers: [] as ValueTransfer[],
  messages: [] as ValueTransfer[],
  errorModalData: new ErrorModalData(),
  serverSelectState: new ServerSelectState(),
  sendPageState: new SendPageState(),
  info: new Info(),
  verificationProgress: 100,
  walletSettings: new WalletSettings(),
  readOnly: false,
  serverUris: [] as Server[],
  fetchError: {} as FetchErrorType,
};

export const ContextApp = React.createContext(defaultAppState);

type ContextProviderProps = {
  children: ReactNode;
  value: AppState;
};

export const ContextAppProvider = ({ children, value }: ContextProviderProps) => {
  return <ContextApp.Provider value={value}>{children}</ContextApp.Provider>;
};