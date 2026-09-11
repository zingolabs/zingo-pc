import path from "path";
import { AddressBookEntryClass, ServerChainNameEnum, ZEC_SWAP_CHAIN } from "../appstate";
import Utils from "../../utils/utils";
import { isZnsAlias } from "../../utils/zns";

import { ipcRenderer, fs } from "../../electronBridge";

// Utility class to save / read the address book.
export default class AddressbookImpl {
  static async getFileName(): Promise<string> {
    const relativePath: string = await ipcRenderer.invoke("get-app-data-path");
    const dir: string = path.join(relativePath, "Zingo PC");
    if (!(await fs.existsSync(dir))) {
      await fs.promises.mkdir(dir);
    }
    const fileName: string = path.join(dir, "AddressBook.json");

    return fileName;
  }

  // Write the address book to disk
  static async writeAddressBook(ab: AddressBookEntryClass[]): Promise<void> {
    const fileName: string = await this.getFileName();

    await fs.promises.writeFile(fileName, JSON.stringify(ab));
  }

  // `swapChain` defaults to ZEC so the Address Book screen, which only ever
  // stores Zcash addresses, keeps calling this unchanged. The swap screen
  // passes the counterparty chain to save a Bitcoin or Ethereum contact.
  static addEntry(
    addressBook: AddressBookEntryClass[],
    label: string,
    address: string,
    chain: ServerChainNameEnum,
    swapChain: string = ZEC_SWAP_CHAIN,
  ): AddressBookEntryClass[] {
    const updated = addressBook.concat(new AddressBookEntryClass(label, address, chain, swapChain));
    AddressbookImpl.writeAddressBook(updated);
    return updated;
  }

  static removeEntry(addressBook: AddressBookEntryClass[], label: string): AddressBookEntryClass[] {
    const updated = addressBook.filter((i) => i.label !== label);
    AddressbookImpl.writeAddressBook(updated);
    return updated;
  }

  // One-shot back-fill of the `chain` and `swapChain` fields for entries
  // written by older app versions (or imported via the DMG→MAS / Import flows
  // from a pre-tag file). For real addresses we parse them to detect the
  // network deterministically; for ZNS aliases (`*.zcash`) we can't tell from
  // the alias alone, so we default to mainnet — the user can edit it later if
  // needed.
  //
  // `swapChain` is always 'ZEC' here: every entry that predates the field was
  // written when the address book held nothing but Zcash addresses.
  static async migrateChainIfMissing(
    entries: AddressBookEntryClass[],
  ): Promise<{ migrated: AddressBookEntryClass[]; changed: boolean }> {
    let changed = false;
    const migrated: AddressBookEntryClass[] = [];
    for (const entry of entries) {
      if (entry.chain && entry.swapChain) {
        migrated.push(entry);
        continue;
      }
      changed = true;
      // A non-ZEC contact always arrives with both fields set, so anything
      // missing either one is a Zcash entry from before the split.
      let detected: ServerChainNameEnum | null = entry.chain ?? null;
      if (!detected) {
        detected = isZnsAlias(entry.address)
          ? ServerChainNameEnum.mainChainName
          : await Utils.detectAddressChain(entry.address);
      }
      migrated.push(
        new AddressBookEntryClass(
          entry.label,
          entry.address,
          detected ?? ServerChainNameEnum.mainChainName,
          entry.swapChain ?? ZEC_SWAP_CHAIN,
        ),
      );
    }
    return { migrated, changed };
  }

  // Read the address book
  static async readAddressBook(): Promise<AddressBookEntryClass[]> {
    const fileName: string = await this.getFileName();

    if (!(await fs.existsSync(fileName))) {
      return [] as AddressBookEntryClass[];
    }

    try {
      const raw = JSON.parse(await fs.promises.readFile(fileName));
      if (!Array.isArray(raw)) return [];
      const { migrated, changed } = await AddressbookImpl.migrateChainIfMissing(raw);
      if (changed) {
        // Persist the back-filled entries so the migration runs only once.
        try {
          await AddressbookImpl.writeAddressBook(migrated);
        } catch (err) {
          console.error("address book migration write failed", err);
        }
      }
      return migrated;
    } catch (err) {
      console.log("address book", err);
      return [] as AddressBookEntryClass[];
    }
  }
}
