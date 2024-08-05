import { AddressType, ReceiverType } from "../components/appstate";
import randomColor from 'randomcolor';

import native from "../native.node";

export const NO_CONNECTION: string = "Could not connect to zcashd";

const { shell } = window.require("electron"); 

export default class Utils {

  static trimToSmall(addr?: string, numChars?: number): string {
    if (!addr) {
      return '';
    }
    const trimSize: number = numChars || 5;
    return `${addr.slice(0, trimSize)}...${addr.slice(addr.length - trimSize)}`;
  }

  static async getAddressType(addr: string): Promise<AddressType | undefined> {
    if (!addr) return;
    const resultParse: string = await native.zingolib_execute_async('parse_address', addr);
    //console.log(addr, resultParse);
    if (resultParse.toLowerCase().startsWith('error') || resultParse.toLowerCase() === 'null') {
      return;
    }
    const resultParseJSON = JSON.parse(resultParse);

    if (resultParseJSON && resultParseJSON.status && resultParseJSON.status === "success") {
      if (resultParseJSON.address_kind === "unified") return AddressType.unified;
      else if (resultParseJSON.address_kind === "sapling") return AddressType.sapling;
      else if (resultParseJSON.address_kind === "transparent") return AddressType.transparent;
      else return; 
    } else {
      return;
    }
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

  static getReceivers(array: ReceiverType[]): string[] {
    let receivers: string[] = [];

    array.forEach((r: ReceiverType) => {
      if(r === ReceiverType.orchard) receivers.push("Orchard");
      if(r === ReceiverType.transparent) receivers.push("Transparent");
      if(r === ReceiverType.sapling) receivers.push("Sapling");
    });
    
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

    if ((price * zecValue) < 0.01) {
      return "USD < 0.01";
    }

    return `USD ${(price * zecValue).toFixed(2)}`;
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
        luminosity: 'bright', // Define la luminosidad de los colores generados
        format: 'hex', // Formato de color en hexadecimal
      });

      colorList.push(color);
    }

    return colorList;
  }

  static openTxid = (txid: string, currencyName: string) => {
    if (currencyName === "TAZ") {
      shell.openExternal(`https://testnet.zcashexplorer.app/transactions/${txid}`);
    } else {
      shell.openExternal(`https://mainnet.zcashexplorer.app/transactions/${txid}`);
    }
  }

  static openAddress = (address: string, currencyName: string) => { 
    if (currencyName === "TAZ") {
      shell.openExternal(`https://testnet.zcashexplorer.app/address/${address}`);
    } else {
      if (address.startsWith('u')) {
        shell.openExternal(`https://mainnet.zcashexplorer.app/ua/${address}`);
      } else {
        shell.openExternal(`https://mainnet.zcashexplorer.app/address/${address}`);
      }
    }
  }

}
