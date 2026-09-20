import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CopyField } from "./DetailField";

jest.mock("../../electronBridge");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { clipboard } = require("../../electronBridge");

const HASH = "a".repeat(40) + "b".repeat(40);

describe("CopyField", () => {
  beforeEach(() => (clipboard.writeText as jest.Mock).mockReset());

  // Eighty characters of hash decided how tall a detail view was, and nobody
  // reads the middle of one.
  it("folds a long code to its two ends", () => {
    render(<CopyField label="TXID" value={HASH} />);

    expect(screen.getByText(`${"a".repeat(12)}...${"b".repeat(12)}`)).toBeInTheDocument();
  });

  it("opens it over two lines, and folds it back", () => {
    render(<CopyField label="TXID" value={HASH} />);

    fireEvent.click(screen.getByRole("button", { name: "Show TXID in full" }));

    expect(screen.getAllByText(/^[ab]+$/)).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Fold TXID" }));

    expect(screen.getByText(`${"a".repeat(12)}...${"b".repeat(12)}`)).toBeInTheDocument();
  });

  // A value that already fits is not a code to unfold, so it is not pressable.
  it("leaves a short value alone", () => {
    render(<CopyField label="Exact amount" value="0.001 ETH" />);

    expect(screen.getByText("0.001 ETH")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /in full/ })).not.toBeInTheDocument();
  });

  // Beside the label, where the reader is already looking — not in a line at
  // the foot of a view that a scrolled pane often hides.
  it("says it copied, beside the label", () => {
    render(<CopyField label="TXID" value={HASH} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy TXID" }));

    expect(clipboard.writeText).toHaveBeenCalledWith(HASH);
    expect(screen.getByText("Copied!")).toBeInTheDocument();
  });

  it("carries a note under its label, for what names the value", () => {
    render(<CopyField label="Address" value={HASH} note={<div>Alice</div>} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
  });
});
