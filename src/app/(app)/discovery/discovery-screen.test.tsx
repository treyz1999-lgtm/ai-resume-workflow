import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_DISCOVERY_CONFIG, type DiscoveryPostingView, type DiscoveryView } from "@/lib/discovery/contracts";
import { DiscoveryScreen } from "./discovery-screen";

const mocks = vi.hoisted(() => ({ fetchRole: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), cancelScan: vi.fn(), saveConfig: vi.fn(), startSession: vi.fn(), stopSession: vi.fn(), scanNow: vi.fn(), addPosting: vi.fn(), changeState: vi.fn(), selectPostings: vi.fn(), removeSelection: vi.fn(), retryScan: vi.fn(), refresh: vi.fn() }));
vi.mock("./actions", () => mocks);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }), usePathname: () => "/discovery" }));
const now = "2026-11-03T12:00:00.000Z";
function posting(id = "role-1", patch: Partial<DiscoveryPostingView> = {}): DiscoveryPostingView {
  return { id, role: "Software Engineer", company: "Fictional Systems", source: "TEXT", url: "https://example.com/jobs/1", jd: "Build TypeScript services. Kubernetes preferred.", complete: true,
    postingEvidence: { raw: "November 3, 2026", kind: "absolute", observedAt: now, date: now, earliest: null, latest: null, reposted: false }, postedAt: now, firstSeenAt: now, lastSeenAt: now, sightings: 1,
    extracted: { company: "Fictional Systems", role: "Software Engineer", track: "swe", location: "Remote", arrangement: "Remote", salaryOriginal: null, salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, experienceOriginal: null, experienceBand: null, requisition: "REQ-1", postingDateOriginal: "November 3, 2026" },
    coverage: { method: "v5-evidence@1", score: 67, keywordCoverage: 50, strengths: ["TypeScript services"], gaps: ["Kubernetes"], requirements: [{ text: "Build TypeScript services", jdQuote: "Build TypeScript services.", importance: "core", evidence: "direct", kbQuotes: ["Built TypeScript services for Aurora."], explanation: "Project evidence supports this requirement." }], keywords: [{ keyword: "TypeScript", covered: true }, { keyword: "Kubernetes", covered: false }] },
    kbSnapshotId: "snapshot-1", state: "NEW", analysisError: null, selected: false, ...patch };
}
function view(patch: Partial<DiscoveryView> = {}): DiscoveryView { return { config: { ...DEFAULT_DISCOVERY_CONFIG, timeZone: "America/Phoenix" }, configured: true, sessionUntil: null, nextTickAt: null, scans: [], postings: [], selections: [], ...patch }; }
beforeEach(() => { for (const fn of Object.values(mocks)) fn.mockReset().mockResolvedValue({ ok: true, data: null }); });

it("starts no discovery or tailoring work on mount", () => {
  render(<DiscoveryScreen view={view()} />);
  expect(screen.getByLabelText("Enable weekly schedule")).not.toBeChecked();
  expect(screen.getByLabelText(/Scan interval/)).toHaveValue("10");
  expect(screen.getByText(/Discovery never starts tailoring automatically/)).toBeInTheDocument();
  expect(mocks.scanNow).not.toHaveBeenCalled(); expect(mocks.selectPostings).not.toHaveBeenCalled(); expect(mocks.saveConfig).not.toHaveBeenCalled();
});

