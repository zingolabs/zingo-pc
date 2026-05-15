import React from "react";
import { render, screen, fireEvent } from "../../test-utils";
import ConfirmModal from "./ConfirmModal";
import { ConfirmModalClass } from "../appstate";

beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

const makeOpenModal = (runAction: () => void = jest.fn()): ConfirmModalClass => {
  const m = new ConfirmModalClass();
  m.title = "Delete wallet?";
  m.body = "This action cannot be undone.";
  m.modalIsOpen = true;
  m.runAction = runAction;
  return m;
};

describe("ConfirmModal", () => {
  it("renders the title when open", () => {
    render(<ConfirmModal closeModal={jest.fn()} />, {
      contextOverrides: { confirmModal: makeOpenModal() },
    });
    expect(screen.getByText("Delete wallet?")).toBeInTheDocument();
  });

  it("renders the body when open", () => {
    render(<ConfirmModal closeModal={jest.fn()} />, {
      contextOverrides: { confirmModal: makeOpenModal() },
    });
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
  });

  it("calls closeModal when Cancel is clicked", () => {
    const closeModal = jest.fn();
    render(<ConfirmModal closeModal={closeModal} />, {
      contextOverrides: { confirmModal: makeOpenModal() },
    });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  it("calls runAction and closeModal when Confirm is clicked", () => {
    const runAction = jest.fn();
    const closeModal = jest.fn();
    render(<ConfirmModal closeModal={closeModal} />, {
      contextOverrides: { confirmModal: makeOpenModal(runAction) },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(runAction).toHaveBeenCalledTimes(1);
    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  it("does not render content when closed", () => {
    const closed = new ConfirmModalClass();
    closed.modalIsOpen = false;
    render(<ConfirmModal closeModal={jest.fn()} />, {
      contextOverrides: { confirmModal: closed },
    });
    expect(screen.queryByText("Delete wallet?")).not.toBeInTheDocument();
  });
});
