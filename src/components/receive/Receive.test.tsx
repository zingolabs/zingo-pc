import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import {
  AddressBookEntryClass,
  TotalBalanceClass,
  TransparentAddressClass,
  UnifiedAddressClass,
  ValueTransferClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
  ServerChainNameEnum,
} from "../appstate";
import { AddressScopeEnum } from "../appstate/enums/AddressScopeEnum";

jest.mock("../../electronBridge");
jest.mock("../../rpc/rpc", () => ({ __esModule: true, default: {} }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Receive = require("./Receive").default;

const makeUAddr = (addr: string, idx = 0) => new UnifiedAddressClass(0, idx, addr, true, true, false);
const makeTAddr = (addr: string, idx = 0) => new TransparentAddressClass(0, idx, AddressScopeEnum.external, addr);
const makeInternalTAddr = (addr: string, idx = 0) =>
  new TransparentAddressClass(0, idx, AddressScopeEnum.internal, addr);
const makeBalance = (overrides: Partial<TotalBalanceClass> = {}) => Object.assign(new TotalBalanceClass(), overrides);

describe("Receive", () => {
  it("renders without crashing", () => {
    render(<Receive />);
  });

  it("renders Unified and Transparent tabs", () => {
    render(<Receive />);
    expect(screen.getByRole("tab", { name: /unified/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /transparent/i })).toBeInTheDocument();
  });

  it("hides Unified tab when both orchard and sapling pools are disabled", () => {
    render(<Receive />, {
      contextOverrides: { orchardPool: false, saplingPool: false },
    });
    expect(screen.queryByRole("tab", { name: /unified/i })).not.toBeInTheDocument();
  });

  it("hides Transparent tab when transparent pool is disabled", () => {
    render(<Receive />, {
      contextOverrides: { transparentPool: false },
    });
    expect(screen.queryByRole("tab", { name: /transparent/i })).not.toBeInTheDocument();
  });

  it("renders unified addresses in the Unified tab", () => {
    const u1 = makeUAddr("u1mainaddr0000000000000000");
    render(<Receive />, {
      contextOverrides: { addressesUnified: [u1] },
    });
    expect(screen.getByText("u1mainaddr0000000000000000")).toBeInTheDocument();
  });

  it("renders only external transparent addresses (filters out internal/change)", () => {
    const ext = makeTAddr("t1ext0000000");
    const int = makeInternalTAddr("t1int0000000");
    render(<Receive />, {
      contextOverrides: { addressesTransparent: [ext, int] },
    });
    fireEvent.click(screen.getByRole("tab", { name: /transparent/i }));
    expect(screen.getByText("t1ext0000000")).toBeInTheDocument();
    expect(screen.queryByText("t1int0000000")).not.toBeInTheDocument();
  });

  it("shows pending warning when there are unconfirmed transfers", () => {
    const pending = new ValueTransferClass(
      ValueTransferKindEnum.sent,
      1,
      100,
      ValueTransferStatusEnum.confirmed,
      "txp",
      0,
      0.1,
      "addrp",
    );
    render(<Receive />, { contextOverrides: { valueTransfers: [pending] } });
    expect(screen.getByText(/Some transactions are pending/)).toBeInTheDocument();
  });

  it("shows the Shield button when conditions are met and invokes handler", async () => {
    const calculateShieldFee = jest.fn().mockResolvedValue(0.0001);
    const handleShieldButton = jest.fn();
    render(<Receive />, {
      contextOverrides: {
        totalBalance: makeBalance({ confirmedTransparentBalance: 1 }),
        calculateShieldFee,
        handleShieldButton,
      },
    });
    await waitFor(() => expect(calculateShieldFee).toHaveBeenCalled());
    const btn = await screen.findByRole("button", { name: /Shield Transparent Balance/ });
    fireEvent.click(btn);
    expect(handleShieldButton).toHaveBeenCalled();
  });

  it("does NOT compute shield fee when readOnly is true", () => {
    const calculateShieldFee = jest.fn().mockResolvedValue(0.0001);
    render(<Receive />, {
      contextOverrides: {
        totalBalance: makeBalance({ confirmedTransparentBalance: 1 }),
        calculateShieldFee,
        readOnly: true,
      },
    });
    expect(calculateShieldFee).not.toHaveBeenCalled();
  });

  it("shows fetch error banner", () => {
    render(<Receive />, {
      contextOverrides: { fetchError: { command: "rcv", error: "fail" } as any },
    });
    expect(screen.getByText("rcv: fail")).toBeInTheDocument();
  });

  it("renders contact labels from the address book", () => {
    const u1 = makeUAddr("u1known");
    const ab = new AddressBookEntryClass("Dave", "u1known", ServerChainNameEnum.mainChainName);
    render(<Receive />, {
      contextOverrides: { addressesUnified: [u1], addressBook: [ab] },
    });
    // Expand the accordion entry
    fireEvent.click(screen.getByText("u1known"));
    expect(screen.getByText("Dave")).toBeInTheDocument();
  });

  // The line rides the balance header, which every one of these pages carries.
});
