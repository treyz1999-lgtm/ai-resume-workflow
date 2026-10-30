import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { artifactPath, compileSample, SAMPLE_TEX, type ToolRunner } from "../../../worker/latex";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function root() { const path = await mkdtemp(join(tmpdir(), "arw-latex-")); directories.push(path); return path; }

function tools(info = "Pages: 1\n", text = "Project Aurora\nFictional document toolchain check") {
  return vi.fn<ToolRunner>(async (command, _args, cwd) => {
    if (command === "pdflatex") { await writeFile(join(cwd, "sample.pdf"), "%PDF-1.7\nfixture"); return "compiled"; }
    return command === "pdfinfo" ? info : text;
  });
}

describe("fixed local LaTeX sample", () => {
  it("checks the generated PDF and text, preserving the source and disabling shell escape", async () => {
    const directory = await root();
    const runner = tools();
    const result = await compileSample(directory, runner);
    expect(result.pages).toBe(1);
    expect(await readFile(artifactPath(directory, result.id, "sample.tex"), "utf8")).toBe(SAMPLE_TEX);
    expect(runner.mock.calls[0][1]).toContain("-no-shell-escape");
    expect(runner.mock.calls.map(call => call[0])).toEqual(["pdflatex", "pdfinfo", "pdftotext"]);
  });
  it.each([["Pages: 2\n", "Project Aurora\nFictional document toolchain check"], ["", ""], ["Pages: 1\n", "unreadable"]])("rejects failed page/text verification", async (info, text) => {
    await expect(compileSample(await root(), tools(info, text))).rejects.toThrow("could not be compiled and verified");
  });
  it("redacts compiler errors", async () => {
    await expect(compileSample(await root(), async () => { throw new Error("secret key private path"); })).rejects.toThrow("Check the worker toolchain");
  });
  it("never returns a non-PDF result", async () => {
    const runner: ToolRunner = async (_command, _args, cwd) => { await writeFile(join(cwd, "sample.pdf"), "not a PDF"); return ""; };
    await expect(compileSample(await root(), runner)).rejects.toThrow("could not be compiled and verified");
  });
  it("rejects traversal and unregistered artifacts", () => {
    const id = "e714c11b-6c98-47ab-9b48-662d7212029a";
    for (const [key, file] of [["../escape", "sample.pdf"], [id, "../auth.json"], [id, "sample.log"], ["", "sample.tex"]]) {
      expect(() => artifactPath("/work/artifacts", key, file)).toThrow("Unknown document artifact");
    }
  });
});
