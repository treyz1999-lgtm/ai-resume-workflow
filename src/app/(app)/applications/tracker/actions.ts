"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, ActionError } from "@/lib/action";
import { CsvError, parseTracker } from "@/lib/tracker-csv/format";
import { importAttempts, previewAttempts } from "@/lib/tracker-csv/store";

const csv = z.string().min(1).max(1_000_000);
function validated(text: string) {
  try { return parseTracker(text); }
  catch (err) { if (err instanceof CsvError) throw new ActionError(err.message); throw err; }
}
export const previewCsv = action(csv, async text => previewAttempts(validated(text)));
export const importCsv = action(csv, async text => {
  const result = await importAttempts(validated(text));
  revalidatePath("/", "layout");
  return result.count;
});