it("saves interval, explicit timezone, sources and weekly windows together", async () => {
  const user = userEvent.setup(); render(<DiscoveryScreen view={view()} />);
  await user.click(screen.getByLabelText("Enable weekly schedule"));
  fireEvent.change(screen.getByLabelText(/Scan interval/), { target: { value: "1" } });
  await user.clear(screen.getByLabelText("Timezone")); await user.type(screen.getByLabelText("Timezone"), "Europe/London");
  await user.click(screen.getByLabelText("JSearch"));
  await user.click(screen.getByRole("button", { name: "Save discovery settings" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Discovery settings saved");
  expect(mocks.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, intervalMinutes: 1, timeZone: "Europe/London", sources: ["YC", "HN"] }));
});

it("rejects an invalid timezone without changing saved settings", async () => {
  render(<DiscoveryScreen view={view()} />);
  fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "not-a-zone" } });
  await userEvent.click(screen.getByRole("button", { name: "Save discovery settings" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("IANA timezone"); expect(mocks.saveConfig).not.toHaveBeenCalled();
});

it("initializes the unsaved timezone from the browser without writing a setting", () => {
  render(<DiscoveryScreen view={view({ configured: false })} />);
  expect(screen.getByLabelText("Timezone")).toHaveValue(Intl.DateTimeFormat().resolvedOptions().timeZone);
  expect(mocks.saveConfig).not.toHaveBeenCalled();
});

it("starts a bounded quick session only after clicking and allows stopping it", async () => {
  const { rerender } = render(<DiscoveryScreen view={view()} />);
  await userEvent.click(screen.getByRole("button", { name: "Run for 2 hours" }));
  expect(mocks.startSession).toHaveBeenCalledWith({ hours: 2 });
  rerender(<DiscoveryScreen view={view({ sessionUntil: "2026-11-03T14:00:00.000Z" })} />);
  await userEvent.click(screen.getByRole("button", { name: "Stop quick session" }));
  expect(mocks.stopSession).toHaveBeenCalledWith({}); expect(mocks.selectPostings).not.toHaveBeenCalled();
});

it("preserves pasted JD and company when intake fails, then clears after acceptance", async () => {
  mocks.addPosting.mockResolvedValueOnce({ ok: false, error: "Another scan is running. Try again shortly." });
  render(<DiscoveryScreen view={view()} />);
  fireEvent.change(screen.getByLabelText("Full job description"), { target: { value: "Build fictional TypeScript services." } });
  fireEvent.change(screen.getByLabelText("Company (optional)"), { target: { value: "Fictional Systems" } });
  await userEvent.click(screen.getByRole("button", { name: "Analyze posting" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Another scan is running");
  expect(screen.getByLabelText("Full job description")).toHaveValue("Build fictional TypeScript services.");
  await userEvent.click(screen.getByRole("button", { name: "Analyze posting" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Posting queued");
  expect(screen.getByLabelText("Full job description")).toHaveValue("");
  expect(mocks.addPosting).toHaveBeenLastCalledWith({ url: "", jd: "Build fictional TypeScript services.", company: "Fictional Systems", role: "" });
});

it("selects eligible findings in bulk only through an explicit action", async () => {
  render(<DiscoveryScreen view={view({ postings: [posting(), posting("role-2", { role: "Data Engineer", complete: false }), posting("role-3", { role: "Analyst", analysisError: "No supporting evidence" })] })} />);
  expect(mocks.selectPostings).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Select eligible roles" }));
  expect(screen.getByRole("checkbox", { name: "Select Software Engineer" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Select Data Engineer" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "Select Analyst" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Select 1 for tailoring" }));
  expect(mocks.selectPostings).toHaveBeenCalledWith({ ids: ["role-1"] });
});

it("shows complete JD, unknown fields, evidence and separate discovery metrics", async () => {
  render(<DiscoveryScreen view={view({ postings: [posting()] })} />);
  expect(screen.getByText("67%")).toBeInTheDocument(); expect(screen.getByText("50%")).toBeInTheDocument();
  expect(screen.getByText(/They are not final resume scores/)).toBeInTheDocument();
  await userEvent.click(screen.getByText("Posting details and evidence"));
  expect(screen.getByText("Build TypeScript services. Kubernetes preferred.")).toBeInTheDocument();
  expect(screen.getByText("KB: Built TypeScript services for Aurora.")).toBeInTheDocument();
  expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "Inspect the KB snapshot used" })).toHaveAttribute("href", "/knowledge?snapshot=snapshot-1");
});

it("saves or dismisses a finding without selecting it for tailoring", async () => {
  render(<DiscoveryScreen view={view({ postings: [posting()] })} />);
  await userEvent.click(screen.getByRole("button", { name: "Save role" }));
  expect(mocks.changeState).toHaveBeenCalledWith({ ids: ["role-1"], state: "SAVED" });
  await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(mocks.changeState).toHaveBeenCalledWith({ ids: ["role-1"], state: "DISMISSED" });
  expect(mocks.selectPostings).not.toHaveBeenCalled();
});

it("clears bulk selection when changing the visible state", async () => {
  render(<DiscoveryScreen view={view({ postings: [posting(), posting("saved", { state: "SAVED" })] })} />);
  await userEvent.click(screen.getByRole("button", { name: "Select eligible roles" }));
  await userEvent.selectOptions(screen.getByLabelText("Show roles"), "SAVED");
  expect(screen.getByRole("button", { name: "Select 0 for tailoring" })).toBeDisabled();
});

it("shows waiting selections honestly and removes them without running tailoring", async () => {
  render(<DiscoveryScreen view={view({ selections: [{ id: "selection-1", postingId: "role-1", role: "Software Engineer", company: "Fictional Systems", createdAt: now }] })} />);
  expect(screen.getByRole("link", { name: "tailoring queue" })).toHaveAttribute("href", "/tailoring");
  await userEvent.click(screen.getByRole("button", { name: "Remove Software Engineer" }));
  expect(mocks.removeSelection).toHaveBeenCalledWith({ id: "selection-1" });
});

it("surfaces isolated source failures and retries the same interrupted scan", async () => {
  render(<DiscoveryScreen view={view({ scans: [{ id: "scan-1", status: "INTERRUPTED", stage: "Analyzing posting", sourceResults: [{ source: "JSEARCH", found: 0, error: "Search quota reached" }, { source: "YC", found: 2, error: null }], error: "Worker restarted", createdAt: now, finishedAt: now }] })} />);
  await userEvent.click(screen.getByText(/interrupted ·/));
  expect(screen.getByText("JSEARCH: Search quota reached")).toBeInTheDocument();
  expect(screen.getByText("YC: 2 postings found")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Retry scan" }));
  expect(mocks.retryScan).toHaveBeenCalledWith({ id: "scan-1" });
});

it("does not allow a second manual scan while one is active", () => {
  render(<DiscoveryScreen view={view({ scans: [{ id: "scan-1", status: "RUNNING", stage: "Searching", sourceResults: [], error: null, createdAt: now, finishedAt: null }] })} />);
  expect(screen.getByRole("button", { name: "Scan in progress" })).toBeDisabled();
});

it("does not render a dangerous source link", () => {
  render(<DiscoveryScreen view={view({ postings: [posting("unsafe", { url: "javascript:alert(1)" })] })} />);
  expect(screen.queryByRole("link", { name: "Open posting" })).not.toBeInTheDocument();
});

it("exposes pause and immediate stop without changing tailoring", async () => {
  const { rerender } = render(<DiscoveryScreen view={view()} />);
  await userEvent.click(screen.getByRole("button", { name: "Pause discovery" }));
  expect(mocks.pause).toHaveBeenCalledWith({});
  rerender(<DiscoveryScreen view={view({config: {...DEFAULT_DISCOVERY_CONFIG, paused:true}})} />);
  expect(screen.getByRole("button", { name:"Scan now" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name:"Resume discovery" }));
  expect(mocks.resume).toHaveBeenCalledWith({});
  rerender(<DiscoveryScreen view={view()} />);
  await userEvent.click(screen.getByRole("button", { name:"Stop now" }));
  expect(mocks.stop).toHaveBeenCalledWith({});
  expect(mocks.selectPostings).not.toHaveBeenCalled();
});

it("fetches and previews a manual link while discovery is paused without starting a scan", async () => {
  mocks.fetchRole.mockResolvedValue({ok:true,data:{url:"https://example.com/job",jd:"Fictional complete job description."}});
  render(<DiscoveryScreen manualOnly view={view({config:{...DEFAULT_DISCOVERY_CONFIG,paused:true}})} />);
  expect(screen.getByRole("heading",{name:"New application"})).toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"Resume discovery"})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Posting URL"),{target:{value:"https://example.com/job"}});
  await userEvent.click(screen.getByRole("button",{name:"Fetch posting"}));
  expect(screen.getByLabelText("Full job description")).toHaveValue("Fictional complete job description.");
  expect(mocks.scanNow).not.toHaveBeenCalled();expect(mocks.resume).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button",{name:"Analyze posting"}));
  expect(mocks.addPosting).toHaveBeenCalledWith({url:"https://example.com/job",jd:"Fictional complete job description.",company:"",role:""});
});
it("preserves a blocked URL and offers pasted text without enqueueing", async () => {
  mocks.fetchRole.mockResolvedValue({ok:false,error:"The job site blocks fetching. Paste the posting instead."});
  render(<DiscoveryScreen view={view()} />);
  fireEvent.change(screen.getByLabelText("Posting URL"),{target:{value:"https://example.com/job"}});
  await userEvent.click(screen.getByRole("button",{name:"Fetch posting"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Paste the posting");
  expect(screen.getByLabelText("Posting URL")).toHaveValue("https://example.com/job");
  expect(mocks.addPosting).not.toHaveBeenCalled();
});

it("allows retrying failed manual analysis while discovery is paused", async () => {
 render(<DiscoveryScreen manualOnly view={view({config:{...DEFAULT_DISCOVERY_CONFIG,paused:true},scans:[{id:"failed-manual",manualInput:true,status:"FAILED",stage:"Analysis",sourceResults:[],error:"Quote mismatch",createdAt:now,finishedAt:now}]})} />);
 const details=screen.getByText(/failed ·/);await userEvent.click(details);
 await userEvent.click(screen.getByRole("button",{name:"Retry scan"}));
 expect(mocks.retryScan).toHaveBeenCalledWith({id:"failed-manual"});
 expect(mocks.resume).not.toHaveBeenCalled();
});
