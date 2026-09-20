import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import AdvancedSection from "./AdvancedSection";

describe("AdvancedSection", () => {
  // The point of the section: a detail view opens on what it is about, not on
  // the record of how it was carried out.
  it("keeps its contents away until asked", () => {
    render(
      <AdvancedSection>
        <div>route-1234</div>
      </AdvancedSection>,
    );

    expect(screen.queryByText("route-1234")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /advanced/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens and closes on the line", () => {
    render(
      <AdvancedSection>
        <div>route-1234</div>
      </AdvancedSection>,
    );
    const line = screen.getByRole("button", { name: /advanced/i });

    fireEvent.click(line);
    expect(screen.getByText("route-1234")).toBeInTheDocument();
    expect(line).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(line);
    expect(screen.queryByText("route-1234")).not.toBeInTheDocument();
  });

  // Open, the section is bounded on both sides, so what it folded out does not
  // run into whatever the view ends with.
  it("closes itself with a rule when open", () => {
    render(
      <AdvancedSection>
        <div>route-1234</div>
      </AdvancedSection>,
    );

    expect(screen.getAllByRole("separator")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /advanced/i }));

    expect(screen.getAllByRole("separator")).toHaveLength(2);
  });

  it("takes a word of its own where a view has a better one", () => {
    render(
      <AdvancedSection label="Technical details">
        <div>route-1234</div>
      </AdvancedSection>,
    );

    expect(screen.getByRole("button", { name: "Technical details" })).toBeInTheDocument();
  });
});
