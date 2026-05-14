import React from "react";
import { render, screen } from "../../../test-utils";
import SendConfirmModalToAddr from "./SendConfirmModalToAddr";
import { InfoClass, ToAddrClass } from "../../appstate";

jest.mock("../../../electronBridge");

const makeToAddr = (overrides: Partial<ToAddrClass> = {}): ToAddrClass =>
  Object.assign(new ToAddrClass(), {
    to: "u1fakeaddress",
    amount: 1,
    memo: "",
    memoReplyTo: "",
    ...overrides,
  });

const info = Object.assign(new InfoClass(), { currencyName: "ZEC", zecPrice: 100 });

describe("SendConfirmModalToAddr", () => {
  it("renders without crashing", () => {
    render(<SendConfirmModalToAddr toaddr={makeToAddr()} info={info} />);
  });

  it("shows the destination address when shorter than 80 chars", () => {
    render(<SendConfirmModalToAddr toaddr={makeToAddr({ to: "u1short" })} info={info} />);
    expect(screen.getByText("u1short")).toBeInTheDocument();
  });

  it("splits a long address into chunks", () => {
    const longAddr = "u1" + "a".repeat(79);
    render(<SendConfirmModalToAddr toaddr={makeToAddr({ to: longAddr })} info={info} />);
    // splitStringIntoChunks(addr, 3) produces 3 divs — none equals the full address
    expect(screen.queryByText(longAddr)).not.toBeInTheDocument();
  });

  it("shows the combined memo", () => {
    render(<SendConfirmModalToAddr toaddr={makeToAddr({ memo: "Hello", memoReplyTo: " World" })} info={info} />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("shows USD value for ZEC currency", () => {
    render(<SendConfirmModalToAddr toaddr={makeToAddr({ amount: 1 })} info={info} />);
    // getZecToUsdString(100, 1) = "USD 100.00"
    expect(screen.getByText(/USD 100\.00/)).toBeInTheDocument();
  });

  it("hides USD value for non-ZEC currency", () => {
    const tazInfo = Object.assign(new InfoClass(), { currencyName: "TAZ", zecPrice: 0 });
    render(<SendConfirmModalToAddr toaddr={makeToAddr({ amount: 1 })} info={tazInfo} />);
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });
});
