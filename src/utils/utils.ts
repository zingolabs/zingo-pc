export const NO_CONNECTION: string = "Could not connect to zcashd";

export default class Utils {
  static ZCASH_COMMUNITY: string = "https://mainnet.lightwalletd.com:9067";
  static ZEBRA: string = "https://zebra-lwd.zecwallet.co:9067";
  static V3_LIGHTWALLETD: string = "https://lwdv3.zecwallet.co:443";

  static isUnified(addr: string): boolean {
    if (!addr) return false;
    return addr.startsWith("u");
  }

  static isSapling(addr: string): boolean {
    if (!addr) return false;
    return new RegExp("^z[a-z0-9]{77}$").test(addr) || new RegExp("^ztestsapling[a-z0-9]{76}$").test(addr);
  }

  static isSprout(addr: string): boolean {
    if (!addr) return false;
    return new RegExp("^z[a-zA-Z0-9]{94}$").test(addr);
  }

  static isZaddr(addr: string): boolean {
    if (!addr) return false;
    return Utils.isSapling(addr) || Utils.isSprout(addr);
  }

  static isTransparent(addr: string): boolean {
    if (!addr) return false;
    return new RegExp("^t[a-zA-Z0-9]{34}$").test(addr);
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

    // if (typeof v === 'string' || v instanceof String) {
    //   v = parseFloat(v);
    // }

    return v.toFixed(8);
  }

  static maxPrecisionTrimmed(v: number): string {
    let s = Utils.maxPrecision(v);
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
      return { bigPart: zecValue, smallPart: "" };
    }

    let bigPart = Utils.maxPrecision(zecValue);
    let smallPart = "";

    if (bigPart.indexOf(".") >= 0) {
      const decimalPart = bigPart.substr(bigPart.indexOf(".") + 1);
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

  static getReeivers(r: string) {
    const receiversJSON = JSON.parse(r);
   
    let receivers = ["Orchard"];
    if(receiversJSON.transparent) receivers.push("Transparent");
    if(receiversJSON.sapling) receivers.push("Sapling");
    
    return receivers;
  }

  static splitStringIntoChunks(s: string, numChunks: number) {
    if (numChunks > s.length) return [s];
    if (s.length < 16) return [s];

    const chunkSize = Math.round(s.length / numChunks);
    const chunks = [];
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

  static getZecToUsdString(price: number | null, zecValue: number | null): string {
    if (!price || !zecValue) {
      return "USD --";
    }

    return `USD ${(price * zecValue).toFixed(2)}`;
  }

  static utf16Split(s: string, chunksize: number): string[] {
    const ans = [];

    let current = "";
    let currentLen = 0;
    const a = [...s];
    for (let i = 0; i < a.length; i++) {
      // Each UTF-16 char will take upto 4 bytes when encoded
      const utf8len = a[i].length > 1 ? 4 : 1;

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
}
