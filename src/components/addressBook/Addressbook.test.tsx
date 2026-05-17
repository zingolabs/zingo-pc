import React from "react";
import { render, screen, fireEvent } from "../../test-utils";
import AddressBook from "./Addressbook";
import { AddressBookEntryClass, ServerChainNameEnum } from "../appstate";

jest.mock("../../electronBridge");

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
});
