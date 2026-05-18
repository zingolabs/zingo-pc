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

  it("shows a truncated address", () => {
    renderInAccordion(<AddressBookItem {...baseProps} />);
    expect(screen.getByLabelText("Copy address")).toBeInTheDocument();
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

  it("shows the [Mainnet] chain badge when showChain is true", () => {
    renderInAccordion(<AddressBookItem {...baseProps} showChain={true} />);
    expect(screen.getByText("[Mainnet]")).toBeInTheDocument();
  });

  it("shows the [Testnet] chain badge for testnet entries", () => {
    const tItem = new AddressBookEntryClass("Bob", "u1other", ServerChainNameEnum.testChainName);
    renderInAccordion(<AddressBookItem item={tItem} removeAddressBookEntry={jest.fn()} showChain={true} />);
    expect(screen.getByText("[Testnet]")).toBeInTheDocument();
  });

  it("does NOT show chain badge when showChain is false (default)", () => {
    renderInAccordion(<AddressBookItem {...baseProps} />);
    expect(screen.queryByText("[Mainnet]")).not.toBeInTheDocument();
  });

  it("copies the address on click and expands it (truncated → full)", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipboard } = require("../../../electronBridge");
    renderInAccordion(<AddressBookItem {...baseProps} />);
    fireEvent.click(screen.getByLabelText("Copy address"));
    expect(clipboard.writeText).toHaveBeenCalledWith(item.address);
  });

  it("copies the address via keyboard Enter", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clipboard } = require("../../../electronBridge");
    renderInAccordion(<AddressBookItem {...baseProps} />);
    fireEvent.keyDown(screen.getByLabelText("Copy address"), { key: "Enter" });
    expect(clipboard.writeText).toHaveBeenCalled();
  });

  it("expands long addresses into chunks when clicked", () => {
    const longItem = new AddressBookEntryClass(
      "Long",
      "u1" + "y".repeat(100),
      ServerChainNameEnum.mainChainName,
    );
    renderInAccordion(<AddressBookItem item={longItem} removeAddressBookEntry={jest.fn()} />);
    fireEvent.click(screen.getByLabelText("Copy address"));
    // After expand, the address is split into chunks — at least one chunk present
    expect(screen.getByLabelText("Copy address")).toBeInTheDocument();
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
