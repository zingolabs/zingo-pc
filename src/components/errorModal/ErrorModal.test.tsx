import React from "react";
import { render, screen, fireEvent } from "../../test-utils";
import ErrorModal from "./ErrorModal";
import { ErrorModalClass } from "../appstate";

beforeAll(() => {
  const div = document.createElement("div");
  div.setAttribute("id", "root");
  document.body.appendChild(div);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-modal").setAppElement("#root");
});

const openModal = new ErrorModalClass();
openModal.title = "Something went wrong";
openModal.body = "Please try again later.";
openModal.modalIsOpen = true;

describe("ErrorModal", () => {
  it("renders the title when open", () => {
    render(<ErrorModal closeModal={jest.fn()} />, {
      contextOverrides: { errorModal: openModal },
    });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders the body when open", () => {
    render(<ErrorModal closeModal={jest.fn()} />, {
      contextOverrides: { errorModal: openModal },
    });
    expect(screen.getByText("Please try again later.")).toBeInTheDocument();
  });

  it("calls closeModal when Close button is clicked", () => {
    const closeModal = jest.fn();
    render(<ErrorModal closeModal={closeModal} />, {
      contextOverrides: { errorModal: openModal },
    });
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  it("does not render content when closed", () => {
    const closed = new ErrorModalClass();
    closed.modalIsOpen = false;
    render(<ErrorModal closeModal={jest.fn()} />, {
      contextOverrides: { errorModal: closed },
    });
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });
});
