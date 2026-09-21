import React from "react";
import { render, screen, fireEvent } from "../../../test-utils";
import PayURIModal from "./PayURIModal";

beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

const baseProps = {
  modalIsOpen: true,
  modalInput: "",
  setModalInput: jest.fn(),
  closeModal: jest.fn(),
  modalTitle: "Pay URI",
  actionButtonName: "Pay URI",
  actionCallback: jest.fn(),
};

describe("PayURIModal", () => {
  // A title, a field and two buttons said nothing about what goes in the field.
  it("says what to paste and what will happen with it", () => {
    render(<PayURIModal {...baseProps} modalTitle="Pay URI" actionButtonName="Pay" />);
    expect(screen.getByText(/Paste a payment request/)).toBeInTheDocument();
    expect(screen.getByText(/fills the Send form/)).toBeInTheDocument();
    expect(screen.getByText(/review it there/)).toBeInTheDocument();
  });

  it("explains nothing to a watch-only wallet, which cannot pay", () => {
    render(<PayURIModal {...baseProps} modalTitle="Pay URI" actionButtonName="Pay" />, {
      contextOverrides: { readOnly: true },
    });
    expect(screen.queryByText(/Paste a payment request/)).not.toBeInTheDocument();
    expect(screen.getByText(/only-watch wallet/)).toBeInTheDocument();
  });

  beforeEach(() => jest.clearAllMocks());

  it("renders the title", () => {
    render(<PayURIModal {...baseProps} modalTitle="Scan Payment URI" actionButtonName="Pay" />);
    expect(screen.getByText("Scan Payment URI")).toBeInTheDocument();
  });

  it("shows the URI input when not readOnly", () => {
    render(<PayURIModal {...baseProps} />);
    expect(screen.getByRole("textbox", { name: /payment uri/i })).toBeInTheDocument();
  });

  it("calls closeModal when Cancel is clicked", () => {
    const closeModal = jest.fn();
    render(<PayURIModal {...baseProps} closeModal={closeModal} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  it("shows read-only message instead of input when readOnly", () => {
    render(<PayURIModal {...baseProps} />, { contextOverrides: { readOnly: true } });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText(/only-watch wallet/i)).toBeInTheDocument();
  });

  it("hides action button when readOnly", () => {
    render(<PayURIModal {...baseProps} />, { contextOverrides: { readOnly: true } });
    expect(screen.queryByRole("button", { name: /pay uri/i })).not.toBeInTheDocument();
  });

  it("calls actionCallback and closeModal when action button is clicked with input", () => {
    const actionCallback = jest.fn();
    const closeModal = jest.fn();
    render(
      <PayURIModal {...baseProps} modalInput="zcash:t1abc" actionCallback={actionCallback} closeModal={closeModal} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /pay uri/i }));
    expect(actionCallback).toHaveBeenCalledWith("zcash:t1abc");
    expect(closeModal).toHaveBeenCalledTimes(1);
  });
});
