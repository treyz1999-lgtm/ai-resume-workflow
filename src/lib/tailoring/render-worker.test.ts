import { describe, expect, it } from "vitest";
import { fictionalResume, fictionalCoverLetter } from "../templates/v5";
import { BUILT_IN_THEMES } from "../themes";
import { renderAndInspect } from "../../../worker/tailoring-render";

const run = (value: unknown) => renderAndInspect(value, new AbortController().signal);
const input = { kind: "resume", track: "swe", resume: fictionalResume };

it("rejects arbitrary TeX, invalid destinations and repeated project identities at the worker boundary", async () => {
  await expect(run({ ...input, tex: "\\input{private}" })).rejects.toThrow();
  for (const projects of [
    [{ ...fictionalResume.projects[0], url: "javascript:alert(1)" }],
    [fictionalResume.projects[0], fictionalResume.projects[0]],
  ]) await expect(run({ ...input, resume: { ...fictionalResume, projects } })).rejects.toThrow();
});
describe.skipIf(process.env.M4_COMPILER_TESTS !== "1")("local worker compiler", () => {
  it("compiles both presets and a letter with valid editable sources and checked destinations", async () => {
    const swe = await run(input);
    const data = await run({ ...input, track: "data" });
    const letter = await run({ kind: "letter", letter: fictionalCoverLetter });
    expect(swe.text).not.toContain("Example Research");
    expect(data.text).toContain("Example Research");
    for (const doc of [swe, data, letter]) {
      expect(doc.verification.pages).toBe(1);
      expect(doc.verification.checkedLinks).toContain("https://example.com/profile");
      expect(doc.source).toContain("\\begin{document}");
    }
    const snapshot = { version: 1, track: "swe", resume: fictionalResume, theme: BUILT_IN_THEMES[0] };
    await expect(run({ kind: "theme", snapshot: { ...snapshot, resume: { ...fictionalResume, projects: fictionalResume.projects.map(p => ({ ...p, url: p.url + "/wrong" })) } }, pdf: swe.pdf })).rejects.toThrow("hyperlink");
    await expect(run({ kind: "theme", snapshot: { ...snapshot, resume: { ...fictionalResume, contact: { name: "Another Person" } } }, pdf: swe.pdf })).rejects.toThrow("protected fields");
  }, 60_000);
  it("refuses page overflow and corrupt PDF input", async () => {
    await expect(run({ ...input, resume: { ...fictionalResume, projects: fictionalResume.projects.map(p => ({ ...p, bullets: Array(100).fill("This document has too many projects and too much text to print on a single page.") })) } })).rejects.toThrow(/fit one page|overflows/);
    await expect(run({ kind: "theme", snapshot: { version: 1, track: "swe", resume: fictionalResume, theme: BUILT_IN_THEMES[0] }, pdf: "invalid-pdf-input-data" })).rejects.toThrow("invalid PDF");
  });
  it("fails verification when the compiler is unavailable", async () => {
    const path = process.env.PATH;
    try {
      process.env.PATH = "/nonexistent-fixture-toolchain";
      await expect(run(input)).rejects.toThrow("pdflatex");
    } finally { process.env.PATH = path; }
  });
});

