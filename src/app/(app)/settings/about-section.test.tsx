import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AboutSection } from "./about-section";

it("shows install facts without upstream controls, even with legacy enabled settings", () => {
  render(<AboutSection
    facts={[{ label: "Version", value: "1.9.1" }]}
    usagePing={{ host: "telemetry.dossier.aien.me", choice: "on", source: "env", id: "old-id", production: true }}
    updates={{ daily: true, available: { version: "99.0.0", url: "https://github.com/AienTech/dossier/releases/tag/v99.0.0" } }}
  />);
  expect(screen.getByRole("heading", { name: "About this install" })).toBeInTheDocument();
  expect(screen.getByText("1.9.1")).toBeInTheDocument();
  expect(screen.getByText(/Upstream usage telemetry and update checks are disabled/)).toBeInTheDocument();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Check for updates/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/99.0.0/)).not.toBeInTheDocument();
});
