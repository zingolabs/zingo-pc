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
    // The first address opens by default.
    expect(screen.getByText("Dave")).toBeInTheDocument();
  });

  // The line rides the balance header, which every one of these pages carries.
});

describe("Receive — search", () => {
  // Nothing to narrow with a single address.
  it("offers no search for one address, and one for several", () => {
    const { unmount } = render(<Receive />, { contextOverrides: { addressesUnified: [makeUAddr("u1only")] } });
    expect(screen.queryByRole("searchbox", { name: "Search addresses" })).not.toBeInTheDocument();
    unmount();

    render(<Receive />, { contextOverrides: { addressesUnified: [makeUAddr("u1first"), makeUAddr("u1second")] } });
    expect(screen.getByRole("searchbox", { name: "Search addresses" })).toBeInTheDocument();
  });

  it("narrows the addresses", () => {
    render(<Receive />, { contextOverrides: { addressesUnified: [makeUAddr("u1first"), makeUAddr("u1second")] } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search addresses" }), { target: { value: "second" } });
    expect(screen.getByText("u1second")).toBeInTheDocument();
    expect(screen.queryByText("u1first")).not.toBeInTheDocument();
  });

  // One search over both tabs: the transparent tab answers for the same query.
  it("runs over both tabs at once", () => {
    render(<Receive />, {
      contextOverrides: {
        addressesUnified: [makeUAddr("u1first"), makeUAddr("u1second")],
        addressesTransparent: [makeTAddr("t1second"), makeTAddr("t1other")],
      },
    });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search addresses" }), { target: { value: "second" } });
    fireEvent.click(screen.getByRole("tab", { name: /transparent/i }));
    expect(screen.getAllByText("t1second").length).toBeGreaterThan(0);
    expect(screen.queryByText("t1other")).not.toBeInTheDocument();
  });
});

describe("Receive — finding your place in a long list", () => {
  const three = [makeUAddr("u1one"), makeUAddr("u1two"), makeUAddr("u1three")];

  it("counts the addresses beside each tab's name", () => {
    render(<Receive />, {
      contextOverrides: { addressesUnified: three, addressesTransparent: [makeTAddr("t1one")] },
    });
    expect(screen.getByRole("tab", { name: "Unified (3)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Transparent (1)" })).toBeInTheDocument();
  });

  // Scrolling a long list, the position says where you are.
  it("numbers each address in the list on screen", () => {
    render(<Receive />, { contextOverrides: { addressesUnified: three } });
    expect(screen.getAllByText(/2 of 3/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3 of 3/).length).toBeGreaterThan(0);
  });

  it("numbers what the search left, not the whole list", () => {
    render(<Receive />, { contextOverrides: { addressesUnified: three } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search addresses" }), { target: { value: "u1t" } });
    expect(screen.getAllByText(/2 of 2/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/of 3/)).not.toBeInTheDocument();
  });
});
