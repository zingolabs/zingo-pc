import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import AddressBook from "./Addressbook";
import { AddressBookEntryClass, ServerChainNameEnum } from "../appstate";

jest.mock("../../electronBridge");

// Provide a controllable ZNS resolver — `mock` prefix avoids jest hoist restriction.
let mockResolveImpl: (alias: string, chain: string) => Promise<any> = async () => ({ ok: false, reason: "not-found" });
// The swap helpers reach the native address parser once per chain, which is far
// more than these tests are about — stubbed so a case can state which chains it
// wants considered.
let mockPossibleChains: string[] = ["ZEC"];
let mockChainValid = true;
jest.mock("../../swap", () => {
  const actual = jest.requireActual("../../swap");
  return {
    ...actual,
    possibleChainsForAddress: async () => mockPossibleChains,
    validateAddressForChain: async () => mockChainValid,
  };
});

jest.mock("../../utils/zns", () => {
  const actual = jest.requireActual("../../utils/zns");
  return {
    ...actual,
    resolveZnsAlias: (alias: string, chain: string) => mockResolveImpl(alias, chain),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { native } = require("../../electronBridge");

beforeEach(() => {
  mockResolveImpl = async () => ({ ok: false, reason: "not-found" });
  mockPossibleChains = ["ZEC"];
  mockChainValid = true;
  (native.parse_address as jest.Mock).mockReset();
});

const baseProps = {
  addAddressBookEntry: jest.fn(),
  removeAddressBookEntry: jest.fn(),
};

describe("AddressBook", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the 'Address Book' heading", () => {
    render(<AddressBook {...baseProps} />);
    expect(screen.getByText("Address Book")).toBeInTheDocument();
  });

  it("shows Label and Address inputs", () => {
    render(<AddressBook {...baseProps} />);
    expect(screen.getByRole("textbox", { name: /label/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /address/i })).toBeInTheDocument();
  });

  it("renders existing address book entries", () => {
    const entry = new AddressBookEntryClass(
      "Alice",
      "u1fakeaddr000000000000000000000",
      ServerChainNameEnum.mainChainName,
    );
    render(<AddressBook {...baseProps} />, {
      contextOverrides: { addressBook: [entry] },
    });
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("shows a duplicate label error when label already exists", async () => {
    const entry = new AddressBookEntryClass(
      "Alice",
      "u1fakeaddr000000000000000000000",
      ServerChainNameEnum.mainChainName,
    );
    render(<AddressBook {...baseProps} />, {
      contextOverrides: { addressBook: [entry] },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /label/i }), { target: { value: "Alice" } });
    const error = await screen.findByText("Duplicate Label");
    expect(error).toBeInTheDocument();
  });

  it("shows a label too long error", async () => {
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /label/i }), {
      target: { value: "a".repeat(21) },
    });
    expect(await screen.findByText("Label is too long")).toBeInTheDocument();
  });

  it("shows 'Invalid Address' when address is unrecognized", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue("");
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "garbage" } });
    expect(await screen.findByText("Invalid Address")).toBeInTheDocument();
  });

  it("recognizes a unified address and shows 'Unified' tag", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "u1validaddr" } });
    expect(await screen.findByText("Unified")).toBeInTheDocument();
  });

  it("recognizes a sapling address and shows 'Sapling' tag", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "sapling", chain_name: "main" }),
    );
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "zs1valid" } });
    expect(await screen.findByText("Sapling")).toBeInTheDocument();
  });

  it("recognizes a transparent address and shows 'Transparent' tag", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "transparent", chain_name: "main" }),
    );
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "t1valid" } });
    expect(await screen.findByText("Transparent")).toBeInTheDocument();
  });

  it("recognizes a TEX address and shows 'TEX' tag", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "tex", chain_name: "main" }),
    );
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "texvalid" } });
    expect(await screen.findByText("TEX")).toBeInTheDocument();
  });

  it("shows a Duplicate Address error", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    const entry = new AddressBookEntryClass("Bob", "u1existing", ServerChainNameEnum.mainChainName);
    render(<AddressBook {...baseProps} />, { contextOverrides: { addressBook: [entry] } });
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "u1existing" } });
    expect(await screen.findByText("Duplicate Address")).toBeInTheDocument();
  });

  it("clears the form when Clear is clicked", async () => {
    const setAddLabel = jest.fn();
    render(<AddressBook {...baseProps} />, { contextOverrides: { setAddLabel } });
    fireEvent.change(screen.getByRole("textbox", { name: /label/i }), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(setAddLabel).toHaveBeenCalled();
    expect((screen.getByRole("textbox", { name: /label/i }) as HTMLInputElement).value).toBe("");
  });

  it("calls addAddressBookEntry on Add click with valid data", async () => {
    const addAddressBookEntry = jest.fn();
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    render(<AddressBook addAddressBookEntry={addAddressBookEntry} removeAddressBookEntry={jest.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: /label/i }), { target: { value: "Alice" } });
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "u1valid" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /^add$/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    // The fourth argument is the asset chain. A Zcash address saved here is a
    // ZEC contact, which is what every entry was before the book held more.
    expect(addAddressBookEntry).toHaveBeenCalledWith("Alice", "u1valid", ServerChainNameEnum.mainChainName, "ZEC");
  });

  it("recognizes a ZNS alias as valid and shows the 'ZNS' tag", async () => {
    mockResolveImpl = async () => ({ ok: true, address: "u1resolved" });
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "alice.zcash" } });
    expect(await screen.findByText("ZNS")).toBeInTheDocument();
  });

  it("shows 'ZNS name not found' when alias does not resolve", async () => {
    mockResolveImpl = async () => ({ ok: false, reason: "not-found" });
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "ghost.zcash" } });
    expect(await screen.findByText("ZNS name not found")).toBeInTheDocument();
  });

  it("shows 'ZNS lookup failed' when network fails", async () => {
    mockResolveImpl = async () => ({ ok: false, reason: "network" });
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "down.zcash" } });
    expect(await screen.findByText("ZNS lookup failed")).toBeInTheDocument();
  });

  it("shows 'ZNS is not available on this network' when chain is unsupported", async () => {
    mockResolveImpl = async () => ({ ok: false, reason: "unsupported-chain" });
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "alice.zcash" } });
    expect(await screen.findByText("ZNS is not available on this network")).toBeInTheDocument();
  });

  it("filters entries by current chain by default", () => {
    const main = new AddressBookEntryClass("Alice", "u1main", ServerChainNameEnum.mainChainName);
    const test = new AddressBookEntryClass("Tester", "u1test", ServerChainNameEnum.testChainName);
    render(<AddressBook {...baseProps} />, {
      contextOverrides: { addressBook: [main, test] },
    });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Tester")).not.toBeInTheDocument();
  });

  it("shows entries from all networks when 'Show contacts from all networks' is checked", async () => {
    const main = new AddressBookEntryClass("Alice", "u1main", ServerChainNameEnum.mainChainName);
    const test = new AddressBookEntryClass("Tester", "u1test", ServerChainNameEnum.testChainName);
    render(<AddressBook {...baseProps} />, {
      contextOverrides: { addressBook: [main, test] },
    });
    expect(screen.queryByText("Tester")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Show contacts from all networks/i));
    expect(screen.getByText("Tester")).toBeInTheDocument();
  });

  // The address book held Zcash and nothing else until now. These cover the
  // part that changed: an address on another chain, which the Zcash parser
  // would refuse outright.
  describe("non-Zcash contacts", () => {
    // Adding a non-ZEC contact asks for confirmation first. Cases about what ends
    // up saved take the confirmation as given; the one below is about the
    // confirmation itself.
    const autoConfirm = () => jest.fn((_title: string, _body: string | JSX.Element, action: () => void) => action());

    it("offers a chain picker only when the address leaves the chain in doubt", async () => {
      mockPossibleChains = ["BTC"];
      render(<AddressBook {...baseProps} />);
      fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "bc1qxyz" } });
      // A single candidate is not a question worth asking.
      await waitFor(() => expect(screen.queryByRole("button", { name: /^chain$/i })).not.toBeInTheDocument());

      mockPossibleChains = ["BTC", "LTC"];
      fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "bc1qambiguous" } });
      expect(await screen.findByRole("button", { name: /^chain$/i })).toBeInTheDocument();
    });

    // The field opens the same kind of list the swap screen picks assets from,
    // rather than a native select that shows one line and no badge.
    it("takes the chain from the picker it opens", async () => {
      mockPossibleChains = ["BTC", "LTC"];
      const addAddressBookEntry = jest.fn();
      render(<AddressBook addAddressBookEntry={addAddressBookEntry} removeAddressBookEntry={jest.fn()} />, {
        contextOverrides: { openConfirmModal: autoConfirm() },
      });
      fireEvent.change(screen.getByRole("textbox", { name: /label/i }), { target: { value: "Bob" } });
      fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "bc1qambiguous" } });

      fireEvent.click(await screen.findByRole("button", { name: /^chain$/i }));
      fireEvent.click(await screen.findByRole("button", { name: /litecoin/i }));

      await waitFor(() => expect(screen.getByRole("button", { name: /^add$/i })).not.toBeDisabled());
      fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
      expect(addAddressBookEntry).toHaveBeenCalledWith(
        "Bob",
        "bc1qambiguous",
        ServerChainNameEnum.mainChainName,
        "LTC",
      );
    });

    it("saves the asset chain alongside the Zcash network", async () => {
      mockPossibleChains = ["BTC"];
      const addAddressBookEntry = jest.fn();
      render(<AddressBook addAddressBookEntry={addAddressBookEntry} removeAddressBookEntry={jest.fn()} />, {
        contextOverrides: { openConfirmModal: autoConfirm() },
      });
      fireEvent.change(screen.getByRole("textbox", { name: /label/i }), { target: { value: "Bob" } });
      fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "bc1qxyz" } });
      await waitFor(() => expect(screen.getByRole("button", { name: /^add$/i })).not.toBeDisabled());
      fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
      expect(addAddressBookEntry).toHaveBeenCalledWith("Bob", "bc1qxyz", ServerChainNameEnum.mainChainName, "BTC");
    });

    it("refuses an address that is not valid for its chain", async () => {
      mockPossibleChains = ["BTC"];
      mockChainValid = false;
      render(<AddressBook {...baseProps} />);
      fireEvent.change(screen.getByRole("textbox", { name: /label/i }), { target: { value: "Bob" } });
      fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "not-bitcoin" } });
      expect(await screen.findByText(/not a valid bitcoin address/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^add$/i })).toBeDisabled();
    });

    // Shape-only recognition can name a plausible but wrong chain, and a contact
    // filed under the wrong one becomes a swap sent to the wrong network.
    it("saves nothing until the detected chain is confirmed", async () => {
      mockPossibleChains = ["BTC"];
      const addAddressBookEntry = jest.fn();
      const openConfirmModal = jest.fn();
      render(<AddressBook addAddressBookEntry={addAddressBookEntry} removeAddressBookEntry={jest.fn()} />, {
        contextOverrides: { openConfirmModal },
      });
      fireEvent.change(screen.getByRole("textbox", { name: /label/i }), { target: { value: "Bob" } });
      fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "bc1qxyz" } });
      await waitFor(() => expect(screen.getByRole("button", { name: /^add$/i })).not.toBeDisabled());
      fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

      expect(addAddressBookEntry).not.toHaveBeenCalled();
      // The dialog names the chain it detected, which is the thing being checked.
      expect(openConfirmModal).toHaveBeenCalledWith(
        "Add contact",
        expect.stringContaining("Bitcoin"),
        expect.any(Function),
      );

      // Confirming is what commits it.
      openConfirmModal.mock.calls[0][2]();
      expect(addAddressBookEntry).toHaveBeenCalledWith("Bob", "bc1qxyz", ServerChainNameEnum.mainChainName, "BTC");
    });

    // The two chains answer different questions, and only one of them applies
    // to a Bitcoin address. Filing it under the wallet's current network would
    // tag it with a Zcash network it has nothing to do with.
    it("files a non-Zcash contact under mainnet even from a testnet wallet", async () => {
      mockPossibleChains = ["BTC"];
      const addAddressBookEntry = jest.fn();
      render(<AddressBook addAddressBookEntry={addAddressBookEntry} removeAddressBookEntry={jest.fn()} />, {
        contextOverrides: {
          currentWallet: { chain_name: ServerChainNameEnum.testChainName } as never,
          openConfirmModal: autoConfirm(),
        },
      });
      fireEvent.change(screen.getByRole("textbox", { name: /label/i }), { target: { value: "Bob" } });
      fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "bc1qxyz" } });
      await waitFor(() => expect(screen.getByRole("button", { name: /^add$/i })).not.toBeDisabled());
      fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
      expect(addAddressBookEntry).toHaveBeenCalledWith("Bob", "bc1qxyz", ServerChainNameEnum.mainChainName, "BTC");
    });

    // The network filter is about Zcash networks; a Bitcoin contact has none of
    // ours to belong to, so hiding it on testnet would lose it for no reason.
    it("keeps a non-Zcash contact visible whatever network the wallet is on", () => {
      const btc = new AddressBookEntryClass("Bob", "bc1qxyz", ServerChainNameEnum.mainChainName, "BTC");
      const zecTest = new AddressBookEntryClass("Tester", "u1test", ServerChainNameEnum.testChainName);
      render(<AddressBook {...baseProps} />, { contextOverrides: { addressBook: [btc, zecTest] } });
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.queryByText("Tester")).not.toBeInTheDocument();
    });
  });
});
