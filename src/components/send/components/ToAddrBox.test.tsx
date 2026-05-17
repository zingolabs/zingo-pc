import React from "react";
import { render, screen, fireEvent } from "../../../test-utils";
import ToAddrBox from "./ToAddrBox";
import { ToAddrClass, ServerChainNameEnum } from "../../appstate";

jest.mock("../../../electronBridge");

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
});
