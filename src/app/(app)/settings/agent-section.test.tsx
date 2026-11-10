import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AgentSection } from "./agent-section";

it("replaces legacy automatic draft controls with discovery and profile links", () => {
  render(<AgentSection />);
  expect(screen.getByRole("link", { name: "Open discovery" })).toHaveAttribute("href", "/discovery");
  expect(screen.getByRole("link", { name: "knowledge base" })).toHaveAttribute("href", "/knowledge");
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(screen.getByText(/Automatic draft creation is no longer used/)).toBeInTheDocument();
});
