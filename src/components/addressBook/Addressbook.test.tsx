import React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

// The chains that swap with ZEC; null (the default) judges none, as before a
// swap service is up.
let mockRoutableChains: Set<string> | null = null;
jest.mock("../../context/ContextSwapService", () => ({
  useSwapService: () => (mockRoutableChains ? { routableChains: async () => mockRoutableChains } : null),
}));

// The scan dialog stands in as a button that "scans" whatever the test sets.
let mockScanned = "";
jest.mock("../common/ScanQrModal", () => ({
  __esModule: true,
  default: (props: { onScanned: (text: string) => void }) => (
    <button type="button" onClick={() => props.onScanned(mockScanned)}>
      fake scan
    </button>
  ),
}));
let mockParseTargets: (text: string) => Promise<any> = async (text) => text;
jest.mock("../../utils/uris", () => ({
  parseZcashURITargets: (text: string) => mockParseTargets(text),
}));

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
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /label/i }), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
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

  // History labels a transaction by address, and an alias never matched one.
  it("replaces a ZNS alias with the address it resolves to, and proposes the alias as the label", async () => {
    mockResolveImpl = async () => ({ ok: true, address: "u1resolved" });
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    const addAddressBookEntry = jest.fn();
    render(<AddressBook {...baseProps} addAddressBookEntry={addAddressBookEntry} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "Pepe.zec" } });

    await waitFor(() => expect(screen.getByRole("textbox", { name: /address/i })).toHaveValue("u1resolved"));
    expect(screen.getByRole("textbox", { name: /label/i })).toHaveValue("pepe.zec");
    await waitFor(() => expect(screen.getByRole("button", { name: /^add$/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(addAddressBookEntry).toHaveBeenCalledWith(
      "pepe.zec",
      "u1resolved",
      ServerChainNameEnum.mainChainName,
      "ZEC",
    );
  });

  it("keeps a label already typed when a ZNS alias resolves", async () => {
    mockResolveImpl = async () => ({ ok: true, address: "u1resolved" });
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /label/i }), { target: { value: "Pepe" } });
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "pepe.zec" } });

    await waitFor(() => expect(screen.getByRole("textbox", { name: /address/i })).toHaveValue("u1resolved"));
    expect(screen.getByRole("textbox", { name: /label/i })).toHaveValue("Pepe");
  });

  it("refuses a ZNS alias whose address is already a contact", async () => {
    mockResolveImpl = async () => ({ ok: true, address: "u1resolved" });
    const existing = new AddressBookEntryClass("Pepe", "u1resolved", ServerChainNameEnum.mainChainName, "ZEC");
    render(<AddressBook {...baseProps} />, { contextOverrides: { addressBook: [existing] } });
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "pepe.zec" } });
    expect(await screen.findByText(/Duplicate Address/i)).toBeInTheDocument();
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

  // The filter shares the column titles row, and those are drawn only when
  // something is listed. It has to outlive them: a wallet whose current
  // network has no contacts is exactly the one whose contacts are all on the
  // other network, and this is the only way to reach them.
  it("offers the network filter even when nothing is listed", () => {
    const other = new AddressBookEntryClass("Tester", "u1test", ServerChainNameEnum.testChainName);
    render(<AddressBook {...baseProps} />, {
      contextOverrides: { addressBook: [other] },
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

    // An address is evidence of its own chain, so typing one moves the
    // selection off the Zcash default rather than leaving a contradiction.
    it("moves the selection to the chain the address belongs to", async () => {
      mockPossibleChains = ["BTC"];
      render(<AddressBook {...baseProps} />);
      expect(screen.getByRole("button", { name: /^chain$/i })).toHaveTextContent("Zcash");

      fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "bc1qxyz" } });
      await waitFor(() => expect(screen.getByRole("button", { name: /^chain$/i })).toHaveTextContent("Bitcoin"));
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

      const chainField = await screen.findByRole("button", { name: /^chain$/i });
      await waitFor(() => expect(chainField).not.toBeDisabled());
      fireEvent.click(chainField);
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

describe("AddressBook chain field", () => {
  // The badge answers "which chain" before the label is read, and the chevron
  // is what says the field is a choice rather than something the form worked
  // out and is telling you.
  // The field is part of the form, not a conclusion the form reaches: it is
  // there from the first paint, set to Zcash, and says it can be changed.
  it("is present and changeable on an untouched form", () => {
    render(<AddressBook {...baseProps} />);

    const field = screen.getByRole("button", { name: /^chain$/i });
    expect(field).toHaveTextContent("Zcash");
    expect(field).not.toBeDisabled();
    expect(within(field).getByTestId("chain-badge")).toBeInTheDocument();
    expect(within(field).getByTestId("chain-caret")).toBeInTheDocument();
  });
});

describe("AddressBook validation ticks", () => {
  // An empty field has no error, which is not the same as being right. The
  // tick used to greet an untouched form claiming both fields were good.
  it("shows nothing on either field before anything is typed", () => {
    render(<AddressBook {...baseProps} />);
    expect(screen.queryByTestId("label-valid")).not.toBeInTheDocument();
    expect(screen.queryByTestId("address-valid")).not.toBeInTheDocument();
  });

  it("ticks each field once it holds something valid", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    render(<AddressBook {...baseProps} />);

    fireEvent.change(screen.getByRole("textbox", { name: /label/i }), { target: { value: "Alice" } });
    expect(await screen.findByTestId("label-valid")).toBeInTheDocument();
    expect(screen.queryByTestId("address-valid")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "u1valid" } });
    expect(await screen.findByTestId("address-valid")).toBeInTheDocument();
  });

  it("shows the error rather than a tick when the content is wrong", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue("");
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "garbage" } });

    expect(await screen.findByText("Invalid Address")).toBeInTheDocument();
    expect(screen.queryByTestId("address-valid")).not.toBeInTheDocument();
  });
});

