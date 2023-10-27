import path from "path";
import { AddressBookEntry } from "../appstate";

const { remote } = window.require("electron");
const fs = window.require("fs");

// Utility class to save / read the address book.
export default class AddressbookImpl {
  static async getFileName(): Promise<string> {
    const dir: string = path.join(remote.app.getPath("appData"), "Zingo PC");
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir);
    }
    const fileName: string = path.join(dir, "AddressBook.json");

    return fileName;
  }

  // Write the address book to disk
  static async writeAddressBook(ab: AddressBookEntry[]): Promise<void> {
    const fileName: string = await this.getFileName();

    await fs.promises.writeFile(fileName, JSON.stringify(ab));
  }

  // Read the address book
  static async readAddressBook(): Promise<AddressBookEntry[]> {
    const fileName: string = await this.getFileName();

    try {
      return await JSON.parse((await fs.promises.readFile(fileName)).toString());
    } catch (err) {
      // File probably doesn't exist, so return nothing
      console.log('address book', err);
      return [] as AddressBookEntry[];
    }
  }
}
