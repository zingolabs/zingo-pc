import path from "path";
import { AddressBookEntryClass } from "../appstate";

import { ipcRenderer, fs } from "../../electronBridge";

// Utility class to save / read the address book.
export default class AddressbookImpl {
  static async getFileName(): Promise<string> {
    const relativePath: string = await ipcRenderer.invoke("get-app-data-path");
    const dir: string = path.join(relativePath, "Zingo PC");
    if (!dir.startsWith(relativePath)) {
      throw new Error("Invalid app data path");
    }
    if (!fs.existsSync(dir)) {
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

  static addEntry(addressBook: AddressBookEntryClass[], label: string, address: string): AddressBookEntryClass[] {
    const updated = addressBook.concat(new AddressBookEntryClass(label, address));
    AddressbookImpl.writeAddressBook(updated);
    return updated;
  }

  static removeEntry(addressBook: AddressBookEntryClass[], label: string): AddressBookEntryClass[] {
    const updated = addressBook.filter((i) => i.label !== label);
    AddressbookImpl.writeAddressBook(updated);
    return updated;
  }

  // Read the address book
  static async readAddressBook(): Promise<AddressBookEntryClass[]> {
    const fileName: string = await this.getFileName();

    try {
      return await JSON.parse(await fs.promises.readFile(fileName));
    } catch (err) {
      // File probably doesn't exist, so return nothing
      console.log("address book", err);
      return [] as AddressBookEntryClass[];
    }
  }
}
