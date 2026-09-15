import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test-utils";
import PaymentRequestModal from "./PaymentRequestModal";

jest.mock("../../../electronBridge");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { clipboard } = require("../../../electronBridge");

const UA = "u1requestaddress00000000000000000000";

const renderModal = (props: Partial<React.ComponentProps<typeof PaymentRequestModal>> = {}) =>
  render(
    <PaymentRequestModal
      address={UA}
      allowsMemo={true}
      currencyName="ZEC"
      modalIsOpen={true}
      closeModal={jest.fn()}
      {...props}
    />,
  );

const type = (name: RegExp, value: string) =>
  fireEvent.change(screen.getByRole("textbox", { name }), { target: { value } });

beforeEach(() => jest.clearAllMocks());

describe("PaymentRequestModal", () => {
  it("asks for the amount in ZEC and a memo", () => {
    renderModal();
    expect(screen.getByText("Amount (ZEC)")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /memo/i })).toBeInTheDocument();
  });

  it("shows the QR and copies the whole request link once generated", () => {
    renderModal();
    type(/amount/i, "1.50");
    type(/memo/i, "Invoice 42");
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(screen.getByRole("button", { name: /download qr code/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy request link" }));
    expect(clipboard.writeText).toHaveBeenCalledWith(`zcash:${UA}?amount=1.5&memo=SW52b2ljZSA0Mg`);
  });

  it("generates nothing for an amount it cannot use, and says why", () => {
    renderModal();
    type(/amount/i, "0");
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    expect(screen.getByText("The amount must be above zero")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download qr code/i })).not.toBeInTheDocument();
  });

  // The code on the right must never show a request the fields no longer say.
  it("drops the generated request when a field changes", () => {
    renderModal();
    type(/amount/i, "1");
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    type(/amount/i, "2");

    expect(screen.queryByRole("button", { name: /download qr code/i })).not.toBeInTheDocument();
  });

  // ZIP 321 forbids a memo on a transparent address.
  it("offers no memo for a transparent address", () => {
    renderModal({ address: "t1requestaddress", allowsMemo: false });
    expect(screen.queryByRole("textbox", { name: /memo/i })).not.toBeInTheDocument();
    expect(screen.getByText(/transparent address cannot receive a memo/i)).toBeInTheDocument();

    type(/amount/i, "3");
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy request link" }));
    expect(clipboard.writeText).toHaveBeenCalledWith("zcash:t1requestaddress?amount=3");
  });
});
