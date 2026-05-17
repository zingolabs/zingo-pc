import path from "path";
import { AddressBookEntryClass, ServerChainNameEnum } from "../appstate";
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

  static addEntry(
    addressBook: AddressBookEntryClass[],
    label: string,
    address: string,
    chain: ServerChainNameEnum,
  ): AddressBookEntryClass[] {
    const updated = addressBook.concat(new AddressBookEntryClass(label, address, chain));
    AddressbookImpl.writeAddressBook(updated);
    return updated;
  }

  static removeEntry(addressBook: AddressBookEntryClass[], label: string): AddressBookEntryClass[] {
    const updated = addressBook.filter((i) => i.label !== label);
    AddressbookImpl.writeAddressBook(updated);
    return updated;
  }

  // One-shot back-fill of the `chain` field for entries written by older app
  // versions (or imported via the DMG→MAS / Import flows from a pre-tag file).
  // For real addresses we parse them to detect the network deterministically;
  // for ZNS aliases (`*.zcash`) we can't tell from the alias alone, so we
  // default to mainnet — the user can edit it later if needed.
  static async migrateChainIfMissing(
    entries: AddressBookEntryClass[],
  ): Promise<{ migrated: AddressBookEntryClass[]; changed: boolean }> {
    let changed = false;
    const migrated: AddressBookEntryClass[] = [];
    for (const entry of entries) {
      if (entry.chain) {
        migrated.push(entry);
        continue;
      }
      changed = true;
      let detected: ServerChainNameEnum | null = null;
      if (isZnsAlias(entry.address)) {
        detected = ServerChainNameEnum.mainChainName;
      } else {
        detected = await Utils.detectAddressChain(entry.address);
      }
      migrated.push(
        new AddressBookEntryClass(entry.label, entry.address, detected ?? ServerChainNameEnum.mainChainName),
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
