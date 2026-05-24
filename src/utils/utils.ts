import {
  AddressKindEnum,
  BlockExplorerEnum,
  UnifiedAddressClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
} from "../components/appstate";
import randomColor from "randomcolor";

import { native, shell } from "../electronBridge";
import { ServerChainNameEnum } from "../components/appstate";

export const NO_CONNECTION: string = "Could not connect to the Server";

export default class Utils {
  // recover the var from the Global CSS.
  static getCssVariable(variableName: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  }

  static VTTypeWithConfirmations(
    type: ValueTransferKindEnum | "",
    status: ValueTransferStatusEnum | "",
    confirmations: number,
  ): string {
    return status === ValueTransferStatusEnum.failed && type === ValueTransferKindEnum.sent
      ? "Send"
      : status === ValueTransferStatusEnum.failed && type === ValueTransferKindEnum.shield
        ? "Shield"
        : type === ValueTransferKindEnum.sent && confirmations === 0
          ? "...Sending..."
          : type === ValueTransferKindEnum.sent && confirmations > 0
            ? "Sent"
            : type === ValueTransferKindEnum.received && confirmations === 0
              ? "...Receiving..."
              : type === ValueTransferKindEnum.received && confirmations > 0
                ? "Received"
                : type === ValueTransferKindEnum.memoToSelf && confirmations === 0
                  ? "...Sending to self..."
                  : type === ValueTransferKindEnum.memoToSelf && confirmations > 0
                    ? "Memo to self"
                    : type === ValueTransferKindEnum.sendToSelf && confirmations === 0
                      ? "...Sending to self..."
                      : type === ValueTransferKindEnum.sendToSelf && confirmations > 0
                        ? "Send to self"
                        : type === ValueTransferKindEnum.shield && confirmations === 0
                          ? "...Shielding..."
                          : type === ValueTransferKindEnum.shield && confirmations > 0
                            ? "Shield"
                            : type === ValueTransferKindEnum.rejection && confirmations === 0
                              ? "...Sending..."
                              : type === ValueTransferKindEnum.rejection && confirmations > 0
                                ? "Rejection"
                                : "";
  }

  static trimToSmall(addr?: string, numChars?: number): string {
    if (!addr) {
      return "";
    }
    const trimSize: number = numChars || 5;
    return `${addr.slice(0, trimSize)}...${addr.slice(addr.length - trimSize)}`;
  }

