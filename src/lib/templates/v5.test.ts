import { describe, expect, it } from "vitest";
import { escapeLatex, fictionalCoverLetter, fictionalResume, latexWebUrl, renderCoverLetter, renderV5Resume, V5_PREAMBLE } from "./v5";

describe("V5 data-driven presets", () => {
  it("includes role evidence by variant without modifying input", () => {
    const before = structuredClone(fictionalResume);
    const swe = renderV5Resume("swe", fictionalResume);
    const data = renderV5Resume("data", fictionalResume);
    expect(swe).toContain("Fictional Systems");
    expect(swe).not.toContain("Example Research");
    expect(data).toContain("Fictional Systems");
    expect(data).toContain("Example Research");
    expect(fictionalResume).toEqual(before);
  });
  it("honors changed per-role flags and arbitrary profile identity", () => {
    const input = structuredClone(fictionalResume);
    input.contact.name = "Alex Demo";
    input.experience[0].includeSwe = false;
    input.experience[1].includeSwe = true;
    const source = renderV5Resume("swe", input);
    expect(source).toContain("Alex Demo");
    expect(source).not.toContain("Fictional Systems");
    expect(source).toContain("Example Research");
  });
  it.each(["swe", "data"] as const)("preserves %s section order and all supplied project links", track => {
    const source = renderV5Resume(track, fictionalResume);
    const sections = [...source.matchAll(/\\section\{([^}]+)\}/g)].map(match => match[1]);
    expect(sections).toEqual(["Technical Skills", "Experience", "Projects", "Education"]);
    for (const project of fictionalResume.projects) expect(source).toContain(`\\href{${project.url}}{${project.name}}`);
    expect(source.match(/\\projectHeading\{/g)).toHaveLength(5);
    expect(source).not.toContain("\\input{contact}");
    expect(source).not.toContain("\\input{experience}");
    expect(source).toContain("Copyright (c) 2020 Jake Gutierrez");
  });
  it("retains master typography and macros", () => {
    expect(V5_PREAMBLE).toContain("\\documentclass[letterpaper,11pt]{article}");
    expect(V5_PREAMBLE).toContain("\\usepackage[margin=0.5in]{geometry}");
    expect(V5_PREAMBLE).toContain("\\newcommand{\\projectHeading}[2]");
    expect(V5_PREAMBLE).toContain("\\pdfgentounicode=1");
  });
  it("does not silently route an unsupported track", () => {
    expect(() => renderV5Resume("auto" as "swe", fictionalResume)).toThrow("SWE or Data");
  });
});

describe("safe LaTeX text and destinations", () => {
  it("escapes TeX syntax and flattens prose newlines without executing it", () => {
    expect(escapeLatex("\\input{secret} $5 & 20% #1_a ~ ^\nnext")).toBe("\\textbackslash{}input\\{secret\\} \\$5 \\& 20\\% \\#1\\_a \\textasciitilde{} \\textasciicircum{} next");
    const input = structuredClone(fictionalResume);
    input.projects[0].bullets[0] = "\\input{/private/file}";
    expect(renderV5Resume("swe", input)).not.toContain("\\input{/private/file}");
    expect(() => escapeLatex("hidden\u0000text")).toThrow("control character");
  });
  it.each(["file:///private/file", "javascript:alert(1)", "https://user:password@example.com", "https://example.com/\\input", "https://example.com/\npath", "not a link"])("rejects unsafe destination %s", url => {
    expect(() => latexWebUrl(url)).toThrow("HTTP or HTTPS");
  });
  it("encodes TeX delimiters in ordinary web URLs", () => {
    const encoded = latexWebUrl("https://example.com/my_project?q=50%25&x={test}#part");
    expect(encoded).toContain("my\\_project");
    expect(encoded).toContain("50\\%25\\&x=\\%7Btest\\%7D\\#part");
    expect(encoded).not.toContain("{test}");
  });
  it("creates a basic cover letter with literal prose and no invented role text", () => {
    const input = structuredClone(fictionalCoverLetter);
    input.paragraphs = ["My work includes C# & SQL with 20% test coverage in this fictional example."];
    const source = renderCoverLetter(input);
    expect(source).toContain("C\\# \\& SQL with 20\\%");
    expect(source).toContain(input.company);
    expect(source).toContain(input.role);
    expect(source).not.toContain("\\section{Projects}");
    expect(source.endsWith("\\end{document}\n")).toBe(true);
  });
});