describe("AddressBook — scanning a QR code", () => {
  const scan = async (text: string) => {
    mockScanned = text;
    fireEvent.click(screen.getByRole("button", { name: "Scan a QR code" }));
    fireEvent.click(screen.getByRole("button", { name: "fake scan" }));
    await waitFor(() => expect(mockParseTargets).toBeDefined());
  };

  it("fills the address from a code carrying a plain address", async () => {
    mockParseTargets = async (text) => text;
    render(<AddressBook {...baseProps} />);
    await scan("u1scanned");
    await waitFor(() => expect(screen.getByRole("textbox", { name: /address/i })).toHaveValue("u1scanned"));
  });

  // A contact is an address and a name; nothing else a request carries fits.
  it("takes only the address from a payment request, not its label", async () => {
    mockParseTargets = async () => [{ address: "u1shop", amount: 1, label: "Coffee Shop", memoString: "hi" }];
    render(<AddressBook {...baseProps} />);
    await scan("zcash:u1shop?amount=1&label=Coffee%20Shop");
    await waitFor(() => expect(screen.getByRole("textbox", { name: /address/i })).toHaveValue("u1shop"));
    expect(screen.getByRole("textbox", { name: /label/i })).toHaveValue("");
  });

  // Every EVM chain shares one address format: the URI's chain id settles it.
  it("reads another asset's code and picks the chain its URI names", async () => {
    mockParseTargets = async () => "Error: Invalid URI or protocol";
    mockPossibleChains = ["ETH", "BASE", "ARB"];
    render(<AddressBook {...baseProps} />);
    await scan("ethereum:0x1111111111111111111111111111111111111111@8453?value=1");
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /address/i })).toHaveValue(
        "0x1111111111111111111111111111111111111111",
      ),
    );
    await waitFor(() => expect(screen.getByRole("button", { name: /^chain$/i })).toHaveTextContent("Base"));
  });

  it("reads a bare address of another asset and leaves the chain to detection", async () => {
    mockParseTargets = async () => "Error: Invalid URI or protocol";
    mockPossibleChains = ["BTC"];
    render(<AddressBook {...baseProps} />);
    await scan("bc1qscanned");
    await waitFor(() => expect(screen.getByRole("textbox", { name: /address/i })).toHaveValue("bc1qscanned"));
    await waitFor(() => expect(screen.getByRole("button", { name: /^chain$/i })).toHaveTextContent("Bitcoin"));
  });

  it("takes the first address of a request naming several, and says so", async () => {
    mockParseTargets = async () => [
      { address: "u1first", amount: 1 },
      { address: "u1second", amount: 2 },
      { address: "u1third", amount: 3 },
    ];
    render(<AddressBook {...baseProps} />);
    await scan("zcash:?address=u1first&amount=1&address.1=u1second&amount.1=2&address.2=u1third&amount.2=3");
    await waitFor(() => expect(screen.getByRole("textbox", { name: /address/i })).toHaveValue("u1first"));
    expect(screen.getByText("That request names 3 recipients; only the first address was taken.")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "u1typed" } });
    expect(screen.queryByText(/only the first address was taken/)).not.toBeInTheDocument();
  });
});

describe("AddressBook — search", () => {
  const entries = [
    new AddressBookEntryClass("Alice", "u1alice0000000000000000", ServerChainNameEnum.mainChainName),
    new AddressBookEntryClass("Bob", "u1bob000000000000000000", ServerChainNameEnum.mainChainName),
  ];

  it("narrows the list by any part of a name or an address", () => {
    render(<AddressBook {...baseProps} />, { contextOverrides: { addressBook: entries } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search contacts" }), { target: { value: "ali" } });
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search contacts" }), { target: { value: "u1bob" } });
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("says so when nothing matches", () => {
    render(<AddressBook {...baseProps} />, { contextOverrides: { addressBook: entries } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search contacts" }), { target: { value: "zzz" } });
    expect(screen.getByText("No contacts match that.")).toBeInTheDocument();
  });
});

describe("AddressBook — chains that do not swap with ZEC", () => {
  afterEach(() => {
    mockRoutableChains = null;
  });

  // A contact is for sending ZEC or swapping with it; Polkadot routes neither.
  it("refuses a typed address only such a chain accepts, naming it", async () => {
    mockRoutableChains = new Set(["ZEC", "BTC", "ETH"]);
    mockPossibleChains = ["DOT"];
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "1polkadotaddr" } });
    expect(
      await screen.findByText(
        "That is a Polkadot address. Zingo cannot swap it with ZEC, so it cannot be saved as a contact.",
      ),
    ).toBeInTheDocument();
  });

  // An EVM address fits many chains; only the ones that route ZEC are offered.
  it("offers only the chains that swap with ZEC", async () => {
    mockRoutableChains = new Set(["ZEC", "BASE"]);
    mockPossibleChains = ["ETH", "BASE", "CRO"];
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), {
      target: { value: "0x1111111111111111111111111111111111111111" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /^chain$/i })).toHaveTextContent("Base"));
  });

  it("refuses a scanned Monero code, naming the chain", async () => {
    mockRoutableChains = new Set(["ZEC", "BTC"]);
    mockPossibleChains = ["XMR"];
    mockParseTargets = async () => "Error: Invalid URI or protocol";
    render(<AddressBook {...baseProps} />);
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "4monero" } });
    expect(await screen.findByText(/That is a Monero address/)).toBeInTheDocument();
  });
});
