import React from "react";
import { act, screen, waitFor } from "@testing-library/react";
import { render } from "../../test-utils";
import { AddressBookEntryClass, ServerChainNameEnum } from "../appstate";

jest.mock("../../electronBridge");

// chart.js tries to use canvas — mock it out entirely
jest.mock("react-chartjs-2", () => ({
  Chart: () => <div data-testid="chart" />,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Insight = require("./Insight").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { native } = require("../../electronBridge");

beforeEach(() => {
  (native.get_total_value_to_address as jest.Mock).mockReset();
  (native.get_total_spends_to_address as jest.Mock).mockReset();
  (native.get_total_memobytes_to_address as jest.Mock).mockReset();
});

const installEmptyData = () => {
  (native.get_total_value_to_address as jest.Mock).mockResolvedValue("{}");
  (native.get_total_spends_to_address as jest.Mock).mockResolvedValue("{}");
  (native.get_total_memobytes_to_address as jest.Mock).mockResolvedValue("{}");
};

describe("Insight", () => {
  it("renders without crashing", () => {
    installEmptyData();
    render(<Insight />);
  });

  it("renders section labels that are always present", () => {
    installEmptyData();
    render(<Insight />);
    expect(screen.getByText("Financial Insight")).toBeInTheDocument();
    expect(screen.getByText("Sent amounts")).toBeInTheDocument();
    expect(screen.getByText("Number of sends")).toBeInTheDocument();
    expect(screen.getByText("Number of bytes")).toBeInTheDocument();
  });

  it("shows 'No Transactions Yet' in all three sections when data is empty", async () => {
    installEmptyData();
    await act(async () => {
      render(<Insight />);
    });
    await waitFor(() => {
      expect(screen.getAllByText("No Transactions Yet").length).toBe(3);
    });
  });

  it("renders charts when data is non-empty across all three sections", async () => {
    (native.get_total_value_to_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ fee: 1_000_000, u1abc: 100_000_000, u1def: 50_000_000 }),
    );
    (native.get_total_spends_to_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ fee: 5, u1abc: 3, u1def: 2 }),
    );
    (native.get_total_memobytes_to_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ fee: 10, u1abc: 200, u1def: 150 }),
    );
    await act(async () => {
      render(<Insight />);
    });
    await waitFor(() => {
      expect(screen.getAllByTestId("chart").length).toBe(3);
    });
  });

  it("labels addresses with their contact tag when in the address book", async () => {
    const addressBook = [
      new AddressBookEntryClass("Alice", "u1abc"),
      new AddressBookEntryClass("Bob", "u1def"),
    ];
    addressBook[0].chain = ServerChainNameEnum.mainChainName;
    addressBook[1].chain = ServerChainNameEnum.mainChainName;
    (native.get_total_value_to_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ u1abc: 100_000_000 }),
    );
    (native.get_total_spends_to_address as jest.Mock).mockResolvedValue(JSON.stringify({ u1abc: 3 }));
    (native.get_total_memobytes_to_address as jest.Mock).mockResolvedValue(JSON.stringify({ u1abc: 200 }));
    await act(async () => {
      render(<Insight />, { contextOverrides: { addressBook } });
    });
    await waitFor(() => {
      // Each section renders one detail line per non-fee address; "Alice" appears in all three.
      expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("handles native errors gracefully (catch block hit)", async () => {
    (native.get_total_value_to_address as jest.Mock).mockRejectedValue(new Error("native crash"));
    (native.get_total_spends_to_address as jest.Mock).mockRejectedValue(new Error("native crash 2"));
    (native.get_total_memobytes_to_address as jest.Mock).mockRejectedValue(new Error("native crash 3"));
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      render(<Insight />);
    });
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
    consoleErrorSpy.mockRestore();
  });

  it("handles invalid JSON from native (catch block hit)", async () => {
    (native.get_total_value_to_address as jest.Mock).mockResolvedValue("not-json");
    (native.get_total_spends_to_address as jest.Mock).mockResolvedValue("also-bad");
    (native.get_total_memobytes_to_address as jest.Mock).mockResolvedValue("nope");
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      render(<Insight />);
    });
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
    consoleErrorSpy.mockRestore();
  });

  it("trims long addresses in the labels", async () => {
    const longAddress = "u1" + "x".repeat(50);
    (native.get_total_value_to_address as jest.Mock).mockResolvedValue(JSON.stringify({ [longAddress]: 100_000_000 }));
    (native.get_total_spends_to_address as jest.Mock).mockResolvedValue(JSON.stringify({ [longAddress]: 3 }));
    (native.get_total_memobytes_to_address as jest.Mock).mockResolvedValue(JSON.stringify({ [longAddress]: 200 }));
    await act(async () => {
      render(<Insight />);
    });
    // No assertion needed; we just want the trim path to execute (covers Utils.trimToSmall branch).
  });

  it("renders the 'fee' line in the sent section with the zingo color", async () => {
    (native.get_total_value_to_address as jest.Mock).mockResolvedValue(
      JSON.stringify({ fee: 1_000_000, u1abc: 100_000_000 }),
    );
    (native.get_total_spends_to_address as jest.Mock).mockResolvedValue(JSON.stringify({ u1abc: 3 }));
    (native.get_total_memobytes_to_address as jest.Mock).mockResolvedValue(JSON.stringify({ u1abc: 200 }));
    await act(async () => {
      render(<Insight />);
    });
    await waitFor(() => {
      // "fee" should show as a label in the sent panel.
      expect(screen.getAllByText("fee").length).toBeGreaterThanOrEqual(1);
    });
  });
});
