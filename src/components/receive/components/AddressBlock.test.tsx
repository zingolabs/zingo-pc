import React from "react";
import { Accordion } from "react-accessible-accordion";
import { render, screen, fireEvent } from "../../../test-utils";
import AddressBlock from "./AddressBlock";
import { UnifiedAddressClass, TransparentAddressClass } from "../../appstate";
import { AddressScopeEnum } from "../../appstate/enums/AddressScopeEnum";

jest.mock("../../../electronBridge");

// RPC.createNewAddress* calls native — mock the whole rpc module
jest.mock("../../../rpc/rpc", () => ({
  __esModule: true,
  default: {
    createNewAddressUnified: jest.fn().mockResolvedValue("u1newaddr"),
    createNewAddressTransparent: jest.fn().mockResolvedValue("t1newaddr"),
  },
}));

const uAddr = new UnifiedAddressClass(0, 0, "u1shortaddr000000000000000", true, false, false);
const tAddr = new TransparentAddressClass(0, 0, AddressScopeEnum.external, "t1shortaddr");

const baseProps = {
  currencyName: "ZEC",
  calculateShieldFee: jest.fn().mockResolvedValue(0.001),
  handleShieldButton: jest.fn(),
};

const renderInAccordion = (ui: React.ReactElement, opts?: Parameters<typeof render>[1]) =>
  render(<Accordion>{ui}</Accordion>, opts);

describe("AddressBlock — Unified", () => {
  it("renders the address in the accordion header", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />);
    expect(screen.getByText("u1shortaddr000000000000000")).toBeInTheDocument();
  });

  it("shows 'Copy Address' button when expanded", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />);
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    expect(screen.getByRole("button", { name: /copy address/i })).toBeInTheDocument();
  });

  it("shows 'New Address' button when expanded", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />);
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    expect(screen.getByRole("button", { name: /new address/i })).toBeInTheDocument();
  });

  it("shows 'Address type' label for unified addresses", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />);
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    expect(screen.getByText(/address type/i)).toBeInTheDocument();
  });

  it("shows the optional label when provided", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" label="My savings" />);
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    expect(screen.getByText("My savings")).toBeInTheDocument();
  });
});

describe("AddressBlock — Transparent", () => {
  it("renders the transparent address in the header", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={tAddr} type="t" />);
    expect(screen.getByText("t1shortaddr")).toBeInTheDocument();
  });

  it("shows 'Address type: Transparent' when expanded", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={tAddr} type="t" />);
    fireEvent.click(screen.getByText("t1shortaddr"));
    expect(screen.getByText("Address type: Transparent")).toBeInTheDocument();
  });

  it("shows 'Download QR code' button when expanded", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={tAddr} type="t" />);
    fireEvent.click(screen.getByText("t1shortaddr"));
    expect(screen.getByRole("button", { name: /download qr code/i })).toBeInTheDocument();
  });
});
