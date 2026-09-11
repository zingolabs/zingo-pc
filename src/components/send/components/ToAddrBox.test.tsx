import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../../test-utils";
import ToAddrBox from "./ToAddrBox";
import { ToAddrClass, ServerChainNameEnum, AddressBookEntryClass } from "../../appstate";

jest.mock("../../../electronBridge");

// Provide a controllable ZNS resolver — `mock` prefix avoids jest hoist restriction.
let mockResolveImpl: (
  alias: string,
  chain: string,
) => Promise<
  { ok: true; address: string } | { ok: false; reason: "not-found" | "network" | "unsupported-chain" | "invalid-name" }
> = async () => ({ ok: false, reason: "not-found" });
jest.mock("../../../utils/zns", () => {
  const actual = jest.requireActual("../../../utils/zns");
  return {
    ...actual,
    resolveZnsAlias: (alias: string, chain: string) => mockResolveImpl(alias, chain),
  };
});

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => {
  const actual = jest.requireActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { native, shell } = require("../../../electronBridge");

beforeEach(() => {
  mockResolveImpl = async () => ({ ok: false, reason: "not-found" });
  mockNavigate.mockReset();
  (shell.openExternal as jest.Mock).mockReset();
  (native.parse_address as jest.Mock).mockReset();
});

const makeProps = (overrides: Partial<React.ComponentProps<typeof ToAddrBox>> = {}) => {
  const toaddr = new ToAddrClass();
  return {
    toaddr,
    zecPrice: 100,
    updateToField: jest.fn(),
    updateZnsAlias: jest.fn(),
    fromAmount: 10,
    fromAmountDefault: 10,
    setSendButtonEnabled: jest.fn(),
    setMaxAmount: jest.fn(),
    sendFee: 0.0001,
    sendFeeError: "",
    fetchSendFeeAndErrorAndSpendable: jest.fn().mockResolvedValue(undefined),
    setSendFee: jest.fn(),
    setSendFeeError: jest.fn(),
    setTotalAmountAvailable: jest.fn(),
    serverChainName: ServerChainNameEnum.mainChainName,
    block: 1_000_000,
    currencyName: "ZEC",
    addAddressBookEntry: jest.fn(),
    ...overrides,
  };
};

describe("ToAddrBox", () => {
  it("renders without crashing", () => {
    render(<ToAddrBox {...makeProps()} />);
  });

  it("renders the recipient address, amount, fee and memo inputs", () => {
    render(<ToAddrBox {...makeProps()} />);
    expect(screen.getByRole("textbox", { name: /recipient address/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /amount/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /transaction fee/i })).toBeInTheDocument();
  });

  it("calls updateToField when the recipient address is typed", () => {
    const updateToField = jest.fn();
    render(<ToAddrBox {...makeProps({ updateToField })} />);
    const addressInput = screen.getByRole("textbox", { name: /recipient address/i });
    fireEvent.change(addressInput, { target: { value: "uregtest1abc" } });
    expect(updateToField).toHaveBeenCalledWith("uregtest1abc", null, null);
  });

  it("calls updateToField when the amount changes", () => {
    const updateToField = jest.fn();
    render(<ToAddrBox {...makeProps({ updateToField })} />);
    const amountInput = screen.getByRole("spinbutton", { name: /amount/i });
    fireEvent.change(amountInput, { target: { value: "1.5" } });
    expect(updateToField).toHaveBeenCalledWith(null, "1.5", null);
  });

  it("calls setMaxAmount with fromAmount when the max button is clicked", () => {
    const setMaxAmount = jest.fn();
    render(<ToAddrBox {...makeProps({ setMaxAmount, fromAmount: 7.25 })} />);
    fireEvent.click(screen.getByRole("button", { name: /set maximum amount/i }));
    expect(setMaxAmount).toHaveBeenCalledWith(7.25);
  });

  it("renders the fee input as disabled (fee is computed, not user-entered)", () => {
    render(<ToAddrBox {...makeProps()} />);
    expect(screen.getByRole("spinbutton", { name: /transaction fee/i })).toBeDisabled();
  });

  it("shows memo when the address is sapling or unified", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1abc" });
    render(<ToAddrBox {...makeProps({ toaddr })} />);
    await waitFor(() => {
      // The Memo textarea is rendered when not disabled. We can check that the
      // "memos only..." copy is NOT shown.
      expect(screen.queryByText(/Memos only for Unified or Sapling addresses/i)).not.toBeInTheDocument();
    });
  });

  it("shows 'memos only for sapling/unified' when address is transparent", async () => {
    const toaddr = Object.assign(new ToAddrClass(), { to: "" });
    render(<ToAddrBox {...makeProps({ toaddr })} />);
    // Empty address → addressKind undefined → isMemoDisabled true → message visible
    // (after the addressKind useEffect resolves).
    expect(await screen.findByText(/Memos only for Unified or Sapling addresses/i)).toBeInTheDocument();
  });

  it("displays 'Resolving ZNS…' while a *.zcash alias is being resolved", async () => {
    let releaseResolve: (v: any) => void = () => {};
    mockResolveImpl = () => new Promise((res) => (releaseResolve = res));
    const toaddr = Object.assign(new ToAddrClass(), { to: "" });
    render(<ToAddrBox {...makeProps({ toaddr })} />);
    const addressInput = screen.getByRole("textbox", { name: /recipient address/i });
    fireEvent.change(addressInput, { target: { value: "alice.zcash" } });
    await waitFor(() => {
      expect(screen.getByText(/Resolving ZNS/i)).toBeInTheDocument();
    });
    releaseResolve({ ok: false, reason: "not-found" });
  });

  it("shows the 'ZNS name not found' error", async () => {
    mockResolveImpl = async () => ({ ok: false, reason: "not-found" });
    const toaddr = Object.assign(new ToAddrClass(), { to: "" });
    render(<ToAddrBox {...makeProps({ toaddr })} />);
    const addressInput = screen.getByRole("textbox", { name: /recipient address/i });
    fireEvent.change(addressInput, { target: { value: "ghost.zcash" } });
    await new Promise((r) => setTimeout(r, 600));
    await waitFor(() => {
      expect(screen.getByText(/ZNS name not found/i)).toBeInTheDocument();
    });
  });

  it("shows the 'ZNS lookup failed' network error", async () => {
    mockResolveImpl = async () => ({ ok: false, reason: "network" });
    const toaddr = Object.assign(new ToAddrClass(), { to: "" });
    render(<ToAddrBox {...makeProps({ toaddr })} />);
    const addressInput = screen.getByRole("textbox", { name: /recipient address/i });
    fireEvent.change(addressInput, { target: { value: "down.zcash" } });
    await new Promise((r) => setTimeout(r, 600));
    await waitFor(() => {
      expect(screen.getByText(/ZNS lookup failed/i)).toBeInTheDocument();
    });
  });

  it("renders the ZNS badge after a successful resolve", async () => {
    mockResolveImpl = async () => ({ ok: true, address: "u1resolved" });
    const updateToField = jest.fn();
    const updateZnsAlias = jest.fn();
    const toaddr = Object.assign(new ToAddrClass(), { to: "" });
    render(<ToAddrBox {...makeProps({ toaddr, updateToField, updateZnsAlias })} />);
    const addressInput = screen.getByRole("textbox", { name: /recipient address/i });
    fireEvent.change(addressInput, { target: { value: "alice.zcash" } });
    await new Promise((r) => setTimeout(r, 600));
    await waitFor(() => {
      expect(screen.getByText(/ZNS: alice\.zcash/)).toBeInTheDocument();
    });
    expect(updateToField).toHaveBeenCalledWith("u1resolved", null, null);
    expect(updateZnsAlias).toHaveBeenCalledWith("alice.zcash");
  });

  it("opens zcashnames.com explorer when the external-link button is clicked (mainnet)", async () => {
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1resolved", znsAlias: "alice.zcash" });
    render(<ToAddrBox {...makeProps({ toaddr })} />);
    fireEvent.click(screen.getByLabelText(/View on zcashnames\.com/i));
    expect(shell.openExternal).toHaveBeenCalledWith("https://www.zcashnames.com/explorer?name=alice");
  });

  it("opens the testnet explorer with env=testnet", async () => {
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1resolved", znsAlias: "alice.zcash" });
    render(<ToAddrBox {...makeProps({ toaddr, serverChainName: ServerChainNameEnum.testChainName })} />);
    fireEvent.click(screen.getByLabelText(/View on zcashnames\.com/i));
    expect(shell.openExternal).toHaveBeenCalledWith("https://www.zcashnames.com/explorer?name=alice&env=testnet");
  });

  it("clears a ZNS alias through the same button that clears an address", async () => {
    const updateZnsAlias = jest.fn();
    const updateToField = jest.fn();
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1resolved", znsAlias: "alice.zcash" });
    render(<ToAddrBox {...makeProps({ toaddr, updateZnsAlias, updateToField })} />);
    fireEvent.click(screen.getByLabelText(/Clear recipient/i));
    expect(updateZnsAlias).toHaveBeenCalledWith("");
    expect(updateToField).toHaveBeenCalledWith("", null, null);
  });

  // The alias is stored, not the address it resolves to, so the contact
  // re-resolves every time it is used.
  it("saves a ZNS alias under the name given, without leaving the screen", async () => {
    const addAddressBookEntry = jest.fn();
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1resolved", znsAlias: "alice.zcash" });
    render(<ToAddrBox {...makeProps({ toaddr, addAddressBookEntry })} />);

    fireEvent.click(screen.getByLabelText(/Save as contact/i));
    fireEvent.change(await screen.findByRole("textbox", { name: /name/i }), { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(addAddressBookEntry).toHaveBeenCalledWith("Alice", "alice.zcash", ServerChainNameEnum.mainChainName, "ZEC");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("renders 'Contact & ZNS: ...' when the alias already matches an existing contact", async () => {
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1resolved", znsAlias: "alice.zcash" });
    const ab = new AddressBookEntryClass("Alice ZNS", "alice.zcash");
    ab.chain = ServerChainNameEnum.mainChainName;
    render(<ToAddrBox {...makeProps({ toaddr })} />, { contextOverrides: { addressBook: [ab] } });
    expect(screen.getByText(/Contact & ZNS: alice\.zcash/)).toBeInTheDocument();
  });

  it("shows 'Contact: <label>' when address matches an address-book entry", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1someaddr" });
    const ab = new AddressBookEntryClass("Bob", "u1someaddr");
    ab.chain = ServerChainNameEnum.mainChainName;
    render(<ToAddrBox {...makeProps({ toaddr })} />, { contextOverrides: { addressBook: [ab] } });
    await waitFor(() => {
      expect(screen.getByText("Contact: Bob")).toBeInTheDocument();
    });
  });

  it("filters address-book contacts by chain (no match when chain differs)", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1someaddr" });
    const ab = new AddressBookEntryClass("BobOnTest", "u1someaddr");
    ab.chain = ServerChainNameEnum.testChainName;
    render(<ToAddrBox {...makeProps({ toaddr })} />, { contextOverrides: { addressBook: [ab] } });
    expect(screen.queryByText("Contact: BobOnTest")).not.toBeInTheDocument();
  });

  it("clears the 'Contact' badge when the X button is clicked", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    const updateToField = jest.fn();
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1someaddr" });
    const ab = new AddressBookEntryClass("Bob", "u1someaddr");
    ab.chain = ServerChainNameEnum.mainChainName;
    render(<ToAddrBox {...makeProps({ toaddr, updateToField })} />, { contextOverrides: { addressBook: [ab] } });
    fireEvent.click(screen.getByLabelText(/Clear recipient/i));
    expect(updateToField).toHaveBeenCalledWith("", null, null);
  });

  it("shows error label when amount is too small", async () => {
    // Negative amounts both trigger "Amount cannot be negative" and
    // "Amount is too small" — the latter wins because it's the last branch.
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1abc", amount: -1 });
    render(<ToAddrBox {...makeProps({ toaddr })} />);
    await waitFor(() => {
      expect(screen.getByText(/Amount is too small/)).toBeInTheDocument();
    });
  });

  it("shows error label when amount exceeds balance", async () => {
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1abc", amount: 100 });
    render(<ToAddrBox {...makeProps({ toaddr, fromAmount: 1 })} />);
    await waitFor(() => {
      expect(screen.getByText(/Amount Exceeds Balance/)).toBeInTheDocument();
    });
  });

  it("shows error label when amount has too many decimals", async () => {
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1abc", amount: 0.123456789 });
    render(<ToAddrBox {...makeProps({ toaddr })} />);
    await waitFor(() => {
      expect(screen.getByText(/Too Many Decimals/)).toBeInTheDocument();
    });
  });

  it("shows memo error when memo exceeds 511 chars", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1abc", memo: "x".repeat(512) });
    render(<ToAddrBox {...makeProps({ toaddr })} />);
    await waitFor(() => {
      expect(screen.getByText(/Memo is too long/)).toBeInTheDocument();
    });
  });

  it("shows 'Invalid Address' when parse_address returns nothing for a non-alias", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue("");
    const toaddr = Object.assign(new ToAddrClass(), { to: "garbage" });
    render(<ToAddrBox {...makeProps({ toaddr })} />);
    await waitFor(() => {
      expect(screen.getByText(/Invalid Address/)).toBeInTheDocument();
    });
  });

  it("renders a Save-Contact button for a valid pasted address not yet in the book", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1neverseen" });
    render(<ToAddrBox {...makeProps({ toaddr })} />);
    await waitFor(() => {
      expect(screen.getByLabelText(/Save as contact/i)).toBeInTheDocument();
    });
  });
});