  static async getAddressChainName(addr: string): Promise<string | undefined> {
    if (!addr) return undefined;
    try {
      const resultParse: string = await native.parse_address(addr);
      if (!resultParse || resultParse.toLowerCase().startsWith("error")) return undefined;
      let parsed;
      try {
        parsed = JSON.parse(resultParse);
      } catch {
        return undefined;
      }
      if (parsed?.status === "success" && parsed?.chain_name) {
        return parsed.chain_name as string;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  static async getAddressKind(addr: string, currChain: "" | ServerChainNameEnum): Promise<AddressKindEnum | undefined> {
    if (!addr) return;
    try {
      const resultParse: string = await native.parse_address(addr);
      if (!resultParse || resultParse.toLowerCase().startsWith("error")) {
        return;
      }

      let resultParseJSON;
      try {
        resultParseJSON = JSON.parse(resultParse);
      } catch (error) {
        console.error("parse-address", error);
        return;
      }

      if (
        resultParseJSON &&
        resultParseJSON.status &&
        resultParseJSON.status === "success" &&
        resultParseJSON.chain_name &&
        resultParseJSON.chain_name === currChain
      ) {
        return resultParseJSON.address_kind;
      } else {
        return;
      }
    } catch (error) {
      console.error(`Critical Error address kind ${error}`);
      return;
    }
  }

  /**
   * Human-readable display name for a network — used wherever the chain is
   * shown to the user (address book entries, server selector, dashboards…).
   * Single source of truth so we don't drift across components.
   * Returns an empty string for empty / undefined / unknown values so callers
   * can drop it straight into JSX without a guard.
   */
  static chainDisplayName(chain: string | undefined): string {
    switch (chain) {
      case ServerChainNameEnum.mainChainName:
        return "Mainnet";
      case ServerChainNameEnum.testChainName:
        return "Testnet";
      case ServerChainNameEnum.regtestChainName:
        return "Regtest";
      default:
        return "";
    }
  }

  /**
   * Tries each Zcash network in turn and returns the one for which `addr` parses
   * as a valid address. Used by the address-book migration (entries created
   * before chain tagging) to back-fill the `chain` field without guessing.
   * Returns null if no network recognizes the address — caller should fall back.
   */
  static async detectAddressChain(addr: string): Promise<ServerChainNameEnum | null> {
    if (!addr) return null;
    const chains: ServerChainNameEnum[] = [
      ServerChainNameEnum.mainChainName,
      ServerChainNameEnum.testChainName,
      ServerChainNameEnum.regtestChainName,
    ];
    for (const chain of chains) {
      const kind = await Utils.getAddressKind(addr, chain);
      if (kind !== undefined) return chain;
    }
    return null;
  }

  static isValidSaplingPrivateKey(key: string): boolean {
    return (
      new RegExp("^secret-extended-key-test[0-9a-z]{278}$").test(key) ||
      new RegExp("^secret-extended-key-main[0-9a-z]{278}$").test(key)
    );
  }

  static isValidSaplingViewingKey(key: string): boolean {
    return new RegExp("^zxviews[0-9a-z]{278}$").test(key);
  }

  // Convert to max 8 decimal places, and remove trailing zeros
  static maxPrecision(v: number): string {
    if (!v) return `${v}`;

    return v.toFixed(8);
  }

  static maxPrecisionTrimmed(v: number): string {
    let s: string = Utils.maxPrecision(v);
    if (!s) {
      return s;
    }

    while (s.indexOf(".") >= 0 && s.substr(s.length - 1, 1) === "0") {
      s = s.substr(0, s.length - 1);
    }

    if (s.substr(s.length - 1) === ".") {
      s = s.substr(0, s.length - 1);
    }

    return s;
  }

  static splitZecAmountIntoBigSmall(zecValue: number) {
    if (!zecValue) {
      return { bigPart: zecValue.toString(), smallPart: "" };
    }

    let bigPart: string = Utils.maxPrecision(zecValue);
    let smallPart: string = "";

    if (bigPart.indexOf(".") >= 0) {
      const decimalPart: string = bigPart.substr(bigPart.indexOf(".") + 1);
      if (decimalPart.length > 4) {
        smallPart = decimalPart.substr(4);
        bigPart = bigPart.substr(0, bigPart.length - smallPart.length);

        // Pad the small part with trailing 0s
        while (smallPart.length < 4) {
          smallPart += "0";
        }
      }
    }

    if (smallPart === "0000") {
      smallPart = "";
    }

    return { bigPart, smallPart };
  }

  static getReceivers(addr: UnifiedAddressClass): string[] {
    let receivers: string[] = [];

    if (addr.has_orchard) receivers.push("Orchard");
    if (addr.has_sapling) receivers.push("Sapling");
    if (addr.has_transparent) receivers.push("Transparent");

    return receivers;
  }

  static splitStringIntoChunks(s: string, numChunks: number) {
    if (numChunks > s.length) return [s];
    if (s.length < 16) return [s];

    const chunkSize: number = Math.round(s.length / numChunks);
    const chunks: string[] = [];
    for (let i = 0; i < numChunks - 1; i++) {
      chunks.push(s.substr(i * chunkSize, chunkSize));
    }
    // Last chunk might contain un-even length
    chunks.push(s.substr((numChunks - 1) * chunkSize));

    return chunks;
  }

  static nextToAddrID: number = 0;

  static getNextToAddrID(): number {
    return Utils.nextToAddrID++;
  }

  static getDonationAddress(testnet: boolean): string {
    if (testnet) {
      return "";
    } else {
      return "";
    }
  }

  static getDefaultDonationAmount(testnet: boolean): number {
    return 0.1;
  }

  static getDefaultDonationMemo(testnet: boolean): string {
    return "Thanks for supporting Zingo!";
  }

  static getZecToUsdString(price?: number, zecValue?: number): string {
    if (!price || !zecValue) {
      return "USD --";
    }

    if (price * zecValue < 0.01) {
      return "USD < 0.01";
    }

    return `USD ${(price * zecValue).toFixed(2)}`;
  }

  /**
   * Formats the per-ZEC exchange rate. Returns `USD --` when the price is
   * missing — matches the fallback of `getZecToUsdString` so the UI is
   * consistent everywhere a USD figure may not be available. Otherwise
   * `USD x.xx / ZEC`.
   */
  static getZecRateString(price?: number): string {
    if (!price) return "USD --";
    return `USD ${price.toFixed(2)} / ZEC`;
  }

  static utf16Split(s: string, chunksize: number): string[] {
    const ans: string[] = [];

    let current: string = "";
    let currentLen: number = 0;
    const a: string[] = [...s];
    for (let i = 0; i < a.length; i++) {
      // Each UTF-16 char will take upto 4 bytes when encoded
      const utf8len: number = a[i].length > 1 ? 4 : 1;

      // Test if adding it will exceed the size
      if (currentLen + utf8len > chunksize) {
        ans.push(current);
        current = "";
        currentLen = 0;
      }

      current += a[i];
      currentLen += utf8len;
    }

    if (currentLen > 0) {
      ans.push(current);
    }

    return ans;
  }

  static generateColorList(numColors: number): string[] {
    const colorList: string[] = [];

    for (let i = 0; i < numColors; i++) {
      const color = randomColor({
        luminosity: "bright", // Define la luminosidad de los colores generados
        format: "hex", // Formato de color en hexadecimal
      });

      colorList.push(color);
    }

    return colorList;
  }

  static openTxid = (
    txid: string,
    chainName: ServerChainNameEnum | undefined,
    blockExplorer: BlockExplorerEnum,
    blockExplorerCustom: string,
  ) => {
    if (blockExplorer === BlockExplorerEnum.Zcashexplorer) {
      if (chainName === ServerChainNameEnum.testChainName) {
        shell.openExternal(`https://testnet.zcashexplorer.app/transactions/${txid}`);
      } else {
        shell.openExternal(`https://mainnet.zcashexplorer.app/transactions/${txid}`);
      }
    } else if (blockExplorer === BlockExplorerEnum.Cipherscan) {
      if (chainName === ServerChainNameEnum.testChainName) {
        shell.openExternal(`https://testnet.cipherscan.app/tx/${txid}`);
      } else {
        shell.openExternal(`https://cipherscan.app/tx/${txid}`);
      }
    } else if (blockExplorer === BlockExplorerEnum.Zypherscan) {
      if (chainName === ServerChainNameEnum.testChainName) {
        shell.openExternal(`https://testnet.zypherscan.com/tx/${txid}`);
      } else {
        shell.openExternal(`https://www.zypherscan.com/tx/${txid}`);
      }
    } else if (blockExplorer === BlockExplorerEnum.Custom) {
      shell.openExternal(`${blockExplorerCustom}${txid}`);
    }
  };

  static openAddress = (
    address: string,
    chainName: ServerChainNameEnum | undefined,
    blockExplorer: BlockExplorerEnum,
    blockExplorerCustom: string,
  ) => {
    if (blockExplorer === BlockExplorerEnum.Zcashexplorer) {
      if (chainName === ServerChainNameEnum.testChainName) {
        shell.openExternal(`https://testnet.zcashexplorer.app/search?qs=${address}`);
      } else {
        shell.openExternal(`https://mainnet.zcashexplorer.app/search?qs=${address}`);
      }
    } else if (blockExplorer === BlockExplorerEnum.Cipherscan) {
      if (chainName === ServerChainNameEnum.testChainName) {
        shell.openExternal(`https://testnet.cipherscan.app/address/${address}`);
      } else {
        shell.openExternal(`https://cipherscan.app/address/${address}`);
      }
    } else if (blockExplorer === BlockExplorerEnum.Zypherscan) {
      if (chainName === ServerChainNameEnum.testChainName) {
        shell.openExternal(`https://testnet.zypherscan.com/address/${address}`);
      } else {
        shell.openExternal(`https://www.zypherscan.com/address/${address}`);
      }
    } else if (blockExplorer === BlockExplorerEnum.Custom) {
      shell.openExternal(`${blockExplorerCustom}${address}`);
    }
  };
}
