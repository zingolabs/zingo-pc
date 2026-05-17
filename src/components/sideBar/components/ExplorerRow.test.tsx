import React from "react";
import { render, screen, fireEvent } from "../../../test-utils";
import ExplorerRow from "./ExplorerRow";
import { BlockExplorerEnum } from "../../appstate";

const baseProps = {
  label: "Transactions",
  ariaLabel: "Block explorer for mainnet transactions",
  customPlaceholder: "https://mainnet.block-explorer/tx/",
  value: BlockExplorerEnum.Zcashexplorer,
  onChange: jest.fn(),
  customValue: "",
  onCustomChange: jest.fn(),
};

describe("ExplorerRow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the label and the select with the current value", () => {
    render(<ExplorerRow {...baseProps} />);
    expect(screen.getByText("Transactions")).toBeInTheDocument();
    const select = screen.getByRole("combobox", { name: /block explorer for mainnet transactions/i });
    expect(select).toHaveValue(BlockExplorerEnum.Zcashexplorer);
  });

  it("does NOT render the custom URL input when value is a predefined option", () => {
    render(<ExplorerRow {...baseProps} />);
    expect(screen.queryByRole("textbox", { name: /custom url/i })).not.toBeInTheDocument();
  });

  it("renders the custom URL input when value is Custom", () => {
    render(<ExplorerRow {...baseProps} value={BlockExplorerEnum.Custom} customValue="https://my.explorer/tx/" />);
    const input = screen.getByRole("textbox", { name: /custom url/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("https://my.explorer/tx/");
    expect(input).toHaveAttribute("placeholder", "https://mainnet.block-explorer/tx/");
  });

  it("calls onChange with the new BlockExplorerEnum value when the select changes", () => {
    const onChange = jest.fn();
    render(<ExplorerRow {...baseProps} onChange={onChange} />);
    const select = screen.getByRole("combobox", { name: /block explorer for mainnet transactions/i });
    fireEvent.change(select, { target: { value: BlockExplorerEnum.Cipherscan } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(BlockExplorerEnum.Cipherscan);
  });

  it("calls onCustomChange when the custom URL input changes", () => {
    const onCustomChange = jest.fn();
    render(<ExplorerRow {...baseProps} value={BlockExplorerEnum.Custom} onCustomChange={onCustomChange} />);
    const input = screen.getByRole("textbox", { name: /custom url/i });
    fireEvent.change(input, { target: { value: "https://new.explorer/tx/" } });
    expect(onCustomChange).toHaveBeenCalledTimes(1);
    expect(onCustomChange).toHaveBeenCalledWith("https://new.explorer/tx/");
  });
});
