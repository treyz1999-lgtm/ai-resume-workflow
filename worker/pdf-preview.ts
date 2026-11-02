import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Render only the first page of an uploaded PDF; no document instructions execute. */
export async function previewPdf(data: Buffer, root: string): Promise<Buffer> {
  if (data.length > 10 * 1024 * 1024 || data.subarray(0, 5).toString() !== "%PDF-") throw new Error("invalid-request");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "preview-"));
  try {
    await writeFile(join(directory, "input.pdf"), data, { mode: 0o600 });
    await new Promise<void>((resolve, reject) => {
      execFile("pdftoppm", ["-f", "1", "-singlefile", "-scale-to", "1320", "-png", "input.pdf", "preview"],
        { cwd: directory, timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true }, error => error ? reject(new Error("PDF preview failed.")) : resolve());
    });
    const png = await readFile(join(directory, "preview.png"));
    if (png.length > 8 * 1024 * 1024 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("PDF preview failed.");
    return png;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
