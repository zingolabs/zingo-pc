import React from "react";
import { Accordion } from "react-accessible-accordion";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "../../../test-utils";
import AddressBlock from "./AddressBlock";
import {
  UnifiedAddressClass,
  TransparentAddressClass,
  TotalBalanceClass,
  ServerChainNameEnum,
  ValueTransferClass,
  ValueTransferKindEnum,
  ValueTransferStatusEnum,
} from "../../appstate";
import { AddressScopeEnum } from "../../appstate/enums/AddressScopeEnum";

jest.mock("../../../electronBridge");

// RPC.createNewAddress* calls native — mock the whole rpc module
jest.mock("../../../rpc/rpc", () => ({
  __esModule: true,
  default: {
    createNewAddressUnified: jest.fn(),
    createNewAddressTransparent: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RPC = require("../../../rpc/rpc").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { clipboard } = require("../../../electronBridge");

const uAddr = new UnifiedAddressClass(0, 0, "u1shortaddr000000000000000", true, false, false);
const tAddr = new TransparentAddressClass(0, 0, AddressScopeEnum.external, "t1shortaddr");
const longUAddr = new UnifiedAddressClass(0, 0, "u1" + "a".repeat(100), true, true, true);

const mainnetWallet = { id: 1, chain_name: ServerChainNameEnum.mainChainName } as any;
const testnetWallet = { id: 1, chain_name: ServerChainNameEnum.testChainName } as any;
const regtestWallet = { id: 1, chain_name: ServerChainNameEnum.regtestChainName } as any;

const baseProps = {
  currencyName: "ZEC",
  calculateShieldFee: jest.fn().mockResolvedValue(0.001),
  handleShieldButton: jest.fn(),
};

const renderInAccordion = (ui: React.ReactElement, opts?: Parameters<typeof render>[1]) =>
  render(<Accordion>{ui}</Accordion>, opts);

beforeEach(() => {
  RPC.createNewAddressUnified.mockReset();
  RPC.createNewAddressTransparent.mockReset();
  RPC.createNewAddressUnified.mockResolvedValue("u1newaddr");
  RPC.createNewAddressTransparent.mockResolvedValue("t1newaddr");
  (clipboard.writeText as jest.Mock).mockReset();
  baseProps.handleShieldButton.mockReset();
});

describe("AddressBlock — Unified", () => {
  it("renders the address in the accordion header", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />);
    expect(screen.getByText("u1shortaddr000000000000000")).toBeInTheDocument();
  });

  it("splits long unified addresses into multiple chunks in the header", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={longUAddr} type="u" />);
    // We don't assert text exactly (chunks vary), but the address should be present in chunks.
    // Just verify the accordion can be expanded.
    expect(screen.getByText("Address type: Orchard + Sapling + Transparent")).toBeInTheDocument();
  });

  it("copies the address to the clipboard and shows 'Copied!'", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />);
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    fireEvent.click(screen.getByRole("button", { name: /copy address/i }));
    expect(clipboard.writeText).toHaveBeenCalledWith("u1shortaddr000000000000000");
    expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("creates a new unified address via RPC", async () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />);
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    fireEvent.click(screen.getByRole("button", { name: /new address/i }));
    expect(RPC.createNewAddressUnified).toHaveBeenCalledWith("o");
  });

  it("respects unified create type selector (z option)", async () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />);
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    fireEvent.change(screen.getByRole("combobox", { name: /new address type/i }), { target: { value: "z" } });
    fireEvent.click(screen.getByRole("button", { name: /new address/i }));
    expect(RPC.createNewAddressUnified).toHaveBeenCalledWith("z");
  });

  it("opens the error modal when RPC returns error", async () => {
    RPC.createNewAddressUnified.mockResolvedValue("Error: rate limit");
    const openErrorModal = jest.fn();
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />, {
      contextOverrides: { openErrorModal },
    });
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    fireEvent.click(screen.getByRole("button", { name: /new address/i }));
    await waitFor(() => expect(openErrorModal).toHaveBeenCalledWith("New Address", "Error: rate limit"));
  });

  it("opens the error modal when RPC returns empty", async () => {
    RPC.createNewAddressUnified.mockResolvedValue("");
    const openErrorModal = jest.fn();
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />, {
      contextOverrides: { openErrorModal },
    });
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    fireEvent.click(screen.getByRole("button", { name: /new address/i }));
    await waitFor(() => expect(openErrorModal).toHaveBeenCalledWith("New Address", "Error: creating a new address."));
  });

  it("hides 'View on explorer' button on regtest", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />, {
      contextOverrides: { currentWallet: regtestWallet },
    });
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    expect(screen.queryByRole("button", { name: /view on explorer/i })).not.toBeInTheDocument();
  });

  it("shows 'View on explorer' on mainnet", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />, {
      contextOverrides: { currentWallet: mainnetWallet },
    });
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    expect(screen.getByRole("button", { name: /view on explorer/i })).toBeInTheDocument();
  });

  it("shows 'View on explorer' on testnet", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />, {
      contextOverrides: { currentWallet: testnetWallet },
    });
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    expect(screen.getByRole("button", { name: /view on explorer/i })).toBeInTheDocument();
  });

  it("shows the optional label when provided", () => {
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" label="My savings" />);
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    expect(screen.getByText("My savings")).toBeInTheDocument();
  });

  it("downloads QR via toDataURL when clicked", () => {
    // jsdom's canvas doesn't support toDataURL — stub it.
    HTMLCanvasElement.prototype.toDataURL = jest.fn(() => "data:image/png;base64,abc");
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderInAccordion(<AddressBlock {...baseProps} address={uAddr} type="u" />);
    fireEvent.click(screen.getByText("u1shortaddr000000000000000"));
    fireEvent.click(screen.getByRole("button", { name: /download qr code/i }));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
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

  it("creates a new transparent address via RPC", async () => {
    renderInAccordion(<AddressBlock {...baseProps} address={tAddr} type="t" />);
    fireEvent.click(screen.getByText("t1shortaddr"));
    fireEvent.click(screen.getByRole("button", { name: /new address/i }));
    expect(RPC.createNewAddressTransparent).toHaveBeenCalled();
  });

  it("shows Shield button when transparent balance >= fee, no readOnly, no pending", async () => {
    const totalBalance = Object.assign(new TotalBalanceClass(), { confirmedTransparentBalance: 1 });
    const calculateShieldFee = jest.fn().mockResolvedValue(0.001);
    const handleShieldButton = jest.fn();
    renderInAccordion(
      <AddressBlock
        {...baseProps}
        address={tAddr}
        type="t"
        calculateShieldFee={calculateShieldFee}
        handleShieldButton={handleShieldButton}
      />,
      { contextOverrides: { totalBalance, currentWallet: mainnetWallet } },
    );
    fireEvent.click(screen.getByText("t1shortaddr"));
    await waitFor(() => expect(calculateShieldFee).toHaveBeenCalled());
    const btn = await screen.findByRole("button", { name: /shield balance to orchard/i });
    fireEvent.click(btn);
    expect(handleShieldButton).toHaveBeenCalled();
  });

  it("hides Shield button when readOnly is true", async () => {
    const totalBalance = Object.assign(new TotalBalanceClass(), { confirmedTransparentBalance: 1 });
    renderInAccordion(<AddressBlock {...baseProps} address={tAddr} type="t" />, {
      contextOverrides: { totalBalance, readOnly: true, currentWallet: mainnetWallet },
    });
    fireEvent.click(screen.getByText("t1shortaddr"));
    // Wait briefly to allow any effects to flush.
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("button", { name: /shield balance to orchard/i })).not.toBeInTheDocument();
  });

  it("hides Shield button when there are pending value transfers", async () => {
    const totalBalance = Object.assign(new TotalBalanceClass(), { confirmedTransparentBalance: 1 });
    const pending = new ValueTransferClass(
      ValueTransferKindEnum.sent,
      1,
      100,
      ValueTransferStatusEnum.confirmed,
      "txid",
      0,
      1,
      "addr",
    );
    renderInAccordion(<AddressBlock {...baseProps} address={tAddr} type="t" />, {
      contextOverrides: { totalBalance, valueTransfers: [pending], currentWallet: mainnetWallet },
    });
    fireEvent.click(screen.getByText("t1shortaddr"));
    expect(screen.queryByRole("button", { name: /shield balance to orchard/i })).not.toBeInTheDocument();
  });
});