describe("ToAddrBox recipient actions", () => {
  // The three actions live inside the field now, the way the swap screen's
  // address field carries them, rather than as loose buttons above it.
  it("offers the contact list from inside the field", () => {
    const entry = new AddressBookEntryClass("Alice", "u1saved", ServerChainNameEnum.mainChainName);
    render(<ToAddrBox {...makeProps()} />, { contextOverrides: { addressBook: [entry] } });
    expect(screen.getByRole("button", { name: /choose from contacts/i })).toBeInTheDocument();
  });

  // It used to appear only while the field was empty, which is the one moment
  // a user who has just pasted the wrong address cannot reach for it.
  it("keeps the contact list reachable once something is typed", () => {
    const entry = new AddressBookEntryClass("Alice", "u1saved", ServerChainNameEnum.mainChainName);
    render(<ToAddrBox {...makeProps()} />, { contextOverrides: { addressBook: [entry] } });
    fireEvent.change(screen.getByRole("textbox", { name: /recipient address/i }), { target: { value: "u1typed" } });
    expect(screen.getByRole("button", { name: /choose from contacts/i })).toBeInTheDocument();
  });

  it("offers no clear button while the field is empty", () => {
    render(<ToAddrBox {...makeProps()} />);
    expect(screen.queryByRole("button", { name: /clear recipient/i })).not.toBeInTheDocument();
  });

  // An address already filed under a name has nothing to save, and the name is
  // shown beside the label instead.
  it("does not offer to save an address that is already a contact", async () => {
    (native.parse_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ status: "success", address_kind: "unified", chain_name: "main" }),
    );
    const entry = new AddressBookEntryClass("Alice", "u1saved", ServerChainNameEnum.mainChainName);
    const toaddr = Object.assign(new ToAddrClass(), { to: "u1saved" });
    render(<ToAddrBox {...makeProps({ toaddr })} />, { contextOverrides: { addressBook: [entry] } });

    expect(await screen.findByText(/Contact: Alice/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save as contact/i })).not.toBeInTheDocument();
  });
});
