import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import AddressBook from "./Addressbook";
import { AddressBookEntryClass, ServerChainNameEnum } from "../appstate";

jest.mock("../../electronBridge");

// Provide a controllable ZNS resolver — `mock` prefix avoids jest hoist restriction.
let mockResolveImpl: (alias: string, chain: string) => Promise<any> = async () =>
  ({ ok: false, reason: "not-found" });
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
    const entry = new AddressBookEntryClass(
      "Bob",
      "u1existing",
      ServerChainNameEnum.mainChainName,
    );
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
    render(
      <AddressBook addAddressBookEntry={addAddressBookEntry} removeAddressBookEntry={jest.fn()} />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /label/i }), { target: { value: "Alice" } });
    fireEvent.change(screen.getByRole("textbox", { name: /address/i }), { target: { value: "u1valid" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /^add$/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(addAddressBookEntry).toHaveBeenCalledWith("Alice", "u1valid", ServerChainNameEnum.mainChainName);
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
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Show contacts from all networks/i));
    });
    expect(screen.getByText("Tester")).toBeInTheDocument();
  });
});
