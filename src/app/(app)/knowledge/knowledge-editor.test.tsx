import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { KnowledgeEntry } from "./knowledge-entry";
import { WorkflowPreferencesEditor } from "./preferences-editor";

const { saveDetail, savePreferences, refresh } = vi.hoisted(() => ({ saveDetail: vi.fn(), savePreferences: vi.fn(), refresh: vi.fn() }));
vi.mock("./actions", () => ({ saveDetail, savePreferences }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
beforeEach(() => {
  saveDetail.mockReset().mockResolvedValue({ ok: true, data: null });
  savePreferences.mockReset().mockResolvedValue({ ok: true, data: null });
  refresh.mockReset();
});

it("saves role context and track-specific inclusion without altering its identity", async () => {
  render(<KnowledgeEntry kind="experience" entryId="role-1" title="Engineer · Example" />);
  await userEvent.click(screen.getByText("Engineer · Example", { exact: true }));
  await userEvent.type(screen.getByLabelText("Validated context and evidence"), "Owned the fictional import service.");
  await userEvent.click(screen.getByLabelText("Data LaTeX"));
  await userEvent.click(screen.getByRole("button", { name: "Save context" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Context saved");
  expect(saveDetail).toHaveBeenCalledWith({ kind: "experience", entryId: "role-1", context: "Owned the fictional import service.", architecture: "", architectureImage: "", includeSwe: true, includeData: false });
  expect(refresh).toHaveBeenCalledOnce();
});

it("keeps unsaved context after a failed save and can retry", async () => {
  saveDetail.mockResolvedValueOnce({ ok: false, error: "The entry no longer exists." });
  render(<KnowledgeEntry kind="project" entryId="project-1" title="Aurora" />);
  await userEvent.click(screen.getByText("Aurora", { exact: true }));
  await userEvent.type(screen.getByLabelText("Architecture diagram — Mermaid source"), "graph LR\nA-->B");
  await userEvent.click(screen.getByRole("button", { name: "Save context" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The entry no longer exists.");
  expect(screen.getByLabelText("Architecture diagram — Mermaid source")).toHaveValue("graph LR\nA-->B");
  await userEvent.click(screen.getByRole("button", { name: "Save context" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Context saved");
});

it("rejects oversized architecture images without saving them", async () => {
  render(<KnowledgeEntry kind="project" entryId="project-1" title="Aurora" />);
  await userEvent.click(screen.getByText("Aurora", { exact: true }));
  await userEvent.upload(screen.getByLabelText("Architecture image"), new File([new Uint8Array(512 * 1024 + 1)], "large.png", { type: "image/png" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("512 KB");
  expect(saveDetail).not.toHaveBeenCalled();
});

it("previews a diagram locally and saves it only with the explicit context action", async () => {
  render(<KnowledgeEntry kind="project" entryId="project-1" title="Aurora" />);
  await userEvent.click(screen.getByText("Aurora", { exact: true }));
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII="), char => char.charCodeAt(0));
  await userEvent.upload(screen.getByLabelText("Architecture image"), new File([png], "architecture.png", { type: "image/png" }));
  expect(await screen.findByRole("img", { name: "Architecture diagram for Aurora" })).toHaveAttribute("src", expect.stringContaining("data:image/png;base64,"));
  expect(saveDetail).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Save context" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Context saved");
  expect(saveDetail).toHaveBeenCalledWith(expect.objectContaining({ architectureImage: expect.stringContaining("data:image/png;base64,") }));
  await userEvent.click(screen.getByRole("button", { name: "Remove image" }));
  expect(screen.queryByRole("img", { name: "Architecture diagram for Aurora" })).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("stores flexible title lists, explicit constraints and presentation overrides", async () => {
  render(<WorkflowPreferencesEditor themes={[{ id: "theme-one", name: "Classic" }]} initial={{
    discovery: { roles: [], locations: [], workArrangements: [], excludedCompanies: [], minimumSalary: null, salaryCurrency: "USD", constraints: "" },
    tailoring: { track: "auto", themeId: null, coverLetter: false },
  }} />);
  expect(screen.getByLabelText("Resume track")).toHaveValue("auto");
  expect(screen.getByLabelText("Presentation override")).toHaveValue("");
  await userEvent.type(screen.getByLabelText("Preferred role titles"), "Data analyst\nAnalytics engineer");
  await userEvent.type(screen.getByLabelText("Explicit discovery constraints"), "Remote within Arizona.");
  await userEvent.selectOptions(screen.getByLabelText("Resume track"), "data");
  await userEvent.selectOptions(screen.getByLabelText("Presentation override"), "theme-one");
  await userEvent.click(screen.getByLabelText("Generate a cover letter"));
  await userEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await waitFor(() => expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
    discovery: expect.objectContaining({ roles: ["Data analyst", "Analytics engineer"], constraints: "Remote within Arizona.", minimumSalary: null }),
    tailoring: { track: "data", themeId: "theme-one", coverLetter: true },
  })));
  expect(within(screen.getByRole("form", { name: "Discovery and tailoring preferences" })).getByRole("status")).toHaveTextContent("Preferences saved");
});
