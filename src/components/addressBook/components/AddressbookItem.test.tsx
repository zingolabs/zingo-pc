import React from "react";
import { Accordion } from "react-accessible-accordion";
import { render, screen, fireEvent } from "../../../test-utils";
import AddressBookItem from "./AddressbookItem";
import { AddressBookEntryClass, ServerChainNameEnum } from "../../appstate";

jest.mock("../../../electronBridge");

const item = new AddressBookEntryClass(
  "Alice",
  "u1fakeaddress0000000000000000000000000000",
  ServerChainNameEnum.mainChainName,
);

// "Send To" is only shown when the active wallet is on the same network as the
// entry — provide a mainnet wallet override so the button is reachable.
const mainnetWallet = { chain_name: ServerChainNameEnum.mainChainName } as never;

const baseProps = {
  item,
  removeAddressBookEntry: jest.fn(),
};

// react-accessible-accordion requires an Accordion wrapper
const renderInAccordion = (ui: React.ReactElement, opts?: Parameters<typeof render>[1]) =>
  render(<Accordion>{ui}</Accordion>, opts);

describe("AddressbookItem", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the label", () => {
    renderInAccordion(<AddressBookItem {...baseProps} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  // The address leads the entry now, and in full: reading it used to cost a
  // click to expand a value that fits on the line.
  it("shows the whole address, labelled", () => {
    renderInAccordion(<AddressBookItem {...baseProps} />);
    expect(screen.getByText("Address")).toBeInTheDocument();
    expect(screen.getByText(item.address)).toBeInTheDocument();
  });

  it("shows Send To and Delete buttons when expanded (not readOnly)", async () => {
    renderInAccordion(<AddressBookItem {...baseProps} />, {
      contextOverrides: { currentWallet: mainnetWallet },
    });
    // click the accordion heading to expand
    fireEvent.click(screen.getByText("Alice"));
    expect(screen.getByRole("button", { name: /send to/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("hides Send To button when readOnly", () => {
    renderInAccordion(<AddressBookItem {...baseProps} />, {
      contextOverrides: { readOnly: true, currentWallet: mainnetWallet },
    });
    fireEvent.click(screen.getByText("Alice"));
    expect(screen.queryByRole("button", { name: /send to/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("hides Send To button when the active wallet is on a different network", () => {
    const testnetWallet = { chain_name: ServerChainNameEnum.testChainName } as never;
    renderInAccordion(<AddressBookItem {...baseProps} />, {
      contextOverrides: { currentWallet: testnetWallet },
    });
    fireEvent.click(screen.getByText("Alice"));
    expect(screen.queryByRole("button", { name: /send to/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("calls removeAddressBookEntry when Delete is clicked", () => {
    const removeAddressBookEntry = jest.fn();
    renderInAccordion(<AddressBookItem {...baseProps} removeAddressBookEntry={removeAddressBookEntry} />);
    fireEvent.click(screen.getByText("Alice"));
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(removeAddressBookEntry).toHaveBeenCalledWith("Alice");
  });

  // Which chain an address is on is the first thing that matters now that the
  // book holds more than Zcash, so every entry says it.
  it("names the chain", () => {
    renderInAccordion(<AddressBookItem {...baseProps} />);
    expect(screen.getByText("Chain")).toBeInTheDocument();
    expect(screen.getByText("Zcash")).toBeInTheDocument();
  });

  // The Zcash network is only ambiguous while contacts from every network sit
  // in one list, which is the only time it is named.
  it("names the network too while every network is shown", () => {
    renderInAccordion(<AddressBookItem {...baseProps} showChain={true} />);
    expect(screen.getByText(/Zcash — Mainnet/)).toBeInTheDocument();
  });

  it("names a testnet entry's network", () => {
    const tItem = new AddressBookEntryClass("Bob", "u1other", ServerChainNameEnum.testChainName);
    renderInAccordion(<AddressBookItem item={tItem} removeAddressBookEntry={jest.fn()} showChain={true} />);
    expect(screen.getByText(/Zcash — Testnet/)).toBeInTheDocument();
  });

  it("leaves the network out when only one network is shown", () => {
    renderInAccordion(<AddressBookItem {...baseProps} />);
    expect(screen.queryByText(/Mainnet/)).not.toBeInTheDocument();
  });

  it("copies the address", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipboard } = require("../../../electronBridge");
    renderInAccordion(<AddressBookItem {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Address" }));
    expect(clipboard.writeText).toHaveBeenCalledWith(item.address);
  });

  // The copy control sits inside the accordion's own header button. Without
  // the click being stopped there, copying an address would also fold away the
  // entry it came from.
  it("does not open the entry when the address is copied", () => {
    renderInAccordion(<AddressBookItem {...baseProps} />, {
      contextOverrides: { currentWallet: mainnetWallet },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy Address" }));
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("displays ZNS aliases verbatim (no trimming)", () => {
    const znsItem = new AddressBookEntryClass("Alias", "pepe.zcash", ServerChainNameEnum.mainChainName);
    renderInAccordion(<AddressBookItem item={znsItem} removeAddressBookEntry={jest.fn()} />);
    expect(screen.getByText("pepe.zcash")).toBeInTheDocument();
  });

  it("Send To navigates to /send with setSendTo", () => {
    const setSendTo = jest.fn();
    renderInAccordion(<AddressBookItem {...baseProps} />, {
      contextOverrides: { currentWallet: mainnetWallet, setSendTo },
    });
    fireEvent.click(screen.getByText("Alice"));
    fireEvent.click(screen.getByRole("button", { name: /send to/i }));
    expect(setSendTo).toHaveBeenCalled();
  });
});
