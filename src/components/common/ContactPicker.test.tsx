import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { render } from "../../test-utils";
import ContactPicker from "./ContactPicker";
import { AddressBookEntryClass } from "../appstate";

jest.mock("../../electronBridge");

const contacts = [new AddressBookEntryClass("Alice", "u1alice000"), new AddressBookEntryClass("Bob", "u1bob000")];

const renderPicker = (onSelect = jest.fn()) =>
  render(
    <ContactPicker
      contacts={contacts}
      chainLabel="Zcash"
      modalIsOpen={true}
      closeModal={jest.fn()}
      onSelect={onSelect}
    />,
  );

describe("ContactPicker", () => {
  // With many contacts the list alone is impossible to use.
  it("narrows the contacts by any part of a name or an address", () => {
    renderPicker();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search contacts" }), { target: { value: "u1bo" } });
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("picks a contact found by searching", () => {
    const onSelect = jest.fn();
    renderPicker(onSelect);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search contacts" }), { target: { value: "ali" } });
    fireEvent.click(screen.getByText("Alice"));
    expect(onSelect).toHaveBeenCalledWith("u1alice000");
  });

  it("says so when nothing matches", () => {
    renderPicker();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search contacts" }), { target: { value: "zzz" } });
    expect(screen.getByText("No contacts match that.")).toBeInTheDocument();
  });
});
