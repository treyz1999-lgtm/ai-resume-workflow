import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

/** Fictional compiler probe, not a resume template or user-supplied TeX. */
export const SAMPLE_TEX = String.raw`\documentclass[11pt,letterpaper]{article}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[margin=0.5in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage[english]{babel}
\usepackage{needspace}
\usepackage[colorlinks=true,urlcolor=blue]{hyperref}
\input{glyphtounicode}
\pdfgentounicode=1
\pagestyle{empty}
\begin{document}
\begin{center}{\Large\bfseries Aurora Example}\\
Fictional document toolchain check\end{center}
\section*{Project Aurora}
\needspace{4\baselineskip}
\begin{itemize}[leftmargin=*]
\item Built a fictional project to verify local PDF compilation.
\item This sample contains no personal information or application claims.
\end{itemize}
\href{https://example.com}{Example project link}
\end{document}
`;

export type ToolRunner = (command: string, args: string[], cwd: string) => Promise<string>;

const runTool: ToolRunner = (command, args, cwd) => new Promise((resolveOutput, reject) => {
  execFile(command, args, {
    cwd,
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, openin_any: "p", openout_any: "p" },
  }, (error, stdout) => {
    // Subprocess output may contain paths or other environment details; do not
    // return it to HTTP clients when compilation fails.
    if (error) reject(new Error("The local PDF toolchain failed. Check the worker installation and try again."));
    else resolveOutput(stdout);
  });
});

/** Only registered generated sample artifacts can be served. No caller path input. */
export function artifactPath(root: string, id: string, file: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    || (file !== "sample.pdf" && file !== "sample.tex" && file !== "sample.png")) {
    throw new Error("Unknown document artifact.");
  }
  const base = resolve(root);
  const path = resolve(base, id, file);
  if (!path.startsWith(base + sep)) throw new Error("Unknown document artifact.");
  return path;
}

export async function compileSample(root: string, runner: ToolRunner = runTool): Promise<{ id: string; pages: number; text: string }> {
  return compileDocument(root, SAMPLE_TEX, ["Project Aurora", "Fictional document toolchain check"], runner);
}

/** Internal trusted renderer output only; never accept caller-supplied TeX through HTTP. */
export async function compileDocument(root: string, sourceText: string, requiredText: string[], runner: ToolRunner = runTool): Promise<{ id: string; pages: number; text: string }> {
  const id = randomUUID();
  const source = artifactPath(root, id, "sample.tex");
  const directory = resolve(root, id);
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(source, sourceText, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await runner("pdflatex", ["-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", "sample.tex"], directory);
    const pdf = await readFile(artifactPath(root, id, "sample.pdf"));
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid PDF");
    const info = await runner("pdfinfo", ["sample.pdf"], directory);
    const pages = Number(/^Pages:\s*(\d+)\s*$/m.exec(info)?.[1]);
    const text = (await runner("pdftotext", ["-layout", "sample.pdf", "-"], directory)).trim();
    if (pages !== 1 || requiredText.some(value => !text.includes(value))) {
      throw new Error("Invalid verification result");
    }
    await runner("pdftoppm", ["-f", "1", "-singlefile", "-r", "120", "-png", "sample.pdf", "sample"], directory);
    const preview = await readFile(artifactPath(root, id, "sample.png"));
    if (!preview.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Invalid PNG preview");
    return { id, pages, text };
  } catch {
    throw new Error("The sample PDF could not be compiled and verified. Check the worker toolchain and try again.");
  }
}
