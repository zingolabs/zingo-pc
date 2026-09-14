import path from "path";
import { AddressBookEntryClass, ServerChainNameEnum, ZEC_SWAP_CHAIN } from "../appstate";
import Utils from "../../utils/utils";
import { extractZnsName, isZnsAlias, labelWithZnsAlias, resolveZnsAlias } from "../../utils/zns";
import type { ZnsResolveResult } from "../../utils/zns";
import { ipcRenderer, fs } from "../../electronBridge";

/** How long one ZNS lookup may take during the startup migration. */
const ZNS_MIGRATION_TIMEOUT_MS = 8000;

/** A resolution keyed by network and bare name, so `.zcash` and `.zec` meet. */
const znsKey = (chain: string | undefined, alias: string): string => `${chain ?? ""}:${extractZnsName(alias) ?? ""}`;

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
  /**
   * Resolve the ZNS aliases still stored as contact addresses.
   *
   * Contacts used to store the alias itself, and every screen that labels a
   * transaction looks the label up by address, so a transaction to the
   * address a contact's alias resolves to showed no name. This is the lookup
   * half of moving those contacts to the address; `migrateZnsAliases` is the
   * other.
   *
   * Each name is asked once, however many contacts use it, and all of them at
   * the same time, each bounded, so a slow or unreachable resolver costs the
   * migration a few seconds at most. A name that does not resolve is simply
   * absent from the result: its contact stays as it is and is tried again at
   * the next start.
   */
  static async resolveStoredZnsAliases(
    entries: AddressBookEntryClass[],
    resolve: (alias: string, chain: ServerChainNameEnum) => Promise<ZnsResolveResult> = resolveZnsAlias,
    timeoutMs: number = ZNS_MIGRATION_TIMEOUT_MS,
  ): Promise<Map<string, string>> {
    const pending = new Map<string, { alias: string; chain: ServerChainNameEnum }>();
    for (const entry of entries) {
      if (!entry.chain || (entry.swapChain ?? ZEC_SWAP_CHAIN) !== ZEC_SWAP_CHAIN || !isZnsAlias(entry.address)) {
        continue;
      }
      const key = znsKey(entry.chain, entry.address);
      if (!pending.has(key)) pending.set(key, { alias: entry.address, chain: entry.chain });
    }

    const resolved = new Map<string, string>();
    await Promise.all(
      [...pending].map(async ([key, { alias, chain }]) => {
        const timeout = new Promise<null>((done) => setTimeout(() => done(null), timeoutMs));
        try {
          const result = await Promise.race([resolve(alias, chain), timeout]);
          if (result && result.ok) resolved.set(key, result.address);
        } catch (err) {
          console.log(`address book: resolving ${alias} failed`, err);
        }
      }),
    );
    return resolved;
  }

  /**
   * Contacts stored as a ZNS alias, rewritten to the address the alias
   * resolved to, with the alias kept at the end of the label.
   *
   * A contact whose alias is missing from `resolved` is left as it is. When
   * the address is already another contact on the same network, the alias
   * contact is folded into that one, which takes the alias into its label,
   * rather than leaving two contacts with one address: labels are looked up
   * by address, and the book removes a contact by label.
   *
   * Pure, and idempotent: a second run finds no aliases and changes nothing.
   */
  static migrateZnsAliases(
    entries: AddressBookEntryClass[],
    resolved: Map<string, string>,
  ): { migrated: AddressBookEntryClass[]; changed: boolean } {
    const addressKey = (chain: string | undefined, address: string) => `${chain ?? ""}|${address}`;
    const target = (entry: AddressBookEntryClass): string | undefined =>
      (entry.swapChain ?? ZEC_SWAP_CHAIN) === ZEC_SWAP_CHAIN && isZnsAlias(entry.address)
        ? resolved.get(znsKey(entry.chain, entry.address))
        : undefined;

    // Aliases waiting for a contact that already holds their address, by that
    // contact's network and address.
    const existing = new Set(entries.filter((e) => !isZnsAlias(e.address)).map((e) => addressKey(e.chain, e.address)));
    const folded = new Map<string, string[]>();
    for (const entry of entries) {
      const address = target(entry);
      if (!address) continue;
      const key = addressKey(entry.chain, address);
      if (existing.has(key)) folded.set(key, [...(folded.get(key) ?? []), entry.address]);
    }

    let changed = false;
    const migrated: AddressBookEntryClass[] = [];
    const placed = new Map<string, AddressBookEntryClass>();
    for (const entry of entries) {
      const address = target(entry);
      if (!address) {
        const aliases = isZnsAlias(entry.address) ? [] : (folded.get(addressKey(entry.chain, entry.address)) ?? []);
        const label = aliases.reduce((acc, alias) => labelWithZnsAlias(acc, alias), entry.label);
        if (label !== entry.label) changed = true;
        const kept = new AddressBookEntryClass(label, entry.address, entry.chain, entry.swapChain);
        if (!isZnsAlias(entry.address)) placed.set(addressKey(entry.chain, entry.address), kept);
        migrated.push(kept);
        continue;
      }

      changed = true;
      const key = addressKey(entry.chain, address);
      if (existing.has(key)) continue; // folded into the contact that holds it
      const earlier = placed.get(key);
      if (earlier) {
        // Two aliases for one address: the first became the contact.
        earlier.label = labelWithZnsAlias(earlier.label, entry.address);
        continue;
      }
      const moved = new AddressBookEntryClass(
        labelWithZnsAlias(entry.label, entry.address),
        address,
        entry.chain,
        entry.swapChain,
      );
      placed.set(key, moved);
      migrated.push(moved);
    }
    return { migrated, changed };
  }

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
